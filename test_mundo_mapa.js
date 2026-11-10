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

  // clique no meio da miniatura (onde ela está desenhada, que a 1x pode ser afastada do ponto) desce a #cidade=<id>
  const k = await brasil();
  k.rodar(2);
  const cr = k.M.niveis.brasil.caixas.find(c => c.id === "recife");
  k.clicar(cr.x + cr.w / 2, cr.y + cr.h - 10); k.rodar(40);
  assert.equal(k.contexto.location.hash, "#cidade=recife");

  // o nome sob o cursor aparece (sem foco nem zoom)
  const cu = await brasil();
  cu.rodar(2);
  const cm = cu.M.niveis.brasil.caixas.find(c => c.id === "manaus");
  cu.canvas.disparar("pointermove", { pointerId: 9, clientX: cm.x + cm.w / 2, clientY: cm.y + cm.h - 10, button: 0 });
  cu.rodar(2);
  assert.ok(cu.M.niveis.brasil.nomes.some(n => n.id === "manaus"), "o cursor sobre Manaus mostra o nome");

  // a 1x (desktop, celular em pé e o arnês), com nuvem de chuva em todas: nenhuma caixa (miniatura + ícone do tempo) cobre
  // outra e nenhuma sai da tela; a cidade sem vizinha fica no ponto; Mateus Leme, que não é capital, tem marcador menor
  const chuva = { cidades: Object.fromEntries(MUNDO.cidades.map(c => [c.id, { tipo: "chuva", vento: 0, noite: false }])),
    casa: "sao-paulo", versao: 1 };
  for (const tela of [[640, 400, 1], [940, 800, 1], [390, 507, 3]]) {
    const v = await brasil({ tela, clima: chuva });
    v.rodar(3);
    const b = v.M.niveis.brasil, caixas = b.caixas, W = tela[0] * tela[2], H = tela[1] * tela[2];
    assert.equal(caixas.length, 28, `${tela}: as 28 à vista`);
    for (const c of caixas) assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H, `${tela}: ${c.id} cortada pela borda`);
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
      assert.ok(!cruza(caixas[i], caixas[j]), `${tela}: ${caixas[i].id} e ${caixas[j].id} se cobrem`);
    }
    const ma = caixas.find(c => c.id === "manaus");   // no arnês (mapa de 400 px na tela) tudo é apertado; nos outros, não
    if (tela[0] !== 640) assert.ok(ma.px === ma.ax && ma.py === ma.ay, `${tela}: Manaus no ponto (${ma.px - ma.ax}, ${ma.py - ma.ay})`);
    assert.ok(caixas.some(c => c.px !== c.ax || c.py !== c.ay), `${tela}: o Nordeste se afasta do ponto`);
    assert.equal(b.icones["mateus-leme"], "pequena");
    const ml = caixas.find(c => c.id === "mateus-leme"), bh = caixas.find(c => c.id === "belo-horizonte");
    assert.ok(ml.iw < bh.iw && ml.ih < bh.ih, `${tela}: Mateus Leme menor que BH`);
  }

  // a miniatura cresce com o zoom, em degraus inteiros: o dobro a 2x
  const z = await brasil();
  z.rodar(2);
  const w1 = z.M.niveis.brasil.caixas.find(c => c.id === "manaus").iw;
  z.M.camera.zoomPara(2); z.rodar(80);
  const man = cidade("manaus");
  z.M.camera.x = man.x; z.M.camera.y = man.y; z.M.camera.limitar(); z.rodar(2);
  assert.equal(z.M.niveis.brasil.caixas.find(c => c.id === "manaus").iw, 2 * w1, "a 2x, a miniatura dobra");

  // a rosa dos ventos não espera a fonte (o nome do oceano, sim)
  const f = await brasil({ fontePendente: true });
  f.rodar(2);
  assert.equal(JSON.stringify(f.M.niveis.brasil.enfeites), '{"rosa":true,"oceano":false}');

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
    if (reduzido) {   // os barcos ficam onde nasceram, nenhum brilho de onda chega a aparecer e nenhum avião decola
      assert.equal(JSON.stringify(b.barcos), JSON.stringify(JSON.parse(antes)[0]), "barcos parados");
      assert.equal(b.ondas.length, 0, "reduzido: nenhum brilho de onda");
      assert.equal(voando, 0);
      assert.equal(depois, antes);
    }
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
  // de perto também (azulejos, estados, cidades médias): nada de gradiente novo por quadro
  n.M.camera.zoomPara(3); n.rodar(40); await carregar(n); n.rodar(20);
  const g1 = n.contexto.gradientes || 0;
  n.rodar(60);
  assert.equal((n.contexto.gradientes || 0) - g1, 0, "de perto, brilhos em cache");

  await niveisDeDetalhe();
  await casaEmMateusLeme();
  await estados();
  await arranjoSemPuxarNemCruzar();
}

