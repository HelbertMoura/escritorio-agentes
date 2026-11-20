// Package decisao guarda os pedidos de permissão que esperam um "Permitir" ou "Negar" vindo
// do Firmópolis (o navegador neste PC, pelo /ws, ou o servidor, pelo celular). Cada pedido
// tem um id de 128 bits de crypto/rand, vale uma vez só e some no prazo. A decisão só vale
// para um id que este registro criou; o primeiro a responder leva (o terminal, o navegador
// ou o prazo), e quem chega depois recebe "não existe".
package decisao

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"firmopolis/ponte/internal/fontes/alvo"
	"firmopolis/ponte/internal/mascara"
)

// Acoes aceitas numa decisão.
const (
	Permitir = "permitir"
	Negar    = "negar"
)

// Quem resolveu o pedido (a mensagem "resolvido" do /ws).
const (
	PorLocal    = "local"    // o navegador neste PC, pelo /ws
	PorRemoto   = "remoto"   // o servidor do Firmópolis (outro navegador ou o celular)
	PorTerminal = "terminal" // respondido no próprio terminal, ou o agente desistiu de esperar
	PorExpirou  = "expirou"
)

const (
	// Max é o teto de pedidos esperando ao mesmo tempo; acima, o pedido não espera.
	Max = 16
	// MaxResumo é o teto do resumo que vai à tela (e, com o espelho, ao servidor).
	MaxResumo = 300
	// EsperaClaude é quanto o pedido do Claude Code espera: o diálogo do terminal aparece junto
	// (testado no 2.1.327), então esperar não atrasa quem responde por lá.
	EsperaClaude = 120 * time.Second
	// EsperaCodex é mais curta: não deu para confirmar se o Codex mostra o prompt do terminal
	// enquanto o hook síncrono roda.
	EsperaCodex = 25 * time.Second
	// EsperaOpenCode: o plugin não segura o OpenCode (o diálogo segue na tela).
	EsperaOpenCode = 120 * time.Second
	// Folga é o que o agente dá a mais ao `ponte decidir` (timeout do hook = espera + folga).
	Folga = 10 * time.Second
)

// Espera diz quanto o pedido de cada rota espera (zero: rota sem decisão).
func Espera(rota string) time.Duration {
	switch rota {
	case "claude":
		return EsperaClaude
	case "codex":
		return EsperaCodex
	case "opencode":
		return EsperaOpenCode
	}
	return 0
}

// ErrCheio: já há Max pedidos esperando.
var ErrCheio = errors.New("decisao: pedidos demais esperando")

// Pendente é o pedido como a tela o vê: a ferramenta e um resumo já mascarado e cortado.
type Pendente struct {
	ID         string    `json:"id"`
	MoradorID  string    `json:"morador_id"`
	Tipo       string    `json:"tipo"` // sempre "permissao" nesta versão
	Ferramenta string    `json:"ferramenta"`
	Resumo     string    `json:"resumo"`
	ExpiraEm   time.Time `json:"expira_em"`
}

// Resultado é como o pedido acabou: Acao vazia é "sem decisão" (o agente mostra o prompt dele).
type Resultado struct {
	Acao string
	Por  string
}

type item struct {
	Pendente
	vinculo string // sessão + ferramenta + hash da entrada: a que pedido o id pertence
	criado  time.Time
	fim     chan Resultado
}

// Registro guarda os pedidos esperando. relogio: os testes trocam.
type Registro struct {
	mu      sync.Mutex
	itens   map[string]*item
	relogio func() time.Time
}

func NovoRegistro(relogio func() time.Time) *Registro {
	if relogio == nil {
		relogio = time.Now
	}
	return &Registro{itens: map[string]*item{}, relogio: relogio}
}

// Abrir registra um pedido e devolve o canal por onde chega o resultado (um só). Com Max
// pedidos já esperando, ErrCheio. sessao, ferramenta e entrada (o tool_input bruto) amarram
// o id ao pedido; a entrada nunca é guardada, só o hash.
func (r *Registro) Abrir(sessao, moradorID, ferramenta, resumo string, entrada []byte, prazo time.Duration) (Pendente, <-chan Resultado, error) {
	id, err := novoID()
	if err != nil {
		return Pendente{}, nil, err
	}
	soma := sha256.Sum256(entrada)
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.itens) >= Max {
		return Pendente{}, nil, ErrCheio
	}
	agora := r.relogio()
	it := &item{
		Pendente: Pendente{ID: id, MoradorID: moradorID, Tipo: "permissao", Ferramenta: alvo.Curto(ferramenta),
			Resumo: resumo, ExpiraEm: agora.Add(prazo)},
		vinculo: sessao + "\x00" + ferramenta + "\x00" + hex.EncodeToString(soma[:]),
		criado:  agora,
		fim:     make(chan Resultado, 1),
	}
	r.itens[id] = it
	return it.Pendente, it.fim, nil
}

