package servidor

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"firmopolis/ponte/internal/decisao"
	"firmopolis/ponte/internal/maestri"
	"firmopolis/ponte/internal/mundo"
)

// Responder pelo escritório, fase 2: quando um morador está na pergunta (esperando_resposta),
// quem decide manda um texto curto e a ponte o leva ao agente.
//   - Terminal do Maestri (menos o OpenCode): a ponte abre a pergunta sozinha quando o morador
//     entra na pergunta e, com a resposta, digita o texto e Enter pelo `maestri ask --raw`
//     (maestri.CLI), chamando como um terminal conectado ao alvo.
//   - OpenCode: o plugin abre a pergunta por POST /pendente/opencode-pergunta (decisoes.go) e
//     responde pela API de perguntas do OpenCode.
//   - O resto (Claude, Codex e agy soltos, sem o Maestri): sem pergunta, sem botão.
// A resposta só vale para uma pergunta aberta, uma vez só, com o morador na pergunta naquela
// hora (nunca na aprovação: lá, o texto viraria tecla no diálogo de permissão), e passa pelo
// decisao.ValidarTexto. No máximo RespostasPorMinuto tentativas por minuto. O log leva só o
// tamanho do texto, nunca o conteúdo.

// RespostasPorMinuto é o teto de tentativas de resposta (do navegador e do servidor, juntas).
const RespostasPorMinuto = 20

// acharMaestri é o padrão do Opcoes.Maestri; os testes do pacote trocam por um que nunca acha,
// para nenhum teste chegar ao Maestri de verdade.
var acharMaestri = maestri.AcharCLI

// Motivos da recusa ({"v":1,"tipo":"recusado","id","motivo"} para o navegador que respondeu).
const (
	MotivoTexto     = "texto"     // vazia, grande demais ou com caractere proibido
	MotivoEstado    = "estado"    // o morador não está na pergunta agora (409)
	MotivoEncerrado = "encerrado" // a pergunta não existe, já foi respondida ou venceu (410)
	MotivoLimite    = "limite"    // tentativas demais no último minuto
)

type msgRecusado struct {
	V      int    `json:"v"`
	Tipo   string `json:"tipo"`
	ID     string `json:"id"`
	Motivo string `json:"motivo"`
}

// responder entrega o texto à pergunta id. "" deu certo; senão, o motivo da recusa.
func (s *Servidor) responder(id, texto, por string) string {
	if !s.contarResposta() {
		return MotivoLimite
	}
	t, err := decisao.ValidarTexto(texto)
	if err != nil {
		return MotivoTexto
	}
	p, ok := s.dec.Pegar(id)
	if !decisao.IDValido(id) || !ok || p.Tipo != decisao.TipoPergunta {
		return MotivoEncerrado
	}
	if !s.emPergunta(p.MoradorID) {
		return MotivoEstado
	}
	if _, ok := s.dec.Responder(id, t, por); !ok {
		return MotivoEncerrado
	}
	return ""
}

func (s *Servidor) contarResposta() bool {
	s.muResp.Lock()
	defer s.muResp.Unlock()
	agora := time.Now()
	vivas := s.respostas[:0]
	for _, t := range s.respostas {
		if agora.Sub(t) < time.Minute {
			vivas = append(vivas, t)
		}
	}
	s.respostas = vivas
	if len(vivas) >= RespostasPorMinuto {
		return false
	}
	s.respostas = append(s.respostas, agora)
	return true
}

// emPergunta: o último estado publicado do morador é a pergunta.
func (s *Servidor) emPergunta(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.estados[id] == mundo.EsperandoResposta
}

func (s *Servidor) esperaPergunta() time.Duration {
	if s.op.EsperaDecisao > 0 {
		return s.op.EsperaDecisao
	}
	return decisao.EsperaPergunta
}

// anunciar e resolvido mandam o pedido novo e o fim dele ao /ws (e acordam o espelho).
func (s *Servidor) anunciar(p decisao.Pendente) {
	s.mu.Lock()
	s.transmitir(msgPendente{V: 1, Tipo: "pendente", Pendente: p})
	s.mu.Unlock()
	s.avisarPendente()
}

func (s *Servidor) resolvido(id, por string) {
	s.mu.Lock()
	s.transmitir(msgResolvido{V: 1, Tipo: "resolvido", ID: id, Por: por})
	s.mu.Unlock()
}

