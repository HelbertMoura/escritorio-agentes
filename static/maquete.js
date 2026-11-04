// Maquete 3D: o prédio do mapa.js "dobrado" em 3D (as faixas de parede viram paredes), com os bonecos da vida.js (fatia 2).
// ES module, carregado só quando a pessoa escolhe a visão. Lê o estado só pela ponte do app.js; não cria global.
// Só lê: nada aqui escreve em predio, mundo ou bonecos (os caches ficam em estruturas próprias).
// Campos lidos (contrato com o Mapa.montarPredio):
//   predio: W, H, fundo, predioRet, salas, baixo, objetos, animados, janelas, portas, corredorTopo, corredorAlt
//   sala: px, py, pw, ph, chao, porta   objeto: nome, tipo, x, y, w, h, chave, mesa, cor, estilo, espelho
//   porta: tipo, x, y, w, h, sala       namespaces: window.Ceu, window.Clima, window.Mapa, window.Efeitos, window.Avatar
//   boneco (fatia 2): id, nome, x, y, ap, fala, trabalho{status, url}; pose, direção, passo e pulinho vêm do Avatar.estado(b, t)
// Coordenadas: 1 unidade = 1 px do mapa; x igual, z = dobra(y), e o y do 3D é a altura.
import * as THREE from "./vendor/three-0.186.1/three.module.js";

// ESPESSURA: da parede dobrada; BAIXA: altura da parede cortada; CABECA: altura do topo do boneco, para os rótulos
const FOV = 30, ESPESSURA = 6, BAIXA = 0.16, CABECA = 24;
const GIRO = { baixo: 0, cima: Math.PI, esq: -Math.PI / 2, dir: Math.PI / 2 };   // b.olha → rotação (a frente do voxel é +z, "baixo")
const toque = matchMedia("(pointer: coarse)");
let renderer = null;   // um só por página, reaproveitado (o Chrome derruba o contexto mais antigo depois de 16)
let aberta = null;     // a maquete aberta agora: { api, ponte, erro }

function criarRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: !toque.matches, powerPreference: "high-performance" });   // lança erro sem WebGL 2
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const cv = r.domElement;
  cv.className = "maquete"; cv.tabIndex = 0;
  cv.setAttribute("aria-label", "Maquete 3D do escritório. Arraste para girar; com o botão direito, com Shift ou com dois dedos, para mover; use a roda ou a pinça para aproximar. Com o foco aqui, as setas giram e Shift com as setas move.");
  cv.addEventListener("webglcontextlost", () => {
    const a = aberta, focado = document.activeElement === cv;   // antes de descartar: sem o canvas, o foco já está no body
    descartarRenderer();
    if (a) { a.erro("contexto WebGL perdido"); a.ponte.falhou("A maquete 3D parou neste navegador. Seguimos no mapa.", focado); }
  });
  renderer = r;
}
function descartarRenderer() { if (!renderer) return; const r = renderer; renderer = null; r.domElement.remove(); r.dispose(); }

