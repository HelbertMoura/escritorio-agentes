"use strict";
// Reuniões (1.6 Onda 3, contrato 2026-11-16-onda3-contrato.md): o link fixo de cada sala (o botão "Entrar na reunião"),
// a agenda da semana do andar (marcar, editar, cancelar, convidar, baixar o .ics) e o aviso de "começa em 5 min" na tela.
// Horários do servidor em epoch s (UTC); a tela mostra a hora local. Nada disso existe no saguão nem com o store
// desligado: config.equipe.reunioes null. Títulos e nomes só por textContent e com data-sensivel (o modo apresentação
// do mapa esconde).
const Reunioes = (() => {
  const LINK_MAX = 500;
  const ERRO_LINK = "Use um link https de Meet, Zoom, Jitsi, Teams ou Whereby, sem senha no endereço.";
  // ASCII visível, sem espaço nem \ " < > ` { } | ^ (o mesmo que o servidor aceita)
  const ASCII_OK = /^[\x21-\x7e]+$/, PROIBIDOS = /[\\"<>`{}|^]/;
  function hostNaLista(host, hosts) {
    return (Array.isArray(hosts) ? hosts : []).some(h => typeof h === "string" &&
      (h.startsWith("*.") ? host === h.slice(2) || host.endsWith(h.slice(1)) : host === h));
  }
  // {ok: true, url} ou {ok: false, mensagem}; quem decide de fato é o servidor
  function linkValido(texto, hosts) {
    const ruim = { ok: false, mensagem: ERRO_LINK };
    if (typeof texto !== "string") return ruim;
    const url = texto.trim();
    if (!url || url.length > LINK_MAX || !ASCII_OK.test(url) || PROIBIDOS.test(url) || !/^https:\/\//i.test(url)) return ruim;
    const autoridade = url.slice(8).split(/[/?#]/)[0];
    if (!autoridade || autoridade.includes("@") || autoridade.includes(":")) return ruim;   // sem usuário, senha nem porta
    return hostNaLista(autoridade.toLowerCase(), hosts) ? { ok: true, url } : ruim;
  }

  const SALAS = { recepcao: "Recepção", reuniao: "Sala de reunião", cozinha: "Cozinha", lounge: "Lounge" };
  const nomeSala = s => (typeof s !== "string" ? "" : Object.hasOwn(SALAS, s) ? SALAS[s] : s.startsWith("time:") ? s.slice(5) : "");
  const salaOk = s => typeof s === "string" && (Object.hasOwn(SALAS, s) || (s.startsWith("time:") && s.length > 5));
  // as salas do mapa (predio.salas e predio.baixo do mapa.js) que aceitam reunião: o corredor não
  const salasDoMapa = lista => (Array.isArray(lista) ? lista : []).filter(s => s && salaOk(s.chave))
    .map(s => ({ chave: s.chave, nome: nomeSala(s.chave) || s.nome }));

  // ---- tempo: o servidor fala em epoch s; a semana é de segunda a domingo, na hora local
  const epoch = d => Math.floor(d.getTime() / 1000);
  const data = s => new Date(s * 1000);
  const numero = n => Number.isInteger(n);
  function semana(d, desloc = 0) {
    const seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 7 * desloc);
    return Array.from({ length: 7 }, (_, i) => new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i));
  }
  const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const doDia = (rs, dia) => (Array.isArray(rs) ? rs : []).filter(r => r && numero(r.inicio) && mesmoDia(data(r.inicio), dia))
    .sort((a, b) => a.inicio - b.inicio);
  const dd = n => String(n).padStart(2, "0");
  const horaDe = s => { const d = data(s); return `${dd(d.getHours())}:${dd(d.getMinutes())}`; };
  const faixa = r => (r && numero(r.inicio) && numero(r.fim) ? `${horaDe(r.inicio)} – ${horaDe(r.fim)}` : "");
  function duracaoTexto(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  }

  // ---- "começa em 5 min": quem começa de agora até aviso_min, uma vez por (reunião, horário)
  const chaveAviso = r => `${r.id}:${r.inicio}`;
  const emBreve = (rs, agora, avisadas, min) => (Array.isArray(rs) ? rs : [])
    .filter(r => r && numero(r.inicio) && r.inicio >= agora && r.inicio - agora <= min * 60 && !avisadas.has(chaveAviso(r)))
    .sort((a, b) => a.inicio - b.inicio);
  function textoEmBreve(r, agora) {
    const falta = Math.round((r.inicio - agora) / 60), sala = nomeSala(r.sala);
    return `${r.titulo} começa ${falta > 0 ? `em ${falta} min` : "agora"}${sala ? `, na ${sala}` : ""}.`;
  }

  // ---- o formulário: {problema} ou {problema: null, corpo} já no formato do POST /api/reunioes/marcar
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/, DIA = /^(\d{4})-(\d{2})-(\d{2})$/, ANO = 366 * 86400;
  function validarReuniao(c, agoraMs, lim) {
    const l = lim || {}, max = l.titulo_max || 80, dmin = l.duracao_min || 5, dmax = l.duracao_max || 480, cmax = l.convidados_max || 50;
    const titulo = String(c.titulo || "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
    const p = problema => ({ problema });
    if (!titulo) return p("Escreva o título da reunião.");
    if ([...titulo].length > max) return p(`O título passa de ${max} caracteres.`);
    if (!salaOk(c.sala)) return p("Escolha a sala.");
    const d = DIA.exec(c.dia || ""), h = HHMM.exec(c.hora || "");
    if (!d) return p("Escolha o dia.");
    if (!h) return p("Escolha a hora.");
    const inicio = epoch(new Date(+d[1], +d[2] - 1, +d[3], +h[1], +h[2])), agora = Math.floor(agoraMs / 1000);
    if (inicio < agora - 60) return p("Esse horário já passou.");
    if (inicio > agora + ANO) return p("Marque com até 1 ano de antecedência.");
    const duracao = /^\d+$/.test(String(c.duracao)) ? Number(c.duracao) : NaN;
    if (!(duracao >= dmin && duracao <= dmax)) return p(`A duração vai de ${dmin} a ${dmax} minutos.`);
    const convidados = Array.isArray(c.convidados) ? [...new Set(c.convidados)] : [];
    if (convidados.length > cmax) return p(`Convide até ${cmax} pessoas.`);
    return { problema: null, corpo: { titulo, sala: c.sala, inicio, duracao, convidados } };
  }
  const urlIcs = id => `api/reunioes/ics?id=${id}`;

  const puro = { linkValido, nomeSala, salaOk, salasDoMapa, semana, epoch, data, mesmoDia, doDia, faixa, duracaoTexto, chaveAviso, emBreve,
    textoEmBreve, validarReuniao, urlIcs, ERRO_LINK };
  if (typeof document === "undefined") return puro;
  return puro;
})();
if (typeof window !== "undefined") window.Reunioes = Reunioes;
