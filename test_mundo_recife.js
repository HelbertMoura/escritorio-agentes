// Recife integral na página do Mundo: carga tardia, reserva e nova tentativa, saída rápida, foco, zoom e rotas no PNG.
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { abrir, carregar, espera, CLIMA } = require("./test_mundo_navegacao.js");

const CASA = { ...CLIMA, casa: "recife" };
const PNG = { ok: true, blob: async () => "blob:recife" };
const pedidos = m => m.requisicoes.filter(([url]) => url.startsWith("/mundo/cenas/recife.png")).length;
const ids = c => c.alvos().map(a => a.id).join();
const botoes = m => m.elementos["mundo-alvos"].filhos;

// o PNG segurado até soltar(); depois a imagem decodificada carrega no tamanho pedido
function segurado() {
  let soltar;
  const resposta = new Promise(r => (soltar = r));
  return { soltar, imagemRecife: () => resposta };
}
async function decodificar(m, w = 632, h = 424) {
  await espera();
  const img = (m.contexto.imagens || []).find(i => i.src === "blob:recife" && !i.naturalWidth);
  assert.ok(img, "a imagem do Recife foi criada com a resposta validada");
  img.naturalWidth = w; img.naturalHeight = h; img.carregar();
  await espera(); m.rodar(2);
}
// o atlas chega sem mexer na imagem do Recife
async function atlas(m) {
  await espera();
  for (const img of m.contexto.imagens || []) if (String(img.src).startsWith("/mundo/atlas.png")) img.carregar();
  m.rodar(2);
}
// os botões de teclado passam a ter foco como no navegador: focus() marca o ativo e remover o ativo dispara blur
function comFoco(m) {
  const criar = m.documento.createElement, lista = m.elementos["mundo-alvos"], trocar = lista.replaceChildren;
  m.documento.createElement = nome => {
    const e = criar(nome);
    e.focus = () => { m.documento.activeElement = e; e.disparar("focus"); };
    return e;
  };
  lista.replaceChildren = (...novos) => {
    const ativo = m.documento.activeElement;
    if (lista.filhos.includes(ativo)) { m.documento.activeElement = null; ativo.disparar("blur"); }
    trocar(...novos);
  };
}

async function reservaENovaTentativa() {
  let falhar = true;
  const m = await abrir("#cidade=recife", { clima: CASA, reduzido: true, imagemRecife: () => (falhar ? { ok: false } : PNG) });
  const c = m.M.niveis.cidade;
  assert.equal(c.planta.cena, undefined);
  assert.equal(pedidos(m), 1);
  await carregar(m);
  assert.equal(c.planta.cena, undefined, "falha de rede retém a planta");
  assert.ok(c.alvos().some(a => a.id === "porta"), "fallback com atlas tem porta");
  assert.equal(m.requisicoes.find(([u]) => u.startsWith("/mundo/cenas/recife.png"))[1].integrity,
    "sha256-" + createHash("sha256").update(readFileSync("static/mundo/cenas/recife.png")).digest("base64"), "integridade do PNG versionado");
  falhar = false;
  m.M.ir("brasil"); m.rodar(); m.M.ir("cidade", { cidade: "recife" }); m.rodar();
  assert.equal(pedidos(m), 2, "a reentrada tenta de novo");
  await decodificar(m);
  assert.ok(c.planta.cena, "a nova tentativa mostra a cena");
}

async function tamanhoErrado() {
  const m = await abrir("#cidade=recife", { clima: CASA, reduzido: true, imagemRecife: () => PNG });
  await decodificar(m, 640, 440);
  assert.equal(m.M.niveis.cidade.planta.cena, undefined, "imagem fora do tamanho nativo não entra");
}

