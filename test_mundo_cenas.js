// Cenas integrais das cidades (esquema v1): o Recife igual ao de 7c0df2c, a validação da planta, cada cena do manifesto,
// a carga preguiçosa, a corrida entre cidades, o guardado de até 3 cenas, as luzes, os textos e a reserva com nova tentativa.
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { abrir, carregar, espera, CLIMA } = require("./test_mundo_navegacao.js");

const contexto = vm.createContext({ window: {} });
for (const f of ["static/mundo_cidade_cenas.js", "static/mundo_cidade_planta.js"]) vm.runInContext(readFileSync(f, "utf8"), contexto);
const CP = contexto.window.CidadePlanta, MANIFESTO = contexto.window.CidadeCenas;
const ler = id => JSON.parse(readFileSync(`static/mundo/cenas/${id}.json`, "utf8"));
const RECIFE = ler("recife");
const copia = v => JSON.parse(JSON.stringify(v));

// (a) a mesma planta que o recifeRaster de 7c0df2c, fora os campos novos
function equivalencia() {
  const p = copia(CP.cena(RECIFE));
  assert.deepEqual(p.cena.luzes, []);
  assert.deepEqual(p.cena.texto, {
    cena: "Recife Antigo em pixel art, com o Marco Zero, o casario e duas pontes sobre o Capibaribe",
    vida: "Um pedestre nas calçadas e um carro na rua oeste",
    portaria: "na fachada azul",
  });
  delete p.cena.luzes; delete p.cena.texto;
  assert.equal(JSON.stringify(p), readFileSync("test_dados/recife_raster_7c0df2c.json", "utf8"));
  assert.equal(CP.recifeRaster, undefined, "a cena vem dos dados");
}

// o esquema v1 além do que o Recife usa: grafo explícito, travessia que espera o carro, vários pedestres e luzes
function esquema() {
  const d = copia(RECIFE);
  d.calcadas.arestas = d.calcadas.nos.slice(1).map((_, i) => [i, i + 1]).concat([[0, 2]]);
  d.calcadas.travessias = [0, { aresta: 5, centro: [240, 318] }];
  d.pedestres.push({ de: 2, para: 0, s: 0, v: 10 });
  d.luzes = [[100, 100, 4, 0], [632, 424, 16, 0.6]];
  const p = CP.cena(d), faixa = p.rede.faixaPorAresta, chave = CP.chaveAresta;
  assert.deepEqual(copia(p.rede.viz[2]), [1, 3, 0]);
  assert.deepEqual(copia(p.rede.viz[0]), [1, 2]);
  assert.deepEqual(copia(faixa[chave(5, 6)]), { carros: true, centro: [240, 318] });
  assert.equal(faixa[chave(6, 5)], faixa[chave(5, 6)], "quem espera o carro espera nos dois sentidos");
  assert.deepEqual(copia(faixa[chave(0, 1)]), { carros: false });
  assert.deepEqual(copia(p.cena.travessias), [0, 5]);
  assert.deepEqual(copia(p.pedestres.map(a => a.semente)), ["recife:calcada", "recife:calcada#1"]);
  assert.deepEqual(copia(p.cena.luzes), d.luzes);
  assert.equal(p.cena.oclusoes[0].transparente[0], 0x3b2a5e);
  // os tetos valem inclusive
  d.cordoes = Array(16).fill(d.cordoes[0]);
  d.carros[0].tamanho = [32, 32]; d.carros[0].v = 40; d.pedestres[0].v = 30;
  d.pontos[0].nome = "a".repeat(40);
  const antes = JSON.stringify(d);
  CP.cena(d);
  assert.equal(JSON.stringify(d), antes, "a planta não mexe nos dados guardados");
}

