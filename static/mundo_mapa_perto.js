// Os níveis de detalhe do mapa do Brasil (mundo_mapa.js). A camada de perto: o mesmo mapa no dobro da resolução, com
// rodovias e rios menores, em azulejos pedidos conforme a vista a partir de 2x; enquanto um azulejo não chega vale a
// camada de longe ampliada, e ele entra numa transição curta (sem transição com movimento reduzido). As UFs: o mapa
// delas (do mundo.json), o realce sob o cursor (contorno claro e escuro e um leve clareamento) e, a partir de 2x, o nome
// no meio de cada uma. As cidades médias (marcador e nome a partir de 3x) e os nomes dos vizinhos. Nenhum nome cobre
// outro, um ícone ou um nome de capital: quem não cabe, some. Textos, realces e o arranjo dos nomes são feitos uma vez
// (por vista) e guardados; por quadro, só cópias.
"use strict";
const MapaPerto = (() => {
  const Z_PERTO = 2 - 1e-6, Z_MEDIAS = 2.7, TROCA = 0.25;   // degraus do zoom; TROCA: segundos da transição de camada
  const LETRAS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const numero = v => Number.isFinite(v);

  function criar({ dados, reduzido }) {
    const { tela, nitido } = MapaArte;
    const nivel = (dados.niveis && dados.niveis.brasil) || {}, W = nivel.w || 400, H = nivel.h || 400;
    const cfg = nivel.perto || {}, F = cfg.escala || 2, A = cfg.azulejo || 200, N = Number.isInteger(cfg.n) ? cfg.n : 0;
    const LADO = A / F, versao = Number.isInteger(dados.versao) ? dados.versao : 0;

    // --- a camada de perto, em azulejos -------------------------------------------------------------------------------
    const azulejos = new Array(N * N).fill(null);
    let desenhados = 0, pedidos = 0;
    function pedir(k) {
      const img = new Image(), a = { img, pronto: false, alfa: 0 };
      img.addEventListener("load", () => { a.pronto = true; });
      img.addEventListener("error", () => { a.erro = true; });
      img.src = `/mundo/perto/${k % N}-${Math.floor(k / N)}.png?v=${versao}`;
      pedidos++;
      return (azulejos[k] = a);
    }
    // de novo ao voltar ao mapa, o azulejo que falhou
    function tentarDeNovo() { azulejos.forEach((a, k) => { if (a && a.erro) azulejos[k] = null; }); }
    // os azulejos de um retângulo do mundo (com um quarto de azulejo de folga), chamando f(i, j)
    function cada(x0, y0, x1, y1, f) {
      const M = 0.25, i0 = Math.max(0, Math.floor(x0 / LADO - M)), i1 = Math.min(N - 1, Math.floor(x1 / LADO + M));
      const j0 = Math.max(0, Math.floor(y0 / LADO - M)), j1 = Math.min(N - 1, Math.floor(y1 / LADO + M));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(i, j);
    }
    // os azulejos pedidos: os da vista parada a 2x ou mais e, enquanto o zoom anda, só os da vista de chegada (se ela
    // for de 2x ou mais; o centro dela sai da âncora do zoom, ou do voo); a 1x, nenhum
    function pedirVista(cam) {
      if (cam.alvoZ === cam.z) {
        if (cam.P / cam.base >= Z_PERTO) cada(...cam.mundo(0, 0), ...cam.mundo(cam.W, cam.H), (i, j) => azulejos[j * N + i] || pedir(j * N + i));
        return;
      }
      if (cam.alvoZ < Z_PERTO) return;
      const P = cam.base * cam.alvoZ, a = cam.ancora, v = cam.voo, mw = cam.W / 2 / P, mh = cam.H / 2 / P;
      const x = a ? a.wx - (a.sx - cam.W / 2) / P : v ? v.x : cam.x, y = a ? a.wy - (a.sy - cam.H / 2) / P : v ? v.y : cam.y;
      cada(x - mw, y - mh, x + mw, y + mh, (i, j) => azulejos[j * N + i] || pedir(j * N + i));
    }
    // os azulejos da vista, desenhados sobre a camada de longe (o ctx já está na escala do mundo) a partir de 2x,
    // entrando e saindo numa transição de TROCA segundos
    function terreno(ctx, cam, dt) {
      desenhados = 0;
      if (!N) return;
      pedirVista(cam);
      const alvo = cam.P / cam.base >= Z_PERTO ? 1 : 0;
      cada(...cam.mundo(0, 0), ...cam.mundo(cam.W, cam.H), (i, j) => {
        const a = azulejos[j * N + i];
        if (!a || !a.pronto) return;
        a.alfa = reduzido ? alvo : alvo > a.alfa ? Math.min(alvo, a.alfa + dt / TROCA) : Math.max(alvo, a.alfa - dt / TROCA);
        if (a.alfa <= 0) return;
        ctx.globalAlpha = a.alfa;
        ctx.drawImage(a.img, i * LADO, j * LADO, LADO, LADO);
        desenhados++;
      });
      ctx.globalAlpha = 1;
    }

    // --- as UFs: lista, mapa (índice + 1 por pixel) e realce -------------------------------------------------------------
    const dadosUfs = nivel.ufs && typeof nivel.ufs === "object" ? nivel.ufs : {};
    const lista = (Array.isArray(dadosUfs.lista) ? dadosUfs.lista : [])
      .filter(u => u && typeof u.uf === "string" && numero(u.x) && numero(u.y))
      .map(u => ({ uf: u.uf, nome: String(u.nome || u.uf), capital: String(u.capital || ""),
        // onde o nome pode ir: o ponto mais fundo da UF e os de reserva, cada um com a profundidade (x, y, r)
        pontos: [[u.x, u.y, u.r || 1], ...(Array.isArray(u.outros) ? u.outros : [])]
          .filter(p => Array.isArray(p) && p.length === 3 && p.every(numero)).map(([x, y, r]) => [x + 0.5, y + 0.5, r]) }));
    const mapa = new Uint8Array(W * H);
    if (Array.isArray(dadosUfs.mapa)) dadosUfs.mapa.slice(0, H).forEach((linha, y) => {
      let x = 0;
      for (const [, letra, n] of String(linha).matchAll(/([.a-zA-Z])(\d+)/g)) {
        const k = letra === "." ? 0 : LETRAS.indexOf(letra) + 1;
        for (let q = 0; q < +n && x < W; q++, x++) mapa[y * W + x] = k <= lista.length ? k : 0;
      }
    });
    const porSigla = new Map(lista.map(u => [u.uf, u]));
    // a UF no ponto (x, y) do mundo, ou null
    function ufEm(x, y) {
      if (!(x >= 0 && y >= 0 && x < W && y < H)) return null;
      const k = mapa[Math.floor(y) * W + Math.floor(x)];
      return k ? lista[k - 1] : null;
    }
    // o realce de uma UF: o preenchimento (um canvas do tamanho do mapa, copiado na escala do mundo) e as beiradas em
    // trechos, para o contorno ter a mesma espessura em qualquer zoom; feito uma vez por UF
    const realces = new Map();
    function montarRealce(u) {
      const k = lista.indexOf(u) + 1, dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mapa[y * W + x] === k;
      const c = tela(W, H), g = c.getContext("2d"), bordas = [];
      g.fillStyle = "#fff8e6";
      for (let y = 0; y < H; y++) {
        let ini = -1;
        for (let x = 0; x <= W; x++) {
          const d = x < W && dentro(x, y);
          if (d && ini < 0) ini = x;
          if (!d && ini >= 0) { g.fillRect(ini, y, x - ini, 1); ini = -1; }
        }
      }
      // os trechos da beirada: horizontais (entre a linha y−1 e y) e verticais (entre a coluna x−1 e x), com o lado de dentro
      for (let y = 0; y <= H; y++) {
        let ini = -1, lado = 0;
        for (let x = 0; x <= W; x++) {
          const l = x < W ? (dentro(x, y) && !dentro(x, y - 1) ? 1 : !dentro(x, y) && dentro(x, y - 1) ? -1 : 0) : 0;
          if (l !== lado) { if (lado) bordas.push([false, ini, y, x - ini, lado]); ini = x; lado = l; }
        }
      }
      for (let x = 0; x <= W; x++) {
        let ini = -1, lado = 0;
        for (let y = 0; y <= H; y++) {
          const l = y < H ? (dentro(x, y) && !dentro(x - 1, y) ? 1 : !dentro(x, y) && dentro(x - 1, y) ? -1 : 0) : 0;
          if (l !== lado) { if (lado) bordas.push([true, x, ini, y - ini, lado]); ini = y; lado = l; }
        }
      }
      const r = { preenchido: c, bordas };
      realces.set(u.uf, r);
      return r;
    }
    // o realce na tela (o ctx em pixels da tela): o leve clareamento e o contorno, claro por dentro e escuro por fora
    function realce(ctx, cam, u, U) {
      if (!u) return;
      const r = realces.get(u.uf) || montarRealce(u), [ox, oy] = cam.origem(), P = cam.P;
      ctx.setTransform(P, 0, 0, P, ox, oy);
      ctx.globalAlpha = 0.2; ctx.drawImage(r.preenchido, 0, 0); ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const passo of [0, 1]) {   // o escuro por fora, depois o claro por dentro
        ctx.fillStyle = passo ? "#fff4dc" : "rgba(18,14,22,.8)";
        for (const [vertical, x, y, n, lado] of r.bordas) {   // (x, y): onde o trecho começa, em pixels do mapa
          const s = passo ? (lado > 0 ? 0 : -U) : (lado > 0 ? -U : 0);
          if (vertical) ctx.fillRect(Math.round(ox + x * P) + s, Math.round(oy + y * P), U, Math.round(n * P));
          else ctx.fillRect(Math.round(ox + x * P), Math.round(oy + y * P) + s, Math.round(n * P), U);
        }
      }
    }

    // --- nomes: estados (2x), vizinhos (sempre) e cidades médias (3x) --------------------------------------------------
    const medias = (Array.isArray(nivel.medias) ? nivel.medias : [])
      .filter(m => m && typeof m.nome === "string" && numero(m.x) && numero(m.y))
      .map(m => ({ nome: m.nome, uf: String(m.uf || ""), x: m.x + 0.5, y: m.y + 0.5 }));
    const paises = (Array.isArray(nivel.paises) ? nivel.paises : [])
      .filter(p => p && typeof p.nome === "string" && numero(p.x) && numero(p.y))
      .map(p => ({ nome: p.nome, x: p.x + 0.5, y: p.y + 0.5 }));
    const textos = new Map();
    // um texto em Silkscreen (8 px de CSS vezes T) com espaço entre as letras e contorno escuro, guardado
    function texto(s, T, cor, espaco) {
      const chave = s + "|" + T + "|" + cor + "|" + espaco;
      let c = textos.get(chave);
      if (c) return c;
      const fonte = `${8 * T}px Silkscreen, monospace`, medir = tela(1, 1).getContext("2d");
      medir.font = fonte;
      const largura = ch => ((medir.measureText(ch) || {}).width || 6 * T) + espaco * T;
      const w = Math.ceil([...s].reduce((t, ch) => t + largura(ch), -espaco * T)) + 2 * T;
      c = tela(w, 10 * T);
      const g = c.getContext("2d");
      g.font = fonte; g.textBaseline = "top";
      for (const [cor_, desvios] of [["#120e16", [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]], [cor, [[0, 0]]]]) {
        g.fillStyle = cor_;
        for (const [dx, dy] of desvios) {
          let x = T;
          for (const ch of s) { g.fillText(ch, x + dx * T, T + dy * T); x += largura(ch); }
        }
      }
      textos.set(chave, nitido(c));
      return c;
    }
    let arranjo = { chave: "", lista: [] };
    // onde cada nome cabe nesta vista (refeito só quando a vista ou o que já ocupa a tela mudam): os estados no meio da UF
    // (o nome inteiro se couber nela, senão a sigla), os vizinhos no miolo deles, as cidades médias com o marcador no
    // ponto e o nome à direita (ou à esquerda)
    function arranjar(cam, ocupar, chaveOcupados, T, U) {
      const z = cam.P / cam.base, [ox, oy] = cam.origem();
      const chave = ox + "," + oy + "," + cam.P + "," + cam.W + "," + cam.H + "," + T + "," + chaveOcupados;
      if (chave === arranjo.chave) return arranjo.lista;
      const ocupados = ocupar(), postos = [], tx = x => Math.round(ox + x * cam.P), ty = y => Math.round(oy + y * cam.P);
      const livre = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= cam.W && r.y + r.h <= cam.H &&
        !ocupados.some(o => cruza(o, r)) && !postos.some(o => cruza(o, r));
      const centrado = (tipo, id, c, x, y) => ({ tipo, id, c, x: tx(x) - (c.width >> 1), y: ty(y) - (c.height >> 1), w: c.width, h: c.height });
      if (z >= Z_PERTO) for (const u of lista) {   // no primeiro ponto livre da UF, o nome se couber na largura dela ali
        const inteiro = texto(u.nome.toUpperCase(), T, "#fff1d6", 2), sigla = texto(u.uf, T, "#fff1d6", 2);
        for (const [x, y, fundo] of u.pontos) {
          const r = centrado("estado", u.uf, inteiro.width <= 2.4 * fundo * cam.P ? inteiro : sigla, x, y);
          if (livre(r)) { postos.push(r); break; }
        }
      }
      for (const p of paises) {
        const r = centrado("pais", p.nome, texto(p.nome.toUpperCase(), T, "#e6dcc4", 3), p.x, p.y);
        if (livre(r)) postos.push(r);
      }
      if (z >= Z_MEDIAS) for (const m of medias) {
        const c = texto(m.nome, T, "#f6eed8", 0), M = 3 * U, mx = tx(m.x) - (M >> 1), my = ty(m.y) - (M >> 1);
        const marca = { tipo: "marca", id: m.nome, x: mx, y: my, w: M, h: M };
        if (!livre(marca)) continue;
        const lados = [mx + M + U, mx - U - c.width].map(x => ({ tipo: "media", id: m.nome, c, x, y: my + (M >> 1) - (c.height >> 1),
          w: c.width, h: c.height, marca }));
        const r = lados.find(l => livre(l));
        if (r) postos.push(marca, r);
      }
      arranjo = { chave, lista: postos };
      return postos;
    }
    // os nomes desta vista; devolve as caixas postas (os marcadores das médias entram como "marca"). ocupar(): as caixas
    // já ocupadas (ícones e nomes das capitais), pedidas só quando a chave delas muda
    function rotulos(ctx, cam, ocupar, chaveOcupados, { T, U, noite }) {
      const postos = arranjar(cam, ocupar, chaveOcupados, T, U);
      for (const r of postos) {
        if (r.tipo === "marca") {   // o marcador da cidade média: um quadradinho escuro com o miolo claro (aceso à noite)
          ctx.fillStyle = "#1d1712"; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = noite ? "#ffd977" : "#f3e7c4"; ctx.fillRect(r.x + U, r.y + U, r.w - 2 * U, r.h - 2 * U);
          continue;
        }
        ctx.globalAlpha = r.tipo === "estado" ? 0.85 : r.tipo === "pais" ? 0.6 : 1;
        ctx.drawImage(r.c, r.x, r.y);
      }
      ctx.globalAlpha = 1;
      return postos;
    }

    return { terreno, tentarDeNovo, ufEm, realce, rotulos, porSigla, get estados() { return lista; },
      get info() { return { pedidos, desenhados }; } };
  }
  return { criar, Z_PERTO, Z_MEDIAS };
})();
window.MapaPerto = MapaPerto;
