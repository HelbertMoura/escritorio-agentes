"use strict";
// Festa por cidade (Festas.naCidade): a data local de cada fuso, a precedência local > nacional > universal, a base com as
// festas desligadas, as datas móveis e a neve do Natal no norte. Relógio fixo: o instante é sempre passado à função.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const MUNDO = JSON.parse(fs.readFileSync("static/mundo/mundo.json", "utf8"));
const CODIGO = new vm.Script(fs.readFileSync("static/festas.js", "utf8"), { filename: "static/festas.js" });

function festas(busca = "", desligadas = []) {
  const contexto = vm.createContext({ window: {}, location: { search: busca }, URLSearchParams, Intl });
  CODIGO.runInContext(contexto);
  const F = contexto.window.Festas;
  F.configurar({ desligadas });
  return F;
}
const em = iso => new Date(iso);
const RECIFE = { id: "recife", uf: "PE" }, BELEM = { id: "belem", uf: "PA" };
const LISBOA = { id: "lisboa", uf: "", pais: "Portugal" }, TOQUIO = { id: "toquio", uf: "", pais: "Japão" };
const chaveDe = r => (r ? r.chave : null);
const DIAS = (de, ate) => {
  const r = [];
  for (let t = Date.UTC(de, 0, 1); t < Date.UTC(ate + 1, 0, 1); t += 86400000) r.push(new Date(t).toISOString().slice(0, 10));
  return r;
};

// regressão: nos 5 anos, uma cidade brasileira sem festa regional dá o mesmo que o ativa() do dia, com e sem desligadas
function regressao() {
  for (const desligadas of [[], ["natal", "junina", "programador"]]) {
    let comFesta = 0;
    for (const dia of DIAS(2026, 2030)) {
      const F = festas("?data=" + dia, desligadas), a = F.ativa(), n = F.naCidade(RECIFE);
      assert.equal(chaveDe(n), chaveDe(a), `${dia} desligadas=${desligadas.join()}`);
      if (a) { comFesta++; assert.equal(n.nome, a.nome, dia); assert.deepEqual([...n.enfeites], [...a.enfeites], dia); }
    }
    assert.ok(comFesta > 100, "a regressão passou por dias de festa");
  }
}

function fusos() {
  const F = festas();
  // 01/12 02:30 UTC: em Lisboa já é dezembro; no Recife ainda é 30/11
  assert.equal(chaveDe(F.naCidade(LISBOA, em("2026-12-01T02:30Z"))), "natal");
  assert.equal(F.naCidade(RECIFE, em("2026-12-01T02:30Z")), null);
  // 01/12 04:30 UTC: o -3 já virou, o -4 (AM, MT, MS, RR, RO) já virou e o Acre (-5) ainda não
  const t = em("2026-12-01T04:30Z");
  assert.equal(chaveDe(F.naCidade(RECIFE, t)), "natal");
  for (const uf of ["AM", "MT", "MS", "RR", "RO"]) assert.equal(chaveDe(F.naCidade({ id: "x", uf }, t)), "natal", uf);
  assert.equal(F.naCidade({ id: "rio-branco", uf: "AC" }, t), null, "Acre ainda em 30/11");
  assert.equal(F.naCidade({ id: "manaus", uf: "AM" }, em("2026-12-01T03:30Z")), null, "Manaus ainda em 30/11");
  // 31/12 local no Acre e 01/01 em Tóquio: Réveillon nos dois
  const virada = em("2027-01-01T03:30Z");
  assert.equal(chaveDe(F.naCidade({ id: "rio-branco", uf: "AC" }, virada)), "anonovo");
  assert.equal(chaveDe(F.naCidade(TOQUIO, virada)), "anonovo");
  // UF desconhecida ou ausente: Brasília
  assert.equal(chaveDe(F.naCidade({ id: "x", uf: "ZZ" }, t)), "natal");
  assert.equal(chaveDe(F.naCidade({ id: "x" }, em("2026-12-01T02:30Z"))), null);
  // sem o instante, vale agora
  assert.doesNotThrow(() => F.naCidade(RECIFE));
  // a tabela dos fusos, e cada um deles existe no Intl
  assert.deepEqual({ ...F.FUSO_UF }, { AC: "America/Rio_Branco", AM: "America/Manaus", RR: "America/Boa_Vista",
    RO: "America/Porto_Velho", MT: "America/Cuiaba", MS: "America/Campo_Grande" });
  const esperados = { lisboa: "Europe/Lisbon", luanda: "Africa/Luanda", maputo: "Africa/Maputo",
    "buenos-aires": "America/Argentina/Buenos_Aires", montevideu: "America/Montevideo", santiago: "America/Santiago",
    "cidade-do-mexico": "America/Mexico_City", "nova-york": "America/New_York", londres: "Europe/London", paris: "Europe/Paris",
    madri: "Europe/Madrid", toquio: "Asia/Tokyo" };
  assert.deepEqual(Object.keys(F.EXTERIOR).sort(), MUNDO.exterior.map(c => c.id).sort(), "as 12 cidades de fora do mundo.json");
  for (const [id, fuso] of Object.entries(esperados)) assert.equal(F.EXTERIOR[id].fuso, fuso, id);
  for (const fuso of [...Object.values(F.FUSO_UF), "America/Sao_Paulo", ...Object.values(esperados)]) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-CA", { timeZone: fuso }), fuso);
  }
}

