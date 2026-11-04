// Confere o Festas.lista(ano) do static/festas.js (as festas do menu de simulação) de 2025 a 2036:
// cada data da lista abre a festa certa no Festas.ativa() pela ?data=, toda festa que vale em algum dia do ano
// está na lista (e só uma vez) e ano inválido devolve lista vazia. Roda o festas.js de verdade, sem navegador.
// Uso: node ferramentas/checar_festas.js   (sai com 1 se algo falhar)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = { window: {}, location: { search: "" }, URLSearchParams, Intl, Date };   // o ativa() lê a ?data= a cada chamada
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "static", "festas.js"), "utf8"), ctx, { filename: "festas.js" });
const F = ctx.window.Festas, falhas = [];
const ativaEm = iso => { ctx.location.search = "?data=" + iso; return F.ativa(); };
const falha = msg => { if (falhas.length < 40) falhas.push(msg); };

for (let ano = 2025; ano <= 2036; ano++) {
  const lista = F.lista(ano), chaves = lista.map(f => f.chave);
  if (new Set(chaves).size !== chaves.length) falha(`${ano}: festa repetida na lista`);
  for (const f of lista) {
    const a = ativaEm(f.data);
    if (!f.data.startsWith(ano + "-")) falha(`${ano}: ${f.chave} em ${f.data}, fora do ano`);
    if (!a || a.chave !== f.chave || a.nome !== f.nome) falha(`${ano}: ${f.chave} em ${f.data} abre ${a ? a.chave : "nenhuma festa"}`);
  }
  // completa: as festas de todos os dias do ano
  const doAno = new Set();
  for (let ms = Date.UTC(ano, 0, 1); ms <= Date.UTC(ano, 11, 31); ms += 86400000) {
    const a = ativaEm(new Date(ms).toISOString().slice(0, 10));
    if (a) doAno.add(a.chave);
  }
  for (const k of doAno) if (!chaves.includes(k)) falha(`${ano}: ${k} vale no ano mas não está na lista`);
}
for (const ruim of [null, undefined, "abc", 1200, Infinity, -1]) if (F.lista(ruim).length) falha(`lista(${String(ruim)}) devolveu festas`);

const exemplo = F.lista(2026);
console.log(`2026: ${exemplo.length} festas · ` + exemplo.map(f => `${f.nome} ${f.data.slice(8)}/${f.data.slice(5, 7)}`).join(", "));
if (falhas.length) { console.log(`FALHOU (${falhas.length}${falhas.length >= 40 ? "+" : ""}):\n  ` + falhas.join("\n  ")); process.exit(1); }
console.log("RESULTADO: tudo certo");
