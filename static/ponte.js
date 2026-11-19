// Ponte local (Firmópolis, onda 2): os terminais deste computador no mapa. Quem lê é o navegador, direto da ponte em
// 127.0.0.1:47820 (ponte/ deste repositório), pelo WebSocket do contrato v1; nada passa pelo servidor do escritório.
// Liga só depois de a pessoa colar o token (Personalizar > Ponte local), que fica neste navegador (localStorage). A
// ponte confere o Origin (ponte setup --origem) e o token, que vai como subprotocolo "token.<hex>" (o navegador não
// manda Authorization no WebSocket). Desligada ou caída, tenta de novo espaçando até 1 minuto, sem aviso na tela.
// Os dados da ponte só vão para a tela por textContent e pelo canvas, sempre conferidos e cortados aqui.
"use strict";
const Ponte = (() => {
  const URL_PONTE = "ws://127.0.0.1:47820/ws", PROTOCOLO = "firmopolis.v1", CHAVE = "firmopolis.ponte";
  const MAX = 48, ESPERA_MIN = 3000, ESPERA_MAX = 60000;
  const ESTADOS = { ocupado: "ocupado", ocioso: "livre", esperando_permissao: "aprovacao", esperando_resposta: "pergunta", erro: "erro" };
  const PROVEDORES = { claude_code: "Claude Code", codex: "Codex", open_code: "OpenCode", antigravity_cli: "agy", minimax_code: "MiniMax" };
  const st = { ws: null, token: "", situacao: "desligada", falhas: 0, timer: 0, moradores: new Map(), v: 0 };

  const tokenOk = t => typeof t === "string" && /^[0-9a-f]{64}$/.test(t);
  function lerToken() { try { const t = localStorage.getItem(CHAVE); return tokenOk(t) ? t : ""; } catch (e) { return ""; } }
  function gravarToken(t) { try { if (t) localStorage.setItem(CHAVE, t); else localStorage.removeItem(CHAVE); } catch (e) { /* aba anônima: vale só nesta visita */ } }

  const texto = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
  // um morador do contrato v1 vira o terminalzinho do mapa: só o que a tela usa, conferido
  function terminal(m) {
    if (!m || typeof m !== "object" || !texto(m.id, 200) || !Object.hasOwn(ESTADOS, m.estado)) return null;
    const provedor = Object.hasOwn(PROVEDORES, m.provedor) ? PROVEDORES[m.provedor] : "Terminal";
    const at = m.atividade && typeof m.atividade === "object" ? texto(m.atividade.ferramenta, 40) : "";
    return { id: texto(m.id, 200), nome: texto(m.nome, 40) || provedor, provedor, estado: ESTADOS[m.estado],
      projeto: texto(m.projeto, 60), atividade: at, gerente: m.gerente === true };
  }
  function mudou() { st.v++; window.dispatchEvent(new CustomEvent("ponte")); }
  function receber(d) {
    if (!d || typeof d !== "object" || d.v !== 1) return;
    if (d.tipo === "snapshot" && Array.isArray(d.moradores)) {
      st.moradores.clear();
      for (const m of d.moradores.slice(0, MAX)) { const t = terminal(m); if (t) st.moradores.set(t.id, t); }
      mudou();
    } else if (d.tipo === "morador") {
      const t = terminal(d.morador);
      if (t && (st.moradores.has(t.id) || st.moradores.size < MAX)) { st.moradores.set(t.id, t); mudou(); }
    } else if (d.tipo === "saiu" && st.moradores.delete(texto(d.id, 200))) mudou();
  }

  function situar(s) { if (st.situacao !== s) { st.situacao = s; mostrar(); } }
  function conectar() {
    clearTimeout(st.timer); st.timer = 0;
    if (!st.token || st.ws) return;
    let ws;
    try { ws = new WebSocket(URL_PONTE, [PROTOCOLO, "token." + st.token]); } catch (e) { return religar(); }
    st.ws = ws; situar(st.falhas ? st.situacao : "conectando");
    ws.onopen = () => { st.falhas = 0; situar("ligada"); };
    ws.onmessage = e => { if (typeof e.data === "string" && e.data.length < 4 << 20) { try { receber(JSON.parse(e.data)); } catch (x) { /* ignora */ } } };
    ws.onclose = () => {
      if (st.ws !== ws) return;
      st.ws = null;
      if (st.moradores.size) { st.moradores.clear(); mudou(); }   // ponte caiu: os terminais saem do mapa
      religar();
    };
  }
  function religar() {
    if (!st.token) return;
    st.falhas++; situar("sem-ponte");
    const espera = Math.min(ESPERA_MAX, ESPERA_MIN * 2 ** Math.min(st.falhas - 1, 5));
    st.timer = setTimeout(conectar, document.hidden ? Math.max(espera, 30000) : espera);
  }
  function desligar() {
    clearTimeout(st.timer); st.timer = 0; st.falhas = 0;
    const ws = st.ws; st.ws = null; if (ws) ws.close();
    if (st.moradores.size) { st.moradores.clear(); mudou(); }
    situar("desligada");
  }
  function ligar(token) { desligar(); st.token = token; gravarToken(token); conectar(); }

  // ---------- Personalizar > Ponte local ----------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const SITUACOES = {
    desligada: ["Desligada. Cole o token para ver os terminais deste computador no mapa.", ""],
    conectando: ["Procurando a ponte em 127.0.0.1…", ""],
    ligada: ["Ligada: os terminais deste computador estão no mapa.", "ok"],
    "sem-ponte": ["A ponte não respondeu. Ela está rodando? Se o token ou o endereço mudou, rode o comando acima de novo. Tentando de novo sozinho.", "ruim"] };
  function mostrar() {
    const a = $("pt-estado"); if (!a) return;
    const [t, tipo] = SITUACOES[st.situacao] || SITUACOES.desligada;
    const n = st.moradores.size;
    a.textContent = st.situacao === "ligada" && n ? `${t} Agora: ${n} ${n === 1 ? "terminal" : "terminais"}.` : t;
    a.className = "aviso-form" + (tipo ? ` ${tipo}` : "");
    $("pt-desligar").hidden = !st.token;
    $("pt-ligar").textContent = st.token ? "Trocar token" : "Ligar";
  }
  function montarCartao() {
    const form = $("form-ponte"); if (!form) return;
    $("pt-comando").textContent = `ponte setup --aplicar --origem ${location.origin}`;
    form.addEventListener("submit", e => {
      e.preventDefault();
      const t = $("pt-token").value.trim().toLowerCase();
      if (!tokenOk(t)) { const a = $("pt-estado"); a.textContent = "O token tem 64 letras e números (0 a 9, a a f). Copie de novo do terminal."; a.className = "aviso-form ruim"; $("pt-token").focus(); return; }
      $("pt-token").value = ""; ligar(t);
    });
    $("pt-desligar").addEventListener("click", () => { desligar(); st.token = ""; gravarToken(""); $("pt-token").focus(); });
    window.addEventListener("ponte", mostrar);
    mostrar();
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden && st.token && !st.ws && st.falhas) { st.falhas = 1; conectar(); } });
  function iniciar() {
    montarCartao();
    st.token = lerToken();   // também na demonstração: a ponte é deste computador, não o servidor
    if (st.token) conectar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  return { terminais: () => [...st.moradores.values()], versao: () => st.v, situacao: () => st.situacao };
})();
window.Ponte = Ponte;
