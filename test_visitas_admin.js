"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function testar(momentoFalha) {
  const falhaAntes = momentoFalha === "antes";
  const elementos = Object.fromEntries(["criar", "copiar", "entrar", "revogar", "link", "estado", "agente"].map(id => [id, { disabled: false, value: "", textContent: "", append() {}, addEventListener(_, fn) { this.click = fn; } }]));
  let chamadas = [];
  let ativo = false;
  const contexto = { document: { getElementById: id => elementos[id] }, location: { origin: "https://exemplo.test" }, navigator: {}, window: {}, fetch: async (url) => {
    if (url === "/api/visitas/anfitrioes") return { ok: true, json: async () => ({ agentes: [] }) };
    chamadas.push(url);
    if (url.endsWith("/criar")) { ativo = true; return { ok: true, json: async () => ({ convite: "primeiro" }) }; }
    if (momentoFalha === "antes") { momentoFalha = null; throw new Error("falha de rede"); }
    const revogado = ativo; ativo = false;
    if (momentoFalha === "depois") { momentoFalha = null; throw new Error("resposta perdida"); }
    return { ok: true, json: async () => ({ ok: revogado }) };
  } };
  vm.runInNewContext(fs.readFileSync("static/visitas-admin.js", "utf8"), contexto);
  await elementos.criar.click();
  await elementos.criar.click();
  assert.equal(elementos.link.value, "https://exemplo.test/visita.html#primeiro");
  assert.equal(elementos.revogar.disabled, false);
  assert.equal(ativo, falhaAntes);
  assert.equal(chamadas.filter(c => c.endsWith("/criar")).length, 1);
  await elementos.revogar.click();
  assert.equal(elementos.link.value, "");
  assert.equal(chamadas.filter(c => c.endsWith("/revogar")).length, 2);
}
async function concorrencia() {
  const elementos = Object.fromEntries(["criar", "copiar", "entrar", "revogar", "link", "estado", "agente"].map(id => [id, { disabled: false, value: "", textContent: "", append() {}, addEventListener(_, fn) { this.click = fn; } }]));
  let resolver, criacoes = 0;
  const pendente = new Promise(resolve => { resolver = resolve; });
  const contexto = { document: { getElementById: id => elementos[id] }, location: { origin: "https://exemplo.test" }, navigator: {}, window: {}, fetch: async url => {
    if (url === "/api/visitas/anfitrioes") return { ok: true, json: async () => ({ agentes: [] }) };
    if (url.endsWith("/criar")) return { ok: true, json: async () => ({ convite: `convite${++criacoes}` }) };
    await pendente;
    return { ok: true, json: async () => ({ ok: true }) };
  } };
  vm.runInNewContext(fs.readFileSync("static/visitas-admin.js", "utf8"), contexto);
  await elementos.criar.click();
  const revogacao = elementos.revogar.click();
  const tentativa = elementos.criar.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(criacoes, 1);
  resolver();
  await revogacao;
  await tentativa;
  await elementos.criar.click();
  assert.equal(elementos.link.value, "https://exemplo.test/visita.html#convite2");
}
async function comAgente() {
  const opcoes = [];
  const elementos = Object.fromEntries(["criar", "copiar", "entrar", "revogar", "link", "estado", "agente"].map(id => [id, { disabled: false, value: "", textContent: "", append(o) { opcoes.push(o); }, addEventListener(_, fn) { this.click = fn; } }]));
  const corpos = [];
  const contexto = { document: { getElementById: id => elementos[id], createElement: () => ({}) }, location: { origin: "https://exemplo.test" }, navigator: {}, window: {}, fetch: async (url, opcoes) => {
    if (url === "/api/visitas/anfitrioes") return { ok: true, json: async () => ({ agentes: [{ id: "ag-1", nome: "Senku" }, { id: 7 }, { nome: "sem id" }] }) };
    corpos.push(JSON.parse(opcoes.body));
    return { ok: true, json: async () => ({ convite: "c1" }) };
  } };
  vm.runInNewContext(fs.readFileSync("static/visitas-admin.js", "utf8"), contexto);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(opcoes.map(o => [o.value, o.textContent])), '[["ag-1","Senku"]]');
  elementos.agente.value = "ag-1";
  await elementos.criar.click();
  assert.equal(JSON.stringify(corpos), '[{"agente":"ag-1"}]');
}
async function semModoResposta() {
  // o servidor recusa (403, modo resposta fechado): a tela mostra o motivo dele, sem link de convite
  const elementos = Object.fromEntries(["criar", "copiar", "entrar", "revogar", "link", "estado", "agente"].map(id => [id, { disabled: false, value: "", textContent: "", append() {}, addEventListener(_, fn) { this.click = fn; } }]));
  const contexto = { document: { getElementById: id => elementos[id], createElement: () => ({}) }, location: { origin: "https://exemplo.test" }, navigator: {}, window: {}, fetch: async url => {
    if (url === "/api/visitas/anfitrioes") return { ok: true, json: async () => ({ agentes: [{ id: "ag-1", nome: "Senku" }] }) };
    return { ok: false, json: async () => ({ erro: "Para pôr um agente na sala, abra antes o modo resposta (com a senha) na tela Conversas." }) };
  } };
  vm.runInNewContext(fs.readFileSync("static/visitas-admin.js", "utf8"), contexto);
  await new Promise(resolve => setImmediate(resolve));
  elementos.agente.value = "ag-1";
  await elementos.criar.click();
  assert.match(elementos.estado.textContent, /modo resposta/);
  assert.equal(elementos.link.value, "");
}
(async () => { for (const scenario of ["antes", "depois"]) await testar(scenario); await concorrencia(); await comAgente(); await semModoResposta(); })().catch(e => { console.error(e); process.exitCode = 1; });
