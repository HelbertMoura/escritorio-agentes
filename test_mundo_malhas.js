"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { abrir, carregar, ATLAS, MUNDO, CLIMA } = require("./test_mundo_navegacao.js");
const contexto = vm.createContext({ window: {} });
vm.runInContext(readFileSync("static/mundo_cidade_planta.js", "utf8"), contexto);
const CP = contexto.window.CidadePlanta;
const MARCOS = {
  recife: "Marco Zero · Recife Antigo", manaus: "Teatro Amazonas", "belo-horizonte": "Igreja da Pampulha",
};
const especiais = Object.keys(MARCOS);
const outras = MUNDO.cidades.filter(c => !especiais.includes(c.id));

function golden(lista, total, hash) {
  assert.equal(lista.length, total);
  const dados = JSON.stringify(lista.map(c => [c.id, CP.planta(c.id, c)]));
  assert.equal(createHash("sha256").update(dados).digest("hex"), hash, "plantas idênticas às de 6a2fc2d");
}
golden(outras, 25, "b3cfdfa87c1773b78f5e43a0433ed71e14ab2ba7a738c678b3992c540be92b96");
golden(MUNDO.exterior, 12, "ecac0bfe32331fa17ed5a2acdac6dddd7df3c2a2c7e6bb3a1d3189e3c4e62dfd");
golden(MUNDO.niveis.brasil.medias, 50, "40c6e6296494be8ac2ae08f171f0adf10ff90c196dd519905caaffceb76d93b7");

const distancia = ([x, y], t) => {
  const s = Math.max(0, Math.min(t.L, (x - t.a[0]) * t.u[0] + (y - t.a[1]) * t.u[1]));
  return Math.hypot(x - t.a[0] - s * t.u[0], y - t.a[1] - s * t.u[1]);
};
const distanciaXY = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cruza = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