// fase 0: tabelas vazias. Quem não tem tabela própria segue o calendário de hoje, na data local
function tabelasVazias() {
  const F = festas();
  assert.equal(F.LOCAIS.length, 0);
  for (const e of Object.values(F.EXTERIOR)) assert.equal(e.festas.length, 0);
  for (const dia of ["2026-02-16", "2026-04-05", "2026-06-24", "2026-09-13", "2026-10-31", "2026-12-25", "2026-12-31", "2026-11-18"]) {
    const G = festas("?data=" + dia);
    for (const c of [LISBOA, TOQUIO, { id: "nova-york" }]) assert.equal(chaveDe(G.naCidade(c)), chaveDe(G.ativa()), `${dia} ${c.id}`);
  }
  assert.equal(chaveDe(festas("?data=2026-09-13").naCidade(LISBOA)), "programador", "o dia 256 segue no exterior");
}

// ?data= fixa a mesma data local em todas as cidades, qualquer que seja o instante
function simulada() {
  const F = festas("?data=2026-12-25");
  for (const c of [RECIFE, { id: "rio-branco", uf: "AC" }, LISBOA, TOQUIO]) {
    for (const t of ["2026-01-01T00:00Z", "2026-07-01T23:59Z"]) assert.equal(chaveDe(F.naCidade(c, em(t))), "natal", c.id);
  }
}

function neve() {
  const F = festas("?data=2026-12-25");
  for (const c of [...MUNDO.cidades, ...MUNDO.exterior]) {
    const f = F.naCidade({ id: c.id, uf: c.uf, pais: c.pais }), norte = ["nova-york", "londres", "paris"].includes(c.id);
    assert.equal(f.chave, "natal", c.id);
    assert.equal(!!f.neve, norte, c.id);
    assert.equal(f.enfeites.includes("neve"), norte, c.id);
  }
  assert.ok(!F.naCidade(RECIFE).enfeites.includes("neve"));
  // só no Natal
  for (const dia of ["2026-12-31", "2026-10-31", "2026-04-05"]) {
    assert.ok(!festas("?data=" + dia).naCidade({ id: "londres" }).neve, dia);
  }
  // o catálogo não é alterado pela cidade com neve
  assert.ok(!F.ativa().enfeites.includes("neve"));
}

function datasMoveis() {
  const F = festas(), iso = ms => new Date(ms).toISOString().slice(0, 10);
  assert.equal(iso(F.nDomingo(2027, 10, 2)), "2027-10-10", "Círio");
  assert.deepEqual([...F.fimDeSemana(2027, 6)].map(iso), ["2027-06-25", "2027-06-27"], "Parintins");
  assert.deepEqual([...F.fimDeSemana(2026, 6)].map(iso), ["2026-06-26", "2026-06-28"]);
  assert.equal(iso(F.pascoa(2027).getTime()), "2027-03-28");
  const carnaval = DIAS(2027, 2027).filter(d => d < "2027-03" && chaveDe(festas("?data=" + d).naCidade(RECIFE)) === "carnaval");
  assert.deepEqual([carnaval[0], carnaval.at(-1)], ["2027-02-05", "2027-02-10"]);
}

