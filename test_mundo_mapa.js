"use strict";
// Mapa do Brasil ilustrado (nível Brasil): a miniatura do marco em cada capital (e o ícone genérico sem o quadro), os
// nomes em Silkscreen (a casa sempre, a cidade em foco e todas a partir de 2x, sem um cobrir o outro), barcos, ondas e
// aviões do atlas parados com movimento reduzido, o brilho da noite sem gradiente novo a cada quadro e o clique que desce
// à cidade. Usa o arnês do test_mundo_navegacao.js (a página inteira numa VM, sem navegador).
const assert = require("node:assert/strict");
const { abrir, carregar, ATLAS, CLIMA, MUNDO } = require("./test_mundo_navegacao.js");

const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const cidade = id => MUNDO.cidades.find(c => c.id === id);

async function brasil(opcoes = {}) {
  const m = await abrir("#brasil", { passo: 50, ...opcoes });
  await carregar(m);
  return m;
}

async function principal() {
  // cada capital desenha a miniatura do seu marco (o recorte do atlas); a casa, o chalé com a bandeira
  const m = await brasil();
  m.contexto.gravar = []; m.rodar(2);
  const usados = new Set(m.contexto.gravar.map(r => JSON.stringify(r)));
  for (const c of MUNDO.cidades) {
    const nome = "mini-" + c.marco;
    assert.ok(ATLAS.quadros[nome], "o atlas tem " + nome);
    if (c.id === CLIMA.casa) continue;
    assert.ok(usados.has(JSON.stringify(ATLAS.quadros[nome])), `${c.id}: desenha ${nome}`);
  }
  const icones = m.M.niveis.brasil.icones;
  assert.equal(icones["mateus-leme"], "casa", "a cidade do escritório é o chalé");
  assert.equal(icones["recife"], "mini-recife-antigo");
  // sem o quadro da miniatura (ou sem o atlas), o ícone genérico, sem erro
  const sem = { ...ATLAS, quadros: { ...ATLAS.quadros } };
  delete sem.quadros["mini-recife-antigo"];
  const s = await brasil({ atlas: sem });
  s.rodar(3);
  assert.equal(s.M.niveis.brasil.icones["recife"], "generico");
  assert.equal(s.M.niveis.brasil.icones["manaus"], "mini-teatro-amazonas");
  const nada = await abrir("#brasil");
  nada.rodar(3);
  assert.equal(nada.M.niveis.brasil.icones["manaus"], "generico", "antes do atlas chegar, o genérico");

  // nomes: a 1x só o da casa; com o foco numa cidade, o dela também; a 2x, os das cidades à vista, sem sobrepor
  const nomes = () => JSON.stringify(m.M.niveis.brasil.nomes.map(n => n.id).sort());
  m.rodar(2);
  assert.equal(nomes(), '["mateus-leme"]');
  const botoes = m.elementos["mundo-alvos"].filhos, i = MUNDO.cidades.findIndex(c => c.id === "manaus");
  botoes[i].disparar("focus"); m.rodar(2);
  assert.equal(nomes(), '["manaus","mateus-leme"]', "o foco mostra o nome");
  botoes[i].disparar("blur"); m.rodar(2);
  const rec = cidade("recife");
  m.M.camera.zoomPara(2); m.rodar(80);   // a 1x a caixa cabe na tela e a câmera fica no meio: só depois do zoom ela anda
  m.M.camera.x = rec.x; m.M.camera.y = rec.y; m.M.camera.limitar(); m.rodar(2);
  assert.ok(Math.abs(m.M.camera.P / m.M.camera.base - 2) < 1e-6, "zoom 2x");
  const lista = m.M.niveis.brasil.nomes;
  const vistas = MUNDO.cidades.filter(c => { const [x, y] = m.M.camera.tela(c.x, c.y); return x > 20 && y > 20 && x < 620 && y < 380; });
  assert.ok(vistas.length >= 5, "cidades à vista: " + vistas.length);
  assert.ok(lista.length >= Math.ceil(vistas.length * 0.6), `nomes a 2x: ${lista.length} de ${vistas.length}`);
  assert.ok(lista.some(n => n.id === "recife"));
  for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) {
    assert.ok(!cruza(lista[a], lista[b]), `${lista[a].id} e ${lista[b].id} se cobrem`);
  }

  // clique na miniatura (um pouco acima do ponto da cidade) desce a #cidade=<id>
  const k = await brasil();
  const [cx, cy] = k.M.camera.tela(rec.x, rec.y);
  k.clicar(cx, cy - 8); k.rodar(40);
  assert.equal(k.contexto.location.hash, "#cidade=recife");

  // movimento reduzido: barcos, ondas e aviões parados; sem ele, barcos e ondas andam e os aviões vêm do atlas
  for (const reduzido of [true, false]) {
    const r = await abrir("#brasil", { passo: 50, reduzido });
    r.contexto.gravar = [];   // desde o começo: o avião girado é pintado uma vez por direção e depois só copiado
    await carregar(r);
    const b = r.M.niveis.brasil, antes = JSON.stringify([b.barcos, b.ondas]);
    assert.ok(b.barcos.length >= 3 && b.barcos.length <= 5, "barcos: " + b.barcos.length);
    let voando = 0;
    for (let i = 0; i < 120; i++) { r.rodar(); voando = Math.max(voando, b.avioes.length); }
    const depois = JSON.stringify([b.barcos, b.ondas]);
    if (reduzido) { assert.equal(depois, antes, "reduzido: barcos e ondas parados"); assert.equal(voando, 0); }
    else {
      assert.notEqual(JSON.stringify(b.barcos), JSON.stringify(JSON.parse(antes)[0]), "os barcos navegam");
      assert.notEqual(JSON.stringify(b.ondas), JSON.stringify(JSON.parse(antes)[1]), "as ondas brilham");
      const usados = new Set(r.contexto.gravar.map(g => JSON.stringify(g)));
      assert.ok(voando > 0);
      assert.ok(["mini-aviao-1", "mini-aviao-2"].some(n => usados.has(JSON.stringify(ATLAS.quadros[n]))), "aviões do atlas");
    }
  }

  // a noite: o brilho quente das cidades sai de sprites guardados, sem gradiente novo depois de aquecer
  const n = await brasil({ escuro: 1, busca: "?data=2026-11-18" });
  n.rodar(60);
  const g0 = n.contexto.gradientes || 0;
  n.rodar(120);
  assert.equal((n.contexto.gradientes || 0) - g0, 0, "brilhos em cache");
}
principal().catch(e => { console.error(e); process.exitCode = 1; });