const azulejosPedidos = m => (m.contexto.imagens || []).map(i => String(i.src || "")).filter(s => s.includes("/mundo/perto/"));
const centrar = (m, x, y) => { m.M.camera.x = x; m.M.camera.y = y; m.M.camera.limitar(); m.rodar(3); };

// a camada de perto: nenhum azulejo a 1x; a partir de 2x, só os da vista (com versão), e desenhados quando chegam. Os
// nomes dos estados entram a 2x e as cidades médias a 3x, sem cobrir um ao outro, os nomes das capitais nem os ícones
async function niveisDeDetalhe() {
  const p = await brasil({ tela: [940, 800, 1] });   // a tela do desktop (o arnês de 640x400 aperta tudo a 2x)
  p.rodar(30);
  assert.deepEqual(azulejosPedidos(p), [], "a 1x, nenhum azulejo pedido");
  assert.ok(!p.M.niveis.brasil.rotulos.some(r => r.tipo === "estado" || r.tipo === "media"), "a 1x, sem estados nem médias");
  const bh = cidade("belo-horizonte");
  p.M.camera.zoomPara(4, ...p.M.camera.tela(bh.x, bh.y)); p.rodar(2);   // o pedido sai assim que o zoom pedido passa de 2x,
  const pedidos = azulejosPedidos(p);                                    // só com os azulejos da vista de chegada
  assert.ok(pedidos.length > 0 && pedidos.length <= 9, "azulejos pedidos: " + pedidos.length);
  assert.ok(pedidos.every(u => /^\/mundo\/perto\/[0-3]-[0-3]\.png\?v=\d+$/.test(u)), pedidos.join());
  p.M.camera.zoomPara(2); p.rodar(80); centrar(p, bh.x, bh.y);
  await carregar(p); p.rodar(30);
  const b = p.M.niveis.brasil;
  assert.ok(b.perto.desenhados > 0, "os azulejos à vista são desenhados: " + JSON.stringify(b.perto));
  assert.ok(new Set(azulejosPedidos(p)).size === azulejosPedidos(p).length, "cada azulejo pedido uma vez");
  const semColisao = (m, rotulo) => {
    const b = m.M.niveis.brasil, todos = [...b.rotulos, ...b.nomes.map(n => ({ ...n, tipo: "capital" }))];
    for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) {
      assert.ok(!cruza(todos[i], todos[j]), `${rotulo}: ${todos[i].tipo} ${todos[i].id} cobre ${todos[j].tipo} ${todos[j].id}`);
    }
    for (const r of b.rotulos) for (const c of b.caixas) assert.ok(!cruza(r, c), `${rotulo}: ${r.tipo} ${r.id} cobre o ícone de ${c.id}`);
  };
  const estados2 = b.rotulos.filter(r => r.tipo === "estado");
  assert.ok(estados2.some(r => r.id === "MG"), "a 2x, o nome de Minas: " + estados2.map(r => r.id));
  assert.ok(!b.rotulos.some(r => r.tipo === "media"), "a 2x, ainda sem as cidades médias");
  semColisao(p, "2x");
  p.M.camera.zoomPara(3); p.rodar(80); centrar(p, bh.x, bh.y - 20);
  const medias = p.M.niveis.brasil.rotulos.filter(r => r.tipo === "media");
  assert.ok(medias.length >= 2, "a 3x, cidades médias à vista: " + medias.map(r => r.id));
  semColisao(p, "3x");
}

