"use strict";
// Bairro público: a porta do chalé leva à visita, o convite segue só pelo fragmento e nada além da recepção é pedido.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function abrir(hash) {
  const ouvintes = {}, requisicoes = [], quadros = [];
  const ctx = new Proxy({}, { get: (_, k) => k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  const canvas = { getContext: () => ctx, style: {}, addEventListener(t, f) { ouvintes[t] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) };
  const elementos = { mundo: canvas, entrar: { addEventListener(t, f) { ouvintes.botao = f; } }, "mundo-estado": { textContent: "" } };
  const contexto = {
    document: { getElementById: id => elementos[id] }, location: { hash, pathname: "/mundo.html", search: "", href: "" },
    history: { replaceState(_, __, url) { contexto.endereco = url; } }, window: {}, performance: { now: () => 0 },
    requestAnimationFrame: f => quadros.push(f), setInterval() {}, Math, Promise,
    Ceu: { agora: () => ({ h: 12, cima: "#000", baixo: "#000", escuro: 0, hora: "12:00" }) },
    Clima: { definir(c) { contexto.clima = c; }, tipo: () => "limpo", texto: () => "céu limpo", desenhar() {} },
    fetch: async (url, opcoes) => { requisicoes.push([url, opcoes]); return { ok: true, json: async () => ({ clima: "chuva", grupos: [] }) }; },
  };
  vm.runInNewContext(fs.readFileSync("static/mundo.js", "utf8"), contexto);
  quadros.shift()(16); // um quadro inteiro sem erro
  await new Promise(r => setImmediate(r));
  return { contexto, ouvintes, requisicoes };
}

async function principal() {
  const convite = "a".repeat(43);
  const com = await abrir("#" + convite);
  assert.equal(com.contexto.endereco, "/mundo.html", "o convite sai da barra de endereço");
  const p = com.contexto.window.Mundo.porta(com.contexto.window.Mundo.CHALES.find(c => !c.vizinho));
  com.ouvintes.click({ clientX: 2, clientY: 2 });
  assert.equal(com.contexto.location.href, "", "clicar no céu não entra");
  com.ouvintes.click({ clientX: (p.x + p.w / 2) * 2, clientY: (p.y + p.h / 2) * 2 });
  assert.equal(com.contexto.location.href, "/visita.html#" + convite);
  assert.equal(JSON.stringify(com.contexto.clima), '{"tipo":"chuva"}');
  assert.equal(JSON.stringify(com.requisicoes.map(([u]) => u)), '["/api/visitas/recepcao"]');
  assert.equal(com.requisicoes[0][1].credentials, "omit");
  assert.equal(com.requisicoes[0][1].body, "{}");

  const sem = await abrir("#nao-e-convite");
  sem.ouvintes.botao();
  assert.equal(sem.contexto.location.href, "/visita.html", "fragmento inválido não é repassado");
  for (const v of sem.contexto.window.Mundo.CHALES.filter(c => c.vizinho)) {   // vizinhos são cenário: a porta deles não leva a lugar nenhum
    const q = sem.contexto.window.Mundo.porta(v); sem.contexto.location.href = "";
    sem.ouvintes.click({ clientX: (q.x + 6) * 2, clientY: (q.y + 9) * 2 });
    assert.equal(sem.contexto.location.href, "");
  }
}
principal().catch(e => { console.error(e); process.exitCode = 1; });
