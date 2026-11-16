"use strict";
// A equipe no mapa (static/vida.js, 1.6 Onda 2): o status no boneco, a lista de quem está no andar, o "ir até a pessoa",
// o aceno e o "bater na porta" (a animação e o balão) e o modo econômico, que volta à taxa cheia enquanto alguém acena.
// Relógio, fetch e prédio falsos, no molde do test_mundo_presenca.js.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ANDAR = fs.readFileSync("static/expediente.js", "utf8");
const VIDA = fs.readFileSync("static/vida.js", "utf8");

// a recepção (em cima, porta embaixo), o corredor e a reunião (embaixo, porta em cima)
function predio() {
  const recepcao = { tipo: "recepcao", chave: "recepcao", nome: "Recepção", px: 100, py: 40, pw: 120, ph: 100, chao: 60, porta: { x: 160 } };
  const reuniao = { tipo: "reuniao", chave: "reuniao", nome: "Reunião", px: 100, py: 200, pw: 120, ph: 100, chao: 220, portas: [160] };
  return { salas: [recepcao], baixo: [reuniao], vagas: [], objetos: [], livre: () => true, corredorY: 170, corredorTopo: 150,
    corredorAlt: 40, predioRet: { x: 60, y: 30, w: 400, h: 300 }, entrada: { x: 62, calcadaY: 350 } };
}