function invalidas() {
  const cadeia = d => d.calcadas.nos.slice(1).map((_, i) => [i, i + 1]);
  const casos = {   // cada caso quebra uma regra só
    "não é objeto": () => null,
    "lista no lugar da cena": () => [],
    "versão": d => { d.versao = 2; },
    "id": d => { d.id = "Recife"; },
    "W pequeno": d => { d.W = 479; },
    "W grande": d => { d.W = 705; },
    "H pequeno": d => { d.H = 319; },
    "H grande": d => { d.H = 481; },
    "W quebrado": d => { d.W = 632.5; },
    "sem texto": d => { delete d.texto; },
    "texto vazio": d => { d.texto.cena = ""; },
    "texto longo": d => { d.texto.vida = "a".repeat(161); },
    "texto com marcação": d => { d.texto.portaria = "<b>"; },
    "texto com controle": d => { d.texto.portaria = "na\nfachada"; },
    "retângulo invertido": d => { d.praca.r = [520, 187, 448, 232]; },
    "retângulo fora": d => { d.pontos[0].r = [438, 182, 633, 230]; },
    "portaria fora da rede": d => { d.portaria.x += 1; },
    "portaria estreita": d => { d.portaria.r = [460, 114, 475, 163]; },
    "portaria baixa": d => { d.portaria.r = [454, 141, 479, 163]; d.portaria.placa = [467, 142]; },
    "pé fora da portaria": d => { d.portaria.r = [454, 114, 479, 161]; },
    "placa fora": d => { d.portaria.placa = [480, 142]; },
    "farol fora": d => { d.portaria.farol = [467, 164]; },
    "fonte fora da praça": d => { d.praca.fonte = [70, 15]; },
    "sem pontos": d => { d.pontos = []; },
    "pontos demais": d => { d.pontos = Array(7).fill(d.pontos[0]); },
    "ponto sem nome": d => { d.pontos[0].nome = ""; },
    "nome longo": d => { d.pontos[0].nome = "a".repeat(41); },
    "nós demais": d => { d.calcadas.nos.push(...Array.from({ length: 139 }, (_, i) => [10 + i * 3, 10])); },
    "nó quebrado": d => { d.calcadas.nos[0] = [400.5, 306]; },
    "nó fora": d => { d.calcadas.nos[0] = [-1, 306]; },
    "nós colados": d => { d.calcadas.nos[1] = [401, 306]; },
    "arestas demais": d => { d.calcadas.arestas = cadeia(d).concat(Array(220).fill([0, 1])); },
    "aresta solta": d => { d.calcadas.arestas = cadeia(d).concat([[0, 99]]); },
    "aresta no mesmo nó": d => { d.calcadas.arestas = cadeia(d).concat([[0, 0]]); },
    "grafo partido": d => { d.calcadas.arestas = d.calcadas.nos.slice(2).map((_, i) => [i + 1, i + 2]); d.calcadas.travessias = []; d.calcadas.pontes = []; },
    "arestas que não são lista": d => { d.calcadas.arestas = {}; },
    "travessia fora": d => { d.calcadas.travessias = [21]; },
    "travessia sem centro": d => { d.calcadas.travessias = [{ aresta: 0 }]; },
    "ponte fora": d => { d.calcadas.pontes = [-1]; },
    "pista curta": d => { d.pista = d.pista.slice(0, 3); },
    "pista longa": d => { d.pista = Array.from({ length: 65 }, (_, i) => [200 + i, 200]); },
    "pista parada": d => { d.pista = Array(4).fill([200, 200]); },
    "pista em quarto de pixel": d => { d.pista[2] = [228.25, 295]; },
    "carros demais": d => { d.carros = Array(7).fill(d.carros[0]); },
    "carro sem desenho": d => { d.carros[0].peca = "carro-6"; },
    "ônibus": d => { d.carros[0].peca = "onibus-1"; },
    "carro sem tamanho": d => { delete d.carros[0].tamanho; },
    "carro depois da volta": d => { d.carros[0].s = 1000; },
    "carro sem velocidade": d => { d.carros[0].v = "19"; },
    "pedestres demais": d => { d.pedestres = Array(9).fill(d.pedestres[0]); },
    "pedestre sem calçada": d => { d.pedestres[0].para = 20; },
    "pedestre além da calçada": d => { d.pedestres[0].s = 40; },
    "oclusões demais": d => { d.oclusoes = Array(13).fill(d.oclusoes[0]); },
    "oclusão grande demais": d => { d.oclusoes = [{ frente: [0, 0, 301, 100], pes: [0, 0, 10, 10], transparente: [] }]; },
    "cor torta": d => { d.oclusoes[0].transparente = ["zzzzzz"]; },
    "cor como número": d => { d.oclusoes[0].transparente = [3877470]; },
    "cordão fora": d => { d.cordoes = [[431, 184, 700, 184]]; },
    "luzes demais": d => { d.luzes = Array(49).fill([10, 10, 4, 0.5]); },
    "luz pequena": d => { d.luzes = [[10, 10, 3, 0.5]]; },
    "luz grande": d => { d.luzes = [[10, 10, 17, 0.5]]; },
    "luz forte": d => { d.luzes = [[10, 10, 8, 0.7]]; },
    "luz fora": d => { d.luzes = [[10, 425, 8, 0.5]]; },
    "nome com marcação": d => { d.pontos[0].nome = "<b>"; },
    "nome com controle": d => { d.pontos[0].nome = "Marco\tZero"; },
    "cordões demais": d => { d.cordoes = Array(17).fill(d.cordoes[0]); },
    "carro largo demais": d => { d.carros[0].tamanho = [33, 4]; },
    "carro alto demais": d => { d.carros[0].tamanho = [8, 33]; },
    "carro rápido demais": d => { d.carros[0].v = 40.5; },
    "pedestre rápido demais": d => { d.pedestres[0].v = 30.5; },
    "pista com ponto repetido": d => { d.pista.splice(1, 0, d.pista[0]); },
    "pista fechada à mão": d => { d.pista.push(d.pista[0]); },
  };
  for (const [nome, estragar] of Object.entries(casos)) {
    const d = copia(RECIFE), r = estragar(d);
    assert.throws(() => CP.cena(r === undefined ? d : r), /^Error: cena inválida: /, nome);
  }
}

