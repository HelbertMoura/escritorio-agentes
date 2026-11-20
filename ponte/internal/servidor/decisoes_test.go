package servidor

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"firmopolis/ponte/internal/decisao"
)

const pedidoBash = `{"session_id":"s1","hook_event_name":"PermissionRequest","tool_name":"Bash","cwd":"/home/ana/loja",` +
	`"tool_input":{"command":"deploy --token=abc123segredo","description":"x"},"permission_suggestions":[{"type":"addRules"}],` +
	`"transcript_path":"/home/ana/.claude/t.jsonl"}`

type respostaPendente struct {
	status int
	corpo  string
	dur    time.Duration
}

// pedirPendente faz o POST /pendente/<rota> numa goroutine (ele segura até a decisão).
func (a *ambiente) pedirPendente(t *testing.T, rota, corpo string, ctx context.Context) <-chan respostaPendente {
	t.Helper()
	ch := make(chan respostaPendente, 1)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, a.url+"/pendente/"+rota, strings.NewReader(corpo))
	req.Header.Set("X-Ponte-Token", tokenTeste)
	req.Header.Set("X-Maestri-Terminal-Id", "T1")
	go func() {
		ini := time.Now()
		resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
		if err != nil {
			ch <- respostaPendente{status: -1, dur: time.Since(ini)}
			return
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		ch <- respostaPendente{resp.StatusCode, string(b), time.Since(ini)}
	}()
	return ch
}

func escrever(t *testing.T, c *websocket.Conn, msg string) {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelar()
	if err := c.Write(ctx, websocket.MessageText, []byte(msg)); err != nil {
		t.Fatal(err)
	}
}

// lerTipo lê do /ws até a mensagem do tipo pedido.
func lerTipo(t *testing.T, c *websocket.Conn, tipo string) map[string]any {
	t.Helper()
	for {
		if m := ler(t, c); m["tipo"] == tipo {
			return m
		}
	}
}

// atendido sobe a ponte e um cliente do /ws que já mandou "atender".
func atendido(t *testing.T, op Opcoes) (*ambiente, *websocket.Conn) {
	t.Helper()
	a := subir(t, op, true)
	c, _, err := a.conectar(t, comToken())
	if err != nil {
		t.Fatal(err)
	}
	ler(t, c) // snapshot
	ler(t, c) // dia
	escrever(t, c, `{"v":1,"tipo":"atender"}`)
	esperar(t, a.s.atendendo)
	return a, c
}

func TestSemNinguemAtendendoRespondeNaHora(t *testing.T) {
	a := subir(t, Opcoes{}, true)
	r := <-a.pedirPendente(t, "claude", pedidoBash, context.Background())
	if r.status != http.StatusNoContent || r.dur > time.Second {
		t.Fatalf("sem ninguém atendendo: %d em %v", r.status, r.dur)
	}
	if len(a.s.dec.Lista()) != 0 {
		t.Fatal("nada fica esperando")
	}
}

func TestPermitirPeloNavegadorLocal(t *testing.T) {
	a, c := atendido(t, Opcoes{})
	resp := a.pedirPendente(t, "claude", pedidoBash, context.Background())
	m := lerTipo(t, c, "pendente")
	p := m["pendente"].(map[string]any)
	id := p["id"].(string)
	if p["morador_id"] != "t1" || p["ferramenta"] != "Bash" || p["tipo"] != "permissao" || p["expira_em"] == "" {
		t.Fatalf("pendente: %v", p)
	}
	tudo, _ := json.Marshal(m)
	for _, proibido := range []string{"abc123segredo", "/home/ana", "addRules", "transcript", "description"} {
		if strings.Contains(string(tudo), proibido) {
			t.Fatalf("%q não sai no pendente: %s", proibido, tudo)
		}
	}
	// lixo e id alheio não decidem
	escrever(t, c, `{"v":1,"tipo":"decidir","id":"`+id+`","acao":"permitir","extra":1}`)
	escrever(t, c, `{"v":1,"tipo":"decidir","id":"AAAAAAAAAAAAAAAAAAAAAA","acao":"permitir"}`)
	escrever(t, c, `{"v":1,"tipo":"decidir","id":"`+id+`","acao":"sim"}`)
	escrever(t, c, `{"v":1,"tipo":"decidir","id":"`+id+`","acao":"permitir"}`)
	r := <-resp
	if r.status != http.StatusOK || strings.TrimSpace(r.corpo) != `{"acao":"permitir"}` {
		t.Fatalf("resposta: %+v", r)
	}
	if res := lerTipo(t, c, "resolvido"); res["id"] != id || res["por"] != "local" {
		t.Fatalf("resolvido: %v", res)
	}
	if a.s.decidir(id, "negar", decisao.PorRemoto) {
		t.Fatal("decisão repetida não vale")
	}
}