function carregar() {
  let agora = 0, prox = 1;
  const timers = new Map(), pedidos = [], eventos = [], respostas = [];
  const doc = { hidden: false, addEventListener() {} };
  const contexto = {
    location: { hash: "" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: doc, console,
    performance: { now: () => agora },
    setTimeout: (f, ms) => { const id = prox++; timers.set(id, { f, em: agora + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    CustomEvent: class { constructor(tipo, o) { this.type = tipo; this.detail = o.detail; } },
    Ceu: { agora: () => ({ h: 10, escuro: 0 }) },
    Avatar: { padrao: u => ({ color: "padrao:" + u, eyes: "round", accessory: "" }) },
    matchMedia: () => ({ matches: false }), URLSearchParams, Date, Math,
    fetch: (url, opcoes = {}) => new Promise(ok => { const p = { url, opcoes, ok }; pedidos.push(p); respostas.push(p); }),
  };
  contexto.window = contexto;
  contexto.dispatchEvent = ev => eventos.push(ev);
  vm.runInNewContext(ANDAR + "\n" + VIDA, contexto);
  const json = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const t = {
    Vida: contexto.Vida, pedidos, eventos,
    async responder(trecho, status, corpo) {
      const i = respostas.findIndex(p => p.url.includes(trecho));
      assert.ok(i >= 0, `sem pedido pendente para ${trecho}`);
      respostas.splice(i, 1)[0].ok(json(status, corpo));
      for (let k = 0; k < 5; k++) await null;
    },
    async okPosts() { while (respostas.some(p => p.url.startsWith("api/presenca"))) await t.responder("api/presenca", 200, { seq: 1 }); },
    // passos de 50 ms no relógio e no mundo
    async passos(m, n, ate = () => false) { for (let i = 0; i < n && !ate(); i++) { agora += 50; t.Vida.passo(m, 0.05); await t.okPosts(); } },
    get agora() { return agora; },
    set agora(v) { agora = v; },
  };
  return t;
}
const pessoa = (usuario, nome, x, y, sala, extra = {}) => ({ usuario, nome, aparencia: null, x, y, destino: null, sala, olha: "baixo", ...extra });

// o mundo com o meu boneco já parado na recepção e as pessoas da lista
async function montar(lista, eu = "eu") {
  const t = carregar();
  t.Vida.aoVivo({ invisivel: () => false });
  await t.responder("api/perfil", 200, { usuario: "eu", nome: "Eu Mesmo", avatar: null });
  await t.responder("api/ao-vivo", 200, { seq: 1, eu, pessoas: lista, mensagens: [] });
  const m = t.Vida.criarMundo(predio());
  await t.passos(m, 600, () => { const e = t.Vida.pessoas().find(p => p.eu); return e && e.sala === "recepcao" && !e.rota.length; });
  return { t, m, eu: t.Vida.pessoas().find(p => p.eu) };
}

(async () => {
  // status no boneco: só os 4 da lista; o resto (ou nada) fica sem status
  {
    const { t } = await montar([pessoa("ana", "Ana", 160, 100, "recepcao", { status: "ocupado" }),
      pessoa("bia", "Bia", 150, 100, "recepcao", { status: "reuniao" }), pessoa("caio", "Caio", 140, 100, "recepcao", { status: "<b>x</b>" }),
      pessoa("davi", "Davi", 170, 100, "recepcao")]);
    const st = Object.fromEntries(t.Vida.pessoas().filter(p => !p.eu).map(p => [p.nome, p.status]));
    assert.deepEqual(st, { Ana: "ocupado", Bia: "reuniao", Caio: null, Davi: null });
    assert.deepEqual([...t.Vida.STATUS], ["disponivel", "ocupado", "reuniao", "ausente"]);
  }

  // a lista do andar: eu primeiro, depois por nome; a sala pelo nome; nunca o "usuario" (no saguão, o id opaco)
  {
    const { t, m } = await montar([pessoa("p_00000000000000bb", "Bia", 160, 250, "reuniao", { status: "reuniao" }),
      pessoa("p_00000000000000aa", "Ana", 150, 100, "recepcao"), pessoa("p_00000000000000cc", "", 170, 170, "")], "p_00000000000000ee");
    const lista = t.Vida.equipe(m);
    assert.deepEqual(JSON.parse(JSON.stringify(lista.map(p => [p.nome, p.sala, p.status, p.eu]))), [   // cópia: vem de outro realm (vm)
      ["Eu Mesmo", "Recepção", null, true], ["Alguém", "Corredor", null, false], ["Ana", "Recepção", null, false],
      ["Bia", "Reunião", "reuniao", false]]);
    assert.ok(!JSON.stringify(lista).includes("p_0"), "o id opaco não vai para a lista");
    assert.ok(lista.every(p => typeof p.chave === "string"), "a chave: para o ir até e o aceno, opaca");
  }

  // ir até a pessoa: o meu boneco anda até perto dela (outra sala: pela porta e o corredor) e manda só o destino
  {
    const { t, m, eu } = await montar([pessoa("bia", "Bia", 160, 260, "reuniao")]);
    const bia = t.Vida.equipe(m).find(p => p.nome === "Bia");
    const antes = t.pedidos.filter(p => p.url.startsWith("api/presenca")).length;
    t.agora += 1000;
    assert.equal(t.Vida.irAtePessoa(m, bia.chave), true);
    const fim = eu.rota.at(-1);
    assert.ok(Math.hypot(fim[0] - 160, fim[1] - 260) <= 24 && Math.hypot(fim[0] - 160, fim[1] - 260) >= 8, `perto, sem pisar nela: ${fim}`);
    assert.ok(eu.rota.some(([, y]) => y === 170), "passa pelo corredor");
    const posts = t.pedidos.filter(p => p.url.startsWith("api/presenca"));
    assert.equal(posts.length, antes + 1);
    assert.deepEqual(JSON.parse(posts.at(-1).opcoes.body).destino, [...fim.map(Math.round)]);
    assert.equal(t.Vida.irAtePessoa(m, "ninguem"), false);
    assert.equal(t.Vida.irAtePessoa(m, t.Vida.equipe(m).find(p => p.eu).chave), false, "até mim mesmo, não");
  }

  // acenar: o meu boneco acena com o balão; o laço volta à taxa cheia enquanto dura e para depois
  {
    const { t, m, eu } = await montar([pessoa("ana", "Ana", 150, 100, "recepcao")]);
    await t.passos(m, 10);
    assert.equal(t.Vida.mexendo(m), false, "todo mundo parado: modo econômico");
    const ana = t.Vida.equipe(m).find(p => p.nome === "Ana");
    assert.equal(t.Vida.acenar(m, ana.chave, "aceno"), true);
    await t.passos(m, 1);
    assert.equal(eu.pose, "acenando");
    assert.equal(eu.fala, "Oi, Ana!");
    assert.equal(t.Vida.mexendo(m), true);
    await t.passos(m, 80);
    assert.equal(eu.pose, "parado");
    assert.equal(eu.fala, null);
    assert.equal(t.Vida.mexendo(m), false);
    assert.equal(t.Vida.acenar(m, "ninguem", "aceno"), false);
  }

  // bater na porta: a pessoa está em outra sala; o meu boneco vai até a porta dela e bate ("Toc, toc!")
  {
    const { t, m, eu } = await montar([pessoa("bia", "Bia", 160, 260, "reuniao")]);
    const bia = t.Vida.equipe(m).find(p => p.nome === "Bia");
    assert.equal(t.Vida.acenar(m, bia.chave, "porta"), true);
    const fim = eu.rota.at(-1);
    assert.ok(fim[1] > 150 && fim[1] < 210, `para no corredor, na frente da porta da reunião: ${fim}`);
    assert.ok(Math.abs(fim[0] - 160) <= 20, `na porta: ${fim}`);
    assert.notEqual(eu.fala, "Toc, toc!", "só bate ao chegar");
    await t.passos(m, 400, () => !eu.rota.length);
    await t.passos(m, 1);
    assert.equal(eu.fala, "Toc, toc!");
    assert.equal(eu.pose, "acenando");
    assert.equal(eu.olha, "baixo", "virado para a porta da reunião, que fica embaixo do corredor");
    assert.equal(t.Vida.mexendo(m), true);
    await t.passos(m, 80);
    assert.equal(eu.pose, "parado");
    assert.equal(t.Vida.mexendo(m), false);
  }

  // bater na porta de quem está na minha sala (ou no corredor) vira um aceno, sem andar
  {
    const { t, m, eu } = await montar([pessoa("ana", "Ana", 150, 100, "recepcao")]);
    const ana = t.Vida.equipe(m).find(p => p.nome === "Ana");
    assert.equal(t.Vida.acenar(m, ana.chave, "porta"), true);
    assert.equal(eu.rota.length, 0);
    await t.passos(m, 1);
    assert.equal(eu.pose, "acenando");
  }

  // o ícone do status (mapa.js): pixel art 9x9 desenhado em código, um desenho diferente por status (não só a cor), o
  // detalhe branco com contraste de pelo menos 3:1 sobre o fundo (WCAG 1.4.11) e nada para status fora da lista
  {
    const c = { window: {}, console }; c.window = c;
    vm.runInNewContext(fs.readFileSync("static/mapa.js", "utf8"), c);
    const Mapa = c.Mapa, vistos = new Set();
    const lum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    for (const st of ["disponivel", "ocupado", "reuniao", "ausente"]) {
      const ic = Mapa.iconeStatus(st);
      assert.equal(ic.linhas.length, 9); assert.ok(ic.linhas.every(l => /^[.o#+]{9}$/.test(l)), st);
      const detalhe = ic.linhas.join("").replace(/[^+]/g, "-");
      assert.ok(detalhe.includes("+") && !vistos.has(detalhe), `o desenho de ${st} é só dele`); vistos.add(detalhe);
      assert.ok((lum("#ffffff") + 0.05) / (lum(ic.cor) + 0.05) >= 3, `contraste de ${st}`);
      assert.equal(typeof ic.rotulo, "string");
      const feitos = []; const ctx = { set fillStyle(v) { feitos.push(v); }, fillRect() { feitos.push("r"); } };
      Mapa.desenharStatus(ctx, st, 10, 20, 2);
      assert.ok(feitos.filter(f => f === "r").length > 40);
    }
    assert.equal(Mapa.iconeStatus("<b>"), null);
    const nada = []; Mapa.desenharStatus({ set fillStyle(v) { nada.push(v); }, fillRect() { nada.push("r"); } }, null, 0, 0, 1);
    assert.equal(nada.length, 0);
  }

  console.log("test_mapa_equipe: ok");
})().catch(e => { console.error(e); process.exit(1); });
