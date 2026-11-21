"use strict";
// Os carros da rua (static/mapa.js e static/efeitos.js): a escala dos quatro no atlas, o assentamento dentro de cada
// faixa (as rodas no asfalto, o teto longe da calçada) e a folga entre dois veículos da mesma faixa, que nunca se
// cobrem — nem quando um deles volta para fora da tela. Prédio e efeitos falsos, no molde do test_mapa_equipe.js.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ATLAS = JSON.parse(fs.readFileSync("static/tema/atlas.json", "utf8"));
// a escala de cada veículo no atlas: uns dos outros e com a fachada (o hatch e o táxi na faixa de cima, a van e a
// moto na de baixo, que são mais altas)
const ESCALA = { carro1: [32, 14], carro2: [38, 14], carro3: [40, 19], carro4: [18, 18] };

function carregar() {
  const ctx = new Proxy({}, { get: (o, k) => (k === "measureText" ? t => ({ width: String(t).length * 4 }) : k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  const c = { console, getComputedStyle: () => ({ getPropertyValue: () => "" }), matchMedia: () => ({ matches: false }), document: { documentElement: {}, createElement: () => ({ getContext: () => ctx }) } };
  c.window = c;
  vm.runInNewContext(fs.readFileSync("static/mapa.js", "utf8") + "\n" + fs.readFileSync("static/efeitos.js", "utf8"), c);
  return c;
}

const c = carregar();
const predio = c.Mapa.montarPredio({ json: ATLAS, img: {} }, { empresa: "X" }, [], null);
const ext = predio.externos, ruaY = ext.ruaY, ruaAlt = ext.ruaAlt;

// ---------- o atlas: a escala dos quatro veículos
for (const [nome, [w, h]] of Object.entries(ESCALA)) {
  const s = ATLAS.sprites[nome];
  assert.ok(s, `o atlas tem ${nome}`);
  assert.deepEqual([s[2], s[3]], [w, h], `${nome}: ${w}x${h} no atlas`);
  const e = ATLAS.sprites[nome + "_esq"];
  assert.deepEqual([e[2], e[3]], [w, h], `${nome}_esq: o mesmo tamanho`);
}

// ---------- as faixas: os mais baixos na de cima (a do prédio), os mais altos na de baixo (a mais próxima)
const carros = ext.carros;
assert.equal(carros.length, 4, "os quatro veículos na rua");
const altura = car => ATLAS.sprites[car.nome][3];
const deCima = carros.filter(c => c.faixa === 1), deBaixo = carros.filter(c => c.faixa === 0);
assert.equal(deCima.length, 2, "dois na faixa de cima");
assert.equal(deBaixo.length, 2, "dois na faixa de baixo");
assert.ok(Math.max(...deCima.map(altura)) <= Math.min(...deBaixo.map(altura)), "a faixa de cima tem os mais baixos");
assert.equal(deCima.map(c => c.nome).sort().join(","), "carro1,carro2", "o hatch e o táxi na faixa de cima");
assert.equal(deBaixo.map(c => c.nome).sort().join(","), "carro3,carro4", "a van e a moto na faixa de baixo");

// ---------- o desenho: o que sai na tela (uma caixa por veículo, na ordem da lista)
const desenhados = [];
const ctxDesenho = { fillStyle: "", fillRect() {}, drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) { desenhados.push({ x: dx, y: dy, w: dw, h: dh }); } };
c.Efeitos.iniciar(predio, { json: ATLAS, img: {} }, { empresa: "X" }, null);
const rua = (dt, t) => { desenhados.length = 0; c.Efeitos.exterior(ctxDesenho, dt, t, { escuro: 0 }); return desenhados.slice(); };
// o desenho de cada veículo é a caixa da sua faixa: as rodas assentam no asfalto e o teto não sobe até a calçada
const assentado = (caixa, faixa) => {
  assert.ok(caixa.y >= ruaY, `o teto não invade a calçada (${caixa.y} < ${ruaY})`);
  assert.ok(caixa.y + caixa.h - 1 <= ruaY + ruaAlt - 1, "as rodas dentro do asfalto");
  if (faixa === 1) assert.ok(caixa.y + caixa.h - 1 < ruaY + ruaAlt / 2, "as rodas antes da divisória");
  else assert.ok(caixa.y + caixa.h - 1 >= ruaY + ruaAlt / 2, "as rodas depois da divisória");
};
// a folga entre dois veículos da mesma faixa: 120 px livres de caixa a caixa (de borda a borda)
const folga = (a, b) => { const [esq, dir] = a.x <= b.x ? [a, b] : [b, a]; return dir.x - (esq.x + esq.w); };
const confereFolga = (caixas, cars) => {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    if (cars[i].faixa !== cars[j].faixa) continue;
    const g = folga(caixas[i], caixas[j]);
    assert.ok(g >= 120, `${cars[i].nome} e ${cars[j].nome}: ${Math.round(g)} px de folga`);
  }
};

// o primeiro quadro: tudo no lugar
let caixas = rua(0.05, 0);
assert.equal(caixas.length, 4, "quatro veículos desenhados");
caixas.forEach((caixa, i) => assentado(caixa, carros[i].faixa));
confereFolga(caixas, carros);
for (let i = 0; i < carros.length; i++) assert.equal(caixas[i].w, ESCALA[carros[i].nome][0], `${carros[i].nome}: o tamanho do desenho`);
for (const car of carros) {
  assert.ok(car.farol, `${car.nome}: tem farol`);
  const naFrente = car.faixa ? car.farol.x <= car.x + 2 : car.farol.x >= car.x + ESCALA[car.nome][0] - 2;
  assert.ok(naFrente, `${car.nome}: o farol na frente`);
}

// dois minutos de rua: os carros saem da tela e voltam, e nunca se cobrem
for (let i = 1; i <= 2400; i++) {
  const agora = rua(0.05, i * 0.05);
  agora.forEach((caixa, j) => assentado(caixa, carros[j].faixa));
  confereFolga(agora, carros);
}

// ---------- a volta para fora da tela: o que sai volta longe do outro da mesma faixa, de qualquer jeito que o outro
// esteja na rua
for (const [i, car] of carros.entries()) {
  const outro = carros.find((o, j) => j !== i && o.faixa === car.faixa);
  for (let x = -200; x <= predio.W + 200; x += 23) {
    outro.x = x;
    car.x = car.faixa ? -200 : predio.W + 200;   // o que sai da tela pela ponta
    const agora = rua(0.05, 0);
    agora.forEach((caixa, j) => assentado(caixa, carros[j].faixa));
    confereFolga(agora, carros);
  }
}

console.log("test_mapa_carros.js: ok");
