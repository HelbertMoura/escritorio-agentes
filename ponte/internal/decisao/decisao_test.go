package decisao

import (
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDecisaoValeUmaVez(t *testing.T) {
	r := NovoRegistro(nil)
	p, fim, err := r.Abrir("s1", "t1", "Bash", "ls", []byte(`{"command":"ls"}`), time.Minute)
	if err != nil || !IDValido(p.ID) || p.Tipo != "permissao" || p.MoradorID != "t1" {
		t.Fatalf("abrir: %v %+v", err, p)
	}
	if _, _, ok := r.Decidir(p.ID, "talvez", PorLocal); ok {
		t.Fatal("ação fora de permitir/negar não vale")
	}
	if _, _, ok := r.Decidir(p.ID, Permitir, PorLocal); !ok {
		t.Fatal("a primeira decisão vale")
	}
	if res := <-fim; res != (Resultado{Acao: Permitir, Por: PorLocal}) {
		t.Fatalf("resultado: %+v", res)
	}
	if _, _, ok := r.Decidir(p.ID, Negar, PorRemoto); ok {
		t.Fatal("a segunda decisão no mesmo id não vale")
	}
	if _, _, ok := r.Decidir("AAAAAAAAAAAAAAAAAAAAAA", Permitir, PorLocal); ok {
		t.Fatal("id que este registro não criou não vale")
	}
	if len(r.Lista()) != 0 {
		t.Fatal("decidido sai da lista")
	}
}

func TestDecisaoDepoisDoPrazoNaoVale(t *testing.T) {
	agora := time.Now()
	r := NovoRegistro(func() time.Time { return agora })
	p, fim, _ := r.Abrir("s1", "t1", "Bash", "ls", nil, time.Second)
	agora = agora.Add(time.Second)
	if _, _, ok := r.Decidir(p.ID, Permitir, PorRemoto); ok {
		t.Fatal("decisão vencida não vale")
	}
	if res := <-fim; res.Acao != "" || res.Por != PorExpirou {
		t.Fatalf("resultado: %+v", res)
	}
}

func TestTetoDePedidos(t *testing.T) {
	r := NovoRegistro(nil)
	for i := 0; i < Max; i++ {
		if _, _, err := r.Abrir("s", "t", "Bash", "", nil, time.Minute); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := r.Abrir("s", "t", "Bash", "", nil, time.Minute); err != ErrCheio {
		t.Fatalf("o 17º não espera: %v", err)
	}
}

// Terminal e navegador ao mesmo tempo: só um leva, e o canal recebe um resultado só.
func TestCorridaTerminalENavegador(t *testing.T) {
	for i := 0; i < 200; i++ {
		r := NovoRegistro(nil)
		p, fim, _ := r.Abrir("s1", "t1", "Bash", "", nil, time.Minute)
		var ganhou atomic.Int32
		var wg sync.WaitGroup
		wg.Add(3)
		go func() { defer wg.Done(); _, ok := r.Encerrar(p.ID, PorTerminal); bump(&ganhou, ok) }()
		go func() { defer wg.Done(); _, _, ok := r.Decidir(p.ID, Permitir, PorLocal); bump(&ganhou, ok) }()
		go func() { defer wg.Done(); _, _, ok := r.Decidir(p.ID, Negar, PorRemoto); bump(&ganhou, ok) }()
		wg.Wait()
		if ganhou.Load() != 1 {
			t.Fatalf("ganharam %d", ganhou.Load())
		}
		<-fim
		select {
		case res := <-fim:
			t.Fatalf("dois resultados: %+v", res)
		default:
		}
	}
}

func bump(n *atomic.Int32, ok bool) {
	if ok {
		n.Add(1)
	}
}

func TestIDsDiferentesECom128Bits(t *testing.T) {
	r := NovoRegistro(nil)
	vistos := map[string]bool{}
	for i := 0; i < Max; i++ {
		p, _, _ := r.Abrir("s", "t", "Bash", "", nil, time.Minute)
		if vistos[p.ID] || len(p.ID) != 22 {
			t.Fatalf("id: %q", p.ID)
		}
		vistos[p.ID] = true
	}
	for _, ruim := range []string{"", "curto", strings.Repeat("a", 23), "AAAAAAAAAAAAAAAAAAAA=="} {
		if IDValido(ruim) {
			t.Errorf("%q não é id", ruim)
		}
	}
}

func TestResumoMascaraCortaENaoLevaAPasta(t *testing.T) {
	cmd := Resumir(map[string]any{"command": "curl -H 'Authorization: Bearer abcdefghijklmnop' x\nrm -rf /tmp/x"}, "/home/ana/loja")
	if strings.Contains(cmd, "abcdefghijklmnop") || !strings.Contains(cmd, "rm -rf /tmp/x") || !strings.Contains(cmd, "↵") {
		t.Errorf("comando: %q", cmd)
	}
	if got := Resumir(map[string]any{"command": "echo " + strings.Repeat("a ", 400)}, ""); len([]rune(got)) != MaxResumo || !strings.HasSuffix(got, "…") {
		t.Errorf("corte: %d %q", len([]rune(got)), got[len(got)-10:])
	}
	if got := Resumir(map[string]any{"file_path": "/home/ana/loja/src/app.go"}, "/home/ana/loja"); got != "src/app.go" {
		t.Errorf("arquivo dentro da pasta: %q", got)
	}
	if got := Resumir(map[string]any{"file_path": "/etc/passwd"}, "/home/ana/loja"); got != "passwd" {
		t.Errorf("arquivo fora da pasta: %q", got)
	}
	if got := Resumir(map[string]any{"file_path": `C:\Users\ana\loja\a.txt`}, `C:\Users\ana\loja`); got != "a.txt" {
		t.Errorf("Windows: %q", got)
	}
	if got := Resumir(map[string]any{"url": "https://u:senha@x.com/a?token=1"}, ""); got != "https://x.com/a" {
		t.Errorf("url: %q", got)
	}
	if got := Resumir(map[string]any{"prompt": "segredo do usuário"}, ""); got != "" {
		t.Errorf("outros campos não entram: %q", got)
	}
}