// a precedência e a base, com entradas de teste (na fase 0 as tabelas saem vazias)
function precedencia() {
  const parintins = F => ({ chave: "parintins", cidades: ["manaus"], janela: y => F.fimDeSemana(y, 6), base: "junina",
    nome: "Festival de Parintins", cores: ["#e11d48", "#1d4ed8"], enfeites: ["bandeirinhas"], chapeu: null, falas: ["Boi!"] });
  const semBase = F => ({ chave: "teste-livre", cidades: ["manaus"], janela: y => F.fimDeSemana(y, 6), base: null,
    nome: "Sem base", cores: ["#e11d48"], enfeites: [], chapeu: null, falas: [] });
  const MANAUS = { id: "manaus", uf: "AM" };
  const com = (busca, desligadas, ...entradas) => {
    const F = festas(busca, desligadas);
    for (const e of entradas) F.LOCAIS.push(e(F));
    return F;
  };
  // local > nacional
  let F = com("?data=2027-06-26", [], parintins);
  assert.equal(F.naCidade(MANAUS).chave, "parintins");
  assert.equal(F.naCidade(MANAUS).nome, "Festival de Parintins");
  assert.ok(!("cidades" in F.naCidade(MANAUS)) && !("janela" in F.naCidade(MANAUS)) && !("base" in F.naCidade(MANAUS)));
  assert.equal(F.naCidade(RECIFE).chave, "junina", "a regional é só da cidade dela");
  assert.equal(F.ativa().chave, "junina", "o escritório não muda");
  assert.equal(com("?data=2027-06-24", [], parintins).naCidade(MANAUS).chave, "junina", "fora da janela vale a nacional");
  // a base desligada leva a regional (e a nacional com a chave dela também some); sem base, fica sempre ligada
  assert.equal(com("?data=2027-06-26", ["junina"], parintins).naCidade(MANAUS), null);
  assert.equal(com("?data=2027-06-26", ["junina", "teste-livre"], semBase).naCidade(MANAUS).chave, "teste-livre");
  // a janela vale pela data local
  F = com("", [], parintins);
  assert.equal(F.naCidade(MANAUS, em("2027-06-25T05:00Z")).chave, "parintins");
  assert.equal(F.naCidade(MANAUS, em("2027-06-25T03:00Z")).chave, "junina", "em Manaus ainda é 24/06");
  // sem janela no ano (tabela anual sem o ano): vale a nacional
  F = com("?data=2027-06-26", [], G => ({ ...parintins(G), janela: () => null }));
  assert.equal(F.naCidade(MANAUS).chave, "junina");

  // exterior com tabela própria: a do país vence a universal; fora dela, só as universais
  const comPais = (busca, desligadas = []) => {
    const G = festas(busca, desligadas);
    G.EXTERIOR.lisboa.festas.push({ chave: "santos-populares", base: "junina", nome: "Santos Populares", cores: ["#16a34a"],
      enfeites: ["bandeirinhas"], chapeu: null, falas: [], janela: y => [Date.UTC(y, 5, 1), Date.UTC(y, 11, 31)] });
    return G;
  };
  assert.equal(comPais("?data=2026-12-25").naCidade(LISBOA).chave, "santos-populares");
  assert.equal(comPais("?data=2026-12-25", ["junina"]).naCidade(LISBOA).chave, "natal", "desligada: sobra a universal");
  assert.equal(comPais("?data=2026-12-25", ["junina", "natal"]).naCidade(LISBOA), null);
  assert.equal(comPais("?data=2026-02-16").naCidade(LISBOA), null, "com tabela própria, o calendário do Brasil sai");
  assert.equal(comPais("?data=2026-01-01").naCidade(LISBOA).chave, "anonovo");
  const dia256 = festas("?data=2026-09-13");
  dia256.EXTERIOR.lisboa.festas.push({ chave: "nada", base: null, janela: () => null });
  assert.equal(dia256.naCidade(LISBOA).chave, "programador", "o dia 256 continua universal");
}

// toda base está no catálogo ou é null; as festas novas não entram no catálogo (Personalizar e escritório iguais)
function bases() {
  const F = festas(), catalogo = F.temas().map(t => t.chave);
  for (const e of [...F.LOCAIS, ...Object.values(F.EXTERIOR).flatMap(c => c.festas)]) {
    assert.ok(e.base === null || catalogo.includes(e.base), `${e.chave}: base ${e.base}`);
  }
  assert.equal(catalogo.length, 14);
}

for (const caso of [regressao, fusos, tabelasVazias, simulada, neve, datasMoveis, precedencia, bases]) caso();
console.log("test_festas_cidade: ok");
