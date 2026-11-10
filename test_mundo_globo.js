"use strict";
// Globo de abertura: a projeção ortográfica (centro, lado oculto e o caminho de volta do clique), o ponto subsolar, que
// decide onde é noite, e o nível desenhado numa VM sem navegador: o campo de nuvens montado uma vez só, as luzes das
// cidades só do lado da noite e o movimento reduzido sem cintilação nem estrela cadente.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const MUNDO = JSON.parse(fs.readFileSync("static/mundo/mundo.json", "utf8"));
const TERRA = [90, 138, 60];   // a textura de teste: terra verde no mundo todo (G > B: terra, não água)

// a VM: canvas falsos (createImageData de verdade; putImageData guarda a última imagem do globo; getImageData devolve a
// textura de teste), imagens que carregam quando o teste pede e o contexto principal, que grava o que se desenha
function abrir(busca, reduzido) {
  const ctx2d = () => new Proxy({}, { get: (o, k) => k === "createImageData"
    ? (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
    : k === "putImageData" ? img => { contexto.imagem = img; }
    : k === "getImageData" ? (x, y, w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) d.set([...TERRA, 255], i * 4);
      return { data: d };
    }
    : k in o ? o[k] : () => {}, set: (o, k, v) => { o[k] = v; return true; } });
  const contexto = {
    window: {}, location: { search: busca }, Math, Date, URLSearchParams, performance: { now: () => 0 },
    document: { createElement: () => ({ getContext: ctx2d }), getElementById: () => null },
    Image: class { constructor() { (contexto.imagens ||= []).push(this); this.ouvintes = {}; }
      addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); } carregar() { for (const f of this.ouvintes.load || []) f(); } },
  };
  vm.createContext(contexto);
  for (const f of ["static/mundo_globo.js", "static/mundo.js"]) vm.runInContext(fs.readFileSync(f, "utf8"), contexto, { filename: f });
  const { Globo, Mundo } = contexto.window;
  const nivel = () => {
    const n = Globo.criar({ dados: JSON.parse(JSON.stringify(MUNDO)), Camera: Mundo.Camera, reduzido });
    n.camera.tamanho(940, 800, 1); n.entrar({});
    return n;
  };
  // o contexto principal: cada quadro vira uma lista de operações (estilo, alfa, transformação e argumentos)
  const gravado = [], principal = new Proxy({}, { get: (o, k) => typeof k === "string" && /^(fillRect|drawImage|setTransform)$/.test(k)
    ? (...a) => gravado.push([k, o.fillStyle, o.globalAlpha, ...a.filter(x => typeof x === "number")].join())
    : k in o ? o[k] : () => {}, set: (o, k, v) => { o[k] = v; return true; } });
  let relogio = 0;
  const rodar = (n, quadros = 1) => {
    const lista = [];
    for (let i = 0; i < quadros; i++) { gravado.length = 0; relogio += 16; n.quadro(principal, 0.016, relogio); lista.push(gravado.join(";")); }
    return lista;
  };
  return { contexto, Globo, nivel, rodar };
}

