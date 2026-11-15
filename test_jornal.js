"use strict";
// Jornal (static/jornal.js): o nome embaixo do título. Num andar extra é o nome do andar; no principal, a empresa.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {} };   // sem document: só a parte pura carrega
vm.runInNewContext(fs.readFileSync("static/jornal.js", "utf8"), contexto);
const { nomeDaCasa } = contexto.window.Jornal;

assert.equal(nomeDaCasa("Dev Maniac's", ""), "Dev Maniac's", "andar principal: a empresa");
assert.equal(nomeDaCasa("Dev Maniac's", "Segundo andar"), "Segundo andar", "andar extra: o nome do andar, não o do térreo");
assert.equal(nomeDaCasa("Dev Maniac's", "  Segundo andar "), "Segundo andar");
assert.equal(nomeDaCasa("Dev Maniac's", "   "), "Dev Maniac's", "nome em branco: fica a empresa");
assert.equal(nomeDaCasa("Dev Maniac's", undefined), "Dev Maniac's", "lista de andares ainda não lida");
assert.equal(nomeDaCasa(undefined, ""), "");

// a página usa o nome da casa no topo e na chave de redesenho (trocar de andar redesenha com o nome novo)
const js = fs.readFileSync("static/jornal.js", "utf8");
assert.ok(js.includes('el("p", "jn-casa", casa())'), "o topo usa o nome da casa");
assert.ok(js.includes("JSON.stringify([qual, s, placar, casa(),"), "a chave de redesenho leva o nome da casa");
const app = fs.readFileSync("static/app.js", "utf8");
assert.ok(/Jornal\.iniciar\(\{[\s\S]*?andar: \(\) =>/.test(app), "o app.js passa o nome do andar ao jornal");

console.log("test_jornal: ok");
