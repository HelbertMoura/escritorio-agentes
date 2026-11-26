// Planta do nível Cidade (o chão fica em mundo_cidade_chao.js; o desenho e a vida da rua, em mundo_cidade.js). Tudo sai de
// descritores de Recife, Manaus e Belo Horizonte ou uma semente com o id e os dados (porte, litoral e UF).
// A descrição abaixo vale para a planta procedural.
// - Ruas em grade reta, de dv em dv e de dh em dh. A câmera fica presa à caixa W×H, mas a grade segue até LONGE além
//   dela, para que a 1x, em qualquer formato de tela, não sobre chão vazio fora das quadras.
// - Quadra: calçada de C em volta e o miolo em duas filas. A quadra do meio é a do marco (o centro). Em volta dela, uma
//   quadra de parque (a praça com a fonte, ou o lago, e o coreto ou a feira, árvores e canteiros) e uma de esporte (o
//   campo e a quadra ou o parquinho). As outras filas são de prédios (o prédio no meio e, nos cantos, o mobiliário da
//   rua ou uma árvore) ou de lotes de casas e chalés, cada lote com a sua cerca ou sebe.
// - O porte (metrópole, grande, média, pequena) decide quantas filas são de prédios, quais prédios (torres ou prédios
//   baixos e serviços) e quantos carros e pedestres há. A região decide as árvores.
// - Litoral: a rua v1 vira a avenida da praia; depois dela, o calçadão, a areia (com quiosque, guarda-sóis, píer, farol e
//   coqueiros) e o mar. Lá não há quadra nem rua; os carros andam só nas ruas verticais.
// - Cada peça leva o pé (x, y), onde o desenho se apoia, e r = [x0, y0, x1, y1], a vaga que ocupa no chão: nenhuma
//   vaga cruza outra, e nenhuma fica na rua.
// - Os pedestres andam por uma rede: quatro cantos de calçada em volta de cada cruzamento, ligados pelas calçadas e
//   pelas faixas de pedestre (no litoral, também pelo calçadão).
"use strict";
const CidadePlanta = (() => {
  const W = 576, H = 400, E = 32, C = 8, LONGE = 600;   // E: largura da rua; C: da calçada
  const PE = E / 2 + C / 2;   // do eixo da rua ao meio da calçada, por onde andam os pedestres
  const CALCADAO = 12, AREIA = 70;   // a orla, da avenida para o mar
  // filas de prédios no anel em volta do marco e nos arredores, a parte de torres, carros e pedestres
  const PORTES = {
    metropole: { predios: 0.9, fora: 0.55, altos: 0.8, carros: 8, onibus: 2, bicis: 3, pedestres: [14, 18] },
    grande: { predios: 0.6, fora: 0.3, altos: 0.5, carros: 6, onibus: 1, bicis: 2, pedestres: [11, 14] },
    media: { predios: 0.3, fora: 0.12, altos: 0.2, carros: 5, onibus: 1, bicis: 2, pedestres: [8, 12] },
    pequena: { predios: 0.15, fora: 0.03, altos: 0, carros: 3, onibus: 0, bicis: 2, pedestres: [6, 9] },
  };
  const ALTOS = [1, 3, 5, 12], BAIXOS = [2, 4, 6, 7, 11];
  // os serviços (igreja 9, hospital 10, mercado 14, bombeiros 13, posto 8, padaria 7), na ordem em que entram
  const SERVICOS = { metropole: [10, 14, 13, 8, 9], grande: [14, 10, 9, 8, 13], media: [9, 14, 10, 8], pequena: [9, 7, 14, 8] };
  const REGIAO = { AC: "N", AP: "N", AM: "N", PA: "N", RO: "N", RR: "N", TO: "N", AL: "NE", BA: "NE", CE: "NE", MA: "NE",
    PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE", DF: "CO", GO: "CO", MT: "CO", MS: "CO", ES: "SE", MG: "SE", RJ: "SE",
    SP: "SE", PR: "S", RS: "S", SC: "S" };
  // as árvores de cada região, com repetição para pesar: palmeira (3) e coqueiro (7) no Norte e Nordeste, pinheiro (6) no
  // Sul, ipê amarelo (2) e roxo (4) no Centro-Oeste e Sudeste, a árvore redonda (1) e a laranjeira (5) em toda parte
  const ARVORES = { N: [1, 3, 7, 5, 1, 3], NE: [3, 7, 1, 5, 3, 7], CO: [2, 4, 1, 5, 2, 1], SE: [1, 1, 4, 2, 5, 1], S: [6, 1, 6, 4, 6, 5] };
  const CHALES = { N: 0.2, NE: 0.15, CO: 0.3, SE: 0.35, S: 0.65 };   // a parte de chalés entre as casas
  const CASAS = { metropole: [5, 3, 5, 6, 3], grande: [1, 2, 3, 5, 6], media: [1, 2, 3, 4, 6], pequena: [1, 2, 3, 4, 6, 1, 2] };
  // os marcos que já são igreja (a cidade não ganha a predios-9 além deles)
  const IGREJAS = new Set(["matriz-mateus-leme", "catedral-fortaleza", "igreja-rosario", "pampulha", "convento-penha", "pelourinho"]);
  // a altura do desenho da praça no atlas (a fonte e o lago), para o coreto atrás dela ficar a FOLGA_PRACA px
  const ALTURA_PRACA = { "praca-1": 68, "lazer-3": 80 }, FOLGA_PRACA = 4;
  const MOBILIA = ["banca-1", "ponto-onibus-1", "banco-poste-1", "carrinho-1", "rua-1", "rua-2", "rua-3"];
  // as construções que mostram o nome (clique, toque ou Tab); o marco usa o nome do ponto turístico
  const NOMES = { "predios-9": "Igreja", "predios-10": "Hospital", "predios-14": "Mercado Municipal", "predios-13": "Bombeiros",
    "lazer-1": "Campo de Futebol", "lazer-4": "Coreto", "lazer-3": "Lago da Praça", "praca-1": "Praça da Fonte",
    "lazer-5": "Feira Livre", "praia-3": "Farol", "cidade-recife": "Casario da Orla",
    "cidade-manaus": "Mercado Adolpho Lisboa", "cidade-bh-serra-curral": "Serra do Curral" };
  // nomes de rua de mentira, para as placas das esquinas (a partir de 2x)
  const RUAS = ["R. das Flores", "R. do Sol", "Av. Central", "R. dos Ipês", "R. da Matriz", "R. Nova", "Av. das Palmeiras",
    "R. do Comércio", "R. da Paz", "R. das Acácias", "R. do Rosário", "Av. da Saudade", "R. do Mercado", "R. da Esperança",
    "R. das Mangueiras", "R. Boa Vista", "R. do Campo", "R. dos Pássaros", "R. da Aurora", "R. das Hortênsias"];

  // FNV-1a na semente, mulberry32 nos sorteios
  function sorteio(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // os índices k das ruas a0 + k·d que cobrem de -LONGE a fim + LONGE (com uma quadra inteira de cada lado)
  function indices(a0, d, fim) {
    const l = [];
    for (let k = Math.floor((-LONGE - a0) / d); a0 + (k - 1) * d < fim + LONGE; k++) l.push(k);
    return l;
  }

  // cidade: { porte, litoral, uf, marco, regiao } (o que faltar vale cidade média, sem praia, no Sudeste; a regiao, das
  // cidades de fora do Brasil, escolhe as árvores no lugar da UF)
  function planta(id, cidade = {}) {
    if (Object.hasOwn(MALHAS, id)) return plantaUrbana(id, cidade, MALHAS[id]);
    const r = sorteio(String(id));
    const entre = (a, b) => a + Math.floor(r() * (b - a + 1));
    const um = l => l[Math.floor(r() * l.length)];
    const embaralhar = l => {
      for (let i = l.length - 1; i > 0; i--) { const m = Math.floor(r() * (i + 1)); [l[i], l[m]] = [l[m], l[i]]; }
      return l;
    };
    const porte = PORTES[cidade.porte] ? cidade.porte : "media", P = PORTES[porte], regiao = ARVORES[cidade.regiao] ? cidade.regiao : REGIAO[cidade.uf] || "SE";
    const igreja = IGREJAS.has(cidade.marco);
    const arvore = () => "arvore-" + um(ARVORES[regiao]);
    const v0 = 176 + 4 * entre(-4, 4), v1 = 400 + 4 * entre(-4, 4), h0 = 112 + 4 * entre(-2, 2), h1 = 304 + 4 * entre(-2, 2);
    const dv = v1 - v0, dh = h1 - h0, rv = k => v0 + k * dv, rh = k => h0 + k * dh;
    const orla = cidade.litoral ? { x: v1 + E / 2 } : null;   // calçadão de x a x + CALCADAO, areia até mar, depois o mar
    if (orla) { orla.areia = orla.x + CALCADAO; orla.mar = orla.areia + AREIA; }
    const kv = indices(v0, dv, W).filter(k => !orla || k <= 1), kh = indices(h0, dh, H);
    const ruas = { v: kv.map(rv), h: kh.map(rh) };

    // quadras e filas: anel 0 é o marco, 1 a cidade, 2 em diante os arredores
    const quadras = [], filas = [];
    for (const b of kh.slice(0, -1)) for (const a of kv.slice(0, -1)) {
      const q = { a, b, x0: rv(a) + E / 2, x1: rv(a + 1) - E / 2, y0: rh(b) + E / 2, y1: rh(b + 1) - E / 2,
                  anel: Math.max(Math.abs(a), Math.abs(b)), centro: a === 0 && b === 0, zona: null };
      quadras.push(q);
      if (q.centro) { q.zona = "centro"; continue; }
      const meio = Math.round((q.y0 + q.y1) / 2);
      for (const fila of [0, 1]) {
        filas.push({ q, fila, x0: q.x0 + C, x1: q.x1 - C, y0: fila ? meio : q.y0 + C, y1: fila ? q.y1 - C : meio });
      }
    }
    const vaga = l => [l.x0, l.y0, l.x1, l.y1];
    const parte = (l, x0, x1) => ({ ...l, x0, x1 });
    const lotes = f => { const m = Math.round((f.x0 + f.x1) / 2); return [parte(f, f.x0, m), parte(f, m, f.x1)]; };
    const noLote = (l, peca, recuo = 2, folga = 4) =>
      ({ x: Math.round((l.x0 + l.x1) / 2) + entre(-folga, folga), y: l.y1 - recuo, peca, r: vaga(l) });
    const quadra = (a, b) => quadras.find(q => q.a === a && q.b === b);
    const de = (q, fila) => filas.find(f => f.q === q && f.fila === fila);

    const pecas = [], pisos = [], cercas = [], notaveis = [];
    const por = (s, zona) => { s.zona = zona; if (NOMES[s.peca]) notaveis.push(s); pecas.push(s); return s; };
    const mobilia = embaralhar(MOBILIA.slice());
    // os cantos de uma fila com uma peça no meio: o mobiliário (enquanto houver, nos cantos que aparecem a 1x), uma
    // árvore ou um canteiro
    function cantos(f, lado, zona, so) {
      for (const l of [parte(f, f.x0, f.x0 + lado), parte(f, f.x1 - lado, f.x1)]) {
        const u = r(), aparece = l.x0 > 0 && l.x1 < W && l.y1 > 20 && l.y0 < H;
        if (mobilia.length && so !== "verde" && aparece) por(noLote(l, mobilia.pop(), 3, 1), zona);
        else if (u < 0.55) por(noLote(l, arvore(), 12, 2), zona);
        else if (u < 0.8) por(noLote(l, "canteiro-" + entre(1, 2), 4, 1), zona);
      }
    }
    const ladoDe = f => Math.max(14, Math.min(40, Math.round((f.x1 - f.x0 - 108) / 2)));
    function fileira(f, peca, zona, piso, so) {   // a peça no meio da fila inteira e os cantos
      const lado = ladoDe(f);
      if (piso) pisos.push({ r: vaga(f), piso });
      cantos(f, lado, zona, so);
      return por(noLote(parte(f, f.x0 + lado, f.x1 - lado), peca, 3, 2), zona);
    }
    function lote(l, zona) {   // um lote de casa: a casa (às vezes com uma árvore ao lado), uma árvore ou uma horta
      const u = r(), frente = l.fila === 1 && l.q.anel <= 2;
      cercas.push({ r: vaga(l), tipo: r() < 0.5 ? "sebe" : "cerca", porta: null });
      if (u < 0.1) return por(noLote(l, arvore(), 14, 6), zona);
      if (u < 0.15) return por(noLote(l, "canteiro-2", 10, 4), zona);
      const nome = r() < CHALES[regiao] ? "chale-" + entre(1, 8) : "casa-" + um(CASAS[porte]), w = l.x1 - l.x0;
      let casa = l;
      const extra = r();
      if (extra < 0.75 && w >= 80) {   // a casa num lado e, no outro, uma árvore recuada ou um canteiro de flores na frente
        const m = r() < 0.5 ? l.x0 + w - 28 : l.x0 + 28;
        const [a, b] = m > l.x0 + w / 2 ? [parte(l, l.x0, m), parte(l, m, l.x1)] : [parte(l, m, l.x1), parte(l, l.x0, m)];
        casa = a;
        por(extra < 0.55 ? noLote(b, arvore(), 16, 0) : noLote(b, "canteiro-1", 6, 0), zona);
      }
      const s = por(noLote(casa, nome, frente ? 8 : 3, 2), zona);
      if (frente) cercas[cercas.length - 1].porta = s.x;   // o caminho da calçada até a porta
      return s;
    }
    const predio = (lista, altos) => "predios-" + (lista.length ? lista.shift() : um(r() < altos ? ALTOS : BAIXOS));

    // as zonas em volta do marco, pela semente: o parque num lado ou em cima do marco (no litoral, do lado da terra; na
    // cidade pequena, sempre num lado, com o coreto à vista) e o esporte em outra quadra do anel (nunca na da casa; na
    // metrópole, fora dos lados, que ficam para as torres)
    const lado = orla ? -1 : r() < 0.5 ? -1 : 1, emCima = !orla && porte !== "pequena" && r() < 0.3;
    const qParque = emCima ? quadra(0, -1) : quadra(lado, 0);
    const livres = [[-lado, 0], [lado, -1], [-lado, -1], [lado, 1], [-lado, 1], [0, -1]].map(([a, b]) => quadra(a, b))
      .filter(q => q && q !== qParque && (porte !== "metropole" || q.b !== 0));
    const qEsporte = porte === "metropole" || r() < 0.45 ? um(livres) : livres[0];
    qParque.zona = "parque"; qEsporte.zona = "esporte";

    // o parque: na fila da frente a praça (a fonte, ou o lago numa fila larga); na de trás o coreto (ou a feira) com os
    // cantos, o pé recuado o bastante para o desenho da praça não encostar nele (FOLGA_PRACA px entre os dois)
    const frente = de(qParque, 1), fundo = de(qParque, 0), largo = frente.x1 - frente.x0 >= 176;
    pisos.push({ r: [qParque.x0 + C, qParque.y0 + C, qParque.x1 - C, qParque.y1 - C], piso: "parque" });
    const praca = por(noLote(frente, largo && r() < 0.4 ? "lazer-3" : "praca-1", 2, 0), "parque");
    const feiraNoParque = porte !== "pequena" && r() < 0.35;
    const ladoP = ladoDe(fundo), recuoP = Math.max(6, fundo.y1 - (praca.y - ALTURA_PRACA[praca.peca] - FOLGA_PRACA));
    por(noLote(parte(fundo, fundo.x0 + ladoP, fundo.x1 - ladoP), feiraNoParque ? "lazer-5" : "lazer-4", recuoP, 2), "parque");
    const cantoP = parte(fundo, fundo.x0, fundo.x0 + ladoP), vePraca = cantoP.x0 > 0 && cantoP.x1 < W;   // um banco ou banca na praça
    por(vePraca && mobilia.length ? noLote(cantoP, mobilia.pop(), 3, 1) : noLote(cantoP, arvore(), 12, 2), "parque");
    const sorvete = por(noLote(parte(fundo, fundo.x1 - ladoP, fundo.x1), "rua-4", 3, 0), "parque");   // parado junto ao parque

    // o esporte: o campo e a quadra ou o parquinho (o que sobra vai para os arredores)
    const [jogo, sobra] = r() < 0.5 ? ["lazer-6", "lazer-2"] : ["lazer-2", "lazer-6"];
    fileira(de(qEsporte, 0), "lazer-1", "esporte", null, "verde");
    fileira(de(qEsporte, 1), jogo, "esporte", null, "verde");

    // o anel do marco: a fila da casa, as de prédios (as que aparecem a 1x primeiro) e as de lotes
    const anel = filas.filter(f => f.q.anel === 1 && !f.q.zona);
    const filaCasa = de(quadra(0, 1), 0);
    const aparece = f => (f.q.b === -1 && f.fila === 1) || f.q.b === 0 || (f.q.b === 1 && f.fila === 0);
    const frenteCasa = de(quadra(0, 1), 1);   // na frente da casa, só lotes baixos: nada de prédio cobrindo o chalé
    const resto = anel.filter(f => f !== filaCasa && f !== frenteCasa);
    const ordem = [...embaralhar(resto.filter(aparece)), ...embaralhar(resto.filter(f => !aparece(f)))];
    const servicos = SERVICOS[porte].filter(n => !(igreja && n === 9));   // o marco que já é igreja não ganha outra
    const nPredios = Math.max(1, Math.min(ordem.length - (feiraNoParque ? 0 : 1), Math.round(P.predios * ordem.length)));
    for (const f of ordem.slice(0, nPredios)) {   // na metrópole, as torres nas filas que aparecem inteiras; os serviços nas outras
      f.q.zona = f.q.zona || "centro";
      fileira(f, porte === "metropole" && aparece(f) ? "predios-" + um(ALTOS) : predio(servicos, P.altos), "centro", "concreto");
    }
    const lotesAnel = ordem.slice(nPredios);
    if (!feiraNoParque && lotesAnel.length) fileira(lotesAnel.shift(), "lazer-5", "centro", "praca");
    for (const f of [...lotesAnel, frenteCasa]) { f.q.zona = f.q.zona || "casas"; for (const l of lotes(f)) lote(l, "casas"); }

    const meio = Math.round((v0 + v1) / 2);
    const [l1, l2] = lotes(filaCasa), loteCasa = Math.abs((l1.x0 + l1.x1) / 2 - meio) <= Math.abs((l2.x0 + l2.x1) / 2 - meio) ? l1 : l2;
    const casa = { ...noLote(loteCasa, "chale-2", 2, 0), arvore: arvore(), zona: "casas" };
    cercas.push({ r: vaga(loteCasa), tipo: "cerca", porta: null });
    lote(loteCasa === l1 ? l2 : l1, "casas");

    // os arredores: prédios (pelo porte), lotes, o lazer que sobrou e os serviços que não couberam perto do marco
    const fora = embaralhar(filas.filter(f => f.q.anel > 1));
    const perto = fora.filter(f => f.q.anel === 2).sort((a, b) => Math.hypot(a.q.a, a.q.b) - Math.hypot(b.q.a, b.q.b));
    const usadas = new Set();
    if (perto.length) { fileira(perto[0], sobra, "esporte", null, "verde"); usadas.add(perto[0]); }
    for (const f of perto.slice(1, 1 + servicos.length)) { fileira(f, predio(servicos, P.altos), "centro", "concreto"); usadas.add(f); }
    for (const f of fora) {
      if (usadas.has(f)) continue;
      if (r() < P.fora) fileira(f, predio([], P.altos), "centro", "concreto", "verde");
      else for (const l of lotes(f)) lote(l, "casas");
    }

    // a orla: em cada faixa de altura de uma fila, coqueiros, quiosque e guarda-sóis na areia, o píer na água e um farol
    if (orla) {
      const faixas = kh.slice(0, -1).flatMap(b => {
        const y0 = rh(b) + E / 2 + C, y1 = rh(b + 1) - E / 2 - C, m = Math.round((y0 + y1) / 2);
        return [[y0, m], [m, y1]];
      });
      const terra = [orla.areia + 2, orla.areia + 34], agua = [orla.areia + 36, orla.mar - 4];
      const naAreia = ([x0, x1], [y0, y1], peca, recuo) => por(noLote({ x0, x1, y0, y1 }, peca, recuo, 2), "orla");
      const vistas = faixas.filter(([y0, y1]) => y1 > 0 && y0 < H);
      const farol = vistas.length ? um([vistas[0], vistas[vistas.length - 1]]) : null;
      faixas.forEach((y, i) => {
        if (y === farol) { naAreia(agua, y, "praia-3", 4); naAreia(terra, y, "arvore-" + um([3, 7]), 14); return; }
        const u = r();
        naAreia(terra, y, u < 0.3 ? "praia-1" : u < 0.85 ? "arvore-" + um([3, 7]) : "praia-2", 10);
        if (i % 3 === 1) {   // o píer com o pé na linha d'água: o deque sai da areia molhada e entra no mar
          const [y0, y1] = y;
          por({ x: orla.mar + 8, y: y1 - 6, peca: "praia-4", r: [orla.mar - 14, y0, orla.mar + 30, y1] }, "orla");
        } else if (r() < 0.75) naAreia(agua, y, "praia-2", 12);
      });
    }

    // a quadra do marco: o marco no meio da praça de pedra e, nos cantos, um dos arranjos (pela semente): árvores atrás e
    // canteiros na frente, o contrário, um bosque (quatro árvores) ou um jardim (quatro canteiros)
    const qc = quadras.find(q => q.centro), cx0 = qc.x0 + C, cx1 = qc.x1 - C, cy0 = qc.y0 + C, cy1 = qc.y1 - C, canto = 26;
    const generico = igreja ? [2] : porte === "pequena" ? [2, 9] : ALTOS;
    const centro = { x: meio, y: cy1 - 4, peca: "predios-" + um(generico), zona: "centro", r: [cx0 + canto, cy0, cx1 - canto, cy1] };
    pisos.push({ r: [cx0, cy0, cx1, cy1], piso: "praca" });
    const arranjo = um(["fundo", "frente", "bosque", "jardim"]);
    const ARRANJOS = { fundo: ["a", "c"], frente: ["c", "a"], bosque: ["a", "a"], jardim: ["c", "c"] };
    for (const [x0, x1] of [[cx0, cx0 + canto], [cx1 - canto, cx1]]) {
      const m = Math.round((cy0 + cy1) / 2);
      ARRANJOS[arranjo].forEach((o, k) => {
        const l = { x0, x1, y0: k ? m : cy0, y1: k ? cy1 : m };
        por(o === "a" ? noLote(l, arvore(), 4, 0) : noLote(l, "canteiro-1", 3, 0), "centro");
      });
    }

    // carros nas ruas do meio (no litoral, só nas verticais: as horizontais acabam na avenida da praia). As faixas de
    // cada sentido levam os carros por igual, a uma volta dividida entre eles. Nenhum começa dentro de um cruzamento: lá
    // dentro só cabe um veículo por vez (mundo_cidade.js)
    const faixasCarro = [];
    for (const eixo of orla ? ["v"] : ["h", "v"]) {
      for (const rua of eixo === "h" ? [h0, h1] : [v0, v1]) for (const dir of [1, -1]) faixasCarro.push({ eixo, rua, dir });
    }
    embaralhar(faixasCarro);
    const carros = [], nF = faixasCarro.length, livre = (s, cruzes) => cruzes.every(k => Math.abs(s - k) >= E / 2 + 16);
    faixasCarro.forEach((f, j) => {
      const L = f.eixo === "h" ? W : H, cruzes = f.eixo === "h" ? [v0, v1] : [h0, h1], m = Math.floor((P.carros - 1 - j) / nF) + 1;
      const s0 = Math.round(r() * L), v = 16 + Math.round(r() * 14);
      for (let k = 0; k < m; k++) {
        let s = Math.round(s0 + k * L / m) % L;
        while (!livre(s, cruzes)) s = (s + 4) % L;
        carros.push({ eixo: f.eixo, rua: f.rua, dir: f.dir, s, v, peca: "carro-" + entre(1, 5) });
      }
    });
    // ônibus (mais devagar que os carros) e bicicletas (mais ainda), nas mesmas faixas: quem vem atrás espera. Cada um
    // começa fora dos cruzamentos e longe dos outros veículos da faixa
    const extras = [...Array(P.onibus).fill("onibus"), ...Array(P.bicis).fill("bici")];
    extras.forEach((tipo, j) => {
      const f = faixasCarro[(j * 3 + 1) % nF], L = f.eixo === "h" ? W : H, cruzes = f.eixo === "h" ? [v0, v1] : [h0, h1];
      const onibus = tipo === "onibus", folga = onibus ? 24 : 16;
      const longe = s => carros.every(o => o.eixo !== f.eixo || o.rua !== f.rua || o.dir !== f.dir || Math.abs(o.s - s) >= 36);
      const cabe = s => cruzes.every(c => Math.abs(s - c) >= E / 2 + folga) && longe(s);
      let s = Math.round(r() * L), k = 0;
      for (; k < L / 4 && !cabe(s); k++) s = (s + 4) % L;
      if (!cabe(s)) return;   // a faixa lotou: fica sem esse
      carros.push({ eixo: f.eixo, rua: f.rua, dir: f.dir, s, v: onibus ? 12 + Math.round(r() * 4) : 8 + Math.round(r() * 5),
        peca: onibus ? "onibus-cima-" + entre(1, 2) : "bici-" + entre(1, 3) });
    });
    const postes = [];   // nas quinas dos quatro cruzamentos do meio (os cordões das festas vão de um a outro)
    for (const x of [v0, v1]) for (const y of [h0, h1]) for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      postes.push([x + dx * (E / 2 + 1), y + dy * (E / 2 + 1)]);
    }

    // a rede dos pedestres: os cruzamentos das ruas -1 a 2 (em volta da cidade; no litoral, até a avenida da praia, com o
    // calçadão do outro lado); cantos 0 NO, 1 NE, 2 SO, 3 SE
    const ni = orla ? 3 : 4, nos = [], viz = [], no = (i, j, c) => (i * 4 + j) * 4 + c;
    for (let i = 0; i < ni; i++) for (let j = 0; j < 4; j++) for (let c = 0; c < 4; c++) {
      nos.push([rv(i - 1) + (c % 2 ? PE : -PE), rh(j - 1) + (c > 1 ? PE : -PE)]);
      viz.push([]);
    }
    const ligar = (a, b) => { viz[a].push(b); viz[b].push(a); };
    for (let i = 0; i < ni; i++) for (let j = 0; j < 4; j++) {
      ligar(no(i, j, 0), no(i, j, 1)); ligar(no(i, j, 2), no(i, j, 3));   // faixas sobre a rua vertical
      ligar(no(i, j, 0), no(i, j, 2)); ligar(no(i, j, 1), no(i, j, 3));   // faixas sobre a rua horizontal (ou o calçadão)
      if (i < ni - 1) { ligar(no(i, j, 1), no(i + 1, j, 0)); ligar(no(i, j, 3), no(i + 1, j, 2)); }   // calçadas para o leste
      if (j < 3) { ligar(no(i, j, 2), no(i, j + 1, 0)); ligar(no(i, j, 3), no(i, j + 1, 1)); }   // calçadas para o sul
    }
    // peso de cada canto: os de dentro da caixa valem mais, para os pedestres saírem da vista e logo voltarem; eles
    // nascem num canto de dentro
    const peso = nos.map(([x, y]) => x > 0 && x < W && y > 0 && y < H ? 1 : 0.15), dentro = nos.map((_, i) => i).filter(i => peso[i] === 1);
    const pedestres = [];
    for (let i = 0, n = entre(...P.pedestres); i < n; i++) {
      const de0 = dentro[Math.floor(r() * dentro.length)], para = viz[de0][Math.floor(r() * viz[de0].length)];
      const [x0, y0] = nos[de0], [x1, y1] = nos[para];
      pedestres.push({ de: de0, para, s: Math.round(r() * Math.hypot(x1 - x0, y1 - y0)), v: 8 + Math.round(r() * 5), semente: `${id}#${i}` });
    }

    const nomes = embaralhar(RUAS.slice()), nomeRua = { v: {}, h: {} };   // o nome de cada rua do meio, para as placas
    ruas.v.forEach((x, i) => { nomeRua.v[x] = orla && x === v1 ? "Av. Beira-Mar" : nomes[i % nomes.length]; });
    ruas.h.forEach((y, i) => { nomeRua.h[y] = nomes[(i + ruas.v.length) % nomes.length]; });

    const cruzamentos = [[v0, h0], [v1, h0], [v0, h1], [v1, h1]];   // os quatro do meio, os únicos com carros nas duas ruas
    return { W, H, ruas, quadras, centro, casa, praca, sorvete, pecas, arranjo, pisos, cercas, notaveis, orla, porte, regiao,
             zonas: { centro: qc, parque: qParque, esporte: qEsporte }, carros, postes, cruzamentos, nomeRua,
             rede: { nos, viz, peso }, pedestres };
  }

  // Coordenadas da cena em pixels do mundo. O circuito usa os primeiros vértices na ordem declarada.
  // Os demais trechos são ruas locais. Toda conexão entre ruas compartilha um vértice.
  const MALHAS = {
    recife: {
      caixa: [0, 0, 640, 484], regiao: "NE", resumo: "duas margens do Capibaribe ligadas por pontes, com casario e Marco Zero junto ao cais",
      nos: [[64, 112], [232, 112], [382, 112], [543, 112], [560, 173], [560, 296], [527, 348], [378, 348],
        [231, 348], [68, 348], [42, 285], [42, 166], [237, 221], [386, 231], [67, 16], [224, 16]],
      volta: 12, pontes: [1, 7], locais: [[1, 12, 8], [2, 13, 7], [0, 14, 15, 1]],
      nomes: ["Rua da Aurora", "Ponte Maurício de Nassau", "Rua do Bom Jesus", "Rua do Apolo", "Av. Alfredo Lisboa",
        "Av. Alfredo Lisboa", "Cais do Marco Zero", "Ponte Buarque de Macedo", "Rua do Sol", "Rua Nova", "Rua do Imperador", "Praça da República"],
      nomesLocais: ["Cais José Mariano", "Rua da Moeda", "Rua da União"],
      agua: [
        { tipo: "canal", pontos: [[256, -900], [348, -900], [346, 67], [336, 150], [348, 228], [348, 275],
          [335, 310], [332, 381], [346, 485], [347, 1450], [261, 1450], [265, 484], [269, 389],
          [263, 307], [263, 256], [268, 205], [259, 153], [257, 71]] },
        { tipo: "estuário", pontos: [[631, -900], [1600, -900], [1600, 1450], [630, 1450], [634, 430],
          [606, 380], [607, 326], [616, 302], [616, 237], [624, 221], [624, 172], [613, 153], [613, 100], [631, 70]] },
      ],
      cais: [[[599, 170], [613, 170], [622, 181], [622, 220], [614, 236], [614, 299], [606, 321], [597, 318]]],
      pedra: "recife-pedra",
      quadras: [
        // As lajes chegam ao meio-fio. As ruas, travessias e caminhos passam por cima do acabamento.
        ["concreto", [[80, 32], [210, 32], [216, 97], [77, 97]]],
        ["concreto", [[390, 38], [415, 25], [539, 25], [562, 55], [563, 108], [380, 108]]],
        ["praca", [[59, 127], [220, 127], [223, 216], [220, 333], [73, 333], [55, 288], [55, 205]]],
        ["praca", [[394, 126], [540, 126], [547, 177], [546, 288], [520, 337], [391, 337]]],
        ["concreto", [[62, 360], [220, 360], [245, 409], [245, 455], [228, 477],
          [89, 477], [63, 459], [54, 410]]],
        ["concreto", [[385, 361], [528, 361], [557, 434], [378, 434]]],
        ["concreto", [[547, 108], [613, 108], [613, 153], [624, 175], [624, 221], [616, 239], [616, 303],
          [607, 327], [605, 374], [616, 401], [585, 406], [543, 365], [565, 300]]],
        ["concreto", [[246, 144], [267, 143], [279, 227], [272, 325], [245, 334]]],
        ["concreto", [[332, 126], [368, 126], [372, 236], [361, 334], [327, 334], [342, 233]]],
        // Percursos visuais dentro das áreas pavimentadas, sem acrescentar arestas à rede.
        ["passeio", [[55, 195], [222, 195], [222, 211], [156, 211], [147, 223],
          [120, 223], [112, 211], [55, 211]]],
        ["passeio", [[423, 227], [538, 227], [538, 243], [488, 243], [471, 260],
          [471, 331], [454, 331], [454, 253], [423, 248]]],
        ["passeio", [[550, 134], [588, 134], [601, 147], [601, 206], [590, 217],
          [578, 211], [584, 202], [584, 155], [561, 155]]],
        ["passeio", [[102, 365], [117, 365], [117, 427], [153, 427], [164, 441],
          [164, 477], [148, 477], [148, 449], [110, 449], [102, 442]]],
        ["jardim", [[66, 394], [91, 394], [95, 431], [106, 453], [99, 463], [80, 463], [68, 451], [62, 416]]],
        ["jardim", [[187, 400], [204, 390], [226, 407], [238, 423], [238, 451],
          [224, 469], [177, 469], [174, 445], [187, 435]]],
        ["jardim", [[590, 119], [606, 120], [607, 143], [600, 148], [590, 135]]],
        ["jardim", [[85, 307], [116, 307], [128, 319], [120, 327], [81, 327], [77, 319]]],
        ["jardim", [[181, 300], [213, 300], [212, 326], [174, 326], [174, 310]]],
        ["jardim", [[397, 297], [416, 292], [427, 303], [424, 319], [395, 321]]],
        ["jardim", [[575, 206], [604, 206], [599, 222], [593, 228], [600, 247], [604, 271],
          [597, 278], [578, 278], [580, 249], [575, 234]]],
        ["jardim", [[480, 407], [515, 399], [533, 416], [538, 424], [479, 425]]],
        ["jardim", [[393, 403], [414, 402], [417, 422], [388, 422]]],
        ["jardim", [[570, 374], [594, 374], [606, 394], [598, 403], [583, 401]]],
      ],
      centro: ["predios-2", 467, 250, [409, 135, 525, 253]],
      tituloCentro: "Marco Zero · Recife Antigo",
      casa: [156, 430, [120, 370, 192, 433]],
      praca: [138, 285, [69, 211, 212, 291]],
      lotes: [
        ["recife-frente", 139, 196, [78, 134, 201, 198], "casa-4"],
        ["cidade-recife", 469, 317, [429, 258, 513, 321], "predios-6"],
        ["arvore-7", 413, 312, [405, 293, 424, 317]],
        ["arvore-3", 199, 312, [185, 298, 211, 317]], ["arvore-3", 91, 319, [85, 309, 108, 322]],
        ["casa-3", 444, 420, [416, 374, 467, 424]], ["arvore-7", 507, 419, [490, 403, 525, 424]],
        ["casa-1", 176, 88, [145, 38, 204, 90]], ["casa-5", 435, 79, [403, 18, 470, 86]],
        ["casa-6", 114, 86, [89, 41, 142, 88]], ["casa-2", 514, 81, [483, 36, 544, 86]],
        ["arvore-7", 550, 62, [545, 57, 556, 66]], ["arvore-3", 252, 68, [250, 64, 254, 73]],
        ["canteiro-2", 409, 414, [390, 395, 415, 417]],
        ["arvore-7", 80, 440, [66, 405, 97, 441]], ["arvore-3", 213, 458, [201, 430, 229, 461]],
        ["arvore-7", 590, 224, [584, 206, 603, 229]], ["arvore-3", 592, 267, [583, 252, 608, 274]],
        ["banco-poste-1", 525, 278, [515, 271, 536, 281]], ["arvore-7", 589, 389, [574, 375, 601, 397]],
      ],
      acessos: [[0, -1, [147, 84]], [8, -1, [108, 377], [108, 438], [156, 438], [156, 430]],
        [6, 1, [458, 323]], [10, 1, [74, 268]], [4, -1, [604, 236]], [4, 1, [525, 235]]],
    },
    manaus: {
      caixa: [0, 0, 640, 466], regiao: "N", resumo: "o Teatro Amazonas e o Mercado Adolpho Lisboa ligados à orla e ao porto do Rio Negro",
      nos: [[67, 114], [140, 88], [310, 94], [488, 117], [571, 164], [591, 225], [555, 315],
        [471, 349], [319, 344], [167, 350], [64, 303], [39, 215], [290, 207], [343, 193], [142, -22], [491, -20]],
      volta: 12, pontes: [], locais: [[2, 12, 8], [12, 13, 4], [1, 14, 15, 3]],
      nomes: ["Rua 10 de Julho", "Rua José Clemente", "Rua Ramos Ferreira", "Rua Ferreira Pena", "Rua dos Andradas",
        "Rua Marquês de Santa Cruz", "Av. Lourenço Braga", "Av. Lourenço Braga", "Rua dos Barés", "Rua da Instalação", "Rua Bernardo Ramos", "Rua Monsenhor Coutinho"],
      nomesLocais: ["Rua Eduardo Ribeiro", "Rua Henrique Martins", "Rua Ferreira Pena"],
      agua: [{ tipo: "rio", pontos: [[-900, 356], [19, 359], [110, 374], [193, 399], [330, 391], [469, 399],
        [550, 379], [627, 340], [674, 317], [1600, 313], [1600, 1450], [-900, 1450]] }],
      cais: [[[111, 360], [193, 380], [330, 374], [469, 381], [546, 360], [622, 323], [631, 340], [550, 381],
        [470, 402], [330, 394], [193, 402], [107, 377]], [[352, 385], [437, 390], [444, 424], [357, 419]]],
      acabamento: "porto",
      quadras: [
        ["praca", [[82, 126], [143, 105], [289, 110], [269, 204], [298, 329], [169, 332], [79, 291], [57, 216]]],
        ["concreto", [[326, 111], [484, 132], [515, 151], [340, 177], [311, 183]]],
        ["concreto", [[310, 219], [350, 210], [559, 182], [574, 224], [542, 304], [468, 332], [331, 328]]],
        ["concreto", [[160, 1], [468, 3], [469, 97], [311, 78], [157, 73]]],
        ["concreto", [[513, 64], [532, 62], [552, 88], [561, 126], [564, 139], [508, 107]]],
        // A esplanada acompanha o bordo da avenida e termina na cabeceira já ligada à rede.
        ["concreto", [[107, 337], [165, 366], [319, 360], [474, 365], [568, 326], [619, 313],
          [625, 327], [550, 366], [470, 388], [330, 382], [192, 388], [109, 367]]],
        ["passeio", [[216, 108], [245, 108], [231, 120], [202, 137], [167, 137], [177, 124]]],
        ["passeio", [[361, 308], [449, 309], [450, 326], [394, 329], [381, 325], [359, 325]]],
        ["passeio", [[382, 362], [407, 361], [419, 378], [417, 388], [383, 386], [384, 378]]],
        ["jardim", [[90, 197], [110, 196], [118, 207], [110, 216], [86, 216]]],
        ["jardim", [[240, 198], [260, 198], [265, 212], [256, 220], [243, 219]]],
        ["jardim", [[230, 299], [250, 299], [262, 311], [260, 319], [223, 319]]],
        ["jardim", [[330, 284], [345, 283], [356, 298], [355, 307], [335, 306]]],
        ["jardim", [[465, 296], [490, 297], [490, 310], [479, 319], [464, 322], [457, 314]]],
        ["jardim", [[302, 55], [324, 49], [334, 61], [327, 70], [296, 68]]],
        ["jardim", [[605, 267], [626, 266], [635, 285], [622, 298], [598, 292]]],
        ["jardim", [[348, 138], [364, 134], [407, 141], [423, 148], [410, 154], [359, 161], [345, 155]]],
      ],
      centro: ["predios-2", 182, 227, [124, 122, 241, 229]],
      casa: [494, 285, [458, 219, 528, 289]],
      praca: [186, 300, [117, 231, 255, 301]],
      lotes: [
        ["cidade-manaus", 402, 315, [353, 253, 452, 321], "predios-14"],
        ["casa-3", 360, 59, [333, 11, 389, 65]],
        ["casa-2", 424, 67, [394, 21, 455, 70]], ["arvore-3", 317, 62, [306, 48, 330, 65]],
        ["casa-4", 194, 63, [166, 11, 223, 65]], ["casa-6", 262, 67, [237, 22, 288, 69]],
        ["arvore-7", 525, 94, [514, 75, 539, 99]],
        ["arvore-7", 103, 210, [87, 194, 116, 215]], ["arvore-3", 250, 210, [242, 196, 262, 215]],
        ["arvore-3", 244, 311, [228, 304, 260, 318]], ["arvore-7", 81, 249, [77, 239, 90, 253]],
        ["arvore-7", 341, 297, [332, 279, 351, 302]], ["arvore-3", 477, 319, [467, 305, 483, 320]],
        ["arvore-1", 613, 282, [598, 266, 634, 291]], ["banco-poste-1", 303, 380, [281, 371, 323, 383]],
        ["banco-poste-1", 493, 377, [484, 372, 503, 379]],
      ],
      acessos: [[1, 1, [182, 128]], [9, 1, [140, 285]], [7, 1, [416, 322]], [7, -1, [398, 385]],
        [6, 1, [495, 302], [494, 285]]],
    },
    "belo-horizonte": {
      caixa: [0, 0, 640, 440], regiao: "SE", resumo: "a Lagoa da Pampulha, a avenida da orla, a Igreja de São Francisco e a Serra do Curral",
      nos: [[44, 133], [102, 96], [240, 89], [333, 115], [401, 166], [403, 240], [366, 301],
        [306, 340], [161, 350], [75, 320], [37, 252], [482, 65], [605, 125], [603, 293], [554, 362], [436, 347]],
      volta: 11, pontes: [], locais: [[4, 11, 12, 13, 14, 15, 6]],
      nomes: Array(11).fill("Av. Otacílio Negrão de Lima"),
      nomesLocais: ["Av. Santa Rosa"],
      agua: [{ tipo: "lagoa", pontos: [[71, 151], [127, 129], [187, 124], [234, 117], [270, 135], [297, 132],
        [354, 168], [375, 200], [365, 231], [339, 270], [300, 282], [283, 309], [221, 312], [180, 297],
        [150, 311], [103, 294], [77, 264], [69, 228], [83, 200]] }],
      cais: [],
      acabamento: "pampulha",
      relevo: [
        [[303, 82], [351, 62], [388, 48], [435, 43], [467, 24], [497, 12], [532, 9], [568, 13], [606, 26],
          [640, 37], [640, 88], [604, 80], [563, 65], [529, 55], [487, 40], [469, 51], [445, 79],
          [415, 111], [397, 121], [373, 103], [342, 89]],
        [[386, 64], [425, 54], [453, 34], [493, 20], [530, 18], [552, 20], [591, 29], [640, 48],
          [640, 74], [606, 63], [569, 50], [540, 48], [501, 35], [484, 32], [452, 57], [423, 85], [404, 94]],
      ],
      quadras: [
        ["praca", [[419, 170], [487, 87], [586, 136], [585, 287], [545, 343], [443, 330], [390, 293], [420, 244]]],
        ["concreto", [[68, 362], [157, 368], [315, 359], [353, 338], [403, 376], [416, 425], [345, 434],
          [88, 434], [69, 411]]],
        ["concreto", [[427, 365], [565, 382], [600, 412], [583, 438], [421, 438], [408, 410]]],
        // As entradas da igreja e da praça nascem nas calçadas existentes.
        ["passeio", [[418, 194], [451, 197], [461, 204], [461, 224], [486, 224], [486, 246], [439, 244], [439, 215], [418, 210]]],
        ["passeio", [[392, 274], [435, 268], [459, 272], [469, 286], [436, 288], [404, 290]]],
        ["jardim", [[426, 179], [451, 178], [459, 189], [445, 203], [426, 206], [421, 194]]],
        ["jardim", [[567, 168], [581, 173], [581, 204], [568, 213], [562, 202], [562, 181]]],
        ["jardim", [[501, 119], [521, 119], [533, 127], [527, 137], [495, 137], [490, 130]]],
        ["jardim", [[137, 57], [159, 52], [176, 60], [180, 70], [130, 73]]],
        ["jardim", [[378, 112], [398, 105], [410, 112], [401, 123], [382, 124]]],
        ["jardim", [[199, 317], [221, 314], [233, 320], [222, 326], [197, 326]]],
        ["jardim", [[264, 378], [288, 375], [304, 384], [296, 396], [266, 397], [259, 390]]],
        ["jardim", [[378, 393], [397, 389], [414, 403], [408, 417], [380, 416], [371, 407]]],
        ["jardim", [[548, 393], [566, 386], [589, 401], [588, 414], [552, 416], [541, 408]]],
        ["jardim", [[604, 354], [621, 348], [635, 354], [633, 369], [605, 371], [598, 363]]],
      ],
      centro: ["predios-6", 509, 237, [458, 135, 560, 239]],
      casa: [473, 434, [441, 377, 504, 436]],
      praca: [495, 308, [426, 240, 564, 309]],
      lotes: [
        ["cidade-bh-serra-curral", 553, 49, [504, 11, 602, 51], "arvore-6"],
        ["casa-4", 235, 425, [205, 372, 267, 429]], ["casa-3", 323, 416, [298, 369, 350, 421]],
        ["casa-2", 119, 416, [88, 373, 151, 420]], ["arvore-4", 392, 402, [375, 381, 411, 407]],
        ["arvore-2", 361, 365, [353, 360, 369, 369]], ["arvore-4", 279, 385, [268, 367, 291, 391]],
        ["arvore-4", 435, 198, [424, 183, 451, 206]], ["arvore-2", 575, 192, [568, 177, 583, 197]],
        ["canteiro-2", 509, 134, [495, 112, 523, 134]],
        ["arvore-1", 398, 107, [377, 96, 409, 111]], ["arvore-4", 151, 64, [132, 50, 173, 69]],
        ["arvore-2", 617, 361, [608, 345, 626, 365]], ["arvore-1", 565, 400, [553, 386, 583, 407]],
        ["arvore-1", 211, 321, [200, 317, 224, 322]], ["banco-poste-1", 368, 175, [363, 172, 373, 179]],
      ],
      acessos: [[4, -1, [449, 207], [449, 234], [472, 234]], [5, -1, [429, 278]],
        [15, -1, [426, 388], [426, 436], [473, 439], [473, 434]], [7, -1, [227, 380]]],
    },
  };

  const misturar = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const delta = (a, b) => [b[0] - a[0], b[1] - a[1]];
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const soma = (p, u, d) => [p[0] + u[0] * d, p[1] + u[1] * d];
  const produto = (a, b) => a[0] * b[0] + a[1] * b[1];
  const normal = ([x, y]) => [-y, x];
  const unitario = (a, b) => soma([0, 0], delta(a, b), 1 / dist(a, b));
  const modulo = (a, m) => (a % m + m) % m;
  const CALCADA = 20, PISTA = 16;
  const chaveAresta = (a, b) => a * 1024 + b;
  function noPoligono([x, y], pontos) {
    let dentro = false;
    for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
      const [a, b] = pontos[i], [c, d] = pontos[j];
      if ((b > y) !== (d > y) && x < a + (y - b) * (c - a) / (d - b)) dentro = !dentro;
    }
    return dentro;
  }
  function aguaEm(m, ponto) { return m.agua.some(a => noPoligono(ponto, a.pontos)); }
  // A projeção também delimita o tabuleiro e a superfície útil das pontes nas bordas do canal.
  function ponteEm(m, ponto) {
    return m.pontes.some(t => {
      const v = delta(t.a, ponto), s = produto(v, t.u);
      return s >= 0 && s <= t.L && Math.abs(produto(v, t.n)) <= CALCADA + 3;
    });
  }

  function ruasDaMalha(d) {
    const ruas = [], raios = d.nos.map(() => []);
    function rua(i, j, nome, ponte) {
      const a = d.nos[i], b = d.nos[j], u = unitario(a, b);
      const t = { a, b, u, n: normal(u), L: dist(a, b), nome, ponte, lados: [[], []] };
      ruas.push(t);
      raios[i].push({ t, u, ini: true });
      raios[j].push({ t, u: [-u[0], -u[1]], ini: false });
    }
    for (let i = 0; i < d.volta; i++) rua(i, (i + 1) % d.volta, d.nomes[i], d.pontes.includes(i));
    d.locais.forEach((l, i) => l.slice(1).forEach((j, k) => rua(l[k], j, d.nomesLocais[i], false)));

    // A cunha entre dois trechos é a interseção das linhas de calçada de cada rua.
    // O mesmo ponto vira o fim de uma calçada e o começo da outra.
    for (let i = 0; i < raios.length; i++) {
      const lista = raios[i], p = d.nos[i];
      lista.sort((a, b) => Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0]));
      for (let k = 0; k < lista.length; k++) {
        const a = lista[k], b = lista[(k + 1) % lista.length];
        const n = normal(a.u), m = normal(b.u);
        const q = soma(p, delta(m, n), CALCADA / (1 - produto(a.u, b.u)));
        a.t.lados[a.ini ? 0 : 1][a.ini ? 0 : 1] = q;
        b.t.lados[b.ini ? 1 : 0][b.ini ? 0 : 1] = q;
      }
    }
    return ruas;
  }

  function calcadas(m, acessos) {
    const nos = [], viz = [], ids = new Map(), travessias = [], faixaPorAresta = {}, caminhos = [], placas = [], postes = [], cordoes = [];
    function no(p) {
      if (!ids.has(p)) { ids.set(p, nos.length); nos.push(p); viz.push([]); }
      return ids.get(p);
    }
    function ligar(a, b, faixa) {
      const i = no(a), j = no(b);
      if (i === j || dist(a, b) < 0.01) return;
      viz[i].push(j); viz[j].push(i);
      if (faixa) { faixaPorAresta[chaveAresta(i, j)] = faixa; faixaPorAresta[chaveAresta(j, i)] = faixa; }
    }
    m.ruas.forEach((t, i) => {
      const centro = misturar(t.a, t.b, 0.5);
      const cantos = [soma(centro, t.n, CALCADA), soma(centro, t.n, -CALCADA)];
      const livre = !t.ponte && !aguaEm(m, centro) && t.lados.every(([a, b], k) =>
        produto(delta(a, cantos[k]), t.u) > 12 && produto(delta(cantos[k], b), t.u) > 12);
      t.lados.forEach(([a, b], k) => {
        const x = cantos[k], ligacoes = acessos.filter(([j, lado]) => i === j && (lado === 1) === (k === 0));
        if (livre || ligacoes.length) { ligar(a, x); ligar(x, b); }
        else ligar(a, b);
        for (const [, , ...pontos] of ligacoes) {
          let inicio = x;
          for (const fim of pontos) { ligar(inicio, fim); caminhos.push([inicio, fim]); inicio = fim; }
        }
      });
      if (t.ponte) {
        const [x, y] = t.lados[1][0];
        placas.push({ x, y, nome: t.nome });
      }
      if (!livre) return;
      const faixa = { centro, cantos, u: t.u, n: t.n, carros: i < m.volta };
      travessias.push(faixa);
      ligar(cantos[0], cantos[1], faixa);
      if (t.L >= 80) {
        placas.push({ x: cantos[0][0], y: cantos[0][1], nome: t.nome });
        if (t.L >= 105) {
          postes.push(...cantos);
          cordoes.push([cantos[0][0], cantos[0][1], cantos[1][0], cantos[1][1]]);
        }
      }
    });
    return { nos, viz, peso: nos.map(() => 1), travessias, faixaPorAresta, caminhos, placas, postes, cordoes };
  }

  function circuito(ruas) {
    const pontos = ruas.map((t, i) => {
      const anterior = ruas[modulo(i - 1, ruas.length)];
      const uniao = soma(t.n, anterior.n, 1);
      return soma(t.a, uniao, 6 / (1 + produto(anterior.u, t.u)));
    });
    const pista = [];
    for (let i = 0; i < pontos.length; i++) {
      // Arredonda cada cotovelo da faixa. As retas entre as curvas continuam no eixo da faixa.
      const a = pontos[i], b = pontos[modulo(i - 1, pontos.length)], c = pontos[(i + 1) % pontos.length];
      const entrada = soma(a, unitario(a, b), 10), saida = soma(a, unitario(a, c), 10);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        pista.push(misturar(misturar(entrada, a, t), misturar(a, saida, t), t));
      }
    }
    let L = 0;
    const trechos = pista.map((a, i) => {
      const b = pista[(i + 1) % pista.length], u = unitario(a, b), inicio = L;
      L += dist(a, b);
      return { a, u, angulo: Math.atan2(u[1], u[0]), inicio, fim: L };
    });
    return { L, trechos };
  }

  function naPista(pista, s, alvo) {
    let i = 0;
    while (s >= pista.trechos[i].fim) i++;
    const t = pista.trechos[i], d = s - t.inicio;
    alvo.x = t.a[0] + t.u[0] * d; alvo.y = t.a[1] + t.u[1] * d; alvo.angulo = t.angulo;
  }

  function plantaUrbana(id, cidade, d) {
    const ruas = ruasDaMalha(d);
    const malha = { caixa: d.caixa, resumo: d.resumo, volta: d.volta, agua: d.agua, cais: d.cais,
      relevo: d.relevo || [], ruas, pontes: ruas.filter(t => t.ponte), pista: circuito(ruas.slice(0, d.volta)), largura: PISTA, calcada: CALCADA };
    const { caminhos, travessias, placas, postes, cordoes, ...rede } = calcadas(malha, d.acessos);
    Object.assign(malha, { caminhos, travessias, placas, cordoes });
    if (d.pedra) malha.pedra = d.pedra;
    if (d.acabamento) malha.acabamento = d.acabamento;
    const centro = loteUrbano(d.centro, "centro"), praca = loteUrbano(["praca-1", ...d.praca], "parque");
    const casa = { ...loteUrbano(["chale-2", ...d.casa], "casas"), arvore: d.regiao === "SE" ? "arvore-2" : "arvore-3" };
    const pecas = [...d.lotes.map(l => loteUrbano(l, "centro")), praca];
    const quadras = d.quadras.map(([piso, pontos]) => ({ piso, pontos }));
    const r = sorteio(id + ":malha"), porte = PORTES[cidade.porte] ? cidade.porte : "grande", P = PORTES[porte];
    const frota = [...Array(P.carros).fill("carro"), ...Array(P.bicis).fill("bici")];
    const carros = frota.map((tipo, i) => {
      const s = (i + 0.4) * malha.pista.L / frota.length;
      return { s, v: tipo === "carro" ? 22 : 15, peca: tipo + "-" + (1 + Math.floor(r() * (tipo === "carro" ? 5 : 3))) };
    });
    const pedestres = Array.from({ length: P.pedestres[0] }, (_, i) => {
      const de = Math.floor((i + r()) * rede.nos.length / P.pedestres[0]);
      const para = rede.viz[de].find(j => !rede.faixaPorAresta[chaveAresta(de, j)]);
      return { de, para, s: dist(rede.nos[de], rede.nos[para]) * r(), v: 9 + Math.round(r() * 4), semente: id + "#" + i };
    });
    return { W: d.caixa[2], H: d.caixa[3], malha, quadras, centro, casa, praca, pecas, pisos: [], tituloCentro: d.tituloCentro,
      cercas: [{ r: casa.r, tipo: "sebe", porta: casa.x }],
      notaveis: pecas.filter(s => NOMES[s.peca]), porte, regiao: d.regiao, carros, postes, rede, pedestres };
  }

  function loteUrbano([peca, x, y, r, base], zona) { return { peca, x, y, r, base, zona }; }

  return { planta, sorteio, W, H, E, C, NOMES, PORTES, aguaEm, ponteEm, naPista, chaveAresta };
})();
window.CidadePlanta = CidadePlanta;