const { Globo } = abrir("", false), C = Globo.B / 2, R = Globo.R;
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} (esperado ${b} ± ${tol})`);

// o centro da vista cai no meio do buffer e é visível
const c = Globo.projetar(-15, -50, -50, -15, R);
perto(c.x, C, 1e-9, "x do centro"); perto(c.y, C, 1e-9, "y do centro");
assert.equal(c.visivel, true);
// o antípoda e um ponto bem atrás ficam do lado oculto; um ponto ao norte sobe na tela, um a leste vai para a direita
assert.equal(Globo.projetar(15, 130, -50, -15, R).visivel, false, "antípoda");
assert.equal(Globo.projetar(10, 120, -50, -15, R).visivel, false, "lado oposto");
assert.ok(Globo.projetar(0, -50, -50, -15, R).y < C, "o norte fica em cima");
assert.ok(Globo.projetar(-15, -40, -50, -15, R).x > C, "o leste fica à direita");
// na borda: 90° do centro sobre o equador da vista dá o raio inteiro
perto(Globo.projetar(0, 40, -50, 0, R).x, C + R, 1e-9, "borda leste");

// o clique volta ao lugar: ponto(x, y) desfaz projetar(lat, lon) dentro do disco, e fora dele dá null
for (const [lat, lon] of [[-15, -50], [-23.5, -46.6], [-3.1, -60], [10, -20], [-40, -70]]) {
  const p = Globo.projetar(lat, lon, -50, -15, R), q = Globo.ponto(p.x, p.y, -50, -15, R);
  perto(q.lat, lat, 1e-6, "lat de volta"); perto(q.lon, lon, 1e-6, "lon de volta");
}
assert.equal(Globo.ponto(2, 2, -50, -15, R), null, "o canto do buffer é espaço");

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

// o campo de nuvens sai só quando o globo desenha, e uma vez só: a segunda abertura (e a volta ao globo) usa o mesmo
const v = abrir("", false), g1 = v.nivel();
assert.equal(v.Globo.montagens, 0, "criar o globo não monta as nuvens");
v.rodar(g1, 2);
const campo = v.Globo.nuvens();
const g2 = v.nivel();
v.rodar(g2, 2); g1.sair(); g1.entrar({ nivel: "brasil" }); v.rodar(g1, 2);
assert.equal(v.Globo.montagens, 1, "uma montagem só");
assert.equal(v.Globo.nuvens(), campo, "o mesmo campo nas duas aberturas");
assert.ok(campo.A.length === 720 * 360 && campo.B.length === 720 * 360, "duas camadas de 0,5°");

// as luzes das cidades: às 22h de Brasília, com a textura de terra carregada, várias acesas e todas do lado da noite;
// ao meio-dia, com o Brasil de frente, nenhuma luz no lado do dia
const quente = (d, q) => d[q] >= 235 && d[q + 1] >= 170 && d[q + 2] <= 150 && d[q + 3] === 255;   // o miolo da luz
function luzes(hora) {
  const m = abrir("?hora=" + hora, true), n = m.nivel();
  for (const img of m.contexto.imagens) img.carregar();
  m.rodar(n, 2);
  const hoje = new Date(Date.now() - 3 * 3600000);
  const sol = m.Globo.terminador(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) + (hora + 3) * 3600000));
  const { lon, lat } = n.rotacao, d = m.contexto.imagem.data, B = m.Globo.B, RAD = Math.PI / 180, acesas = [];
  for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
    const p = m.Globo.ponto(x + 0.5, y + 0.5, lon, lat, m.Globo.R);
    if (!p || !quente(d, (y * B + x) * 4)) continue;
    const f = p.lat * RAD, fs = sol.latSol * RAD;
    acesas.push(Math.sin(f) * Math.sin(fs) + Math.cos(f) * Math.cos(fs) * Math.cos((p.lon - sol.lonSol) * RAD));
  }
  return acesas;
}
const noite = luzes(22);
assert.ok(noite.length >= 40, "luzes acesas às 22h: " + noite.length);
assert.ok(noite.every(s => s < 0.08), "uma luz no lado do dia: " + Math.max(...noite));
const dia = luzes(12);
assert.ok(dia.every(s => s < 0.08), "ao meio-dia, luz no lado do dia: " + Math.max(...dia));
assert.ok(dia.length < noite.length / 3, `ao meio-dia quase nada aceso: ${dia.length}`);

// movimento reduzido: depois do primeiro quadro, todos iguais (nada cintila, nada passa); sem ele, as estrelas cintilam
// e uma estrela cadente cruza o céu em menos de um minuto
const r = abrir("", true), nr = r.nivel(), qr = r.rodar(nr, 3000);
assert.ok(qr.slice(1).every(q => q === qr[1]), "reduzido: um quadro diferente do outro");
assert.ok(!qr.some(q => q.includes(Globo.CADENTE)), "reduzido: estrela cadente");
const s = abrir("", false), ns = s.nivel(), qs = s.rodar(ns, 200);
assert.ok(new Set(qs.slice(1).map(q => q.split(";").filter(o => o.startsWith("fillRect")).join(";"))).size > 50, "as estrelas cintilam");
let cadente = qs.some(q => q.includes(Globo.CADENTE));
for (let i = 200; i < 3600 && !cadente; i++) cadente = s.rodar(ns)[0].includes(Globo.CADENTE);
assert.ok(cadente, "nenhuma estrela cadente em 58 s");
console.log("test_mundo_globo: ok");
