"use strict";
// Service worker (static/sw.js): o push chega vazio e o texto sai do GET /api/avisos. Os avisos de agente ficam como
// sempre; os pessoais (menção, DM, aceno, porta: E.4) usam o título e o corpo que o servidor já manda limpos.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function carregar(resposta) {
  const ouvintes = {}, mostradas = [], abertas = [], focadas = [];
  const self = {
    addEventListener: (t, f) => (ouvintes[t] = f),
    registration: { scope: "https://escritorio.exemplo/", showNotification: (titulo, op) => { mostradas.push({ titulo, ...op }); return Promise.resolve(); } },
    clients: { claim() {}, matchAll: async () => [], openWindow: async url => abertas.push(url) },
    skipWaiting() {},
  };
  const fetch = async () => (resposta instanceof Error ? Promise.reject(resposta) : { ok: true, json: async () => resposta });
  vm.runInNewContext(fs.readFileSync("static/sw.js", "utf8"), { self, fetch, URL, Object, Promise });
  const push = async () => { let p; ouvintes.push({ waitUntil: x => (p = x) }); await p; return mostradas[0]; };
  const tocar = async data => { let p; ouvintes.notificationclick({ notification: { close() {}, data }, waitUntil: x => (p = x) }); await p; return abertas[0]; };
  return { push, tocar, focadas };
}

(async () => {
  // agente: o de sempre, sem o rótulo da tarefa
  {
    const n = await carregar({ aviso: { agente: "a1", nome: "Rex", tipo: "pediu_aprovacao", quando: 1 } }).push();
    assert.equal(n.titulo, "Rex pede a sua aprovação");
    assert.equal(n.body, "Toque para abrir o escritório.");
    assert.equal(n.data.agente, "a1");
  }
  // menção e DM: o título e o começo da mensagem vêm prontos do servidor
  {
    const n = await carregar({ aviso: { tipo: "mencao", quando: 1, titulo: "Ana · #geral", corpo: "olha o relatório de…", andar: "a1b2c3d4", canal: "geral" } }).push();
    assert.equal(n.titulo, "Ana · #geral");
    assert.equal(n.body, "olha o relatório de…");
    assert.equal(n.data.agente, null);
    assert.equal(n.data.andar, "a1b2c3d4");
  }
  // "mostrar o começo" desligado: corpo vazio vira o texto genérico, sem nada da mensagem
  {
    const n = await carregar({ aviso: { tipo: "dm", quando: 1, titulo: "Ana · mensagem direta", corpo: "", andar: "a1b2c3d4", canal: "dm:4" } }).push();
    assert.equal(n.titulo, "Ana · mensagem direta");
    assert.equal(n.body, "Toque para abrir o escritório.");
  }
  // aceno e porta também
  for (const tipo of ["aceno", "porta"]) {
    const n = await carregar({ aviso: { tipo, quando: 1, titulo: "Ana acenou para você", corpo: "", andar: "a1b2c3d4" } }).push();
    assert.equal(n.titulo, "Ana acenou para você");
  }
  // resposta estranha (tipo fora da lista, título longo demais ou que não é texto, andar fora do formato) e falha de rede:
  // o aviso genérico, sem andar
  for (const r of [{ aviso: { tipo: "outro", titulo: "x", corpo: "y" } }, { aviso: { tipo: "dm", titulo: "x".repeat(121), corpo: "" } },
    { aviso: { tipo: "dm", titulo: 3, corpo: "" } }, { aviso: { tipo: "mencao", titulo: "Ana", corpo: "oi", andar: "../x" } }, new Error("rede")]) {
    const n = await carregar(r).push();
    if (r.aviso && r.aviso.andar === "../x") { assert.equal(n.titulo, "Ana"); assert.equal(n.data.andar, null, "andar fora do formato fica de fora"); continue; }
    assert.equal(n.titulo, "Um agente precisa de você", JSON.stringify(r));
  }
  // o toque abre o escritório no andar do aviso
  {
    const url = await carregar({}).tocar({ agente: null, andar: "a1b2c3d4" });
    assert.equal(url, "https://escritorio.exemplo/#andar=a1b2c3d4");
    assert.equal(await carregar({}).tocar({ agente: "a1", andar: null }), "https://escritorio.exemplo/?agente=a1");
  }
  console.log("test_sw.js ok");
})().catch(e => { console.error(e); process.exit(1); });
