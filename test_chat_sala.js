"use strict";
// Chat da sala (static/chat_sala.js): o nome da sala no cabeçalho, o texto que o servidor aceita e a deduplicação por seq.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {} };   // sem document: só a parte pura carrega
vm.runInNewContext(fs.readFileSync("static/chat_sala.js", "utf8"), contexto);
const { nomeDaSala, validar, limpar, novas, TEXTO_MAX } = contexto.window.ChatSala;

assert.equal(nomeDaSala("recepcao"), "Recepção");
assert.equal(nomeDaSala("lounge"), "Sala comunal");
assert.equal(nomeDaSala("time:Design"), "Design");
for (const s of ["", null, undefined, 3, "toString", "__proto__", "desconhecida"]) assert.equal(nomeDaSala(s), "", `sem sala: ${String(s)}`);

assert.equal(validar("oi"), null);
assert.equal(validar("   "), "Escreva a mensagem.");
assert.equal(validar("\u0000​"), "Escreva a mensagem.", "só controle e invisível é vazio");
assert.equal(validar("é".repeat(TEXTO_MAX)), null);
assert.equal(validar("😀".repeat(TEXTO_MAX)), null, "conta por caractere, como o len() do servidor");
assert.match(validar("a".repeat(TEXTO_MAX + 1)), /500/);
assert.equal(limpar(" a\u0007b‮c\r\nd "), "abc\nd", "tira controle e bidi, mantém a quebra de linha");

const vistos = new Set([2]);
const ms = [{ seq: 3, texto: "c" }, { seq: 1, texto: "a" }, { seq: 2, texto: "b" }, { seq: "4", texto: "x" }, null, { seq: 5 }];
assert.deepEqual([...novas(ms, vistos).map(m => m.seq)], [1, 3], "fora as já vistas e as malformadas, em ordem de seq");
assert.equal(novas(undefined, vistos).length, 0);
console.log("test_chat_sala.js ok");
