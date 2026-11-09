"use strict";
// Mundo público em níveis (Globo → Brasil → Cidade → Bairro): fragmento inválido, Esc, clique numa cidade, câmera presa à
// caixa, aba escondida, movimento reduzido e clima vazio. O mesmo arnês de VM do test_visita_mundo.js, com os scripts da página.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const MUNDO = JSON.parse(fs.readFileSync("static/mundo/mundo.json", "utf8"));
const CLIMA = { cidades: { recife: { tipo: "chuva", vento: 0.3, noite: false } }, casa: "mateus-leme", versao: MUNDO.versao };

function elemento() {
  const el = {
    ouvintes: {}, style: {}, dataset: {}, hidden: false, textContent: "", filhos: [], disabled: false,
    addEventListener(t, f) { (el.ouvintes[t] ||= []).push(f); },
    disparar(t, ev = {}) { for (const f of el.ouvintes[t] || []) f({ preventDefault() {}, stopPropagation() {}, target: el, ...ev }); },
    setAttribute(k, v) { el[k] = String(v); }, removeAttribute(k) { delete el[k]; },
    appendChild(c) { el.filhos.push(c); return c; }, replaceChildren(...c) { el.filhos = c; },
    contains: () => false, focus() {}, setPointerCapture() {}, releasePointerCapture() {},
    classList: { add() {}, remove() {}, toggle() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
  };
  return el;
}

async function abrir(hash, { clima = CLIMA, reduzido = false, climaFalha = false, tela = [640, 400, 1] } = {}) {
  const quadros = [], requisicoes = [], intervalos = [];
  const ctx = new Proxy({}, { get: (_, k) => ["createLinearGradient", "createRadialGradient"].includes(k) ? () => ({ addColorStop() {} })
    : k === "getTransform" ? () => ({ a: 1 }) : () => {}, set: () => true });
  const canvas = elemento(); canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: tela[0], height: tela[1] });
  const ids = ["mundo", "entrar", "mundo-estado", "mundo-alvos", "mundo-dica", "mundo-voltar", "mundo-mais", "mundo-menos"];
  const elementos = Object.fromEntries(ids.map(id => [id, id === "mundo" ? canvas : elemento()]));
  const janela = elemento();
  janela.devicePixelRatio = tela[2];
  janela.matchMedia = q => ({ matches: reduzido && q === "(prefers-reduced-motion: reduce)", addEventListener() {} });
  const documento = elemento();
  documento.hidden = false;
  documento.getElementById = id => elementos[id];
  documento.createElement = () => { const e = elemento(); e.getContext = () => ctx; return e; };
  const contexto = {
    window: janela, document: documento, location: { hash, pathname: "/mundo.html", search: "", href: "" },
    history: {
      replaceState(_, __, url) { contexto.endereco = url; const i = url.indexOf("#"); contexto.location.hash = i < 0 ? "" : url.slice(i); },
      pushState(_, __, url) { this.replaceState(_, __, url); },
    },
    performance: { now: () => 0 }, requestAnimationFrame: f => quadros.push(f),
    setInterval(f, ms) { intervalos.push(ms); }, clearInterval() {}, setTimeout, Math, Promise, JSON, URLSearchParams,
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } addEventListener() {} },
    Ceu: { agora: () => ({ h: 12, cima: "#3d95ee", baixo: "#a9d8ff", escuro: 0, hora: "12:00" }) },
    // desenhar conta as chamadas: as partículas de chuva e neve e o clarão do raio só saem do Clima.desenhar
    Clima: { definir(c) { contexto.clima = c; }, tipo: () => (contexto.clima && contexto.clima.tipo) || "limpo", texto: () => "céu limpo",
             desenhar() { contexto.desenhos = (contexto.desenhos || 0) + 1; }, balanco: () => 0 },
    fetch: async (url, opcoes) => {
      requisicoes.push([url, opcoes]);
      if (url.startsWith("/mundo/mundo.json")) return { ok: true, json: async () => JSON.parse(JSON.stringify(MUNDO)) };
      if (climaFalha) throw new Error("rede");
      return { ok: true, json: async () => clima };
    },
  };
  vm.createContext(contexto);
  for (const f of ["static/mundo_bairro.js", "static/mundo_mapa.js", "static/mundo_globo.js", "static/mundo.js"]) vm.runInContext(fs.readFileSync(f, "utf8"), contexto, { filename: f });
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));   // mundo.json e clima chegam
  let relogio = 0;
  const rodar = (n = 1) => { for (let i = 0; i < n; i++) { const f = quadros.shift(); if (!f) return; relogio += 16; f(relogio); } };
  const M = contexto.window.Mundo;
  const ponteiro = (tipo, x, y) => canvas.disparar(tipo, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true });
  const clicar = (x, y) => { ponteiro("pointerdown", x, y); ponteiro("pointerup", x, y); };
  const arrastar = (dx, dy) => { ponteiro("pointerdown", 320, 200); ponteiro("pointermove", 320 + dx / 2, 200 + dy / 2); ponteiro("pointermove", 320 + dx, 200 + dy); ponteiro("pointerup", 320 + dx, 200 + dy); };
  const tecla = key => janela.disparar("keydown", { key, target: documento });
  rodar(2);
  const toque = (tipo, id, x, y) => canvas.disparar(tipo, { pointerId: id, clientX: x, clientY: y, button: 0 });
  return { contexto, M, canvas, elementos, documento, quadros, requisicoes, intervalos, rodar, clicar, arrastar, tecla, toque };
}

