// Mapa do Brasil, o nível 2 do mundo: o brasil.png ilustrado (biomas, rios, serras, mar) com as 28 cidades, cada uma
// com a miniatura do seu marco (do atlas; sem o quadro, um ícone genérico) e o tempo de agora num ícone logo acima dela
// (nuvem com chuva, garoa, neve ou raio; neblina e chão molhado ou nevado no chão), a noite pelo horário com brilho quente
// nas cidades, barcos perto da costa, brilhos de onda, a rosa dos ventos e o nome do oceano, e até 6 aviões do atlas com
// sombra no chão, em curva leve pelas rotas. Nomes em Silkscreen: o da casa sempre, o da cidade em foco e, a partir de
// 2x de zoom, os de todas, sem um cobrir o outro. O mapa, a rosa e as nuvens de passagem seguem a escala da câmera;
// ícones, nomes, barcos, aviões e partículas têm tamanho fixo na tela, sempre em escala inteira e sem suavização.
// ?clima= vale para todas as cidades; ?hora= vem do Ceu. Na festa com fogos (festas.js), estouros discretos sobre as
// capitais onde é noite. Com movimento reduzido, nada anda: nem aviões, barcos, ondas ou partículas (nem raio, nem fogos).
// O nível Cidade fica em mundo_cidade.js; daqui ele usa porId (com o tempo de cada cidade), casa e texto.
"use strict";
const MundoMapa = (() => {
  const TIPOS = ["limpo", "nublado", "neblina", "garoa", "chuva", "tempestade", "neve"];
  const NOMES = { limpo: "céu limpo", nublado: "nublado", neblina: "neblina", garoa: "garoa", chuva: "chuva", tempestade: "tempestade",
    neve: "neve" };
  const CHUVA = { garoa: 5, chuva: 12, tempestade: 22, neve: 8 };   // partículas por segundo em cada cidade
  const NUVEM = { nublado: ["branca", 4.5], garoa: ["cinza", 4.5], chuva: ["cinza", 5], tempestade: ["escura", 5.5], neve: ["branca", 5] };
  const MAX_AVIOES = 6, MAX_PARTICULAS = 360, MAX_FOGOS = 12, VELOCIDADE = 12, MAR = "#1a3452", VAO = 4;   // VAO: nuvem→ícone
  const PEQUENAS = new Set(["mateus-leme"]);   // as cidades que não são capital: um marcador menor, sem miniatura
  const GRANDES = new Set(["sao-paulo", "rio-de-janeiro", "brasilia", "belo-horizonte", "salvador", "fortaleza", "recife",
    "manaus", "curitiba", "porto-alegre", "belem", "goiania"]);
  // as rotas dos barcos, no mar a uns 8 px da costa (pixels do brasil.png): Nordeste, Espírito Santo, Rio–Santos e Norte
  const BARCOS = [[375, 169, 357, 201], [357, 229, 345, 263], [305, 296, 271, 308], [309, 77, 345, 83]];
  const ROSA = [370, 44], OCEANO = [346, 318];   // o centro da rosa dos ventos e do nome do oceano (pixels do mapa)
  const busca = new URLSearchParams(location.search);
  const simulado = TIPOS.includes(busca.get("clima")) ? busca.get("clima") : null;
  const horaSimulada = busca.has("hora");
  const { PEQUENA, GRANDE, CHALE, BARCO, DIA, NOITE, DISCO, semente, tela, nitido, sprite, girado, formaNuvem, telaNuvem,
    brilho, fazerRosa, ladrilhoMar } = MapaArte;

  // U: pixels da tela por pixel de sprite. 2 px de CSS, mas não mais que a escala base do nível (no celular o ícone não
  // cobre as cidades vizinhas) e nunca menos que 1 px de CSS (para continuar legível)
  function unidade(cam) { return Math.max(1, Math.min(Math.round(2 * cam.dpr), Math.max(Math.round(cam.base), Math.round(cam.dpr)))); }
  // K: a escala das miniaturas do atlas (já reduzidas a 1 px de CSS por pixel no desktop): metade de U, ao menos 1
  const escala = U => Math.max(1, Math.round(U / 2));
  // D: o degrau do zoom: miniaturas, ícones e o tempo dobram a partir de 2x (escala inteira, pixel nítido)
  const degrau = cam => Math.min(2, Math.max(1, Math.floor(cam.P / cam.base + 1e-6)));

  function criar({ dados, Camera, reduzido, festa = () => null }) {
    const nivel = dados.niveis && dados.niveis.brasil, W = (nivel && nivel.w) || 400, H = (nivel && nivel.h) || 400;
    const rnd = semente(7);
    const cidades = (Array.isArray(dados.cidades) ? dados.cidades : [])
      .filter(c => c && typeof c.id === "string" && Number.isFinite(c.x) && Number.isFinite(c.y))
      .map((c, i) => ({ id: c.id, nome: String(c.nome || c.id), uf: String(c.uf || ""), x: c.x + 0.5, y: c.y + 0.5,
        marco: typeof c.marco === "string" ? c.marco : "", grande: GRANDES.has(c.id), n: i, fase: rnd() * 6, emissao: 0,
        raio: 2 + rnd() * 6, flash: 0, bolt: 0, formas: {}, tempo: { tipo: "limpo", vento: 0, noite: false } }));
    const porId = new Map(cidades.map(c => [c.id, c]));
    const rotas = (Array.isArray(dados.rotas) ? dados.rotas : []).filter(r => Array.isArray(r) && porId.has(r[0]) && porId.has(r[1]))
      .map(([a, b], i) => {   // a curva leve: o ponto de controle sai do meio, de lado, 14% do comprimento
        const A = porId.get(a), B = porId.get(b), dx = B.x - A.x, dy = B.y - A.y, s = i % 2 ? 0.14 : -0.14;
        return { a: A, b: B, d: Math.hypot(dx, dy) || 1, cx: (A.x + B.x) / 2 - dy * s, cy: (A.y + B.y) / 2 + dx * s };
      });
    const longas = rotas.filter(r => r.d >= 20).length ? rotas.filter(r => r.d >= 20) : rotas;
    const ambiente = [0, 1, 2, 3, 4].map(i => ({ x: rnd() * W, y: 30 + rnd() * (H - 60), forma: formaNuvem(100 + i, 7 + i * 1.6) }));
    const barcos = BARCOS.map(([x0, y0, x1, y1], i) => ({ x0, y0, x1, y1, u: rnd(), ida: i % 2 === 0, v: 1.2 + rnd() * 0.8, x: 0, y: 0 }));
    const avioes = [], gotas = [], ondas = [], fogos = [], icones = {}, nomes = [], rotulos = new Map(), enfeites = { rosa: false, oceano: false };
    let casa = null, vento = 0, mascara = null, espera = 0, luzes = [], vinheta = null, rosa = null, oceano = null, mar = null;
    let fonte = !document.fonts, arranjo = { chave: "", lista: [], porId: new Map() };
    if (document.fonts && document.fonts.load) document.fonts.load("8px Silkscreen").then(() => { fonte = true; }, () => { fonte = true; });

    // o atlas (as miniaturas dos marcos e os aviões): pedido ao criar e de novo ao voltar ao mapa, se falhou
    let atlas = null, quadros = {}, pedido = false;
    const minis = new Map(), avioesAtlas = new Map();
    function carregar() {
      if (pedido || atlas) return;
      pedido = true;
      fetch("/mundo/atlas.json", { credentials: "omit", cache: "no-cache" })
        .then(r => r.ok ? r.json() : null).catch(() => null)
        .then(d => {
          if (!d || !d.quadros || typeof d.quadros !== "object") { pedido = false; return; }
          const img = new Image();
          img.addEventListener("load", () => { quadros = d.quadros; atlas = img; minis.clear(); avioesAtlas.clear(); });
          img.addEventListener("error", () => { pedido = false; });
          img.src = "/mundo/atlas.png?v=" + (Number.isInteger(d.versao) ? d.versao : 0);
        });
    }
    carregar();
    const recorte = nome => {
      const r = Object.prototype.hasOwnProperty.call(quadros, nome) ? quadros[nome] : null;
      return atlas && Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) ? r : null;
    };
    // a miniatura escurecida da noite, guardada (de dia ela sai direto do atlas)
    function miniNoite(nome, r) {
      let c = minis.get(nome);
      if (c) return c;
      c = tela(r[2], r[3]);
      const g = c.getContext("2d");
      g.drawImage(atlas, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(14,18,46,.5)"; g.fillRect(0, 0, r[2], r[3]);
      minis.set(nome, c);
      return c;
    }
    // o avião do atlas girado em 16 direções (o desenho aponta para o leste), em versões dia, noite e sombra
    function aviaoAtlas(nome, i, modo) {
      const chave = nome + i + modo;
      let c = avioesAtlas.get(chave);
      if (c) return c;
      const r = recorte(nome);
      if (!r) return null;
      const L = Math.ceil(Math.hypot(r[2], r[3])) + 2;
      c = tela(L, L);
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.translate(L / 2, L / 2); g.rotate(i * Math.PI / 8);
      g.drawImage(atlas, r[0], r[1], r[2], r[3], -Math.floor(r[2] / 2), -Math.floor(r[3] / 2), r[2], r[3]);
      g.setTransform(1, 0, 0, 1, 0, 0);
      nitido(c);
      if (modo !== "d") {
        g.globalCompositeOperation = modo === "s" ? "source-in" : "source-atop";
        g.fillStyle = modo === "s" ? "rgba(4,10,18,1)" : "rgba(14,18,46,.45)"; g.fillRect(0, 0, L, L);
      }
      avioesAtlas.set(chave, c);
      return c;
    }

    const imagem = new Image();
    imagem.addEventListener("load", () => {   // terra e água do mapa (água tem B > G): as luzes da noite e o brilho do mar
      try {
        const c = tela(W, H), g = c.getContext("2d");
        g.drawImage(imagem, 0, 0);
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
        const a = r() * Math.PI * 2, d = 4 + r() * (c.grande ? 12 : 8), x = Math.floor(c.x + Math.cos(a) * d), y = Math.floor(c.y + Math.sin(a) * d);
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

    function decolar(s) {
      return { r: longas[Math.floor(Math.random() * longas.length)], ida: Math.random() < 0.5, s, rastro: [], marca: 0,
               modelo: Math.random() < 0.7 ? "mini-aviao-1" : "mini-aviao-2" };
    }
    function ponto(a) {   // posição na curva e direção do voo
      const u = a.ida ? a.s : 1 - a.s, { a: A, b: B, cx, cy } = a.r, v = 1 - u;
      const x = v * v * A.x + 2 * v * u * cx + u * u * B.x, y = v * v * A.y + 2 * v * u * cy + u * u * B.y;
      const dx = 2 * v * (cx - A.x) + 2 * u * (B.x - cx), dy = 2 * v * (cy - A.y) + 2 * u * (B.y - cy), k = a.ida ? 1 : -1;
      const alt = Math.min(1, Math.min(a.s, 1 - a.s) / 0.2);
      return [x, y, Math.atan2(dy * k, dx * k), alt * alt * (3 - 2 * alt)];
    }
    function barco(b) {   // posição do barco na rota (vai e volta)
      return [b.x0 + (b.x1 - b.x0) * b.u, b.y0 + (b.y1 - b.y0) * b.u];
    }
    for (const b of barcos) [b.x, b.y] = barco(b);
    if (!reduzido && longas.length) for (let i = 0; i < 3; i++) avioes.push(decolar(0.15 + Math.random() * 0.6));

    function simular(dt, t) {
      if (reduzido) return;
      for (const n of ambiente) { n.x -= dt * (1.5 + vento * 8); if (n.x < -40) { n.x = W + 40; n.y = 30 + Math.random() * (H - 60); } }
      for (const b of barcos) {
        const L = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) || 1;
        b.u += (b.ida ? 1 : -1) * dt * b.v / L;
        if (b.u >= 1 || b.u <= 0) { b.u = Math.min(1, Math.max(0, b.u)); b.ida = !b.ida; }
        [b.x, b.y] = barco(b);
      }
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
      for (const c of cidades) {   // as partículas caem da nuvem do ícone até o topo da miniatura (em unidades de K)
        const k = c.tempo.tipo, taxa = CHUVA[k] || 0;
        c.flash = Math.max(0, c.flash - dt * 3);
        if (k === "tempestade" && (c.raio -= dt) <= 0) { c.flash = 1; c.raio = 2.5 + Math.random() * 6; c.bolt = Math.floor(Math.random() * 1e6); }
        c.emissao = Math.min(4, c.emissao + dt * taxa);
        while (c.emissao >= 1) {
          c.emissao -= 1;
          if (gotas.length < MAX_PARTICULAS) gotas.push({ c, x: -5 + Math.random() * 10, y: -1, neve: k === "neve",
            v: k === "neve" ? 3 + Math.random() * 2 : 14 + Math.random() * 6, f: Math.random() * 6, resp: 0 });
        }
      }
      for (const g of gotas) {
        if (g.resp) { g.resp -= dt; continue; }
        g.y += g.v * dt;
        g.x += g.neve ? (Math.sin(t / 500 + g.f) * 1.2 - g.c.tempo.vento * 2) * dt : -(0.5 + g.c.tempo.vento * 3) * dt;
        if (g.y >= VAO - 1) g.resp = g.neve ? -1 : 0.14;
      }
      for (let i = gotas.length - 1; i >= 0; i--) if (gotas[i].resp < 0) gotas.splice(i, 1);
      const f = festa();   // festa com fogos: estouros discretos sobre as capitais onde é noite
      if (f && f.enfeites.includes("fogos")) for (const c of cidades) {
        if (noiteEm(c) && fogos.length < MAX_FOGOS && Math.random() < dt * 0.12) {
          const cor = f.cores[Math.floor(Math.random() * f.cores.length)];
          fogos.push({ x: c.x - 5 + Math.random() * 10, y: c.y - 16 - Math.random() * 6, k: 0, cor });
        }
      }
      for (const q of fogos) q.k += dt;
      for (let i = fogos.length - 1; i >= 0; i--) if (fogos[i].k > 1.2) fogos.splice(i, 1);
      if (mascara) {
        while (ondas.length < 34) {
          const x = Math.floor(Math.random() * (W + 160)) - 80, y = Math.floor(Math.random() * (H + 160)) - 80;   // o mar segue além da imagem
          if (!terra(x, y)) ondas.push({ x: x + 0.5, y: y + 0.5, v: 0.6 + Math.random() * 1.4, total: 0 }); else if (Math.random() < 0.5) break;
        }
        for (const b of ondas) { b.total = b.total || b.v; b.v -= dt; }
        for (let i = ondas.length - 1; i >= 0; i--) if (ondas[i].v <= 0) ondas.splice(i, 1);
      }
    }

    // o ícone da cidade: a casa (chalé), o marcador da cidade pequena, a miniatura do marco ou o genérico, no degrau D do
    // zoom; tamanho e escala (S) em pixels da tela
    function icone(c, U, D) {
      if (c.id === casa) return { tipo: "casa", lin: CHALE, S: U * D, h: CHALE.length * U * D, w: CHALE[0].length * U * D };
      if (PEQUENAS.has(c.id)) return { tipo: "pequena", lin: PEQUENA, S: U * D, h: PEQUENA.length * U * D, w: PEQUENA[0].length * U * D };
      const r = c.marco && recorte("mini-" + c.marco), K = escala(U) * D;
      if (r) return { tipo: "mini-" + c.marco, r, h: r[3] * K, w: r[2] * K };
      const lin = c.grande ? GRANDE : PEQUENA;
      return { tipo: "generico", lin, S: U * D, h: lin.length * U * D, w: lin[0].length * U * D };
    }
    function formaDoTempo(c) {   // a nuvem do ícone do tempo (ou null), guardada por cidade e tipo
      const n = NUVEM[c.tempo.tipo];
      return n ? c.formas[c.tempo.tipo] || (c.formas[c.tempo.tipo] = formaNuvem(c.n * 11 + TIPOS.indexOf(c.tempo.tipo), n[1])) : null;
    }
    // o arranjo dos ícones na tela: cada cidade ocupa a caixa do ícone mais a da nuvem do tempo acima dele; onde as caixas
    // se cobrem (o litoral do Nordeste a 1x), elas se afastam do ponto real, sem sair da tela, e uma linha fina liga o ícone
    // à cidade. Com o zoom as cidades se afastam e os ícones voltam ao ponto. Refeito só quando a vista ou o tempo mudam.
    function arranjar(cam) {
      const U = unidade(cam), D = degrau(cam), KN = 2 * escala(U) * D, [ox, oy] = cam.origem(), M = 2;
      const chave = [ox, oy, cam.P, cam.W, cam.H, casa, !!atlas, cidades.map(c => c.tempo.tipo).join()].join();
      if (chave === arranjo.chave) return arranjo;
      const lista = cidades.map(c => {
        const ic = icone(c, U, D), f = formaDoTempo(c), ax = Math.round(ox + c.x * cam.P), ay = Math.round(oy + c.y * cam.P);
        let x0 = -(ic.w >> 1), x1 = x0 + ic.w, y0 = -ic.h;
        if (f) {   // a nuvem e o vão, com folga para o balanço
          x0 = Math.min(x0, (f.ox - 1) * KN); x1 = Math.max(x1, (f.ox + f.linhas[0].length + 1) * KN);
          y0 = -ic.h - VAO * KN - (f.linhas.length - 1) * KN;
        }
        return { c, ic, ax, ay, px: ax, py: ay, x0, x1, y0, vis: ax > -60 && ay > -60 && ax < cam.W + 60 && ay < cam.H + 60 };
      });
      const vis = lista.filter(a => a.vis), caixa = a => [a.px + a.x0 - 1, a.py + a.y0 - 1, a.px + a.x1 + 1, a.py + 1];
      for (let volta = 0; volta < 80; volta++) {
        let mexeu = false;
        for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j], A = caixa(a), B = caixa(b);
          const sx = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), sy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
          if (sx <= 0 || sy <= 0) continue;
          mexeu = true;
          if (sx < sy) {   // separa pelo eixo de menor sobreposição, metade para cada lado
            const d = Math.ceil(sx / 2), s = a.px + (a.x0 + a.x1) / 2 <= b.px + (b.x0 + b.x1) / 2 ? 1 : -1;
            a.px -= s * d; b.px += s * d;
          }
          else { const d = Math.ceil(sy / 2), s = a.py <= b.py ? 1 : -1; a.py -= s * d; b.py += s * d; }
        }
        for (const a of vis) {   // dentro da tela, com a caixa inteira
          a.px = Math.min(cam.W - M - a.x1 - 1, Math.max(M - a.x0 + 1, a.px));
          a.py = Math.min(cam.H - M - 1, Math.max(M - a.y0 + 1, a.py));
        }
        if (!mexeu) break;
      }
      arranjo = { chave, lista, porId: new Map(lista.map(a => [a.c.id, a])) };
      return arranjo;
    }
    function rotuloNome(c, T, eCasa) {   // o nome em Silkscreen com contorno escuro, guardado por cidade e escala
      const chave = c.id + "|" + T + (eCasa ? "c" : "");
      let cv = rotulos.get(chave);
      if (cv) return cv;
      const fonteCss = `${8 * T}px Silkscreen, monospace`, medir = tela(1, 1).getContext("2d");
      medir.font = fonteCss;
      const m = medir.measureText(c.nome), w = Math.ceil((m && m.width) || c.nome.length * 6 * T) + 2 * T;
      cv = tela(w, 10 * T);
      const g = cv.getContext("2d");
      g.font = fonteCss; g.textBaseline = "top"; g.fillStyle = "#120e16";
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillText(c.nome, T + dx * T, T + dy * T);
      g.fillStyle = eCasa ? "#ffe08a" : "#fff4dc"; g.fillText(c.nome, T, T);
      rotulos.set(chave, nitido(cv));
      return cv;
    }
    function textoOceano() {   // OCEANO / ATLÂNTICO em Silkscreen espaçado, em pixels do mapa
      const linhas = ["OCEANO", "ATLÂNTICO"], esp = 3, medir = tela(1, 1).getContext("2d");
      medir.font = "8px Silkscreen, monospace";
      const larg = s => [...s].reduce((t, ch) => t + (((medir.measureText(ch) || {}).width) || 6) + esp, -esp);
      const w = Math.ceil(Math.max(...linhas.map(larg))) + 2, c = tela(w, 22), g = c.getContext("2d");
      g.font = "8px Silkscreen, monospace"; g.textBaseline = "top";
      linhas.forEach((s, i) => {
        let x = Math.round((w - larg(s)) / 2);
        for (const ch of s) {
          g.fillStyle = "rgba(10,24,44,.8)"; g.fillText(ch, x + 1, i * 11 + 1);
          g.fillStyle = "#cfe2ee"; g.fillText(ch, x, i * 11);
          x += (((medir.measureText(ch) || {}).width) || 6) + esp;
        }
      });
      return nitido(c);
    }

    // um quadro: chão e mapa (mundo), sombras, barcos, noite e luzes, cidades, tempo, nomes, aviões e nuvens (tela)
    function desenhar(ctx, dt, t, cam, destaque) {
      simular(dt, t);
      const P = cam.P, [ox, oy] = cam.origem(), U = unidade(cam), K = escala(U), TW = cam.W, TH = cam.H;
      const ceu = Ceu.agora(), escuro = Math.max(0, Math.min(1, ceu.escuro)), noite = escuro > 0.45;
      const tx = x => Math.round(ox + x * P), ty = y => Math.round(oy + y * P);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = MAR; ctx.fillRect(0, 0, TW, TH);
      ctx.setTransform(P, 0, 0, P, ox, oy);
      mar = mar || ctx.createPattern(ladrilhoMar(), "repeat");   // o mar segue além da imagem, com as mesmas ondas
      if (mar) { ctx.fillStyle = mar; ctx.fillRect(Math.floor(-ox / P) - 1, Math.floor(-oy / P) - 1, Math.ceil(TW / P) + 2, Math.ceil(TH / P) + 2); }
      if (pronta()) ctx.drawImage(imagem, 0, 0);   // a borda dela some nesse mar
      rosa = rosa || fazerRosa();   // a rosa dos ventos e o nome do oceano, no mar, na escala do mapa (o nome espera a fonte)
      ctx.drawImage(rosa, ROSA[0] - 13, ROSA[1] - 21);
      enfeites.rosa = true; enfeites.oceano = fonte;
      if (fonte) {
        oceano = oceano || textoOceano();
        ctx.globalAlpha = 0.85; ctx.drawImage(oceano, Math.round(OCEANO[0] - oceano.width / 2), OCEANO[1] - 11); ctx.globalAlpha = 1;
      }
      for (const c of cidades) {   // o chão de cada cidade: neve assentada, chão molhado, neblina
        const k = c.tempo.tipo;
        if (k === "neve") ctx.drawImage(sprite("neve", DISCO, "rgba(240,246,255,.85)", 1), Math.floor(c.x) - 6, Math.floor(c.y) - 5);
        else if (CHUVA[k]) ctx.drawImage(sprite("molhado", DISCO, "rgba(10,24,48,.2)", 1), Math.floor(c.x) - 6, Math.floor(c.y) - 5);
        else if (k === "neblina") {
          ctx.fillStyle = "rgba(226,232,240,.38)";
          for (let i = 0; i < 3; i++) {
            const d = reduzido ? 0 : Math.round(Math.sin(t / 1800 + i * 2 + c.fase) * 2);
            ctx.fillRect(Math.floor(c.x) - 8 + d + i * 2, Math.floor(c.y) - 5 + i * 3, 13 - i * 2, 2);
          }
        }
      }
      for (const n of ambiente) {   // a sombra das nuvens de passagem no chão
        const f = n.forma;
        ctx.drawImage(sprite(f.id + "s", f.linhas, "rgba(6,14,24,.22)", 1), Math.round(n.x) + f.ox + 6, Math.round(n.y) + f.oy + 10);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const a of avioes) {   // sombra no chão, mais longe quanto mais alto
        const [x, y, ang, alt] = ponto(a), i = ((Math.round(ang / (Math.PI / 8)) % 16) + 16) % 16, s = aviaoAtlas(a.modelo, i, "s");
        const dx = Math.round(alt * 3) * U, dy = Math.round(alt * 4) * U;
        if (s) {
          ctx.globalAlpha = 0.3;
          ctx.drawImage(s, tx(x) - (s.width * K >> 1) + dx, ty(y) - (s.height * K >> 1) + dy, s.width * K, s.height * K);
          ctx.globalAlpha = 1;
        }
        else ctx.drawImage(sprite("av" + i + "s", girado(i), "rgba(4,10,18,.3)", U), tx(x) - 7 * U + dx, ty(y) - 7 * U + dy);
      }
      for (const b of barcos) {   // os barcos e a esteira de espuma atrás deles
        const vai = b.ida === (b.x1 > b.x0), sx = tx(b.x), sy = ty(b.y), atras = vai ? -1 : 1;
        ctx.fillStyle = "rgba(220,236,248,.55)";
        for (let i = 1; i <= 3; i++) ctx.fillRect(sx + atras * (3 + i * 2) * K, sy + (i % 2) * K, (4 - i) * K, K);
        ctx.drawImage(sprite("barco" + (vai ? "d" : "e"), vai ? BARCO.map(l => [...l].reverse().join("")) : BARCO, DIA, K), sx - 3 * K, sy - 4 * K);
      }
      ctx.globalAlpha = 0.1; ctx.fillStyle = ceu.cima; ctx.fillRect(0, 0, TW, TH); ctx.globalAlpha = 1;   // o tom do céu
      if (escuro > 0) { ctx.fillStyle = `rgba(6,10,34,${escuro * 0.62})`; ctx.fillRect(0, 0, TW, TH); }
      if (escuro > 0.05) {   // luzes: o brilho quente em volta das capitais (sprite guardado) e as cidadezinhas
        ctx.globalCompositeOperation = "lighter";
        for (const c of cidades) {
          const r = (c.grande ? 17 : 11) * U, pulso = reduzido ? 1 : 1 + 0.08 * Math.sin(t / 700 + c.fase);
          ctx.globalAlpha = Math.min(1, escuro * pulso);
          ctx.drawImage(brilho(r), tx(c.x) - r, ty(c.y) - 2 * U - r);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        for (const [x, y, b, i] of luzes) {
          if (!reduzido && (Math.floor(t / 900) + i) % 13 === 0) continue;   // uma ou outra pisca
          ctx.fillStyle = `rgba(255,214,130,${escuro * b})`; ctx.fillRect(tx(x), ty(y), U, U);
        }
      }
      for (const b of ondas) {   // o brilho das ondas (de noite, a lua, mais fraco)
        ctx.fillStyle = `rgba(190,225,255,${(noite ? 0.25 : 0.55) * Math.sin(Math.PI * b.v / b.total)})`; ctx.fillRect(tx(b.x), ty(b.y), U, U);
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
      // as cidades numa só passada, de cima para baixo (a de baixo cobre a de cima): a linha até o ponto real, a sombra, o
      // ícone (escurecido à noite), a bandeira da casa, o destaque, e o ícone do tempo dela, com a chuva e o raio
      const arr = arranjar(cam), D = degrau(cam), KN = 2 * K * D, chuva = new Map();
      for (const g of gotas) (chuva.get(g.c) || chuva.set(g.c, []).get(g.c)).push(g);
      const ordem = arr.lista.filter(a => a.vis).sort((a, b) => (a.c.id === casa) - (b.c.id === casa) || a.py - b.py);
      for (const c of cidades) icones[c.id] = arr.porId.get(c.id).ic.tipo;
      for (const a of ordem) if (Math.abs(a.px - a.ax) + Math.abs(a.py - a.ay) > 3) linhaGuia(ctx, a, K);
      for (const a of ordem) {
        const { c, ic } = a, x0 = a.px - (ic.w >> 1), y0 = a.py - ic.h, cx = a.px;
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x0 + (ic.w >> 3), a.py - K, ic.w - (ic.w >> 2), 2 * K);
        if (ic.r) {
          if (noite) ctx.drawImage(miniNoite(ic.tipo, ic.r), x0, y0, ic.w, ic.h);
          else ctx.drawImage(atlas, ic.r[0], ic.r[1], ic.r[2], ic.r[3], x0, y0, ic.w, ic.h);
        } else {
          const nome = ic.tipo === "casa" ? "chale" : ic.lin === GRANDE ? "grande" : "pequena";
          ctx.drawImage(sprite(nome + "s", ic.lin, "rgba(0,0,0,.35)", ic.S), x0 + ic.S, y0 + ic.S);
          ctx.drawImage(sprite(nome + (noite ? "n" : "d"), ic.lin, noite ? NOITE : DIA, ic.S), x0, y0);
        }
        if (c.id === casa) bandeira(ctx, x0 + ic.w - 2 * ic.S, y0 + 2 * ic.S, ic.S, t, cx, y0 + (ic.h >> 1));
        if (c.id === destaque) colchetes(ctx, x0 - 2 * U, y0 - 2 * U, ic.w + 4 * U, ic.h + 4 * U, U, t);
        const f = formaDoTempo(c);
        if (!f) continue;
        const balanco = reduzido ? 0 : Math.round(Math.sin(t / 2600 + c.fase) * 1.2), fundo = y0 - VAO * KN;
        const nx = cx + (f.ox + balanco) * KN, ny = fundo - (f.linhas.length - 1) * KN, nv = telaNuvem(f, NUVEM[c.tempo.tipo][0], escuro);
        ctx.drawImage(sprite(f.id + "s", f.linhas, "rgba(6,14,24,.25)", 1), nx + KN, ny + KN, nv.width * KN, nv.height * KN);
        ctx.drawImage(nv, nx, ny, nv.width * KN, nv.height * KN);
        for (const g of chuva.get(c) || []) {   // chuva em traço, neve em floco, respingo no telhado
          ctx.fillStyle = g.neve ? "rgba(255,255,255,.95)" : g.resp ? "rgba(200,220,255,.7)" : "rgba(170,200,255,.85)";
          const x = cx + Math.round(g.x) * KN, y = fundo + Math.round(g.y) * KN, k = K * D;
          if (g.neve) ctx.fillRect(x, y, KN, KN);
          else if (g.resp) { ctx.fillRect(x - k, y, k, k); ctx.fillRect(x + KN, y, k, k); }
          else ctx.fillRect(x, y, k, KN + k);
        }
        if (c.flash > 0.4 && !reduzido) {   // raio: da nuvem ao ícone, em zigue-zague
          const r = semente(c.bolt), k = K * D;
          ctx.fillStyle = `rgba(255,255,230,${c.flash})`;
          for (let y = fundo, dx = 0; y < y0; y += k) { ctx.fillRect(cx + dx * k, y, KN, k); if (r() < 0.4) dx += r() < 0.5 ? -1 : 1; }
          ctx.fillStyle = `rgba(230,236,255,${c.flash * 0.18})`; ctx.fillRect(cx - 14 * KN, fundo - 12 * KN, 28 * KN, 24 * KN);
        }
      }
      escreverNomes(ctx, cam, arr, destaque);
      if (fogos.length) {   // fogos: oito faíscas que abrem e somem, em pixels da tela
        ctx.globalCompositeOperation = "lighter";
        for (const q of fogos) {
          const r = Math.round(1 + q.k * 4), a = Math.max(0, 1 - q.k / 1.2);
          ctx.fillStyle = q.cor; ctx.globalAlpha = a;
          for (let i = 0; i < 8; i++) {
            const ang = i * Math.PI / 4;
            ctx.fillRect(tx(q.x) + Math.round(Math.cos(ang) * r) * U, ty(q.y) + Math.round(Math.sin(ang) * r + q.k * q.k) * U, U, U);
          }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
      for (const a of avioes) {   // aviões: o rastro, o corpo (do atlas, girado) e, à noite, as luzes de navegação
        const [x, y, ang, alt] = ponto(a), i = ((Math.round(ang / (Math.PI / 8)) % 16) + 16) % 16, sx = tx(x), sy = ty(y) - Math.round(alt * 3) * U;
        for (const [rx, ry, v] of a.rastro) { ctx.fillStyle = `rgba(255,255,255,${0.35 * v})`; ctx.fillRect(tx(rx), ty(ry) - 3 * U, U, U); }
        const corpo = aviaoAtlas(a.modelo, i, noite ? "n" : "d");
        if (corpo) ctx.drawImage(corpo, sx - (corpo.width * K >> 1), sy - (corpo.height * K >> 1), corpo.width * K, corpo.height * K);
        else ctx.drawImage(sprite("av" + i + (noite ? "n" : "d"), girado(i), noite ? NOITE : DIA, U), sx - 7 * U, sy - 7 * U);
        if (noite) {
          const co = Math.cos(ang), si = Math.sin(ang);
          const em = (lx, ly, c) => {
            ctx.fillStyle = c; ctx.fillRect(sx + Math.round(co * lx - si * ly) * K, sy + Math.round(si * lx + co * ly) * K, K, K);
          };
          em(-1, -6, "#ff4a4a"); em(-1, 6, "#4aff7a");
          if (Math.floor(t / 500) % 2) em(-9, 0, "#ffffff");
        }
      }
      for (const n of ambiente) {   // as nuvens de passagem por cima de tudo
        ctx.setTransform(P, 0, 0, P, ox, oy);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(telaNuvem(n.forma, "branca", escuro), Math.round(n.x) + n.forma.ox, Math.round(n.y) + n.forma.oy);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!vinheta || vinheta.w !== TW || vinheta.h !== TH) {
        const g = ctx.createRadialGradient(TW / 2, TH / 2, Math.min(TW, TH) * 0.4, TW / 2, TH / 2, Math.max(TW, TH) * 0.75);
        g.addColorStop(0, "rgba(4,8,20,0)"); g.addColorStop(1, "rgba(4,8,20,.42)");
        vinheta = { w: TW, h: TH, g };
      }
      ctx.fillStyle = vinheta.g; ctx.fillRect(0, 0, TW, TH);
    }
    // os nomes: o da casa e o da cidade em foco sempre; a partir de 2x, os outros que couberem sem cobrir um já posto
    function escreverNomes(ctx, cam, arr, destaque) {
      nomes.length = 0;
      if (!fonte) return;
      const todos = cam.P / cam.base >= 2 - 1e-6, T = Math.max(1, Math.round(cam.dpr)), U = unidade(cam), K = escala(U);
      const lista = cidades.filter(c => todos || c.id === casa || c.id === destaque)
        .sort((a, b) => (b.id === casa) - (a.id === casa) || (b.id === destaque) - (a.id === destaque) || b.grande - a.grande || a.n - b.n);
      for (const c of lista) {
        const cv = rotuloNome(c, T, c.id === casa), w = cv.width, h = cv.height, a = arr.porId.get(c.id);
        const caixa = { id: c.id, x: a.px - (w >> 1), y: a.py + 2 * K, w, h };
        if (caixa.x > cam.W || caixa.x + w < 0 || caixa.y > cam.H || caixa.y + h < 0) continue;
        if (nomes.some(o => caixa.x < o.x + o.w && o.x < caixa.x + w && caixa.y < o.y + o.h && o.y < caixa.y + h)) continue;
        nomes.push(caixa);
        ctx.drawImage(cv, caixa.x, caixa.y);
      }
    }
    function bandeira(ctx, x, topoMastro, U, t, cx, cy) {   // a casa deste escritório: mastro, bandeira ao vento e um farol
      if (!reduzido) {
        const k = (t / 1800) % 1, lado = Math.round((8 + k * 12)) * U;
        ctx.fillStyle = `rgba(245,184,61,${(1 - k) * 0.7})`;
        ctx.fillRect(cx - lado, cy - lado, lado * 2, U); ctx.fillRect(cx - lado, cy + lado - U, lado * 2, U);
        ctx.fillRect(cx - lado, cy - lado, U, lado * 2); ctx.fillRect(cx + lado - U, cy - lado, U, lado * 2);
      }
      const base = topoMastro - 2 * U;
      ctx.fillStyle = "#2a201a"; ctx.fillRect(x, base - 8 * U, U, 9 * U);
      for (let i = 0; i < 5; i++) {
        const onda = reduzido ? 0 : Math.round(Math.sin(t / 200 - i * 0.9)) * U;
        ctx.fillStyle = i === 4 ? "#c98a26" : "#f5b83d"; ctx.fillRect(x + U + i * U, base - 8 * U + onda, U, 3 * U);
      }
    }
    function colchetes(ctx, x, y, w, h, U, t) {   // destaque: quatro cantos que respiram
      const p = reduzido ? 0 : Math.round((Math.sin(t / 180) + 1) / 2) * U, L = 3 * U;
      ctx.fillStyle = "#ffe08a";
      const cantos = [[x - p, y - p, 1, 1], [x + w + p - U, y - p, -1, 1], [x - p, y + h + p - U, 1, -1], [x + w + p - U, y + h + p - U, -1, -1]];
      for (const [cx, cy, sx, sy] of cantos) {
        ctx.fillRect(sx > 0 ? cx : cx - L + U, cy, L, U); ctx.fillRect(cx, sy > 0 ? cy : cy - L + U, U, L);
      }
    }

    // a cidade cujo ícone (onde ele está desenhado) fica mais perto do ponto, medida do meio dele, até metade da altura
    // (ou uns 12 px de tela)
    function perto(cam, x, y) {
      const [sx, sy] = cam.tela(x, y), arr = arranjar(cam);
      let melhor = null, d = Infinity;
      for (const a of arr.lista) {
        const e = Math.hypot(a.px - sx, a.py - a.ic.h / 2 - sy);
        if (e <= Math.max(a.ic.h / 2, 12 * cam.dpr) && e < d) { d = e; melhor = a.c; }
      }
      return melhor;
    }
    function alvo(c, cam) {   // a posição e a altura seguem o ícone arranjado (que se afasta do ponto a 1x)
      const extra = c.id === casa ? ". O escritório fica aqui" : "", aqui = () => arranjar(cam).porId.get(c.id);
      return { id: c.id, get x() { return cam.mundo(aqui().px, aqui().py)[0]; }, get y() { return cam.mundo(aqui().px, aqui().py)[1]; },
               get alto() { return (aqui().ic.h + 3 * unidade(cam)) / cam.dpr; }, titulo: `${c.nome} · ${c.uf}`,
               texto: texto(c) + (c.id === casa ? " · o escritório fica aqui" : ""),
               rotulo: `${c.nome} (${c.uf}): ${texto(c)}${extra}`, acao: { ir: "cidade", cidade: c.id } };
    }
    function linhaGuia(ctx, a, K) {   // do ícone afastado até o ponto real: pontilhado escuro com um ponto claro na cidade
      const n = Math.max(1, Math.round(Math.hypot(a.px - a.ax, a.py - a.ay) / (2 * K)));
      ctx.fillStyle = "rgba(18,14,22,.8)";
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(a.ax + (a.px - a.ax) * i / n), Math.round(a.ay + (a.py - a.ay) * i / n), K, K);
      ctx.fillStyle = "#fff4dc"; ctx.fillRect(a.ax - K, a.ay - K, 2 * K, 2 * K);
    }

    const camBrasil = Camera([0, 0, W, H]);
    const brasil = {
      nome: "brasil", camera: camBrasil, destaque: null,
      entrar(p) {   // voltando de uma cidade, a câmera sai de perto dela; o atlas que falhou é pedido de novo
        carregar();
        const c = p && p.de && porId.get(p.de);
        if (!c) return;
        camBrasil.x = c.x; camBrasil.y = c.y; camBrasil.z = reduzido ? 2 : 4; camBrasil.zoomPara(2); camBrasil.limitar();
      },
      sair() { brasil.destaque = null; },
      quadro(ctx, dt, t) { desenhar(ctx, dt, t, camBrasil, brasil.destaque); },
      clique(x, y) { const c = perto(camBrasil, x, y); return c ? { ir: "cidade", cidade: c.id } : null; },
      sobre(x, y) { const c = perto(camBrasil, x, y); return c ? alvo(c, camBrasil) : null; },
      alvos() { return cidades.map(c => alvo(c, camBrasil)); },
      get avioes() { return avioes; }, get particulas() { return gotas.length; }, get fogos() { return fogos.length; },
      get icones() { return { ...icones }; }, get nomes() { return nomes.map(n => ({ ...n })); },
      get barcos() { return barcos.map(b => [b.x, b.y]); }, get ondas() { return ondas.map(b => [b.x, b.y, b.v]); },
      get enfeites() { return { ...enfeites }; },
      get caixas() {   // as caixas dos ícones à vista (com o tempo), em pixels da tela, e o ponto real de cada cidade
        return arranjar(camBrasil).lista.filter(a => a.vis)
          .map(a => ({ id: a.c.id, x: a.px + a.x0, y: a.py + a.y0, w: a.x1 - a.x0, h: -a.y0, px: a.px, py: a.py, ax: a.ax, ay: a.ay,
            iw: a.ic.w, ih: a.ic.h }));
      },
    };
    return { niveis: { brasil }, clima, texto, porId, get casa() { return casa; } };
  }
  return { criar, TIPOS };
})();
window.MundoMapa = MundoMapa;