// a casa real (Mateus Leme) colada em Belo Horizonte: a 1x, nas três telas, a caixa da casa (chalé, bandeira e o halo
// no maior tamanho) não cobre a de BH; a bandeira e o halo ficam dentro da caixa da casa
async function casaEmMateusLeme() {
  for (const tela of [[640, 400, 1], [940, 800, 1], [390, 507, 3]]) {
    const v = await brasil({ tela, clima: { ...CLIMA, casa: "mateus-leme" } });
    v.rodar(3);
    const caixas = v.M.niveis.brasil.caixas, ml = caixas.find(c => c.id === "mateus-leme"), bh = caixas.find(c => c.id === "belo-horizonte");
    assert.ok(ml.bandeira && ml.halo, `${tela}: a casa traz a bandeira e o halo`);
    for (const r of [ml.bandeira, ml.halo]) {
      assert.ok(r.x >= ml.x && r.y >= ml.y && r.x + r.w <= ml.x + ml.w && r.y + r.h <= ml.y + ml.h, `${tela}: dentro da caixa da casa`);
    }
    assert.ok(!cruza(ml, bh), `${tela}: a casa cobre BH`);
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
      assert.ok(!cruza(caixas[i], caixas[j]), `${tela}: ${caixas[i].id} e ${caixas[j].id} se cobrem`);
    }
  }
}

// os estados: o cursor sobre uma UF (longe das cidades) a realça e põe nome e capital no status; o clique nela anuncia
// sem sair do mapa; o clique numa cidade continua descendo a ela; o foco de teclado numa cidade diz o estado dela
async function estados() {
  const ufs = MUNDO.niveis.brasil.ufs, letras = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const mapa = ufs.mapa.map(l => {
    const o = [];
    for (const [, c, n] of l.matchAll(/([.a-zA-Z])(\d+)/g)) for (let i = 0; i < +n; i++) o.push(c);
    return o;
  });
  const e = await brasil();
  e.rodar(3);
  const cam = e.M.camera, b = e.M.niveis.brasil, mg = letras[ufs.lista.findIndex(u => u.uf === "MG")];
  let alvo = null;   // um pixel de Minas a mais de 6 px de tela da caixa de todo ícone (o alvo do clique fica dentro dela)
  for (let y = 0; y < 400 && !alvo; y += 2) for (let x = 0; x < 400 && !alvo; x += 2) {
    if (mapa[y][x] !== mg) continue;
    const [sx, sy] = cam.tela(x + 0.5, y + 0.5);
    if (b.caixas.every(c => sx < c.x - 6 || sx > c.x + c.w + 6 || sy < c.y - 6 || sy > c.y + c.h + 6)) alvo = [sx, sy];
  }
  assert.ok(alvo, "um ponto de Minas longe das cidades");
  e.canvas.disparar("pointermove", { pointerId: 9, clientX: alvo[0], clientY: alvo[1], button: 0 });
  e.rodar(2);
  assert.equal(b.uf, "MG", "o cursor realça Minas");
  assert.match(e.elementos["mundo-estado"].textContent, /Minas Gerais.*Belo Horizonte/, "status com o estado e a capital");
  e.canvas.disparar("pointerleave", {}); e.rodar(2);
  assert.equal(b.uf, null, "fora do mapa, sem realce");
  assert.doesNotMatch(e.elementos["mundo-estado"].textContent, /Minas Gerais/);
  e.clicar(...alvo); e.rodar(20);
  assert.equal(e.M.nivel, "brasil", "o clique no estado não sai do mapa");
  assert.match(e.elementos["mundo-estado"].textContent, /Minas Gerais/);
  assert.equal(b.uf, "MG", "o toque deixa o estado realçado");
  const cb = b.caixas.find(c => c.id === "belo-horizonte");
  e.clicar(cb.x + cb.w / 2, cb.y + cb.h - 10); e.rodar(20);
  assert.equal(e.contexto.location.hash, "#cidade=belo-horizonte", "o estado não rouba o clique da cidade");
  // teclado: o foco numa cidade põe o estado dela no status (os estados não entram no Tab: um botão por cidade)
  const t = await brasil();
  t.rodar(3);
  const botoes = t.elementos["mundo-alvos"].filhos, i = MUNDO.cidades.findIndex(c => c.id === "recife");
  assert.equal(botoes.length, MUNDO.cidades.length, "só as cidades no Tab");
  botoes[i].disparar("focus"); t.rodar(2);
  assert.match(t.elementos["mundo-estado"].textContent, /Recife.*Pernambuco/);
  assert.equal(t.M.niveis.brasil.uf, "PE", "o foco realça o estado da cidade");
  botoes[i].disparar("blur"); t.rodar(2);
  assert.doesNotMatch(t.elementos["mundo-estado"].textContent, /Pernambuco/);
}

