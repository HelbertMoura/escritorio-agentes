package integracoes

import (
	"fmt"
	"path/filepath"
	"strings"
)

// eventosAgy são os eventos que o normalizador do agy usa (fontes/agy).
var eventosAgy = []string{"SessionStart", "PreInvocation", "PreToolUse", "Stop"}

// O hooks.json do agy é {"<nome>": {"<Evento>": [<hook>]}}: a nossa entrada é a de
// nome "escritorio-vivo", ao lado das outras.
var agy = integracao{
	nome: "agy",
	arquivo: func(op Opcoes) string {
		return filepath.Join(op.Home, ".gemini", "config", "hooks.json")
	},
	instalado: func(op Opcoes) bool { return existe(filepath.Join(op.Home, ".gemini")) },
	instalar: func(op Opcoes, doc []byte, _ *registro) ([]byte, string, []string, error) {
		doc = docOuVazio(doc)
		raiz, err := raizObjeto(doc)
		if err != nil {
			return nil, "", nil, err
		}
		quero := entradaAgy(op)
		resumo := fmt.Sprintf("entrada %q com o comando `%s` em %d eventos (%s)", marca, comandoPosix(op.Exe, "agy"), len(eventosAgy), strings.Join(eventosAgy, ", "))
		switch atual := raiz.campo(marca); {
		case atual == nil:
			return inserirCampo(doc, raiz, marca, quero), resumo, nil, nil
		case !mesmoValor(atual.valor(doc), quero):
			return substituir(doc, atual, quero), resumo, nil, nil
		}
		return doc, resumo, nil, nil
	},
	tirar: func(_ Opcoes, doc []byte, _ *registro) ([]byte, []string, error) {
		raiz, err := raizObjeto(docOuVazio(doc))
		if err != nil {
			return nil, nil, err
		}
		if i := raiz.indice(marca); i >= 0 {
			return removerFilho(doc, raiz, i), nil, nil
		}
		return doc, nil, nil
	},
	temNosso: func(_ Opcoes, doc []byte) bool {
		raiz, err := raizObjeto(docOuVazio(doc))
		return err == nil && raiz.campo(marca) != nil
	},
}

func entradaAgy(op Opcoes) objeto {
	var e objeto
	for _, ev := range eventosAgy {
		e = append(e, par{ev, []any{objeto{
			{"type", "command"},
			{"command", comandoPosix(op.Exe, "agy")},
			{"timeout", timeoutHook},
		}}})
	}
	return e
}
