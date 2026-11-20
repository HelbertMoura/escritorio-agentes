package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

// ponteQueDecide responde ao POST /pendente/<rota> com status e corpo fixos.
func ponteQueDecide(t *testing.T, status int, corpo string) (int, *[]string) {
	t.Helper()
	var rotas []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.ReadAll(r.Body)
		rotas = append(rotas, r.URL.Path+" "+r.Header.Get("X-Ponte-Token"))
		w.WriteHeader(status)
		io.WriteString(w, corpo)
	}))
	t.Cleanup(ts.Close)
	return ts.Listener.Addr().(*net.TCPAddr).Port, &rotas
}

func rodarDecidir(t *testing.T, env []string, porta int, rota string) resultado {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelar()
	cmd := exec.CommandContext(ctx, exe, "decidir", "--porta", strconv.Itoa(porta), rota)
	cmd.Env = env
	cmd.Stdin = strings.NewReader(`{"session_id":"s1","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"ls"}}`)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	ini := time.Now()
	err := cmd.Run()
	r := resultado{stdout: out.String(), stderr: errb.String(), duracao: time.Since(ini)}
	if e, ok := err.(*exec.ExitError); ok {
		r.codigo = e.ExitCode()
	} else if err != nil {
		t.Fatal(err)
	}
	return r
}

// A saída é exatamente a que o Claude Code e o Codex leem; sem decisão, nada.
func TestDecidirEscreveSoADecisao(t *testing.T) {
	casos := []struct {
		status int
		corpo  string
		quero  string
	}{
		{200, `{"acao":"permitir"}`, saidaPermitir + "\n"},
		{200, `{"acao":"negar"}`, saidaNegar + "\n"},
		{200, `{"acao":"talvez"}`, ""},
		{204, ``, ""},
		{403, ``, ""},
		{302, ``, ""},
	}
	for _, c := range casos {
		porta, rotas := ponteQueDecide(t, c.status, c.corpo)
		r := rodarDecidir(t, envConfig(t, true), porta, "claude")
		if r.codigo != 0 || r.stderr != "" || r.stdout != c.quero {
			t.Errorf("%d %s: código %d, stdout %q, stderr %q", c.status, c.corpo, r.codigo, r.stdout, r.stderr)
		}
		if len(*rotas) != 1 || (*rotas)[0] != "/pendente/claude "+tokenTeste {
			t.Errorf("pedido: %v", *rotas)
		}
	}
	if saidaPermitir != `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}` ||
		saidaNegar != `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Negado pelo Firmópolis"}}}` {
		t.Fatal("o formato da decisão mudou")
	}
}

func TestDecidirSemPonteSemTokenOuRotaRuim(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	livre := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	if r := rodarDecidir(t, envConfig(t, true), livre, "codex"); r.codigo != 0 || r.stdout != "" || r.stderr != "" || r.duracao > time.Second {
		t.Errorf("sem ponte: %+v", r)
	}
	porta, rotas := ponteQueDecide(t, 200, `{"acao":"permitir"}`)
	for _, c := range []struct {
		token bool
		rota  string
	}{{false, "claude"}, {true, "opencode"}, {true, "agy"}} {
		if r := rodarDecidir(t, envConfig(t, c.token), porta, c.rota); r.codigo != 0 || r.stdout != "" || r.stderr != "" {
			t.Errorf("%+v: %+v", c, r)
		}
	}
	if len(*rotas) != 0 {
		t.Fatalf("sem token ou com rota sem decisão, nada é pedido: %v", *rotas)
	}
}
