"use strict";
// Chat da sala (B2): o painel de texto da sala onde a pessoa está no escritório. Não faz polling: o vida.js dispara no
// window "aovivo" (detail = resposta do /api/ao-vivo) a cada leitura e "minha-sala" (detail {sala, nome, andar}) quando a
// minha sala muda; {sala: null, nome: null} ao trocar de andar, ligar a TV ou desligar "Aparecer" (o painel fecha e limpa).
// O seq do evento é o da entrada na sala: mensagem de seq menor é da sala de antes (um GET atrasado) e fica de fora. O envio vai para POST /api/sala/enviar?andar=<id> {texto}; quem decide a sala é o servidor. Quem chega numa
// sala não vê o que foi dito antes: trocar de sala ou de andar limpa o painel. Nome e texto só por textContent.
const ChatSala = (() => {
  const TEXTO_MAX = 500, GUARDAR = 50;   // o servidor guarda 50 por sala; o painel não precisa de mais
  // o detail do "minha-sala" como o painel usa: com sala e nome, há chat; sem um dos dois (corredor, null), não há
  function daSala(d) {
    const sala = d && typeof d.sala === "string" ? d.sala : "", nome = d && typeof d.nome === "string" ? d.nome.trim() : "";
    return sala && nome ? { sala, nome } : { sala: "", nome: "" };
  }
  // o texto como o servidor vai aceitar (presenca.limpar_texto): sem controle nem invisível, só a quebra de linha
  const limpar = t => String(t).replace(/\r\n/g, "\n").replace(/(?!\n)[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, "").trim();
  function validar(texto) {   // mensagem do problema, ou null
    const limpo = limpar(texto);
    if (!limpo) return "Escreva a mensagem.";
    if ([...limpo].length > TEXTO_MAX) return `A mensagem passa de ${TEXTO_MAX} caracteres.`;
    return null;
  }
  // quem sou eu nas mensagens: o "eu" do /api/ao-vivo (no saguão, um id opaco no lugar do login); servidor sem o "eu", o
  // login da sessão. O "usuario" das mensagens é só chave: nunca vai para a tela
  const euDe = (d, login) => (d && typeof d.eu === "string" && d.eu ? d.eu : typeof login === "string" ? login : null);
  const deMim = (m, eu) => !!m && typeof m.usuario === "string" && eu != null && m.usuario === eu;
  // as mensagens que ainda não estão no painel, em ordem de seq (a leitura repete o que já veio e o envio já pôs a minha),
  // a partir do seq em que entrei na sala
  function novas(mensagens, vistos, desde = 0) {
    if (!Array.isArray(mensagens)) return [];
    return mensagens.filter(m => m && Number.isInteger(m.seq) && m.seq >= desde && !vistos.has(m.seq) && typeof m.texto === "string")
      .sort((a, b) => a.seq - b.seq);
  }


  // ---- 1.6: o painel de conversa da equipe. Os limites são os do store (conversas_equipe.py)
  const SALA_MAX = 80, ANEXO_MAX = 25 * 1024 * 1024, NOME_ARQUIVO_MAX = 120, SUGESTOES = 6;
  const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👀"];
  const IMAGENS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);   // só estas aparecem em <img>
  const canalDaSala = s => (typeof s === "string" && s.length >= 1 && s.length <= SALA_MAX ? `sala:${s}` : "");
  // o histórico na tela: junta por id em ordem; a versão que chegou depois (apagada, reação nova) troca a de antes
  function mesclar(atuais, chegaram) {
    const porId = new Map(atuais.map(m => [m.id, m]));
    for (const m of Array.isArray(chegaram) ? chegaram : []) if (m && Number.isInteger(m.id)) porId.set(m.id, m);
    return [...porId.values()].sort((a, b) => a.id - b.id);
  }
  const maisAntiga = ms => (ms.length ? ms[0].id : null);
  // menção: o "@termo" que está sendo escrito logo antes do cursor (no começo ou depois de espaço), ou null
  function mencaoEmCurso(texto, cursor) {
    const m = /(^|\s)@([a-z0-9._-]*)$/i.exec(String(texto).slice(0, cursor));
    return m ? { inicio: m.index + m[1].length, termo: m[2] } : null;
  }
  const semAcento = t => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  // quem sugerir: só da lista do andar que o servidor deu, sem mim; casa o começo do login ou de uma palavra do nome
  function sugestoes(termo, pessoas, eu, max = SUGESTOES) {
    const t = semAcento(termo);
    return (Array.isArray(pessoas) ? pessoas : []).filter(p => p && typeof p.usuario === "string" && p.usuario !== eu &&
      (p.usuario.startsWith(t) || semAcento(typeof p.nome === "string" ? p.nome : "").split(/\s+/).some(w => w.startsWith(t)))).slice(0, max);
  }
  function completarMencao(texto, inicio, cursor, usuario) {
    const antes = `${texto.slice(0, inicio)}@${usuario} `;
    return { texto: antes + texto.slice(cursor), cursor: antes.length };
  }
  // o texto em pedaços para o textContent: "@login" de alguém do andar vira destaque
  function partes(texto, logins) {
    const saida = [], re = /(^|\s)@([a-z0-9][a-z0-9._-]{2,31})/g;
    let de = 0, m;
    while ((m = re.exec(texto))) {
      const ini = m.index + m[1].length, fim = ini + 1 + m[2].length;
      if (!logins.has(m[2])) continue;
      if (ini > de) saida.push({ texto: texto.slice(de, ini) });
      saida.push({ texto: texto.slice(ini, fim), mencao: m[2] });
      de = fim;
    }
    if (de < texto.length || !saida.length) saida.push({ texto: texto.slice(de) });
    return saida;
  }
  function tamanho(b) {
    const un = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (b >= 1024 && i < un.length - 1) { b /= 1024; i++; }
    return `${i ? String(Math.round(b * 10) / 10).replace(".", ",") : b} ${un[i]}`;
  }
  function conferirArquivo(f) {   // o que dá para dizer antes de subir; o tipo quem decide é o servidor, pelos bytes
    if (!f || !f.size) return "O arquivo está vazio.";
    if (f.size > ANEXO_MAX) return "O arquivo passa de 25 MB.";
    if (typeof f.name !== "string" || !f.name || f.name.length > NOME_ARQUIVO_MAX) return "O nome do arquivo passa de 120 caracteres.";
    return null;
  }
  const ehImagem = t => IMAGENS.has(t);
  function alternarReacao(reacoes, emoji) {   // a minha liga ou desliga já; a próxima leitura traz a contagem de verdade
    const r = reacoes.map(x => ({ ...x })), achou = r.find(x => x.emoji === emoji);
    if (!achou) return [...r, { emoji, n: 1, eu: true }];
    achou.n += achou.eu ? -1 : 1; achou.eu = !achou.eu;
    return r.filter(x => x.n > 0);
  }
  const textoRetencao = dias => `As mensagens ficam guardadas por ${!Number.isInteger(dias) || dias >= 365 ? "1 ano" : `${dias} dias`}.`;
  const avisoDM = empresa => `As mensagens diretas ${empresa ? `da ${empresa}` : "desta empresa"} podem ser lidas pela administração da empresa.`;
  const data = em => { const d = new Date(em); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };
  function linhaAcessos(datas) {   // D10: as duas pontas veem quando a administração abriu a DM (as 3 últimas)
    const ds = (Array.isArray(datas) ? datas : []).map(data).filter(Boolean).slice(-3);
    if (!ds.length) return "";
    const lista = ds.length === 1 ? ds[0] : `${ds.slice(0, -1).join(", ")} e ${ds[ds.length - 1]}`;
    return `A administração da empresa abriu esta conversa em ${lista}.`;
  }
  function hora(em) {
    const d = new Date(em);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const contagem = n => (!n ? "" : n > 9 ? "9+" : String(n));
  const puro = { daSala, validar, limpar, novas, euDe, deMim, TEXTO_MAX, EMOJIS, canalDaSala, mesclar, maisAntiga, mencaoEmCurso,
    sugestoes, completarMencao, partes, tamanho, conferirArquivo, ehImagem, alternarReacao, textoRetencao, avisoDM, linhaAcessos, contagem };

  if (typeof document === "undefined") return puro;

  const criar = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const urlAnexo = (andar, id, baixar) => Andar.com(`api/anexo?id=${id}${baixar ? "&baixar=1" : ""}`, andar);
  // uma mensagem do store na tela. ctx: {eu, logins (Set do andar), andar, moderar (admin do andar: apaga em canal, nunca em DM)}
  function elMensagem(m, ctx) {
    const mim = deMim(m, ctx.eu), li = criar("li", "chat-sala-msg" + (mim ? " de-mim" : "") + (m.apagada ? " apagada" : ""));
    li.dataset.id = String(m.id);
    const cabeca = criar("p", "chat-sala-cabeca"), quando = criar("time", null, hora(m.em));
    if (typeof m.em === "string") quando.dateTime = m.em;
    cabeca.append(criar("strong", null, mim ? "Você" : (typeof m.nome === "string" && m.nome ? m.nome : "Alguém")), quando);
    li.append(cabeca);
    if (m.apagada) { li.append(criar("p", "chat-sala-texto", "Mensagem apagada.")); return li; }
    if (typeof m.texto === "string" && m.texto) {
      const p = criar("p", "chat-sala-texto");
      for (const parte of partes(m.texto, ctx.logins))
        p.append(parte.mencao ? criar("span", "chat-sala-mencao" + (parte.mencao === ctx.eu ? " a-mim" : ""), parte.texto) : parte.texto);
      li.append(p);
    }
    if (m.anexo && Number.isInteger(m.anexo.id)) li.append(elAnexo(m.anexo, ctx.andar));
    const reacoes = criar("div", "chat-sala-reacoes");
    for (const r of Array.isArray(m.reacoes) ? m.reacoes : []) {
      const b = criar("button", "chat-sala-reacao", `${r.emoji} ${r.n}`);
      b.type = "button"; b.dataset.emoji = r.emoji;
      b.setAttribute("aria-pressed", String(!!r.eu));
      b.setAttribute("aria-label", `${r.emoji}: ${r.n} ${r.n === 1 ? "reação" : "reações"}${r.eu ? ", inclusive a sua" : ""}`);
      reacoes.append(b);
    }
    const acoes = criar("div", "chat-sala-acoes"), reagir = criar("button", "chat-sala-reagir", "Reagir");
    reagir.type = "button"; reagir.setAttribute("aria-haspopup", "true");
    acoes.append(reagir);
    if (mim || (ctx.moderar && !String(m.canal).startsWith("dm:"))) {
      const apagar = criar("button", "chat-sala-apagar", "Apagar");
      apagar.type = "button";
      acoes.append(apagar);
    }
    li.append(reacoes, acoes);
    return li;
  }
  // imagem (só os 4 tipos) aparece; todo o resto é nome, tamanho e "Baixar" (o servidor manda como attachment)
  function elAnexo(a, andar) {
    const caixa = criar("div", "chat-sala-anexo"), nome = typeof a.nome === "string" ? a.nome : "arquivo";
    if (ehImagem(a.tipo)) {
      const img = criar("img", "chat-sala-previa");
      img.src = urlAnexo(andar, a.id); img.alt = nome; img.loading = "lazy"; img.decoding = "async";
      caixa.append(img);
    }
    const info = criar("p", "chat-sala-arquivo");
    info.append(criar("span", "chat-sala-arquivo-nome", nome), criar("span", "chat-sala-arquivo-tam", Number.isInteger(a.tamanho) ? tamanho(a.tamanho) : ""));
    const baixar = criar("a", "chat-sala-baixar", "Baixar");
    baixar.href = urlAnexo(andar, a.id, true); baixar.setAttribute("download", "");
    baixar.setAttribute("aria-label", `Baixar ${nome}`);
    caixa.append(info, baixar);
    return caixa;
  }

  const $ = id => document.getElementById(id);
  const caixa = $("chat-sala"), abrir = $("chat-sala-abrir"), painel = $("chat-sala-painel"), titulo = $("chat-sala-titulo"),
    contador = $("chat-sala-n"), lista = $("chat-sala-lista"), vazio = $("chat-sala-vazio"), form = $("chat-sala-form"),
    campo = $("chat-sala-campo"), enviar = $("chat-sala-enviar"), aviso = $("chat-sala-aviso"), fechar = $("chat-sala-fechar");
  if (!caixa) return { ...puro, elMensagem };

  let sala = "", nomeSala = "", andar = "", desde = 0, vistos = new Set(), naoLidas = 0, enviando = false, avisoTempo = 0;
  const tv = () => !!(window.TV && TV.invisivel) || document.body.classList.contains("tv");
  const login = () => (typeof estado !== "undefined" && estado && typeof estado.usuario === "string" ? estado.usuario : null);   // app.js
  let euAoVivo = null;   // o "eu" da última leitura do /api/ao-vivo
  const eu = () => euDe({ eu: euAoVivo }, login());
  const aberto = () => !painel.hidden;

  function mostrarAviso(texto, ruim = true) {
    clearTimeout(avisoTempo);
    aviso.textContent = texto; aviso.classList.toggle("ruim", ruim); aviso.hidden = !texto;
    if (texto && !ruim) avisoTempo = setTimeout(() => mostrarAviso(""), 4000);
  }
  function contar() {
    contador.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
    contador.hidden = !naoLidas || aberto();
    abrir.setAttribute("aria-label", naoLidas && !aberto() ? `Chat da sala ${nomeSala}, ${naoLidas} mensagens novas` : `Chat da sala ${nomeSala}`);
  }
  function esvaziar() {   // quem chega não vê histórico
    vistos = new Set(); naoLidas = 0; lista.replaceChildren(); vazio.hidden = false; mostrarAviso(""); contar();
  }
  function por(m, minha = false) {
    vistos.add(m.seq);
    const mim = minha || deMim(m, eu());
    const li = document.createElement("li"), cabeca = document.createElement("p"), quem = document.createElement("strong"),
      quando = document.createElement("time"), texto = document.createElement("p");
    li.className = "chat-sala-msg" + (mim ? " de-mim" : "");
    cabeca.className = "chat-sala-cabeca"; texto.className = "chat-sala-texto";
    quem.textContent = mim ? "Você" : (typeof m.nome === "string" && m.nome ? m.nome : "Alguém");
    quando.textContent = hora(m.em); if (typeof m.em === "string") quando.dateTime = m.em;
    texto.textContent = m.texto;
    cabeca.append(quem, quando); li.append(cabeca, texto);
    const noFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
    lista.append(li);
    while (lista.children.length > GUARDAR) lista.firstElementChild.remove();
    vazio.hidden = true;
    if (noFim || mim) lista.scrollTop = lista.scrollHeight;
    if (!mim && !aberto()) naoLidas++;
  }
  function atualizar() {   // sem sala (corredor), na TV ou no modo foto o painel some
    const pode = !!sala && !tv();
    caixa.hidden = !pode;
    if (!pode) { painel.hidden = true; abrir.hidden = false; abrir.setAttribute("aria-expanded", "false"); return; }
    titulo.textContent = nomeSala;
    contar();
  }
  function abrirPainel() {
    painel.hidden = false; abrir.setAttribute("aria-expanded", "true"); abrir.hidden = true;
    naoLidas = 0; contar(); lista.scrollTop = lista.scrollHeight; campo.focus();
  }
  function fecharPainel(focar = true) {
    painel.hidden = true; abrir.setAttribute("aria-expanded", "false"); abrir.hidden = false; contar();
    if (focar) abrir.focus();
  }

  async function mandar() {
    if (enviando) return;
    const problema = validar(campo.value);
    if (problema) { mostrarAviso(problema); campo.focus(); return; }
    enviando = true; enviar.disabled = true;
    const texto = limpar(campo.value), salaDoEnvio = sala, andarDoEnvio = andar;
    let r = null, d = null;
    try {
      r = await fetch(Andar.com("api/sala/enviar", andarDoEnvio || Andar.atual), { method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      d = await r.json().catch(() => null);
    } catch (e) { r = null; }
    enviando = false; enviar.disabled = false;
    if (r && r.status === 401) { location.href = "/entrar"; return; }
    if (!r) { mostrarAviso("Sem conexão. A mensagem não foi."); return; }
    if (r.status === 429) { mostrarAviso("Devagar: espere um segundo para mandar outra."); return; }
    if (!r.ok) { mostrarAviso(d && typeof d.mensagem === "string" ? d.mensagem : `Não deu para mandar (HTTP ${r.status}).`); return; }
    campo.value = ""; mostrarAviso("");
    // a minha aparece já; a próxima leitura do /api/ao-vivo traz a mesma (pelo seq) e não repete
    if (sala === salaDoEnvio && andar === andarDoEnvio && d && Number.isInteger(d.seq) && !vistos.has(d.seq))
      por({ seq: d.seq, texto, em: new Date().toISOString() }, true);
    contar();
  }

  window.addEventListener("minha-sala", e => {
    const d = e.detail || {}, nova = daSala(d), novoAndar = typeof d.andar === "string" ? d.andar : "";
    if (nova.sala === sala && novoAndar === andar) { if (nova.nome !== nomeSala) { nomeSala = nova.nome; atualizar(); } return; }
    const estavaAberto = aberto() && caixa.contains(document.activeElement);
    sala = nova.sala; nomeSala = nova.nome; andar = novoAndar; desde = Number.isInteger(d.seq) && d.seq > 0 ? d.seq : 0;
    esvaziar(); atualizar();
    if (estavaAberto && caixa.hidden) $("tela")?.focus();   // o foco não fica perdido num painel que sumiu
  });
  window.addEventListener("aovivo", e => {
    if (!sala || tv()) return;
    const d = e.detail || {};
    euAoVivo = typeof d.eu === "string" ? d.eu : null;
    const chegaram = novas(d.mensagens, vistos, desde);
    for (const m of chegaram) por(m);
    if (chegaram.length) contar();
  });

  abrir.addEventListener("click", abrirPainel);
  fechar.addEventListener("click", () => fecharPainel());
  form.addEventListener("submit", e => { e.preventDefault(); mandar(); });
  campo.addEventListener("input", () => { if (!aviso.hidden && aviso.classList.contains("ruim")) mostrarAviso(""); });
  painel.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); fecharPainel(); } });
  new MutationObserver(atualizar).observe(document.body, { attributes: true, attributeFilter: ["class"] });   // entrar e sair da TV
  atualizar();

  return { daSala, validar, limpar, novas, TEXTO_MAX, abrir: abrirPainel, fechar: fecharPainel };
})();
if (typeof window !== "undefined") window.ChatSala = ChatSala;
