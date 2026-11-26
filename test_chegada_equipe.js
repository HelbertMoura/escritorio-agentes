"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let agora = 1000, hora = 6.99;
const acenos = [];
const pincel = new Proxy({}, { get: (_, k) => k === "measureText" ? () => ({ width: 40 }) : () => {} });
const c = {
  URLSearchParams, location: { search: "" }, console, performance: { now: () => agora * 1000 },
  document: { hidden: false, addEventListener() {}, documentElement: {}, createElement: () => ({ getContext: () => pincel }) },
  matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => "" }),
  Ceu: { agora: () => ({ h: hora, escuro: 0 }) },
  Zeladoria: { passo() {}, chegada: (_, x) => acenos.push(x) },
};
c.window = c;
vm.createContext(c);
for (const n of ["mapa", "vida"]) vm.runInContext(fs.readFileSync("static/" + n + ".js", "utf8"), c);
vm.runInContext("Math.random = () => 0", c);
const { Mapa, Vida } = c;
const atlas = { img: {}, json: JSON.parse(fs.readFileSync("static/tema/atlas.json", "utf8")) };
const predio = Mapa.montarPredio(atlas, {}, [{ nome: "Dev", tipo: "mesas", handles: ["a", "b"] }], null);
function montar() {
  const m = Vida.criarMundo(predio), mesa = predio.salas.find(s => s.nome === "Dev").mesas[0];
  Vida.sincronizar(m, [{ id: "a", handle: "a" }, { id: "b", handle: "b" }], [{ agente_id: "b", status: "working" }],
    new Map([["b", mesa]]), () => ({}), true);
  return m;
}
function quadro(m, habilitada = true, salto = 0.1) {
  agora += salto;
  Vida.passo(m, 0.1, habilitada);
}
const m = montar(), a = m.bonecos.get("a"), b = m.bonecos.get("b");
quadro(m);
hora = 7;
quadro(m);
assert.ok(a.entradaEquipe && a.rota.length, "a abertura acompanha quem realmente vem da rua");
assert.equal(b.lugar.tipo, "mesa", "quem já trabalha fica no lugar");
assert.equal(b.entradaEquipe, undefined);
const destino = a.destino;
for (let i = 0; i < 350 && !acenos.length && a.rota.length; i++) quadro(m);
assert.equal(acenos.length, 1, "um aceno na entrada");
assert.equal(a.destino, destino, "o aceno não troca o destino");
assert.match(a.fala, /Bom dia|Cheguei/);
for (let i = 0; i < 350 && a.rota.length; i++) quadro(m);
assert.equal(a.lugar, destino, "a ocupação começa ao chegar ao destino");
assert.ok(!a.entradaEquipe, "o destino volta a participar do cálculo normal");
assert.equal(m.eventos.some(e => ["campainha", "conversa"].includes(e.nome)), false);

const remontado = montar();
quadro(remontado);
assert.ok(!remontado.bonecos.get("a").entradaEquipe, "abrir ou trocar de andar no expediente não repete");
for (const [permitir, salto] of [[false, 0.1], [true, 60]]) {
  hora = 6.99;
  const outro = montar();
  quadro(outro, permitir);
  hora = 7;
  quadro(outro, true, salto);
  assert.ok(!outro.bonecos.get("a").entradaEquipe, "aba oculta ou pausa não recupera a abertura");
}
hora = 6.99;
const cancelado = montar();
quadro(cancelado);
hora = 7;
quadro(cancelado);
quadro(cancelado, false);
assert.ok(!cancelado.bonecos.get("a").entradaEquipe, "modo de visualização cancela a cena em curso");
hora = 6.99;
const expirado = montar();
quadro(expirado);
hora = 7;
quadro(expirado);
assert.ok(expirado.chegadaAte > agora);
for (let i = 0; i < 360; i++) quadro(expirado);
assert.equal(expirado.chegadaAte, 0, "a cena termina mesmo com o turno aberto");
console.log("test_chegada_equipe.js: ok");
