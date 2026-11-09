// Mapa do Brasil, o nível 2 do mundo: brasil.png com as 28 cidades e o tempo de agora em cada uma (nuvens com sombra,
// chuva, garoa, neve, neblina e raio só sobre a cidade), a noite pelo horário com as luzes acesas e até 6 aviões com
// sombra no chão, em curva leve pelas rotas. O mapa e as nuvens seguem a escala da câmera; ícones, aviões e partículas
// têm tamanho fixo na tela (U pixels da tela por pixel do desenho), sempre em escala inteira e sem suavização.
// ?clima= vale para todas as cidades; ?hora= vem do Ceu. Com movimento reduzido, nem aviões nem partículas (nem raio).
// Também monta o nível Cidade provisório (a Tarefa 6 traz o de verdade): o mapa de perto, que leva ao bairro.
"use strict";
const MundoMapa = (() => {
  const TIPOS = ["limpo", "nublado", "neblina", "garoa", "chuva", "tempestade", "neve"];
  const NOMES = { limpo: "céu limpo", nublado: "nublado", neblina: "neblina", garoa: "garoa", chuva: "chuva", tempestade: "tempestade", neve: "neve" };
  const CHUVA = { garoa: 5, chuva: 12, tempestade: 22, neve: 8 };   // partículas por segundo em cada cidade
  const NUVEM = { nublado: ["branca", 4.5], garoa: ["cinza", 4.5], chuva: ["cinza", 5.5], tempestade: ["escura", 6.5], neve: ["branca", 5] };
  const MAX_AVIOES = 6, MAX_PARTICULAS = 360, VELOCIDADE = 12, MAR = "#1d3b5c";
  const GRANDES = new Set(["sao-paulo", "rio-de-janeiro", "brasilia", "belo-horizonte", "salvador", "fortaleza", "recife",
    "manaus", "curitiba", "porto-alegre", "belem", "goiania"]);
  const busca = new URLSearchParams(location.search);
  const simulado = TIPOS.includes(busca.get("clima")) ? busca.get("clima") : null;
  const horaSimulada = busca.has("hora");

  // sprites em texto: cada letra é uma cor da paleta, "." é vazio. A base do ícone fica no ponto da cidade.
  const PEQUENA = ["...kkkk", "...kaak", "...kjjk", "kkkkaak", "kjakjjk", "kajkaak", "kjakjjk", "kkkkkkk"];
  const GRANDE = [".....k.....", "...kkkkk...", "...kajak...", "...kaaakkkk", "...kajakajk", "kkkkaaakaak",
    "kjjkajakajk", "kaakaaakaak", "kjjkajakajk", "kaakaaakaak", "kkkkkkkkkkk"];
  const CHALE = ["...k...", "..krk..", ".krrrk.", "krrrrrk", ".kajak.", ".kadak.", ".kkkkk."];
  const MARCO = ["..k..", ".kok.", "koook", ".kok.", "..k.."];
  const SETA = ["kkkkkkk", "koooook", ".koook.", "..kok..", "...k..."];
  const AVIAO = ["....g......", "....gg.....", "t...ggg....", "twwwwwwwwwc", "t...ggg....", "....gg.....", "....g......"];   // para o leste
  const DIA = { k: "#25301f", a: "#e6e0cc", j: "#7d9bbb", r: "#c0563a", d: "#5a3a26", o: "#f5c84d", w: "#f2f5f8", g: "#b8c4d2", c: "#28374f", t: "#d8473a" };
  const NOITE = { k: "#0c1120", a: "#454b62", j: "#ffd977", r: "#5e3434", d: "#ffd977", o: "#f5c84d", w: "#a4adc0", g: "#6c768a", c: "#ffe9a8", t: "#7a3a3a" };
  const CORES_NUVEM = { branca: ["#ffffff", "#eef2f6", "#c4ccd8"], cinza: ["#d8dde4", "#aab2be", "#7c8594"], escura: ["#8a93a2", "#5f6776", "#3e4452"] };

  function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mistura(a, b, f) { const x = rgb(a), y = rgb(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(",")})`; }
  function semente(s) { return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
  // U: pixels da tela por pixel de sprite. 2 px de CSS, mas nunca maior que a escala base do nível: no celular, o ícone
  // fica na mesma grade do mapa em vez de cobrir as cidades vizinhas
  function unidade(cam) { return Math.max(1, Math.min(Math.round(2 * cam.dpr), cam.base)); }

  // telas pequenas guardadas: o sprite é pintado uma vez por cor e escala, e depois só copiado
  const telas = new Map();
  function sprite(chave, linhas, cores, U) {
    const k = chave + "|" + U;
    let c = telas.get(k);
    if (c) return c;
    c = document.createElement("canvas"); c.width = linhas[0].length * U; c.height = linhas.length * U;
    const g = c.getContext("2d");
    linhas.forEach((linha, y) => {
      for (let x = 0; x < linha.length; x++) {
        const cor = linha[x] === "." ? null : typeof cores === "string" ? cores : cores[linha[x]];
        if (cor) { g.fillStyle = cor; g.fillRect(x * U, y * U, U, U); }
      }
    });
    telas.set(k, c);
    return c;
  }
  // o avião girado em 16 direções pelo vizinho mais próximo: continua pixel art, sem borrão
  const giros = [];
  function girado(i) {
    if (giros[i]) return giros[i];
    const th = i * Math.PI / 8, co = Math.cos(th), si = Math.sin(th), cx = (AVIAO[0].length - 1) / 2, cy = (AVIAO.length - 1) / 2, linhas = [];
    for (let dy = -7; dy <= 7; dy++) {
      let s = "";
      for (let dx = -7; dx <= 7; dx++) { const sx = Math.round(co * dx + si * dy + cx), sy = Math.round(-si * dx + co * dy + cy); s += (AVIAO[sy] && AVIAO[sy][sx]) || "."; }
      linhas.push(s);
    }
    return (giros[i] = linhas);
  }
  // nuvem em pixel: bolas achatadas; a beira de baixo mais escura e a de cima mais clara
  function formaNuvem(n, r) {
    const rnd = semente(n * 7919 + 13), bolas = [[0, 0, r]];
    for (let i = 0, q = 2 + Math.floor(rnd() * 3); i < q; i++) bolas.push([(rnd() - 0.5) * r * 2.4, (rnd() - 0.3) * r * 0.6, r * (0.45 + rnd() * 0.45)]);
    const den = (x, y) => bolas.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.4) ** 2 <= br * br);
    const x0 = Math.floor(Math.min(...bolas.map(b => b[0] - b[2]))), x1 = Math.ceil(Math.max(...bolas.map(b => b[0] + b[2])));
    const y0 = Math.floor(Math.min(...bolas.map(b => b[1] - b[2]))), y1 = Math.ceil(Math.max(...bolas.map(b => b[1] + b[2])));
    const linhas = [];
    for (let y = y0; y <= y1; y++) {
      let s = "";
      for (let x = x0; x <= x1; x++) s += !den(x + 0.5, y + 0.5) ? "." : !den(x + 0.5, y + 2) ? "b" : !den(x + 0.5, y - 1) ? "l" : "m";
      linhas.push(s);
    }
    return { linhas, ox: x0, oy: y0, id: "n" + n + "_" + r };
  }
  function telaNuvem(f, tipo, escuro) {
    const passo = Math.round(escuro * 4), [l, m, b] = CORES_NUVEM[tipo].map(c => mistura(c, "#141a34", passo / 4 * 0.72));
    return sprite(f.id + tipo + passo, f.linhas, { l, m, b }, 1);
  }

  function criar({ dados, Camera, reduzido }) {
    const nivel = dados.niveis && dados.niveis.brasil, W = (nivel && nivel.w) || 400, H = (nivel && nivel.h) || 400;
    const rnd = semente(7);
    const cidades = (Array.isArray(dados.cidades) ? dados.cidades : [])
      .filter(c => c && typeof c.id === "string" && Number.isFinite(c.x) && Number.isFinite(c.y))
      .map((c, i) => ({ id: c.id, nome: String(c.nome || c.id), uf: String(c.uf || ""), x: c.x + 0.5, y: c.y + 0.5, marco: !!c.marco,
        grande: GRANDES.has(c.id), n: i, fase: rnd() * 6, emissao: 0, raio: 2 + rnd() * 6, flash: 0, bolt: 0, formas: {},
        tempo: { tipo: "limpo", vento: 0, noite: false } }));
    const porId = new Map(cidades.map(c => [c.id, c]));
    const rotas = (Array.isArray(dados.rotas) ? dados.rotas : []).filter(r => Array.isArray(r) && porId.has(r[0]) && porId.has(r[1]))
      .map(([a, b], i) => {   // a curva leve: o ponto de controle sai do meio, de lado, 14% do comprimento
        const A = porId.get(a), B = porId.get(b), dx = B.x - A.x, dy = B.y - A.y, s = i % 2 ? 0.14 : -0.14;
        return { a: A, b: B, d: Math.hypot(dx, dy) || 1, cx: (A.x + B.x) / 2 - dy * s, cy: (A.y + B.y) / 2 + dx * s };
      });
    const longas = rotas.filter(r => r.d >= 20).length ? rotas.filter(r => r.d >= 20) : rotas;
    const ambiente = [0, 1, 2, 3, 4].map(i => ({ x: rnd() * W, y: 30 + rnd() * (H - 60), forma: formaNuvem(100 + i, 7 + i * 1.6) }));
    const avioes = [], gotas = [], brilhos = [];
    let casa = null, vento = 0, mascara = null, espera = 0, luzes = [], vinheta = null;

    const imagem = new Image();
    imagem.addEventListener("load", () => {   // terra e mar do mapa: as luzes da noite e o brilho do mar ficam no lugar certo
      try {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d"); g.drawImage(imagem, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        mascara = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) mascara[i] = d[i * 4 + 2] > d[i * 4 + 1] ? 0 : 1;
        montarLuzes();
      } catch (e) { mascara = null; }
    });
    imagem.src = "/mundo/brasil.png?v=" + (Number.isInteger(dados.versao) ? dados.versao : 0);
    const pronta = () => imagem.complete && imagem.naturalWidth > 0;
    const terra = (x, y) => !mascara || (x >= 0 && y >= 0 && x < W && y < H && mascara[(y | 0) * W + (x | 0)] === 1);
    function montarLuzes() {   // as cidadezinhas em volta de cada capital, acesas à noite
      const r = semente(42);
      luzes = [];
      for (const c of cidades) for (let i = 0, q = c.grande ? 14 : 7; i < q; i++) {
        const a = r() * Math.PI * 2, d = 2 + r() * (c.grande ? 12 : 8), x = Math.floor(c.x + Math.cos(a) * d), y = Math.floor(c.y + Math.sin(a) * d);
        if (terra(x, y)) luzes.push([x + 0.5, y + 0.5, 0.4 + r() * 0.6, i]);
      }
    }
    montarLuzes();

    function clima(resp) {
      const d = resp && typeof resp === "object" ? resp : {}, lista = d.cidades && typeof d.cidades === "object" ? d.cidades : {};
      for (const c of cidades) {
        const v = Object.prototype.hasOwnProperty.call(lista, c.id) && lista[c.id] && typeof lista[c.id] === "object" ? lista[c.id] : {};
        c.tempo = { tipo: simulado || (TIPOS.includes(v.tipo) ? v.tipo : "limpo"),
                    vento: typeof v.vento === "number" && v.vento > 0 ? Math.min(1, v.vento) : 0, noite: v.noite === true };
      }
      casa = typeof d.casa === "string" && porId.has(d.casa) ? d.casa : null;
      vento = cidades.length ? cidades.reduce((s, c) => s + c.tempo.vento, 0) / cidades.length : 0;
    }
    clima(null);
    const noiteEm = c => horaSimulada ? Ceu.agora().escuro > 0.5 : c.tempo.noite;
    const texto = c => NOMES[c.tempo.tipo] + (noiteEm(c) ? ", noite" : "");

    function decolar(s) { return { r: longas[Math.floor(Math.random() * longas.length)], ida: Math.random() < 0.5, s, rastro: [], marca: 0 }; }
    function ponto(a) {   // posição na curva e direção do voo
      const u = a.ida ? a.s : 1 - a.s, { a: A, b: B, cx, cy } = a.r, v = 1 - u;
      const x = v * v * A.x + 2 * v * u * cx + u * u * B.x, y = v * v * A.y + 2 * v * u * cy + u * u * B.y;
      const dx = 2 * v * (cx - A.x) + 2 * u * (B.x - cx), dy = 2 * v * (cy - A.y) + 2 * u * (B.y - cy), k = a.ida ? 1 : -1;
      const alt = Math.min(1, Math.min(a.s, 1 - a.s) / 0.2);
      return [x, y, Math.atan2(dy * k, dx * k), alt * alt * (3 - 2 * alt)];
    }
    if (!reduzido && longas.length) for (let i = 0; i < 3; i++) avioes.push(decolar(0.15 + Math.random() * 0.6));

    function simular(dt, t) {
      if (reduzido) return;
      for (const n of ambiente) { n.x -= dt * (1.5 + vento * 8); if (n.x < -40) { n.x = W + 40; n.y = 30 + Math.random() * (H - 60); } }
      espera -= dt;
      if (espera <= 0 && avioes.length < MAX_AVIOES && longas.length) { avioes.push(decolar(0)); espera = 1.5 + Math.random() * 3; }
      for (const a of avioes) {
        a.s += dt * VELOCIDADE / a.r.d;
        const [x, y, , alt] = ponto(a);
        a.marca -= dt;
        if (alt > 0.8 && a.marca <= 0) { a.rastro.push([x, y, 1]); a.marca = 0.12; }
        for (const r of a.rastro) r[2] -= dt * 0.9;
        a.rastro = a.rastro.filter(r => r[2] > 0);
      }
      for (let i = avioes.length - 1; i >= 0; i--) if (avioes[i].s >= 1) avioes.splice(i, 1);
      for (const c of cidades) {
        const k = c.tempo.tipo, taxa = CHUVA[k] || 0;
        c.flash = Math.max(0, c.flash - dt * 3);
        if (k === "tempestade" && (c.raio -= dt) <= 0) { c.flash = 1; c.raio = 2.5 + Math.random() * 6; c.bolt = Math.floor(Math.random() * 1e6); }
        c.emissao = Math.min(4, c.emissao + dt * taxa);
        while (c.emissao >= 1) {
          c.emissao -= 1;
          if (gotas.length < MAX_PARTICULAS) gotas.push({ c, x: c.x - 4 + Math.random() * 8, y: c.y - 8 + Math.random() * 2, neve: k === "neve",
            v: k === "neve" ? 3 + Math.random() * 2 : 14 + Math.random() * 6, f: Math.random() * 6, resp: 0 });
        }
      }
      for (const g of gotas) {
        if (g.resp) { g.resp -= dt; continue; }
        g.y += g.v * dt;
        g.x += g.neve ? (Math.sin(t / 500 + g.f) * 1.2 - g.c.tempo.vento * 2) * dt : -(0.5 + g.c.tempo.vento * 3) * dt;
        if (g.y >= g.c.y + 2 + (g.f % 2)) g.resp = g.neve ? -1 : 0.14;
      }
      for (let i = gotas.length - 1; i >= 0; i--) if (gotas[i].resp < 0) gotas.splice(i, 1);
      if (mascara) {
        while (brilhos.length < 26) {
          const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
          if (!terra(x, y)) brilhos.push({ x: x + 0.5, y: y + 0.5, v: 0.6 + Math.random() * 1.4, total: 0 }); else if (Math.random() < 0.5) break;
        }
        for (const b of brilhos) { b.total = b.total || b.v; b.v -= dt; }
        for (let i = brilhos.length - 1; i >= 0; i--) if (brilhos[i].v <= 0) brilhos.splice(i, 1);
      }
    }

    function nuvensDaCidade(c, t) {
      const n = NUVEM[c.tempo.tipo];
      if (!n) return null;
      const f = c.formas[c.tempo.tipo] || (c.formas[c.tempo.tipo] = formaNuvem(c.n * 11 + TIPOS.indexOf(c.tempo.tipo), n[1]));
      const balanco = reduzido ? 0 : Math.sin(t / 2600 + c.fase) * 1.2;
      return { f, tipo: n[0], x: Math.round(c.x - 1 + balanco), y: Math.round(c.y - 11), sx: 3, sy: 6 };
    }

    // um quadro: chão e mapa (mundo), sombras, noite e luzes, cidades, aviões, nuvens e precipitação (tela)
    function desenhar(ctx, dt, t, cam, foco, destaque) {
      simular(dt, t);
      const P = cam.P, [ox, oy] = cam.origem(), U = unidade(cam), TW = cam.W, TH = cam.H;
      const ceu = Ceu.agora(), escuro = Math.max(0, Math.min(1, ceu.escuro)), noite = escuro > 0.45;
      const tx = x => Math.round(ox + x * P), ty = y => Math.round(oy + y * P);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = MAR; ctx.fillRect(0, 0, TW, TH);
      ctx.setTransform(P, 0, 0, P, ox, oy);
      if (pronta()) {   // além da imagem, as bordas esticadas: a terra e o mar continuam
        const E = 4000;
        ctx.drawImage(imagem, 0, 0, 1, H, -E, 0, E, H); ctx.drawImage(imagem, W - 1, 0, 1, H, W, 0, E, H);
        ctx.drawImage(imagem, 0, 0, W, 1, 0, -E, W, E); ctx.drawImage(imagem, 0, H - 1, W, 1, 0, H, W, E);
        ctx.drawImage(imagem, 0, 0, 1, 1, -E, -E, E, E); ctx.drawImage(imagem, W - 1, 0, 1, 1, W, -E, E, E);
        ctx.drawImage(imagem, 0, H - 1, 1, 1, -E, H, E, E); ctx.drawImage(imagem, W - 1, H - 1, 1, 1, W, H, E, E);
        ctx.drawImage(imagem, 0, 0);
      }
      const nuvens = [];
      for (const c of cidades) {   // o chão de cada cidade: neve assentada, chão molhado, neblina
        const k = c.tempo.tipo;
        if (k === "neve") ctx.drawImage(sprite("neve", DISCO, "rgba(240,246,255,.85)", 1), Math.floor(c.x) - 6, Math.floor(c.y) - 5);
        else if (CHUVA[k]) ctx.drawImage(sprite("molhado", DISCO, "rgba(10,24,48,.2)", 1), Math.floor(c.x) - 6, Math.floor(c.y) - 5);
        else if (k === "neblina") {
          ctx.fillStyle = "rgba(226,232,240,.38)";
          for (let i = 0; i < 3; i++) { const d = reduzido ? 0 : Math.round(Math.sin(t / 1800 + i * 2 + c.fase) * 2); ctx.fillRect(Math.floor(c.x) - 8 + d + i * 2, Math.floor(c.y) - 5 + i * 3, 13 - i * 2, 2); }
        }
        const n = nuvensDaCidade(c, t);
        if (n) nuvens.push(n);
      }
      for (const n of ambiente) nuvens.push({ f: n.forma, tipo: "branca", x: Math.round(n.x), y: Math.round(n.y), sx: 6, sy: 10, ambiente: true });
      for (const n of nuvens) ctx.drawImage(sprite(n.f.id + "s", n.f.linhas, "rgba(6,14,24,.22)", 1), n.x + n.f.ox + n.sx, n.y + n.f.oy + n.sy);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const a of avioes) {   // sombra no chão, mais longe quanto mais alto
        const [x, y, ang, alt] = ponto(a), i = ((Math.round(ang / (Math.PI / 8)) % 16) + 16) % 16;
        ctx.drawImage(sprite("av" + i + "s", girado(i), "rgba(4,10,18,.3)", U), tx(x) - 7 * U + Math.round(alt * 3) * U, ty(y) - 7 * U + Math.round(alt * 4) * U);
      }
      ctx.globalAlpha = 0.1; ctx.fillStyle = ceu.cima; ctx.fillRect(0, 0, TW, TH); ctx.globalAlpha = 1;   // o tom do céu
      if (escuro > 0) { ctx.fillStyle = `rgba(6,10,34,${escuro * 0.62})`; ctx.fillRect(0, 0, TW, TH); }
      if (escuro > 0.05) {   // luzes: brilho em volta das capitais e as cidadezinhas
        ctx.globalCompositeOperation = "lighter";
        for (const c of cidades) {
          const x = tx(c.x), y = ty(c.y) - 2 * U, r = (c.grande ? 17 : 10) * U * (reduzido ? 1 : 1 + 0.05 * Math.sin(t / 700 + c.fase));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255,196,110,${0.5 * escuro})`); g.addColorStop(0.45, `rgba(255,160,70,${0.16 * escuro})`); g.addColorStop(1, "rgba(255,150,60,0)");
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
        for (const [x, y, b, i] of luzes) {
          if (!reduzido && (Math.floor(t / 900) + i) % 13 === 0) continue;   // uma ou outra pisca
          ctx.fillStyle = `rgba(255,214,130,${escuro * b})`; ctx.fillRect(tx(x), ty(y), U, U);
        }
      } else for (const b of brilhos) {   // o sol brilhando no mar
        ctx.fillStyle = `rgba(190,225,255,${0.55 * Math.sin(Math.PI * b.v / b.total)})`; ctx.fillRect(tx(b.x), ty(b.y), U, U);
      }
      if (destaque && porId.has(destaque)) {   // as rotas da cidade em destaque, tracejadas e andando
        ctx.fillStyle = "rgba(255,236,170,.8)";
        for (const r of rotas) if (r.a.id === destaque || r.b.id === destaque) {
          const n = Math.max(4, Math.ceil(r.d * P / (4 * U)));
          for (let i = 1; i < n; i++) {
            if ((i + (reduzido ? 0 : Math.floor(t / 140))) % 3 === 0) continue;
            const u = i / n, v = 1 - u;
            ctx.fillRect(tx(v * v * r.a.x + 2 * v * u * r.cx + u * u * r.b.x), ty(v * v * r.a.y + 2 * v * u * r.cy + u * u * r.b.y), U, U);
          }
        }
      }
      const ordem = cidades.slice().sort((a, b) => (a.id === casa) - (b.id === casa) || a.y - b.y);
      for (const c of ordem) {   // cidades: sombra, ícone (janelas acesas à noite) e o marco
        const lin = c.id === casa ? CHALE : c.grande ? GRANDE : PEQUENA, nome = c.id === casa ? "chale" : c.grande ? "grande" : "pequena";
        const x0 = tx(c.x) - Math.floor(lin[0].length / 2) * U, y0 = ty(c.y) - (lin.length - 1) * U;
        ctx.drawImage(sprite(nome + "s", lin, "rgba(0,0,0,.35)", U), x0 + U, y0 + U);
        ctx.drawImage(sprite(nome + (noite ? "n" : "d"), lin, noite ? NOITE : DIA, U), x0, y0);
        if (c.marco && c.id !== casa) ctx.drawImage(sprite("marco", MARCO, DIA, U), tx(c.x) - 2 * U, y0 - 6 * U);
        if (c.id === casa) bandeira(ctx, x0 + lin[0].length * U, ty(c.y), U, t, tx(c.x), y0);
        if (c.id === destaque || c.id === foco) colchetes(ctx, x0 - 2 * U, y0 - 2 * U, (lin[0].length + 4) * U, (lin.length + 3) * U, U, t);
      }
      for (const a of avioes) {   // aviões: o rastro, o corpo e, à noite, as luzes de navegação
        const [x, y, ang, alt] = ponto(a), i = ((Math.round(ang / (Math.PI / 8)) % 16) + 16) % 16, sx = tx(x), sy = ty(y) - Math.round(alt * 3) * U;
        for (const [rx, ry, v] of a.rastro) { ctx.fillStyle = `rgba(255,255,255,${0.35 * v})`; ctx.fillRect(tx(rx), ty(ry) - 3 * U, U, U); }
        ctx.drawImage(sprite("av" + i + (noite ? "n" : "d"), girado(i), noite ? NOITE : DIA, U), sx - 7 * U, sy - 7 * U);
        if (noite) {
          const co = Math.cos(ang), si = Math.sin(ang), em = (lx, ly, cor) => { ctx.fillStyle = cor; ctx.fillRect(sx + Math.round(co * lx - si * ly) * U, sy + Math.round(si * lx + co * ly) * U, U, U); };
          em(-1, -3, "#ff4a4a"); em(-1, 3, "#4aff7a");
          if (Math.floor(t / 500) % 2) em(-5, 0, "#ffffff");
        }
      }
      for (const n of nuvens) {   // nuvens por cima de tudo; a de tempestade clareia com o raio
        ctx.setTransform(P, 0, 0, P, ox, oy);
        ctx.globalAlpha = n.ambiente ? 0.6 : 0.95;
        ctx.drawImage(telaNuvem(n.f, n.tipo, escuro), n.x + n.f.ox, n.y + n.f.oy);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      let cor = "";
      for (const g of gotas) {   // chuva em traço, neve em floco, respingo no chão
        const c = g.neve ? "rgba(255,255,255,.95)" : g.resp ? "rgba(200,220,255,.7)" : "rgba(170,200,255,.85)";
        if (c !== cor) ctx.fillStyle = cor = c;
        const x = tx(g.x), y = ty(g.y);
        if (g.neve) ctx.fillRect(x, y, U, U);
        else if (g.resp) { ctx.fillRect(x - U, y, U, U); ctx.fillRect(x + U, y, U, U); }
        else ctx.fillRect(x, y, U, 2 * U);
      }
      for (const c of cidades) if (c.flash > 0.4 && !reduzido) {   // raio: da nuvem ao chão, em zigue-zague
        const r = semente(c.bolt), x = tx(c.x), y1 = ty(c.y - 6), y2 = ty(c.y);
        ctx.fillStyle = `rgba(255,255,230,${c.flash})`;
        for (let y = y1, dx = 0; y < y2; y += U) { ctx.fillRect(x + dx * U, y, U, U); if (r() < 0.4) dx += r() < 0.5 ? -1 : 1; }
        ctx.fillStyle = `rgba(230,236,255,${c.flash * 0.18})`; ctx.fillRect(x - 14 * U, y1 - 10 * U, 28 * U, 24 * U);
      }
      if (foco && porId.has(foco)) {   // nível Cidade: a seta pulando sobre a cidade
        const c = porId.get(foco), pulo = reduzido ? 0 : Math.round((Math.sin(t / 220) + 1) * 1.5) * U;
        ctx.drawImage(sprite("seta", SETA, DIA, U), tx(c.x) - 3 * U, ty(c.y) - 22 * U - pulo);
      }
      if (!vinheta || vinheta.w !== TW || vinheta.h !== TH) {
        const g = ctx.createRadialGradient(TW / 2, TH / 2, Math.min(TW, TH) * 0.4, TW / 2, TH / 2, Math.max(TW, TH) * 0.75);
        g.addColorStop(0, "rgba(4,8,20,0)"); g.addColorStop(1, "rgba(4,8,20,.42)");
        vinheta = { w: TW, h: TH, g };
      }
      ctx.fillStyle = vinheta.g; ctx.fillRect(0, 0, TW, TH);
    }
    function bandeira(ctx, x, base, U, t, cx, y0) {   // a casa deste escritório: mastro, bandeira ao vento e um farol
      if (!reduzido) {
        const k = (t / 1800) % 1, lado = Math.round((6 + k * 12)) * U, cy = y0 + 3 * U;
        ctx.fillStyle = `rgba(245,184,61,${(1 - k) * 0.7})`;
        ctx.fillRect(cx - lado, cy - lado, lado * 2, U); ctx.fillRect(cx - lado, cy + lado - U, lado * 2, U);
        ctx.fillRect(cx - lado, cy - lado, U, lado * 2); ctx.fillRect(cx + lado - U, cy - lado, U, lado * 2);
      }
      ctx.fillStyle = "#2a201a"; ctx.fillRect(x, base - 10 * U, U, 10 * U);
      for (let i = 0; i < 5; i++) {
        const onda = reduzido ? 0 : Math.round(Math.sin(t / 200 - i * 0.9)) * U;
        ctx.fillStyle = i === 4 ? "#c98a26" : "#f5b83d"; ctx.fillRect(x + U + i * U, base - 10 * U + onda, U, 3 * U);
      }
    }
    function colchetes(ctx, x, y, w, h, U, t) {   // destaque: quatro cantos que respiram
      const p = reduzido ? 0 : Math.round((Math.sin(t / 180) + 1) / 2) * U, L = 3 * U;
      ctx.fillStyle = "#ffe08a";
      for (const [cx, cy, sx, sy] of [[x - p, y - p, 1, 1], [x + w + p - U, y - p, -1, 1], [x - p, y + h + p - U, 1, -1], [x + w + p - U, y + h + p - U, -1, -1]]) {
        ctx.fillRect(sx > 0 ? cx : cx - L + U, cy, L, U); ctx.fillRect(cx, sy > 0 ? cy : cy - L + U, U, L);
      }
    }

    // a cidade mais perto do ponto, até uns 12 px de tela do meio do ícone
    function perto(cam, x, y) {
      const U = unidade(cam), raio = Math.max(6 * U, 12 * cam.dpr) / cam.P, sobe = 4 * U / cam.P;
      let melhor = null, d = raio;
      for (const c of cidades) { const e = Math.hypot(c.x - x, c.y - sobe - y); if (e <= d) { d = e; melhor = c; } }
      return melhor;
    }
    function alvo(c, cam) {
      const U = unidade(cam), linhas = c.id === casa ? CHALE.length : c.grande ? GRANDE.length : PEQUENA.length;
      const extra = c.id === casa ? ". O escritório fica aqui" : "";
      return { id: c.id, x: c.x, y: c.y, alto: (linhas + 3) * U / cam.dpr, titulo: `${c.nome} · ${c.uf}`, texto: texto(c) + (c.id === casa ? " · o escritório fica aqui" : ""),
               rotulo: `${c.nome} (${c.uf}): ${texto(c)}${extra}`, acao: { ir: "cidade", cidade: c.id } };
    }

    const camBrasil = Camera([0, 0, W, H]);
    const brasil = {
      nome: "brasil", camera: camBrasil, destaque: null,
      entrar(p) {   // voltando de uma cidade, a câmera sai de perto dela
        const c = p && p.de && porId.get(p.de);
        if (!c) return;
        camBrasil.x = c.x; camBrasil.y = c.y; camBrasil.z = reduzido ? 2 : 4; camBrasil.zoomPara(2); camBrasil.limitar();
      },
      sair() { brasil.destaque = null; },
      quadro(ctx, dt, t) { desenhar(ctx, dt, t, camBrasil, null, brasil.destaque); },
      clique(x, y) { const c = perto(camBrasil, x, y); return c ? { ir: "cidade", cidade: c.id } : null; },
      sobre(x, y) { const c = perto(camBrasil, x, y); return c ? alvo(c, camBrasil) : null; },
      alvos() { return cidades.map(c => alvo(c, camBrasil)); },
      get avioes() { return avioes; }, get particulas() { return gotas.length; },
    };
    let focoId = null;
    const camCidade = Camera([0, 0, 120, 80]);
    const alvoBairro = () => {
      const c = porId.get(focoId), U = unidade(camCidade);
      return { id: "bairro", x: c.x, y: c.y, alto: 26 * U / camCidade.dpr, titulo: `${c.nome} · ${c.uf}`, texto: `${texto(c)} · descer ao bairro`,
               rotulo: `Descer ao bairro de ${c.nome}`, acao: { ir: "bairro", cidade: c.id } };
    };
    const cidade = {
      nome: "cidade", camera: camCidade,
      entrar(p) {   // a caixa: 120x80 do mapa em volta da cidade, dentro da imagem
        const c = porId.get(p.cidade);
        focoId = c.id;
        const x0 = Math.min(W - 120, Math.max(0, c.x - 60)), y0 = Math.min(H - 80, Math.max(0, c.y - 40));
        camCidade.limitar([x0, y0, x0 + 120, y0 + 80]);
        camCidade.x = c.x; camCidade.y = c.y; camCidade.z = 1; camCidade.zoomPara(1); camCidade.limitar();
      },
      sair() {},
      quadro(ctx, dt, t) { desenhar(ctx, dt, t, camCidade, focoId, null); },
      clique() { return { ir: "bairro", cidade: focoId }; },
      sobre() { return alvoBairro(); },
      alvos() { return [alvoBairro()]; },
    };
    return { niveis: { brasil, cidade }, clima, texto, porId, get casa() { return casa; } };
  }
  // o disco de chão (neve ou chuva) em volta da cidade, 13x11
  const DISCO = (() => { const l = []; for (let y = -5; y <= 5; y++) { let s = ""; for (let x = -6; x <= 6; x++) s += x * x + y * y * 1.5 <= 36 && (x * x + y * y * 1.5 <= 16 || (x + y) % 2 === 0) ? "x" : "."; l.push(s); } return l; })();
  return { criar, TIPOS };
})();
window.MundoMapa = MundoMapa;
