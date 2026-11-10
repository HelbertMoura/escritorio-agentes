"use strict";
// Mundo público em níveis (Globo → Brasil → Cidade → Bairro): fragmento inválido, Esc, clique numa cidade, câmera presa à
// caixa, aba escondida, movimento reduzido e clima vazio. O mesmo arnês de VM do test_visita_mundo.js, com os scripts da página.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const MUNDO = JSON.parse(fs.readFileSync("static/mundo/mundo.json", "utf8"));
const ATLAS = JSON.parse(fs.readFileSync("static/mundo/atlas.json", "utf8"));
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

// Opções: clima (a resposta da rota), climaFalha (a rota cai), climaPendente (a resposta nunca chega), reduzido, tela
// [w, h, dpr], atlas, som, busca (location.search, como "?data=2026-12-25"), escuro (a noite do Ceu, de 0 a 1), opaco
// (getImageData devolve pixels opacos: o contorno dos telhados), passo (ms de relógio por quadro; o dt vai até 0,1 s) e
// globoFalha (Globo.criar lança erro) e fontePendente (document.fonts.load nunca termina). O globo é sempre o de verdade: o
// campo de nuvens só é montado quando ele desenha
async function abrir(hash, { clima = CLIMA, reduzido = false, climaFalha = false, climaPendente = false, tela = [640, 400, 1],
  atlas = ATLAS, som = null, busca = "", escuro = 0, opaco = false, passo = 16, globoFalha = false, fontePendente = false } = {}) {
  const quadros = [], requisicoes = [], intervalos = [], tamanho = [...tela];
  // putImageData conta as passadas pixel a pixel do globo; getImageData dá pixels zerados (ou opacos) quando o teste faz uma
  // imagem carregar. drawImage guarda o recorte de origem [sx, sy, sw, sh] quando o teste liga contexto.gravar (um array);
  // fillRect guarda a cor de cada retângulo quando o teste liga contexto.cores (um Set); os gradientes são contados
  const pincel = {};
  const ctx = new Proxy(pincel, { get: (o, k) => ["createLinearGradient", "createRadialGradient"].includes(k)
    ? () => { contexto.gradientes = (contexto.gradientes || 0) + 1; return { addColorStop() {} }; }
    : k === "getTransform" ? () => ({ a: 1 })
    : k === "getImageData" ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(opaco ? 255 : 0) })
    : k === "putImageData" ? () => { contexto.passadas = (contexto.passadas || 0) + 1; }
    : k === "fillRect" ? () => { if (contexto.cores) contexto.cores.add(String(o.fillStyle).toLowerCase()); }
    : k === "drawImage" ? (img, ...a) => { if (contexto.gravar) contexto.gravar.push(a.slice(0, 4)); } : () => {},
    set: (o, k, v) => { o[k] = v; return true; } });
  const canvas = elemento(); canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: tamanho[0], height: tamanho[1] });
  const ids = ["mundo", "entrar", "mundo-estado", "mundo-alvos", "mundo-dica", "mundo-voltar", "mundo-mais", "mundo-menos"];
  const elementos = Object.fromEntries(ids.map(id => [id, id === "mundo" ? canvas : elemento()]));
  const janela = elemento();
  janela.devicePixelRatio = tela[2];
  janela.matchMedia = q => ({ matches: reduzido && q === "(prefers-reduced-motion: reduce)", addEventListener() {} });
  const documento = elemento();
  documento.hidden = false;
  documento.getElementById = id => elementos[id];
  documento.createElement = () => { const e = elemento(); e.getContext = () => ctx; return e; };
  if (fontePendente) documento.fonts = { load: () => new Promise(() => {}) };
  const contexto = {
    window: janela, document: documento, location: { hash, pathname: "/mundo.html", search: busca, href: "" },
    history: {
      replaceState(_, __, url) { contexto.endereco = url; const i = url.indexOf("#"); contexto.location.hash = i < 0 ? "" : url.slice(i); },
      pushState(_, __, url) { this.replaceState(_, __, url); },
    },
    performance: { now: () => 0 }, requestAnimationFrame: f => quadros.push(f),
    setInterval(f, ms) { intervalos.push(ms); }, clearInterval() {}, setTimeout, Math, Promise, JSON, URLSearchParams,
    // as imagens só carregam (ou falham) quando o teste pede (carregar, falhar)
    Image: class {
      constructor() { this.complete = false; this.naturalWidth = 0; this.ouvintes = {}; (contexto.imagens ||= []).push(this); }
      addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); }
      carregar() { for (const f of this.ouvintes.load || []) f(); }
      falhar() { for (const f of this.ouvintes.error || []) f(); }
    },
    Som: som,
    Ceu: { agora: () => ({ h: escuro > 0.5 ? 22 : 12, cima: "#3d95ee", baixo: "#a9d8ff", escuro, hora: escuro > 0.5 ? "22:00" : "12:00" }) },
    // desenhar conta as chamadas: as partículas de chuva e neve e o clarão do raio só saem do Clima.desenhar
    Clima: { definir(c) { contexto.clima = c; }, tipo: () => (contexto.clima && contexto.clima.tipo) || "limpo", texto: () => "céu limpo",
             desenhar() { contexto.desenhos = (contexto.desenhos || 0) + 1; }, balanco: () => 0 },
    fetch: async (url, opcoes) => {
      requisicoes.push([url, opcoes]);
      if (url.startsWith("/mundo/mundo.json")) return { ok: true, json: async () => JSON.parse(JSON.stringify(MUNDO)) };
      if (url.startsWith("/mundo/atlas.json")) return { ok: true, json: async () => JSON.parse(JSON.stringify(atlas)) };
      if (climaFalha) throw new Error("rede");
      if (climaPendente) return new Promise(() => {});
      return { ok: true, json: async () => clima };
    },
  };
  vm.createContext(contexto);
  contexto.window.Som = som;
  const scripts = ["static/festas.js", "static/avatar.js", "static/mundo_bairro.js", "static/mundo_mapa_arte.js", "static/mundo_mapa.js",
    "static/mundo_globo.js", "static/mundo_cidade_planta.js", "static/mundo_festa.js", "static/mundo_cidade.js", "static/mundo.js"];
  for (const f of scripts) vm.runInContext(fs.readFileSync(f, "utf8"), contexto, { filename: f });
  if (globoFalha) vm.runInContext("Globo.criar = () => { throw new Error('globo quebrado'); };", contexto);
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));   // mundo.json e clima chegam
  let relogio = 0;
  const rodar = (n = 1) => { for (let i = 0; i < n; i++) { const f = quadros.shift(); if (!f) return; relogio += passo; f(relogio); } };
  const redimensionar = (w, h) => { tamanho[0] = w; tamanho[1] = h; janela.disparar("resize"); };
  const M = contexto.window.Mundo;
  const ponteiro = (tipo, x, y) => canvas.disparar(tipo, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true });
  const clicar = (x, y) => { ponteiro("pointerdown", x, y); ponteiro("pointerup", x, y); };
  const arrastar = (dx, dy) => { ponteiro("pointerdown", 320, 200); ponteiro("pointermove", 320 + dx / 2, 200 + dy / 2); ponteiro("pointermove", 320 + dx, 200 + dy); ponteiro("pointerup", 320 + dx, 200 + dy); };
  const tecla = key => janela.disparar("keydown", { key, target: documento });
  rodar(2);
  const toque = (tipo, id, x, y) => canvas.disparar(tipo, { pointerId: id, clientX: x, clientY: y, button: 0 });
  return { contexto, M, canvas, elementos, documento, quadros, requisicoes, intervalos, rodar, clicar, arrastar, tecla, toque,
           redimensionar };
}
const espera = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
const carregar = async m => { await espera(); for (const img of m.contexto.imagens || []) img.carregar(); m.rodar(2); };

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

  // só o mapa (com o atlas das miniaturas) e o clima do mundo são pedidos, sem cookie e com o corpo vazio; o clima de novo
  // a cada 15 min
  assert.deepEqual(c.requisicoes.map(([u]) => u.split("?")[0]), ["/mundo/mundo.json", "/mundo/atlas.json", "/api/mundo/clima"]);
  assert.ok(c.requisicoes.every(([, o]) => o && o.credentials === "omit"));
  const [, op] = c.requisicoes[2];
  assert.equal(op.method, "POST"); assert.equal(op.credentials, "omit"); assert.equal(op.body, "{}");
  assert.ok(c.intervalos.includes(15 * 60 * 1000));

  // Esc no bairro sobe para a cidade; Esc na cidade sobe para o Brasil. O bairro usa o tempo da cidade (a casa).
  const e = await abrir("#cidade=recife", { clima: { ...CLIMA, casa: "recife" } });
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
  const g = await abrir(""), G = g.contexto.window.Globo;
  assert.equal(g.M.nivel, "globo"); assert.equal(g.contexto.location.hash, "#globo");
  assert.equal(g.elementos["mundo-voltar"].disabled, true);
  assert.equal(g.elementos["mundo-menos"].disabled, true, "o − não faz nada no globo: desabilitado");
  assert.equal((await abrir("#globo")).M.nivel, "globo");
  g.clicar(3, 3); g.rodar(40);
  assert.equal(g.M.nivel, "globo", "clique no espaço");
  // o alvo do clique são as células do Brasil no mundo.json (sem esperar imagem nenhuma): a Bolívia, dentro da caixa
  // do mapa, não desce
  const gb = await abrir("", { reduzido: true }), bolivia = G.projetar(-17.5, -64, -50, -15, G.R);
  gb.clicar(...gb.M.camera.tela(bolivia.x, bolivia.y)); gb.rodar(40);
  assert.equal(gb.M.nivel, "globo", "clique na Bolívia");
  g.clicar(...g.M.camera.tela(G.B / 2, G.B / 2)); g.rodar(40);
  assert.equal(g.M.nivel, "brasil", "clique no Brasil"); assert.equal(g.contexto.location.hash, "#brasil");
  assert.equal(g.elementos["mundo-menos"].disabled, false, "no Brasil o − afasta");
  g.tecla("Escape"); g.rodar(40);
  assert.equal(g.M.nivel, "globo", "Esc no Brasil volta ao globo"); assert.equal(g.contexto.location.hash, "#globo");
  // o globo que falha ao abrir não derruba o mapa: a página abre no Brasil, sem Voltar, e as cidades seguem
  const gf = await abrir("", { globoFalha: true });
  assert.equal(gf.M.nivel, "brasil"); assert.equal(gf.contexto.location.hash, "#brasil");
  assert.equal(gf.elementos["mundo-voltar"].disabled, true, "sem globo, nada acima do Brasil");
  gf.tecla("Escape"); gf.rodar(40);
  assert.equal(gf.M.nivel, "brasil", "Esc no Brasil sem globo fica");
  const mg = cidade("manaus");
  gf.clicar(...gf.M.camera.tela(mg.x, mg.y)); gf.rodar(40);
  assert.equal(gf.M.nivel, "cidade", "sem globo, o clique numa cidade ainda desce");
  // o + no globo com o Brasil escondido: o globo gira até ele e então desce
  const gz = await abrir("", { passo: 100 });
  for (let i = 0; i < 3; i++) { gz.arrastar(-150, 0); gz.rodar(); }
  const lon = gz.M.niveis.globo.rotacao.lon;
  assert.ok(Math.abs((((lon + 50) % 360) + 540) % 360 - 180) > 60, "o arraste levou o Brasil para longe: " + lon);
  gz.elementos["mundo-mais"].disparar("click"); gz.rodar(3);
  assert.equal(gz.M.nivel, "globo", "ainda girando até o Brasil");
  gz.rodar(40);
  assert.equal(gz.M.nivel, "brasil", "o + leva ao Brasil");

  // um clique numa cidade leva a #cidade=<id>; no mar, nada
  const k = await abrir("#brasil");
  k.clicar(5, 395); k.rodar(40);
  assert.equal(k.M.nivel, "brasil");
  const manaus = cidade("manaus");
  k.clicar(...k.M.camera.tela(manaus.x, manaus.y)); k.rodar(40);
  assert.equal(k.M.nivel, "cidade"); assert.equal(k.contexto.location.hash, "#cidade=manaus");
  k.clicar(320, 200); k.rodar(40);
  assert.equal(k.M.nivel, "cidade", "Manaus não é a casa: o clique na cidade não desce ao bairro");

  // nível Cidade: a planta sai da semente do id, nas 28 cidades (sempre a mesma para o mesmo id)
  const Cid = k.contexto.window.MundoCidade, CP = k.contexto.window.CidadePlanta, planta = id => JSON.stringify(Cid.planta(id));
  assert.equal(planta("recife"), planta("recife"), "a mesma cidade, a mesma planta");
  assert.notEqual(planta("recife"), planta("manaus"));
  const BORDA = CP.E / 2 + CP.C;   // do eixo da rua ao fim da calçada
  const cruza = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const cc of MUNDO.cidades) {
    const p = Cid.planta(cc.id), id = cc.id;
    assert.equal(planta(id), JSON.stringify(p), `${id}: determinística`);
    assert.ok(p.chales.length >= 6 && p.chales.length <= 10, `${id}: ${p.chales.length} chalés`);
    assert.ok(p.chales.every(c => /^chale-[1-8]$/.test(c.peca)), id);
    assert.ok(p.predios.length >= 2 && p.predios.length <= 5, `${id}: ${p.predios.length} prédios`);
    assert.ok(p.predios.every(c => /^predios-[1-6]$/.test(c.peca)) && /^predios-[1-6]$/.test(p.centro.peca), id);
    assert.equal(p.praca.peca, "praca-1", id);
    assert.equal(p.mobiliario.map(m => m.peca).sort().join(), "banca-1,banco-poste-1,carrinho-1,ponto-onibus-1", id);
    assert.ok(p.pedestres.length >= 8 && p.pedestres.length <= 14, `${id}: ${p.pedestres.length} pedestres`);
    assert.ok(p.carros.length > 0, id);
    // vagas distintas: nada divide chão com outra peça, e tudo fica fora da rua e da calçada (o ônibus saiu: fica o ponto)
    const itens = [p.centro, ...p.chales, ...p.predios, p.praca, ...p.arvores, ...p.mobiliario, p.casa, ...p.arredores];
    for (const s of itens) {
      assert.ok(s.r[0] <= s.x && s.x <= s.r[2] && s.r[1] <= s.y && s.y <= s.r[3], `${id}: o pé de ${s.peca} na vaga`);
      assert.ok(!p.ruas.v.some(v => s.r[0] < v + BORDA && v - BORDA < s.r[2]), `${id}: ${s.peca} na rua (x)`);
      assert.ok(!p.ruas.h.some(h => s.r[1] < h + BORDA && h - BORDA < s.r[3]), `${id}: ${s.peca} na rua (y)`);
    }
    for (let i = 0; i < itens.length; i++) for (let j = i + 1; j < itens.length; j++) {
      assert.ok(!cruza(itens[i].r, itens[j].r), `${id}: ${itens[i].peca} e ${itens[j].peca} na mesma vaga`);
    }
    assert.ok(!("onibus" in p) && !itens.some(s => /^onibus-/.test(s.peca)), `${id}: sem ônibus na planta`);
    // nenhum carro começa dentro de um cruzamento (onde outro poderia estar), e o par da mesma faixa não se encosta
    for (const c of p.carros) {
      const cruzes = c.eixo === "h" ? [...new Set(p.carros.filter(o => o.eixo === "v").map(o => o.rua))]
        : [...new Set(p.carros.filter(o => o.eixo === "h").map(o => o.rua))];
      assert.ok(cruzes.every(k => Math.abs(c.s - k) >= CP.E / 2 + 16), `${id}: carro começa no cruzamento ${c.s}`);
    }
  }
  // na casa, o chalé com placa tem a porta (só depois que o desenho do chalé chega): o clique nela leva a #bairro
  const ca = await abrir("#cidade=mateus-leme");
  ca.rodar(5);
  assert.equal(ca.M.nivel, "cidade");
  assert.equal(ca.M.niveis.cidade.alvos().length, 0, "sem o desenho do chalé, nem placa nem porta");
  await carregar(ca);
  assert.match(ca.canvas["aria-label"], /chalé do escritório com a placa/, "a casa chegou do clima: o rótulo cita o chalé");
  assert.match(ca.canvas["aria-label"], /o marco da cidade/);
  const portas = ca.M.niveis.cidade.alvos();
  assert.equal(portas.length, 1); assert.equal(portas[0].id, "porta"); assert.deepEqual({ ...portas[0].acao }, { ir: "bairro", cidade: "mateus-leme" });
  ca.clicar(...ca.M.camera.tela(portas[0].x, portas[0].y - 10)); ca.rodar(40);
  assert.equal(ca.M.nivel, "bairro", "a porta da casa desce ao bairro"); assert.equal(ca.contexto.location.hash, "#bairro");
  // fora da casa, nenhum alvo e nenhum clique desce; o bairro é sempre o da casa
  const mn = await abrir("#cidade=manaus");
  mn.rodar(5);
  assert.equal(mn.M.niveis.cidade.alvos().length, 0, "Manaus não tem chalé com placa");
  for (let sx = 20; sx < 640; sx += 60) for (let sy = 20; sy < 400; sy += 60) { mn.clicar(sx, sy); mn.rodar(); }
  mn.rodar(40);
  assert.equal(mn.M.nivel, "cidade", "nenhum ponto de Manaus desce ao bairro");
  mn.M.ir("bairro"); mn.rodar(40);
  assert.equal(mn.M.nivel, "bairro");
  mn.tecla("Escape"); mn.rodar(40);
  assert.equal(mn.contexto.location.hash, "#cidade=mateus-leme", "o bairro é o da casa: Esc sobe para ela");
  // a arte do marco faltando no atlas: a cidade desenha os prédios genéricos da planta (e nenhum marco), sem erro, e o
  // rótulo não promete o marco; com a arte, desenha o marco dela e nenhum outro
  const semRecife = { ...ATLAS, quadros: { ...ATLAS.quadros } };
  delete semRecife.quadros["marco-recife-antigo"];
  for (const [id, peca, atlas] of [["recife", Cid.planta("recife").centro.peca, semRecife], ["belo-horizonte", "marco-pampulha", ATLAS]]) {
    const sm = await abrir("#cidade=" + id, { atlas });
    await espera();
    assert.ok(sm.requisicoes.some(([u]) => u.startsWith("/mundo/atlas.json")), "a cidade pede o atlas");
    for (const img of sm.contexto.imagens || []) img.carregar();
    sm.contexto.gravar = [];
    sm.rodar(3);
    const usados = new Set(sm.contexto.gravar.map(r => JSON.stringify(r)));
    assert.ok(usados.has(JSON.stringify(ATLAS.quadros[peca])), `${id}: desenha ${peca}`);
    const marcos = Object.keys(ATLAS.quadros).filter(n => n.startsWith("marco-") && n !== peca);
    assert.ok(!marcos.some(n => usados.has(JSON.stringify(ATLAS.quadros[n]))), `${id}: nenhum outro marco`);
    assert.equal(sm.M.nivel, "cidade"); assert.equal(sm.quadros.length, 1);
    assert.equal(/marco/.test(sm.canvas["aria-label"]), peca.startsWith("marco-"), `${id}: ${sm.canvas["aria-label"]}`);
  }
  // o atlas.png que falha ao carregar é pedido de novo na próxima entrada
  const fa = await abrir("#cidade=manaus");
  await espera();
  for (const img of fa.contexto.imagens || []) img.falhar();
  const pedidosAtlas = () => fa.requisicoes.filter(([u]) => u.startsWith("/mundo/atlas.json")).length, n0 = pedidosAtlas();
  assert.equal(n0, 2, "o mapa (miniaturas) e a cidade pedem o atlas");
  fa.tecla("Escape"); fa.rodar(40); await espera();
  assert.equal(fa.M.nivel, "brasil");
  assert.equal(pedidosAtlas(), n0 + 1, "a falha libera um novo pedido do mapa ao voltar a ele");
  fa.M.ir("cidade", { cidade: "manaus" }); fa.rodar(40); await espera();
  assert.equal(pedidosAtlas(), n0 + 2, "a falha libera um novo pedido da cidade");
  // a cidade usa o tempo dela; com movimento reduzido carros e pedestres ficam parados e não há partículas (nada de Clima.desenhar)
  const temporal = { cidades: { recife: { tipo: "tempestade", vento: 1, noite: false } }, casa: null, versao: 1 };
  for (const reduz of [true, false]) {
    const z = await abrir("#cidade=recife", { clima: temporal, reduzido: reduz });
    await carregar(z);
    assert.equal(z.contexto.clima.tipo, "tempestade", "a cidade chove como ela");
    const cid = z.M.niveis.cidade, antes = JSON.stringify([cid.carros, cid.pedestres]), d0 = z.contexto.desenhos || 0;
    z.rodar(60);
    const depois = JSON.stringify([cid.carros, cid.pedestres]), d1 = (z.contexto.desenhos || 0) - d0;
    if (reduz) { assert.equal(depois, antes, "reduzido: carros e pedestres parados"); assert.equal(d1, 0, "reduzido: sem partículas"); }
    else {
      assert.notEqual(JSON.stringify(cid.carros), JSON.stringify(JSON.parse(antes)[0]), "os carros andam");
      assert.notEqual(JSON.stringify(cid.pedestres), JSON.stringify(JSON.parse(antes)[1]), "os pedestres andam");
      assert.ok(d1 >= 60, "o clima desenha a cada quadro");
    }
  }
  // pedestres: sempre na calçada ou na faixa de pedestre (nunca no meio da rua nem dentro das quadras), virando nas
  // esquinas e atravessando nas faixas
  // (o passo de 100 ms por quadro cobre os mesmos 32 s de antes em 320 quadros)
  const pe = await abrir("#cidade=curitiba", { passo: 100 }), pp = Cid.planta("curitiba");
  await carregar(pe);
  const banda = d => d >= CP.E / 2 - 1e-6 && d <= BORDA + 1e-6;
  const naCalcadaH = (x, y) => pp.ruas.h.some(h => banda(Math.abs(y - h))), naCalcadaV = (x, y) => pp.ruas.v.some(v => banda(Math.abs(x - v)));
  let faixas = 0, viradas = 0;
  const lado = pe.M.niveis.cidade.pedestres.map(([x, y]) => naCalcadaH(x, y));
  for (let i = 0; i < 320; i++) {
    pe.rodar();
    pe.M.niveis.cidade.pedestres.forEach(([x, y], j) => {
      const h = naCalcadaH(x, y), v = naCalcadaV(x, y);
      assert.ok(h || v, `pedestre ${j} fora da calçada e da faixa: ${x}, ${y}`);
      if (h && pp.ruas.v.some(rv => Math.abs(x - rv) < CP.E / 2 - 1) || v && pp.ruas.h.some(rh => Math.abs(y - rh) < CP.E / 2 - 1)) faixas++;
      if (h !== v && h !== lado[j]) { viradas++; lado[j] = h; }
    });
  }
  assert.ok(faixas > 0, "algum pedestre atravessou na faixa"); assert.ok(viradas > 0, "algum pedestre virou a esquina");
  // tela larga (a vista passa da caixa): o carro só dá a volta fora da vista, com o desenho todo para fora
  // (80 s de relógio, em quadros de 100 ms)
  const lg = await abrir("#cidade=recife", { tela: [1600, 400, 1], passo: 100 });
  await carregar(lg);
  const lc = lg.M.camera, [vx0, vy0] = lc.mundo(0, 0), [vx1, vy1] = lc.mundo(lc.W, lc.H);
  assert.ok(vx0 < -100 && vx1 > CP.W + 100, `a vista passa da caixa: ${vx0} a ${vx1}`);
  let antesCarros = lg.M.niveis.cidade.carros, voltas = 0;
  for (let i = 0; i < 800; i++) {
    lg.rodar();
    const agora = lg.M.niveis.cidade.carros;
    agora.forEach(([x, y], j) => {
      const [ax, ay] = antesCarros[j];
      if (Math.abs(x - ax) + Math.abs(y - ay) < 5) return;
      voltas++;
      for (const [px, py] of [[ax, ay], [x, y]]) assert.ok(px <= vx0 - 10 || px >= vx1 + 10 || py <= vy0 - 10 || py >= vy1 + 10, `volta dentro da vista: ${px}, ${py}`);
    });
    antesCarros = agora;
  }
  assert.ok(voltas > 0, "algum carro deu a volta");
  // veículos nunca sobrepostos: o carro espera antes do cruzamento enquanto houver outro dentro dele, e o par da mesma
  // faixa não se encosta, nem quando a vista encolhe de uma vez (o celular girado)
  const caixas = cid => cid.veiculos.map(([x, y, w, h]) => [x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
  const semSobrepor = (cid, quando) => {
    const l = caixas(cid);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      assert.ok(!cruza(l[i], l[j]), `${quando}: veículos ${i} e ${j} sobrepostos: ${l[i]} / ${l[j]}`);
    }
  };
  let esperas = 0;
  for (const id of ["recife", "curitiba", "palmas"]) {
    const vc = await abrir("#cidade=" + id, { tela: [1600, 400, 1], passo: 100 });
    await carregar(vc);
    const cid = vc.M.niveis.cidade;
    assert.ok(cid.veiculos.length >= 4, id);
    let antes = cid.carros;
    for (let i = 0; i < 250; i++) {
      vc.rodar(); semSobrepor(cid, `${id} (larga), quadro ${i}`);
      const agora = cid.carros;
      esperas += agora.filter(([x, y], j) => x === antes[j][0] && y === antes[j][1]).length;
      antes = agora;
    }
    vc.redimensionar(390, 507); vc.rodar();
    for (let i = 0; i < 150; i++) { vc.rodar(); semSobrepor(cid, `${id} (encolhida), quadro ${i}`); }
  }
  assert.ok(esperas > 0, "algum carro esperou num cruzamento");
  // os brilhos da noite saem de sprites guardados: nada de gradiente novo a cada quadro (num dia sem festa)
  const nt = await abrir("#cidade=sao-paulo", { escuro: 1, busca: "?data=2026-11-18" });
  await carregar(nt);
  nt.rodar(60);   // cada raio e cor de brilho que aparece pinta o seu sprite uma vez
  const g0 = nt.contexto.gradientes || 0;
  assert.ok(g0 > 0 && g0 < 10, "sprites de brilho: " + g0);
  nt.rodar(60);
  assert.equal((nt.contexto.gradientes || 0) - g0, 0, "brilhos em cache");
  // pedestres em 1:1 (o boneco inteiro de 22 px): o desenho cai na escala do mundo, sem dobrar as coordenadas
  nt.contexto.gravar = []; nt.rodar();
  assert.ok(nt.contexto.gravar.some(r => r[2] === 22 && r[3] === 22), "boneco desenhado em 22x22");
  assert.ok(!nt.contexto.gravar.some(r => r[2] === 11 && r[3] === 11), "nenhum boneco na metade");

  // a chuva do som vai a zero ao sair da cidade para o Brasil, e só enquanto ainda pode estar tocando: no globo e no Brasil
  // abertos direto (sem passar pela cidade), nenhuma chamada a Som.chuva (que criaria o áudio sem nada para tocar)
  const chamadas = [], somFalso = { ligado: true, chuva(v) { chamadas.push(v); } };
  const sc = await abrir("#cidade=recife", { som: somFalso });
  sc.rodar(10);
  sc.tecla("Escape"); sc.rodar(60);
  assert.equal(sc.M.nivel, "brasil");
  assert.ok(chamadas.length >= 30 && chamadas.slice(-30).every(v => v === 0), "no Brasil, Som.chuva(0) a cada quadro");
  sc.rodar(400);
  const feitas = chamadas.length;
  sc.rodar(60);
  assert.equal(chamadas.length, feitas, "depois de silenciar, Som.chuva não é mais chamado");
  for (const hash of ["", "#brasil"]) {
    const so = [], sg = await abrir(hash, { som: { ligado: true, chuva(v) { so.push(v); } } });
    sg.rodar(40);
    assert.equal(so.length, 0, `${hash || "globo"}: nenhuma chamada a Som.chuva`);
  }

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
  const [, , cw, ch] = pc.M.camera.caixa;
  assert.ok(Math.abs(pc.M.camera.base - Math.min(1170 / cw, 1521 / ch)) < 1e-9, "cidade: base " + pc.M.camera.base);
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
  // com o Brasil longe depois do arraste, o foco no Brasil (Tab) realça sem girar o globo até ele
  gr.elementos["mundo-alvos"].filhos[0].disparar("focus"); gr.rodar(30);
  assert.equal(gr.M.niveis.globo.destaque, "brasil");
  assert.equal(JSON.stringify(gr.M.niveis.globo.rotacao), r1, "reduzido: o foco no Brasil não gira o globo");
  // terra.png e brasil.png chegam depois dos primeiros quadros: com movimento reduzido e nada mexendo, o globo se refaz
  const gi = await abrir("", { reduzido: true });
  gi.rodar(30);
  const passadas = gi.contexto.passadas;
  assert.ok(passadas > 0, "o primeiro quadro desenha o globo");
  gi.rodar(30);
  assert.equal(gi.contexto.passadas, passadas, "reduzido e parado: sem passada nova");
  for (const img of gi.contexto.imagens) img.carregar();
  gi.rodar(2);
  assert.ok(gi.contexto.passadas > passadas, "reduzido: as imagens que chegam refazem a passada");

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
module.exports = { abrir, espera, carregar, MUNDO, ATLAS, CLIMA };
if (require.main === module) principal().catch(e => { console.error(e); process.exitCode = 1; });
