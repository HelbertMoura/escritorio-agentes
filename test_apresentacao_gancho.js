"use strict";
// Gancho do modo apresentação (static/apresentacao.js, do mapa) no app.js e no index.html: com ela ligada, não há balões de
// fala (nem dos agentes, nem das visitas). Os nomes já saem mascarados do vida.js.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("static/app.js", "utf8"), html = fs.readFileSync("static/index.html", "utf8");

// (1) o script logo depois do vida.js
assert.match(html, /<script src="vida\.js\?v=\d+"><\/script>\s*<script src="apresentacao\.js\?v=\d+"><\/script>/);

// (2) os dois balões só fora da apresentação
const cena = /\nfunction desenharCena\([\s\S]*?\n\}\n/.exec(app)[0];
const baloes = cena.split("\n").filter(l => l.includes("desenharBalao("));
assert.equal(baloes.length, 2);
assert.match(cena, /const baloes = !\(window\.Apresentacao && Apresentacao\.ligado\(\)\);/);
for (const l of baloes) assert.match(l, /^\s*if \(baloes\) /, l.trim());
console.log("test_apresentacao_gancho.js ok");
