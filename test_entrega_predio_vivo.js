"use strict";
// Entrega do prédio vivo (static/vida.js): o pedido da greve atendida chega em duas etapas — balcão da recepção e
// depois a sala comunal. O entregador não pode "entregar" no balcão: só quando termina a segunda rota, no destino.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let agora = 1000;   // segundos, como o performance.now() / 1000 da vida.js
const FONTE = fs.readFileSync("static/vida.js", "utf8");
const contexto = {
  URLSearchParams: class { get() { return null; } }, location: { search: "" },
  window: { matchMedia: () => ({ matches: false }) }, performance: { now: () => agora * 1000 },
  document: { hidden: false, addEventListener() {} }, Ceu: { agora: () => ({ h: 10, escuro: 0 }) },
  Andar: { com: rota => rota }, fetch: () => Promise.reject(new Error("sem rede no teste")), console,
};
contexto.window.Ceu = contexto.Ceu; contexto.window.document = contexto.document; contexto.window.performance = contexto.performance;
vm.runInNewContext(FONTE, contexto);
const Vida = contexto.window.Vida;

// prédio mínimo com as duas salas da entrega: a recepção (com o balcão) e a sala comunal
const recepcao = { tipo: "recepcao", chave: "recepcao", nome: "Recepção", px: 20, py: 20, pw: 120, ph: 60, chao: 40, porta: { x: 80, y: 80 } };
const lounge = { tipo: "lounge", chave: "lounge", nome: "Sala comunal", px: 220, py: 20, pw: 160, ph: 100, chao: 40, portas: [300] };
const predio = { salas: [recepcao], baixo: [lounge], lounge, vagas: [], objetos: [], entrada: { x: 10, calcadaY: 200 }, corredorY: 12, corredorTopo: 0, corredorAlt: 20,
  corredores: [{ topo: 0, alt: 20, y: 12, lig: [] }], livre: () => true, ringue: null };
const mundo = Vida.criarMundo(predio);

Vida.social(mundo, { agora: new Date(agora * 1000).toISOString(), serio: false, cena: null,
  eventos: [{ id: "e1", tipo: "atendida", motivo: 3, participantes: [], em: new Date(agora * 1000).toISOString() }] });

const e = mundo.entrega;
assert.ok(e, "a entrega nasceu do evento atendida");
assert.equal(e.etapa, "balcao", "primeira etapa: balcão da recepção");
assert.equal(e.parada.sala.tipo, "recepcao", "a parada inicial é a recepção");
assert.equal(e.ponto.sala.tipo, "lounge", "o destino real é a sala comunal");
assert.ok(e.entregador && e.entregador.rota.length > 0, "o entregador sai da rua até o balcão");

let viuDestino = false, viuSegundaRota = false, entregou = false;
for (let i = 0; i < 4000 && mundo.entrega; i++) {
  agora += 0.05; Vida.passo(mundo, 0.05);
  const q = mundo.entrega;
  if (!q) break;
  if (q.etapa === "destino") viuDestino = true;
  if (q.etapa === "destino" && q.entregador && q.entregador.parada === q.ponto && q.entregador.rota.length > 0) viuSegundaRota = true;
  if (q.fase === "entregue") {
    entregou = true;
    assert.ok(viuDestino, "passou pela primeira etapa");
    assert.ok(viuSegundaRota, "calculou a segunda rota antes de entregar");
    assert.equal(q.entregador.parada, q.ponto, "o entregador terminou no destino, não no balcão");
    assert.ok(Math.hypot(q.entregador.x - q.ponto.x, q.entregador.y - q.ponto.y) < 2, "os pés do entregador no ponto do pedido");
    break;
  }
}
assert.ok(entregou, "a entrega terminou");
console.log("test_entrega_predio_vivo.js: ok");

// caminho travado no balcão: o tempo limite limpa a rota antiga, põe o entregador na parada e só então inicia a segunda
// rota, depois da pausa; e a campainha toca uma vez só, no destino final
{
  const mundo2 = Vida.criarMundo(predio);
  Vida.social(mundo2, { agora: new Date(agora * 1000).toISOString(), serio: false, cena: null,
    eventos: [{ id: "e2", tipo: "atendida", motivo: 3, participantes: [], em: new Date(agora * 1000).toISOString() }] });
  const e = mundo2.entrega;
  assert.ok(e && e.etapa === "balcao", "a entrega recomeça no balcão");
  const pedido = e.pedido;
  e.entregador.rota = [[9999, 9999]];   // nunca alcança o balcão sozinho
  e.desde = agora - 41;                   // passou do tempo de chegada
  Vida.passo(mundo2, 0.05);
  assert.equal(e.etapa, "destino", "o tempo limite venceu a primeira etapa");
  assert.equal(e.entregador.rota.length, 0, "a rota antiga foi limpa");
  assert.ok(Math.hypot(e.entregador.x - e.parada.x, e.entregador.y - e.parada.y) < 2, "o entregador ficou na parada do balcão");
  assert.ok(e.esperaBalcao > agora, "há a pausa no balcão antes da segunda rota");

  let segunda = false;
  for (let i = 0; i < 4000 && mundo2.entrega && mundo2.entrega.fase !== "entregue"; i++) {
    agora += 0.05; Vida.passo(mundo2, 0.05);
    const q = mundo2.entrega; if (!q) break;
    if (q.entregador && q.entregador.parada === q.ponto && q.entregador.rota.length > 0) segunda = true;
  }
  assert.ok(segunda, "a segunda rota começou depois da pausa");
  assert.ok(mundo2.entrega && mundo2.entrega.fase === "entregue", "a entrega terminou no destino");
  assert.equal(mundo2.entrega.pedido, pedido, "o pedido é o da greve");
  assert.ok(Math.hypot(mundo2.entrega.entregador.x - e.ponto.x, mundo2.entrega.entregador.y - e.ponto.y) < 2, "os pés no destino");
  assert.equal(mundo2.eventos.filter(ev => ev.nome === "campainha").length, 1, "uma campainha por entrega");
}
console.log("test_entrega_predio_vivo.js: timeout ok");