// as respostas falsas: o PNG vira "blob:<id>" e o JSON é a cena do Recife com o id e o texto da cidade
const png = id => ({ ok: true, blob: async () => "blob:" + id });
const falsa = id => ({ ...copia(RECIFE), id, texto: { cena: "Cena de " + id, vida: "Vida de " + id, portaria: "no prédio de " + id } });
const json = dados => ({ ok: true, json: async () => dados });
const IDS = ["recife", "manaus", "salvador", "fortaleza"];
const FALSAS = Object.fromEntries(IDS.map(id => [id, { v: "0", png: "sha256-p", json: "sha256-j" }]));
const abrirFalsas = (id, opcoes = {}) => abrir("#cidade=" + id, { clima: { ...CLIMA, casa: id }, reduzido: true, cenas: FALSAS,
  imagemRecife: (_, cena) => png(cena), jsonCena: cena => json(falsa(cena)), ...opcoes });
const pedidos = (m, id, tipo = "") => m.requisicoes.filter(([u]) => u.startsWith(`/mundo/cenas/${id}.${tipo}`)).length;
const todos = m => m.requisicoes.map(([u]) => u).filter(u => u.startsWith("/mundo/cenas/"));
const texto = m => m.M.niveis.cidade.planta.cena?.texto.cena;
const ir = (m, cidade) => { m.M.ir("cidade", { cidade }); m.rodar(); };
// decodifica as imagens de cena que já chegaram
async function decodificar(m, w = RECIFE.W, h = RECIFE.H) {
  await espera();
  for (const img of m.contexto.imagens || []) {
    if (!String(img.src).startsWith("blob:") || img.naturalWidth) continue;
    img.naturalWidth = w; img.naturalHeight = h; img.carregar();
  }
  await espera(); m.rodar(2);
}
// o PNG de cada cidade segurado até soltar(id)
function segurados() {
  const portoes = new Map();
  const portao = id => {
    if (!portoes.has(id)) { let soltar; const resposta = new Promise(r => (soltar = r)); portoes.set(id, { resposta, soltar }); }
    return portoes.get(id);
  };
  return { imagemRecife: (_, id) => portao(id).resposta, soltar: id => portao(id).soltar(png(id)) };
}

const distancia = ([x, y], a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
};

// (b) cada cena do manifesto: monta, a vida segue a geometria, a portaria e os pontos viram alvos e a festa cai na praça
async function doManifesto(id) {
  const dados = ler(id), casa = { ...CLIMA, casa: id };
  assert.equal(CP.cena(dados).W, dados.W);
  const m = await abrir("#cidade=" + id, { clima: casa, passo: 100, imagemRecife: () => png(id) });
  await decodificar(m, dados.W, dados.H);
  const c = m.M.niveis.cidade, p = c.planta, { nos, viz } = p.rede, pista = p.malha.pista.trechos.map(t => t.a);
  assert.ok(p.cena, id);
  assert.match(c.alvos().map(a => a.id).join(), /^porta(,notavel-\d+)+$/, id);
  assert.ok(c.rotulo().includes(dados.texto.cena) && /portaria/.test(c.rotulo()), id);
  assert.ok(m.elementos["mundo-estado"].textContent.includes(`fica ${dados.texto.portaria}.`), id);
  for (let quadro = 0; quadro < 600; quadro++) {
    m.rodar();
    for (const z of c.pedestres) assert.ok(nos.some((a, i) => viz[i].some(j => distancia(z, a, nos[j]) < 0.5)), `${id}: pedestre fora em ${z}`);
    for (const z of c.carros) assert.ok(pista.some((a, i) => distancia(z, a, pista[(i + 1) % pista.length]) < 0.5), `${id}: carro fora em ${z}`);
  }
  assert.deepEqual(m.contexto.erros || [], []);
  for (const data of ["2026-02-16", "2026-06-24", "2026-10-31", "2026-12-25", "2026-12-31"]) {
    const f = await abrir("#cidade=" + id, { clima: casa, escuro: 1, busca: "?data=" + data, imagemRecife: () => png(id) });
    await decodificar(f, dados.W, dados.H);
    const n = f.M.niveis.cidade, [x0, y0, x1, y1] = n.planta.praca.r;
    assert.ok(n.enfeites.chave, `${id} ${data}: a festa do dia`);
    for (const s of n.enfeites.pecas) assert.ok(s[1] >= x0 && s[2] >= y0 && s[3] <= x1 && s[4] <= y1, `${id} ${data}: ${s[0]} na praça`);
    assert.deepEqual(f.contexto.erros || [], []);
  }
}