// o arranjo: a cidade com o ponto real fora da tela não é presa na borda (a 2x em Salvador, Aracaju e Maceió ficam no
// ponto delas, fora da vista); no celular a 1x, as linhas guia não se cruzam; os botões de Tab acompanham o ícone quando
// o atlas chega depois do clima
async function arranjoSemPuxarNemCruzar() {
  for (const [tela, id] of [[[640, 400, 1], "salvador"], [[940, 800, 1], "salvador"], [[940, 800, 1], "brasilia"]]) {
    const s = await brasil({ tela });
    s.rodar(2);
    const sa = cidade(id);
    s.M.camera.zoomPara(3); s.rodar(80); centrar(s, sa.x, sa.y);
    const W = tela[0] * tela[2], H = tela[1] * tela[2], cs = s.M.niveis.brasil.caixas;
    const fora = cs.filter(c => c.ax < 0 || c.ay < 0 || c.ax >= W || c.ay >= H);
    assert.ok(fora.length > 0, `${tela} ${id}: há cidades à beira, com o ponto fora da tela`);
    for (const c of fora) assert.ok(c.px === c.ax && c.py === c.ay, `${tela} ${id}: ${c.id} fora da tela e puxada para a borda`);
  }
  const chuva = { cidades: Object.fromEntries(MUNDO.cidades.map(c => [c.id, { tipo: "chuva", vento: 0, noite: false }])),
    casa: "mateus-leme", versao: 1 };
  const corta = ([a, b, c, d], [e, f, g, h]) => {   // os segmentos (a,b)-(c,d) e (e,f)-(g,h) se cruzam (não só se tocam)
    const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    return o(a, b, c, d, e, f) * o(a, b, c, d, g, h) < 0 && o(e, f, g, h, a, b) * o(e, f, g, h, c, d) < 0;
  };
  for (const tela of [[390, 507, 3], [390, 760, 3], [940, 800, 1]]) {
    const v = await brasil({ tela, clima: chuva });
    v.rodar(3);
    const guias = v.M.niveis.brasil.guias;
    for (let i = 0; i < guias.length; i++) for (let j = i + 1; j < guias.length; j++) {
      assert.ok(!corta(guias[i].s, guias[j].s), `${tela}: as linhas de ${guias[i].id} e ${guias[j].id} se cruzam`);
    }
  }
  // o atlas chega depois do clima: os botões se refazem no lugar novo do ícone
  const a = await abrir("#brasil", { passo: 50 });
  a.rodar(3);
  await carregar(a);
  a.rodar(3);
  const cam = a.M.camera, alvos = a.M.niveis.brasil.alvos();
  a.elementos["mundo-alvos"].filhos.forEach((b, i) => {
    const [x, y] = cam.tela(alvos[i].x, alvos[i].y);
    assert.equal(b.style.transform, `translate(${x}px, ${y - alvos[i].alto / 2}px)`, alvos[i].id);
  });
}
principal().catch(e => { console.error(e); process.exitCode = 1; });
