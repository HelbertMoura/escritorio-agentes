"use strict";
// Jornal do escritório (static/jornal.js): o cabeçalho da edição diz de qual andar ela é. A marca é do prédio, então
// sem o nome do andar a Gazeta de um andar extra sai com o mesmo cabeçalho da do térreo.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const codigo = fs.readFileSync("static/jornal.js", "utf8");
const SEMANA = { inicio: "2026-11-09", agentes: [], dias: [] };

// DOM mínimo: elementos com filhos e texto, e as três peças da tela do jornal
function elemento(tag) {
  const e = { tag, className: "", textContent: "", hidden: false, children: [], id: "" };
  e.append = (...f) => e.children.push(...f);
  e.replaceChildren = (...f) => { e.children = f; };
  e.setAttribute = () => {};
  return e;
}
const textos = e => [e.textContent, ...e.children.flatMap(textos)].filter(Boolean);

async function cabecalho(andar) {
  const pecas = { jornal: elemento("article"), "jornal-aviso": elemento("p"), "jornal-semanas": elemento("div") };
  const contexto = {
    window: {}, performance: { now: () => 0 }, JSON,
    document: { getElementById: id => pecas[id], querySelectorAll: () => [], createElement: elemento },
    Andar: { com: u => u },
    Vida: { FRASES: { jornal: { nome: "Gazeta do Escritório" } } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ v: 1, semana: SEMANA, anterior: SEMANA }) }),
  };
  vm.runInNewContext(codigo, contexto);
  const Jornal = contexto.window.Jornal;
  Jornal.iniciar({ demo: () => false, socialLigada: () => false, agente: () => null, empresa: () => "Minha empresa", andar: () => andar });
  await Jornal.abrir();
  const topo = pecas.jornal.children.find(c => c.className === "jn-topo");
  return textos(topo).find(t => t.startsWith("Minha empresa"));
}

(async () => {
  // térreo (e prédio sem andares extras): o cabeçalho de sempre
  assert.equal(await cabecalho(""), "Minha empresa");
  // andar extra: a edição leva o nome dele
  assert.equal(await cabecalho("Marketing"), "Minha empresa · Marketing");
  console.log("test_jornal.js ok");
})().catch(e => { console.error(e); process.exit(1); });
