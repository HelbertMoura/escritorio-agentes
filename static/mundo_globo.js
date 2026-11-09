// Globo de abertura, o nível 1 do mundo: a Terra em pixel art num buffer de 160x160 (raio 72) que gira a 6°/s, com o
// sol na posição de agora (ou na hora de ?hora=, em Brasília), o lado da noite escurecido em 3 faixas, as luzes das
// cidades do mundo.json acesas no escuro, nuvens procedurais que andam um pouco mais rápido que o chão e a lua em órbita.
// Cada pixel do buffer volta a (lat, lon) pela projeção ortográfica e pega a cor da célula de 1° de terra.png.
// Arrastar gira o globo; um clique ou zoom sobre o Brasil desce ao nível Brasil (um zoom fora dele gira o globo até o
// Brasil e então desce). Com movimento reduzido, o globo não gira sozinho (fica no centro inicial e só gira à mão), e
// nuvens, lua, estrelas e luzes ficam paradas.
"use strict";
const Globo = (() => {
  const B = 160, C = B / 2, R = 72, GIRO = 6, NUVEM = 1.5, LAT0 = -15, LON0 = -50;
  const CAIXA = [-20, -20, 180, 180];   // a câmera: o buffer com folga para a lua e a atmosfera
  const BRASIL = [-74, -34, -34, 6];    // a caixa do nível Brasil (lon, lat), a mesma do brasil.png
  const RAD = Math.PI / 180, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // terra.png: mar, mar raso, terra e terra alta (a ordem é a classe da célula)
  const TERRA = [[29, 59, 92], [42, 90, 124], [90, 138, 60], [122, 154, 74]];
  const NAO_BRASIL = [[74, 90, 62], [46, 58, 34], [29, 59, 92], [42, 90, 124]];   // vizinho, borda do país e mar no brasil.png
  const DESERTOS = [[16, 31, -16, 33], [14, 31, 34, 58], [26, 35, 50, 65], [37, 46, 78, 110], [-31, -19, 119, 142], [-28, -18, -71, -67]];
  const SETA = ["kkkkkkk", "koooook", ".koook.", "..kok..", "...k..."], CORES_SETA = { k: "#25301f", o: "#f5c84d" };

  const norm = l => ((((l + 180) % 360) + 360) % 360) - 180;
  function semente(s) { return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
  function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // projeção ortográfica centrada em (lat0, lon0): x para o leste, y para baixo, no buffer de 160x160
  function projetar(lat, lon, lon0, lat0, raio) {
    const f = lat * RAD, l = (lon - lon0) * RAD, f0 = lat0 * RAD;
    const x = raio * Math.cos(f) * Math.sin(l), y = raio * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(l));
    return { x: C + x, y: C - y, visivel: Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(l) >= 0 };
  }
  // o caminho de volta: o ponto (x, y) do buffer em (lat, lon), ou null fora do disco
  function ponto(x, y, lon0, lat0, raio) {
    const u = (x - C) / raio, v = (C - y) / raio, r2 = u * u + v * v;
    if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2), s0 = Math.sin(lat0 * RAD), c0 = Math.cos(lat0 * RAD);
    return { lat: Math.asin(Math.max(-1, Math.min(1, z * s0 + v * c0))) / RAD, lon: norm(lon0 + Math.atan2(u, z * c0 - v * s0) / RAD) };
  }
  // o ponto subsolar (onde o sol está a pino) numa data: declinação e longitude pela equação do tempo (aprox. do NOAA)
  function terminador(data) {
    const ms = data.getTime(), n = ms / 86400000 + 2440587.5 - 2451545;
    const L = 280.46 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, eps = (23.439 - 0.0000004 * n) * RAD;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD, eot = norm(L - ra);
    const horas = (((ms % 86400000) + 86400000) % 86400000) / 3600000;
    return { latSol: Math.asin(Math.sin(eps) * Math.sin(lam)) / RAD, lonSol: norm(15 * (12 - horas) - eot) };
  }

  // nuvens: ruído de valor em 3 oitavas, contínuo na volta da longitude, mais denso no equador e nas latitudes médias
  function campoDeNuvens() {
    const d = new Float32Array(360 * 180);
    for (const [S, peso, s] of [[20, 0.5, 1], [9, 0.32, 2], [4, 0.18, 3]]) {
      const nx = Math.round(360 / S), liso = a => a * a * (3 - 2 * a);
      for (let j = 0; j < 180; j++) for (let i = 0; i < 360; i++) {
        const fx = i * nx / 360, fy = j / S, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = liso(fx - x0), ay = liso(fy - y0);
        const v = (a, b) => hash(a % nx, b, s);
        const cima = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * ax, baixo = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * ax;
        d[j * 360 + i] += peso * (cima + (baixo - cima) * ay);
      }
    }
    for (let j = 0; j < 180; j++) {
      const lat = Math.abs(89.5 - j), w = 0.8 + 0.3 * Math.exp(-((lat / 9) ** 2)) + 0.28 * Math.exp(-(((lat - 55) / 12) ** 2)) - 0.22 * Math.exp(-(((lat - 25) / 8) ** 2));
      for (let i = 0; i < 360; i++) d[j * 360 + i] *= w;
    }
    const ordem = Array.from(d).sort((a, b) => a - b), q = p => ordem[Math.floor(ordem.length * p)];
    return { d, limiar: q(0.76), branca: q(0.88) };   // uns 24% do céu com nuvem, o miolo branco
  }

  function criar({ dados, Camera, reduzido }) {
    const busca = new URLSearchParams(location.search), simulada = parseFloat(busca.get("hora"));
    const fixa = simulada >= 0 && simulada < 24 ? (() => {   // ?hora= é a hora de Brasília (UTC−3) de hoje, parada
      const hoje = new Date(Date.now() - 3 * 3600000);
      return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) + (simulada + 3) * 3600000);
    })() : null;
    const camera = Camera(CAIXA), versao = Number.isInteger(dados.versao) ? dados.versao : 0;
    let lon0 = LON0, lat0 = LAT0, vel = reduzido ? 0 : -GIRO, segurando = false, velArraste = 0, ultimo = 0, voo = null;
    let nuvem = 0, lua = reduzido ? 5.6 : 2.2, sol = null, solEm = -1e12, luaTela = null, luaChave = "", feito = { chave: "", t: -1e9, destaque: null };

    // as células de 1°: classe (0 mar, 1 mar raso, 2 terra, 3 terra alta), cor do dia, Brasil e o alvo do clique
    const cor = new Uint8Array(360 * 180 * 3), classe = new Uint8Array(360 * 180), brasil = new Uint8Array(360 * 180);
    let alvoBrasil = null;
    for (let k = 0; k < 360 * 180; k++) cor.set(TERRA[0], k * 3);
    const nuvens = campoDeNuvens();
    const cidades = (Array.isArray(dados.cidades) ? dados.cidades : []).filter(c => c && Number.isFinite(c.lat) && Number.isFinite(c.lon));
    const rnd = semente(11), luzes = [];
    for (const c of cidades) {   // a capital e umas cidadezinhas em volta
      luzes.push([c.lat, c.lon, 1, rnd() * 6]);
      for (let i = 0; i < 2; i++) luzes.push([c.lat + (rnd() - 0.5) * 3.2, c.lon + (rnd() - 0.5) * 3.2, 0.5, rnd() * 6]);
    }

    function ler(src, w, h, usar) {   // a imagem é da mesma origem, então o getImageData funciona; no teste, não carrega
      const img = new Image();
      img.addEventListener("load", () => {
        try {
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const g = c.getContext("2d"); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, w, h);
          if (d && d.data) usar(d.data);
        } catch (e) { /* sem a imagem, fica o globo de mar */ }
      });
      img.src = src;
    }
    const perto = (p, lista) => lista.reduce((m, q, i) => { const e = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); return e < m[0] ? [e, i] : m; }, [1e9, 0])[1];
    ler("/mundo/terra.png?v=" + versao, 360, 180, d => {
      for (let j = 0; j < 180; j++) for (let i = 0; i < 360; i++) {
        const k = j * 360 + i, cl = perto([d[k * 4], d[k * 4 + 1], d[k * 4 + 2]], TERRA);
        classe[k] = cl; cor.set(bioma(i, j, cl), k * 3);
      }
      feito.chave = "";   // a passada guardada era só de mar: refaz (com movimento reduzido, nada mais a refaria)
    });
    ler("/mundo/brasil.png?v=" + versao, 400, 400, d => {   // a célula é do Brasil se 4 de 9 amostras do brasil.png forem
      for (let j = 84; j < 124; j++) for (let i = 106; i < 146; i++) {
        let n = 0;
        for (const a of [2, 5, 8]) for (const b of [2, 5, 8]) {
          const x = (i - 106) * 10 + a, y = (j - 84) * 10 + b, o = (y * 400 + x) * 4;
          if (!NAO_BRASIL.some(q => q[0] === d[o] && q[1] === d[o + 1] && q[2] === d[o + 2])) n++;
        }
        brasil[j * 360 + i] = n >= 4 ? 1 : 0;
      }
      alvoBrasil = new Uint8Array(360 * 180);   // o alvo do clique: o Brasil com 2° de folga, para o dedo
      for (let j = 80; j < 128; j++) for (let i = 102; i < 150; i++) {
        let sim = 0;
        for (let b = -2; b <= 2 && !sim; b++) for (let a = -2; a <= 2 && !sim; a++) sim = brasil[(j + b) * 360 + i + a];
        alvoBrasil[j * 360 + i] = sim;
      }
      feito.chave = "";
    });
    // a cor do dia: o terra.png com gelo nos polos e na Groenlândia, desertos, floresta tropical e taiga
    function bioma(i, j, cl) {
      const lat = 89.5 - j, lon = i - 179.5, jit = (hash(i, j, 9) - 0.5) * 3, alta = cl === 3;
      if (cl <= 1) return Math.abs(lat + jit) > (lat > 0 ? 77 : 70) ? [196, 211, 224] : TERRA[cl];
      if (lat + jit < -60 || lat + jit > 71 || (lat + jit > 60 && lon > -73 && lon < -12)) return alta ? [204, 216, 226] : [230, 237, 242];
      if (DESERTOS.some(([a, b, c, e]) => lat + jit > a && lat + jit < b && lon + jit > c && lon + jit < e)) return alta ? [180, 154, 92] : [200, 174, 110];
      if (lat + jit > 50) return alta ? [107, 138, 82] : [79, 122, 70];
      if (Math.abs(lat + 2 + jit) < 10) return alta ? [79, 138, 62] : [63, 122, 54];
      return TERRA[cl];
    }

    // o disco e o anel da atmosfera, pixel a pixel, calculados uma vez
    const disco = [], anel = [];
    for (let py = 0; py < B; py++) for (let px = 0; px < B; px++) {
      const u = (px + 0.5 - C) / R, v = (C - py - 0.5) / R, r = Math.hypot(u, v), b = BAYER[(py & 3) * 4 + (px & 3)];
      if (r <= 1) disco.push([py * B + px, u, v, Math.sqrt(1 - r * r), b]);
      else if (r <= 1 + 3.5 / R) anel.push([py * B + px, u / r, v / r, r <= 1 + 1.5 / R ? 0 : 1, b]);
    }
    const tela = document.createElement("canvas"); tela.width = tela.height = B;
    const tctx = tela.getContext("2d"), imagem = (tctx && tctx.createImageData && tctx.createImageData(B, B)) || { data: new Uint8ClampedArray(B * B * 4) };
    const estrelas = [], re = semente(5);
    for (let i = 0; i < 260; i++) estrelas.push([re(), re(), re() < 0.1 ? 2 : re() < 0.35 ? 1 : 0, re() * 6]);

    // o fundo do espaço com as estrelas em pixel inteiro de tela, pintado uma vez por tamanho de tela
    let fundo = null;
    function ceu(cam) {
      if (fundo && fundo.width === cam.W && fundo.height === cam.H) return fundo;
      fundo = fundo || document.createElement("canvas"); fundo.width = cam.W; fundo.height = cam.H;
      const g = fundo.getContext("2d"), S = Math.max(1, Math.round(cam.dpr));
      if (!g) return fundo;
      g.fillStyle = "#070a16"; g.fillRect(0, 0, cam.W, cam.H);
      for (const [ex, ey, nv] of estrelas) {
        const x = Math.floor(ex * cam.W / S) * S, y = Math.floor(ey * cam.H / S) * S;
        g.fillStyle = `rgba(220,230,255,${0.3 + nv * 0.3})`; g.fillRect(x, y, S, S);
        if (nv === 2 && reduzido) { g.fillRect(x - S, y, S * 3, S); g.fillRect(x, y - S, S, S * 3); }
      }
      return fundo;
    }
    const visao = (lat, lon) => {   // cosseno do ângulo entre (lat, lon) e o centro da vista
      const f = lat * RAD, f0 = lat0 * RAD;
      return Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos((lon - lon0) * RAD);
    };
    const celula = (lat, lon) => Math.min(179, Math.max(0, Math.floor(90 - lat))) * 360 + ((Math.floor(lon + 180) % 360) + 360) % 360;
    const acerta = p => alvoBrasil ? alvoBrasil[celula(p.lat, p.lon)] === 1
      : p.lon >= BRASIL[0] && p.lon <= BRASIL[2] && p.lat >= BRASIL[1] && p.lat <= BRASIL[3];   // sem o brasil.png, a caixa
    const agora = () => fixa || new Date();

    function renderizar(t, destaque) {
      const d = imagem.data, f0 = lat0 * RAD, s0 = Math.sin(f0), c0 = Math.cos(f0);
      const f = sol.latSol * RAD, l = (sol.lonSol - lon0) * RAD;
      const sx = Math.cos(f) * Math.sin(l), sy = c0 * Math.sin(f) - s0 * Math.cos(f) * Math.cos(l), sz = s0 * Math.sin(f) + c0 * Math.cos(f) * Math.cos(l);
      const hn = Math.hypot(sx, sy, sz + 1) || 1, hx = sx / hn, hy = sy / hn, hz = (sz + 1) / hn;   // meio-termo sol-olho: o brilho no mar
      const desloc = Math.floor(nuvem), N = nuvens.d, realce = destaque ? (reduzido ? 0.28 : 0.2 + 0.1 * Math.sin(t / 260)) : 0;
      d.fill(0);
      for (const [o, u, v, z, b] of disco) {
        const lat = Math.asin(Math.max(-1, Math.min(1, z * s0 + v * c0))) / RAD, lon = lon0 + Math.atan2(u, z * c0 - v * s0) / RAD;
        const k = celula(lat, lon), i = k % 360;
        let r = cor[k * 3], g = cor[k * 3 + 1], bl = cor[k * 3 + 2];
        const luz = u * sx + v * sy + z * sz, dz = (b - 7.5) / 16;
        if (realce && brasil[k] && classe[k] >= 2) { r += (255 - r) * realce; g += (236 - g) * realce; bl += (170 - bl) * realce; }
        else if (classe[k] <= 1 && luz > 0) {   // o sol brilhando no mar
          const e = u * hx + v * hy + z * hz + dz * 0.004;
          if (e > 0.996) { const m = e > 0.9985 ? 0.7 : 0.4; r += (180 - r) * m; g += (215 - g) * m; bl += (240 - bl) * m; }
        }
        const n = N[k - i + ((i - desloc) % 360 + 360) % 360] + dz * 0.03;   // a nuvem que passa sobre a célula
        const nublado = n > nuvens.limiar;
        if (nublado) { if (n > nuvens.branca) { r = 244; g = 247; bl = 251; } else { r = 198; g = 208; bl = 222; } }
        if (z < 0.22) { r = r * 0.8 + 20; g = g * 0.82 + 30; bl = bl * 0.84 + 46; }   // a borda azulada da atmosfera
        const faixa = luz + dz * 0.05;   // 3 faixas de noite, com pontilhado de Bayer na passagem
        if (faixa < 0.06) {
          if (faixa >= 0) { r = r * 0.74 + 16; g = g * 0.6 + 4; bl = bl * 0.58; }             // crepúsculo
          else if (faixa >= -0.07) { r = r * 0.42; g = g * 0.44; bl = bl * 0.55 + 8; }       // anoitecendo
          else if (nublado) { r = r * 0.13 + 6; g = g * 0.14 + 8; bl = bl * 0.2 + 18; }      // nuvem à noite
          else { r = r * 0.2 + 3; g = g * 0.22 + 5; bl = bl * 0.32 + 16; }                  // noite
        }
        const q = o * 4; d[q] = r; d[q + 1] = g; d[q + 2] = bl; d[q + 3] = 255;
      }
      for (const [o, u, v, camada, b] of anel) {   // o anel: azul no lado do dia, laranja no terminador, quase nada à noite
        const luz = u * sx + v * sy + 0.3 * sz + (b - 7.5) / 160, q = o * 4;   // a beira do disco logo ao lado, um pouco para dentro
        const [r, g, bl, a] = Math.abs(luz) < 0.1 ? [255, 170, 110, camada ? 0.18 : 0.45] : luz > 0 ? [120, 180, 255, camada ? 0.22 : 0.6] : [70, 90, 160, camada ? 0.04 : 0.1];
        d[q] = r; d[q + 1] = g; d[q + 2] = bl; d[q + 3] = a * 255;
      }
      for (const [lat, lon, brilho, fase] of luzes) {   // as luzes das cidades: só no escuro, com um halo nas capitais
        const p = projetar(lat, lon, lon0, lat0, R);
        if (!p.visivel || visao(lat, lon) < 0.08) continue;
        const x = Math.floor(p.x), y = Math.floor(p.y), o = y * B + x;
        if (x < 0 || y < 0 || x >= B || y >= B || !d[o * 4 + 3]) continue;
        const u = (x + 0.5 - C) / R, v = (C - y - 0.5) / R, z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        const escuro = Math.max(0, Math.min(1, (0.02 - (u * sx + v * sy + z * sz)) / 0.12));
        if (!escuro) continue;
        const a = escuro * brilho * (reduzido ? 1 : 0.82 + 0.18 * Math.sin(t / 330 + fase));
        const somar = (q, m, cr, cg, cb) => { if (!d[q + 3]) return; d[q] += (cr - d[q]) * m; d[q + 1] += (cg - d[q + 1]) * m; d[q + 2] += (cb - d[q + 2]) * m; };
        if (brilho === 1) for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ax, yy = y + ay;
          if (xx >= 0 && yy >= 0 && xx < B && yy < B) somar((yy * B + xx) * 4, a * 0.35, 230, 140, 60);
        }
        somar(o * 4, a, 255, 217, 119);
      }
      if (tctx && tctx.putImageData) tctx.putImageData(imagem, 0, 0);
      return [sx, sy, sz];
    }

    // a lua: 11x11, com a fase de verdade (a crescente acesa à esquerda, como se vê do Brasil) e três crateras
    function desenharLua(data) {
      const idade = ((((data.getTime() / 86400000 + 2440587.5 - 2451550.1) / 29.530588853) % 1) + 1) % 1, passo = Math.round(idade * 32);
      if (luaTela && luaChave === passo) return luaTela;
      luaChave = passo;
      luaTela = luaTela || document.createElement("canvas"); luaTela.width = luaTela.height = 11;
      const g = luaTela.getContext("2d"), a = passo / 32 * 2 * Math.PI, lx = -Math.sin(a), lz = -Math.cos(a);
      if (!g) return luaTela;
      g.clearRect(0, 0, 11, 11);
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
        const nx = (x - 5) / 5.3, ny = (y - 5) / 5.3, r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const acesa = nx * lx + Math.sqrt(1 - r2) * lz > 0, cratera = [[3, 3], [6, 6], [7, 3]].some(([cx, cy]) => cx === x && cy === y);
        // o lado escuro com a luz da Terra e a beira mais clara, para a lua nova não virar uma mancha
        g.fillStyle = acesa ? (cratera ? "#b9b3a2" : r2 > 0.7 ? "#d6d1c2" : "#ece8dc") : r2 > 0.62 ? "#767d98" : cratera ? "#454b62" : "#535a74";
        g.fillRect(x, y, 1, 1);
      }
      return luaTela;
    }

    const nivel = {
      nome: "globo", camera, destaque: null,
      entrar(p) {   // voltando do Brasil, o globo chega com o Brasil de frente e se afasta
        camera.x = camera.y = C; camera.z = camera.alvoZ = 1; camera.voo = camera.ancora = null; camera.vx = camera.vy = 0;
        voo = null; segurando = false;
        if (p && p.nivel === "brasil") {
          lon0 = LON0; lat0 = LAT0;
          if (!reduzido) { camera.z = 3; camera.zoomPara(1); vel = 0; }
        }
        camera.limitar();
      },
      sair() { nivel.destaque = null; voo = null; segurando = false; },
      quadro(ctx, dt, t) {
        let acao = null;
        if (voo) {   // girando até o Brasil, pelo caminho curto
          const dl = norm(voo.lon - lon0), df = voo.lat - lat0, dist = Math.hypot(dl, df), passo = Math.min(240, Math.max(30, dist * 3)) * dt;
          if (dist <= passo || dist < 0.5) { lon0 = voo.lon; lat0 = voo.lat; vel = 0; if (voo.descer) acao = { ir: "brasil" }; voo = null; }
          else { lon0 = norm(lon0 + dl / dist * passo); lat0 += df / dist * passo; }
        } else if (!segurando) {
          if (!reduzido && nivel.destaque === "brasil" && visao(LAT0, LON0) < Math.cos(35 * RAD)) voo = { lon: LON0, lat: LAT0, descer: false };
          const base = reduzido || nivel.destaque ? 0 : -GIRO;
          vel = reduzido ? 0 : vel + (base - vel) * (1 - Math.exp(-dt * 1.5));
          if (vel) lon0 = norm(lon0 + vel * dt);
        }
        if (!reduzido) { nuvem = (nuvem + NUVEM * dt) % 360; lua += dt * 2 * Math.PI / 48; }   // as nuvens andam para leste
        const data = agora();
        if (!sol || Math.abs(data - solEm) > 1000) { sol = terminador(data); solEm = +data; }

        const cam = camera, P = cam.P, [ox, oy] = cam.origem();
        const U = Math.max(Math.round(P * 0.75), Math.min(Math.round(2 * cam.dpr), Math.max(Math.round(cam.base), Math.round(cam.dpr))));   // a seta
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(ceu(cam), 0, 0);
        if (!reduzido) for (const [ex, ey, nv, fase] of estrelas) {   // as estrelas grandes piscam por cima do céu guardado
          if (nv !== 2) continue;
          const S = Math.max(1, Math.round(cam.dpr)), x = Math.floor(ex * cam.W / S) * S, y = Math.floor(ey * cam.H / S) * S;
          ctx.fillStyle = `rgba(220,230,255,${0.45 + 0.4 * Math.sin(t / 900 + fase * 7)})`;
          ctx.fillRect(x - S, y, S * 3, S); ctx.fillRect(x, y - S, S, S * 3);
        }
        ctx.setTransform(P, 0, 0, P, ox, oy);
        const luaX = Math.round(C + 94 * Math.cos(lua)) - 5, luaY = Math.round(C - 6 + 22 * Math.sin(lua)) - 5, frente = Math.sin(lua) > 0;
        const sprite = desenharLua(data);
        if (!frente) ctx.drawImage(sprite, luaX, luaY);
        // a passada pixel a pixel sai a ~30 Hz (a 6°/s o globo anda uns 7 px por segundo), a cada quadro no arraste e no
        // giro até o Brasil, e só quando algo muda com movimento reduzido; estrelas, lua e seta seguem a cada quadro
        const chave = [lon0, lat0, solEm, Math.floor(nuvem)].join(), destaque = nivel.destaque === "brasil";
        const vez = !reduzido && t - feito.t >= 33, mudou = chave !== feito.chave && (segurando || voo || reduzido);
        if (vez || mudou || destaque !== feito.destaque) { renderizar(t, destaque); feito = { chave, t, destaque }; }
        ctx.drawImage(tela, 0, 0);
        if (frente) ctx.drawImage(sprite, luaX, luaY);

        const alvo = projetar(-11, -51, lon0, lat0, R);   // a seta sobre o Brasil, enquanto ele estiver de frente
        if (!voo && visao(-11, -51) > 0.35) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const pulo = reduzido ? 0 : Math.round((Math.sin(t / 240) + 1) * 1.5) * U, x0 = Math.round(ox + alvo.x * P) - 3 * U, y0 = Math.round(oy + alvo.y * P) - 5 * U - pulo;
          SETA.forEach((linha, y) => { for (let x = 0; x < linha.length; x++) if (linha[x] !== ".") { ctx.fillStyle = CORES_SETA[linha[x]]; ctx.fillRect(x0 + x * U, y0 + y * U, U, U); } });
        }
        return acao;
      },
      clique(x, y) { const p = ponto(x, y, lon0, lat0, R); return p && acerta(p) ? { ir: "brasil" } : null; },
      // zoom: sobre o Brasil (ou com ele de frente) desce já; fora dele, o globo gira até o Brasil e então desce
      zoom(sinal, sx, sy) {
        if (sinal <= 0) return null;
        const p = sx != null ? ponto(...camera.mundo(sx, sy), lon0, lat0, R) : null;
        if ((p && acerta(p)) || (!p && visao(LAT0, LON0) > Math.cos(25 * RAD))) return { ir: "brasil" };
        if (reduzido) { lon0 = LON0; lat0 = LAT0; return { ir: "brasil" }; }
        voo = { lon: LON0, lat: LAT0, descer: true };
        return null;
      },
      // arrastar gira o globo (dx, dy em pixels da tela); solto em movimento, segue girando e volta aos 6°/s
      arrastar(dx, dy) {
        const k = 1 / (R * camera.P * RAD), agoraMs = performance.now(), dtm = Math.max(8, agoraMs - ultimo) / 1000;
        lon0 = norm(lon0 - dx * k); lat0 = Math.max(-70, Math.min(70, lat0 + dy * k));
        velArraste = Math.max(-240, Math.min(240, 0.7 * (-dx * k / dtm) + 0.3 * velArraste));
        ultimo = agoraMs; segurando = true; voo = null;
      },
      soltar(lancado) { segurando = false; vel = reduzido || !lancado ? 0 : velArraste; velArraste = 0; },
      mergulho() { const p = projetar(LAT0, LON0, lon0, lat0, R); return p.visivel ? [p.x, p.y] : [C, C]; },
      sobre(x, y) { const p = ponto(x, y, lon0, lat0, R); return p && acerta(p) ? alvoDoBrasil(x, y) : null; },
      alvos() { return [alvoDoBrasil(C, C)]; },
      get rotacao() { return { lon: lon0, lat: lat0 }; },
    };
    function alvoDoBrasil(x, y) {
      return { id: "brasil", x, y, alto: 12, titulo: "Brasil", texto: "Descer ao mapa do Brasil",
               rotulo: "Brasil: descer ao mapa do Brasil, com o tempo de agora em cada capital", acao: { ir: "brasil" } };
    }
    return nivel;
  }
  return { criar, projetar, ponto, terminador, B, R };
})();
window.Globo = Globo;
