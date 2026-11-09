// Planta do nível Cidade (o desenho e a vida da rua ficam em mundo_cidade.js). Tudo sai de uma semente com o id da cidade:
// o mesmo id dá sempre a mesma planta.
// - Ruas em grade reta, de dv em dv e de dh em dh. A câmera fica presa à caixa W×H, mas a grade segue até LONGE além
//   dela, para que a 1x, em qualquer formato de tela, não sobre grama vazia fora das quadras.
// - Quadra: calçada de C em volta e o miolo em duas filas. Cada fila é inteira (um prédio ou a praça) ou dividida em
//   dois lotes (chalé, árvore, ou uma peça de mobiliário ao lado de uma árvore). A quadra do meio é a do marco.
// - As 8 quadras em volta do marco são a cidade: de 6 a 10 chalés, de 2 a 5 prédios, uma praça, o mobiliário (banca,
//   carrinho, banco com poste e o ponto de ônibus) e a vaga do chalé da casa. As de fora são os arredores: chalés,
//   árvores e alguns prédios.
// - Cada peça leva o pé (x, y), onde o desenho se apoia, e r = [x0, y0, x1, y1], a vaga que ocupa no chão: nenhuma
//   vaga cruza outra, e nenhuma fica na rua.
// - Os pedestres andam por uma rede: quatro cantos de calçada em volta de cada cruzamento, ligados pelas calçadas e
//   pelas faixas de pedestre.
"use strict";
const CidadePlanta = (() => {
  const W = 576, H = 400, E = 32, C = 8, LONGE = 600;   // E: largura da rua; C: da calçada
  const PE = E / 2 + C / 2;   // do eixo da rua ao meio da calçada, por onde andam os pedestres

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

  function planta(id) {
    const r = sorteio(String(id));
    const entre = (a, b) => a + Math.floor(r() * (b - a + 1));
    const embaralhar = l => {
      for (let i = l.length - 1; i > 0; i--) { const m = Math.floor(r() * (i + 1)); [l[i], l[m]] = [l[m], l[i]]; }
      return l;
    };
    const v0 = 176 + 4 * entre(-4, 4), v1 = 400 + 4 * entre(-4, 4), h0 = 112 + 4 * entre(-2, 2), h1 = 304 + 4 * entre(-2, 2);
    const dv = v1 - v0, dh = h1 - h0, rv = k => v0 + k * dv, rh = k => h0 + k * dh;
    const kv = indices(v0, dv, W), kh = indices(h0, dh, H);
    const ruas = { v: kv.map(rv), h: kh.map(rh) };

    // quadras e filas: anel 0 é o marco, 1 a cidade, 2 em diante os arredores
    const quadras = [], filas = [];
    for (const b of kh.slice(0, -1)) for (const a of kv.slice(0, -1)) {
      const q = { a, b, x0: rv(a) + E / 2, x1: rv(a + 1) - E / 2, y0: rh(b) + E / 2, y1: rh(b + 1) - E / 2,
                  anel: Math.max(Math.abs(a), Math.abs(b)), centro: a === 0 && b === 0 };
      quadras.push(q);
      if (q.centro) continue;
      const meio = Math.round((q.y0 + q.y1) / 2);
      for (const fila of [0, 1]) {
        filas.push({ q, fila, x0: q.x0 + C, x1: q.x1 - C, y0: fila ? meio : q.y0 + C, y1: fila ? q.y1 - C : meio });
      }
    }
    const lotes = f => {   // a fila em dois lotes, lado a lado
      const m = Math.round((f.x0 + f.x1) / 2);
      return [{ ...f, x1: m }, { ...f, x0: m }];
    };
    const vaga = l => [l.x0, l.y0, l.x1, l.y1];
    const noLote = (l, peca, recuo = 2, folga = 4) =>
      ({ x: Math.round((l.x0 + l.x1) / 2) + entre(-folga, folga), y: l.y1 - recuo, peca, r: vaga(l) });

    // a cidade: a vaga da casa, as filas do mobiliário (de baixo, na frente de uma rua com carros), os prédios (na fila
    // de cima, um por quadra: o desenho alto sobe sobre a rua de trás sem cobrir a própria quadra) e a praça, baixa.
    // Primeiro as filas que aparecem a 1x numa tela no formato da caixa
    const cidade = filas.filter(f => f.q.anel === 1), de = (a, b, fila) => cidade.find(f => f.q.a === a && f.q.b === b && f.fila === fila);
    const filaCasa = de(0, 1, 0);
    const visiveis = cidade.filter(f => (f.q.b === -1 && f.fila === 1) || f.q.b === 0 || (f.q.b === 1 && f.fila === 0));
    const filasMob = embaralhar(visiveis.filter(f => f.fila === 1 && f.q.b < 1)).slice(0, 2);
    const deCima = cidade.filter(f => f.fila === 0 && f !== filaCasa);
    const altas = [...embaralhar(deCima.filter(f => visiveis.includes(f))), ...embaralhar(deCima.filter(f => !visiveis.includes(f)))];
    const filasPredio = altas.slice(0, entre(2, 5));
    const predios = filasPredio.map(f => noLote(f, "predios-" + entre(1, 6), 2, 6));
    const filaPraca = embaralhar(visiveis.filter(f => f !== filaCasa && !filasMob.includes(f) && !filasPredio.includes(f)))[0];
    const praca = noLote(filaPraca, "praca-1", 2, 0);
    const inteiras = [...filasPredio, filaPraca];

    const meio = Math.round((v0 + v1) / 2);
    const [l1, l2] = lotes(filaCasa), loteCasa = Math.abs((l1.x0 + l1.x1) / 2 - meio) <= Math.abs((l2.x0 + l2.x1) / 2 - meio) ? l1 : l2;
    const casa = { ...noLote(loteCasa, "chale-2", 2, 0), arvore: "arvore-" + entre(1, 3) };

    const mobiliario = [], arvores = [];
    const pecasMob = embaralhar(["banca-1", "carrinho-1", "banco-poste-1", "ponto-onibus-1"]);
    for (const l of filasMob.flatMap(lotes)) {   // a peça na frente de meio lote, uma árvore recuada no outro meio
      const m = Math.round((l.x0 + l.x1) / 2), [a, b] = r() < 0.5 ? [{ ...l, x1: m }, { ...l, x0: m }] : [{ ...l, x0: m }, { ...l, x1: m }];
      mobiliario.push({ ...noLote(a, pecasMob[mobiliario.length], 2, 2), fila: l });
      arvores.push(noLote(b, "arvore-" + entre(1, 3), 14, 0));
    }
    for (const m of mobiliario) delete m.fila;

    const livres = embaralhar(cidade.filter(f => !inteiras.includes(f) && !filasMob.includes(f)).flatMap(lotes)
      .filter(l => !(l.q === loteCasa.q && l.fila === loteCasa.fila && l.x0 === loteCasa.x0)));
    const nChales = entre(6, 10);
    const chales = livres.slice(0, nChales).map(l => noLote(l, "chale-" + entre(1, 8)));
    for (const l of livres.slice(nChales)) arvores.push(noLote(l, "arvore-" + entre(1, 3)));

    const arredores = [];
    for (const f of filas.filter(f => f.q.anel > 1)) {
      if (f.fila === 0 && r() < 0.25) { arredores.push(noLote(f, "predios-" + entre(1, 6), 2, 6)); continue; }
      for (const l of lotes(f)) arredores.push(noLote(l, r() < 0.4 ? "chale-" + entre(1, 8) : "arvore-" + entre(1, 3)));
    }

    const qc = quadras.find(q => q.centro);
    const centro = { x: meio, y: qc.y1 - C - 4, peca: "predios-" + entre(1, 6), r: [qc.x0 + C, qc.y0 + C, qc.x1 - C, qc.y1 - C] };

    // carros nas quatro ruas do meio. Dois carros na mesma faixa andam juntos, a meia volta um do outro. Nenhum começa
    // dentro de um cruzamento: lá dentro só cabe um veículo por vez (mundo_cidade.js)
    const carros = [];
    const livre = (s, cruzes) => cruzes.every(k => Math.abs(s - k) >= E / 2 + 16);
    for (let i = 0, q = entre(4, 6); i < q; i++) {
      const eixo = i % 2 ? "v" : "h", rua = (eixo === "h" ? [h0, h1] : [v0, v1])[(i >> 1) % 2], L = eixo === "h" ? W : H;
      const dir = r() < 0.5 ? 1 : -1, cruzes = eixo === "h" ? [v0, v1] : [h0, h1];
      const par = carros.find(c => c.eixo === eixo && c.rua === rua && c.dir === dir);
      let s = par ? (par.s + L / 2) % L : Math.round(r() * L);
      const v = par ? par.v : 16 + Math.round(r() * 14);
      while (!livre(s, cruzes)) s = (s + 4) % L;
      carros.push({ eixo, rua, dir, s, v, peca: "carro-" + entre(1, 4) });
    }
    const postes = [];   // nas quinas dos quatro cruzamentos do meio (os cordões das festas vão de um a outro)
    for (const x of [v0, v1]) for (const y of [h0, h1]) for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      postes.push([x + dx * (E / 2 + 1), y + dy * (E / 2 + 1)]);
    }

    // a rede dos pedestres: os cruzamentos das ruas -1 a 2 (em volta da cidade); cantos 0 NO, 1 NE, 2 SO, 3 SE
    const nos = [], viz = [], no = (i, j, c) => (i * 4 + j) * 4 + c;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let c = 0; c < 4; c++) {
      nos.push([rv(i - 1) + (c % 2 ? PE : -PE), rh(j - 1) + (c > 1 ? PE : -PE)]);
      viz.push([]);
    }
    const ligar = (a, b) => { viz[a].push(b); viz[b].push(a); };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ligar(no(i, j, 0), no(i, j, 1)); ligar(no(i, j, 2), no(i, j, 3));   // faixas sobre a rua vertical
      ligar(no(i, j, 0), no(i, j, 2)); ligar(no(i, j, 1), no(i, j, 3));   // faixas sobre a rua horizontal
      if (i < 3) { ligar(no(i, j, 1), no(i + 1, j, 0)); ligar(no(i, j, 3), no(i + 1, j, 2)); }   // calçadas para o leste
      if (j < 3) { ligar(no(i, j, 2), no(i, j + 1, 0)); ligar(no(i, j, 3), no(i, j + 1, 1)); }   // calçadas para o sul
    }
    // peso de cada canto: os de dentro da caixa valem mais, para os pedestres saírem da vista e logo voltarem; eles
    // nascem num canto de dentro
    const peso = nos.map(([x, y]) => x > 0 && x < W && y > 0 && y < H ? 1 : 0.15), dentro = nos.map((_, i) => i).filter(i => peso[i] === 1);
    const pedestres = [];
    for (let i = 0, n = entre(8, 14); i < n; i++) {
      const de = dentro[Math.floor(r() * dentro.length)], para = viz[de][Math.floor(r() * viz[de].length)];
      const [x0, y0] = nos[de], [x1, y1] = nos[para];
      pedestres.push({ de, para, s: Math.round(r() * Math.hypot(x1 - x0, y1 - y0)), v: 8 + Math.round(r() * 5), semente: `${id}#${i}` });
    }

    const cruzamentos = [[v0, h0], [v1, h0], [v0, h1], [v1, h1]];   // os quatro do meio, os únicos com carros nas duas ruas
    return { W, H, ruas, quadras, centro, casa, chales, predios, praca, arvores, mobiliario, arredores, carros, postes, cruzamentos,
             rede: { nos, viz, peso }, pedestres };
  }

  return { planta, sorteio, W, H, E, C };
})();
window.CidadePlanta = CidadePlanta;
