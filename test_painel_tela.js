"use strict";
// Painel de conversa da equipe (static/chat_sala.js, 1.6 Onda 2) num DOM falso: pílula, abas por perfil, o saguão só com o
// Geral, a DM com o "Entendi" (E.3) e o aviso fixo, a auditoria com o lembrete e a menção escolhida pelo teclado.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let foco = null;
function elemento(tag) {
  const e = {
    tagName: tag.toUpperCase(), filhos: [], pai: null, attrs: {}, dataset: {}, style: {}, hidden: false, disabled: false, ouvintes: {},
    _texto: "", classes: new Set(), value: "", id: "", selectionStart: null,
    get className() { return [...e.classes].join(" "); }, set className(v) { e.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get classList() { return { add: (...c) => c.forEach(x => e.classes.add(x)), remove: (...c) => c.forEach(x => e.classes.delete(x)),
      toggle: (c, f) => ((f ?? !e.classes.has(c)) ? e.classes.add(c) : e.classes.delete(c)), contains: c => e.classes.has(c) }; },
    get textContent() { return e._texto + e.filhos.map(f => (typeof f === "string" ? f : f.textContent)).join(""); },
    set textContent(v) { e._texto = String(v); e.filhos = []; },
    get children() { return e.filhos.filter(f => typeof f !== "string"); },
    get firstElementChild() { return e.children[0] || null; },
    setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute: k => e.attrs[k] ?? null, removeAttribute(k) { delete e.attrs[k]; },
    append(...f) { for (const x of f) { if (typeof x !== "string") x.pai = e; e.filhos.push(x); } },
    prepend(...f) { for (const x of f) if (typeof x !== "string") x.pai = e; e.filhos.unshift(...f); },
    replaceChildren(...f) { e.filhos = []; e._texto = ""; e.append(...f); },
    remove() { if (e.pai) e.pai.filhos = e.pai.filhos.filter(x => x !== e); },
    addEventListener(t, f) { (e.ouvintes[t] ||= []).push(f); },
    focus() { foco = e; }, click() { disparar(e, "click"); }, setSelectionRange(a) { e.selectionStart = a; },
    closest(sel) { for (let x = e; x; x = x.pai) if (casa(x, sel)) return x; return null; },
    querySelector(sel) { return todos(e).find(x => casa(x, sel)) || null; },
    querySelectorAll(sel) { return todos(e).filter(x => sel.split(",").some(s => casa(x, s.trim()))); },
  };
  return e;
}
const casa = (x, sel) => (sel.startsWith(".") ? x.classes.has(sel.slice(1)) : x.tagName === sel.toUpperCase());
const todos = (e, saida = []) => { for (const f of e.children) { saida.push(f); todos(f, saida); } return saida; };
const visivel = e => { for (let x = e; x; x = x.pai) if (x.hidden) return false; return true; };
// o evento sobe pela árvore, como no navegador
function disparar(alvo, tipo, extra = {}) {
  const ev = { target: alvo, key: extra.key, preventDefault() {}, stopPropagation() { ev.parou = true; } };
  for (let x = alvo; x && !ev.parou; x = x.pai) for (const f of x.ouvintes[tipo] || []) f(ev);
}
const espera = () => new Promise(r => setImmediate(r));
const achar = (raiz, classe) => todos(raiz).filter(x => x.classes.has(classe));
const porTexto = (raiz, texto) => todos(raiz).find(x => x.tagName === "BUTTON" && x.textContent.startsWith(texto));

function carregar({ config, respostas = {}, sala = null }) {
  foco = null;
  const ids = {}, pedidos = [];
  for (const id of ["chat-sala", "chat-sala-abrir", "chat-sala-painel", "chat-sala-n"]) ids[id] = elemento(id === "chat-sala-painel" ? "section" : "div");
  // o painel do chat da sala de sempre, como está no index.html
  for (const [id, tag] of [["chat-sala-titulo", "h2"], ["chat-sala-lista", "ol"], ["chat-sala-vazio", "p"], ["chat-sala-aviso", "p"],
    ["chat-sala-form", "form"], ["chat-sala-campo", "input"], ["chat-sala-enviar", "button"], ["chat-sala-fechar", "button"]]) {
    ids[id] = elemento(tag); ids[id].id = id; ids["chat-sala-painel"].append(ids[id]);
  }
  const rot = elemento("span"); rot.className = "chat-sala-rot"; rot.textContent = "Chat da sala";
  ids["chat-sala-abrir"].append(rot);
  ids["chat-sala"].append(ids["chat-sala-abrir"], ids["chat-sala-painel"]);
  ids["chat-sala"].hidden = true; ids["chat-sala-painel"].hidden = true;
  const document = { getElementById: id => ids[id] || null, createElement: elemento, createElementNS: (ns, t) => elemento(t),
    body: elemento("body"), get activeElement() { return foco; } };
  const fetch = async (url, op = {}) => {
    const [rota, q] = url.split("?");
    pedidos.push({ rota, q: new URLSearchParams(q || ""), metodo: op.method || "GET", corpo: op.body ? JSON.parse(op.body) : null });
    const r = respostas[`${op.method || "GET"} ${rota}`] || { status: 404, corpo: {} };
    const corpo = typeof r.corpo === "function" ? r.corpo(new URLSearchParams(q || "")) : r.corpo;
    return { status: r.status, ok: r.status < 300, json: async () => corpo };
  };
  const ouvintes = {};
  const window = { addEventListener: (t, f) => (ouvintes[t] ||= []).push(f) };
  const contexto = { window, document, fetch, location: { hash: config.andar && config.andar !== "principal" ? `#andar=${config.andar}` : "", href: "" },
    localStorage: null, config, estado: { usuario: "joao" }, MutationObserver: class { observe() {} }, setTimeout: f => 0, clearTimeout() {},
    URLSearchParams, Intl, Date, JSON };
  vm.runInNewContext(fs.readFileSync("static/expediente.js", "utf8"), contexto);
  contexto.Andar = contexto.window.Andar;
  vm.runInNewContext(fs.readFileSync("static/chat_sala.js", "utf8"), contexto);
  const evento = (t, detail) => (ouvintes[t] || []).forEach(f => f({ detail }));
  evento("minha-sala", { sala, nome: sala ? "Cozinha" : null, andar: config.andar || "principal", seq: 1 });
  return { ids, painel: ids["chat-sala-painel"], pedidos, evento, ChatSala: contexto.window.ChatSala };
}

const ID = "a1b2c3d4";
const EQUIPE = { retencao: 365, pode_moderar: false, dm: true, anexo: true, mencao: true, anexo_max: 26214400, auditoria: false, mural: true,
  aviso_dm: "As mensagens diretas da Acme podem ser lidas pela administração da empresa.", aviso_dm_entendido: false };
const ANDAR = { andar: ID, papel: "membro", admin_predio: false, terreo: "saguao", empresa: "Acme", equipe: EQUIPE };
const SAGUAO = { andar: "principal", papel: "pessoa", terreo: "saguao", equipe: { ...EQUIPE, dm: false, anexo: false, mencao: false, aviso_dm: "" } };
const MSG = (id, extra = {}) => ({ id, canal: "geral", usuario: "ana.lima", nome: "Ana", texto: `m${id}`, apagada: false, em: "2026-11-16T13:00:00Z", reacoes: [], anexo: null, ...extra });
const RESP = {
  "GET api/canal/historico": { status: 200, corpo: q => ({ mensagens: [MSG(1, { canal: q.get("canal") })], mais: false,
    ...(q.get("canal").startsWith("dm:") ? { aviso: EQUIPE.aviso_dm, acessos: ["2026-11-12T10:00:00Z"] } : {}) }) },
  "GET api/pessoas": { status: 200, corpo: { pessoas: [{ usuario: "ana.lima", nome: "Ana Lima" }] } },
  "GET api/dm": { status: 200, corpo: { dms: [] } },
  "POST api/dm/entendi": { status: 200, corpo: { ok: true } },
  "POST api/dm/abrir": { status: 200, corpo: { canal: "dm:3" } },
  "POST api/canal/lida": { status: 200, corpo: { ok: true } },
  "GET api/dm/auditoria/pares": { status: 200, corpo: { pares: [{ canal: "dm:3", u1: "ana.lima", u2: "joao", mensagens: 4, ultima: "2026-11-15T10:00:00Z" }],
    lembrete: "O acesso a esta conversa fica registrado e as duas pessoas veem a data." } },
  "GET api/dm/auditoria/registro": { status: 200, corpo: { registro: [] } },
  "GET api/dm/auditoria": { status: 200, corpo: { mensagens: [MSG(7, { canal: "dm:3" })], mais: false,
    lembrete: "O acesso a esta conversa fica registrado e as duas pessoas veem a data." } },
};
const abas = p => achar(p, "chat-sala-aba").map(b => b.dataset.id);

(async () => {
  // membro de um andar, numa sala: a pílula diz "Conversas"; abrir vai para a sala, com o histórico e a retenção
  {
    const { ids, painel, pedidos } = carregar({ config: ANDAR, respostas: RESP, sala: "cozinha" });
    assert.equal(ids["chat-sala"].hidden, false);
    assert.equal(ids["chat-sala-abrir"].textContent, "Conversas");
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    assert.equal(painel.hidden, false);
    assert.deepEqual(abas(painel), ["geral", "sala:cozinha", "diretas"]);
    assert.equal(achar(painel, "chat-sala-aba").find(b => b.attrs["aria-current"] === "true").dataset.id, "sala:cozinha");
    const h = pedidos.find(p => p.rota === "api/canal/historico");
    assert.equal(h.q.get("canal"), "sala:cozinha");
    assert.equal(h.q.get("andar"), ID);
    assert.equal(achar(painel, "chat-sala-msg").length, 1);
    assert.equal(achar(painel, "chat-sala-retencao")[0].textContent, "As mensagens ficam guardadas por 1 ano.");
    assert.ok(visivel(achar(painel, "chat-sala-anexar")[0]));
    // Escape fecha e devolve o foco à pílula
    disparar(achar(painel, "chat-sala-lista")[0], "keydown", { key: "Escape" });
    assert.equal(painel.hidden, true);
    assert.equal(foco, ids["chat-sala-abrir"]);
  }
  // saguão: só o Geral do prédio, sem anexo e sem pedir a lista de pessoas
  {
    const { ids, painel, pedidos } = carregar({ config: SAGUAO, respostas: RESP, sala: "recepcao" });
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    assert.deepEqual(abas(painel), ["geral"]);
    assert.equal(achar(painel, "chat-sala-anexar")[0].hidden, true);
    assert.equal(pedidos.some(p => p.rota === "api/pessoas"), false);
    assert.equal(achar(painel, "chat-sala-titulo").length + todos(painel).filter(x => x.id === "chat-sala-titulo").length > 0, true);
    assert.equal(todos(painel).find(x => x.id === "chat-sala-titulo").textContent, "Geral do prédio");
    assert.equal(pedidos.find(p => p.rota === "api/canal/historico").q.has("andar"), false, "o saguão é o principal");
  }
  // DM: o "Entendi" antes da primeira; depois, o aviso fixo da empresa e a linha do registro de acesso (D10)
  {
    const { ids, painel, pedidos } = carregar({ config: ANDAR, respostas: RESP });
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    porTexto(achar(painel, "chat-sala-abas")[0], "Diretas").click(); await espera(); await espera();
    porTexto(achar(painel, "chat-sala-itens")[0], "Ana Lima").click(); await espera();
    const dialogo = achar(painel, "chat-sala-entendi")[0];
    assert.equal(dialogo.hidden, false);
    assert.equal(dialogo.attrs.role, "alertdialog");
    assert.match(dialogo.textContent, /As mensagens diretas da Acme podem ser lidas pela administração da empresa\./);
    assert.equal(pedidos.some(p => p.rota === "api/dm/abrir"), false, "nada abre antes do Entendi");
    porTexto(dialogo, "Entendi").click(); await espera(); await espera(); await espera(); await espera();
    assert.equal(dialogo.hidden, true);
    assert.ok(pedidos.some(p => p.rota === "api/dm/entendi" && p.metodo === "POST"));
    assert.deepEqual(pedidos.find(p => p.rota === "api/dm/abrir").corpo, { com: "ana.lima" });
    assert.equal(achar(painel, "chat-sala-fixo")[0].textContent, "As mensagens diretas da Acme podem ser lidas pela administração da empresa.");
    assert.equal(achar(painel, "chat-sala-fixo")[0].hidden, false);
    assert.equal(achar(painel, "chat-sala-registro")[0].textContent, "A administração da empresa abriu esta conversa em 12/11/2026.");
    assert.equal(achar(painel, "chat-sala-anexar")[0].hidden, false);
    assert.equal(achar(painel, "chat-sala-auditar")[0].hidden, true, "membro não audita");
  }
  // admin da empresa: a auditoria (lista de pares, o lembrete do registro, a leitura sem caixa de escrever nem ações)
  {
    const { ids, painel, pedidos } = carregar({ config: { ...ANDAR, papel: "admin", equipe: { ...EQUIPE, auditoria: true } }, respostas: RESP });
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    porTexto(achar(painel, "chat-sala-abas")[0], "Diretas").click(); await espera(); await espera();
    const auditar = achar(painel, "chat-sala-auditar")[0];
    assert.equal(auditar.hidden, false);
    auditar.click(); await espera(); await espera();
    assert.match(achar(painel, "chat-sala-fixo")[0].textContent, /fica registrado/);
    assert.equal(achar(painel, "chat-sala-fixo")[0].hidden, false);
    porTexto(achar(painel, "chat-sala-itens")[0], "Ana Lima e Você").click(); await espera(); await espera();
    assert.equal(pedidos.find(p => p.rota === "api/dm/auditoria").q.get("canal"), "dm:3");
    assert.equal(achar(painel, "chat-sala-form")[0].hidden, true);
    assert.equal(achar(painel, "chat-sala-msg").length, 1);
    assert.equal(achar(painel, "chat-sala-acoes").length + achar(painel, "chat-sala-reagir").length, 0, "na auditoria só se lê");
    assert.match(achar(painel, "chat-sala-fixo")[0].textContent, /fica registrado/);
  }
  // menção: "@an" sugere só gente do andar; seta e Enter completam
  {
    const { ids, painel } = carregar({ config: ANDAR, respostas: RESP });
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    const campo = todos(painel).find(x => x.id === "chat-sala-campo");
    assert.equal(campo.attrs.role, "combobox");
    campo.value = "oi @an"; campo.selectionStart = 6; disparar(campo, "input");
    const lista = achar(painel, "chat-sala-sugestoes")[0];
    assert.equal(lista.hidden, false);
    assert.equal(campo.attrs["aria-expanded"], "true");
    assert.deepEqual(lista.children.map(li => li.dataset.usuario), ["ana.lima"]);
    assert.equal(campo.attrs["aria-activedescendant"], lista.children[0].id);
    disparar(campo, "keydown", { key: "Enter" });
    assert.equal(campo.value, "oi @ana.lima ");
    assert.equal(lista.hidden, true);
  }
  // aviso_dm_entendido: a DM abre direto, sem o diálogo
  {
    const { ids, painel, pedidos } = carregar({ config: { ...ANDAR, equipe: { ...EQUIPE, aviso_dm_entendido: true } }, respostas: RESP });
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    porTexto(achar(painel, "chat-sala-abas")[0], "Diretas").click(); await espera(); await espera();
    porTexto(achar(painel, "chat-sala-itens")[0], "Ana Lima").click(); await espera(); await espera(); await espera();
    assert.equal(achar(painel, "chat-sala-entendi")[0].hidden, true);
    assert.equal(pedidos.some(p => p.rota === "api/dm/entendi"), false);
    assert.ok(pedidos.some(p => p.rota === "api/dm/abrir"));
  }
  // /api/ao-vivo: as não lidas e as menções na pílula; com o painel aberto, as novas do canal entram e o pedido leva canal e depois
  {
    const { ids, painel, evento, ChatSala } = carregar({ config: ANDAR, respostas: RESP });
    assert.equal(ChatSala.paraAoVivo(), "", "painel fechado: o pedido não muda");
    evento("aovivo", { eu: "joao", nao_lidas: { geral: 2, "dm:4": 1 }, mencoes: { geral: 1 } });
    assert.equal(ids["chat-sala-n"].textContent, "3");
    assert.equal(ids["chat-sala-n"].hidden, false);
    assert.match(ids["chat-sala-abrir"].attrs["aria-label"], /3 mensagens novas, 1 menção a você/);
    ids["chat-sala-abrir"].click(); await espera(); await espera();
    assert.equal(ChatSala.paraAoVivo(), "&canal=geral&depois=1");
    evento("aovivo", { eu: "joao", nao_lidas: { geral: 1 }, aberto: { canal: "geral", novas: [MSG(1), MSG(2, { texto: "chegou" })], v: 5 } });
    await espera();
    assert.deepEqual(achar(painel, "chat-sala-msg").map(li => li.dataset.id), ["1", "2"]);
    assert.match(achar(painel, "oculto").find(x => x.attrs.role === "status").textContent, /Ana: chegou/);
    assert.equal(ChatSala.paraAoVivo(), "&canal=geral&depois=2");
  }
  // store desligado (config.equipe null): o chat da sala de sempre, com o painel do index.html e sem rota nova
  {
    const { ids, painel, pedidos } = carregar({ config: { andar: "principal", equipe: null }, respostas: RESP, sala: "cozinha" });
    assert.equal(ids["chat-sala-abrir"].textContent, "Chat da sala");
    assert.equal(ids["chat-sala-titulo"].textContent, "Cozinha");
    assert.equal(achar(painel, "chat-sala-abas").length, 0);
    ids["chat-sala-abrir"].click(); await espera();
    assert.equal(painel.hidden, false);
    assert.equal(pedidos.length, 0);
  }
  console.log("test_painel_tela.js ok");
})().catch(e => { console.error(e); process.exit(1); });
