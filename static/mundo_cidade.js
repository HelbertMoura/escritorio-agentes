// Cidade, o nível 3 do mundo: a cidade vista de cima, em três quartos, com a arte do PixelLab (static/mundo/atlas.png).
// Quadras e ruas saem por código de uma semente com o id da cidade: o marco no centro (ou os prédios genéricos, quando a
// cidade não tem marco ou a arte dele falta), de 6 a 10 chalés decorativos, árvores e carros nas ruas, que vão pela mão
// direita e giram o desenho (feito para o leste) conforme o sentido. Só a cidade da casa tem o chalé com a placa, e só
// ele desce ao bairro ({ir: "bairro"}). O tempo da cidade chega pelo Clima (o mundo.js o define); a noite, pelo Ceu.
// Com movimento reduzido, carros parados e nada de partículas. O atlas só é pedido na primeira vez que se entra numa cidade.
"use strict";
const MundoCidade = (() => {
  const W = 576, H = 400, E = 32, FAIXA = 8, VAO = 68, LONGE = 600, CARRO = 0.5;   // carro na metade do desenho
  const CORES = { grama: "#5c9a4a", calcada: "#b9b4a6", praca: "#c8b88e", asfalto: "#3a3a42", faixa: "#e9e3c9" };
  const NEVE = { grama: "#e6edf4", calcada: "#cfd7e2", praca: "#dfe5ee", asfalto: "#4a4c56", faixa: "#f2f2f2" };
  const FECHADO = { nublado: 0.18, neblina: 0.25, garoa: 0.3, chuva: 0.4, tempestade: 0.6, neve: 0.15 };

  // o mesmo id dá sempre a mesma sequência (FNV-1a na semente, mulberry32 nos sorteios)
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

  // a planta da cidade: duas ruas em cada eixo, 9 quadras (a do meio é a praça do marco) e as vagas das outras quadras
  // (pelo menos 20). A da casa é a vaga da quadra de baixo do meio mais perto do centro; fora da casa, ela tem uma árvore.
  function planta(id) {
    const r = sorteio(String(id)), passo = n => 4 * (Math.floor(r() * (2 * n + 1)) - n);
    const v = [176 + passo(4), 400 + passo(4)], h = [112 + passo(2), 304 + passo(2)];
    const xs = [0, v[0] - E / 2, v[0] + E / 2, v[1] - E / 2, v[1] + E / 2, W], ys = [0, h[0] - E / 2, h[0] + E / 2, h[1] - E / 2, h[1] + E / 2, H];
    const quadras = [], vagas = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const q = { x0: xs[2 * i], x1: xs[2 * i + 1], y0: ys[2 * j], y1: ys[2 * j + 1], centro: i === 1 && j === 1 };
      quadras.push(q);
      if (q.centro) continue;
      const nx = Math.max(1, Math.floor((q.x1 - q.x0 - 8) / VAO)), ny = Math.max(1, Math.floor((q.y1 - q.y0 - 8) / VAO));
      for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
        vagas.push({ x: Math.round(q.x0 + (a + 0.5) * (q.x1 - q.x0) / nx), y: Math.round(q.y0 + (b + 1) * (q.y1 - q.y0) / ny) - 6, embaixo: i === 1 && j === 2 });
      }
    }
    const meio = (v[0] + v[1]) / 2;
    const k = vagas.reduce((m, s, i) => s.embaixo && (m < 0 || Math.abs(s.x - meio) < Math.abs(vagas[m].x - meio)) ? i : m, -1);
    const resto = vagas.filter((_, i) => i !== k).map(({ x, y }) => ({ x, y }));
    for (let i = resto.length - 1; i > 0; i--) { const m = Math.floor(r() * (i + 1)); [resto[i], resto[m]] = [resto[m], resto[i]]; }
    const n = 6 + Math.floor(r() * 5);
    const chales = resto.slice(0, n).map(s => ({ ...s, peca: "chale-" + (1 + Math.floor(r() * 4)) }));
    const arvores = resto.slice(n).map(s => ({ ...s, peca: "arvore-" + (1 + Math.floor(r() * 3)) }));
    const casa = { x: vagas[k].x, y: vagas[k].y, peca: "chale-2", arvore: "arvore-" + (1 + Math.floor(r() * 3)) };
    const predios = r() < 0.5 ? "predios-1" : "predios-2";
    const carros = [];
    for (let i = 0, q = 4 + Math.floor(r() * 3); i < q; i++) {
      const eixo = i % 2 ? "v" : "h", rua = (eixo === "h" ? h : v)[(i >> 1) % 2];
      carros.push({ eixo, rua, dir: r() < 0.5 ? 1 : -1, s: Math.round(r() * (eixo === "h" ? W : H)), v: 16 + Math.round(r() * 14), peca: "carro-" + (1 + Math.floor(r() * 4)) });
    }
    return { W, H, ruas: { v, h }, quadras, centro: { x: Math.round(meio), y: ys[3] - 8 }, predios, casa, chales, arvores, carros };
  }

  // carro pela mão direita: para o leste na faixa de baixo, para o sul na da esquerda
  const lugar = c => c.eixo === "h" ? [c.s, c.rua + c.dir * FAIXA] : [c.rua - c.dir * FAIXA, c.s];
  const giro = c => c.eixo === "h" ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);

  function criar({ dados, Camera, reduzido, mapa, clima }) {
    const camera = Camera([0, 0, W, H]);
    const marcos = new Map((Array.isArray(dados && dados.cidades) ? dados.cidades : []).filter(c => c && typeof c.marco === "string").map(c => [c.id, c.marco]));
    let id = null, p = planta(""), carros = [], atlas = null, quadros = {}, pedido = false;

    function carregar() {   // o atlas, uma vez; se falhar, a próxima entrada tenta de novo
      if (pedido) return;
      pedido = true;
      fetch("/mundo/atlas.json", { credentials: "omit", cache: "no-cache" })
        .then(r => r.ok ? r.json() : null).catch(() => null)
        .then(d => {
          if (!d || !d.quadros || typeof d.quadros !== "object") { pedido = false; return; }
          quadros = d.quadros;
          const img = new Image();
          img.addEventListener("load", () => { atlas = img; });
          img.src = "/mundo/atlas.png?v=" + (Number.isInteger(d.versao) ? d.versao : 0);
        });
    }
    const recorte = nome => {
      const r = Object.prototype.hasOwnProperty.call(quadros, nome) ? quadros[nome] : null;
      return Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) ? r : null;
    };
    function peca(ctx, nome, x, y) {   // o pé do recorte em (x, y)
      const r = atlas && recorte(nome);
      if (r) ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3]), r[2], r[3]);
    }
    const ehCasa = () => !!id && mapa.casa === id;
    function caixaCasa() {   // o chalé e a placa em cima dele: a área da porta
      const [, , w, h] = recorte(p.casa.peca) || [0, 0, 60, 57];
      return [p.casa.x - w / 2, p.casa.y - h - 11, w, h + 11];
    }
    function naCasa(x, y) { const [cx, cy, w, h] = caixaCasa(); return ehCasa() && x >= cx && x <= cx + w && y >= cy && y <= cy + h; }
    function alvoPorta() {
      const c = mapa.porId.get(id), [, , , h] = caixaCasa();
      return { id: "porta", x: p.casa.x, y: p.casa.y, alto: h * camera.P / camera.dpr, titulo: "Recepção",
               texto: "Chalé do escritório · descer ao bairro", rotulo: `Chalé com a placa, o escritório em ${c ? c.nome : "esta cidade"}: descer ao bairro`,
               acao: { ir: "bairro", cidade: id } };
    }

    function mover(dt) {
      for (const c of carros) {
        if (!reduzido) {
          const L = c.eixo === "h" ? W : H;
          c.s += c.dir * c.v * dt;
          if (c.s > L + 60) c.s = -60; else if (c.s < -60) c.s = L + 60;
        }
        [c.x, c.y] = lugar(c);
      }
    }
    function chao(ctx, cor) {   // grama, quadras com calçada, ruas e a faixa do meio (as ruas seguem além da caixa)
      ctx.fillStyle = cor.grama; ctx.fillRect(-LONGE, -LONGE, W + 2 * LONGE, H + 2 * LONGE);
      for (const q of p.quadras) {
        const x0 = q.x0 === 0 ? -LONGE : q.x0, y0 = q.y0 === 0 ? -LONGE : q.y0, x1 = q.x1 === W ? W + LONGE : q.x1, y1 = q.y1 === H ? H + LONGE : q.y1;
        ctx.fillStyle = cor.calcada; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = q.centro ? cor.praca : cor.grama; ctx.fillRect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6);
      }
      ctx.fillStyle = cor.asfalto;
      for (const x of p.ruas.v) ctx.fillRect(x - E / 2, -LONGE, E, H + 2 * LONGE);
      for (const y of p.ruas.h) ctx.fillRect(-LONGE, y - E / 2, W + 2 * LONGE, E);
      ctx.fillStyle = cor.faixa;
      const cruza = (u, ruas) => ruas.some(r => Math.abs(u - r) < E / 2 + 2);
      for (const y of p.ruas.h) for (let x = -LONGE; x < W + LONGE; x += 16) if (!cruza(x, p.ruas.v) && !cruza(x + 8, p.ruas.v)) ctx.fillRect(x, y - 1, 8, 2);
      for (const x of p.ruas.v) for (let y = -LONGE; y < H + LONGE; y += 16) if (!cruza(y, p.ruas.h) && !cruza(y + 8, p.ruas.h)) ctx.fillRect(x - 1, y, 2, 8);
      ctx.fillStyle = "#2a2a30";   // postes nas esquinas
      for (const [x, y] of postes()) { ctx.fillRect(x, y - 7, 1, 7); ctx.fillRect(x - 1, y - 8, 3, 1); }
    }
    function postes() { const l = []; for (const x of p.ruas.v) for (const y of p.ruas.h) for (const dx of [-21, 20]) for (const dy of [-19, 22]) l.push([x + dx, y + dy]); return l; }
    function brilho(ctx, x, y, r, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,214,130,${a})`); g.addColorStop(1, "rgba(255,190,90,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function quadro(ctx, dt, t) {
      const ceu = Ceu.agora(), escuro = Math.max(0, Math.min(1, ceu.escuro || 0)), tipo = Clima.tipo(), casa = ehCasa();
      mover(dt);
      chao(ctx, tipo === "neve" ? NEVE : CORES);
      if (atlas) for (const c of carros) {   // os carros no chão, por baixo das construções
        const r = recorte(c.peca);
        if (!r) continue;
        const w = Math.round(r[2] * CARRO), h = Math.round(r[3] * CARRO);
        ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.rotate(giro(c));
        ctx.drawImage(atlas, r[0], r[1], r[2], r[3], -Math.round(w / 2), -Math.round(h / 2), w, h);
        ctx.restore();
      }
      const marco = marcos.get(id), centro = marco && recorte("marco-" + marco) ? "marco-" + marco : p.predios;
      const pecas = [{ ...p.centro, peca: centro }, ...p.chales, ...p.arvores, { ...p.casa, peca: casa ? p.casa.peca : p.casa.arvore }];
      for (const s of pecas.sort((a, b) => a.y - b.y || a.x - b.x)) peca(ctx, s.peca, s.x, s.y);
      const [cx, cy, cw] = caixaCasa();
      const [vx0, vy0] = camera.mundo(0, 0), [vx1, vy1] = camera.mundo(camera.W, camera.H);
      const vista = [Math.floor(vx0), Math.floor(vy0), Math.ceil(vx1 - vx0) + 1, Math.ceil(vy1 - vy0) + 1];
      if (FECHADO[tipo]) { ctx.fillStyle = `rgba(62,68,86,${FECHADO[tipo] * 0.6})`; ctx.fillRect(...vista); }
      ctx.globalAlpha = 0.1; ctx.fillStyle = ceu.cima; ctx.fillRect(...vista); ctx.globalAlpha = 1;   // o tom do céu
      if (escuro > 0) { ctx.fillStyle = `rgba(6,10,34,${escuro * 0.62})`; ctx.fillRect(...vista); }
      if (casa) {   // a placa do escritório, por cima da noite (acesa)
        ctx.fillStyle = "#2a1d14"; ctx.fillRect(p.casa.x - 20, cy, 40, 9);
        ctx.fillStyle = "#f2e6c8"; ctx.font = "7px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("RECEPÇÃO", p.casa.x, cy + 4.5);
      }
      if (escuro > 0.05) {   // à noite: postes, janelas, faróis e a placa acesos
        ctx.globalCompositeOperation = "lighter";
        for (const [x, y] of postes()) brilho(ctx, x + 0.5, y - 7, 16, 0.45 * escuro);
        for (const c of p.chales) brilho(ctx, c.x, c.y - 18, 12, 0.35 * escuro);
        if (casa) brilho(ctx, p.casa.x, p.casa.y - 18, 22, 0.55 * escuro);
        for (const c of carros) { const a = giro(c); brilho(ctx, c.x + Math.cos(a) * 18, c.y + Math.sin(a) * 18, 10, 0.5 * escuro); }
        ctx.globalCompositeOperation = "source-over";
      }
      if (!reduzido) {   // chuva, neve, neblina e raio do Clima, sobre a parte da cidade que está na tela
        const som = window.Som && Som.ligado ? Som : null;
        ctx.save(); ctx.translate(vista[0], vista[1]);
        Clima.desenhar(ctx, { W: vista[2], H: vista[3], predioRet: { x: -10, y: -10, w: 0, h: 0 }, ceu: false }, dt, t, som);
        ctx.restore();
      }
      if (casa && cidade.destaque === "porta") {   // destaque: quatro cantos que respiram em volta do chalé
        const d = reduzido ? 0 : Math.round((Math.sin(t / 180) + 1) / 2), [, , , ch] = caixaCasa(), x0 = cx - 3 - d, y0 = cy - 3 - d, x1 = cx + cw + 2 + d, y1 = cy + ch + 2 + d;
        ctx.fillStyle = "#ffe08a";
        for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          ctx.fillRect(sx > 0 ? x : x - 3, y, 4, 1); ctx.fillRect(x, sy > 0 ? y : y - 3, 1, 4);
        }
      }
    }

    const cidade = {
      nome: "cidade", camera, destaque: null,
      entrar(params) {
        id = params.cidade; p = planta(id);
        carros = p.carros.map(c => ({ ...c }));
        mover(0); carregar(); clima();
        camera.vx = camera.vy = 0; camera.voo = camera.ancora = null;
        if (params.nivel === "bairro" && ehCasa() && !reduzido) {   // voltando do bairro, a câmera sai de perto da casa
          camera.x = p.casa.x; camera.y = p.casa.y - 28; camera.z = 4; camera.zoomPara(1);
        } else { camera.x = W / 2; camera.y = H / 2; camera.z = camera.alvoZ = 1; }
        camera.limitar();
      },
      sair() { cidade.destaque = null; },
      quadro,
      clique(x, y) { return naCasa(x, y) ? alvoPorta().acao : null; },
      sobre(x, y) { return naCasa(x, y) ? alvoPorta() : null; },
      alvos() { return ehCasa() ? [alvoPorta()] : []; },
      mergulho() { return ehCasa() ? [p.casa.x, p.casa.y - 28] : [W / 2, H / 2]; },
      get carros() { return carros.map(c => [c.x, c.y]); },
    };
    return cidade;
  }
  return { criar, planta, W, H };
})();
window.MundoCidade = MundoCidade;
