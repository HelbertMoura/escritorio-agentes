// Mundo dos escritórios: orquestra os níveis (Brasil → Cidade → Bairro; o globo chega depois), a câmera e a entrada.
// Nível: {entrar(params), sair(), quadro(ctx, dt, t), clique(x, y) -> ação | null, camera}, com sobre(x, y) e alvos()
// opcionais (a dica do mouse e os botões de teclado). Ação: {ir: "globo" | "brasil" | "cidade" | "bairro", cidade?: id}.
// O endereço guarda o nível (#brasil, #cidade=<id>, #bairro). O convite que vier no fragmento sai da barra na hora e
// segue só pela porta do chalé, como antes. O tempo das cidades vem de POST /api/mundo/clima ao abrir e a cada 15 min.
"use strict";
const Mundo = (() => {
  // Câmera de um nível: centro (x, y) no mundo e zoom z de 1x a 4x sobre a escala base, a maior escala inteira em que a
  // caixa do nível cabe inteira na tela. Parada, a escala final (base·z) é inteira e a origem cai em pixel inteiro.
  function Camera(caixa) {
    const MIN = 1, MAX = 4, prender = z => Math.min(MAX, Math.max(MIN, z));
    const c = {
      caixa, x: (caixa[0] + caixa[2]) / 2, y: (caixa[1] + caixa[3]) / 2, z: 1, alvoZ: 1, W: 1, H: 1, dpr: 1, base: 1,
      vx: 0, vy: 0, ancora: null, voo: null,
      get P() { const p = c.base * c.z, r = Math.round(p); return Math.abs(p - r) < 1e-6 ? r : p; },
      tamanho(W, H, dpr) { c.W = Math.max(1, W); c.H = Math.max(1, H); c.dpr = dpr || 1; return c.limitar(); },
      // prende o zoom (1x a 4x) e o centro, para a vista não sair da caixa; maior que a caixa, a vista fica no meio
      limitar(nova) {
        if (nova) c.caixa = nova;
        const [x0, y0, x1, y1] = c.caixa;
        c.base = Math.max(1, Math.floor(Math.min(c.W / (x1 - x0), c.H / (y1 - y0))));   // a 1x a caixa cabe inteira
        c.z = prender(Number.isFinite(c.z) ? c.z : 1); c.alvoZ = prender(Number.isFinite(c.alvoZ) ? c.alvoZ : 1);
        const mw = c.W / 2 / c.P, mh = c.H / 2 / c.P;
        c.x = mw * 2 >= x1 - x0 || !Number.isFinite(c.x) ? (x0 + x1) / 2 : Math.min(x1 - mw, Math.max(x0 + mw, c.x));
        c.y = mh * 2 >= y1 - y0 || !Number.isFinite(c.y) ? (y0 + y1) / 2 : Math.min(y1 - mh, Math.max(y0 + mh, c.y));
        return c;
      },
      origem() { return [Math.round(c.W / 2 - c.x * c.P), Math.round(c.H / 2 - c.y * c.P)]; },
      tela(x, y) { const [ox, oy] = c.origem(); return [ox + x * c.P, oy + y * c.P]; },
      mundo(sx, sy) { const [ox, oy] = c.origem(); return [(sx - ox) / c.P, (sy - oy) / c.P]; },
      arrastar(dx, dy) { c.x -= dx / c.P; c.y -= dy / c.P; c.voo = c.ancora = null; return c.limitar(); },
      // zoom até z (arredondado para escala inteira), com o ponto (sx, sy) da tela parado
      zoomPara(z, sx, sy) {
        c.alvoZ = prender(Math.round(c.base * z) / c.base);
        if (sx != null) { const [wx, wy] = c.mundo(sx, sy); c.ancora = { sx, sy, wx, wy }; c.voo = null; } else c.ancora = null;
      },
      passoZoom(sinal, sx = c.W / 2, sy = c.H / 2) {
        const p = Math.round(c.base * c.alvoZ), q = sinal > 0 ? Math.max(p + 1, Math.round(p * 1.5)) : Math.min(p - 1, Math.round(p / 1.5));
        c.zoomPara(q / c.base, sx, sy);
      },
      voar(x, y, z) { c.voo = { x, y }; c.ancora = null; c.vx = c.vy = 0; if (z != null) c.alvoZ = prender(Math.round(c.base * z) / c.base); },
      passo(dt, imediato) {
        const k = imediato ? 1 : 1 - Math.exp(-dt * 12), x = c.x, y = c.y;
        if (c.vx || c.vy) {   // inércia do arraste
          c.x += c.vx * dt; c.y += c.vy * dt;
          const f = Math.exp(-dt * 4); c.vx *= f; c.vy *= f;
          if (Math.hypot(c.vx, c.vy) * c.P < 8) c.vx = c.vy = 0;
        }
        if (c.z !== c.alvoZ) { c.z += (c.alvoZ - c.z) * k; if (Math.abs(c.alvoZ - c.z) * c.base < 0.01) c.z = c.alvoZ; }
        if (c.ancora) { const a = c.ancora; c.x = a.wx - (a.sx - c.W / 2) / c.P; c.y = a.wy - (a.sy - c.H / 2) / c.P; if (c.z === c.alvoZ) c.ancora = null; }
        if (c.voo) { c.x += (c.voo.x - c.x) * k; c.y += (c.voo.y - c.y) * k; }
        c.limitar();
        if (c.voo && Math.hypot(c.x - x, c.y - y) * c.P < 0.05 && c.z === c.alvoZ) c.voo = null;   // chegou (ou bateu na borda)
      },
    };
    return c;
  }

  const canvas = document.getElementById("mundo");
  if (!canvas) return { Camera };
  const ctx = canvas.getContext("2d"), $ = id => document.getElementById(id);
  const estado = $("mundo-estado"), botaoEntrar = $("entrar"), voltar = $("mundo-voltar"), caixaAlvos = $("mundo-alvos"), dica = $("mundo-dica");
  const reduzido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const ORDEM = ["globo", "brasil", "cidade", "bairro"], ACIMA = { bairro: "cidade", cidade: "brasil" };   // o globo fica acima do Brasil na Tarefa 5
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], FUNDO = "#0b0d12";

  // o convite, se veio no link, sai da barra já e segue só pela porta do chalé
  const convite = /^[A-Za-z0-9_-]{43}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : "";
  const pedido = convite ? "" : location.hash;
  if (convite) history.replaceState(null, "", location.pathname + location.search);
  const entrar = () => { location.href = "/visita.html" + (convite ? "#" + convite : ""); };
  botaoEntrar.addEventListener("click", entrar);
  botaoEntrar.textContent = convite ? "Entrar com convite" : "Entrar na recepção";

  let W = 0, H = 0, dpr = 1, mapa = null, nome = null, nivel = null, atualCidade = null, ultimaCidade = null, trans = null;
  let botoes = [], chaveAlvos = "", dicaAlvo = null, anterior = performance.now(), pedido_ = false, gesto = null, roda = 0;
  const niveis = { bairro: nivelBairro() }, toques = new Map();

  // o bairro de hoje, desenhado 1:1 num quadro de 320x180 e ampliado inteiro: o mesmo pixel art de antes
  function nivelBairro() {
    const cena = MundoBairro.cena(entrar, { reduzido }), camera = Camera([0, 0, MundoBairro.W, MundoBairro.H]), p = cena.porta;
    const quadro = document.createElement("canvas"); quadro.width = MundoBairro.W; quadro.height = MundoBairro.H;
    const qctx = quadro.getContext("2d");
    const porta = { id: "porta", x: p.x + p.w / 2, y: p.y + p.h / 2, alto: 0, titulo: "Recepção",
      texto: convite ? "Entrar com convite" : "Entrar na recepção", rotulo: "Porta do chalé com a placa: entrar na recepção" };
    return {
      nome: "bairro", camera,
      entrar() { climaDoBairro(); }, sair() {},
      quadro(c, dt, t) { qctx.imageSmoothingEnabled = false; cena.quadro(qctx, dt, t); c.drawImage(quadro, 0, 0); },
      clique(x, y) { cena.clique(x, y); return null; },
      sobre(x, y) { return cena.sobre(x, y) ? porta : null; },
      alvos() { return [porta]; },
    };
  }
  function climaDoBairro() {   // o bairro chove como a cidade dele (o vento público vai de 0 a 1, o Clima conta em km/h)
    const c = mapa && atualCidade && mapa.porId.get(atualCidade);
    Clima.definir(c ? { tipo: c.tempo.tipo, vento: Math.round(c.tempo.vento * 50) } : null);
  }

  function ler(h) {
    const s = String(h || "").replace(/^#/, ""), m = /^cidade=([a-z0-9-]{1,40})$/.exec(s);
    return s === "bairro" ? { ir: "bairro" } : m ? { ir: "cidade", cidade: m[1] } : { ir: "brasil" };
  }
  function normalizar(a) {   // a ação pedida vira um nível que existe; cidade fora da lista cai no Brasil
    if (!mapa) return { ir: "bairro", cidade: null };
    let ir = a.ir === "globo" ? "brasil" : a.ir, id = a.cidade;
    if (ir === "cidade" && !mapa.porId.has(id)) ir = "brasil";
    if (ir === "bairro") id = mapa.porId.has(id) ? id : ultimaCidade || mapa.casa || null;
    if (!niveis[ir]) ir = "brasil";
    return { ir, cidade: ir === "brasil" ? null : id };
  }
  function endereco(a, substituir) {
    const h = a.ir === "cidade" ? "#cidade=" + a.cidade : "#" + a.ir;
    if (location.hash === h) return;
    if (substituir) history.replaceState(null, "", location.pathname + location.search + h); else location.hash = h;
  }
  function ir(alvo, params = {}, opcoes = {}) {
    if (trans && trans.fase === 0) return;
    trans = null;
    const a = normalizar({ ...params, ir: alvo });
    if (nivel && a.ir === nome && a.cidade === atualCidade) return endereco(a, opcoes.substituir);
    if (!nivel || reduzido || opcoes.instantaneo) return trocar(a, opcoes);
    const cam = nivel.camera, c = a.cidade && mapa && mapa.porId.get(a.cidade);
    if (ORDEM.indexOf(a.ir) > ORDEM.indexOf(nome)) {   // descendo: mergulha na cidade (ou no meio da tela)
      if (nome === "brasil" && c) cam.voar(c.x, c.y, 4);
      else if (c) cam.zoomPara(4, ...cam.tela(c.x, c.y));
    } else cam.zoomPara(1, cam.W / 2, cam.H / 2);
    trans = { fase: 0, k: 0, a, opcoes };
  }
  function trocar(a, opcoes = {}) {
    const deCidade = atualCidade;
    if (nivel) nivel.sair();
    nome = a.ir; nivel = niveis[nome]; atualCidade = a.cidade || null;
    if (atualCidade) ultimaCidade = atualCidade;
    nivel.camera.tamanho(W, H, dpr);
    nivel.entrar({ cidade: atualCidade, de: deCidade });
    endereco(a, opcoes.substituir);
    voltar.disabled = !ACIMA[nome];
    const c = atualCidade && mapa && mapa.porId.get(atualCidade);
    canvas.setAttribute("aria-label", nome === "brasil"
      ? "Mapa do Brasil em pixel art com as capitais e Mateus Leme, o tempo de agora em cada uma, aviões nas rotas e a noite pelo horário"
      : nome === "cidade" ? `Vista de perto de ${c.nome} no mapa, com o tempo de agora`
      : "Bairro com o chalé deste escritório, rua, pessoas, cachorro, carro e céu do horário atual");
    montarAlvos(); destacar(null); mostrar();
  }
  function subir() { if (nivel && ACIMA[nome]) ir(ACIMA[nome], { cidade: atualCidade }); }
  function executar(a) { if (a && a.ir) ir(a.ir, a); }

  function mostrar() {
    const hora = Ceu.agora().hora, c = atualCidade && mapa && mapa.porId.get(atualCidade);
    if (!mapa) estado.textContent = `${hora} · ${Clima.texto()} · O mapa não abriu agora; o bairro e a recepção seguem aqui.`;
    else if (nome === "brasil") {
      const casa = mapa.casa && mapa.porId.get(mapa.casa);
      estado.textContent = `Brasil, ${hora}. Escolha uma cidade no mapa.${casa ? ` O escritório fica em ${casa.nome}.` : ""}`;
    } else if (nome === "cidade") estado.textContent = `${c.nome} (${c.uf}), ${mapa.texto(c)}. Clique no mapa para descer ao bairro.`;
    else estado.textContent = `${hora} · ${Clima.texto()}${c ? " · " + c.nome : ""}`;
  }

  // botões invisíveis sobre as cidades (e a porta): Tab passa por eles, Enter escolhe, o foco mostra a dica
  function montarAlvos() {
    const lista = nivel && nivel.alvos ? nivel.alvos() : [];
    if (botoes.length === lista.length && botoes.every(([, a], i) => a.id === lista[i].id)) {
      botoes.forEach((b, i) => { b[1] = lista[i]; b[0].setAttribute("aria-label", lista[i].rotulo); });
    } else {
      caixaAlvos.replaceChildren();
      botoes = lista.map(a => {
        const b = document.createElement("button"), par = [b, a];
        b.type = "button"; b.className = "mundo-alvo"; b.setAttribute("aria-label", a.rotulo);
        b.addEventListener("click", () => { if (!trans) par[1].acao ? executar(par[1].acao) : executar(nivel.clique(par[1].x, par[1].y)); });
        b.addEventListener("focus", () => { destacar(par[1]); verAlvo(par[1]); });
        b.addEventListener("blur", () => destacar(null));
        caixaAlvos.appendChild(b);
        return par;
      });
    }
    chaveAlvos = "";
  }
  function verAlvo(a) {   // com o teclado, a câmera vai até a cidade que estiver fora da vista
    const cam = nivel.camera, [x, y] = cam.tela(a.x, a.y), m = 40 * dpr;
    if (x < m || y < m || x > W - m || y > H - m) cam.voar(a.x, a.y);
  }
  function destacar(a) {
    if (nivel) nivel.destaque = a ? a.id : null;
    dicaAlvo = a;
    if (!a) { dica.hidden = true; return; }
    const forte = document.createElement("strong"), texto = document.createElement("span");
    forte.textContent = a.titulo; texto.textContent = a.texto;
    dica.replaceChildren(forte, texto); dica.hidden = false; chaveAlvos = "";
  }
  function posicionar() {   // botões e dica acompanham a câmera (só quando ela mexe)
    const cam = nivel.camera, chave = cam.origem().join() + "," + cam.P + "," + W + "," + H;
    if (chave === chaveAlvos) return;
    chaveAlvos = chave;
    for (const [b, a] of botoes) { const [x, y] = cam.tela(a.x, a.y); b.style.transform = `translate(${x / dpr}px, ${y / dpr - a.alto / 2}px)`; }
    if (dicaAlvo) { const [x, y] = cam.tela(dicaAlvo.x, dicaAlvo.y); dica.style.transform = `translate(${x / dpr}px, ${y / dpr - dicaAlvo.alto}px)`; }
  }

  function medir() {
    const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (w === W && h === H && d === dpr) return;
    W = w; H = h; dpr = d; canvas.width = W; canvas.height = H; chaveAlvos = "";
    for (const n of Object.values(niveis)) n.camera.tamanho(W, H, dpr);
  }
  function cortina(k) {   // transição em pontilhado (Bayer 4x4) de blocos inteiros: fecha e abre sem borrão
    if (k <= 0) return;
    const b = Math.max(4, Math.round(8 * dpr)), limite = k * 16;
    ctx.fillStyle = FUNDO; ctx.beginPath();
    for (let j = 0; j * b < H; j++) for (let i = 0; i * b < W; i++) if (BAYER[(j & 3) * 4 + (i & 3)] < limite) ctx.rect(i * b, j * b, b, b);
    ctx.fill();
  }
  function quadro(t) {
    pedido_ = false;
    if (document.hidden) return;   // aba escondida: nada de quadro; o visibilitychange retoma
    const dt = Math.min(0.1, Math.max(0, (t - anterior) / 1000));
    anterior = t;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = FUNDO; ctx.fillRect(0, 0, W, H);
    if (nivel) {
      if (trans && (trans.k += dt / 0.24) >= 1) {
        if (trans.fase === 0) { const { a, opcoes } = trans; trans = null; trocar(a, opcoes); trans = { fase: 1, k: 0 }; } else trans = null;
      }
      const cam = nivel.camera;
      cam.passo(dt, reduzido);
      const [ox, oy] = cam.origem();
      ctx.setTransform(cam.P, 0, 0, cam.P, ox, oy);
      nivel.quadro(ctx, dt, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (trans) cortina(trans.fase === 0 ? trans.k : 1 - trans.k);
      posicionar();
    }
    pedir();
  }
  function pedir() { if (!pedido_ && !document.hidden) { pedido_ = true; requestAnimationFrame(quadro); } }

  // entrada: arrastar (com inércia), pinça, roda, duplo clique, botões e teclado
  function ponto(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * W / (r.width || 1), (ev.clientY - r.top) * H / (r.height || 1)];
  }
  function clicar(sx, sy) { if (nivel && !trans) executar(nivel.clique(...nivel.camera.mundo(sx, sy))); }
  function dois() { const [[ax, ay], [bx, by]] = [...toques.values()]; return [Math.hypot(ax - bx, ay - by) || 1, (ax + bx) / 2, (ay + by) / 2]; }
  canvas.addEventListener("pointerdown", ev => {
    if (!nivel || ev.button > 0) return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(ev.pointerId);
    const [x, y] = ponto(ev), cam = nivel.camera;
    toques.set(ev.pointerId, [x, y]);
    cam.vx = cam.vy = 0; cam.voo = cam.ancora = null;
    if (toques.size === 1) gesto = { x0: x, y0: y, x, y, moveu: false, t: performance.now(), vx: 0, vy: 0, pinca: null };
    else if (toques.size === 2 && gesto) { const [d, mx, my] = dois(), [wx, wy] = cam.mundo(mx, my); gesto.pinca = { d, z: cam.z, wx, wy }; gesto.moveu = true; }
  });
  canvas.addEventListener("pointermove", ev => {
    const [x, y] = ponto(ev);
    if (!toques.has(ev.pointerId)) {   // passando o mouse: dica e cursor
      if (!nivel || !nivel.sobre || trans) return;
      const a = nivel.sobre(...nivel.camera.mundo(x, y));
      canvas.style.cursor = a ? "pointer" : "grab";
      if ((a && a.id) !== (dicaAlvo && dicaAlvo.id)) destacar(a);
      return;
    }
    toques.set(ev.pointerId, [x, y]);
    const cam = nivel.camera;
    if (gesto.pinca && toques.size >= 2) {
      const [d, mx, my] = dois(), p = gesto.pinca;
      cam.z = cam.alvoZ = Math.min(4, Math.max(1, p.z * d / p.d));
      cam.x = p.wx - (mx - W / 2) / cam.P; cam.y = p.wy - (my - H / 2) / cam.P; cam.limitar();
      return;
    }
    if (toques.size > 1) return;
    if (!gesto.moveu && Math.hypot(x - gesto.x0, y - gesto.y0) < 6 * dpr) return;   // tremida do dedo ainda é clique
    if (!gesto.moveu) { gesto.moveu = true; canvas.style.cursor = "grabbing"; destacar(null); }
    const agora = performance.now(), dtm = Math.max(8, agora - gesto.t) / 1000, max = 3000 / cam.P;
    cam.arrastar(x - gesto.x, y - gesto.y);
    gesto.vx = Math.max(-max, Math.min(max, 0.7 * (-(x - gesto.x) / cam.P / dtm) + 0.3 * gesto.vx));
    gesto.vy = Math.max(-max, Math.min(max, 0.7 * (-(y - gesto.y) / cam.P / dtm) + 0.3 * gesto.vy));
    gesto.x = x; gesto.y = y; gesto.t = agora;
  });
  function soltar(ev, cancelado) {
    if (!toques.delete(ev.pointerId) || !gesto) return;
    const cam = nivel.camera;
    if (toques.size === 1) {   // largou um dedo da pinça: o outro segue arrastando
      const [[x, y]] = [...toques.values()];
      Object.assign(gesto, { x, y, pinca: null, t: performance.now(), vx: 0, vy: 0 });
      cam.zoomPara(cam.z);
      return;
    }
    if (toques.size) return;
    if (!gesto.moveu && !cancelado) clicar(gesto.x0, gesto.y0);
    else if (gesto.pinca) cam.zoomPara(cam.z, W / 2, H / 2);
    else if (!reduzido && !cancelado && performance.now() - gesto.t < 90) { cam.vx = gesto.vx; cam.vy = gesto.vy; }
    gesto = null; canvas.style.cursor = "grab";
  }
  canvas.addEventListener("pointerup", ev => soltar(ev, false));
  canvas.addEventListener("pointercancel", ev => soltar(ev, true));
  canvas.addEventListener("pointerleave", () => { if (!gesto) destacar(null); });
  canvas.addEventListener("wheel", ev => {
    if (!nivel || trans) return;
    ev.preventDefault();
    roda += ev.deltaY * (ev.deltaMode === 1 ? 40 : 1);
    if (Math.abs(roda) < 50) return;
    nivel.camera.passoZoom(roda < 0 ? 1 : -1, ...ponto(ev)); roda = 0;
  }, { passive: false });
  canvas.addEventListener("dblclick", ev => { if (nivel && !trans) nivel.camera.passoZoom(1, ...ponto(ev)); });
  $("mundo-mais").addEventListener("click", () => { if (nivel) nivel.camera.passoZoom(1); });
  $("mundo-menos").addEventListener("click", () => { if (nivel) nivel.camera.passoZoom(-1); });
  voltar.addEventListener("click", subir);
  window.addEventListener("keydown", ev => {
    const alvo = ev.target, campo = alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || "");
    if (!nivel || campo || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const cam = nivel.camera, d = 80 * dpr / cam.P, noMapa = alvo === canvas || caixaAlvos.contains(alvo) || alvo === document.body;
    const acoes = { Escape: subir, "+": () => cam.passoZoom(1), "=": () => cam.passoZoom(1), "-": () => cam.passoZoom(-1), _: () => cam.passoZoom(-1),
      ArrowLeft: () => cam.voar(cam.x - d, cam.y), ArrowRight: () => cam.voar(cam.x + d, cam.y),
      ArrowUp: () => cam.voar(cam.x, cam.y - d), ArrowDown: () => cam.voar(cam.x, cam.y + d) };
    if (!acoes[ev.key] || (ev.key.startsWith("Arrow") && !noMapa)) return;   // setas fora do mapa seguem rolando a página
    ev.preventDefault(); acoes[ev.key]();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { anterior = performance.now(); pedir(); } });
  window.addEventListener("hashchange", () => { if (nivel) { const a = ler(location.hash); ir(a.ir, a, { substituir: true }); } });
  if (window.ResizeObserver) new ResizeObserver(medir).observe(canvas); else window.addEventListener("resize", medir);
  medir();
  pedir();

  function pedirClima() {   // só tipo, vento e noite por cidade; sem cookie, com o limite das rotas públicas
    fetch("/api/mundo/clima", { method: "POST", credentials: "omit", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => {
        if (mapa) mapa.clima(d);
        if (nome === "bairro" && !atualCidade && mapa && mapa.casa) atualCidade = ultimaCidade = mapa.casa;   // #bairro direto: o da casa
        if (nome === "bairro") climaDoBairro();
        montarAlvos(); mostrar();
      });
  }
  fetch("/mundo/mundo.json", { credentials: "omit", cache: "no-cache" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("mundo.json " + r.status)))
    .then(dados => { mapa = MundoMapa.criar({ dados, Camera, reduzido }); Object.assign(niveis, mapa.niveis); })
    .catch(() => { mapa = null; })   // sem o mapa, a página segue com o bairro, como antes
    .then(() => {
      trocar(normalizar(ler(pedido)), { substituir: true });
      pedirClima();
      setInterval(pedirClima, 15 * 60 * 1000);
      setInterval(() => { if (nome === "bairro") mostrar(); }, 30000);
    });

  return { ir: (alvo, params) => ir(alvo, params || {}), subir, Camera, niveis,
           get nivel() { return nome; }, get camera() { return nivel ? nivel.camera : null; } };
})();
window.Mundo = Mundo;
