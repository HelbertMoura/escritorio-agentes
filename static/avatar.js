// Avatares no estilo do agentes.chat: bichinho de feltro quadrado, com cor, olhos e acessório.
// Desenho em pixels de 1x (22x22), ampliado pelo canvas sem suavização. Cada pose (andando, sentado,
// digitando, café, jogando, comemorando, acenando...) em 4 direções vira um quadro guardado em cache;
// a pose e a direção vêm do vida.js (b.pose, b.olha).
"use strict";

const Avatar = (() => {
  const CORES = {
    amber:    { base: "#f2a93b", claro: "#ffd27a", escuro: "#b8731c", contorno: "#5e3a10" },
    teal:     { base: "#33b3a0", claro: "#6fe0cc", escuro: "#1f7c6f", contorno: "#0d3b35" },
    rose:     { base: "#e8587a", claro: "#ff94ad", escuro: "#a8344f", contorno: "#4f1222" },
    green:    { base: "#3fb35c", claro: "#7fe394", escuro: "#257a3b", contorno: "#0f3a1b" },
    indigo:   { base: "#5b62e8", claro: "#959bff", escuro: "#3a3fb0", contorno: "#191b55" },
    sky:      { base: "#3a92e6", claro: "#7cc0ff", escuro: "#2463a8", contorno: "#0e2c52" },
    violet:   { base: "#9566e6", claro: "#c4a0ff", escuro: "#6542ad", contorno: "#2c1a52" },
    graphite: { base: "#64646e", claro: "#9a9aa6", escuro: "#43434b", contorno: "#1c1c21" },
  };
  const TAM = 22;          // quadro do avatar
  const CORPO = { x: 4, y: 8, w: 14, h: 13 };
  const POSES = ["parado", "andando", "sentado", "digitando", "esperando", "cafe", "jogando", "fliperama", "raquete", "taco",
    "pebolim", "tocando", "comemorando", "acenando", "carinho", "dormindo", "dancando", "violao", "arremesso"];
  const DIRECOES = ["baixo", "cima", "esq", "dir"];
  const NUM_POSE = Object.fromEntries(POSES.map((p, i) => [p, i])), NUM_DIR = Object.fromEntries(DIRECOES.map((d, i) => [d, i]));
  const MADEIRA = "#c99a5b", ESCURO = "#2b2b34";
  const calmo = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function px(c, x, y, cor, w = 1, h = 1) { c.fillStyle = cor; c.fillRect(x, y, w, h); }

  function corpo(c, p, costas) {
    const { x, y, w, h } = CORPO;
    px(c, x + 2, y, p.contorno, w - 4, 1);             // topo
    px(c, x + 2, y + h - 1, p.contorno, w - 4, 1);     // base
    px(c, x, y + 2, p.contorno, 1, h - 4);             // lados
    px(c, x + w - 1, y + 2, p.contorno, 1, h - 4);
    px(c, x + 1, y + 1, p.contorno); px(c, x + w - 2, y + 1, p.contorno);
    px(c, x + 1, y + h - 2, p.contorno); px(c, x + w - 2, y + h - 2, p.contorno);
    px(c, x + 2, y + 1, p.base, w - 4, h - 2);         // recheio
    px(c, x + 1, y + 2, p.base, w - 2, h - 4);
    px(c, x + 2, y + h - 3, p.escuro, w - 4, 1);       // sombra embaixo
    px(c, x + w - 2, y + 3, p.escuro, 1, h - 6);
    px(c, x + 2, y + 2, p.claro, 3, 1);                // brilho do feltro
    px(c, x + 2, y + 3, p.claro, 1, 2);
    for (let i = 0; i < 5; i++) px(c, x + 4 + ((i * 5) % 8), y + 4 + ((i * 3) % 6), p.claro); // textura
    if (costas) { px(c, x + 3, y + 4, p.escuro, w - 6, 1); px(c, x + w / 2 - 1, y + 7, p.escuro, 2, 1); } // de costas: costura e etiqueta
  }

  // dx: olhar para o lado (de perfil os olhos vão para a borda)
  function olhos(c, tipo, piscando, dx) {
    const y = CORPO.y + 5, e1 = CORPO.x + 4 + dx, e2 = CORPO.x + 8 + dx, branco = "#ffffff", preto = "#1b1b22";
    if (tipo === "fechados" || (piscando && tipo !== "happy")) { px(c, e1, y + 2, preto, 2, 1); px(c, e2, y + 2, preto, 2, 1); return; }
    switch (tipo) {
      case "happy":   // ^ ^
        for (const e of [e1, e2]) { px(c, e, y + 2, branco); px(c, e + 1, y + 1, branco); px(c, e + 2, y + 2, branco); }
        break;
      case "sleepy":  // olhos meio fechados
        for (const e of [e1, e2]) { px(c, e, y + 1, branco, 3, 2); px(c, e, y + 1, preto, 3, 1); }
        break;
      case "wide":
        for (const e of [e1, e2]) { px(c, e, y, branco, 3, 3); px(c, e + 1 + Math.sign(dx), y + 1, preto, 2 - Math.abs(Math.sign(dx)), 2); }
        break;
      case "dots":
        for (const e of [e1, e2]) px(c, e + 1, y + 1, preto, 1, 2);
        break;
      default:        // round
        for (const e of [e1, e2]) { px(c, e, y, branco, 2, 3); px(c, e + (dx < 0 ? 0 : 1), y + 1, preto, 1, 2); }
    }
  }

  function acessorio(c, tipo, costas) {
    const topo = CORPO.y, cx = CORPO.x + CORPO.w / 2;
    switch (tipo) {
      case "crown": {
        const ouro = "#ffd34d", sombra = "#c9921a";
        px(c, cx - 4, topo - 2, ouro, 8, 2); px(c, cx - 4, topo - 1, sombra, 8, 1);
        px(c, cx - 4, topo - 4, ouro, 1, 2); px(c, cx - 1, topo - 5, ouro, 2, 3); px(c, cx + 3, topo - 4, ouro, 1, 2);
        if (!costas) px(c, cx - 1, topo - 2, "#e8476a");
        break;
      }
      case "hat":
        px(c, cx - 6, topo, "#1f1f26", 12, 1); px(c, cx - 4, topo - 5, "#2b2b34", 8, 5);
        px(c, cx - 4, topo - 2, "#c0392b", 8, 1); break;
      case "headphones":
        px(c, cx - 6, topo - 2, "#2b2b34", 12, 1); px(c, cx - 7, topo - 1, "#2b2b34", 1, 2); px(c, cx + 6, topo - 1, "#2b2b34", 1, 2);
        px(c, CORPO.x - 1, topo + 4, "#2b2b34", 2, 5); px(c, CORPO.x + CORPO.w - 1, topo + 4, "#2b2b34", 2, 5);
        px(c, CORPO.x - 1, topo + 5, "#ff6b8b", 1, 3); px(c, CORPO.x + CORPO.w, topo + 5, "#ff6b8b", 1, 3); break;
      case "headset":
        px(c, cx - 6, topo - 2, "#1f1f26", 12, 1); px(c, cx - 7, topo - 1, "#1f1f26", 1, 3); px(c, cx + 6, topo - 1, "#1f1f26", 1, 3);
        px(c, CORPO.x - 1, topo + 4, "#1f1f26", 2, 4); px(c, CORPO.x + CORPO.w - 1, topo + 4, "#1f1f26", 2, 4);
        if (!costas) { px(c, CORPO.x + 1, topo + 8, "#1f1f26", 4, 1); px(c, CORPO.x + 4, topo + 9, "#4ade80", 1, 1); }
        break;
      case "flower":
        px(c, CORPO.x + CORPO.w - 4, topo - 3, "#ffffff", 3, 3); px(c, CORPO.x + CORPO.w - 5, topo - 2, "#ffffff", 5, 1);
        px(c, CORPO.x + CORPO.w - 3, topo - 4, "#ffffff", 1, 5); px(c, CORPO.x + CORPO.w - 3, topo - 2, "#ff7a59"); break;
      case "antenna":
        px(c, cx, topo - 4, "#2b2b34", 1, 4); px(c, cx - 1, topo - 6, "#ff5a5a", 3, 2); break;
      case "cap":
        px(c, cx - 5, topo - 2, "#1e3a8a", 10, 3); if (!costas) px(c, cx + 3, topo, "#1e3a8a", 5, 1); px(c, cx - 1, topo - 3, "#1e3a8a", 2, 1); break;
      case "bow":
        px(c, CORPO.x + CORPO.w - 6, topo - 2, "#ff5fa2", 3, 3); px(c, CORPO.x + CORPO.w - 2, topo - 2, "#ff5fa2", 3, 3);
        px(c, CORPO.x + CORPO.w - 3, topo - 1, "#c2185b"); break;
    }
  }

  function pes(c, p, quadro) { // pezinhos ao andar: alternam a cada passo
    const y = CORPO.y + CORPO.h - 1, esq = CORPO.x + 3, dir = CORPO.x + CORPO.w - 6;
    px(c, esq, y + (quadro ? 0 : 1), p.contorno, 3, 1);
    px(c, dir, y + (quadro ? 1 : 0), p.contorno, 3, 1);
  }

  function mao(c, p, x, y) { px(c, x, y, p.contorno, 3, 3); px(c, x + 1, y + 1, p.base); }

  // mãos e o objeto de cada pose (f = quadro da animação, 0 ou 1)
  function maos(c, p, pose, costas, f) {
    const E = 1, D = 18, Y = 14;   // mão esquerda e direita encostadas no corpo
    switch (pose) {
      case "andando": mao(c, p, E, Y - 1 + f); mao(c, p, D, Y - f); break;
      case "digitando": case "tocando": case "pebolim":
        if (costas) { mao(c, p, E + 1, Y + f); mao(c, p, D - 1, Y + 1 - f); }
        else { mao(c, p, 5, 17 - f); mao(c, p, 14, 16 + f); }
        if (pose === "pebolim") { px(c, 0, 17, "#b8bcc6", 22, 1); px(c, 0, 18, "#7d828c", 22, 1); } // as barras do pebolim
        break;
      case "cafe":
        if (f) { mao(c, p, 13, 12); px(c, 14, 9, "#f4f4f6", 4, 4); px(c, 14, 9, "#6b4a2e", 4, 1); px(c, 18, 10, "#f4f4f6", 1, 2); } // gole
        else { mao(c, p, E, Y); mao(c, p, 16, 15); px(c, 18, 12, "#f4f4f6", 3, 4); px(c, 18, 12, "#6b4a2e", 3, 1); px(c, 21, 13, "#f4f4f6", 1, 2); px(c, 19, 10, "rgba(255,255,255,.6)"); }
        break;
      case "jogando":
        if (costas) { mao(c, p, E + 2, Y + 2 - f); mao(c, p, D - 2, Y + 1 + f); break; }
        px(c, 7, 16, ESCURO, 8, 3); px(c, 8, 17, f ? "#ff5a5a" : "#4ade80"); px(c, 13, 17, f ? "#60a5fa" : "#ffd34d");
        mao(c, p, 5, 16 - f); mao(c, p, 14, 16 + f - 1); break;
      case "fliperama":   // de frente para a máquina: mãos nos botões
        mao(c, p, E + 2, Y - 1 + f); mao(c, p, D - 2, Y - f); break;
      case "raquete":
        mao(c, p, E, Y);
        if (f) { mao(c, p, 17, 11); px(c, 18, 6, "#e04848", 4, 4); px(c, 19, 10, MADEIRA, 1, 2); }
        else { mao(c, p, 17, 15); px(c, 18, 10, "#e04848", 4, 4); px(c, 19, 14, MADEIRA, 1, 2); }
        break;
      case "taco": // taco de sinuca na diagonal, empurrando de leve
        for (let i = 0; i < 12; i++) px(c, 1 + i + f, 21 - Math.round(i * 0.6), i > 9 ? "#f4f4f6" : MADEIRA);
        mao(c, p, 3 + f, 17); mao(c, p, 9 + f, 14); break;
      case "comemorando": mao(c, p, E, 4 - f); mao(c, p, D, 4 - f); break;
      case "acenando": mao(c, p, E, Y); mao(c, p, D + (f ? 1 : -1), 5); break;
      case "carinho": mao(c, p, E, Y); mao(c, p, D + 1, 16 + f); break;   // fazendo carinho no gato, ao lado
      case "dancando": mao(c, p, E, f ? 16 : 4); mao(c, p, D, f ? 4 : 16); break;   // braços alternando no ritmo
      case "violao":
        if (costas) { mao(c, p, E, Y); mao(c, p, D, Y); break; }
        px(c, 3, 15, "#8a5a2b", 9, 6); px(c, 4, 16, "#c98b4b", 7, 4); px(c, 7, 17, "#2b1d12", 2, 2);   // corpo do violão, com a boca
        px(c, 12, 16, "#6b4423", 8, 2); px(c, 20, 15, "#6b4423", 2, 4);                                 // braço e cabeça
        mao(c, p, 5, 13 + f); mao(c, p, 15, 14); break;
      case "arremesso":   // f=0: a bolinha (ou o dardo) lá atrás, na mão erguida; f=1: o braço já foi para a frente
        mao(c, p, E, Y);
        if (f) mao(c, p, 16, 9); else { mao(c, p, D, 3); px(c, 19, 0, "#f4f4f6", 3, 3); }
        break;
      case "esperando": case "sentado": case "dormindo": mao(c, p, 5, 17); mao(c, p, 14, 17); break;
      default: mao(c, p, E, Y); mao(c, p, D, Y);
    }
  }

  function quadroNovo(aparencia, pose, olha, f, piscando) {
    const cv = document.createElement("canvas"); cv.width = TAM; cv.height = TAM;
    const c = cv.getContext("2d");
    const pal = CORES[aparencia.color] || CORES.graphite, costas = olha === "cima";
    if (pose === "andando") pes(c, pal, f);
    corpo(c, pal, costas);
    if (!costas) {
      const tipo = pose === "comemorando" ? "happy" : pose === "dormindo" || (pose === "cafe" && f) ? "fechados" : aparencia.eyes;
      olhos(c, tipo, piscando, olha === "esq" ? -2 : olha === "dir" ? 2 : 0);
    }
    acessorio(c, aparencia.accessory, costas);
    maos(c, pal, pose, costas, f);
    return cv;
  }

  // cache por aparência, com chave numérica (nada de texto novo a cada quadro)
  const porAparencia = new Map(), porObjeto = new WeakMap();
  function cacheDe(ap) {
    let mapa = porObjeto.get(ap);
    if (mapa) return mapa;
    const chave = `${ap.color}|${ap.eyes}|${ap.accessory}`;
    mapa = porAparencia.get(chave) || new Map();
    porAparencia.set(chave, mapa); porObjeto.set(ap, mapa);
    return mapa;
  }
  function quadro(ap, pose, olha, f, piscando) {
    const mapa = cacheDe(ap), k = ((NUM_POSE[pose] || 0) * 4 + (NUM_DIR[olha] || 0)) * 4 + f * 2 + (piscando ? 1 : 0);
    let cv = mapa.get(k);
    if (!cv) { cv = quadroNovo(ap, pose, olha, f, piscando); mapa.set(k, cv); }
    return cv;
  }

  // Devolve um canvas 22x22 com o avatar de frente. piscando = olhos fechados; passo = 0/1 ao andar, null parado.
  function desenharAvatar(aparencia, piscando = false, passo = null) {
    return quadro(aparencia, passo === null ? "parado" : "andando", "baixo", passo || 0, piscando);
  }

  // ritmo de cada pose (ms por quadro); 0 = parado
  const RITMO = { andando: 160, digitando: 130, tocando: 220, pebolim: 150, jogando: 190, fliperama: 170, raquete: 380, taco: 600,
    comemorando: 180, acenando: 260, carinho: 300, dancando: 240, violao: 300, arremesso: 350 };

  // Como o boneco b está no instante t (ms): pose, direção (com a olhadela para os lados), o quadro f do RITMO
  // (com o gole do café), o piscar e oy, quanto o corpo sobe em px (passo, pulinhos, dança, digitando, dormindo,
  // respiração; tudo zerado com reduzir movimento). O 2D (boneco) e a maquete 3D usam a mesma conta.
  // Não muda nada: devolve sempre o mesmo objeto, reaproveitado, para ler na hora (nada é alocado por quadro).
  const atual = { pose: "parado", olha: "baixo", f: 0, oy: 0, piscando: false };
  function estado(b, t) {
    const pose = b.pose || "parado", fixo = calmo.matches, ts = t + b.semente * 37;
    let olha = b.olha || "baixo";
    if (!fixo && olha === "baixo" && (pose === "parado" || pose === "cafe" || pose === "sentado")) { // olhadela para os lados de vez em quando
      const ciclo = (ts / 1000) % 11;
      if (ciclo < 0.9) olha = "esq"; else if (ciclo > 5.5 && ciclo < 6.3) olha = "dir";
    }
    const ritmo = RITMO[pose] || 0;
    let f = ritmo && !(fixo && pose !== "andando") ? Math.floor(ts / ritmo) % 2 : 0;
    if (pose === "cafe") f = (ts % 5200) < 900 ? 1 : 0;   // um gole a cada 5 s
    const piscando = pose !== "dormindo" && (Math.floor(ts / 1000) % 6 === 0) && (ts % 1000) < 130;
    let oy = 0;
    if (pose === "andando") oy = f;
    else if (pose === "comemorando" && !fixo) oy = Math.round(Math.abs(Math.sin(ts / 170)) * 4);   // pulinhos
    else if (pose === "dancando") oy = fixo ? 0 : f * 2;   // sobe e desce no ritmo
    else if (pose === "digitando" || pose === "jogando" || pose === "pebolim") oy = fixo ? 0 : f;
    else if (pose === "dormindo") oy = fixo ? 0 : Math.floor(ts / 1600) % 2;
    else if (!b.sentado && pose !== "esperando" && !fixo) oy = Math.floor(ts / 1400) % 2;   // respiração
    atual.pose = pose; atual.olha = olha; atual.f = f; atual.oy = oy; atual.piscando = piscando;
    return atual;
  }

  // Desenha o agente com sombra, pose e direção. Devolve o canto (x, y) do quadro 22x22 no mapa.
  function boneco(c, b, t, S) {
    const { pose, olha, f, oy, piscando } = estado(b, t);
    const x = Math.round(b.x - TAM / 2), y = Math.round(b.y - TAM + 1 - oy);
    if (!b.sentado) { // sombra no chão (encolhe no pulo)
      const w = oy > 2 ? 8 : 10;
      c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect((Math.round(b.x) - w / 2) * S, Math.round(b.y) * S, w * S, 2 * S);
    }
    c.drawImage(quadro(b.ap, pose, olha, f, piscando), x * S, y * S, TAM * S, TAM * S);
    return { x, y };
  }

  // Aparência estável para quem não está no arquivo de configuração (derivada do handle).
  function aparenciaPadrao(handle) {
    let h = 0; for (const ch of handle || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const cores = Object.keys(CORES), olhosTipos = ["happy", "sleepy", "round", "wide", "dots"];
    const acess = ["crown", "hat", "headphones", "headset", "flower", "antenna", "cap", "bow", ""];
    return { color: cores[h % cores.length], eyes: olhosTipos[(h >> 3) % olhosTipos.length], accessory: acess[(h >> 6) % acess.length] };
  }

  // ---- Maquete 3D: o mesmo bichinho em caixas (contrato D do gate da maquete) ----
  // Caixas do boneco para a maquete 3D, com o mesmo desenho do 2D (bichinho de feltro quadrado). Só dados: sem Three.js, sem DOM.
  // Unidade: 1 px do avatar = 1 px do mapa. Origem no chão, no meio dos pés; x para a direita, y para cima,
  // z para a frente ("frente" = olhando "baixo"). Quem gira o boneco pelo b.olha é a maquete: por isso não há variante
  // por direção (nem a costura de costas do 2D; no 3D as costas são as costas).
  // Cada caixa: [x, y, z, w, h, d, "#rrggbb"] (canto mínimo), com as cores da paleta CORES, os olhos e o acessório.
  // f = 0/1, o mesmo passo do 2D; piscando = true fecha os olhos (a linha do dormindo), como no 2D, menos no "happy".
  // Cache por aparência + pose + f + piscando: a lista e as caixas são congeladas e reaproveitadas, nada é alocado
  // por quadro; quando o piscar não muda o rosto (olhos já fechados ou "happy"), volta a mesma lista de olhos abertos.
  // No máximo 16 caixas (o ferramentas/checar_voxels.js confere todas as combinações).
  // pose, f, piscando e o balanço do 2D (oy: pulinho, respiração, o passo que sobe e desce) saem do Avatar.estado(b, t).
  // As 19 poses do 2D têm caixas próprias; pose desconhecida cai em "parado".
  // Do quadro 2D de 22x22: x = coluna - 11 e y = 21 - linha (a base do corpo no chão).
  const FRENTE = 6;   // a face da frente do corpo fica em z = 6
  const olhosVox = (ap, pose, f) => pose === "comemorando" ? "happy" : pose === "dormindo" || (pose === "cafe" && f) ? "fechados" : ap.eyes;
  function voxelsNovos(ap, pose, f, piscando) {
    const p = CORES[ap.color] || CORES.graphite, cx = [];
    const caixa = (x, y, z, w, h, d, cor) => { cx.push(Object.freeze([x, y, z, w, h, d, cor])); };
    const doQuadro = (col, lin, w, h, z, d, cor) => caixa(col - 11, 21 - lin - h, z, w, h, d, cor);   // retângulo do 2D, com profundidade
    const naFrente = (col, lin, w, h, cor, sobre = 0, d = 1) => doQuadro(col, lin, w, h, FRENTE + sobre, d, cor);
    // mão 3x3 do 2D vira um cubo: diante do corpo (à frente dos olhos) quando está diante dele, do lado quando está fora
    const mao = (col, lin, dz = 0) => doQuadro(col, lin, 3, 3, (Math.abs(col - 9.5) < 7 ? FRENTE + 1.5 : -1.5) + dz, 3, p.escuro);

    caixa(-7, 1, -6, 14, 11, 12, p.base);   // corpo em dois blocos: os cantos chanfrados do contorno do 2D
    caixa(-6, 0, -5, 12, 13, 10, p.base);

    const BRANCO = "#ffffff", PRETO = "#1b1b22";
    const tipo = piscando ? "fechados" : olhosVox(ap, pose, f);
    for (const e of [8, 12]) switch (tipo) {
      case "fechados": naFrente(e, 15, 2, 1, PRETO); break;
      case "happy": naFrente(e, 15, 3, 1, BRANCO); naFrente(e + 1, 14, 1, 1, BRANCO); break;   // o ^ do 2D em duas caixas
      case "sleepy": naFrente(e, 15, 3, 1, BRANCO); naFrente(e, 14, 3, 1, PRETO); break;
      case "wide": naFrente(e, 13, 3, 3, BRANCO); naFrente(e + 1, 14, 2, 2, PRETO, 1, 0.5); break;
      case "dots": naFrente(e + 1, 14, 1, 2, PRETO); break;
      default: naFrente(e, 13, 2, 3, BRANCO); naFrente(e + 1, 14, 1, 2, PRETO, 1, 0.5);   // round
    }

    switch (ap.accessory) {   // em cima da cabeça (y = 13), no máximo 5 caixas
      case "crown":
        caixa(-4, 13, -4, 8, 2, 8, "#ffd34d"); caixa(-4, 15, -4, 1, 2, 8, "#ffd34d"); caixa(3, 15, -4, 1, 2, 8, "#ffd34d");
        caixa(-1, 15, 2, 2, 3, 2, "#ffd34d"); caixa(-1, 14, 4, 1, 1, 0.5, "#e8476a"); break;
      case "hat":
        caixa(-8, 13, -8, 16, 1, 16, "#1f1f26"); caixa(-4, 14, -4, 8, 1, 8, "#c0392b"); caixa(-4, 15, -4, 8, 4, 8, "#2b2b34"); break;
      case "headphones":
        caixa(-9, 13, -1, 18, 1, 2, "#2b2b34"); caixa(-9, 8, -2, 2, 5, 4, "#2b2b34"); caixa(7, 8, -2, 2, 5, 4, "#2b2b34");   // conchas na orelha,
        caixa(-10, 9, -1, 1, 3, 2, "#ff6b8b"); caixa(9, 9, -1, 1, 3, 2, "#ff6b8b"); break;                                    // acima das mãos
      case "headset":
        caixa(-9, 13, -1, 18, 1, 2, "#1f1f26"); caixa(-9, 8, -2, 2, 5, 4, "#1f1f26"); caixa(7, 8, -2, 2, 5, 4, "#1f1f26");
        caixa(-9, 9, 2, 1, 1, 6, "#1f1f26"); caixa(-8, 9, 7, 1, 1, 1, "#4ade80"); break;   // haste do microfone para a frente
      case "flower":
        caixa(3, 13, -1, 3, 3, 3, "#ffffff"); caixa(2, 14, 0, 5, 1, 1, "#ffffff"); caixa(4, 12, -0.5, 1, 5, 2, "#ffffff");
        caixa(4, 14, 2, 1, 1, 0.5, "#ff7a59"); break;
      case "antenna":
        caixa(0, 13, -0.5, 1, 4, 1, "#2b2b34"); caixa(-1, 17, -1.5, 3, 2, 3, "#ff5a5a"); break;
      case "cap":
        caixa(-5, 13, -5, 10, 3, 10, "#1e3a8a"); caixa(-4, 13, 5, 8, 1, 4, "#1e3a8a"); caixa(-1, 16, -1, 2, 1, 2, "#1e3a8a"); break;
      case "bow":
        caixa(1, 13, -1, 3, 3, 2, "#ff5fa2"); caixa(5, 13, -1, 3, 3, 2, "#ff5fa2"); caixa(4, 14, -1, 1, 1, 2, "#c2185b"); break;
    }

    const E = 1, D = 18, Y = 14;   // as mesmas mãos do maos() do 2D (coluna, linha do quadro)
    switch (pose) {
      case "andando":   // no 3D o passo vai para a frente e para trás: pé e mão do mesmo lado em oposição
        mao(E, Y - 1 + f, f ? 2 : -2); mao(D, Y - f, f ? -2 : 2);
        caixa(-4, 0, f ? -8 : 3, 3, 1, 5, p.contorno); caixa(1, 0, f ? 3 : -8, 3, 1, 5, p.contorno); break;
      case "digitando": case "tocando": case "pebolim":
        mao(5, 17 - f); mao(14, 16 + f);
        if (pose === "pebolim") { caixa(-11, 3, 10.5, 22, 1, 1, "#b8bcc6"); caixa(-11, 2, 10.5, 22, 1, 1, "#7d828c"); }   // as barras, à frente das mãos
        break;
      case "cafe":
        if (f) {   // gole: a xícara na frente da boca
          mao(13, 12); doQuadro(14, 10, 4, 3, 7, 3, "#f4f4f6"); doQuadro(14, 9, 4, 1, 7, 3, "#6b4a2e"); doQuadro(18, 10, 1, 2, 8, 1, "#f4f4f6");
        } else {
          mao(E, Y); mao(16, 15); doQuadro(18, 13, 3, 3, 6.5, 3, "#f4f4f6"); doQuadro(18, 12, 3, 1, 6.5, 3, "#6b4a2e"); doQuadro(21, 13, 1, 2, 7.5, 1, "#f4f4f6");
        }
        break;
      case "jogando":
        caixa(-4, 2.5, 8, 8, 3, 2, ESCURO);   // o controle, entre as mãos
        doQuadro(8, 17, 1, 1, 10, 0.5, f ? "#ff5a5a" : "#4ade80"); doQuadro(13, 17, 1, 1, 10, 0.5, f ? "#60a5fa" : "#ffd34d");
        mao(5, 16 - f); mao(14, 15 + f); break;
      case "fliperama": mao(E + 2, Y - 1 + f); mao(D - 2, Y - f); break;   // de frente para a máquina: mãos nos botões
      case "raquete":
        mao(E, Y); mao(17, f ? 11 : 15, 3.5);   // o braço da raquete um pouco à frente (livre dos fones)
        caixa(7, f ? 11 : 7, 3, 4, 4, 1, "#e04848"); caixa(8.5, f ? 9 : 5, 3, 1, 2, 1, MADEIRA); break;
      case "taco":   // no 3D o taco aponta para a frente, nas duas mãos, e empurra de leve com o f
        caixa(-1, 4, 7 + f, 1, 1, 9, MADEIRA); caixa(-1, 4, 16 + f, 1, 1, 2, "#f4f4f6");
        caixa(-2, 3, 7.5 + f, 3, 3, 3, p.escuro); caixa(-2, 3, 12 + f, 3, 3, 3, p.escuro); break;
      case "comemorando": mao(E, 4 - f); mao(D, 4 - f); break;
      case "acenando": mao(E, Y); mao(D + (f ? 1 : -1), f ? 4 : 3); break;   // acima do 2D: livre da aba do chapéu e dos fones
      case "carinho": mao(E, Y); mao(D + 1, 16 + f); break;
      case "dancando": mao(E, f ? 16 : 4); mao(D, f ? 4 : 16); break;
      case "violao":   // corpo com a boca, braço e as duas mãos (a que dedilha e a que faz o acorde)
        caixa(-6, 1, 7, 7, 3.5, 2, "#c98b4b"); caixa(-1, 2, 9, 1, 1, 0.25, "#2b1d12"); caixa(1, 3, 7.5, 9, 1, 1, "#6b4423");
        mao(6, 15 + f); caixa(6, 2, 7, 3, 3, 3, p.escuro); break;
      case "arremesso":
        mao(E, Y);
        if (f) mao(17, 10, 3.5); else { mao(D, 4); caixa(8, 17, -1, 2, 2, 2, "#f4f4f6"); }
        break;
      case "esperando": case "sentado": case "dormindo": mao(5, 17); mao(14, 17); break;
      default: mao(E, Y); mao(D, Y);
    }
    return Object.freeze(cx);
  }

  const voxPorAparencia = new Map(), voxPorObjeto = new WeakMap();
  function voxels(ap, pose, f, piscando = false) {
    let mapa = voxPorObjeto.get(ap);
    if (!mapa) {
      const chave = `${ap.color}|${ap.eyes}|${ap.accessory}`;
      mapa = voxPorAparencia.get(chave) || new Map();
      voxPorAparencia.set(chave, mapa); voxPorObjeto.set(ap, mapa);
    }
    const n = Object.hasOwn(NUM_POSE, pose) ? pose : "parado", f1 = f ? 1 : 0, olho = olhosVox(ap, n, f1);
    const pisca = piscando && olho !== "happy" && olho !== "fechados" ? 1 : 0;   // piscar sem mudar o rosto: a mesma lista
    const k = (NUM_POSE[n] * 2 + f1) * 2 + pisca;
    let lista = mapa.get(k);
    if (!lista) { lista = voxelsNovos(ap, n, f1, pisca); mapa.set(k, lista); }
    return lista;
  }

  return { desenhar: desenharAvatar, boneco, estado, padrao: aparenciaPadrao, voxels, TAM, CORES, POSES };
})();

window.Avatar = Avatar;