func TestNegarPeloServidorEPrazo(t *testing.T) {
	a, c := atendido(t, Opcoes{EsperaDecisao: 300 * time.Millisecond})
	resp := a.pedirPendente(t, "codex", pedidoBash, context.Background())
	id := lerTipo(t, c, "pendente")["pendente"].(map[string]any)["id"].(string)
	if !a.s.decidir(id, "negar", decisao.PorRemoto) {
		t.Fatal("a decisão do servidor vale")
	}
	if r := <-resp; r.status != http.StatusOK || !strings.Contains(r.corpo, "negar") {
		t.Fatalf("negar: %+v", r)
	}
	lerTipo(t, c, "resolvido")

	resp = a.pedirPendente(t, "claude", pedidoBash, context.Background())
	id = lerTipo(t, c, "pendente")["pendente"].(map[string]any)["id"].(string)
	if r := <-resp; r.status != http.StatusNoContent {
		t.Fatalf("no prazo, sem decisão: %+v", r)
	}
	if res := lerTipo(t, c, "resolvido"); res["por"] != "expirou" || res["id"] != id {
		t.Fatalf("expirou: %v", res)
	}
	if a.s.decidir(id, "permitir", decisao.PorLocal) {
		t.Fatal("decisão depois do prazo não vale")
	}
}

// Respondido no terminal: o morador sai da espera de permissão e o pedido fecha sem decisão.
func TestRespondidoNoTerminal(t *testing.T) {
	a, c := atendido(t, Opcoes{})
	resp := a.pedirPendente(t, "claude", pedidoBash, context.Background())
	id := lerTipo(t, c, "pendente")["pendente"].(map[string]any)["id"].(string)
	h := map[string]string{"X-Maestri-Terminal-Id": "T1"}
	a.post(t, "claude", []byte(`{"session_id":"s1","hook_event_name":"PermissionRequest","tool_name":"Bash"}`), h)
	a.post(t, "claude", []byte(`{"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{}}`), h)
	if r := <-resp; r.status != http.StatusNoContent {
		t.Fatalf("respondido no terminal: %+v", r)
	}
	if res := lerTipo(t, c, "resolvido"); res["por"] != "terminal" || res["id"] != id {
		t.Fatalf("resolvido: %v", res)
	}
	if a.s.decidir(id, "permitir", decisao.PorLocal) {
		t.Fatal("o navegador chega tarde: não vale")
	}
}

// O agente desistiu (o hook morreu, o plugin abortou): o pedido fecha.
func TestAgenteDesistiu(t *testing.T) {
	a, c := atendido(t, Opcoes{})
	ctx, cancelar := context.WithCancel(context.Background())
	a.pedirPendente(t, "opencode", `{"sessionID":"ses1","id":"per1","permission":"bash","patterns":["git push"]}`, ctx)
	p := lerTipo(t, c, "pendente")["pendente"].(map[string]any)
	if p["resumo"] != "git push" || p["ferramenta"] != "bash" {
		t.Fatalf("opencode: %v", p)
	}
	cancelar()
	if res := lerTipo(t, c, "resolvido"); res["por"] != "terminal" {
		t.Fatalf("resolvido: %v", res)
	}
}

func TestPendenteTokenOrigemETeto(t *testing.T) {
	a, c := atendido(t, Opcoes{})
	for _, h := range []map[string]string{{"X-Ponte-Token": "errado"}, {"Origin": "https://escritorio.exemplo.com"}} {
		req, _ := http.NewRequest(http.MethodPost, a.url+"/pendente/claude", strings.NewReader(pedidoBash))
		req.Header.Set("X-Ponte-Token", tokenTeste)
		for k, v := range h {
			req.Header.Set(k, v)
		}
		resp, err := clienteHTTP.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("%v: %d", h, resp.StatusCode)
		}
	}
	if r := <-a.pedirPendente(t, "agy", pedidoBash, context.Background()); r.status != http.StatusNotFound {
		t.Errorf("rota sem decisão: %d", r.status)
	}
	if r := <-a.pedirPendente(t, "claude", `{"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"Bash"}`, context.Background()); r.status != http.StatusNoContent {
		t.Errorf("só o PermissionRequest espera: %d", r.status)
	}
	ctx, cancelar := context.WithCancel(context.Background())
	defer cancelar()
	for i := 0; i < decisao.Max; i++ {
		a.pedirPendente(t, "claude", pedidoBash, ctx)
		lerTipo(t, c, "pendente")
	}
	if r := <-a.pedirPendente(t, "claude", pedidoBash, context.Background()); r.status != http.StatusNoContent || r.dur > time.Second {
		t.Fatalf("o 17º não espera: %+v", r)
	}
	// um cliente novo recebe os que já esperam
	c2, _, err := a.conectar(t, comToken())
	if err != nil {
		t.Fatal(err)
	}
	ler(t, c2)
	ler(t, c2)
	if m := ler(t, c2); m["tipo"] != "pendente" {
		t.Fatalf("o cliente novo recebe os pedidos: %v", m)
	}
}