function trecho(a, b, conferir) {
  const n = Math.ceil(distanciaXY(a, b));
  assert.ok(n > 0, "segmento com comprimento");
  for (let i = 0; i <= n; i++) conferir([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
}
function retangulo(r, conferir) {
  for (let x = r[0]; x <= r[2]; x++) for (let y = r[1]; y <= r[3]; y++) conferir([x, y]);
}
function loteContem(r, q) {
  return q[0] >= r[0] && q[1] >= r[1] && q[2] <= r[2] && q[3] <= r[3];
}

function geometria(cidade) {
  const id = cidade.id, p = CP.planta(id, cidade), m = p.malha, { nos, viz, faixaPorAresta } = p.rede;
  assert.ok(m && m.travessias.length >= 8 && m.ruas.length > m.volta, id);
  const seco = z => !CP.aguaEm(m, z), transitavel = z => seco(z) || CP.ponteEm(m, z);
  const piso = z => Math.min(...m.ruas.map(t => distancia(z, t)));
  const pistas = m.ruas.slice(0, m.volta), pista = z => Math.min(...pistas.map(t => distancia(z, t)));
  const pegadasNaPonte = new Map();
  for (const [i, a] of nos.entries()) for (const j of viz[i]) {
    assert.ok(viz[j].includes(i), `${id}: calçada de mão dupla`);
    if (j < i) continue;
    const b = nos[j], faixa = faixaPorAresta[CP.chaveAresta(i, j)];
    if (faixa) assert.ok(m.travessias.includes(faixa));
    trecho(a, b, z => {
      assert.ok(transitavel(z), `${id}: pedestre na água em ${z}`);
      if (!faixa) assert.ok(piso(z) >= m.largura - 0.5, `${id}: calçada sobre a via em ${z}`);
      if (!seco(z)) for (const ponte of m.pontes) {
        if (!CP.ponteEm({ pontes: [ponte] }, z)) continue;
        // Um arco por lado da ponte, ligando uma calçada seca à outra.
        assert.ok(seco(a) && seco(b), `${id}: ponte desemboca em terra`);
        if (!pegadasNaPonte.has(ponte)) pegadasNaPonte.set(ponte, new Set());
        pegadasNaPonte.get(ponte).add(i);
      }
    });
  }
  const vistos = new Set([0]), fila = [0];
  for (const i of fila) for (const j of viz[i]) if (!vistos.has(j)) { vistos.add(j); fila.push(j); }
  assert.equal(vistos.size, nos.length, `${id}: uma rede de calçadas`);
  assert.equal(m.pontes.length, id === "recife" ? 2 : 0);
  for (const ponte of m.pontes) assert.equal(pegadasNaPonte.get(ponte)?.size, 2, ponte.nome);

  for (const c of p.carros) assert.ok(c.s >= 0 && c.s < m.pista.L);
  assert.ok(p.carros.every((c, i, l) => !i || c.s - l[i - 1].s > 38), `${id}: folga inicial`);
  assert.ok(m.pista.L - p.carros.at(-1).s + p.carros[0].s > 38, `${id}: folga na emenda`);
  const carro = {};
  for (let s = 0; s < m.pista.L; s += 0.75) {
    CP.naPista(m.pista, s, carro);
    const cos = Math.cos(carro.angulo), sin = Math.sin(carro.angulo);
    const frente = {};
    if (s + 0.1 < m.pista.L) {
      CP.naPista(m.pista, s + 0.1, frente);
      assert.ok((frente.x - carro.x) * cos + (frente.y - carro.y) * sin > 0.08, `${id}: corpo/farol seguem a pista`);
    }
    for (const u of [-13.5, 0, 13.5]) for (const v of [-7.5, 0, 7.5]) {
      const z = [carro.x + u * cos - v * sin, carro.y + u * sin + v * cos];
      assert.ok(pista(z) < m.largura && transitavel(z), `${id}: o maior carro cabe na curva/ponte em ${z}`);
    }
  }
  const antes = {}, depois = {};
  CP.naPista(m.pista, m.pista.L - 0.01, antes); CP.naPista(m.pista, 0, depois);
  assert.ok(Math.hypot(antes.x - depois.x, antes.y - depois.y) < 0.011, `${id}: circuito fecha sem salto`);

  const lotes = [p.centro, p.casa, ...p.pecas];
  for (const [i, s] of lotes.entries()) {
    assert.ok(loteContem(s.r, [s.x, s.y, s.x, s.y]), `${id}: ${s.peca} com pé no lote`);
    retangulo(s.r, z => assert.ok(seco(z) && piso(z) >= m.calcada, `${id}: lote ${s.peca} em ${z}`));
    for (const o of lotes.slice(0, i)) assert.ok(!cruza(o.r, s.r), `${id}: ${o.peca} sobre ${s.peca}`);
    if (s === p.centro || s === p.casa || s.peca.startsWith("cidade-") || s === p.praca) {
      const [, , w, h] = ATLAS.quadros[s === p.centro ? "marco-" + cidade.marco : s.peca];
      assert.ok(loteContem(s.r, [s.x - w / 2, s.y - h, s.x + w / 2, s.y]), `${id}: ${s.peca} cabe no lote`);
    }
  }
  for (const placa of m.placas) {
    assert.ok(placa.nome && seco([placa.x, placa.y]) && piso([placa.x, placa.y]) >= m.largura);
  }
  for (const ponte of m.pontes) assert.ok(m.placas.some(placa => placa.nome === ponte.nome));
  for (const [x, y] of p.postes) assert.ok(seco([x, y]) && nos.some(a => a[0] === x && a[1] === y), id);
  for (const [x, y, u, v] of m.cordoes) {
    for (const z of [[x, y], [u, v]]) assert.ok(p.postes.some(a => distanciaXY(z, a) < 1e-6), `${id}: cordão preso ao poste`);
    trecho([x, y], [u, v], z => assert.ok(seco(z)));
  }
  for (const a of p.pedestres) {
    assert.ok(viz[a.de].includes(a.para) && a.s >= 0 && a.s < distanciaXY(nos[a.de], nos[a.para]));
    assert.ok(!faixaPorAresta[CP.chaveAresta(a.de, a.para)], `${id}: pedestre nasce fora da faixa`);
  }
  assert.ok(nos.some(([x, y]) => x === p.casa.x && y === p.casa.y), `${id}: calçada chega ao chalé`);
  if (id === "recife") {
    assert.ok(ATLAS.quadros[m.pedra], "a pedra de Recife existe no atlas");
    for (const { pontos } of p.quadras) for (const [x, y] of pontos) {
      assert.ok(loteContem(m.caixa, [x, y, x, y]), `quadra no enquadramento em ${x},${y}`);
    }
    for (const { peca, r } of lotes) assert.ok(loteContem(m.caixa, r), `${peca} no enquadramento`);
    const frente = p.pecas.find(s => s.peca === "recife-frente");
    assert.ok(frente && ATLAS.quadros[frente.base], "frente contínua com reserva no atlas");
    for (const nome of [frente.peca, frente.base]) {
      const [, , w, h] = ATLAS.quadros[nome];
      const r = [frente.x - w / 2, frente.y - h, frente.x + w / 2, frente.y];
      assert.ok(loteContem(frente.r, r), `${nome} cabe inteiro na quadra`);
      for (const caminho of m.caminhos) trecho(...caminho, ([x, y]) => {
        assert.ok(!loteContem(r, [x, y, x, y]), `${nome} deixa livres os acessos da malha`);
      });
    }
  }
  if (id === "manaus") {
    assert.ok(m.cais.length >= 2 && m.agua[0].tipo === "rio");
    for (const [x, y] of [[182, 128], [416, 322], [398, 385]]) {
      assert.ok(nos.some(a => a[0] === x && a[1] === y), "Teatro, Mercado e porto na mesma rede");
    }
  }
  if (id === "belo-horizonte") {
    assert.ok(m.agua[0].pontos.length > 12 && m.relevo.length && m.volta > 8);
    assert.ok(CP.aguaEm(m, [210, 220]), "o lago ocupa o miolo da avenida");
  }
}

async function navegacao(id) {
  const e = await abrir("#cidade=" + id, { clima: { ...CLIMA, casa: id }, passo: 100, reduzido: true, busca: "?data=2026-06-24" });
  const n = e.M.niveis.cidade;
  e.rodar(4);
  assert.equal(n.vida.faltam, 1, `${id}: esboço enquanto o atlas carrega`);
  const antes = JSON.stringify([n.carros, n.pedestres]);
  await carregar(e);
  e.rodar(30);
  assert.equal(n.vida.faltam, 0, `${id}: ladrilhos do mesmo chão`);
  assert.equal(JSON.stringify([n.carros, n.pedestres]), antes, `${id}: movimento reduzido`);
  assert.match(e.canvas["aria-label"], /o marco da cidade.*chalé do escritório.*Festa Junina/);
  const marco = n.alvos().find(a => a.titulo === MARCOS[id]);
  assert.ok(marco);
  const botoes = e.elementos["mundo-alvos"].filhos, botao = botoes.find(b => b["aria-label"] === marco.rotulo);
  assert.ok(botao, `${id}: alvo no percurso de teclado`);
  botao.disparar("focus");
  assert.equal(n.destaque, marco.id);
  botao.disparar("click"); // a ativação nativa via Enter emite click
  assert.ok(e.elementos["mundo-estado"].textContent.includes(marco.titulo));
  e.clicar(...e.M.camera.tela(marco.x, marco.y));
  assert.ok(e.elementos["mundo-estado"].textContent.includes(marco.titulo));
  assert.ok(n.enfeites.cordoes > 0 && n.enfeites.bandeirinhas > 0 && n.enfeites.pecas.length === 2, id);
  for (const [, ...r] of n.enfeites.pecas) assert.ok(loteContem(n.planta.praca.r, r));
  e.elementos["mundo-mais"].disparar("click"); e.rodar(3);
  assert.ok(e.M.camera.z > 1, `${id}: zoom`);
  e.elementos["mundo-menos"].disparar("click"); e.rodar(3);
  assert.equal(e.M.camera.z, 1);
  const porta = n.alvos().find(a => a.id === "porta");
  e.clicar(...e.M.camera.tela(porta.x, porta.y - 12)); e.rodar(3);
  assert.equal(e.M.nivel, "bairro");
  e.tecla("Escape"); e.rodar(3);
  assert.equal(e.M.nivel, "cidade"); assert.equal(e.contexto.location.hash, "#cidade=" + id);
  e.M.ir("cidade", { cidade: "paris" }); e.rodar(3);
  assert.ok(!n.planta.malha && n.planta.ruas.v.length && !n.alvos().some(a => a.id === "porta"));
}

async function transito(id) {
  const e = await abrir("#cidade=" + id, { passo: 250 });
  await carregar(e);
  const n = e.M.niveis.cidade, m = n.planta.malha, percorrido = n.carros.map(() => 0);
  let anterior = n.carros;
  for (let i = 0; i < 1200; i++) {
    e.rodar();
    const carros = n.carros, pedestres = n.pedestres;
    for (const [j, z] of carros.entries()) {
      const passo = distanciaXY(anterior[j], z);
      assert.ok(passo <= 5.51, `${id}: carro avançou ${passo} em um quadro`);
      percorrido[j] += passo;
      for (const outro of carros.slice(0, j)) assert.ok(distanciaXY(z, outro) > 26, `${id}: carros colados`);
      for (const a of pedestres) assert.ok(distanciaXY(z, a) > 10, `${id}: pedestre junto ao carro em ${a}`);
    }
    anterior = carros;
  }
  for (const total of percorrido) assert.ok(total >= m.pista.L, `${id}: cada veículo completa uma volta (${total})`);
}

(async () => {
  for (const id of especiais) {
    geometria(MUNDO.cidades.find(c => c.id === id));
    await navegacao(id);
    await transito(id);
  }
  console.log("Malhas: 3 cidades, 87 plantas procedurais e navegação verificadas.");
})().catch(e => { console.error(e); process.exitCode = 1; });