// (c) nada de cena no globo, no Brasil ou em cidade sem cena; na cidade com cena, um JSON e um PNG, os do manifesto
async function preguicosa() {
  // a cidade sem cena sai do mundo.json (a 1ª fora do manifesto), para não quebrar a cada lote de cenas
  const mundo = JSON.parse(readFileSync("static/mundo/mundo.json", "utf8"));
  const semCena = [...mundo.cidades, ...mundo.exterior, ...mundo.niveis.brasil.medias].map(c => c.id).find(id => !Object.hasOwn(MANIFESTO, id));
  for (const hash of ["#globo", "#brasil", "#cidade=" + semCena]) {
    const m = await abrir(hash, { reduzido: true });
    await carregar(m);
    assert.deepEqual(todos(m), [], hash);
  }
  const m = await abrir("#cidade=recife", { reduzido: true, imagemRecife: () => png("recife") });
  await decodificar(m);
  const { v } = MANIFESTO.recife;
  assert.deepEqual(todos(m), [`/mundo/cenas/recife.json?v=${v}`, `/mundo/cenas/recife.png?v=${v}`]);
  for (const [url, opcoes] of m.requisicoes.filter(([u]) => u.startsWith("/mundo/cenas/"))) {
    const tipo = url.includes(".json?") ? "json" : "png";
    assert.deepEqual({ ...opcoes }, { credentials: "omit", mode: "same-origin", cache: "no-cache", integrity: MANIFESTO.recife[tipo] });
    assert.equal(opcoes.integrity, "sha256-" + createHash("sha256").update(readFileSync(`static/mundo/cenas/recife.${tipo}`)).digest("base64"));
  }
  // um nome herdado de Object não é cidade com cena
  m.M.niveis.cidade.entrar({ cidade: "constructor" }); await espera();
  assert.equal(todos(m).length, 2);
}

// (d) A → B → A: a cena de B que chega tarde fica guardada e não mexe em A
async function corrida() {
  const s = segurados();
  const m = await abrirFalsas("recife", { imagemRecife: s.imagemRecife });
  s.soltar("recife"); await decodificar(m);
  assert.equal(texto(m), "Cena de recife");
  ir(m, "manaus"); await espera();
  ir(m, "recife");
  const c = m.M.niveis.cidade, antes = JSON.stringify(c.planta), alvos = JSON.stringify(c.alvos());
  s.soltar("manaus"); await decodificar(m);
  assert.equal(JSON.stringify(c.planta), antes);
  assert.equal(JSON.stringify(c.alvos()), alvos);
  ir(m, "manaus");
  assert.equal(texto(m), "Cena de manaus", "a reentrada já abre a cena");
  assert.equal(pedidos(m, "manaus"), 2, "um JSON e um PNG");

  // as duas no ar: quem chega primeiro não toma a vez da que está na tela, e a da tela entra quando chega
  const t = segurados();
  const n = await abrirFalsas("recife", { imagemRecife: t.imagemRecife });
  ir(n, "manaus"); await espera();
  ir(n, "recife");
  t.soltar("manaus"); await decodificar(n);
  assert.equal(texto(n), undefined);
  t.soltar("recife"); await decodificar(n);
  assert.equal(texto(n), "Cena de recife");
  assert.equal(pedidos(n, "recife"), 2, "com o pedido no ar, não há outro");
}

