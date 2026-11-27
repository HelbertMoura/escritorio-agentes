// Enfeites da festa do dia (festas.js) na cidade do mundo público. A cidade (mundo_cidade.js) chama cada parte na camada
// certa, para o enfeite fazer parte da cena:
// - chao: o pisca em volta da praça, no chão;
// - itens: o que entra na ordem de profundidade com as peças: os cordões de bandeirinhas presos no alto dos postes,
//   atravessando as ruas, e as peças da festa ao lado da fonte (a arte do PixelLab, quando está no atlas, ou uma forma
//   pequena por código no lugar dela);
// - poste e telhado: logo depois do poste (guirlanda, lanterna, coração, balões, máscara) e do chalé (o pisca no
//   contorno do telhado, lido da arte);
// - luzes: à noite, por cima do escuro, o brilho do pisca (piscando), da fogueira e das lanternas;
// - aereos: os vãos e contornos que a cena integral traz no campo festa (bandeirinhas, fitas e pisca por cima da arte);
// - ar: fogos à noite (no céu da cena, quando ela o traz), confete, serpentina, neve e morcegos.
// A cena com palco leva para ele a peça grande da festa. A neve só cai na cena com o campo festa; a assentada é da cidade
// (mundo_cidade.js).
// Com movimento reduzido: nada de fogos, confete, serpentina nem flocos, o pisca aceso e parado e os morcegos parados.
// O estado do último quadro (o que foi desenhado) fica em `estado`.
"use strict";
const MundoFesta = (() => {
  // formas em texto: a, b e c são as cores da festa; as outras letras, cores fixas; "." é vazio. O pé fica embaixo.
  const FIXAS = { k: "#231c2b", w: "#f8fafc", g: "#2f8f46", G: "#1d5e30", m: "#7a4a24", y: "#facc15", o: "#f97316",
                  O: "#c2410c", r: "#e11d48", p: "#f9a8d4", s: "#94a3b8", v: "#86efac" };
  const FORMAS = {
    // nos postes, no alto (o pé é o ponto de onde pendem)
    guirlanda: [".GgG.", "gr.rg", "G...G", "g...g", ".gGg."],
    lanternas: [".k.", "aaa", "aya", "aaa", ".y."],
    coracoes: ["aa.aa", "aaaaa", ".aaa.", "..a.."],
    baloes: [".a.b.", "aaabb", ".acbb", "..cc.", "..k..", "...k.", "..k.."],
    mascara: ["aaa.bbb", "akaaakb", ".aa.bb."],
    // na praça, ao lado da fonte
    arvore_natal: ["...y...", "..ggg..", "..gag..", ".ggGgg.", ".gbggc.", "gGgaGgg", "ggcgggb", "...m..."],
    presentes: ["..y....", "aayaa..", "aayaa.y", "aayaabb", "aayaabb"],
    champanhe: [".k...w.", ".g..wyw", ".g...y.", "ggg..y.", "gwg..y.", "ggg.www"],
    ovos: [".a...b.", "aaa.bbb", "wbw.cwc", "aaa.bbb", ".a...b."],
    coelho: ["w.w..", "w.w..", "www..", "wkw..", "www.w", "wwwww", ".w.w."],
    fogueira: ["..y..", ".yoy.", ".oOo.", "omOmo", "mm.mm"],
    abobora: ["..g..", ".ooo.", "oyoyo", "ooooo", ".ooo."],
    diwali: ["..y....y..", "..o....o..", "aaaaa.bbbb", ".aaa...bb."],
    velas: [".y...y...", ".o.y.o.y.", ".w.o.w.o.", ".w.w.w.w.", "aaaaaaaaa"],
    flores: [".a...b..", "aya.byb.", ".a.c.b..", ".gcycg..", "..gcgg.."],
  };
  const NOS_POSTES = ["guirlanda", "lanternas", "coracoes", "baloes", "mascara"];
  // o enfeite da praça e a arte do PixelLab que o substitui; as peças a mais de algumas festas
  const NA_PRACA = { arvore_natal: "festa-arvore-natal", presentes: null, champanhe: null, ovos: "festa-ovo-pascoa",
                     coelho: null, fogueira: "festa-fogueira", abobora: "festa-abobora", diwali: null, velas: null, flores: null };
  const EXTRAS = { junina: ["festa-barraca-junina"], carnaval: ["festa-carro-alegorico"], anonovo: ["festa-palco-anonovo"] };
  const BRILHA = { fogueira: [255, 150, 60], lanternas: [255, 90, 70], abobora: [255, 140, 40], diwali: [255, 190, 90],
                   arvore_natal: [255, 220, 150], velas: [255, 180, 80] };
  const CORDAO = "#4b4453", APAGADA = "#3a3442", NEVE = "#f8fafc";
  const FLOCOS = 80, BRILHOS = 300;   // tetos por quadro

  function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

  function criar({ reduzido, alto, recorte, atlas }) {
    const telas = new Map(), contornos = new Map();
    let chave = "", festa = null, cordoes = [], itens = [], anel = [], noPoste = null, desvio = 0, fonteR = null;
    let fogos = [], confete = [], fitas = [], flocos = [], espera = 0, postes = [], rgbs = [];
    let ancoras = null, vaos = [], contornosCena = [], vistaAtual = null;   // o campo festa da cena e o que se pendura nele
    // reaproveitados a cada quadro (nada alocado por lâmpada): as lâmpadas acesas em trios (x, y, índice da cor), as
    // formas e as peças desenhadas
    const luzes = [], desenhadas = new Set(), pecas = [], noPalco = [];
    const caixa = s => {
      const r = recorte(s.peca), x = Math.round(s.x - r[2] / 2), y = Math.round(s.y - r[3]);
      return [s.peca, x, y, x + r[2], y + r[3]];
    };
    // o que o último quadro desenhou; formas, peças e a caixa da fonte só são montadas quando alguém lê
    const estado = { chave: null, cordoes: 0, bandeirinhas: 0, luzes: 0, acesas: 0, piscando: false, fogos: 0, confete: 0,
                     serpentina: 0, morcegos: 0, fios: 0, contornos: 0, fitas: 0, neve: false, flocos: 0,
                     get formas() { return [...desenhadas]; },
                     get pecas() { return pecas.map(caixa); },
                     get palco() { return noPalco.map(caixa); },
                     get fonte() { return fonteR && fonteR.slice(); } };
    const tem = e => !!festa && festa.enfeites.includes(e);
    const neve = () => !!ancoras && tem("neve");   // a neve (flocos e chão) só na cena com o campo festa
    const cor = i => festa.cores[i % festa.cores.length];

    function sprite(nome) {   // a forma pintada uma vez nas cores da festa e depois só copiada
      const k = nome + "|" + festa.cores.join();
      let c = telas.get(k);
      if (c) return c;
      const linhas = FORMAS[nome];
      c = document.createElement("canvas"); c.width = linhas[0].length; c.height = linhas.length;
      const g = c.getContext("2d");
      linhas.forEach((l, y) => {
        for (let x = 0; x < l.length; x++) {
          const ch = l[x], i = "abc".indexOf(ch), fill = ch === "." ? null : i >= 0 ? cor(i) : FIXAS[ch];
          if (fill) { g.fillStyle = fill; g.fillRect(x, y, 1, 1); }
        }
      });
      telas.set(k, c);
      return c;
    }
    function forma(ctx, nome, x, y) {   // o pé da forma em (x, y)
      const c = sprite(nome);
      ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height));
      desenhadas.add(nome);
    }

    // a festa nova (ou outra cidade): cordões, peças da praça e o anel de luzes saem da planta
    function preparar(f, p, id) {
      const k = f ? `${id}|${f.chave}|${!!recorte(p.praca.peca)}${p.cena ? "|" + !!atlas() : ""}` : "";
      if (k === chave) return;
      chave = k; festa = f; cordoes = []; itens = []; anel = []; fogos = []; confete = []; fitas = []; flocos = []; desvio = 0; fonteR = null;
      ancoras = (f && p.cena && p.cena.festa) || null; vaos = []; contornosCena = [];
      rgbs = f ? f.cores.map(rgb) : [];   // o RGB de cada cor da festa, uma vez (o brilho guarda o sprite pela cor, não pelo array)
      noPoste = f ? NOS_POSTES.find(tem) || null : null;
      if (!f) return;
      const A = CidadePlanta.E / 2 + 1, cruz = p.cruzamentos;
      // os cordões levam bandeirinhas e fitas; na cena com o campo festa, levam também o pisca
      const pendurado = tem("bandeirinhas") || tem("fitas");
      if (ancoras && (pendurado || tem("pisca"))) vaos = ancoras.fios;
      if (ancoras && tem("pisca")) contornosCena = ancoras.contornos;
      if (pendurado || (ancoras && tem("pisca"))) {
        if (p.malha) cordoes = p.malha.cordoes;
        else {
          for (const [x, y] of cruz) for (const dy of [-A, A]) cordoes.push([x - A, y + dy, x + A, y + dy]);   // sobre a rua vertical
          const xs = [...new Set(cruz.map(c => c[0]))].sort((a, b) => a - b), ys = [...new Set(cruz.map(c => c[1]))];
          for (const y of ys) {   // em X ao longo da rua horizontal, de um cruzamento ao outro
            cordoes.push([xs[0] + A, y - A, xs[1] - A, y + A], [xs[0] + A, y + A, xs[1] - A, y - A]);
          }
        }
        for (const c of cordoes) itens.push({ enfeite: "cordao", c, x: (c[0] + c[2]) / 2, y: Math.max(c[1], c[3]) });
      }
      praca(p);
      if (tem("pisca")) {   // o pisca no chão, contornando a frente e os lados do círculo da praça (atrás ficam os bancos)
        const [largura, altura] = ancoraPraca(p);
        const rx = largura / 2 + 3, ry = p.cena ? altura / 2 + 2 : rx * 0.64, cy = p.praca.y - ry + 1;
        for (const [co, si] of CidadePlanta.anelDaPraca([largura, altura], ry)) {
          anel.push([Math.round(p.praca.x + desvio + co * rx), Math.round(cy + si * ry)]);
        }
      }
    }
    // as peças da festa ao lado da fonte (ou do lago, quando a praça da cidade é o lago): a arte do PixelLab (na metade,
    // no atlas) ou a forma por código. A maior vai
    // num lado da fonte e as outras no espaço que sobra, sem cruzar a fonte nem sair da fila da praça. Numa praça
    // estreita, a fonte se afasta para o outro lado (desvio) até a maior caber; só se nem assim couber, entra a forma
    function ancoraPraca(p) {
      const fonte = recorte(p.praca.peca);
      return p.praca.fonte || (fonte ? fonte.slice(2) : [90, 68]);
    }
    // a peça grande da festa no palco da cena: a mais larga que cabe entre as peças a mais (EXTRAS e as da festa) ou,
    // sem nenhuma, entre as da praça. A que não cabe fica na praça
    function palco() {
      const lugar = ancoras && ancoras.palco, extras = [...(EXTRAS[festa.chave] || []), ...(festa.pecas || [])];
      if (!lugar) return null;
      const { x, y, r } = lugar, cabe = n => {
        const q = recorte(n);
        return q && x - q[2] / 2 >= r[0] && x + q[2] / 2 <= r[2] && y - q[3] >= r[1] && y <= r[3];
      };
      const candidatas = extras.length ? extras : festa.enfeites.map(e => NA_PRACA[e]).filter(Boolean);
      const nome = candidatas.filter(cabe).sort((a, b) => recorte(b)[2] - recorte(a)[2])[0];
      if (!nome) return null;
      const enfeite = Object.keys(NA_PRACA).find(e => NA_PRACA[e] === nome);
      itens.push({ enfeite: "praca", palco: true, peca: nome, w: recorte(nome)[2], brilha: BRILHA[enfeite], x, y });
      return nome;
    }
    function praca(p) {
      const lista = [], M = 2, fora = palco();
      const arteQueCabe = nome => {
        const r = recorte(nome);
        return r && (!p.cena || p.praca.y - r[3] >= p.praca.r[1]) ? r : null;
      };
      for (const e of festa.enfeites) if (e in NA_PRACA && !(fora && NA_PRACA[e] === fora)) {
        const arte = NA_PRACA[e] && arteQueCabe(NA_PRACA[e]), forma = { forma: e, w: FORMAS[e][0].length, brilha: BRILHA[e] };
        lista.push(arte ? { peca: NA_PRACA[e], w: arte[2], brilha: BRILHA[e], reserva: forma } : forma);
      }
      for (const n of [...(EXTRAS[festa.chave] || []), ...(festa.pecas || [])]) {
        const arte = n !== fora && arteQueCabe(n);
        if (arte) lista.push({ peca: n, w: arte[2] });
      }
      lista.sort((a, b) => b.w - a.w);
      const [largura, altura] = ancoraPraca(p), meia = Math.ceil(largura / 2), [x0, , x1] = p.praca.r;
      const esq = p.praca.x - meia - M - (x0 + M), dir = x1 - M - (p.praca.x + meia + M), maior = lista.length ? lista[0].w : 0;
      desvio = !p.cena && maior > Math.max(esq, dir) ? Math.min(maior - esq, dir) : 0;   // a fonte vai para a direita
      const cx = p.praca.x + desvio;
      fonteR = [cx - meia, p.praca.y - altura, cx + meia, p.praca.y];
      const lados = [{ a: x0 + M, b: cx - meia - M, l: [] }, { a: cx + meia + M, b: x1 - M, l: [] }];
      const livre = g => g.b - g.a - g.l.reduce((s, i) => s + i.w + 2, 0);
      for (let it of lista) {
        const cabe = item => lados.slice().sort((u, v) => livre(v) - livre(u)).find(g => livre(g) >= item.w);
        let g = cabe(it);
        if (!g && it.reserva) { it = it.reserva; g = cabe(it); }   // último caso: a forma pequena por código
        if (g) g.l.push(it);
      }
      for (const g of lados) {   // o grupo no meio do espaço, a peça maior perto da fonte
        const larg = g.l.reduce((s, i) => s + i.w + 2, -2);
        let x = Math.round((g.a + g.b - larg) / 2);
        const ordem = g === lados[0] ? g.l.slice().reverse() : g.l;
        for (const it of ordem) {
          itens.push({ enfeite: "praca", peca: it.peca, forma: it.forma, w: it.w, brilha: it.brilha, x: x + it.w / 2, y: p.praca.y });
          x += it.w + 2;
        }
      }
    }

    const naVista = (x, y) => x >= vistaAtual[0] - 1 && x <= vistaAtual[2] && y >= vistaAtual[1] - 1 && y <= vistaAtual[3];
    // um vão: a linha caída entre dois pontos (`sobe`: a altura deles acima do chão, a dos postes nos cordões e 0 nos
    // fios, que já saem do alto), com as bandeirinhas e as fitas da festa e, na cena com o campo festa, o pisca
    function vao(ctx, [ax, ay, bx, by], sobe, escuro, t) {
      const L = Math.hypot(bx - ax, by - ay), caida = Math.min(8, 2 + L * 0.05), n = Math.ceil(L);
      const ponto = u => [Math.round(ax + (bx - ax) * u), Math.round(ay - sobe + (by - ay) * u + caida * 4 * u * (1 - u))];
      ctx.fillStyle = CORDAO;
      for (let i = 0; i <= n; i++) { const [x, y] = ponto(i / n); ctx.fillRect(x, y, 1, 1); }
      const q = Math.max(2, Math.floor(L / 6));
      for (let i = 1; i < q; i++) {
        const [x, y] = ponto(i / q);
        ctx.fillStyle = cor(i);
        if (tem("bandeirinhas")) {
          ctx.fillRect(x - 2, y + 1, 5, 1); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x, y + 3, 1, 1);
          estado.bandeirinhas++;
        }
        if (tem("fitas")) {   // fitinhas penduradas, de comprimentos alternados
          ctx.fillRect(x + 1, y + 1, 1, 4 + i % 3);
          estado.fitas++;
        }
      }
      if (ancoras && tem("pisca")) for (let i = 0; i <= Math.floor(L / 4); i++) lampadaEm(ctx, ...ponto(i * 4 / L), i, escuro, t);
    }
    function desenhar(ctx, s, escuro, t) {   // um item da ordem de profundidade
      if (s.enfeite === "cordao") { estado.cordoes++; return vao(ctx, s.c, alto, escuro, t); }
      if (s.forma) return forma(ctx, s.forma, s.x, s.y);
      const r = recorte(s.peca);
      if (!r) return;
      const x = Math.round(s.x - r[2] / 2), y = Math.round(s.y - r[3]);
      ctx.drawImage(atlas(), r[0], r[1], r[2], r[3], x, y, r[2], r[3]);
      (s.palco ? noPalco : pecas).push(s);
    }
    // os fios e os contornos da cena, por cima das peças (estão no alto): o pisca nos contornos a cada 3 px do caminho
    function aereos(ctx, escuro, t) {
      for (const f of vaos) { vao(ctx, f, 0, escuro, t); estado.fios++; }
      for (const pontos of contornosCena) {
        let resto = 0, i = 0;
        for (let k = 1; k < pontos.length; k++) {
          const [ax, ay] = pontos[k - 1], [bx, by] = pontos[k], L = Math.hypot(bx - ax, by - ay);
          for (; resto <= L; resto += 3, i++) {
            const u = L ? resto / L : 0;
            lampadaEm(ctx, Math.round(ax + (bx - ax) * u), Math.round(ay + (by - ay) * u), i, escuro, t);
          }
          resto -= L;
        }
        estado.contornos++;
      }
    }
    function poste(ctx, s) {   // o enfeite pendurado no alto do poste
      if (!noPoste) return;
      const pendura = noPoste === "baloes" ? 0 : FORMAS[noPoste].length;
      forma(ctx, noPoste, s.x + (noPoste === "baloes" ? 2 : 0.5), s.y - alto + 2 + pendura);
    }

    function lampada(x, y, i, escuro, t) {   // a cor de uma lâmpada do pisca agora (à noite, metade acesa de cada vez)
      const noite = escuro > 0.05, acesa = !noite || reduzido || (i + Math.floor(t / 500)) % 2 === 0;
      estado.luzes++;
      if (noite && acesa) { estado.acesas++; luzes.push(x, y, i % festa.cores.length); }
      return acesa ? cor(i) : APAGADA;
    }
    function lampadaEm(ctx, x, y, i, escuro, t) {   // a lâmpada dos vãos e contornos: só a que está na vista
      if (!naVista(x, y)) return;
      ctx.fillStyle = lampada(x, y, i, escuro, t); ctx.fillRect(x, y, 1, 1);
    }
    function chao(ctx, escuro, t) {
      for (let i = 0; i < anel.length; i++) {
        const [x, y] = anel[i];
        ctx.fillStyle = lampada(x, y, i, escuro, t); ctx.fillRect(x, y, 1, 1);
      }
    }
    // o contorno de cima da peça (o telhado), lido da arte uma vez: a linha mais alta opaca de cada coluna
    function contorno(nome) {
      if (contornos.has(nome)) return contornos.get(nome);
      const r = recorte(nome);
      let topo = null;
      try {
        const c = document.createElement("canvas"); c.width = r[2]; c.height = r[3];
        const g = c.getContext("2d"); g.drawImage(atlas(), r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
        const d = g.getImageData(0, 0, r[2], r[3]).data;
        topo = [];
        for (let x = 0; x < r[2]; x++) {
          let y = 0;
          while (y < r[3] && d[(y * r[2] + x) * 4 + 3] === 0) y++;
          topo.push(y);
        }
      } catch (e) { topo = null; }
      contornos.set(nome, topo);
      return topo;
    }
    function telhado(ctx, nome, px, py, escuro, t) {   // o pisca no contorno do telhado do chalé
      if (!tem("pisca")) return;
      const r = recorte(nome), topo = r && contorno(nome);
      if (!topo) return;
      const x0 = Math.round(px - r[2] / 2), y0 = Math.round(py - r[3]);
      for (let x = 3, i = 0; x < r[2] - 3; x += 3, i++) {
        if (topo[x] > r[3] * 0.6) continue;   // a base de grama do desenho não é telhado
        ctx.fillStyle = lampada(x0 + x, y0 + topo[x] + 1, i, escuro, t);
        ctx.fillRect(x0 + x, y0 + topo[x] + 1, 1, 1);
      }
    }

    // por cima da noite: o brilho das lâmpadas acesas, da fogueira, das lanternas e das abóboras
    function noite(ctx, escuro, brilho, vista) {
      if (!festa || escuro <= 0.05) return;
      ctx.globalCompositeOperation = "lighter";
      for (let j = 0; j < luzes.length; j += 3) {
        const x = luzes[j], y = luzes[j + 1], c = luzes[j + 2];
        if (j < BRILHOS * 3) brilho(ctx, x + 0.5, y + 0.5, 4, 0.5 * escuro, rgbs[c]);
        ctx.fillStyle = festa.cores[c]; ctx.fillRect(x, y, 1, 1);
      }
      for (const s of itens) if (s.brilha && s.x > vista[0] - 40 && s.x < vista[2] + 40) brilho(ctx, s.x, s.y - 6, 18, 0.55 * escuro, s.brilha);
      if (noPoste === "lanternas") for (const s of postes) brilho(ctx, s.x + 0.5, s.y - alto + 5, 8, 0.6 * escuro, BRILHA.lanternas);
      ctx.globalCompositeOperation = "source-over";
    }

    // no ar, sobre a parte da cidade que está na tela: fogos (à noite), confete, serpentina, neve e morcegos
    function ar(ctx, dt, t, vista, escuro, brilho) {
      if (!festa) return;
      const [vx0, vy0, vx1, vy1] = vista, w = vx1 - vx0, h = vy1 - vy0, rnd = Math.random;
      if (tem("fogos") && escuro > 0.4 && !reduzido) {
        if ((espera -= dt) <= 0 && fogos.length < 5) {
          const ceu = ancoras && ancoras.ceu, i = Math.floor(rnd() * 3);   // estouram no céu da cena; sem ele, na vista
          const y = ceu ? ceu[1] + rnd() * (ceu[3] - ceu[1]) : vy0 + 16 + rnd() * h * 0.4;
          fogos.push({ x: ceu ? ceu[0] + rnd() * (ceu[2] - ceu[0]) : vx0 + 30 + rnd() * (w - 60), y, y0: y + 60 + rnd() * 30, k: 0, cor: cor(i), cor2: cor(i + 1), rgb: rgbs[i % rgbs.length],
                       fase: rnd() * 6, alcance: 20 + rnd() * 12 });
          espera = 0.5 + rnd() * 0.9;
        }
        ctx.globalCompositeOperation = "lighter";
        for (const f of fogos) {
          f.k += dt;
          if (f.k < 0.8) {   // subindo, com o rastro
            const u = f.k / 0.8, y = Math.round(f.y0 + (f.y - f.y0) * u * (2 - u));
            ctx.fillStyle = "#ffe9a8"; ctx.fillRect(Math.round(f.x), y, 1, 2);
            ctx.fillStyle = "rgba(255,200,120,.5)"; ctx.fillRect(Math.round(f.x), y + 3, 1, 2);
            continue;
          }
          // o estouro: faíscas em traço, em duas cores e alcances, que caem um pouco e cintilam no fim
          const e = f.k - 0.8, vida = 1 - e / 1.5, abre = 1 - Math.exp(-e * 2.6), cai = 7 * e * e;
          if (e < 0.35) brilho(ctx, f.x, f.y, 26, 0.6 * (1 - e / 0.35), f.rgb);
          for (let i = 0; i < 24; i++) {
            if (vida < 0.35 && (i + Math.floor(t / 90)) % 2) continue;
            const a = i / 24 * Math.PI * 2 + f.fase, r = f.alcance * abre * (i % 2 ? 0.62 : 1), co = Math.cos(a), si = Math.sin(a) * 0.85;
            ctx.globalAlpha = Math.max(0, vida);
            ctx.fillStyle = i % 4 === 0 ? "#ffffff" : i % 2 ? f.cor2 : f.cor;
            ctx.fillRect(Math.round(f.x + co * r), Math.round(f.y + si * r + cai), 1, 1);
            ctx.globalAlpha = Math.max(0, vida * 0.45);
            ctx.fillRect(Math.round(f.x + co * (r - 2)), Math.round(f.y + si * (r - 2) + cai * 0.8), 1, 1);
          }
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = "source-over";
        fogos = fogos.filter(f => f.k < 2.3);
      } else fogos.length = 0;
      estado.fogos = fogos.length;
      const papel = tem("confete") && !reduzido, fita = tem("serpentina") && !reduzido;
      if (papel && confete.length < 60 && rnd() < dt * 9) {
        confete.push({ x: vx0 + rnd() * w, y: vy0 - 4, v: 9 + rnd() * 7, f: rnd() * 6, c: cor(Math.floor(rnd() * 4)) });
      }
      if (fita && fitas.length < 10 && rnd() < dt * 1.6) {
        fitas.push({ x: vx0 + rnd() * w, y: vy0 - 8, v: 7 + rnd() * 4, f: rnd() * 6, c: cor(Math.floor(rnd() * 4)) });
      }
      for (const lista of [confete, fitas]) for (const q of lista) { q.y += q.v * dt; q.x += Math.sin(t / 700 + q.f) * 4 * dt; }
      confete = papel ? confete.filter(q => q.y < vy1 + 4) : [];
      fitas = fita ? fitas.filter(q => q.y < vy1 + 8) : [];
      for (const q of confete) {   // papelzinho girando: ora de frente, ora de lado
        ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), Math.floor(t / 180 + q.f) % 2 ? 2 : 1, 1);
      }
      for (const q of fitas) {   // serpentina: uma fita fina em zigue-zague
        ctx.fillStyle = q.c;
        for (let i = 0; i < 7; i++) ctx.fillRect(Math.round(q.x + Math.sin(i * 1.3 + q.f + t / 400) * 1.6), Math.round(q.y) + i, 1, 1);
      }
      estado.confete = confete.length; estado.serpentina = fitas.length;
      if (neve() && !reduzido) {   // flocos caindo devagar, os primeiros já espalhados pela vista
        for (let i = flocos.length ? 1 : FLOCOS / 2; i > 0 && flocos.length < FLOCOS; i--) {
          flocos.push({ x: vx0 + rnd() * w, y: vy0 + (flocos.length < FLOCOS / 2 ? rnd() * h : -2), v: 6 + rnd() * 6, f: rnd() * 6 });
        }
        ctx.fillStyle = NEVE;
        for (const q of flocos) {
          q.y += q.v * dt; q.x += Math.sin(t / 900 + q.f) * 3 * dt;
          ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
        }
        flocos = flocos.filter(q => q.y < vy1 + 2);
      } else flocos.length = 0;
      estado.flocos = flocos.length;
      estado.morcegos = 0;
      if (tem("morcegos") && escuro > 0.3) for (let i = 0; i < 5; i++) {   // morcegos cruzando a noite
        const tt = reduzido ? 0 : t, x = Math.round(vx0 - 10 + ((tt / 45 + i * 157) % (w + 20)));
        const y = Math.round(vy0 + 14 + i * h * 0.12 + Math.sin(tt / 520 + i * 2) * 5), asa = reduzido ? 0 : Math.floor(tt / 130 + i) % 2;
        ctx.fillStyle = "#1b1426";
        ctx.fillRect(x, y, 2, 2); ctx.fillRect(x - 3, y - asa, 3, 1); ctx.fillRect(x + 2, y - asa, 3, 1);
        ctx.fillRect(x - 3, y + 1 - asa * 2, 1, 1); ctx.fillRect(x + 4, y + 1 - asa * 2, 1, 1);
        estado.morcegos++;
      }
    }

    // o começo de cada quadro: zera o que foi desenhado; o fim: guarda o estado
    function comecar(f, p, id, ps, vista) {
      preparar(f, p, id);
      postes = ps; vistaAtual = vista;
      luzes.length = 0; desenhadas.clear(); pecas.length = 0; noPalco.length = 0;
      estado.chave = festa ? festa.chave : null;
      estado.neve = neve();
      estado.cordoes = estado.bandeirinhas = estado.luzes = estado.acesas = estado.fios = estado.contornos = estado.fitas = 0;
    }
    function terminar(escuro) { estado.piscando = !!festa && tem("pisca") && escuro > 0.05 && !reduzido; }

    // desvio: quanto a fonte da praça anda para a direita nesta festa (0 sem festa ou com espaço de sobra)
    return { comecar, terminar, chao, desenhar, aereos, poste, telhado, noite, ar, estado,
             get itens() { return itens; }, get festa() { return festa; }, get desvio() { return desvio; } };
  }
  return { criar };
})();
window.MundoFesta = MundoFesta;