// decisoesFalsas é o servidor do Firmópolis de mentira: o long-poll das decisões e o espelho.
type decisoesFalsas struct {
	mu        sync.Mutex
	fila      []DecisaoRemota
	atendendo bool
	auth      []string
	espelhos  []string
}

func (f *decisoesFalsas) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.auth = append(f.auth, r.Header.Get("Authorization"))
	if r.URL.Path == "/api/ponte/espelho" {
		b, _ := io.ReadAll(r.Body)
		f.espelhos = append(f.espelhos, string(b))
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.URL.Path != "/api/ponte/decisoes" || r.URL.Query().Get("espera") == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if f.atendendo {
		w.Header().Set("X-Ponte-Atendendo", "1")
	}
	if len(f.fila) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"decisoes": f.fila})
	f.fila = nil
}

func TestDecisaoRemotaPeloLongPoll(t *testing.T) {
	falso := &decisoesFalsas{atendendo: true}
	ts := httptest.NewServer(falso)
	t.Cleanup(ts.Close)
	cfg := ConfigEspelho{URL: ts.URL, Chave: chaveTeste}
	a := subir(t, Opcoes{Espelho: func() (ConfigEspelho, bool) { return cfg, true }, EsperaRemota: time.Second}, true)
	ctx, cancelar := context.WithCancel(context.Background())
	t.Cleanup(cancelar)
	go a.s.decisoesRemotas(ctx)
	go a.s.espelhar(ctx)
	esperar(t, a.s.atendendo) // o servidor disse "atendendo"

	inicio := time.Now()
	resp := a.pedirPendente(t, "claude", pedidoBash, context.Background())
	var id string
	esperar(t, func() bool { // o pedido novo vai ao servidor sem juntar
		falso.mu.Lock()
		defer falso.mu.Unlock()
		for _, e := range falso.espelhos {
			var d corpoEspelho
			if json.Unmarshal([]byte(e), &d) == nil && d.V == 2 && len(d.Pendentes) == 1 {
				id = d.Pendentes[0].ID
				if strings.Contains(e, "abc123segredo") || strings.Contains(e, "/home/ana") {
					t.Fatalf("o espelho leva só o resumo mascarado: %s", e)
				}
				return true
			}
		}
		return false
	})
	if d := time.Since(inicio); d > EsperaEspelho {
		t.Errorf("o pedido novo levou %v para ir ao servidor", d)
	}
	falso.mu.Lock()
	falso.fila = []DecisaoRemota{{ID: "AAAAAAAAAAAAAAAAAAAAAA", Acao: "permitir"}, {ID: id, Acao: "permitir"}}
	falso.mu.Unlock()
	if r := <-resp; r.status != http.StatusOK || !strings.Contains(r.corpo, "permitir") {
		t.Fatalf("decisão remota: %+v", r)
	}
	falso.mu.Lock()
	for _, au := range falso.auth {
		if au != "Bearer "+chaveTeste {
			t.Errorf("Authorization: %q", au)
		}
	}
	falso.atendendo = false
	falso.mu.Unlock()
	esperar(t, func() bool { return !a.s.atendendo() })
}

func TestBuscarDecisoesNaoSegueRedirecionamento(t *testing.T) {
	var outro sync.WaitGroup
	alvo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		outro.Done()
		t.Errorf("seguiu o redirecionamento com %q", r.Header.Get("Authorization"))
	}))
	t.Cleanup(alvo.Close)
	origem := httptest.NewServer(http.RedirectHandler(alvo.URL, http.StatusFound))
	t.Cleanup(origem.Close)
	_, _, err := BuscarDecisoes(context.Background(), clienteSemRedirect(2*time.Second), ConfigEspelho{URL: origem.URL, Chave: chaveTeste}, time.Second)
	if err == nil || strings.Contains(err.Error(), chaveTeste) {
		t.Fatalf("erro: %v", err)
	}
}

// Servidor anterior à v2 recusa o corpo com os pedidos: o espelho segue, sem eles.
func TestEspelhoVoltaParaV1(t *testing.T) {
	var mu sync.Mutex
	var versoes []float64
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var d map[string]any
		json.NewDecoder(r.Body).Decode(&d)
		mu.Lock()
		versoes = append(versoes, d["v"].(float64))
		mu.Unlock()
		if d["v"] != float64(1) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(ts.Close)
	cfg := ConfigEspelho{URL: ts.URL, Chave: chaveTeste}
	s := Novo(Opcoes{Espelho: func() (ConfigEspelho, bool) { return cfg, true }, EsperaEspelho: time.Millisecond})
	ctx, cancelar := context.WithCancel(context.Background())
	t.Cleanup(cancelar)
	go s.espelhar(ctx)
	s.aplicar(nil)
	s.mu.Lock()
	s.transmitir(msgSaiu{V: 1, Tipo: "saiu", ID: "x"})
	s.mu.Unlock()
	esperar(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(versoes) >= 2
	})
	mu.Lock()
	defer mu.Unlock()
	if versoes[0] != 2 || versoes[1] != 1 {
		t.Fatalf("versões: %v", versoes)
	}
}