// ---------- a dobra: cada faixa de parede [s.py, s.chao) encolhe para a espessura da parede --------------------
function criarDobra(predio) {
  const faixas = [...predio.salas, ...predio.baixo].map(s => [s.py, s.chao]).sort((a, b) => a[0] - b[0]), u = [];
  for (const [a, b] of faixas) { const l = u[u.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else u.push([a, b]); }
  const dobra = y => { let z = y; for (const [a, b] of u) { if (y >= b) z -= b - a - ESPESSURA; else if (y > a) z -= (y - a) * (1 - ESPESSURA / (b - a)); } return z; };
  const desdobra = z => {
    let y = z;
    for (const [a, b] of u) { const za = dobra(a); if (z >= za + ESPESSURA) y += b - a - ESPESSURA; else if (z > za) y += (z - za) * ((b - a) / ESPESSURA - 1); }
    return y;
  };
  return { faixas: u, dobra, desdobra };
}

// ---------- texturas: cópia do fundo (com as janelas) e folha com os desenhos dos objetos ----------------------
function corMedia(c, x, y, w, h) {
  if (w < 1 || h < 1) return "#cfc7b6";
  const d = c.getImageData(x, y, w, h).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return "#cfc7b6";
  return "#" + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join("");
}

function pintarFundo(c, predio, atlas, k, ceu) {
  c.setTransform(k, 0, 0, k, 0, 0); c.imageSmoothingEnabled = k < 1;
  c.drawImage(predio.fundo, 0, 0);
  c.imageSmoothingEnabled = false;
  for (const j of predio.janelas) window.Ceu.janela(c, j, ceu, 0);
  for (const a of predio.animados) { // telas de parede: o 1º quadro, parado (a animação fica no 2D)
    const s = a.parede && a.tipo !== "tela" && atlas.json.sprites[`${a.tipo}_0`];
    if (s) c.drawImage(atlas.img, s[0], s[1], s[2], s[3], a.x, a.y, s[2], s[3]);
  }
}

// ---------- objetos em volume: cada desenho do 2D vira cubinhos com as cores do próprio pixel art --------------
// O jeito de ganhar volume sai do nome da peça (peça sem medida cai na dobra, com medidas proporcionais à altura):
//   dobra [alt, topo, prof, esp]: as alt linhas de baixo são a frente, em pé; as topo linhas acima são o tampo, deitado e
//     esticado até prof cubinhos de fundo; o que sobra em cima (monitor, encosto, TV, micro-ondas) fica em pé no fundo,
//     com esp de grossura. Linha da frente com buracos (pés) só fica na frente e no fundo, menos as 2 de cima (o tampo).
//   torno: cada linha vira uma camada com fundo proporcional à largura dela (copa em camadas, tronco, vaso, poste)
//   placa: o desenho em pé, com esp de grossura (divisória, quadros de pé, encosto da cadeira)
// Tapetes continuam deitados. A orientação é fixa no mundo: nada gira com a câmera.
const DOBRA = {
  mesa: [10, 7, 10], recepcao: [10, 6, 12], poltrona_azul: [10, 8, 12], poltrona_tecido: [8, 6, 10], poltrona_amarela: [8, 5, 10],
  mesinha: [8, 6, 8], estante_livros: [40, 2, 10], lixeiras: [12, 3, 8], impressora: [17, 5, 12], cafeteira: [20, 4, 12],
  arquivo: [31, 4, 12], arquivo2: [20, 4, 12], aparador_baixo: [10, 3, 10], jardineira: [5, 2, 6], reuniao: [10, 30, 30],
  geladeira2: [41, 4, 14], bancada: [16, 8, 14], balcao: [14, 8, 12], mesa_cozinha: [14, 18, 18], mesa_cozinha2: [12, 14, 16],
  sofa: [8, 4, 10], sofa_cinza: [8, 5, 10], sofa2: [10, 6, 12], sofa3: [12, 12, 18], sinuca2: [12, 26, 26], pebolim: [10, 12, 12],
  arcade1: [47, 4, 14], arcade2: [39, 4, 14], arcade3: [38, 4, 14], rack_tv: [12, 4, 10], console: [9, 6, 10], fruteira: [4, 3, 4],
  pufe_amarelo: [10, 12, 14], pufe_azul: [10, 10, 12], pufe_vermelho: [10, 12, 14], geladeira_bebidas: [37, 3, 14],
  vendas: [44, 5, 16], vendas2: [40, 4, 16], banco: [8, 4, 8], canteiro: [8, 6, 12, 12], banca_jornal: [26, 6, 20],
  ponto_onibus: [32, 12, 16], mesa_piquenique: [10, 16, 18],
};
const PLACA = { divisoria: 2, quadro_branco: 3, quadro_avisos: 3, bicicletario: 6 };
const TORNO = /^(arvore|arbusto|palmeira|planta|poste|luminaria|hidrante|lixeira$|lixeira_rua|caixa_correio|orelhao|bebedouro|cabideiro|ring_light|ventilador|violao|extintor|globo)/;
const COPA = /^(arvore|arbusto|palmeira)/;
function forma(nome, h) {
  if (nome === "cadeira") return { modo: "placa", esp: 2, pe: 4, assento: 8 };   // o 2D mostra só o encosto: ganha assento (na frente dele) e pé
  if (TORNO.test(nome)) return { modo: "torno", f: nome === "violao" ? 0.35 : COPA.test(nome) ? 0.85 : 1, q: COPA.test(nome) ? 4 : 2 };
  if (PLACA[nome]) return { modo: "placa", esp: PLACA[nome] };
  const [alt, topo, prof = topo, esp] = DOBRA[nome] || [Math.round(h * 0.55), Math.round(h * 0.2), Math.max(8, Math.round(h * 0.2))];
  return { modo: "dobra", alt, topo, prof, esp: esp || Math.max(2, Math.min(6, Math.round(prof * 0.4))) };
}

// Face de cada direção do volume (eixo, sinal, eixos do plano, tom): topo mais claro, laterais e fundo mais escuros.
// No volume, z cresce para o fundo (no mundo, z = frente - z).
// SOB: a câmera mais baixa fica a 90 · sen(0,35) ≈ 30,8 de altura (prender, no abrir): face de baixo até ali não aparece
const SOB = 30;
const FACES = [[0, 1, 2, 1, 0.8], [0, -1, 2, 1, 0.8], [1, 1, 0, 2, 1], [1, -1, 0, 2, 0.6], [2, -1, 0, 1, 0.9], [2, 1, 0, 1, 0.74]];

// Volume X×Y×Z: cada cubinho guarda o pixel do desenho que pinta as faces dele (fr: frente e lados; tp: em cima e embaixo),
// como (linha << 12) | coluna: andar um pixel no desenho é somar ±1 ou ±4096.
// Malha gulosa por textura: faces vizinhas se juntam num retângulo só quando os pixels delas andam juntos no desenho
// (o mesmo pixel ou o vizinho, sempre na mesma direção), então as cores são as do sprite e os triângulos são poucos.
function voxelizar(px, fm) { // px: ImageData do desenho recortado
  const w = px.width, h = px.height, d = px.data, op = new Uint8Array(w * h);
  let hash = 2166136261;
  for (let i = 0; i < w * h; i++) { op[i] = d[i * 4 + 3] >= 128; hash = Math.imul(hash ^ op[i], 16777619); }
  // a malha só depende da silhueta e da forma (as cores vêm da textura): variações de cor reaproveitam a mesma
  const chaveForma = `${w}x${h}|${hash >>> 0}|${JSON.stringify(fm)}`, pronta = cacheForma.get(chaveForma);
  if (pronta) return pronta;
  const cheio = (x, r) => x >= 0 && x < w && r >= 0 && r < h && op[r * w + x] === 1;
  const linhaCheia = r => { for (let x = 0; x < w; x++) if (cheio(x, r)) return true; return false; };
  let hb = h - 1; while (hb >= 0 && !linhaCheia(hb)) hb--;   // a linha de baixo do desenho fica no chão (a sombra pintada cai fora)
  if (hb < 0) return null;
  let X = w, Y, Z, fr, tp;
  const criar = () => { fr = new Int32Array(X * Y * Z).fill(-1); tp = new Int32Array(X * Y * Z); };
  const por = (x, y, z, a, b) => { const i = (z * Y + y) * X + x; fr[i] = a; tp[i] = b; };
  const info = { hb, alt: 0, topo: 0, prof: 0 };
  if (fm.modo === "dobra") {
    const alt = Math.min(fm.alt, hb + 1), topo = Math.max(0, Math.min(fm.topo, hb + 1 - alt)), sobra = hb + 1 - alt - topo;
    Y = alt + sobra; Z = topo ? Math.max(fm.prof, 2) : Math.max(2, fm.esp); criar();
    const esp = Math.min(Z, fm.esp), rTopo = z => hb - alt - Math.floor((z * topo) / Z);
    let x0 = w, x1 = -1;
    for (let r = hb - alt - topo + 1; r <= hb - (topo ? alt : 0); r++) for (let x = 0; x < w; x++) if (cheio(x, r)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const tampo = new Int32Array(w * Z).fill(-1);   // pixel do tampo em cima de cada (x, z), ou -1
    if (topo) for (let z = 0; z < Z; z++) for (let x = 0; x < w; x++) if (cheio(x, rTopo(z))) tampo[z * w + x] = (rTopo(z) << 12) | x;
    for (let y = 0; y < alt; y++) {
      const r = hb - y; let n = 0;
      for (let x = x0; x <= x1; x++) if (cheio(x, r)) n++;
      const pes = y < alt - 2 && n < 0.8 * (x1 - x0 + 1);   // as 2 linhas de cima são sempre o tampo, maciço
      for (let x = 0; x < w; x++) {
        const f = cheio(x, r), i = (r << 12) | x;
        for (let z = 0; z < Z; z++) {
          const t = tampo[z * w + x];
          if (pes ? f && (z < 2 || z >= Z - 2) : t >= 0 || (f && z < 2)) por(x, y, z, i, t >= 0 ? t : i);
        }
      }
    }
    for (let k = 0; k < sobra; k++) { const r = hb - alt - topo - k; for (let x = 0; x < w; x++) if (cheio(x, r)) for (let z = Z - esp; z < Z; z++) por(x, alt + k, z, (r << 12) | x, (r << 12) | x); }
    Object.assign(info, { alt, topo, prof: Z });
  } else if (fm.modo === "torno") { // camadas de 2 linhas (de baixo para cima): a silhueta da camada junta as duas
    const camada = r => (hb - r) >> 1, par = r => hb - (camada(r) * 2 + ((hb - r) & 1 ? 0 : 1)), fundos = [];
    const cheio2 = (x, r) => cheio(x, r) || cheio(x, par(r));
    for (let r = 0; r <= hb; r++) {
      let a = w, b = -1; for (let x = 0; x < w; x++) if (cheio2(x, r)) { a = Math.min(a, x); b = Math.max(b, x); }
      fundos.push(b < 0 ? 0 : Math.max(fm.q, Math.round((fm.f * (b - a + 1)) / fm.q) * fm.q));
    }
    Y = hb + 1; Z = Math.max(2, ...fundos); criar();
    for (let r = 0; r <= hb; r++) { const z0 = (Z - fundos[r]) >> 1; for (let x = 0; x < w; x++) if (cheio2(x, r)) for (let z = z0; z < z0 + fundos[r]; z++) por(x, hb - r, z, (r << 12) | x, (r << 12) | x); }
    info.prof = Z;
  } else {
    const pe = fm.pe || 0, sen = fm.assento || 0; Y = hb + 1 + pe; Z = fm.esp + sen; criar();
    for (let r = 0; r <= hb; r++) for (let x = 0; x < w; x++) if (cheio(x, r)) for (let z = sen; z < Z; z++) por(x, hb - r + pe, z, (r << 12) | x, (r << 12) | x);
    if (pe) { // cadeira: o assento sai do pé do encosto para a frente (embaixo de quem senta), com o pé no meio dele
      const mx = w >> 1, i = (hb << 12) | mx, zp = sen >> 1;
      for (let x = 1; x < w - 1; x++) for (let z = 0; z < sen; z++) for (let y = pe - 2; y < pe; y++) por(x, y, z, (hb << 12) | x, (hb << 12) | x);
      for (let y = 0; y < pe - 2; y++) for (let x = mx - 1; x <= mx; x++) for (let z = zp - 1; z <= zp; z++) por(x, y, z, i, i);
    }
    info.prof = Z;
  }
  const malhaPronta = { ...info, ...gulosa(X, Y, Z, fr, tp) };
  cacheForma.set(chaveForma, malhaPronta);
  return malhaPronta;
}

// malha gulosa, direção por direção, fatia por fatia (função à parte: o volume chega como parâmetro, e os laços ficam rápidos)
function gulosa(X, Y, Z, fr, tp) {
  const dims = [X, Y, Z], pos = [], tex = [], nor = [], tom = [], idx = [], c = [0, 0, 0];
  const PASSOS = new Set([0, 1, -1, 4096, -4096]), comp = (D, eixo) => (eixo ? (Math.abs(D) === 4096 ? Math.sign(D) : 0) : Math.abs(D) === 1 ? D : 0);
  for (const [a, s, ua, va, luz] of FACES) {
    const A = dims[a], U = dims[ua], V = dims[va], masc = new Int32Array(U * V), n0 = [0, 0, 0], st = [1, X, X * Y];
    const sa = st[a], su = st[ua], sv = st[va], fonte = a === 1 ? tp : fr;
    n0[a] = a === 2 ? -s : s;   // normal no mundo
    // cantos (0,0), (1,0), (1,1) no plano (ua, va), levados ao mundo: o giro deles bate com a normal?
    const e1 = [0, 0, 0], e2 = [0, 0, 0]; e1[ua] = 1; e2[ua] = 1; e2[va] = 1; e1[2] = -e1[2]; e2[2] = -e2[2];
    const direto = (e1[1] * e2[2] - e1[2] * e2[1]) * n0[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n0[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n0[2] > 0;
    for (let k = 0; k < A; k++) {
      if (a === 1 && s < 0 && k < SOB) continue;   // face virada para baixo abaixo da câmera mais baixa nunca aparece
      const vizinho = k + s >= 0 && k + s < A;
      for (let v = 0, q = 0; v < V; v++) for (let u = 0, i = k * sa + v * sv; u < U; u++, i += su, q++) masc[q] = fr[i] >= 0 && !(vizinho && fr[i + s * sa] >= 0) ? fonte[i] : -1;
      for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
        const m = masc[v * U + u]; if (m < 0) continue;
        let du = 0, dv = 0, L = 1, H = 1;
        if (u + 1 < U && masc[v * U + u + 1] >= 0 && PASSOS.has(masc[v * U + u + 1] - m)) du = masc[v * U + u + 1] - m;
        while (u + L < U && masc[v * U + u + L] === m + L * du) L++;
        if (v + 1 < V && masc[(v + 1) * U + u] >= 0) { const p = masc[(v + 1) * U + u] - m; if (PASSOS.has(p) && (!p || Math.abs(p) !== Math.abs(du))) dv = p; }
        for (let ok = true; ok && v + H < V; ) {
          const e = m + H * dv, lin = (v + H) * U + u;
          for (let k2 = 0; k2 < L && ok; k2++) ok = masc[lin + k2] === e + k2 * du;
          if (ok) H++;
        }
        for (let j = 0; j < H; j++) for (let q = (v + j) * U + u, fim = q + L; q < fim; q++) masc[q] = -1;
        // cantos no volume e no desenho
        const plano = k + (s > 0 ? 1 : 0), sx = m & 4095, sy = m >> 12;
        const ux = comp(du, 0), uy = comp(du, 1), vx = comp(dv, 0), vy = comp(dv, 1);
        const bx = sx + (ux < 0 || vx < 0 ? 1 : 0) + (!ux && !vx ? 0.5 : 0), by = sy + (uy < 0 || vy < 0 ? 1 : 0) + (!uy && !vy ? 0.5 : 0);
        const base = pos.length / 3;
        for (let q = 0; q < 4; q++) {
          const i2 = q === 1 || q === 2 ? L : 0, j2 = q > 1 ? H : 0;
          c[a] = plano; c[ua] = u + i2; c[va] = v + j2;
          pos.push(c[0], c[1], -c[2]); tex.push(bx + i2 * ux + j2 * vx, by + i2 * uy + j2 * vy);
          nor.push(n0[0], n0[1], n0[2]); tom.push(luz);
        }
        // a ordem dos cantos depende do eixo (o z do volume é invertido no mundo): vale a mesma para a direção toda
        if (direto) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
  }
  return { pos, tex, nor, tom, idx };
}

// cópia sem transparência para a folha: pixel vazio herda a cor de um vizinho cheio (o mipmap não escurece as bordas)
function semFuros(px) {
  const w = px.width, h = px.height, dado = new ImageData(new Uint8ClampedArray(px.data), w, h), d = dado.data, n = w * h;
  const cheio = new Uint8Array(n), novo = new Uint8Array(n);
  for (let i = 0; i < n; i++) cheio[i] = d[i * 4 + 3] >= 128;
  for (let volta = 0; volta < 6; volta++) {
    novo.set(cheio);
    for (let i = 0; i < n; i++) {
      if (cheio[i]) continue;
      const x = i % w, j = x > 0 && cheio[i - 1] ? i - 1 : x < w - 1 && cheio[i + 1] ? i + 1 : i >= w && cheio[i - w] ? i - w : i + w < n && cheio[i + w] ? i + w : -1;
      if (j >= 0) { d[i * 4] = d[j * 4]; d[i * 4 + 1] = d[j * 4 + 1]; d[i * 4 + 2] = d[j * 4 + 2]; novo[i] = 1; }
    }
    cheio.set(novo);
  }
  for (let i = 0; i < n; i++) d[i * 4 + 3] = 255;
  return emCanvas(dado);
}
const emCanvas = dado => { const cv = document.createElement("canvas"); cv.width = dado.width; cv.height = dado.height; cv.getContext("2d").putImageData(dado, 0, 0); return cv; };

// Cada objeto é desenhado como no 2D (sprite, mesa, cadeira ou peça em código), recortado pelo alfa e transformado em
// volume uma vez por desenho: o cache vale entre aberturas (a montagem seguinte só copia as malhas).
const cacheVox = new Map(), cacheForma = new Map();
function recortarObjetos(predio, atlas) {
  const pedidos = [], novos = new Map();
  if (cacheVox.size > 600) { cacheVox.clear(); cacheForma.clear(); }   // desenhos de listas de times antigas não acumulam
  for (const o of predio.objetos) {
    let chave, ax, ay, caixa, desenha;
    if (o.tipo === "mesa") {
      const m = o.mesa; ax = m.x; ay = m.topo;
      chave = `m|${m.estilo}|${m.itens}|${m.monitores}|${m.corItem}|${m.abajur}|${m.pato}`;
      caixa = [-18, -10, 36, 32]; desenha = c => window.Mapa.desenharMesa(c, m.x, m.topo, "apagada", 0, m);
    } else if (o.tipo === "cadeira") {
      ax = o.x; ay = o.y; chave = `c|${o.cor}|${o.estilo}`;
      caixa = [-8, -16, 16, 18]; desenha = c => window.Mapa.desenharCadeira(c, o.x, o.y, o.cor, o.estilo);
    } else {
      if (!o.w || !o.h) continue;
      const variante = atlas.json.sprites[o.nome] ? 0 : ((o.x * 31 + o.y * 17) >>> 0) % 4;   // a cor sorteada pela posição só existe nas peças em código
      ax = o.x; ay = o.y; chave = `${o.nome}|${o.espelho ? 1 : 0}|${o.w}|${o.h}|${o.cor || ""}|${variante}`;
      caixa = [-8, -24, o.w + 16, o.h + 30];
      desenha = c => {
        const copia = { ...o };   // o efeitos.js guarda cache no objeto: aqui ele fica na cópia
        if (o.espelho) { c.translate(2 * o.x + o.w, 0); c.scale(-1, 1); }
        if (!window.Efeitos.objeto(c, copia, 0)) { const s = atlas.json.sprites[o.nome]; if (s) c.drawImage(atlas.img, s[0], s[1], s[2], s[3], o.x, o.y, s[2], s[3]); }
      };
    }
    if (!cacheVox.has(chave) && !novos.has(chave)) novos.set(chave, { ax, ay, caixa, desenha, nome: o.tipo || o.nome });
    pedidos.push({ o, chave, ax, ay });
  }
  if (novos.size) { // desenhos novos: todos num rascunho só, lido de uma vez (cada leitura obriga o navegador a terminar de desenhar)
    const LR = 1024; let x = 0, y = 0, linha = 0;
    for (const n of novos.values()) {
      const [, , cw, ch] = n.caixa;
      if (x + cw > LR) { x = 0; y += linha; linha = 0; }
      n.sx = x; n.sy = y; x += cw; linha = Math.max(linha, ch);
    }
    const rasc = document.createElement("canvas"); rasc.width = LR; rasc.height = Math.max(1, y + linha);
    const rc = rasc.getContext("2d", { willReadFrequently: true });
    for (const n of novos.values()) {
      const [cx, cy, cw, ch] = n.caixa;
      rc.save(); rc.beginPath(); rc.rect(n.sx, n.sy, cw, ch); rc.clip();
      rc.setTransform(1, 0, 0, 1, n.sx - (n.ax + cx), n.sy - (n.ay + cy)); rc.imageSmoothingEnabled = false;
      n.desenha(rc); rc.restore();
    }
    const d = rc.getImageData(0, 0, LR, rasc.height).data;
    for (const [chave, n] of novos) {
      const [cx, cy, cw, ch] = n.caixa;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let yy = 0; yy < ch; yy++) for (let xx = 0, i = ((n.sy + yy) * LR + n.sx) * 4 + 3; xx < cw; xx++, i += 4) if (d[i] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      let u = null;
      if (x1 >= 0) {
        const pw = x1 - x0 + 1, ph = y1 - y0 + 1, px = new ImageData(pw, ph), plano = /^tapete/.test(n.nome);
        for (let yy = 0; yy < ph; yy++) { const ini = ((n.sy + y0 + yy) * LR + n.sx + x0) * 4; px.data.set(d.subarray(ini, ini + pw * 4), yy * pw * 4); }
        // vox undefined: o volume ainda não foi feito (a montagem faz até um teto de tempo; o resto, nos quadros seguintes)
        u = { img: plano ? emCanvas(px) : semFuros(px), dx: cx + x0, dy: cy + y0, plano, nome: n.nome, px: plano ? null : px, vox: plano ? null : undefined };
      }
      cacheVox.set(chave, u);
    }
  }
  const lista = [];
  for (const { o, chave, ax, ay } of pedidos) {
    const u = cacheVox.get(chave);
    if (!u) continue;
    const base = o.tipo === "mesa" ? o.mesa.topo + 18 : o.tipo === "cadeira" ? o.y : o.y + o.h;
    lista.push({ u, x: ax + u.dx, y: ay + u.dy, w: u.img.width, h: u.img.height, base, chave: o.chave, nome: o.tipo || o.nome });
  }
  // folha: prateleiras de 2048 px de largura, 2 px de folga entre os desenhos
  const LARG = 2048, imgs = [...new Set(lista.map(r => r.u))].sort((a, b) => b.img.height - a.img.height);
  let x = 2, y = 2, linha = 0;
  for (const u of imgs) {
    if (x + u.img.width + 2 > LARG) { x = 2; y += linha + 4; linha = 0; }
    u.sx = x; u.sy = y; x += u.img.width + 4; linha = Math.max(linha, u.img.height);
  }
  const folha = document.createElement("canvas"); folha.width = LARG; folha.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(4, y + linha + 2));
  const fc = folha.getContext("2d");
  for (const u of imgs) fc.drawImage(u.img, u.sx, u.sy);
  return { folha, lista, tipos: imgs.length };
}

function textura(cv, max) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = max;
  return t;
}

// ---------- geometria -----------------------------------------------------------------------------------------
function malha() {
  const g = { pos: [], uv: [], nor: [], idx: [] };
  g.quad = (p, uv, n) => { // p: 4 cantos [x,y,z] na ordem baixo-esq, baixo-dir, cima-dir, cima-esq
    const i = g.pos.length / 3;
    for (const v of p) g.pos.push(...v);
    g.uv.push(...uv); for (let k = 0; k < 4; k++) g.nor.push(...n);
    g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return i;
  };
  g.criar = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setIndex(g.idx);
    return geo;
  };
  return g;
}

function montar(predio, ponte, cv) {
  const inicio = performance.now(), atlas = ponte.atlas();
  const { W, H } = predio, { faixas, dobra, desdobra } = criarDobra(predio), D = dobra(H);
  const maxTex = renderer.capabilities.maxTextureSize, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const k = Math.min(1, maxTex / W, maxTex / H);   // fundo maior que o limite do aparelho: reduzimos nós (sem aviso do Three.js)
  const fundoCv = document.createElement("canvas"); fundoCv.width = Math.round(W * k); fundoCv.height = Math.round(H * k);
  const fundoC = fundoCv.getContext("2d", { willReadFrequently: true });
  let ceu = window.Ceu.agora();
  pintarFundo(fundoC, predio, atlas, k, ceu);
  const texFundo = textura(fundoCv, aniso);
  const uv = (x, y) => [x / W, 1 - y / H];

  // chão: o fundo inteiro deitado, em faixas; cada faixa de parede vira uma tira fina (embaixo da parede)
  const chao = malha(), cortes = [0, ...faixas.flat(), H];
  for (let i = 0; i + 1 < cortes.length; i++) {
    const y0 = cortes[i], y1 = cortes[i + 1], z0 = dobra(y0), z1 = dobra(y1);
    chao.quad([[0, 0, z1], [W, 0, z1], [W, 0, z0], [0, 0, z0]], [...uv(0, y1), ...uv(W, y1), ...uv(W, y0), ...uv(0, y0)], [0, 1, 0]);
  }

  // caixas: ilha, paredes e o friso escuro em cima de cada parede (o contorno do 2D visto de cima)
  const caixas = [], paredes = [];
  const caixa = (x0, y0, z0, x1, y1, z1, cor, corte) => { caixas.push({ x0, y0, z0, x1, y1, z1, cor, corte }); return caixas.length - 1; };
  caixa(0, -8, 0, W, -1, D, "#4f8a3c"); caixa(0, -64, 0, W, -8, D, "#7a5232"); caixa(36, -118, 36, W - 36, -64, D - 36, "#5e4029"); caixa(110, -150, 110, W - 110, -118, D - 110, "#4a3220");
  // parede: retângulo no chão (x0..x1, z0..z1), altura, cor e de que lados há sala (vetores no plano x,z):
  // ela baixa quando a câmera está do lado de fora de uma dessas salas
  const parede = (x0, z0, x1, z1, alt, cor, lados, quad, frente) => { // quad: face com a arte (fundo); frente: fachada de uma sala
    if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
    paredes.push({ x0, z0, x1, z1, alt, lados, f: 1, corpo: caixa(x0, 0, z0, x1, alt, z1, cor, "corpo"), friso: caixa(x0, alt, z0, x1, alt + 1.5, z1, "#23212f", "friso"), quad, frente });
  };
  const semPortas = (a, b, vaos) => { // trechos de [a, b] fora dos vãos [x, x + w]
    const out = []; let cur = a;
    for (const [x, w] of vaos.sort((p, q) => p[0] - q[0])) { if (x > cur) out.push([cur, Math.min(x, b)]); cur = Math.max(cur, x + w); }
    if (cur < b) out.push([cur, b]);
    return out;
  };
  const todas = [...predio.salas, ...predio.baixo], cores = new Map();
  for (const s of todas) cores.set(s, corMedia(fundoC, Math.round(s.px * k), Math.round(s.py * k), Math.round(s.pw * k), Math.round((s.chao - s.py) * k)));
  const fileiras = new Map();
  for (const s of todas) { if (!fileiras.has(s.py)) fileiras.set(s.py, []); fileiras.get(s.py).push(s); }
  for (const fila of fileiras.values()) {
    fila.sort((a, b) => a.px - b.px);
    fila.forEach((s, i) => {
      const alt = s.chao - s.py, cor = cores.get(s), zA = dobra(s.py) - 3, zC = dobra(s.chao), zF = dobra(s.py + s.ph);
      // fundo da sala: caixa + a face de dentro com a própria faixa de parede do 2D (quadros, janelas, rodapé)
      const vaosFundo = predio.portas.filter(p => p.h && p.y < s.chao && p.y + p.h > s.py && p.x + p.w > s.px && p.x < s.px + s.pw && p.tipo !== "lateral").map(p => [p.x, p.w]);
      for (const [a, b] of semPortas(s.px, s.px + s.pw, vaosFundo)) {
        const quad = chao.quad([[a, 0, zC], [b, 0, zC], [b, alt, zC], [a, alt, zC]], [...uv(a, s.chao), ...uv(b, s.chao), ...uv(b, s.py), ...uv(a, s.py)], [0, 0, 1]);
        parede(a, zA, b, zC - 0.6, alt, cor, [[0, 1]], { i: quad, a, b, zC, chao: s.chao, sala: s });
      }
      // frente: 3 px como o contorno do 2D, com o vão da porta das salas de cima
      const vaosFrente = predio.portas.filter(p => !p.h && p.tipo !== "lateral" && p.sala === s).map(p => [p.x, p.w]);
      for (const [a, b] of semPortas(s.px, s.px + s.pw, vaosFrente)) parede(a, zF, b, zF + 3, alt, cor, [[0, -1]], null, { sala: s, a, b, z: zF + 3.3 });
      // laterais: 3 px nas pontas da fileira; entre duas salas, o vão inteiro vira uma parede grossa
      const ant = fila[i - 1];
      if (!ant) parede(s.px - 3, zA, s.px, zF + 3, alt, cor, [[1, 0]]);
      else parede(ant.px + ant.pw, zA, s.px, zF + 3, alt, cor, [[1, 0], [-1, 0]]);
      if (i === fila.length - 1) parede(s.px + s.pw, zA, s.px + s.pw + 3, zF + 3, alt, cor, [[-1, 0]]);
    });
  }
  { // pontas do corredor: a entrada principal (vão da porta lateral) e a parede do fundo
    const r = predio.predioRet, y0 = predio.corredorTopo, y1 = y0 + predio.corredorAlt, alt = 48;
    const xe = r.x + 16, xd = r.x + r.w - 16, lat = predio.portas.find(p => p.tipo === "lateral");
    const trechos = lat ? [[y0, lat.y], [lat.y + lat.h, y1]] : [[y0, y1]];
    for (const [a, b] of trechos) parede(xe - 3, dobra(a), xe, dobra(b), alt, "#cfc7b6", [[1, 0]]);
    parede(xd, dobra(y0), xd + 3, dobra(y1), alt, "#cfc7b6", [[-1, 0]]);
  }
  const caixaGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
  const caixasMesh = new THREE.InstancedMesh(caixaGeo, new THREE.MeshLambertMaterial(), caixas.length);
  const mat = new THREE.Matrix4(), cor = new THREE.Color();
  const porCaixa = (i, f = 1) => { // f: quanto da altura a parede mostra (o corpo encolhe e o friso desce junto)
    const c = caixas[i];
    mat.makeScale(c.x1 - c.x0, (c.y1 - c.y0) * (c.corte === "corpo" ? f : 1), c.z1 - c.z0);
    mat.setPosition(c.x0, c.corte === "friso" ? c.y0 * f : c.y0, c.z0);
    caixasMesh.setMatrixAt(i, mat);
  };
  caixas.forEach((c, i) => { porCaixa(i); caixasMesh.setColorAt(i, cor.set(c.cor)); });
  caixasMesh.castShadow = true; caixasMesh.receiveShadow = true;

  // bonecos: todas as caixas de todos os agentes num InstancedMesh só (até 16 caixas + 2 da mão levantada por boneco)
  const cap = (ponte.mundo().bonecos.size + 4) * 18;
  const bonecosMesh = new THREE.InstancedMesh(caixaGeo, new THREE.MeshLambertMaterial(), cap);
  bonecosMesh.setColorAt(0, cor.set("#ffffff")); bonecosMesh.count = 0; bonecosMesh.frustumCulled = false;
  bonecosMesh.castShadow = true; bonecosMesh.receiveShadow = true;
  const apagado = new THREE.Color("#6b6b78");

  // placas das salas numa textura só, repintada quando o contador "na mesa" muda: as da faixa de parede ficam na parede do
  // fundo; as da fachada (recepção e salas de cima) ficam na face de fora da parede da frente, em cima dela
  const placasCv = document.createElement("canvas"), pc = placasCv.getContext("2d"), placas = [], PH = window.Mapa.PLACA_H + 4;
  { let x = 2, y = 2;
    for (const w of paredes) {
      const q = w.quad || w.frente, p = q && q.sala.placa;
      if (!p || (p.y < q.sala.chao) !== !!w.quad || p.x < q.a || p.x >= q.b || placas.some(o => o.s === q.sala)) continue;
      const pw = p.total + 16;
      if (x + pw > 1022) { x = 2; y += PH + 2; }
      placas.push({ s: q.sala, w, sx: x, sy: y, pw, x0: p.x - 2, y0: p.y - 2, etq: null, frente: !w.quad }); x += pw + 2;
    }
    placasCv.width = 1024; placasCv.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(4, y + PH + 2));
  }
  const pintarPlacas = () => { // devolve true se algum contador mudou
    let mudou = false;
    pc.imageSmoothingEnabled = false;
    for (const o of placas) {
      pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(o.sx, o.sy, o.pw, PH);
      pc.save(); pc.beginPath(); pc.rect(o.sx, o.sy, o.pw, PH); pc.clip(); pc.translate(o.sx - o.x0, o.sy - o.y0);
      const etq = ponte.desenharPlaca(pc, o.s); pc.restore();
      if (etq !== o.etq) { o.etq = etq; mudou = true; }
    }
    return mudou;
  };
  pintarPlacas();
  const texPlacas = textura(placasCv, aniso), placaG = malha();
  const altoPlaca = (o, f) => (o.frente ? Math.max(PH + 2, o.w.alt * f - 2) : o.w.quad.chao - o.y0);   // a da fachada desce com a parede
  for (const o of placas) {
    const u0 = o.sx / 1024, u1 = (o.sx + o.pw) / 1024, vT = 1 - o.sy / placasCv.height, vB = 1 - (o.sy + PH) / placasCv.height;
    o.yt = altoPlaca(o, 1); o.yb = o.yt - PH; const z = o.frente ? o.w.frente.z : o.w.quad.zC + 0.3;
    o.i = placaG.quad([[o.x0, o.yb, z], [o.x0 + o.pw, o.yb, z], [o.x0 + o.pw, o.yt, z], [o.x0, o.yt, z]], [u0, vB, u1, vB, u1, vT, u0, vT], [0, 0, 1]);
    (o.w.placas = o.w.placas || []).push(o);
  }
  const placaGeo = placaG.criar();
  const placaMesh = new THREE.Mesh(placaGeo, new THREE.MeshLambertMaterial({ map: texPlacas, alphaTest: 0.5 }));
  placaMesh.receiveShadow = true;

  const chaoGeo = chao.criar();
  const chaoMesh = new THREE.Mesh(chaoGeo, new THREE.MeshLambertMaterial({ map: texFundo }));
  chaoMesh.receiveShadow = true;

  // objetos em volume voxel, de orientação fixa, e os tapetes deitados: uma malha só, montada das malhas em cache de cada desenho
  const { folha, lista, tipos } = recortarObjetos(predio, atlas);
  const texFolha = textura(folha, aniso), FW = folha.width, FH = folha.height, tap = malha();
  for (const r of lista) {
    if (!r.u.plano) continue;
    const u = r.u, u0 = u.sx / FW, u1 = (u.sx + r.w) / FW, vT = 1 - u.sy / FH, vB = 1 - (u.sy + r.h) / FH;
    tap.quad([[r.x, 0.4, dobra(r.y + r.h)], [r.x + r.w, 0.4, dobra(r.y + r.h)], [r.x + r.w, 0.4, dobra(r.y)], [r.x, 0.4, dobra(r.y)]], [u0, vB, u1, vB, u1, vT, u0, vT], [0, 1, 0]);
  }
  // desenhos ainda sem volume (1ª abertura): feitos até o teto de tempo da montagem; o resto entra pelo completar()
  const fila = [...new Set(lista.map(r => r.u))].filter(u => u.vox === undefined);
  let feitos = 0;
  const voxelizarAte = limite => {
    for (; feitos < fila.length && performance.now() < limite; feitos++) { const u = fila[feitos]; if (u.vox === undefined) { u.vox = voxelizar(u.px, forma(u.nome, u.px.height)); u.px = null; } }
    return feitos === fila.length;
  };
  const juntar = () => { // posição de cada objeto e a cópia das malhas dele numa geometria só
    const postos = []; let nv = 0, ni = 0;
    for (const r of lista) {
      const v = r.u.vox;
      if (!v) continue;   // tapete, desenho vazio ou volume que ainda não saiu
      let zf = dobra(r.base), lift = 0;
      if (r.nome === "cadeira") zf = dobra(r.base);   // quem trabalha senta atrás da mesa, de frente para a câmera: o encosto fica às costas dele
      else if (!v.topo) zf = dobra(r.base - Math.max(6, Math.min(40, r.h * 0.35)) / 2) + v.prof / 2;   // torno e placa: centrados na pegada do 2D
      if (Math.abs((r.chave % 1) - 0.1) < 1e-6) { // em cima de outro móvel (a fruteira na mesa): sobe até o tampo, na linha certa dele
        const p = postos.find(q => q.r.u.vox.topo && Math.abs(q.r.chave - (r.chave - 0.1)) < 1e-6 && r.x + r.w > q.r.x && r.x < q.r.x + q.r.w);
        if (p) {
          const pv = p.r.u.vox, linha = r.y + v.hb - p.r.y;
          lift = pv.alt; zf = p.zf - Math.max(0, Math.min(pv.prof - 1, Math.floor(((pv.hb - pv.alt - linha) * pv.prof) / pv.topo)));
        }
      }
      postos.push({ r, zf, lift }); nv += v.pos.length / 3; ni += v.idx.length;
    }
    const vPos = new Float32Array(nv * 3), vUv = new Float32Array(nv * 2), vNor = new Float32Array(nv * 3), vCor = new Float32Array(nv * 3), vIdx = new Uint32Array(ni);
    let o = 0, oi = 0;
    for (const { r, zf, lift } of postos) {
      const v = r.u.vox, n = v.pos.length / 3, sx = r.u.sx, sy = r.u.sy;
      for (let i = 0; i < n; i++) {
        vPos[(o + i) * 3] = r.x + v.pos[i * 3]; vPos[(o + i) * 3 + 1] = lift + v.pos[i * 3 + 1]; vPos[(o + i) * 3 + 2] = zf + v.pos[i * 3 + 2];
        vUv[(o + i) * 2] = (sx + v.tex[i * 2]) / FW; vUv[(o + i) * 2 + 1] = 1 - (sy + v.tex[i * 2 + 1]) / FH;
        vNor[(o + i) * 3] = v.nor[i * 3]; vNor[(o + i) * 3 + 1] = v.nor[i * 3 + 1]; vNor[(o + i) * 3 + 2] = v.nor[i * 3 + 2];
        vCor.fill(v.tom[i], (o + i) * 3, (o + i) * 3 + 3);
      }
      for (let i = 0; i < v.idx.length; i++) vIdx[oi + i] = o + v.idx[i];
      o += n; oi += v.idx.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vPos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(vUv, 2));
    geo.setAttribute("normal", new THREE.BufferAttribute(vNor, 3)); geo.setAttribute("color", new THREE.BufferAttribute(vCor, 3));
    geo.setIndex(new THREE.BufferAttribute(vIdx, 1));
    return geo;
  };
  voxelizarAte(inicio + 150);
  const voxMesh = new THREE.Mesh(juntar(), new THREE.MeshLambertMaterial({ map: texFolha, vertexColors: true }));
  voxMesh.castShadow = true; voxMesh.receiveShadow = true;   // a sombra sai dos próprios cubinhos
  const tapGeo = tap.criar();
  const tapMesh = new THREE.Mesh(tapGeo, new THREE.MeshLambertMaterial({ map: texFolha, alphaTest: 0.5 }));
  tapMesh.receiveShadow = true;

  const cena = new THREE.Scene();
  cena.add(chaoMesh, caixasMesh, voxMesh, tapMesh, bonecosMesh, placaMesh);
  const ceuCv = document.createElement("canvas"); ceuCv.width = 2; ceuCv.height = 128;
  const texCeu = new THREE.CanvasTexture(ceuCv); texCeu.colorSpace = THREE.SRGBColorSpace;
  cena.background = texCeu; cena.fog = new THREE.Fog(0xffffff, 1e5, 2e5);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6d5a43, 1.85);
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  const r = predio.predioRet, meio = new THREE.Vector3(r.x + r.w / 2, 0, (dobra(r.y) + dobra(r.y + r.h)) / 2);
  const raio = Math.hypot(r.w, dobra(r.y + r.h) - dobra(r.y)) / 2 + 140, luz = new THREE.Vector3(-0.45, 1.2, 0.75).normalize();
  sol.position.copy(meio).addScaledVector(luz, raio * 2); sol.target.position.copy(meio);
  sol.castShadow = true;
  const sc = sol.shadow.camera; sc.left = -raio; sc.right = raio; sc.top = raio; sc.bottom = -raio; sc.near = 1; sc.far = raio * 4;
  sol.shadow.mapSize.set(toque.matches ? 1024 : 2048, toque.matches ? 1024 : 2048);
  sol.shadow.bias = -0.0006; sol.shadow.normalBias = 1.2;
  cena.add(hemi, sol, sol.target);

  const camera = new THREE.PerspectiveCamera(FOV, Math.max(0.1, cv.clientWidth / Math.max(1, cv.clientHeight)), 5, 20000);
  const limites = { x0: r.x, x1: r.x + r.w, z0: dobra(r.y), z1: dobra(r.y + r.h), w: r.w + 60, d: dobra(r.y + r.h) - dobra(r.y) + 60 };
  const ms = performance.now() - inicio;
  const descartar = () => {
    for (const g of [chaoGeo, caixaGeo, voxMesh.geometry, tapGeo, placaGeo]) g.dispose();
    for (const m of [chaoMesh, caixasMesh, voxMesh, tapMesh, bonecosMesh, placaMesh]) m.material.dispose();
    caixasMesh.dispose(); bonecosMesh.dispose(); sol.dispose();
    for (const t of [texFundo, texFolha, texCeu, texPlacas]) t.dispose();
  };
  return {
    predio, cena, camera, ms, caixas: caixas.length, objetos: lista.length, tipos, dobra, desdobra, limites, meio,
    ambiente(c) { // dia e noite gerais pelo Ceu: céu, sol e ambiente (os cubinhos seguem a luz, como as paredes)
      const e = c.escuro;
      const g = ceuCv.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, c.cima); grad.addColorStop(1, c.baixo); g.fillStyle = grad; g.fillRect(0, 0, 2, 128);
      texCeu.needsUpdate = true; cena.fog.color.set(c.baixo);
      hemi.color.set(c.cima).lerp(cor.set("#ffffff"), 0.65); hemi.intensity = 1.85 - 1.15 * e;
      sol.color.set(e > 0.6 ? "#9fb2ff" : e > 0.2 ? "#ffc89a" : "#fff6e8"); sol.intensity = 1.6 * (1 - e) + 0.3 * e;
      if (Math.abs(e - ceu.escuro) > 0.2) { ceu = c; pintarFundo(fundoC, predio, atlas, k, c); texFundo.needsUpdate = true; }   // janelas com o céu da hora
    },
    cortar(sx, sz, dt, calmo) { // paredes entre a câmera e as salas baixam; as do fundo ficam altas
      let mudou = false;
      const pos = chaoGeo.getAttribute("position"), uvA = chaoGeo.getAttribute("uv");
      for (const w of paredes) {
        const alvo = w.lados.some(([nx, nz]) => -(nx * sx + nz * sz) > 0.35) ? BAIXA : 1;
        if (w.f === alvo) continue;
        w.f = calmo || Math.abs(alvo - w.f) < 0.01 ? alvo : w.f + (alvo - w.f) * Math.min(1, dt * 8);
        mudou = true;
        porCaixa(w.corpo, w.f); porCaixa(w.friso, w.f);
        if (w.quad) { // a face com a arte mostra só a parte de baixo da faixa (rodapé), sem achatar o desenho
          const h = w.alt * w.f, q = w.quad;
          pos.setY(q.i + 2, h); pos.setY(q.i + 3, h);
          uvA.setY(q.i + 2, 1 - (q.chao - h) / H); uvA.setY(q.i + 3, 1 - (q.chao - h) / H);
        }
        for (const o of w.placas || []) { // a do fundo some com a parede baixa (não fica boiando); a da fachada desce junto
          const pp = placaGeo.getAttribute("position"), some = !o.frente && w.f < 0.7, yt = altoPlaca(o, w.f);
          for (let k = 0; k < 4; k++) pp.setY(o.i + k, some ? 0 : k < 2 ? yt - PH : yt);
          pp.needsUpdate = true;
        }
      }
      if (mudou) { caixasMesh.instanceMatrix.needsUpdate = true; pos.needsUpdate = true; uvA.needsUpdate = true; }
    },
    sombras(ligadas) { sol.castShadow = ligadas; },
    descartar,
    placas() { if (pintarPlacas()) texPlacas.needsUpdate = true; },
    faltam: () => fila.length - feitos,
    completar() { // volumes que ficaram para depois: 6 ms por quadro; no fim, a malha é refeita uma vez (true quando acabou agora)
      if (feitos === fila.length || !voxelizarAte(performance.now() + 6)) return false;
      const velha = voxMesh.geometry; voxMesh.geometry = juntar(); velha.dispose();
      return true;
    },
    bonecos(t, desenhados) { // caixas de cada agente visível, giradas pelo b.olha; quem não bate com o filtro fica apagado
      const mundo = ponte.mundo(); let n = 0;
      desenhados.length = 0;
      for (const b of mundo.bonecos.values()) {
        if (!ponte.visivel(b)) continue;
        const e = window.Avatar.estado(b, t), lista = window.Avatar.voxels(b.ap, e.pose, e.f, e.piscando);
        const giro = GIRO[e.olha] || 0, co = Math.cos(giro), si = Math.sin(giro), x = b.x, y = e.oy;
        const z = dobra(Math.max(b.y, (b.chave ?? b.y) - 0.5));   // sentado num móvel: na frente dele, como no 2D (b.chave)
        const apaga = !ponte.combina(b), est = b.trabalho && ponte.estadoDe(b.trabalho.status);
        const poe = (bx, by, bz, w, h, d, c) => {
          if (n >= cap) return;
          mat.set(co * w, 0, si * d, x + bx * co + bz * si, 0, h, 0, y + by, -si * w, 0, co * d, z - bx * si + bz * co, 0, 0, 0, 1);
          bonecosMesh.setMatrixAt(n, mat); cor.set(c); if (apaga) cor.lerp(apagado, 0.6); bonecosMesh.setColorAt(n++, cor);
        };
        for (const [bx, by, bz, w, h, d, c] of lista) poe(bx, by, bz, w, h, d, c);
        if (est && est.classe === "aprovacao") { // mão levantada de quem espera aprovação, acenando (parada com menos movimento)
          const pal = window.Avatar.CORES[b.ap.color] || window.Avatar.CORES.graphite, ac = ponte.calmo.matches ? 0 : Math.floor(t / 280) % 2;
          poe(6 + ac, 8, -1.5, 3, 10, 3, pal.base); poe(5 + ac, 17, -2.5, 5, 5, 5, pal.contorno);
        }
        desenhados.push({ b, x, y, z, est, apaga });
      }
      bonecosMesh.count = n; bonecosMesh.instanceMatrix.needsUpdate = true; bonecosMesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------- a maquete aberta -------------------------------------------------------------------------------------
export function abrir(palco, ponte) {
  if (!window.WebGL2RenderingContext) throw new Error("sem WebGL 2");
  if (!renderer) criarRenderer();
  renderer.shadowMap.enabled = true;   // o nível leve de uma abertura anterior não fica
  const cv = renderer.domElement;
  const tela = palco.querySelector("#tela");
  palco.insertBefore(cv, tela ? tela.nextSibling : palco.firstChild);
  // nomes, selos e balões: um canvas 2D por cima do WebGL (texto só por fillText), sem receber o ponteiro
  const rot = document.createElement("canvas"), rc = rot.getContext("2d");
  rot.className = "maquete-rotulos"; rot.setAttribute("aria-hidden", "true");
  palco.insertBefore(rot, cv.nextSibling);
  const desenhados = [], alvos = [], larguras = new Map();
  let dprR = 1, corDestaque = window.Mapa.cor("destaque");
  let m = null, ultimo = 0, proximo = 0, quadros = 0, medidos = [], nivel = 0, ultimoCeu = -1e9, primeiro = true;
  const calmo = () => ponte.calmo.matches;
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0.95, dist: 1000 };
  let alvo = null, girar = false, mexeu = performance.now(), larg = 1, alt = 1, distTudo = 1000;
  const erro = txt => { palco.dataset.maqueteErro = txt; console.warn("Maquete 3D:", txt); };

  const distPara = (w, d, pitch, yaw) => {
    const cw = Math.abs(w * Math.cos(yaw)) + Math.abs(d * Math.sin(yaw)), cd = Math.abs(w * Math.sin(yaw)) + Math.abs(d * Math.cos(yaw));
    const vt = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), ht = vt * m.camera.aspect;
    return Math.max(cw / 2 / ht, (cd * Math.sin(pitch) + 50 * Math.cos(pitch)) / 2 / vt) * 1.02;
  };
  const prender = c => {
    const L = m.limites;
    c.x = Math.max(L.x0, Math.min(L.x1, c.x)); c.z = Math.max(L.z0, Math.min(L.z1, c.z));
    c.pitch = Math.max(0.35, Math.min(1.35, c.pitch)); c.dist = Math.max(90, Math.min(distTudo * 1.7, c.dist));
    return c;
  };
  const mover = (a, ja) => { // anima até o alvo; com menos movimento, pula
    const c = prender({ ...cam, ...alvo, ...a });
    if (ja || calmo()) { Object.assign(cam, c); alvo = null; } else alvo = c;
  };
  const verTudo = ja => { // em pé (retrato), o prédio comprido encosta nas bordas: a câmera sobe um pouco e corta só a calçada
    const pe = larg / alt < 0.9, pitch = pe ? 1.1 : 0.95;
    distTudo = distPara(m.limites.w, m.limites.d, pitch, cam.yaw);
    mover({ x: m.meio.x, z: m.meio.z, pitch, dist: distTudo * (pe ? 0.88 : 1) }, ja);
  };

  function remontar() {
    if (m) { m.descartar(); m = null; }
    m = montar(ponte.predio(), ponte, cv);
    m.camera.aspect = larg / alt;
    m.ambiente(window.Ceu.agora()); ultimoCeu = performance.now();
    verTudo(true); primeiro = true; quadros = 0; medidos = [];
    delete palco.dataset.maqueteErro;
  }

  function redimensionar(w, h, dpr) {
    larg = Math.max(1, w); alt = Math.max(1, h);
    if (!renderer) return;
    renderer.setPixelRatio(nivel ? 1 : Math.min(dpr || 1, toque.matches ? 1.5 : 2));
    renderer.setSize(larg, alt);
    dprR = Math.min(2, dpr || 1); rot.width = Math.round(larg * dprR); rot.height = Math.round(alt * dprR);
    rot.style.width = `${larg}px`; rot.style.height = `${alt}px`;
    if (m) { m.camera.aspect = larg / alt; m.camera.updateProjectionMatrix(); distTudo = distPara(m.limites.w, m.limites.d, 0.95, cam.yaw); }
  }

  function aparelhoLento(intervalo) { // mediana de 90 quadros acima de 40 ms: tira a sombra; se continuar, volta ao 2D
    if (++quadros < 30 || intervalo > 500) return;
    medidos.push(intervalo); if (medidos.length < 90) return;
    palco.dataset.qps = String(Math.round((90 * 1000) / medidos.reduce((t, x) => t + x, 0)));   // média dos últimos 90 quadros
    const med = medidos.sort((a, b) => a - b)[45]; medidos = [];
    if (med <= 40) return;
    if (!nivel) { nivel = 1; m.sombras(false); renderer.shadowMap.enabled = false; redimensionar(larg, alt, 1); return; }
    erro(`aparelho lento: mediana de ${Math.round(med)} ms entre quadros`);
    ponte.falhou("A maquete ficou pesada neste aparelho. Seguimos no mapa.");
  }

  function quadro(t, dt) {
    if (!renderer || !m && !ponte.predio()) return;
    if (!m || m.predio !== ponte.predio()) remontar();   // a lista de times mudou: remonta sem recarregar
    const periodo = toque.matches ? 1000 / 30 : 1000 / 60;   // teto de 30 qps no toque e 60 no desktop (também em tela de 120 Hz ou mais)
    if (t < proximo - 1) return;
    proximo = t - proximo > periodo ? t + periodo : proximo + periodo;
    const intervalo = t - ultimo; ultimo = t;
    if (!primeiro) aparelhoLento(intervalo);   // o 1º quadro de cada montagem compila os shaders: não conta
    if (!aberta || aberta.api !== api) return;   // o aparelho lento acabou de fechar a maquete
    if (t - ultimoCeu > 1000) { // a cada segundo: céu, contadores das placas e a cor de destaque da marca
      m.ambiente(window.Ceu.agora()); m.placas(); ultimoCeu = t;
      corDestaque = window.Mapa.cor("destaque");
    }
    const sid = ponte.seguindo(), seguido = sid && ponte.mundo().bonecos.get(sid);
    if (seguido && ponte.visivel(seguido)) { // Seguir: o centro da câmera acompanha o agente (pula com menos movimento)
      const sx0 = seguido.x, sz0 = m.dobra(seguido.y), f = calmo() ? 1 : Math.min(1, dt * 5);
      if (alvo) { alvo.x = sx0; alvo.z = sz0; } else { cam.x += (sx0 - cam.x) * f; cam.z += (sz0 - cam.z) * f; }
    }
    if (alvo) { // desliza até o alvo
      const f = Math.min(1, dt * 7);
      for (const k of ["x", "z", "pitch", "dist"]) cam[k] += (alvo[k] - cam[k]) * f;
      cam.yaw += (alvo.yaw - cam.yaw) * f;
      if (Math.abs(alvo.dist - cam.dist) < 0.5 && Math.abs(alvo.x - cam.x) < 0.3 && Math.abs(alvo.z - cam.z) < 0.3) alvo = null;
    } else if (girar && !calmo() && t - mexeu > 3000) cam.yaw += dt * 0.07;   // giro lento quando ninguém mexe
    const c = m.camera, cp = Math.cos(cam.pitch), sx = Math.sin(cam.yaw), sz = Math.cos(cam.yaw);
    c.position.set(cam.x + cam.dist * cp * sx, cam.dist * Math.sin(cam.pitch), cam.z + cam.dist * cp * sz);
    c.near = Math.max(5, cam.dist * 0.05); c.far = cam.dist * 4 + 3000; c.updateProjectionMatrix();
    c.lookAt(cam.x, 0, cam.z);
    m.cena.fog.near = cam.dist * 1.6; m.cena.fog.far = cam.dist * 4 + 3000;
    m.cortar(sx, sz, dt, calmo());
    if (m.completar()) primeiro = true;   // os últimos volumes entraram: mede o orçamento de novo
    m.bonecos(t, desenhados);
    renderer.render(m.cena, c);
    rotulos(t);
    if (primeiro) { // orçamento medido no 1º quadro de cada montagem
      primeiro = false;
      const i = renderer.info;
      palco.dataset.cena = `chamadas=${i.render.calls};triangulos=${i.render.triangles};caixas=${m.caixas};objetos=${m.objetos};tipos=${m.tipos};faltam=${m.faltam()};montagem=${Math.round(m.ms)}ms;texturas=${i.memory.textures};geometrias=${i.memory.geometries}`;
    }
  }

  // ---------- mouse, toque e teclado (só no canvas da maquete) ----------
  const dedos = new Map();
  let gesto = null;
  const escala = () => (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * cam.dist) / alt;   // unidades do mundo por px da tela
  const arrastar = (dx, dy) => { // move o alvo no chão, na direção do que a pessoa vê (e para de seguir o agente)
    ponte.pararDeSeguir();
    const e = escala(), cx = Math.cos(cam.yaw), sx = Math.sin(cam.yaw);
    cam.x += -dx * e * cx - dy * e * sx / Math.sin(cam.pitch) * 0.9; cam.z += dx * e * sx - dy * e * cx / Math.sin(cam.pitch) * 0.9;
    prender(cam);
  };
  const ouvir = (tipo, f, op) => { cv.addEventListener(tipo, f, op); return () => cv.removeEventListener(tipo, f, op); };
  const soltar = [
    ouvir("contextmenu", ev => ev.preventDefault()),
    ouvir("wheel", ev => { ev.preventDefault(); alvo = null; mexeu = performance.now(); cam.dist *= Math.exp(ev.deltaY * 0.0012); prender(cam); }, { passive: false }),
    ouvir("pointerdown", ev => {
      cv.setPointerCapture(ev.pointerId); dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      alvo = null; mexeu = performance.now();
      if (dedos.size === 2) { const [a, b] = [...dedos.values()]; gesto = { tipo: "pinca", d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moveu: true }; }
      else if (dedos.size === 1) gesto = { tipo: ev.button === 2 || ev.button === 1 || ev.shiftKey ? "mover" : "girar", x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, moveu: false, toque: ev.pointerType === "touch" };
    }),
    ouvir("pointerleave", () => ponte.cartao(null)),
    ouvir("pointermove", ev => {
      if (ev.pointerType === "mouse" && !dedos.size) { // cartão rápido ao passar o mouse (no toque, a ficha faz esse papel)
        const a = alvoEm(ev.clientX, ev.clientY);
        cv.style.cursor = a ? "pointer" : ""; ponte.cartao(a && a.b, ev.clientX, ev.clientY);
        return;
      }
      if (!dedos.has(ev.pointerId) || !gesto) return;
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); mexeu = performance.now();
      if (gesto.tipo === "pinca" && dedos.size >= 2) { // pinça aproxima; os dois dedos juntos arrastam
        const [a, b] = [...dedos.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cam.dist *= gesto.d / Math.max(1, d); arrastar(mx - gesto.mx, my - gesto.my);
        Object.assign(gesto, { d, mx, my }); prender(cam); return;
      }
      const dx = ev.clientX - gesto.x, dy = ev.clientY - gesto.y;
      if (Math.hypot(ev.clientX - gesto.x0, ev.clientY - gesto.y0) > (gesto.toque ? 8 : 4)) gesto.moveu = true;
      if (!gesto.moveu) return;
      gesto.x = ev.clientX; gesto.y = ev.clientY; cv.style.cursor = "grabbing";
      if (gesto.tipo === "mover") arrastar(dx, dy);
      else { cam.yaw -= dx * 0.006; cam.pitch += dy * 0.005; prender(cam); }
    }),
    ouvir("pointerup", ev => {
      const clique = gesto && gesto.tipo !== "pinca" && !gesto.moveu && dedos.size === 1 && ev.button === 0;
      dedos.delete(ev.pointerId); cv.style.cursor = "";
      if (dedos.size === 1 && gesto && gesto.tipo === "pinca") { const [p] = [...dedos.values()]; gesto = { tipo: "girar", x: p.x, y: p.y, x0: p.x, y0: p.y, moveu: true, toque: true }; return; }
      if (dedos.size) return;
      gesto = null;
      if (clique) tocar(ev.clientX, ev.clientY);
    }),
    ouvir("pointercancel", ev => { dedos.delete(ev.pointerId); if (!dedos.size) gesto = null; }),
    ouvir("keydown", ev => { // setas giram; Shift + setas move
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!k || !m) return;
      ev.preventDefault(); alvo = null; mexeu = performance.now();
      if (ev.shiftKey) arrastar(-k[0] * 60, -k[1] * 60);
      else { cam.yaw += k[0] * 0.26; cam.pitch -= k[1] * 0.09; prender(cam); }
    }),
  ];
  function alvoEm(cx, cy) { // selo ou agente sob o ponteiro (o selo ganha; no toque, alvo maior)
    const rr = cv.getBoundingClientRect(), x = cx - rr.left, y = cy - rr.top;
    let melhor = null, nota = Infinity;
    for (const a of alvos) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < a.r && d - (a.selo ? 1000 : 0) < nota) { nota = d - (a.selo ? 1000 : 0); melhor = a; }
    }
    return melhor;
  }
  function tocar(cx, cy) { // selo abre o pedido, agente abre a ficha; no chão de uma sala, a câmera vai até ela e a lista "Salas" marca
    const a = alvoEm(cx, cy);
    if (a) { ponte.cartao(null); if (a.selo) ponte.abrirPedido(a.b); else ponte.tocarAgente(a.b); return; }
    const rr = cv.getBoundingClientRect(), v = new THREE.Vector3(((cx - rr.left) / rr.width) * 2 - 1, -((cy - rr.top) / rr.height) * 2 + 1, 0.5).unproject(m.camera);
    const o = m.camera.position, d = v.sub(o).normalize(); if (d.y >= -1e-3) return;
    const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
    const s = ponte.salaEm({ x, y: m.desdobra(z) });
    if (s) { focarSala(s); ponte.marcarSala(s); }
  }
  const v3 = new THREE.Vector3();
  const projetar = (x, y, z) => { v3.set(x, y, z).project(m.camera); return v3.z < 1 ? [(v3.x + 1) / 2 * larg, (1 - v3.y) / 2 * alt] : null; };
  function rotulos(t) { // nomes, selos "!"/"?" e balões, com a regra do 2D de não cobrir um ao outro
    const c = rc, calmoJa = calmo(), sel = ponte.selecionado();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rot.width, rot.height); c.setTransform(dprR, 0, 0, dprR, 0, 0);
    alvos.length = 0;
    const itens = [], sid = ponte.seguindo();
    for (const d of desenhados) {
      const pe = projetar(d.x, d.y, d.z), topo = pe && projetar(d.x, d.y + CABECA, d.z);
      if (!pe || !topo || topo[0] < -60 || topo[0] > larg + 60 || topo[1] < -60 || pe[1] > alt + 60) continue;
      const hPx = Math.max(6, pe[1] - topo[1]);
      // maquete pequena (celular) ou bonecos miúdos: só o nome de quem tem selo, está selecionado ou é seguido; os outros no toque
      const nome = !(larg < 600 || hPx < 12) || (d.est && d.est.balao) || sel === d.b.id || sid === d.b.id;
      if (nome) itens.push({ ...d, px: topo[0], py: topo[1], hPx, peY: pe[1] });
      alvos.push({ b: d.b, x: topo[0], y: (topo[1] + pe[1]) / 2, r: Math.max(toque.matches ? 22 : 14, hPx * 0.7) });
    }
    itens.sort((a, b) => b.peY - a.peY || a.px - b.px);   // quem está mais perto da câmera escolhe o lugar primeiro
    const ocupados = [], bate = r => ocupados.some(o => r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y);
    const medir = (txt, fonte) => { const k = fonte + txt; let w = larguras.get(k); if (w === undefined) { c.font = fonte; w = c.measureText(txt).width; larguras.set(k, w); } return w; };
    const NOME = "700 12px Figtree, system-ui, sans-serif", FALA = "600 12px Figtree, system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    for (const it of itens) {
      const b = it.b, w = medir(b.nome, NOME) + 14, h = 20, selo = it.est && it.est.balao, folga = selo ? 24 : 0, eu = sel === b.id;
      const x = Math.max(2, Math.min(larg - w - 2 - folga, it.px - w / 2));
      let y = Math.max(2, it.py - h - 4);
      for (let i = 0; i < 6 && bate({ x, y, w: w + folga, h }); i++) y -= h + 3;
      ocupados.push({ x, y, w, h }); it.etq = { x, y, w, h };
      c.globalAlpha = it.apaga ? 0.35 : 1;
      if (y < it.py - h - 10) { c.strokeStyle = "rgba(15,15,17,.7)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + w / 2, y + h); c.lineTo(it.px, it.py); c.stroke(); }   // subiu: um fio liga o nome ao boneco
      if (eu) { c.strokeStyle = corDestaque; c.lineWidth = 2; c.strokeRect(it.px - it.hPx * 0.45, it.py - 2, it.hPx * 0.9, it.hPx + 4); }   // anel do selecionado
      c.fillStyle = eu ? "#f2f2f3" : "rgba(15,15,17,.85)"; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
      c.font = NOME; c.fillStyle = eu ? "#111" : "#fff"; c.fillText(b.nome, x + w / 2, y + h / 2 + 1);
      if (selo) { // selo "!" (aprovação) ou "?" (pergunta): pulsa até a pessoa resolver no agentes.chat
        const aprov = it.est.classe === "aprovacao", r = aprov ? 9 : 8, bx = x + w + r + 2, by = y + h / 2 - (calmoJa ? 0 : Math.floor(t / 400) % 2);
        const corS = window.Mapa.rgb(window.Mapa.cor(aprov ? "ambar" : "azul"));
        if (!calmoJa) { const f = (t % 1400) / 1400; c.strokeStyle = `rgba(${corS},${0.85 * (1 - f)})`; c.lineWidth = 1.6; c.beginPath(); c.arc(bx, by, r * (1 + f * 1.1), 0, Math.PI * 2); c.stroke(); }
        c.fillStyle = "#1b1a26"; c.beginPath(); c.arc(bx, by, r + 1, 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgb(${corS})`; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#111"; c.font = `800 ${aprov ? 13 : 12}px Figtree, system-ui, sans-serif`; c.fillText(selo, bx, by + 1);
        if (b.trabalho.url) alvos.push({ b, selo: true, x: bx, y: by, r: toque.matches ? 22 : r * 1.6 });
        ocupados.push({ x: bx - r * 1.3, y: by - r * 1.3, w: r * 2.6, h: r * 2.6 });
      }
      c.globalAlpha = 1;
    }
    c.textAlign = "left";
    for (const it of itens) { // balão de fala acima do nome: tenta à direita, à esquerda e no meio; se não couber, sobe uma linha
      if (!it.b.fala) continue;
      const w = Math.min(medir(it.b.fala, FALA) + 16, 260), h = 22, rabo = 5, cx = it.px, topoNome = it.etq.y;
      const prende = x => Math.min(Math.max(2, x), larg - w - 2);
      let pos = null;
      for (let nivel = 0; nivel < 6 && !pos; nivel++) {
        const y = topoNome - rabo - 1 - h - nivel * (h + 3);
        for (const x of [cx - 6, cx - w + 8, cx - w / 2].map(prende)) { const r = { x, y, w, h, nivel }; if (!bate(r)) { pos = r; break; } }
      }
      pos = pos || { x: prende(cx - 6), y: topoNome - rabo - 1 - h, w, h, nivel: 0 };
      ocupados.push(pos);
      const { x, y } = pos, ponta = Math.min(Math.max(cx, x + 6), x + w - 8);
      c.globalAlpha = it.apaga ? 0.35 : 1;
      c.fillStyle = "#ffffff"; c.strokeStyle = "#1b1b22"; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(x, y, w, h, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(ponta - 1, y + h - 0.5); c.lineTo(ponta + 4, y + h + rabo); c.lineTo(ponta + 7, y + h - 0.5); c.closePath(); c.fill();
      if (pos.nivel) { c.setLineDash([3, 3]); c.beginPath(); c.moveTo(ponta + 4, y + h + rabo); c.lineTo(cx, topoNome); c.stroke(); c.setLineDash([]); }   // subiu: um fio liga ao nome
      c.font = FALA; c.fillStyle = "#18181b"; c.fillText(it.b.fala, x + 8, y + h / 2 + 1, w - 16);
      c.globalAlpha = 1;
    }
  }
  function focarAgente(b) { // a câmera vai até o agente (a ficha quem abre é o app.js)
    if (!m) return;
    mover({ x: b.x, z: m.dobra(b.y), pitch: Math.max(cam.pitch, 0.9), dist: Math.min(cam.dist, 260) });
  }
  function focarSala(s) {
    if (!m) return;
    const z0 = m.dobra(s.py), z1 = m.dobra(s.py + s.ph);
    mover({ x: s.px + s.pw / 2, z: (z0 + z1) / 2 + 4, pitch: Math.max(cam.pitch, 0.95), dist: distPara(s.pw + 40, z1 - z0 + 40, Math.max(cam.pitch, 0.95), cam.yaw) });
  }

  const api = {
    quadro, redimensionar,
    zoom(f) { if (m) mover({ dist: (alvo ? alvo.dist : cam.dist) / f }); },
    verTudo() { if (m) verTudo(false); },
    focarSala, focarAgente,
    girar(ligado) { girar = !!ligado; },
    fechar() {
      if (!aberta || aberta.api !== api) return;
      aberta = null;
      soltar.forEach(f => f());
      if (m) { m.descartar(); m = null; }
      cv.remove(); rot.remove(); ponte.cartao(null);
    },
  };
  aberta = { api, ponte, erro };
  redimensionar(palco.clientWidth, palco.clientHeight, window.devicePixelRatio);
  try { remontar(); } catch (e) { api.fechar(); throw e; }
  return api;
}
