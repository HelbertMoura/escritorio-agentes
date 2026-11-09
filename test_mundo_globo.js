"use strict";
// Globo de abertura: a projeção ortográfica (centro, lado oculto e o caminho de volta do clique) e o ponto subsolar,
// que decide onde é noite. Carrega static/mundo_globo.js numa VM, sem navegador.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {}, location: { search: "" }, Math, Date, URLSearchParams };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync("static/mundo_globo.js", "utf8"), contexto, { filename: "static/mundo_globo.js" });
const Globo = contexto.window.Globo;
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} (esperado ${b} ± ${tol})`);

// o centro da vista cai no meio do buffer de 160x160 e é visível
const c = Globo.projetar(-15, -50, -50, -15, 72);
perto(c.x, 80, 1e-9, "x do centro"); perto(c.y, 80, 1e-9, "y do centro");
assert.equal(c.visivel, true);
// o antípoda e um ponto bem atrás ficam do lado oculto; um ponto ao norte sobe na tela, um a leste vai para a direita
assert.equal(Globo.projetar(15, 130, -50, -15, 72).visivel, false, "antípoda");
assert.equal(Globo.projetar(10, 120, -50, -15, 72).visivel, false, "lado oposto");
assert.ok(Globo.projetar(0, -50, -50, -15, 72).y < 80, "o norte fica em cima");
assert.ok(Globo.projetar(-15, -40, -50, -15, 72).x > 80, "o leste fica à direita");
// na borda: 90° do centro sobre o equador da vista dá o raio inteiro
perto(Globo.projetar(0, 40, -50, 0, 72).x, 152, 1e-9, "borda leste");

// o clique volta ao lugar: ponto(x, y) desfaz projetar(lat, lon) dentro do disco, e fora dele dá null
for (const [lat, lon] of [[-15, -50], [-23.5, -46.6], [-3.1, -60], [10, -20], [-40, -70]]) {
  const p = Globo.projetar(lat, lon, -50, -15, 72), q = Globo.ponto(p.x, p.y, -50, -15, 72);
  perto(q.lat, lat, 1e-6, "lat de volta"); perto(q.lon, lon, 1e-6, "lon de volta");
}
assert.equal(Globo.ponto(2, 2, -50, -15, 72), null, "o canto do buffer é espaço");

// o sol: no solstício de junho ao meio-dia UTC fica sobre Greenwich no trópico de Câncer; no de dezembro às 18h, a 90° O
const jun = Globo.terminador(new Date(Date.UTC(2026, 5, 21, 12, 0)));
perto(jun.latSol, 23.4, 0.5, "latSol em 21/06"); perto(jun.lonSol, 0, 2, "lonSol em 21/06 12:00 UTC");
const dez = Globo.terminador(new Date(Date.UTC(2026, 11, 21, 18, 0)));
perto(dez.latSol, -23.4, 0.5, "latSol em 21/12"); perto(dez.lonSol, -90, 2, "lonSol em 21/12 18:00 UTC");
// equinócio: o sol no equador; a longitude fica sempre entre -180 e 180
const mar = Globo.terminador(new Date(Date.UTC(2026, 2, 20, 6, 0)));
perto(mar.latSol, 0, 0.6, "latSol no equinócio"); perto(mar.lonSol, 90, 4, "lonSol no equinócio às 06:00 UTC");
const meia = Globo.terminador(new Date(Date.UTC(2026, 0, 3, 0, 5)));
assert.ok(meia.lonSol >= -180 && meia.lonSol <= 180, "lonSol normalizada: " + meia.lonSol);
console.log("test_mundo_globo: ok");
