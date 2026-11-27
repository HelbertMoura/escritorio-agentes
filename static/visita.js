"use strict";
(() => {
  const convite = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  const estado = document.getElementById("estado"), lista = document.getElementById("mensagens");
  const formulario = document.getElementById("formulario"), campo = document.getElementById("texto");
  const enviar = formulario.querySelector("button"), sair = document.getElementById("sair");
  const vazio = document.getElementById("mensagens-vazio"), contador = document.getElementById("caracteres-restantes");
  // estado vazio da Conversa: a recepcionista acena (2 quadros de pixel; parada com movimento reduzido)
  (() => {
    const cv = document.getElementById("recepcionista-aceno"), c = cv && cv.getContext("2d");
    if (!c) return;
    const COR = { o: "#1a1408", h: "#5a3a22", s: "#e8b48a", c: "#f5b83d", d: "#c98a1e", w: "#fff4dc", p: "#3a3a46" };
    const CORPO = ["................", ".....oooooo.....", "....ohhhhhho....", "....ohhhhhho....", "....ohsssssho...",
      "....osowsowso...", "....ossssssso...", ".....osssssso....", "......ooooo.....", "....occcwccco...", "...occccwcccco..",
      "...oscccwccco...", "...os.occcco....", "......occcco....", ".....opp.ppo....", ".....ooo.ooo...."].map(l => l.slice(0, 16));
    const BRACO = [   // o braço direito: no alto e um pouco caído, alternando
      [[12, 3, "o"], [13, 3, "o"], [11, 4, "o"], [12, 4, "s"], [13, 4, "s"], [14, 4, "o"], [12, 5, "o"], [13, 5, "s"], [14, 5, "o"], [12, 6, "o"], [13, 6, "c"], [12, 7, "o"], [13, 7, "c"], [12, 8, "c"], [13, 8, "o"]],
      [[13, 4, "o"], [14, 4, "o"], [12, 5, "o"], [13, 5, "s"], [14, 5, "s"], [15, 5, "o"], [13, 6, "o"], [14, 6, "s"], [15, 6, "o"], [12, 7, "o"], [13, 7, "c"], [12, 8, "c"], [13, 8, "o"]],
    ];
    let q = 0;
    function desenhar() {
      c.clearRect(0, 0, 16, 16);
      CORPO.forEach((linha, y) => [...linha].forEach((ch, x) => { if (COR[ch]) { c.fillStyle = COR[ch]; c.fillRect(x, y, 1, 1); } }));
      for (const [x, y, ch] of BRACO[q]) { c.fillStyle = COR[ch]; c.fillRect(x, y, 1, 1); }
    }
    desenhar();
    const calmo = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!calmo) setInterval(() => { if (!document.hidden && !cv.closest("[hidden]")) { q = 1 - q; desenhar(); } }, 600);
  })();
  function atualizarContador() { contador.textContent = `${campo.maxLength - campo.value.length} caracteres restantes`; }
  campo.addEventListener("input", atualizarContador);
  let sessao = null, ativa = true, timer, recepcaoLimitada = false;
  async function pedir(acao, dados) {
    const resposta = await fetch(`/api/visitas/${acao}`, { method: "POST", credentials: "omit", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    const resultado = await resposta.json();
    if (!resposta.ok) {
      const erro = new Error(resultado.erro || "Não foi possível conectar.");
      erro.status = resposta.status;
      throw erro;
    }
    return resultado;
  }
  function encerrar(mensagem) {
    ativa = false; clearTimeout(timer); campo.disabled = true; enviar.disabled = true; estado.textContent = mensagem;
    sessao = null; lista.replaceChildren(); campo.value = ""; atualizarContador(); vazio.hidden = true;
    predio = null; imagem = null; atlasDados = null; verSala.disabled = verEscritorio.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height); mapaEstado.textContent = "Mapa indisponível.";
  }
  async function receber() {
    if (!ativa || !sessao) return;
    try {
      const resposta = await pedir("receber", { sessao });
      if (!ativa) return;
      if (recepcaoLimitada) { estado.textContent = "Conectado à sala."; recepcaoLimitada = false; }
      for (const mensagem of resposta.mensagens) {
        const item = document.createElement("li"); item.textContent = mensagem; lista.append(item);
        if (lista.children.length > 100) lista.firstElementChild.remove();
      }
      if (resposta.mensagens.length) { vazio.hidden = true; lista.scrollTop = lista.scrollHeight; }
      timer = setTimeout(receber, 1500);
    } catch (erro) {
      if (!ativa) return;
      if (erro.status === 429) {
        recepcaoLimitada = true;
        estado.textContent = "Muitas requisições. Tentando novamente em instantes.";
        timer = setTimeout(receber, 10000);
      } else encerrar("A conexão terminou. Peça um novo convite para entrar novamente.");
    }
  }
  formulario.addEventListener("submit", async ev => {
    ev.preventDefault();
    const texto = campo.value;
    if (!sessao || !texto.trim()) return;
    enviar.disabled = true;
    try { await pedir("enviar", { sessao, texto }); campo.value = ""; atualizarContador(); }
    catch (_) { if (ativa) estado.textContent = "Não foi possível enviar. Aguarde um instante e tente novamente."; }
    finally { if (ativa) enviar.disabled = false; }
  });
  function desconectar() {
    if (sessao) navigator.sendBeacon("/api/visitas/sair", new Blob([JSON.stringify({ sessao })], { type: "application/json" }));
    encerrar("Você saiu da sala.");
  }
  sair.addEventListener("click", desconectar);
  window.addEventListener("pagehide", desconectar, { once: true });
  const canvas = document.getElementById("cena"), ctx = canvas.getContext("2d");
  const mapaEstado = document.getElementById("mapa-estado"), verSala = document.getElementById("ver-sala");
  const verEscritorio = document.getElementById("ver-escritorio");
  let predio, imagem, atlasDados, salaAtual;
  function desenhar(sala) {
    if (!predio) return;
    salaAtual = sala;
    const publico = sala === "publico", recepcao = publico && predio.salas.find(s => s.chave === "recepcao");
    let area = sala && !publico ? predio.baixo.find(s => s.chave === "reuniao") : { px: 0, py: 0, pw: predio.W, ph: predio.H };
    if (!area) return;
    // recepção pública: no mapa estreito (celular), o quadro fecha na recepção até meio px de tela por px do mundo, e a
    // placa "Com convite" cresce com a largura exibida para sair com PLACA_TELA px ou mais na tela
    const largura = canvas.clientWidth;
    if (publico && recepcao && largura > 0 && largura * 2 < predio.W) {
      const pw = Math.ceil(largura * 2), cx = recepcao.px + recepcao.pw / 2;
      area = { px: Math.round(Math.max(0, Math.min(predio.W - pw, cx - pw / 2))), py: 0, pw, ph: predio.H };
    }
    const fonte = Math.max(PLACA_TELA, Math.ceil(PLACA_TELA * area.pw / (largura > 0 ? largura : area.pw)));
    // o canvas toma o formato da área em escala inteira (uns 1280 px de largura, que o CSS reduz): sem tarja em volta
    const k = Math.max(1, Math.round(1280 / area.pw));
    canvas.width = Math.round(area.pw * k); canvas.height = Math.round(area.ph * k);
    ctx.setTransform(k, 0, 0, k, -area.px * k || 0, -area.py * k || 0);   // || 0: sem -0
    ctx.imageSmoothingEnabled = false; ctx.drawImage(predio.fundo, 0, 0);
    for (const o of [...predio.objetos].sort((a, b) => a.chave - b.chave)) {
      if (o.tipo === "mesa") Mapa.desenharMesa(ctx, o.mesa.x, o.mesa.topo, "apagada", 0, o.mesa);
      else if (o.tipo === "cadeira") Mapa.desenharCadeira(ctx, o.x, o.y, o.cor, o.estilo);
      else {
        const sprite = atlasDados.sprites[o.nome];
        if (!sprite) continue;
        ctx.save(); if (o.espelho) { ctx.translate(2 * o.x + o.w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(imagem, sprite[0], sprite[1], sprite[2], sprite[3], o.x, o.y, sprite[2], sprite[3]); ctx.restore();
      }
    }
    // Sem convite, só a recepção fica acesa. As demais salas são a silhueta padrão do prédio:
    // o servidor não envia a planta delas, então nada do que aparece apagado é o conteúdo real.
    if (publico && recepcao) {
      ctx.fillStyle = "rgba(8, 10, 18, 0.82)"; ctx.beginPath();
      ctx.rect(0, 0, predio.W, predio.H); ctx.rect(recepcao.px, recepcao.py, recepcao.pw, recepcao.ph); ctx.fill("evenodd");
      for (const s of [...predio.salas, ...predio.baixo]) {
        const cx = s.px + s.pw / 2;   // sala com o meio fora do quadro (celular): sem placa, para não encavalar na vizinha
        if (s !== recepcao && s.pw && cx >= area.px && cx <= area.px + area.pw) placaConvite(cx, s.py + s.ph / 2, fonte, area);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // "Com convite": placa de pixel com cadeado no meio da sala apagada (em pixels do mundo, com o texto em Pixeloid), presa
  // dentro do quadro (a sala cortada pela borda mostra a placa inteira)
  const PLACA_TELA = 12;   // px CSS do texto da placa, no mínimo
  function placaConvite(cx, cy, fonte, area) {
    const texto = "COM CONVITE", u = Math.max(2, Math.round(fonte / 6));   // u: o pixel da placa (borda e cadeado), em pixels do mundo
    ctx.font = `${fonte}px Pixeloid, monospace`;
    const tw = Math.ceil(ctx.measureText(texto).width), w = tw + 14 * u, h = 10 * u, y = Math.round(cy - h / 2);
    const x = Math.round(Math.max(area.px + u, Math.min(area.px + area.pw - w - u, cx - w / 2)));
    ctx.fillStyle = "#111116"; ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
    ctx.fillStyle = "#2c3a78"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#5468bf"; ctx.fillRect(x, y, w, u); ctx.fillRect(x, y, u, h);
    ctx.fillStyle = "#1d2652"; ctx.fillRect(x, y + h - u, w, u); ctx.fillRect(x + w - u, y, u, h);
    ctx.fillStyle = "#f5b83d";   // o cadeado: alça e corpo de 5x4 pixels da placa
    ctx.fillRect(x + 4 * u, y + 2 * u, 3 * u, u); ctx.fillRect(x + 3 * u, y + 3 * u, u, u); ctx.fillRect(x + 7 * u, y + 3 * u, u, u);
    ctx.fillRect(x + 3 * u, y + 4 * u, 5 * u, 4 * u);
    ctx.fillStyle = "#1a1408"; ctx.fillRect(x + 5 * u, y + 5 * u, u, 2 * u);
    ctx.fillStyle = "#fff4dc"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(texto, x + 10 * u, y + h / 2 + 0.5);
  }
  async function carregarMapa(publico = false) {
    try {
      // o PNG vem com o ?v= do atlas.json: os PNG ficam 1 h em cache, e um atlas novo com o PNG velho embaralha os sprites
      const [dados, resposta] = await Promise.all([
        pedir(publico ? "recepcao" : "mapa", publico ? {} : { sessao }), fetch("/tema/atlas.json", { credentials: "omit" })]);
      if (!resposta.ok || !ativa) throw new Error("Mapa indisponível");
      const atlas = await resposta.json(); if (!ativa) return;
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = "/tema/atlas.png?v=" + encodeURIComponent(atlas.versao || ""); });
      if (!ativa) return; atlasDados = atlas; imagem = img;
      predio = Mapa.montarPredio({ img, json: atlasDados }, { empresa: "escritorio", planta: dados.planta }, dados.grupos);
      desenhar(publico ? "publico" : false);
      verSala.disabled = verEscritorio.disabled = publico;
      mapaEstado.textContent = publico ? "Recepção pública. As salas apagadas exigem convite."
        : "Mapa simplificado: os nomes das equipes são preservados em privado.";
    } catch (_) { if (ativa) mapaEstado.textContent = "Não foi possível carregar o mapa."; }
  }
  verSala.addEventListener("click", () => { desenhar(true); document.getElementById("titulo-conversa").scrollIntoView({ behavior: "smooth" }); });
  verEscritorio.addEventListener("click", () => desenhar(false));
  window.addEventListener("resize", () => { if (salaAtual === "publico") desenhar("publico"); });   // girar o celular refaz o quadro
  if (!convite) {
    estado.textContent = "A conversa e as demais salas exigem convite.";
    sair.disabled = true;
    carregarMapa(true);
    return;
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(convite)) { encerrar("Convite inválido. Peça um novo link."); return; }
  async function entrar() {
    if (!ativa) return;
    try {
      const dados = await pedir("entrar", { convite });
      if (!ativa) { navigator.sendBeacon("/api/visitas/sair", new Blob([JSON.stringify({ sessao: dados.sessao })], { type: "application/json" })); return; }
      sessao = dados.sessao; estado.textContent = "Conectado à sala."; vazio.hidden = false;
      const aviso = document.getElementById("aviso-agente");
      if (aviso && typeof dados.agente === "string" && dados.agente) {
        aviso.textContent = `${dados.agente} (agente) participa desta sala. O que você escrever aqui é enviado ao agentes.chat e fica guardado lá.`;
        aviso.hidden = false;
      } campo.disabled = false; enviar.disabled = false; receber(); carregarMapa();
    } catch (erro) {
      if (!ativa) return;
      if (erro.status === 429) {
        estado.textContent = "Muitas requisições. Tentando novamente em instantes.";
        timer = setTimeout(entrar, 10000);
      } else encerrar("Convite inválido ou expirado. Peça um novo link.");
    }
  }
  entrar();
})();
