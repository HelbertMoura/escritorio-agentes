"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// largura: a largura do mapa na tela (clientWidth do canvas, em px CSS); sem ela, o teste é o do layout antigo
async function rodar(largura) {
  const ids = ["estado", "mensagens", "mensagens-vazio", "caracteres-restantes", "formulario", "texto", "sair", "cena", "mapa-estado", "ver-sala", "ver-escritorio"];
  const transforms = [], requisicoes = [], retangulos = [], preenchimentos = [], textos = [], recortes = [];
  const ctx = { clearRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, clip() { recortes.push(true); },
    fillRect() {}, measureText: t => ({ width: t.length * 5 }),
    rect(...v) { retangulos.push(v); }, fill(regra) { preenchimentos.push(regra); }, fillText(texto, x, y) { textos.push([texto, x, y, ctx.font]); },
    setTransform(...v) { transforms.push(v); } };
  const elementos = Object.fromEntries(ids.map(id => [id, {
    disabled: true, textContent: "", value: "", width: 640, height: 360, clientWidth: id === "cena" ? largura : undefined,
    addEventListener() {}, replaceChildren() {}, getContext() { return ctx; },
    querySelector() { return { disabled: true }; }
  }]));
  const contexto = {
    document: { getElementById: id => elementos[id] }, location: { hash: "", pathname: "/visita.html" },
    history: { replaceState() {} }, window: { addEventListener() {} }, navigator: {}, Blob,
    Image: class { set src(_) { queueMicrotask(() => this.onload()); } },
    setTimeout() {}, clearTimeout() {},
    Mapa: { montarPredio(_, config, grupos) {
      assert.deepEqual(grupos, []);
      return { W: 640, H: 360, fundo: {}, objetos: [],
        baixo: [{ chave: "reuniao", px: 20, py: 200, pw: 200, ph: 100 }],
        salas: [{ chave: "recepcao", px: 20, py: 20, pw: 200, ph: 100 }, { chave: "lounge", px: 300, py: 20, pw: 100, ph: 100 }] };
    } },
    fetch: async (url, opcoes) => {
      requisicoes.push([url, opcoes]);
      if (url.endsWith("/recepcao")) return { ok: true, json: async () => ({ grupos: [], planta: { rev: 0 } }) };
      if (url.endsWith("atlas.json")) return { ok: true, json: async () => ({ sprites: {} }) };
      throw new Error("Rota privada acessada sem convite: " + url);
    }
  };
  vm.runInNewContext(fs.readFileSync("static/visita.js", "utf8"), contexto);
  await new Promise(resolve => setImmediate(resolve));
  return { elementos, requisicoes, transforms, retangulos, preenchimentos, textos, recortes };
}

async function principal() {
  const { elementos, requisicoes, transforms, retangulos, preenchimentos, textos, recortes } = await rodar(640);
  const recepcao = requisicoes.find(([url]) => url.endsWith("/recepcao"));
  assert.equal(recepcao[1].credentials, "omit");
  assert.deepEqual(JSON.parse(recepcao[1].body), {});
  assert.equal(elementos["ver-sala"].disabled, true);
  assert.match(elementos["mapa-estado"].textContent, /Recepção pública/);
  assert.match(elementos["mapa-estado"].textContent, /apagadas exigem convite/);
  // prédio inteiro em escala inteira (640 px de mundo, 2x), com o canvas no formato dele, sem recorte; tudo fora da
  // recepção fica coberto
  assert.deepEqual(transforms[0], [2, 0, 0, 2, 0, 0]);
  assert.equal(elementos.cena.width, 1280); assert.equal(elementos.cena.height, 720);
  assert.deepEqual(recortes, []);
  assert.deepEqual(retangulos, [[0, 0, 640, 360], [20, 20, 200, 100]]);
  assert.deepEqual(preenchimentos, ["evenodd"]);
  // a placa "COM CONVITE" no meio de cada sala apagada (lounge e reunião), com o texto dentro da sala
  assert.deepEqual(textos.map(t => t[0]), ["COM CONVITE", "COM CONVITE"]);
  for (const [[, x, y], s] of textos.map((t, i) => [t, i ? { px: 20, py: 200, pw: 200, ph: 100 } : { px: 300, py: 20, pw: 100, ph: 100 }]))
    assert.ok(x > s.px && x < s.px + s.pw && Math.abs(y - (s.py + s.ph / 2)) <= 1, `placa fora da sala (${x}, ${y})`);
  assert.deepEqual(requisicoes.map(([url]) => url).sort(), ["/api/visitas/recepcao", "/tema/atlas.json"].sort());
  // no computador (mapa de 640 px), a placa já sai com 12 px na tela
  for (const t of textos) assert.ok(parseFloat(t[3]) * 2 * 640 / 1280 >= 12, `placa pequena no computador: ${t[3]}`);

  // celular: o mapa com 300 px CSS, menos da metade do prédio. O quadro fecha na recepção (600 px do mundo, encostado na
  // borda esquerda, pois a recepção fica em 20..220), e as placas saem com 12 px ou mais de tela, dentro do quadro
  const cel = await rodar(300);
  assert.deepEqual(cel.transforms[0], [2, 0, 0, 2, 0, 0]);
  assert.equal(cel.elementos.cena.width, 1200); assert.equal(cel.elementos.cena.height, 720);
  assert.equal(cel.textos.length, 2);
  for (const t of cel.textos) {
    assert.ok(t[1] > 0 && t[1] < 600, `placa fora do quadro (${t[1]})`);
    const naTela = parseFloat(t[3]) * 2 * 300 / cel.elementos.cena.width;
    assert.ok(naTela >= 12, `placa "COM CONVITE" com ${naTela.toFixed(1)} px na tela do celular`);
  }
}
principal().catch(e => { console.error(e); process.exitCode = 1; });
