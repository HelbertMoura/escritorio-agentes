"use strict";
// Mundo em cena cheia (mundo.js: Camera com opcoes.inteira): a cidade e o bairro sempre em escala inteira, sem tarja.
// "cobrir" (cidade): em retrato (celular), a menor escala inteira que cobre a tela toda; em paisagem, a cidade inteira. "ceu" (bairro): uns 85% da altura em escala inteira,
// pelo menos a largura toda, e a caixa esticada para cima até o topo da tela (o céu que o nível pinta).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {}, document: { getElementById: () => null }, location: { search: "", hash: "", pathname: "/mundo.html" },
  URLSearchParams, performance, console };
vm.runInNewContext(fs.readFileSync("static/mundo.js", "utf8") + "\n;globalThis.__Mundo = Mundo;", contexto);
const { Camera } = contexto.__Mundo;

// telas de celular a ultrawide, em vários dpr (o W e o H da câmera são pixels do canvas)
const TELAS = [[390, 590], [360, 540], [430, 650], [768, 700], [1100, 900], [1366, 768], [1440, 900], [2560, 1080]];
for (const dpr of [1, 1.5, 2, 3]) for (const [w, h] of TELAS) {
  const W = Math.round(w * dpr), H = Math.round(h * dpr);

  const cidade = Camera([0, 0, 480, 270], { inteira: "cobrir" }).tamanho(W, H, dpr);
  if (H > W) {   // retrato (celular): cena cheia em escala inteira
    assert.ok(Number.isInteger(cidade.base), `cidade ${w}x${h}@${dpr}: escala ${cidade.base} não é inteira`);
    assert.ok(480 * cidade.base >= W && 270 * cidade.base >= H, `cidade ${w}x${h}@${dpr}: sobra tarja`);
    assert.ok(480 * (cidade.base - 1) < W || 270 * (cidade.base - 1) < H, `cidade ${w}x${h}@${dpr}: escala maior que o preciso`);
  } else assert.equal(cidade.base, Math.min(W / 480, H / 270), `cidade ${w}x${h}@${dpr}: em paisagem, a cidade inteira a 1x`);

  const bairro = Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(W, H, dpr);
  assert.ok(Number.isInteger(bairro.base), `bairro ${w}x${h}@${dpr}: escala ${bairro.base} não é inteira`);
  assert.ok(320 * bairro.base >= W, `bairro ${w}x${h}@${dpr}: tarja dos lados`);
  bairro.y = 999; bairro.limitar();   // como o nível entra: o chão encostado embaixo
  const [, oy] = bairro.origem();
  assert.ok(oy + 180 * bairro.P >= H - 1, `bairro ${w}x${h}@${dpr}: tarja embaixo`);
  assert.ok(bairro.caixa[1] === 0 && bairro.mundo(0, 0)[1] >= Math.min(0, 180 - H / bairro.base) - 1e-6, `bairro ${w}x${h}@${dpr}: o topo da tela fica fora da caixa`);
  bairro.zoomPara(2); bairro.passo(1, true);
  assert.ok(Number.isInteger(bairro.P), `bairro ${w}x${h}@${dpr}: o zoom saiu do pixel inteiro (${bairro.P})`);
}
// as escalas do plano: 4x no computador e 3x no celular (dpr 1)
assert.equal(Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(1100, 900, 1).base, 4);
assert.equal(Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(390, 590, 1).base, 3);
// sem a opção, a câmera continua como antes (a 1x a caixa cabe inteira, em escala fracionária)
assert.equal(Camera([0, 0, 320, 180]).tamanho(1100, 900, 1).base, 1100 / 320);
console.log("test_mundo_cena_cheia.js: ok");