const cidade = id => MUNDO.cidades.find(c => c.id === id);

async function principal() {
  // fragmento inválido cai no Brasil; o convite sai da barra na hora e segue só pela porta do chalé
  const x = await abrir("#cidade=xyz");
  assert.equal(x.M.nivel, "brasil");
  assert.equal(x.contexto.location.hash, "#brasil");
  const convite = "a".repeat(43);
  const c = await abrir("#" + convite);
  assert.equal(c.M.nivel, "brasil", "convite colado não é nível: abre no Brasil");
  assert.ok(!c.contexto.endereco.includes(convite), "o convite sai da barra de endereço");
  c.M.ir("bairro"); c.rodar(40);
  assert.equal(c.M.nivel, "bairro");
  const B = c.contexto.window.MundoBairro, p = B.porta(B.CHALES.find(h => !h.vizinho));
  c.clicar(2, 2); c.rodar();
  assert.equal(c.contexto.location.href, "", "clicar no céu não entra");
  c.clicar(...c.M.camera.tela(p.x + p.w / 2, p.y + p.h / 2)); c.rodar();
  assert.equal(c.contexto.location.href, "/visita.html#" + convite, "a porta leva à visita com o convite");
  const sem = await abrir("#nao-e-convite");
  sem.elementos.entrar.disparar("click");
  assert.equal(sem.contexto.location.href, "/visita.html", "fragmento inválido não é repassado");

  // só o mapa e o clima do mundo são pedidos, sem cookie e com o corpo vazio; o clima de novo a cada 15 min
  assert.deepEqual(c.requisicoes.map(([u]) => u.split("?")[0]), ["/mundo/mundo.json", "/api/mundo/clima"]);
  const [, op] = c.requisicoes[1];
  assert.equal(op.method, "POST"); assert.equal(op.credentials, "omit"); assert.equal(op.body, "{}");
  assert.ok(c.intervalos.includes(15 * 60 * 1000));

  // Esc no bairro sobe para a cidade; Esc na cidade sobe para o Brasil. O bairro usa o tempo da cidade.
  const e = await abrir("#cidade=recife");
  assert.equal(e.M.nivel, "cidade");
  e.M.ir("bairro"); e.rodar(40);
  assert.equal(e.contexto.location.hash, "#bairro");
  assert.equal(JSON.stringify(e.contexto.clima), '{"tipo":"chuva","vento":15}', "o bairro de Recife chove como Recife");
  e.tecla("Escape"); e.rodar(40);
  assert.equal(e.M.nivel, "cidade"); assert.equal(e.contexto.location.hash, "#cidade=recife");
  e.tecla("Escape"); e.rodar(40);
  assert.equal(e.M.nivel, "brasil"); assert.equal(e.contexto.location.hash, "#brasil");
  e.elementos["mundo-voltar"].disparar("click"); e.rodar(40);
  assert.equal(e.M.nivel, "globo", "Voltar no Brasil sobe para o globo"); assert.equal(e.contexto.location.hash, "#globo");
  assert.equal(e.elementos["mundo-voltar"].disabled, true, "o globo é o topo: Voltar desabilitado");
  e.tecla("Escape"); e.rodar(40);
  assert.equal(e.M.nivel, "globo", "Esc no globo não sai dele");

  // sem fragmento, abre no globo (e #globo também vale); um clique no espaço não faz nada, um clique no Brasil desce
  const g = await abrir("");
  assert.equal(g.M.nivel, "globo"); assert.equal(g.contexto.location.hash, "#globo");
  assert.equal(g.elementos["mundo-voltar"].disabled, true);
  assert.equal((await abrir("#globo")).M.nivel, "globo");
  g.clicar(3, 3); g.rodar(40);
  assert.equal(g.M.nivel, "globo", "clique no espaço");
  g.clicar(...g.M.camera.tela(80, 80)); g.rodar(40);
  assert.equal(g.M.nivel, "brasil", "clique no Brasil"); assert.equal(g.contexto.location.hash, "#brasil");
  g.tecla("Escape"); g.rodar(40);
  assert.equal(g.M.nivel, "globo", "Esc no Brasil volta ao globo"); assert.equal(g.contexto.location.hash, "#globo");
  // o + no globo com o Brasil escondido: o globo gira até ele e então desce
  const gz = await abrir("");
  for (let i = 0; i < 3; i++) { gz.arrastar(-150, 0); gz.rodar(); }
  const lon = gz.M.niveis.globo.rotacao.lon;
  assert.ok(Math.abs((((lon + 50) % 360) + 540) % 360 - 180) > 60, "o arraste levou o Brasil para longe: " + lon);
  gz.elementos["mundo-mais"].disparar("click"); gz.rodar(3);
  assert.equal(gz.M.nivel, "globo", "ainda girando até o Brasil");
  gz.rodar(240);
  assert.equal(gz.M.nivel, "brasil", "o + leva ao Brasil");

  // um clique numa cidade leva a #cidade=<id>; no mar, nada
  const k = await abrir("#brasil");
  k.clicar(5, 395); k.rodar(40);
  assert.equal(k.M.nivel, "brasil");
  const manaus = cidade("manaus");
  k.clicar(...k.M.camera.tela(manaus.x, manaus.y)); k.rodar(40);
  assert.equal(k.M.nivel, "cidade"); assert.equal(k.contexto.location.hash, "#cidade=manaus");
  k.clicar(320, 200); k.rodar(40);
  assert.equal(k.M.nivel, "bairro", "a cidade provisória leva ao bairro");

  // a câmera fica presa à caixa: 50 arrastes para o mesmo lado e zoom de 1x a 4x
  const a = await abrir("#brasil");
  const cam = () => a.M.camera, dentro = () => {
    const c = cam(), [x0, y0, x1, y1] = c.caixa, mw = c.W / 2 / c.P, mh = c.H / 2 / c.P;
    assert.ok(c.z >= 1 && c.z <= 4, "zoom " + c.z);
    if (mw * 2 <= x1 - x0) assert.ok(c.x - mw >= x0 - 1e-6 && c.x + mw <= x1 + 1e-6, "x " + c.x);
    if (mh * 2 <= y1 - y0) assert.ok(c.y - mh >= y0 - 1e-6 && c.y + mh <= y1 + 1e-6, "y " + c.y);
  };
  for (let i = 0; i < 20; i++) { a.elementos["mundo-mais"].disparar("click"); a.rodar(3); }
  a.rodar(60);
  assert.equal(cam().z, 4); dentro();
  for (const [dx, dy] of [[150, 0], [-150, 0], [0, 150], [0, -150]]) {
    for (let i = 0; i < 50; i++) { a.arrastar(dx, dy); a.rodar(); dentro(); }
    a.rodar(90); dentro();
  }
  for (let i = 0; i < 30; i++) a.canvas.disparar("wheel", { deltaY: -120, clientX: 100, clientY: 100 });
  a.rodar(60); dentro();
  for (let i = 0; i < 20; i++) { a.elementos["mundo-menos"].disparar("click"); a.rodar(3); }
  a.rodar(60);
  assert.equal(cam().z, 1); dentro();
  const solta = a.M.Camera([0, 0, 400, 400]);
  solta.tamanho(640, 400, 1); solta.x = -999; solta.y = 9999; solta.z = 9; solta.limitar();
  assert.equal(solta.z, 4); assert.ok(solta.x - 320 / solta.P >= 0 && solta.y + 200 / solta.P <= 400);
  // a 1x o mapa inteiro cabe na maior escala possível (fracionária): celular (canvas de 1170 px, dpr 3) e desktop
  const celular = a.M.Camera([0, 0, 400, 400]).tamanho(1170, 1521, 3);
  assert.ok(celular.P >= 2.9 && celular.P <= 2.93, "escala a 1x no celular: " + celular.P);
  for (const [w, h, d] of [[1170, 1521, 3], [1170, 1290, 3], [940, 800, 1]]) {
    const c = a.M.Camera([0, 0, 400, 400]).tamanho(w, h, d);
    assert.ok(c.x - w / 2 / c.P <= 0 && c.x + w / 2 / c.P >= 400, `x de 0 a 400 inteiro em ${w}x${h}`);
    assert.ok(c.y - h / 2 / c.P <= 0 && c.y + h / 2 / c.P >= 400, `y de 0 a 400 inteiro em ${w}x${h}`);
  }

  // celular (390x507 de CSS, dpr 3): uma pinça que volta ao tamanho de partida para em z = 1, a base exata (sem arredondar
  // para a escala inteira acima dela, que cortaria o mapa ou os chalés); a cidade também entra em z = 1
  const CEL = [390, 507, 3];
  for (const [hash, base] of [["#brasil", 2.925], ["#bairro", 1170 / 320]]) {
    const p = await abrir(hash, { tela: CEL });
    assert.ok(Math.abs(p.M.camera.base - base) < 1e-9, `${hash}: base ${p.M.camera.base}`);
    p.toque("pointerdown", 1, 100, 250); p.toque("pointerdown", 2, 300, 250);
    p.toque("pointermove", 2, 380, 250); p.toque("pointermove", 2, 300, 250);
    p.toque("pointerup", 2, 300, 250); p.toque("pointerup", 1, 100, 250);
    p.rodar(60);
    const c = p.M.camera;
    assert.equal(c.z, 1, `${hash}: a pinça termina em z = 1`); assert.equal(c.alvoZ, 1);
    assert.ok(c.x - c.W / 2 / c.P <= c.caixa[0] + 1e-9 && c.x + c.W / 2 / c.P >= c.caixa[2] - 1e-9, `${hash}: a largura inteira cabe`);
  }
  const pc = await abrir("#cidade=recife", { tela: CEL });
  pc.rodar(30);
  assert.ok(Math.abs(pc.M.camera.base - 9.75) < 1e-9, "cidade: base " + pc.M.camera.base);
  assert.equal(pc.M.camera.z, 1, "cidade entra em z = 1"); assert.equal(pc.M.camera.alvoZ, 1);

  // aba escondida: nenhum quadro novo; de volta, um só
  const h = await abrir("#brasil");
  assert.equal(h.quadros.length, 1);
  h.documento.hidden = true; h.rodar();
  assert.equal(h.quadros.length, 0, "escondida, não pede quadro");
  h.documento.hidden = false; h.documento.disparar("visibilitychange"); h.documento.disparar("visibilitychange");
  assert.equal(h.quadros.length, 1, "de volta, um quadro só");

  // o globo gira sozinho a 6°/s; com movimento reduzido fica parado no centro inicial (mas o arraste ainda gira)
  const gg = await abrir("");
  const antes = gg.M.niveis.globo.rotacao.lon;
  gg.rodar(60);
  assert.ok(Math.abs(Math.abs(gg.M.niveis.globo.rotacao.lon - antes) - 60 * 0.016 * 6) < 0.05, "6°/s: " + (gg.M.niveis.globo.rotacao.lon - antes));
  const gr = await abrir("", { reduzido: true });
  const r0 = JSON.stringify(gr.M.niveis.globo.rotacao);
  assert.equal(r0, JSON.stringify({ lon: -50, lat: -15 }), "centro inicial");
  gr.rodar(120);
  assert.equal(JSON.stringify(gr.M.niveis.globo.rotacao), r0, "reduzido: a rotação não muda entre quadros");
  gr.arrastar(100, 0); gr.rodar(30);
  const r1 = JSON.stringify(gr.M.niveis.globo.rotacao);
  assert.notEqual(r1, r0, "o arraste gira o globo à mão");
  gr.rodar(60);
  assert.equal(JSON.stringify(gr.M.niveis.globo.rotacao), r1, "reduzido: sem inércia nem giro depois do arraste");

  // movimento reduzido: nem aviões nem partículas; sem ele, até 6 aviões e partículas sobre as cidades
  const tempo = { cidades: Object.fromEntries(MUNDO.cidades.map((c, i) => [c.id, { tipo: ["chuva", "neve", "tempestade", "garoa"][i % 4], vento: 0.5, noite: false }])), casa: null, versao: 1 };
  const r = await abrir("#brasil", { clima: tempo, reduzido: true });
  r.rodar(600);
  assert.equal(r.M.niveis.brasil.avioes.length, 0); assert.equal(r.M.niveis.brasil.particulas, 0);
  const v = await abrir("#brasil", { clima: tempo });
  let maximo = 0;
  for (let i = 0; i < 600; i++) { v.rodar(); maximo = Math.max(maximo, v.M.niveis.brasil.avioes.length); }
  assert.ok(maximo > 0 && maximo <= 6, "aviões: " + maximo);
  assert.ok(v.M.niveis.brasil.particulas > 0);
  // no bairro também: com tempestade e movimento reduzido, nem partículas nem o clarão do raio (nada de Clima.desenhar)
  const tormenta = { cidades: { recife: { tipo: "tempestade", vento: 1, noite: false } }, casa: "recife", versao: 1 };
  for (const reduz of [true, false]) {
    const b = await abrir("#bairro", { clima: tormenta, reduzido: reduz });
    b.rodar(60);
    assert.equal(b.M.nivel, "bairro");
    assert.equal(b.contexto.clima.tipo, "tempestade", "#bairro direto fica na casa assim que o clima chega");
    if (reduz) assert.equal(b.contexto.desenhos || 0, 0, "reduzido: sem chuva nem raio no bairro");
    else assert.ok(b.contexto.desenhos >= 60, "sem reduzir, o clima desenha a cada quadro");
  }

  // clima vazio, estranho ou fora do ar não quebra o quadro
  for (const opcoes of [{ clima: {} }, { clima: { cidades: { recife: "lixo", manaus: { tipo: "<b>", vento: "x" } }, casa: 7 } }, { climaFalha: true }]) {
    const q = await abrir("#brasil", opcoes);
    q.rodar(30);
    assert.equal(q.M.nivel, "brasil");
    assert.equal(q.quadros.length, 1);
  }
}
principal().catch(e => { console.error(e); process.exitCode = 1; });
