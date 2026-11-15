"use strict";
// Personalizar por andar (static/ajustes.js): o que cada perfil vê. No modo clássico (sem andares.json) a tela é a de sempre:
// o admin vê clima, datas, andares e membros; o membro não chega a pedir nada de admin.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const EXPEDIENTE = fs.readFileSync("static/expediente.js", "utf8");
const AJUSTES = fs.readFileSync("static/ajustes.js", "utf8");

// um elemento falso: guarda o que a tela escreve e aceita o que ela chama
function elemento(id = "") {
  const e = {
    id, hidden: false, textContent: "", value: "", className: "", disabled: false, checked: false, type: "", href: "",
    dataset: {}, style: {}, attrs: {}, filhos: [], ouvintes: {},
    addEventListener(t, f) { (e.ouvintes[t] ||= []).push(f); },
    setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute: k => e.attrs[k] ?? null, removeAttribute(k) { delete e.attrs[k]; },
    replaceChildren(...f) { e.filhos = f; }, append(...f) { e.filhos.push(...f); }, prepend(...f) { e.filhos.unshift(...f); },
    before() {}, replaceWith() {}, focus() {}, select() {}, closest: () => elemento(), querySelector: () => elemento(), querySelectorAll: () => [],
    getContext: () => new Proxy({}, { get: () => () => {} }), classList: { toggle() {}, add() {}, remove() {} },
  };
  return e;
}

// o navegador falso: `respostas` diz o que cada rota devolve ({status, corpo}); `pedidos` guarda as urls pedidas
function carregar({ hash = "", respostas = {} } = {}) {
  const ids = new Map(), pedidos = [];
  const document = {
    getElementById: id => { if (!ids.has(id)) ids.set(id, elemento(id)); return ids.get(id); },
    createElement: tag => elemento(tag), querySelector: () => null, querySelectorAll: () => [], body: elemento("body"),
    get activeElement() { return null; },
  };
  const fetch = async url => {
    pedidos.push(url);
    const rota = url.split("?")[0], r = respostas[rota] || { status: 404, corpo: {} };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.corpo };
  };
  const contexto = {
    document, fetch, location: { hash, href: "" }, localStorage: null, window: {}, setInterval() {}, setTimeout() {}, clearTimeout() {},
    Avatar: { OPCOES: { cores: [], olhos: [], acessorios: [] }, padrao: () => ({}), desenhar: () => ({}) },
    Festas: { temas: () => [{ chave: "generico", nome: "Festa", cores: [], falas: [] }], embutidas: () => [] }, Intl, JSON, Date, Math,
  };
  vm.runInNewContext(EXPEDIENTE, contexto);
  contexto.Andar = contexto.window.Andar;
  vm.runInNewContext(AJUSTES, contexto);
  return { Ajustes: contexto.window.Ajustes, $: document.getElementById, pedidos };
}
const espera = () => new Promise(r => setImmediate(r));

// modo clássico, admin: as abas do prédio continuam como hoje (andares e membros aparecem depois do GET)
(async () => {
  const { Ajustes, $, pedidos } = carregar({ respostas: {
    "api/andares": { status: 200, corpo: { andares: [] } },
    "api/membros": { status: 200, corpo: { contas: [], convites: [] } },
    "api/perfil": { status: 200, corpo: { usuario: "ana" } },
  } });
  Ajustes.abrir({ papel: "admin", times: [], andares: [{ id: "principal", nome: "Escritório" }] });
  await espera(); await espera();
  assert.equal($("a-clima").hidden, false);
  assert.equal($("a-datas").hidden, false);
  assert.equal($("a-andares").hidden, false);
  assert.equal($("a-membros").hidden, false);
  assert.ok(pedidos.includes("api/andares") && pedidos.includes("api/membros"), "o admin pede as duas listas, sem ?andar no principal");

  // membro: nada de admin é pedido (o servidor também barra)
  const m = carregar();
  m.Ajustes.abrir({ papel: "membro", times: [] });
  await espera();
  assert.ok(!m.pedidos.some(u => /api\/(andares|membros)/.test(u)));

  console.log("test_ajustes_empresas.js: ok");
})().catch(e => { console.error(e); process.exit(1); });
