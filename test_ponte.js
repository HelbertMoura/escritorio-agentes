"use strict";
// Ponte local (static/ponte.js, Firmópolis onda 2): liga só com token, pede o subprotocolo certo, confere cada morador do
// contrato v1, tira o terminal no "saiu", limpa tudo quando a ponte cai e tenta de novo sozinha.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const TOKEN = "ab".repeat(32);
const abertos = [], timers = [];
class FalsoWS {
  constructor(url, protocolos) { this.url = url; this.protocolos = protocolos; abertos.push(this); }
  close() { this.fechado = true; }
}
function criar(tokenSalvo) {
  abertos.length = 0; timers.length = 0;
  const guardado = new Map(tokenSalvo ? [["firmopolis.ponte", tokenSalvo]] : []), eventos = [];
  const contexto = {
    WebSocket: FalsoWS, JSON, Object, Math, Map, Array, CustomEvent: class { constructor(t) { this.type = t; } },
    localStorage: { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: k => guardado.delete(k) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    document: { readyState: "complete", hidden: false, getElementById: () => null, addEventListener() {} },
    location: { origin: "https://escritorio.exemplo.com" },
  };
  contexto.window = { dispatchEvent: e => eventos.push(e.type), addEventListener() {} };
  vm.runInNewContext(fs.readFileSync("static/ponte.js", "utf8"), contexto);
  return { Ponte: contexto.window.Ponte, eventos, guardado };
}
const mensagem = (ws, d) => ws.onmessage({ data: JSON.stringify(d) });
const morador = (id, estado, extra = {}) => ({ id, nome: "Ada", provedor: "codex", estado, projeto: "loja", atividade: { ferramenta: "Edit" }, ...extra });

// sem token salvo: nenhuma conexão
let { Ponte } = criar(null);
assert.equal(abertos.length, 0, "sem token, a ponte nem é procurada");
assert.equal(Ponte.situacao(), "desligada");

// token inválido no armazenamento é ignorado
criar("nao-e-hex");
assert.equal(abertos.length, 0);

// com token: um WebSocket para 127.0.0.1, com o token como subprotocolo
const p = criar(TOKEN);
Ponte = p.Ponte;
assert.equal(abertos.length, 1);
const ws = abertos[0];
assert.equal(ws.url, "ws://127.0.0.1:47820/ws");
assert.deepEqual([...ws.protocolos], ["firmopolis.v1", "token." + TOKEN]);
ws.onopen();
assert.equal(Ponte.situacao(), "ligada");

// snapshot: só moradores válidos, com o estado traduzido e o programa pelo nome
mensagem(ws, { v: 1, tipo: "snapshot", moradores: [
  morador("a", "ocupado"), morador("b", "esperando_permissao"), morador("c", "esperando_resposta"), morador("d", "ocioso"), morador("e", "erro"),
  morador("f", "dormindo"), { id: "", estado: "ocupado" }, null, morador("g\u0000", "ocupado", { nome: "x".repeat(300), provedor: "outro" })] });
const lista = Ponte.terminais();
assert.deepEqual([...lista.map(t => t.estado)], ["ocupado", "aprovacao", "pergunta", "livre", "erro", "ocupado"]);
assert.equal(lista[0].provedor, "Codex");
assert.equal(lista[5].id, "g", "caractere de controle sai");
assert.equal(lista[5].nome.length, 40, "nome cortado");
assert.equal(lista[5].provedor, "Terminal", "programa desconhecido");
assert.ok(p.eventos.includes("ponte"));

// versão do contrato diferente: ignorada
const v0 = Ponte.versao();
mensagem(ws, { v: 2, tipo: "saiu", id: "a" });
assert.equal(Ponte.versao(), v0);

// mudança e saída
mensagem(ws, { v: 1, tipo: "morador", morador: morador("a", "esperando_resposta") });
assert.equal(Ponte.terminais().find(t => t.id === "a").estado, "pergunta");
mensagem(ws, { v: 1, tipo: "saiu", id: " a " });
assert.ok(!Ponte.terminais().some(t => t.id === "a"), "o id do saiu passa pela mesma limpeza");

// JSON quebrado não derruba nada
ws.onmessage({ data: "{nao" });

// a ponte caiu: os terminais saem do mapa e a reconexão é agendada, com espera crescente
ws.onclose();
assert.equal(Ponte.terminais().length, 0);
assert.equal(Ponte.situacao(), "sem-ponte");
assert.equal(timers.at(-1).ms, 3000);
timers.at(-1).fn();
assert.equal(abertos.length, 2, "tentou de novo");
abertos[1].onclose();
assert.equal(timers.at(-1).ms, 6000, "a espera dobra");

console.log("test_ponte.js: ok");
