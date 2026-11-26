"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const pincel = new Proxy({}, { get: (_, k) => k === "measureText" ? () => ({ width: 40 }) : () => {} });
const c = {
  console, URLSearchParams, location: { search: "" },
  document: { addEventListener() {}, documentElement: {}, createElement: () => ({ getContext: () => pincel }) },
  matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => "" }),
};
c.window = c;
vm.createContext(c);
for (const n of ["mapa", "vida"]) vm.runInContext(fs.readFileSync("static/" + n + ".js", "utf8"), c);
const atlas = { img: {}, json: JSON.parse(fs.readFileSync("static/tema/atlas.json", "utf8")) };
const montar = planta => c.Mapa.montarPredio(atlas, {}, [], planta);

for (const planta of [null, { salas: {}, moveis: {}, novos: [{ nome: "planta", sala: "cozinha", x: 60, y: 69, e: true }] }]) {
  const p = montar(planta), s = p.baixo.find(s => s.tipo === "cozinha");
  const ala = p.objetos.find(o => o.nome === "bancada" && o.retorno);
  assert.ok(ala && ala.h >= 35, "a bancada tem um braço legível no chão");
  assert.equal(p.livre(ala.x + ala.w / 2, ala.chave - 3), false, "o retorno é sólido");
  assert.equal(p.portas.find(q => q.sala === s).tipo, "vaivem");
  assert.ok(p.janelas.some(j => j.cozinha));
  if (planta) assert.equal(p.planta.aplicados, 1, "a planta antiga ainda é aplicada");
  const geladeira = p.objetos.find(o => /^geladeira2?$/.test(o.nome));
  const x = geladeira.x + geladeira.w / 2, y = geladeira.chave + 16;
  assert.ok(p.livre(x, y), "chão livre junto à geladeira");
  const mundo = c.Vida.criarMundo({ ...p, vagas: [...p.vagas, { sala: s, tipo: "cozinha", x, y }] });
  const caminhos = mundo.vagas.filter(v => v.sala === s && v.tipo === "cozinha");
  assert.equal(caminhos.length, 2);
  assert.ok(caminhos.every(v => !v.fechada), "a porta dá acesso ao fogão e à geladeira pela grade da Vida");
}

const antiga = { salas: {}, moveis: {}, novos: [{ nome: "planta", sala: "cozinha", x: 113, y: 40, e: true }] };
const p = montar(antiga);
assert.equal(p.planta.aplicados, 1, "um enfeite gravado na área nova do retorno continua válido");
assert.ok(!p.objetos.some(o => o.retorno), "o braço da bancada cede espaço ao enfeite");
const enfeite = p.objetos.find(o => o.id === "novo:0");
assert.equal(enfeite.pos.x, 113);
assert.equal(enfeite.espelho, true);
console.log("test_cozinha_bancada.js: ok");
