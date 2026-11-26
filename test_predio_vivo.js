"use strict";
// Prédio vivo: a fachada expõe as janelas que o app.js acende pela ocupação agregada de cada sala do térreo; o Dev
// ganha a faixa de monitores; e o resumo de sala (porta/placa/lista) tem os fios ligados no app.js, no CSS e na agenda.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// ---------- mapa.js: fachada e a cara do Dev (mesmo molde do test_mapa_carros.js)
const ATLAS = JSON.parse(fs.readFileSync("static/tema/atlas.json", "utf8"));
const ctxFalso = new Proxy({}, { get: (o, k) => (k === "measureText" ? t => ({ width: String(t).length * 4 }) : k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const c = { console, getComputedStyle: () => ({ getPropertyValue: () => "" }), matchMedia: () => ({ matches: false }), document: { documentElement: {}, createElement: () => ({ getContext: () => ctxFalso }) } };
c.window = c;
vm.runInNewContext(fs.readFileSync("static/mapa.js", "utf8"), c);
const predio = c.Mapa.montarPredio({ json: ATLAS, img: {} }, { empresa: "X" },
  [{ nome: "Dev", tipo: "mesas", handles: ["a", "b", "c", "d", "e", "f"], cor: "#3b82f6" }], null);
assert.ok(predio.fachada && Array.isArray(predio.fachada.janelas) && predio.fachada.janelas.length > 0, "a fachada entregou as janelas");
assert.equal(predio.fachada.arandelas.length, 2, "as duas arandelas da entrada");
const base = predio.predioRet.y + predio.predioRet.h, porta = predio.fachada.porta.x;
for (const j of predio.fachada.janelas) {
  assert.ok(j.x >= predio.predioRet.x && j.x + j.w <= predio.predioRet.x + predio.predioRet.w, "janela dentro da fachada");
  assert.ok(j.y >= base && j.y + j.h <= base + 32, "janela na faixa da fachada");
  assert.ok(Math.abs(j.x + j.w / 2 - porta) > 30, "janela não cobre a porta");
}
const dev = predio.salas.find(s => s.nome === "Dev");
assert.ok(dev && c.Mapa.funcaoDaSala(dev) === "dev", "funcaoDaSala identifica o Dev");
assert.ok(predio.animados.some(a => a.tipo === "telas_noc"), "o Dev ganhou a faixa de monitores");

// ---------- app.js, CSS e agenda: o resumo de sala e a entrega em duas etapas
const app = fs.readFileSync("static/app.js", "utf8"), css = fs.readFileSync("static/estilo.css", "utf8");
const html = fs.readFileSync("static/index.html", "utf8"), vida = fs.readFileSync("static/vida.js", "utf8");
const zel = fs.readFileSync("static/zeladoria.js", "utf8"), reu = fs.readFileSync("static/reunioes.js", "utf8");
const tag = id => { const m = new RegExp(`<[a-z][a-z0-9]* [^>]*id="${id}"[^>]*>`).exec(html); assert.ok(m, `falta #${id} no index.html`); return m[0]; };
assert.match(tag("resumo-sala"), /role="dialog"[^>]*aria-labelledby="resumo-sala-titulo"[^>]*tabindex="-1"[^>]*hidden|hidden[^>]*role="dialog"/);
for (const fn of ["abrirResumoSala", "fecharResumoSala", "posicionarCamadaSalas", "salaDaPortaEm", "renderResumoSala"]) {
  assert.match(app, new RegExp(`function ${fn}\\(`), `app.js: ${fn}`);
}
assert.match(app, /Mapa\.funcaoDaSala\(/, "o resumo usa a função já existente da sala");
assert.match(app, /Reunioes\.proximaNaSala\(/, "a reunião vem da agenda existente");
assert.match(app, /Reunioes\.entrar\(s\.chave, s\.nome/, "o atalho de reunião já autorizado");
assert.match(app, /alternarRecepcao\(\)/, "a opção de ocultar usa o toggle da recepção");
assert.match(app, /sala-resumo/, "a lista de salas dá o caminho alternativo pelo teclado");
assert.match(css, /\.resumo-sala\s*\{[^}]*max-height: calc\(100% - 24px\)/, "resumo no desktop");
assert.match(css, /\.resumo-sala\s*\{[^}]*max-height: 40dvh/, "resumo no celular em 40dvh");
assert.match(css, /html\.apresentacao #resumo-sala[^}]*display: none/, "o resumo some na apresentação");
assert.match(app, /Efeitos\.chegadaBalcao\(ctx, ent\)/, "o app desenha a chegada ao balcão");
assert.match(app, /Reunioes\.proximaNaSala/, "a agenda alimenta o resumo");
assert.match(reu, /function proximaNaSala\(chave\)/, "reunioes.js expõe a próxima da sala");
assert.match(reu, /proximaNaSala, pintar:/, "e exporta");
assert.match(vida, /etapa: duasEtapas \? "balcao" : "destino"/, "a entrega nasce em duas etapas");
assert.match(vida, /function chegouNoBalcao\(/, "a primeira etapa tem nome");
assert.match(vida, /g\.parada === e\.ponto/, "só entrega quando o entregador alcança o destino");
assert.match(vida, /Zeladoria\.chegada\(m, e\.parada\.x\)/, "o porteiro reage à chegada");
assert.match(zel, /function chegada\(m, x\)/, "zeladoria.js tem a reação discreta");
assert.match(zel, /chegada,\n\s+chao,/, "e exporta chegada");

// ---------- portas de todas as salas, arandelas em uma fonte, colunas da fachada e extras ----------
// cada porta (menos a lateral, que é a rua) aponta para a sua sala; reunião, cozinha e sala comunal incluídas
{
  const p = c.Mapa.montarPredio({ json: ATLAS, img: {} }, { empresa: "X" },
    [{ nome: "Dev", tipo: "mesas", handles: ["a", "b", "c", "d", "e", "f"], cor: "#3b82f6" }], null);
  const base = p.predioRet.y + p.predioRet.h;
  for (const tipo of ["reuniao", "cozinha", "lounge"]) {
    const sala = p.baixo.find(s => s.tipo === tipo);
    assert.ok(sala, `sala ${tipo}`);
    assert.ok(p.portas.some(q => q.sala === sala), `a porta da ${tipo} aponta para a sala`);
  }
  for (const q of p.portas) assert.ok(q.tipo === "lateral" || q.sala, `porta ${q.tipo} com sala`);
  assert.equal(p.fachada.arandelas.length, 2);
  for (const a of p.fachada.arandelas) assert.equal(a.y, base + 8, "a luz da arandela na posição y0+8");
  for (const a of p.fachada.arandelas) assert.ok(!p.externos.postes.some(q => Math.abs(q.x - a.x) < 0.1 && Math.abs(q.y - a.y) < 0.1), "arandela fora de ext.postes");
  assert.equal(p.fachada.colunas.length, p.fachada.janelas.length, "uma coluna pré-calculada por janela");
  const cozinha = p.baixo.find(s => s.tipo === "cozinha"), lounge = p.baixo.find(s => s.tipo === "lounge");
  assert.notEqual(cozinha.piso, lounge.piso, "a cozinha tem piso próprio");
  assert.equal(p.portas.find(q => q.sala === cozinha).tipo, "vaivem", "a porta da cozinha é a vaivém existente");
  const portaReuniao = p.portas.find(q => q.sala === p.baixo.find(s => s.tipo === "reuniao"));
  assert.equal(portaReuniao.tipo, "vidro", "a porta da reunião mantém o vidro existente");
  assert.equal(portaReuniao.sala.tipo, "reuniao", "e continua ligada à sala, diferenciada pela placa e pelo estado");
}

// com times sobrando, o prédio abre blocos extras: as portas e as colunas da fachada continuam ligadas às salas
{
  const grupos = [..."ABCDEFG"].map((letra, i) => ({ nome: "Time " + letra, tipo: "mesas", handles: [letra + "1", letra + "2"], cor: "#3b82f6" }));
  const p = c.Mapa.montarPredio({ json: ATLAS, img: {} }, { empresa: "X" }, grupos, null);
  const bloco = p.salas.find(s => s.emCima);
  assert.ok(bloco, "o prédio com 7 times ganhou bloco extra");
  assert.ok(p.portas.some(q => q.sala === bloco), "a porta do bloco extra aponta para a sala");
  assert.ok(p.fachada.colunas.some(lista => lista.includes(bloco)), "a fachada agrega a sala do bloco extra na coluna");
  for (const q of p.portas) assert.ok(q.tipo === "lateral" || q.sala, `porta ${q.tipo} do prédio com extras com sala`);
}
// o resumo: mesas reais, gente separada/deduplicada, atualização sem roubar foco e a recepção só com leitura pronta
assert.match(app, /function atualizarResumoSala\(/);
assert.match(app, /function mesasOcupadas\(/);
assert.match(app, /Ver em Aprovações/);
assert.match(app, /recepcaoDoAndarAtual\(\) && sit === "pronto"/);
assert.match(app, /data-resumo-foco/);
assert.match(app, /alternarRecepcao\(\); renderResumoSala\(true\)/, "o toggle da recepção não perde o foco");
assert.match(app, /s\.px \+ s\.pw - 52/, "a placa do elevador prefere o vão entre logo e relógio");
assert.match(app, /ocupados\.some\(o => sobre/, "a busca compara o retângulo inteiro");
assert.match(fs.readFileSync("static/mapa.js", "utf8"), /if \(t\.w && paredeLivreEm\([^)]*\)\) \{\s*usoPredio\.set\("telas_noc"[\s\S]{0,200}?minhas\.add\("telas_noc"\)/, "a faixa Dev só marca a sala depois que a peça coube");
assert.match(app, /recepcaoUI\.fechar\(false\)/);
assert.match(app, /if \(!\$\("resumo-sala"\)\.hidden\)/);
assert.match(app, /fecharResumoSala\(false\);   \/\/ o resumo da sala do andar de antes também/);
assert.match(vida, /"caneca"/, "o café deixa a caneca para a zeladoria");
console.log("test_predio_vivo.js: ok");