async function cargaTardia() {
  const s = segurado();
  const m = await abrir("#cidade=recife", { clima: CASA, reduzido: true, imagemRecife: s.imagemRecife });
  comFoco(m);
  await atlas(m);
  const c = m.M.niveis.cidade;
  m.M.ir("brasil"); m.rodar(); m.M.ir("cidade", { cidade: "recife" }); m.rodar();
  assert.equal(pedidos(m), 1, "com o pedido no ar, não há outro");
  botoes(m)[0].focus();
  assert.equal(c.destaque, "porta");
  m.elementos["mundo-mais"].disparar("click");   // um degrau, abaixo do teto
  m.rodar(3);
  assert.ok(m.M.camera.z > 1 && m.M.camera.z < m.M.camera.maximo());
  s.soltar(PNG); await decodificar(m);
  assert.ok(c.planta.cena);
  assert.equal(ids(c), "porta,notavel-0");
  assert.equal(botoes(m).length, 2);
  assert.equal(m.documento.activeElement, botoes(m)[0], "o foco do teclado segue na portaria");
  assert.equal(c.destaque, "porta");
  const cam = m.M.camera;
  assert.ok(Math.abs(cam.P - Math.round(cam.P)) < 1e-6 || Math.abs(cam.z - cam.maximo()) < 1e-6,
    `zoom parado em pixel inteiro: P=${cam.P} z=${cam.z}`);
  assert.match(c.rotulo(), /Marco Zero.*portaria/);
  assert.match(m.elementos["mundo-estado"].textContent, /fachada azul/);

  // portaria → bairro → cidade: a cena volta pronta, sem outro pedido
  botoes(m)[0].disparar("click"); m.rodar();
  assert.equal(m.M.nivel, "bairro");
  m.tecla("Escape"); m.rodar();
  assert.ok(c.planta.cena);
  assert.equal(pedidos(m), 1);
}

async function saidaRapida() {
  const s = segurado();
  const m = await abrir("#cidade=recife", { clima: CASA, reduzido: true, imagemRecife: s.imagemRecife });
  await atlas(m);
  const c = m.M.niveis.cidade;
  m.M.ir("cidade", { cidade: "manaus" }); m.rodar();
  const antes = JSON.stringify(c.planta), alvos = ids(c);
  s.soltar(PNG); await decodificar(m);
  assert.equal(JSON.stringify(c.planta), antes, "o PNG que chega tarde não mexe em outra cidade");
  assert.equal(ids(c), alvos);
  m.M.ir("cidade", { cidade: "recife" }); m.rodar();
  assert.ok(c.planta.cena, "a reentrada já abre a cena");
  assert.equal(pedidos(m), 1);
}

// sem o atlas, a cena segue com porta, vida e festa; o movimento reduzido para carro e pedestre
async function semAtlasComFesta() {
  for (const reduzido of [false, true]) {
    for (const data of ["2026-02-16", "2026-06-24", "2026-10-31", "2026-12-25", "2026-12-31"]) {
      const m = await abrir("#cidade=recife", { clima: CASA, reduzido, escuro: 1, busca: "?data=" + data, passo: 100,
        imagemRecife: () => PNG });
      await decodificar(m);
      const c = m.M.niveis.cidade;
      assert.equal(ids(c), "porta,notavel-0");
      const antes = JSON.stringify([c.carros, c.pedestres]);
      m.rodar(20);
      assert.equal(JSON.stringify([c.carros, c.pedestres]) === antes, reduzido, `${data}: vida ${reduzido ? "parada" : "andando"}`);
      assert.ok(c.enfeites.chave, `${data}: a festa do dia`);
      assert.match(c.rotulo(), /a cidade está enfeitada/);
      const [x0, y0, x1, y1] = c.planta.praca.r;
      for (const s of c.enfeites.pecas) assert.ok(s[1] >= x0 && s[2] >= y0 && s[3] <= x1 && s[4] <= y1, `${data}: ${s[0]} na praça`);
      assert.deepEqual(m.contexto.erros || [], []);
    }
  }
}

(async () => {
  for (const caso of [reservaENovaTentativa, tamanhoErrado, cargaTardia, saidaRapida, semAtlasComFesta]) await caso();
})().catch(e => { console.error(e); process.exitCode = 1; });