// Decidir entrega a decisão ao pedido id (só um id que este registro criou e que ainda
// espera). Devolve o pedido, quanto ele esperou e true; id desconhecido, já usado ou
// vencido, false. A remoção é sob o lock: duas decisões no mesmo id, só a primeira vale.
func (r *Registro) Decidir(id, acao, por string) (Pendente, time.Duration, bool) {
	if acao != Permitir && acao != Negar {
		return Pendente{}, 0, false
	}
	p, espera, res, ok := r.fechar(id, Resultado{Acao: acao, Por: por})
	return p, espera, ok && res.Acao != ""
}

// Encerrar fecha o pedido sem decisão (respondido no terminal ou vencido).
func (r *Registro) Encerrar(id, por string) (Pendente, bool) {
	p, _, _, ok := r.fechar(id, Resultado{Por: por})
	return p, ok
}

func (r *Registro) fechar(id string, res Resultado) (Pendente, time.Duration, Resultado, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	it, ok := r.itens[id]
	if !ok {
		return Pendente{}, 0, Resultado{}, false
	}
	delete(r.itens, id)
	agora := r.relogio()
	if res.Acao != "" && !agora.Before(it.ExpiraEm) {
		res = Resultado{Por: PorExpirou} // decisão que chegou depois do prazo não vale
	}
	it.fim <- res
	return it.Pendente, agora.Sub(it.criado), res, true
}

// DoMorador são os ids que esperam por um morador.
func (r *Registro) DoMorador(moradorID string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var ids []string
	for id, it := range r.itens {
		if it.MoradorID == moradorID {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// Lista são os pedidos esperando, do que vence primeiro ao último.
func (r *Registro) Lista() []Pendente {
	r.mu.Lock()
	defer r.mu.Unlock()
	lista := make([]Pendente, 0, len(r.itens))
	for _, it := range r.itens {
		lista = append(lista, it.Pendente)
	}
	sort.Slice(lista, func(i, j int) bool {
		if !lista[i].ExpiraEm.Equal(lista[j].ExpiraEm) {
			return lista[i].ExpiraEm.Before(lista[j].ExpiraEm)
		}
		return lista[i].ID < lista[j].ID
	})
	return lista
}

// IDValido diz se s tem a forma de um id deste pacote (22 letras de base64url).
func IDValido(s string) bool {
	if len(s) != 22 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(s)
	return err == nil
}

func novoID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Resumir monta o resumo do pedido: o comando inteiro (com as quebras de linha à vista, para
// nada se esconder nas linhas de baixo), o arquivo relativo à pasta da sessão (nunca a pasta
// inteira) ou a URL sem credenciais. Mascara antes de cortar em MaxResumo.
func Resumir(entrada map[string]any, cwd string) string {
	texto := func(chave string) string {
		v, _ := entrada[chave].(string)
		return strings.TrimSpace(v)
	}
	if v := texto("command"); v != "" {
		return Cortar(mascara.Mascarar(strings.Join(strings.Fields(strings.ReplaceAll(v, "\n", " ↵ ")), " ")))
	}
	for _, chave := range []string{"file_path", "filePath", "notebook_path", "path"} {
		if v := texto(chave); v != "" {
			return Cortar(mascara.Mascarar(Relativo(v, cwd)))
		}
	}
	return Cortar(alvo.Resumir(entrada)) // a URL sem credenciais (ou nada)
}

// Relativo é o caminho dentro da pasta da sessão; fora dela, só o nome do arquivo.
func Relativo(caminho, cwd string) string {
	c := path.Clean(strings.ReplaceAll(caminho, `\`, "/"))
	base := path.Clean(strings.ReplaceAll(cwd, `\`, "/"))
	if cwd != "" && base != "/" && base != "." {
		if rel, ok := strings.CutPrefix(c, base+"/"); ok && rel != "" {
			return rel
		}
	}
	return path.Base(c)
}

// Cortar limpa caracteres de controle e corta em MaxResumo, terminando em "…" quando corta.
func Cortar(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return ' '
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= MaxResumo {
		return s
	}
	return string(r[:MaxResumo-1]) + "…"
}
