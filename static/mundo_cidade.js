// Cidade, o nível 3 do mundo: a cidade vista de cima, em três quartos, com a arte do PixelLab (static/mundo/atlas.png) e
// a planta de mundo_cidade_planta.js. Aqui ficam o desenho e a vida da rua:
// - o chão (grama, calçadas com meio-fio, asfalto, faixa tracejada e faixas de pedestre);
// - as peças pela profundidade (quem está mais abaixo desenha por cima): o marco no centro (ou os prédios genéricos,
//   quando a arte dele falta), chalés, prédios, a praça, árvores, mobiliário, o ônibus parado, postes e pedestres;
// - carros pela mão direita, girando o desenho (feito para o leste) conforme o sentido, e dando a volta fora da vista;
// - pedestres (os bonecos do escritório, avatar.js, na metade) andando pela rede de calçadas e faixas da planta.
// Só a cidade da casa tem o chalé com a placa, e só ele desce ao bairro ({ir: "bairro"}); placa e porta aparecem quando
// o desenho do chalé chega. O tempo vem pelo Clima (o mundo.js o define); a noite, pelo Ceu. Com movimento reduzido,
// carros e pedestres parados e nada de partículas. O atlas é pedido na primeira entrada numa cidade (e de novo se falhar).
"use strict";
const MundoCidade = (() => {
  const { W, H, E, C } = CidadePlanta, FAIXA = 8, B = E / 2 + C, MEIO_CARRO = 16, PLACA_H = 12, BONECO = 0.5;
  const CORES = { grama: "#5c9a4a", calcada: "#c9c3b3", meiofio: "#8f8a7d", praca: "#c8b88e", asfalto: "#3a3a42",
                  faixa: "#e9e3c9", zebra: "#dcd8cc" };
  const NEVE = { grama: "#e6edf4", calcada: "#d6dde7", meiofio: "#9aa3b0", praca: "#dfe5ee", asfalto: "#4a4c56",
                 faixa: "#f2f2f2", zebra: "#eef0f4" };
  const FECHADO = { nublado: 0.18, neblina: 0.25, garoa: 0.3, chuva: 0.4, tempestade: 0.6, neve: 0.15 };

  // carro pela mão direita: para o leste na faixa de baixo, para o sul na da esquerda
  const lugar = c => c.eixo === "h" ? [c.s, c.rua + c.dir * FAIXA] : [c.rua - c.dir * FAIXA, c.s];
  const giro = c => c.eixo === "h" ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const olhar = (dx, dy) => Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "dir" : "esq") : (dy > 0 ? "baixo" : "cima");

  // a placa "RECEPÇÃO" em Silkscreen, desenhada uma vez num canvas pequeno e passada a duas cores (sem suavização)
  function fazerPlaca() {
    const cv = document.createElement("canvas"), c = cv.getContext("2d"), FONTE = "8px Silkscreen, monospace", TEXTO = "RECEPÇÃO";
    c.font = FONTE;
    const m = c.measureText(TEXTO), w = Math.ceil((m && m.width) || 44) + 5;
    cv.width = w; cv.height = PLACA_H;
    c.font = FONTE; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = "#2a1d14"; c.fillRect(0, 0, w, PLACA_H);
    c.fillStyle = "#f2e6c8"; c.fillText(TEXTO, 3, 9);
    const img = c.getImageData(0, 0, w, PLACA_H), d = img && img.data;
    if (!d) return cv;
    for (let i = 0; i < d.length; i += 4) {
      const claro = d[i] > 0x8e;
      d[i] = claro ? 0xf2 : 0x2a; d[i + 1] = claro ? 0xe6 : 0x1d; d[i + 2] = claro ? 0xc8 : 0x14; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  function criar({ dados, Camera, reduzido, mapa, clima, avisar }) {
    const camera = Camera([0, 0, W, H]);
    const marcos = new Map((Array.isArray(dados && dados.cidades) ? dados.cidades : []).filter(c => c && typeof c.marco === "string").map(c => [c.id, c.marco]));
    let id = null, p = CidadePlanta.planta(""), carros = [], pedestres = [], pecas = [], rua = Math.random;
    let atlas = null, quadros = {}, pedido = false, placa = null, fonte = false;
    const lista = [], vista = [0, 0, W, H];

    function carregar() {   // o atlas, uma vez; se o json ou a imagem falharem, a próxima entrada tenta de novo
      if (pedido) return;
      pedido = true;
      fetch("/mundo/atlas.json", { credentials: "omit", cache: "no-cache" })
        .then(r => r.ok ? r.json() : null).catch(() => null)
        .then(d => {
          if (!d || !d.quadros || typeof d.quadros !== "object") { pedido = false; return; }
          const img = new Image();
          img.addEventListener("load", () => { quadros = d.quadros; atlas = img; if (avisar) avisar(); });
          img.addEventListener("error", () => { pedido = false; });
          img.src = "/mundo/atlas.png?v=" + (Number.isInteger(d.versao) ? d.versao : 0);
        });
    }
    function pedirPlaca() {   // espera a Silkscreen (a página já a declara) para desenhar a placa
      if (fonte) return;
      fonte = true;
      const fazer = () => { placa = fazerPlaca(); };
      if (document.fonts && document.fonts.load) document.fonts.load("8px Silkscreen").then(fazer, fazer); else fazer();
    }
    const recorte = nome => {
      const r = Object.prototype.hasOwnProperty.call(quadros, nome) ? quadros[nome] : null;
      return atlas && Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) ? r : null;
    };
    function peca(ctx, nome, x, y) {   // o pé do recorte em (x, y)
      const r = recorte(nome);
      if (r) ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3]), r[2], r[3]);
    }
    const ehCasa = () => !!id && mapa.casa === id;
    const portaPronta = () => ehCasa() && !!recorte(p.casa.peca);   // placa e porta só com o desenho do chalé
    const temMarco = () => marcos.has(id) && !!recorte("marco-" + marcos.get(id));
    function caixaCasa() {   // o chalé e a placa em cima dele: a área da porta
      const [, , w, h] = recorte(p.casa.peca) || [0, 0, 60, 57];
      return [p.casa.x - w / 2, p.casa.y - h - PLACA_H - 1, w, h + PLACA_H + 1];
    }
    function naCasa(x, y) { const [cx, cy, w, h] = caixaCasa(); return portaPronta() && x >= cx && x <= cx + w && y >= cy && y <= cy + h; }
    function alvoPorta() {
      const c = mapa.porId.get(id), [, , , h] = caixaCasa();
      return { id: "porta", x: p.casa.x, y: p.casa.y, alto: h * camera.P / camera.dpr, titulo: "Recepção",
               texto: "Chalé do escritório · descer ao bairro", rotulo: `Chalé com a placa, o escritório em ${c ? c.nome : "esta cidade"}: descer ao bairro`,
               acao: { ir: "bairro", cidade: id } };
    }

    function medirVista() {   // a parte do mundo na tela, [x0, y0, x1, y1]
      const [x0, y0] = camera.mundo(0, 0), [x1, y1] = camera.mundo(camera.W, camera.H);
      vista[0] = x0; vista[1] = y0; vista[2] = x1; vista[3] = y1;
    }
    function mover(dt) {
      for (const c of carros) {   // a volta acontece fora da caixa e fora da vista, com o carro inteiro escondido
        if (!reduzido && dt > 0) {
          const h = c.eixo === "h", lo = Math.min(0, vista[h ? 0 : 1]) - MEIO_CARRO, hi = Math.max(h ? W : H, vista[h ? 2 : 3]) + MEIO_CARRO;
          c.s += c.dir * c.v * dt;
          if (c.s > hi) c.s = lo; else if (c.s < lo) c.s = hi;
        }
        [c.x, c.y] = lugar(c);
      }
      const { nos, viz, peso } = p.rede;
      for (const a of pedestres) {   // de canto em canto; no canto, segue por outra calçada ou atravessa na faixa, sem voltar
        if (!reduzido) a.s += a.v * dt;
        let [x0, y0] = nos[a.de], [x1, y1] = nos[a.para], L = Math.hypot(x1 - x0, y1 - y0);
        while (a.s >= L) {
          a.s -= L;
          const opcoes = viz[a.para].filter(n => n !== a.de);
          let sorte = rua() * opcoes.reduce((t, n) => t + peso[n], 0), prox = a.de;
          for (const n of opcoes) { prox = n; if ((sorte -= peso[n]) < 0) break; }
          a.de = a.para; a.para = prox;
          [x0, y0] = nos[a.de]; [x1, y1] = nos[a.para]; L = Math.hypot(x1 - x0, y1 - y0);
        }
        const k = a.s / L;
        a.x = x0 + (x1 - x0) * k; a.y = y0 + (y1 - y0) * k;
        a.b.x = Math.round(a.x / BONECO); a.b.y = Math.round(a.y / BONECO); a.b.olha = olhar(x1 - x0, y1 - y0);
      }
    }
    const naVista = (x0, y0, x1, y1) => x1 >= vista[0] && x0 <= vista[2] && y1 >= vista[1] && y0 <= vista[3];
    function chao(ctx, cor) {   // grama, quadras com calçada e meio-fio, asfalto, faixa do meio e faixas de pedestre
      const { v, h } = p.ruas, X0 = v[0], X1 = v[v.length - 1], Y0 = h[0], Y1 = h[h.length - 1];
      ctx.fillStyle = cor.grama; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      for (const q of p.quadras) {
        if (!naVista(q.x0, q.y0, q.x1, q.y1)) continue;
        ctx.fillStyle = cor.meiofio; ctx.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
        ctx.fillStyle = cor.calcada; ctx.fillRect(q.x0 + 1, q.y0 + 1, q.x1 - q.x0 - 2, q.y1 - q.y0 - 2);
        ctx.fillStyle = q.centro ? cor.praca : cor.grama; ctx.fillRect(q.x0 + C, q.y0 + C, q.x1 - q.x0 - 2 * C, q.y1 - q.y0 - 2 * C);
      }
      ctx.fillStyle = cor.asfalto;
      for (const x of v) ctx.fillRect(x - E / 2, Y0, E, Y1 - Y0);
      for (const y of h) ctx.fillRect(X0, y - E / 2, X1 - X0, E);
      ctx.fillStyle = cor.faixa;   // o tracejado do meio para antes das faixas de pedestre
      const longe = (u, ruas) => ruas.every(r => Math.abs(u - r) > B + 2);
      const [vx0, vy0, vx1, vy1] = vista;
      for (const y of h) if (y > vy0 - E && y < vy1 + E) {
        for (let x = Math.floor(vx0 / 16) * 16; x < vx1; x += 16) if (longe(x, v) && longe(x + 8, v)) ctx.fillRect(x, y - 1, 8, 2);
      }
      for (const x of v) if (x > vx0 - E && x < vx1 + E) {
        for (let y = Math.floor(vy0 / 16) * 16; y < vy1; y += 16) if (longe(y, h) && longe(y + 8, h)) ctx.fillRect(x - 1, y, 2, 8);
      }
      ctx.fillStyle = cor.zebra;   // faixas de pedestre: listras na largura da calçada, dos quatro lados do cruzamento
      for (const x of v) for (const y of h) {
        if (!naVista(x - B, y - B, x + B, y + B)) continue;
        for (let u = -E / 2 + 2; u < E / 2 - 1; u += 4) {
          ctx.fillRect(x + u, y - B + 1, 2, C - 2); ctx.fillRect(x + u, y + E / 2 + 1, 2, C - 2);
          ctx.fillRect(x - B + 1, y + u, C - 2, 2); ctx.fillRect(x + E / 2 + 1, y + u, C - 2, 2);
        }
      }
    }
    function brilho(ctx, x, y, r, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,214,130,${a})`); g.addColorStop(1, "rgba(255,190,90,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function desenhar(ctx, s, t, casa) {
      if (s.ped) { if (window.Avatar) Avatar.boneco(ctx, s.b, t, BONECO); return; }
      if (s.poste) { ctx.fillStyle = "#2a2a30"; ctx.fillRect(s.x, s.y - 7, 1, 7); ctx.fillRect(s.x - 1, s.y - 8, 3, 1); return; }
      let nome = s.peca;
      if (s === p.casa) nome = casa ? p.casa.peca : p.casa.arvore;   // fora da casa, a vaga dela tem uma árvore
      else if (s === p.centro && temMarco()) nome = "marco-" + marcos.get(id);
      peca(ctx, nome, s.x, s.y);
    }

    function quadro(ctx, dt, t) {
      const ceu = Ceu.agora(), escuro = Math.max(0, Math.min(1, ceu.escuro || 0)), tipo = Clima.tipo(), casa = portaPronta();
      medirVista();
      mover(dt);
      chao(ctx, tipo === "neve" ? NEVE : CORES);
      if (atlas) for (const c of carros) {   // os carros no chão, por baixo das construções (o atlas já os traz na escala)
        const r = recorte(c.peca);
        if (!r || !naVista(c.x - MEIO_CARRO, c.y - MEIO_CARRO, c.x + MEIO_CARRO, c.y + MEIO_CARRO)) continue;
        ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.rotate(giro(c));
        ctx.drawImage(atlas, r[0], r[1], r[2], r[3], -Math.round(r[2] / 2), -Math.round(r[3] / 2), r[2], r[3]);
        ctx.restore();
      }
      lista.length = 0;   // as peças na tela (os desenhos sobem até ~130 acima do pé), pela profundidade
      for (const s of pecas) if (naVista(s.x - 70, s.y - 130, s.x + 70, s.y + 4)) lista.push(s);
      if (atlas) for (const a of pedestres) if (naVista(a.x - 8, a.y - 14, a.x + 8, a.y + 2)) lista.push(a);
      lista.sort((a, b) => a.y - b.y || a.x - b.x);
      if (atlas) for (const s of lista) desenhar(ctx, s, t, casa);
      const [vx0, vy0, vx1, vy1] = vista, tela = [Math.floor(vx0), Math.floor(vy0), Math.ceil(vx1 - vx0) + 1, Math.ceil(vy1 - vy0) + 1];
      if (FECHADO[tipo]) { ctx.fillStyle = `rgba(62,68,86,${FECHADO[tipo] * 0.6})`; ctx.fillRect(...tela); }
      ctx.globalAlpha = 0.1; ctx.fillStyle = ceu.cima; ctx.fillRect(...tela); ctx.globalAlpha = 1;   // o tom do céu
      if (escuro > 0) { ctx.fillStyle = `rgba(6,10,34,${escuro * 0.62})`; ctx.fillRect(...tela); }
      const [cx, cy, cw] = caixaCasa();
      if (casa) {   // a placa do escritório, por cima da noite (acesa)
        if (placa) ctx.drawImage(placa, Math.round(p.casa.x - placa.width / 2), Math.round(cy));
        else pedirPlaca();
      }
      if (escuro > 0.05) {   // à noite: postes, janelas, faróis e a casa acesos
        ctx.globalCompositeOperation = "lighter";
        for (const s of lista) {
          if (s.poste) brilho(ctx, s.x + 0.5, s.y - 7, 16, 0.45 * escuro);
          else if (s.peca && s.peca.startsWith("chale-") && s !== p.casa) brilho(ctx, s.x, s.y - 18, 12, 0.35 * escuro);
          else if (s.peca === "banco-poste-1") brilho(ctx, s.x - 6, s.y - 22, 12, 0.45 * escuro);   // o lampião do banco
        }
        if (casa) brilho(ctx, p.casa.x, p.casa.y - 18, 22, 0.55 * escuro);
        for (const c of carros) { const a = giro(c); brilho(ctx, c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 14, 9, 0.5 * escuro); }
        ctx.globalCompositeOperation = "source-over";
      }
      if (!reduzido) {   // chuva, neve, neblina e raio do Clima, sobre a parte da cidade que está na tela
        const som = window.Som && Som.ligado ? Som : null;
        ctx.save(); ctx.translate(tela[0], tela[1]);
        Clima.desenhar(ctx, { W: tela[2], H: tela[3], predioRet: { x: -10, y: -10, w: 0, h: 0 }, ceu: false }, dt, t, som);
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
        id = params.cidade; p = CidadePlanta.planta(id); rua = CidadePlanta.sorteio(id + ":rua");
        carros = p.carros.map(c => ({ ...c }));
        pedestres = p.pedestres.map((a, i) => {   // b: o boneco do avatar.js, com a aparência da semente local
          const ap = window.Avatar ? Avatar.padrao(a.semente) : null;
          return { ...a, ped: true, x: 0, y: 0, b: { x: 0, y: 0, ap, pose: reduzido ? "parado" : "andando", olha: "baixo", semente: i * 7 } };
        });
        pecas = [p.centro, ...p.predios, p.praca, ...p.chales, ...p.arvores, ...p.mobiliario, p.onibus, p.casa, ...p.arredores,
                 ...p.postes.map(([x, y]) => ({ x, y, poste: true }))];
        camera.vx = camera.vy = 0; camera.voo = camera.ancora = null;
        if (params.nivel === "bairro" && ehCasa() && !reduzido) {   // voltando do bairro, a câmera sai de perto da casa
          camera.x = p.casa.x; camera.y = p.casa.y - 28; camera.z = 4; camera.zoomPara(1);
        } else { camera.x = W / 2; camera.y = H / 2; camera.z = camera.alvoZ = 1; }
        camera.limitar();
        medirVista(); mover(0); carregar(); clima();
      },
      sair() { cidade.destaque = null; },
      quadro,
      clique(x, y) { return naCasa(x, y) ? alvoPorta().acao : null; },
      sobre(x, y) { return naCasa(x, y) ? alvoPorta() : null; },
      alvos() { return portaPronta() ? [alvoPorta()] : []; },
      mergulho() { return ehCasa() ? [p.casa.x, p.casa.y - 28] : [W / 2, H / 2]; },
      rotulo() {
        const c = mapa.porId.get(id);
        return `${c ? c.nome : "Cidade"} vista de cima em pixel art, com ${temMarco() ? "o marco da cidade" : "prédios"} no centro, ` +
          `quadras com chalés, prédios e uma praça, pedestres nas calçadas, carros nas ruas e o tempo de agora` +
          (portaPronta() ? ", e o chalé do escritório com a placa" : "");
      },
      get carros() { return carros.map(c => [c.x, c.y]); },
      get pedestres() { return pedestres.map(a => [a.x, a.y]); },
    };
    return cidade;
  }
  return { criar, planta: CidadePlanta.planta, W, H };
})();
window.MundoCidade = MundoCidade;