// no máximo 3 cenas guardadas: sai a usada há mais tempo, nunca a que está na tela
async function guardadas() {
  const m = await abrirFalsas("recife");
  await decodificar(m);
  const visitar = async id => { ir(m, id); await decodificar(m); assert.equal(texto(m), "Cena de " + id); };
  await visitar("manaus"); await visitar("salvador");
  await visitar("recife");      // volta a ser a mais recente
  await visitar("fortaleza");   // a quarta: sai Manaus
  for (const id of ["recife", "salvador", "fortaleza"]) { await visitar(id); assert.equal(pedidos(m, id), 2, id + " segue guardada"); }
  await visitar("manaus");
  assert.equal(pedidos(m, "manaus"), 4, "a que saiu é pedida de novo");

  const s = segurados();
  const n = await abrirFalsas("recife", { imagemRecife: s.imagemRecife });
  s.soltar("recife"); await decodificar(n);
  for (const id of IDS.slice(1)) { ir(n, id); await espera(); }
  ir(n, "recife");
  for (const id of IDS.slice(1)) { s.soltar(id); await decodificar(n); }
  n.M.ir("brasil"); n.rodar(); ir(n, "recife");
  assert.equal(texto(n), "Cena de recife", "a da tela não sai, mesmo sendo a mais antiga");
  assert.equal(pedidos(n, "recife"), 2);
  ir(n, "manaus"); await espera();
  assert.equal(pedidos(n, "manaus"), 4, "saiu a mais antiga das outras");
}

// os textos vêm dos dados, e as luzes da cena acendem à noite
async function textosELuzes() {
  const dados = { ...falsa("manaus"), luzes: [[100, 120, 7, 0.5]] };
  for (const escuro of [0, 1]) {
    const m = await abrirFalsas("manaus", { escuro, jsonCena: () => json(dados) });
    await decodificar(m);
    const c = m.M.niveis.cidade;
    assert.equal(c.rotulo(), "Cena de manaus. Vida de manaus, com a portaria do escritório no prédio de manaus");
    assert.equal(c.alvos()[0].rotulo, "Portaria no prédio de manaus, o escritório em Manaus: descer ao bairro");
    assert.match(m.elementos["mundo-estado"].textContent, /A portaria do escritório fica no prédio de manaus\. Selecione-a/);
    m.contexto.gravar = []; m.rodar();
    assert.equal(m.contexto.gravar.some(r => r.join() === "93,113,14,14"), escuro === 1, "a luz da cena, só à noite");
    assert.deepEqual(m.contexto.erros || [], []);
  }
}

// (e) o que não confere deixa a planta de reserva, sem erro no console, e a reentrada tenta de novo
async function reserva() {
  const bytes = JSON.stringify(falsa("recife"));
  const sri = "sha256-" + createHash("sha256").update(bytes).digest("base64");
  // como o navegador: o fetch rejeita o corpo que não confere com o integrity pedido
  const conferido = (_, opcoes) => {
    if (opcoes.integrity !== sri) throw new TypeError("integrity");
    return json(JSON.parse(bytes));
  };
  const casos = {
    "JSON 404": { jsonCena: () => ({ ok: false }) },
    "PNG 404": { imagemRecife: () => ({ ok: false }) },
    "JSON quebrado": { jsonCena: () => ({ ok: true, json: async () => JSON.parse("{") }) },
    "JSON fora do esquema": { jsonCena: () => json({ ...falsa("recife"), versao: 2 }) },
    "SRI do JSON errado": { jsonCena: conferido },
    "PNG fora do tamanho do JSON": { tamanho: [640, 440] },
  };
  for (const [nome, { tamanho = [], ...falha }] of Object.entries(casos)) {
    let falhar = true;
    const cenas = copia(FALSAS);
    const m = await abrirFalsas("recife", {
      cenas,
      jsonCena: (id, op) => (falhar && falha.jsonCena ? falha.jsonCena(id, op) : json(falsa(id))),
      imagemRecife: (op, id) => (falhar && falha.imagemRecife ? falha.imagemRecife(op, id) : png(id)),
    });
    await decodificar(m, ...(tamanho));
    assert.equal(texto(m), undefined, nome);
    assert.ok(m.M.niveis.cidade.planta.malha, nome + ": a planta procedural segue");
    assert.deepEqual(m.contexto.erros || [], [], nome);
    falhar = false;
    m.M.ir("brasil"); m.rodar(); ir(m, "recife"); await decodificar(m);
    assert.equal(texto(m), "Cena de recife", nome + ": a nova tentativa mostra a cena");
    assert.equal(pedidos(m, "recife"), 4, nome);
  }
}

(async () => {
  equivalencia(); esquema(); invalidas();
  for (const id of Object.keys(MANIFESTO)) await doManifesto(id);
  for (const caso of [preguicosa, corrida, guardadas, textosELuzes, reserva]) await caso();
  console.log(`Cenas: ${Object.keys(MANIFESTO).length} do manifesto, carga, corrida, guardadas, textos e reserva verificadas.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
