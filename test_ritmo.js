"use strict";
// Ritmo do desenho: 30 passos por segundo em foco, 10 sem foco, 15 no modo TV (?fps= de 10 a 60), o relógio comum
// das animações a cada 100 ms, e o desenho só sai quando algo mudou ou o relógio bateu; com o mapa fora de vista, nunca.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { URLSearchParams, window: {}, Math };
vm.runInNewContext(fs.readFileSync("static/ritmo.js", "utf8"), contexto);
const R = contexto.window.Ritmo;

// o teto de cada estado
assert.equal(R.fps({ tv: false, foco: true, pedido: null }), 30);
assert.equal(R.fps({ tv: false, foco: false, pedido: null }), 10);
assert.equal(R.fps({ tv: true, foco: true, pedido: null }), 15);
assert.equal(R.fps({ tv: true, foco: false, pedido: null }), 15);   // a TV não cai sem foco: o painel quase nunca tem foco
assert.equal(R.fps({ tv: true, foco: true, pedido: 24 }), 24);
assert.equal(R.fps({ tv: false, foco: true, pedido: 24 }), 30);     // ?fps= só vale no modo TV

// ?fps= do endereço: inteiro, preso entre 10 e 60; o resto é ignorado
assert.equal(R.fpsPedido("?tv=1&fps=20"), 20);
assert.equal(R.fpsPedido("?fps=5"), 10);
assert.equal(R.fpsPedido("?fps=99"), 60);
for (const ruim of ["", "?tv=1", "?fps=", "?fps=abc", "?fps=12.5", "?fps=-3", "?fps=120", "?fps=1e2"])
  assert.equal(R.fpsPedido(ruim), null, ruim);

// passos por segundo de verdade, com a tela a 60, 120 e 144 Hz (e um pouco de tremido no quadro)
function passosPorSegundo(hz, alvo, segundos = 10) {
  let ultimo = -Infinity, n = 0;
  for (let i = 0; i < hz * segundos; i++) {
    const t = i * 1000 / hz + (i % 3 - 1) * 0.3;
    if (R.ehPasso(t, ultimo, alvo)) { ultimo = t; n++; }
  }
  return n / segundos;
}
for (const hz of [60, 120, 144]) {
  for (const alvo of [10, 15, 30]) {
    const pps = passosPorSegundo(hz, alvo);
    assert.ok(pps <= alvo + 0.5, `${hz} Hz, alvo ${alvo}: ${pps} passos/s passou do teto`);
    assert.ok(pps >= alvo * 0.7, `${hz} Hz, alvo ${alvo}: ${pps} passos/s ficou baixo demais`);
  }
}
assert.equal(passosPorSegundo(60, 30), 30);   // 60 Hz: um quadro sim, outro não
assert.equal(passosPorSegundo(60, 60), 60);   // ?fps=60 numa tela de 60 Hz não perde quadro

// relógio comum: muda a cada 100 ms, e só então
assert.equal(R.RELOGIO, 100);
assert.equal(R.relogio(0), R.relogio(99.9));
assert.notEqual(R.relogio(99.9), R.relogio(100));
assert.equal(R.relogio(1234), 12);

// teto do passo de tempo: nunca abaixo de 0,1 s, e cobre o intervalo do passo mais lento
assert.equal(R.dtMax(30), 0.1);
assert.equal(R.dtMax(10), 0.15);
for (const alvo of [10, 15, 30, 60]) assert.ok(R.dtMax(alvo) >= 1 / alvo);

// quando desenhar
const parado = { oculto: false, sujo: false, movimento: false, camera: false, relogioAgora: 7, relogioDesenhado: 7 };
assert.equal(R.precisaDesenhar(parado), false);                                   // cena e câmera paradas: não redesenha
assert.equal(R.precisaDesenhar({ ...parado, relogioAgora: 8 }), true);              // o relógio bateu
assert.equal(R.precisaDesenhar({ ...parado, sujo: true }), true);
assert.equal(R.precisaDesenhar({ ...parado, movimento: true }), true);
assert.equal(R.precisaDesenhar({ ...parado, camera: true }), true);
assert.equal(R.precisaDesenhar({ ...parado, oculto: true, sujo: true, movimento: true, camera: true, relogioAgora: 9 }), false);

// numa cena parada, 1 s de passos a 30 por segundo dá só os 10 toques do relógio
{
  let desenhos = 0, rel = -1, ultimo = -Infinity;
  for (let i = 0; i < 60; i++) {
    const t = 1000 + i * 1000 / 60;
    if (!R.ehPasso(t, ultimo, 30)) continue;
    ultimo = t;
    if (R.precisaDesenhar({ ...parado, relogioAgora: R.relogio(t), relogioDesenhado: rel })) { desenhos++; rel = R.relogio(t); }
  }
  assert.equal(desenhos, 10);
}

console.log("test_ritmo.js ok");