// abrirPerguntaMaestri começa a pergunta de um terminal do Maestri que acabou de entrar na
// pergunta. Chamar com s.mu; o resto (o `maestri list`) roda fora dele.
func (s *Servidor) abrirPerguntaMaestri(m *mundo.Morador) {
	if s.demo != nil || m.Solto || m.Provedor == mundo.ProvedorOpenCode || m.Nome == "" {
		return
	}
	s.muResp.Lock()
	ja := s.perguntando[m.ID]
	s.perguntando[m.ID] = true
	s.muResp.Unlock()
	if !ja {
		go s.perguntarMaestri(m.ID, s.terminais)
	}
}

// alvoMaestri é para onde vai a resposta: o nome do terminal e o terminal que chama.
type alvoMaestri struct {
	cli      maestri.CLI
	nome, de string
}

func (s *Servidor) perguntarMaestri(id string, terminais []mundo.MetaTerminal) {
	defer func() {
		s.muResp.Lock()
		delete(s.perguntando, id)
		s.muResp.Unlock()
	}()
	alvo, ok := s.acharAlvo(id, terminais)
	if !ok {
		return // sem o maestri, sem nome único ou sem quem chame: sem botão
	}
	for s.emPergunta(id) {
		p, fim, err := s.dec.AbrirPergunta(id, "", decisao.ViaMaestri, s.esperaPergunta())
		if err != nil {
			return
		}
		s.anunciar(p)
		if !s.emPergunta(id) { // saiu da pergunta entre o teste e o abrir: ninguém mais a fecha
			s.dec.Encerrar(p.ID, decisao.PorTerminal)
		}
		prazo := time.NewTimer(time.Until(p.ExpiraEm))
		var res decisao.Resultado
		select {
		case res = <-fim:
		case <-prazo.C:
			s.dec.Encerrar(p.ID, decisao.PorExpirou)
			res = <-fim
		}
		prazo.Stop()
		s.resolvido(p.ID, res.Por)
		switch {
		case res.Acao == decisao.Responder:
			// confere de novo na hora de digitar: nunca na aprovação nem fora da pergunta
			resultado := "entregue"
			if !s.emPergunta(id) {
				resultado = "não entregue (o terminal saiu da pergunta)"
			} else if err := alvo.cli.Digitar(context.Background(), alvo.de, alvo.nome, res.Texto); err != nil {
				resultado = "não entregue (" + err.Error() + ")"
			}
			log.Printf("resposta: pedido %s… (maestri) %d caracteres por %s: %s", p.ID[:6], utf8.RuneCountInString(res.Texto), res.Por, resultado)
			if resultado == "entregue" {
				return
			}
		case res.Por != decisao.PorExpirou:
			return // respondida no terminal ou o morador saiu
		}
	}
}

// acharAlvo resolve o terminal do morador id: o nome (único entre todos os terminais do
// Maestri, porque o `maestri ask` acha pelo nome) e um terminal do mesmo workspace conectado a
// ele (o Maestro primeiro), que é quem chama: um terminal não alcança a si mesmo.
func (s *Servidor) acharAlvo(id string, terminais []mundo.MetaTerminal) (alvoMaestri, bool) {
	var meta mundo.MetaTerminal
	porNome := map[string][]mundo.MetaTerminal{}
	for _, t := range terminais {
		porNome[t.Nome] = append(porNome[t.Nome], t)
		if strings.ToLower(t.ID) == id {
			meta = t
		}
	}
	if meta.ID == "" || meta.Nome == "" || len(porNome[meta.Nome]) != 1 {
		return alvoMaestri{}, false
	}
	cli, ok := s.op.Maestri()
	if !ok {
		return alvoMaestri{}, false
	}
	nomes, err := cli.Conectados(context.Background(), meta.ID)
	if err != nil {
		return alvoMaestri{}, false
	}
	var candidatos []mundo.MetaTerminal
	for _, n := range nomes {
		if ms := porNome[n]; n != meta.Nome && len(ms) == 1 && ms[0].WorkspaceID == meta.WorkspaceID {
			candidatos = append(candidatos, ms[0])
		}
	}
	if len(candidatos) == 0 {
		return alvoMaestri{}, false
	}
	sort.SliceStable(candidatos, func(i, j int) bool {
		if candidatos[i].Gerente != candidatos[j].Gerente {
			return candidatos[i].Gerente
		}
		return candidatos[i].Nome < candidatos[j].Nome
	})
	return alvoMaestri{cli: cli, nome: meta.Nome, de: candidatos[0].ID}, true
}
