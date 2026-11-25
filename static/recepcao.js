// Recepção no mapa (Firmópolis): o atalho "Esperando você" ligado à recepção, com a lista recolhível.
// Sem chamadas novas: conta os mesmos pedidos que o widget abaixo do mapa (agentes esperando + terminais da ponte).
// Sem dependência do app.js — funções puras e um controlador de abrir/fechar para poder testar sem navegador.
"use strict";
(function (global) {
  // Uma pendência de agente é um trabalho em waiting_*; a chave do run evita contar o mesmo pedido duas vezes.
  function chaveAgente(t) {
    if (t.run_id != null) return "run:" + t.run_id;
    if (t.id != null) return "id:" + t.id;
    return "ag:" + (t.agente_id != null ? t.agente_id : "") + "|" + (t.rotulo || "") + "|" + (t.started_at || t.desde || "");
  }

  // Os arrays chegam JÁ filtrados pela fonte (renders atuais do widget). Aqui só tiramos a duplicata, sem refiltrar
  // nem buscar nada: a contagem do atalho é a mesma do widget, inclusive para os terminais da ponte.
  function pendentes(agentesFonte, terminaisFonte) {
    const agentes = [], vistos = new Set();
    for (const t of Array.isArray(agentesFonte) ? agentesFonte : []) {
      if (!t) continue;
      const k = chaveAgente(t);
      if (vistos.has(k)) continue;
      vistos.add(k); agentes.push(t);
    }
    const terminais = [], ids = new Set();
    for (const d of Array.isArray(terminaisFonte) ? terminaisFonte : []) {
      if (!d) continue;
      const k = "term:" + d.id;
      if (ids.has(k)) continue;
      ids.add(k); terminais.push(d);
    }
    return { total: agentes.length + terminais.length, agentes, terminais };
  }

  // O texto de vazio nunca transforma falha ou carregamento em "zero": só a leitura de pé e sem pedidos é "sem-pendencias".
  function classeVazio(situacao, total) {
    if (total > 0) return "";
    if (situacao === "carregando") return "carregando";
    if (situacao === "pronto") return "sem-pendencias";
    return "indisponivel";
  }

  function cruza(x, y, w, h, r) {
    return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
  }
  // Encaixa um retângulo na área e desvia dos controles da câmera sem sair do mapa.
  function encaixar(x, y, w, h, area, evitar) {
    const maxX = Math.max(0, area.w - w), maxY = Math.max(0, area.h - h);
    x = Math.min(Math.max(0, x), maxX);
    y = Math.min(Math.max(0, y), maxY);
    if (!evitar || !cruza(x, y, w, h, evitar)) return { x, y };
    const cima = evitar.y - h - 8;
    if (cima >= 0) return { x, y: cima };
    const esq = evitar.x - w - 8;
    if (esq >= 0) return { x: esq, y };
    const baixo = evitar.y + evitar.h + 8;
    return { x, y: Math.min(Math.max(0, baixo), maxY) };
  }

  // A ficha aberta por um item da recepção ganha o recorte do celular (40dvh). A marca vale para a próxima abertura
  // de ficha, inclusive a do terminal; uma origem de fora simplesmente não consome nada.
  let fichaDaRecepcao = false, fichaTimer = 0;
  function marcarFichaDaRecepcao() {
    fichaDaRecepcao = true;
    if (typeof clearTimeout === "function") clearTimeout(fichaTimer);
    if (typeof setTimeout === "function") fichaTimer = setTimeout(() => { fichaDaRecepcao = false; }, 0);
  }
  function consumirFichaDaRecepcao() {
    const veio = fichaDaRecepcao;
    fichaDaRecepcao = false;
    if (typeof clearTimeout === "function") clearTimeout(fichaTimer);
    return veio;
  }

  // Abre e fecha a lista: fecha com o botão, ou com Esc quando o foco está dentro; devolve o foco ao gatilho.
  function criar({ botao, painel, botaoFechar, aoAbrir, aoFechar }) {
    let aberto = false;
    function focarPrimeiro() {
      const alvo = painel.querySelector(".recepc-lista .linha-ir, .recepc-lista a, .recepc-lista button")
        || painel.querySelector(".recepc-fechar") || painel;
      if (alvo && alvo.focus) alvo.focus({ preventScroll: true });
    }
    function abrir() {
      if (aberto) return;
      aberto = true;
      painel.hidden = false;
      botao.setAttribute("aria-expanded", "true");
      if (aoAbrir) aoAbrir();
      focarPrimeiro();
    }
    function fechar(devolverFoco) {
      if (!aberto) return;
      aberto = false;
      painel.hidden = true;
      botao.setAttribute("aria-expanded", "false");
      if (aoFechar) aoFechar();
      if (devolverFoco && botao.focus) botao.focus({ preventScroll: true });
    }
    function alternar() { if (aberto) fechar(true); else abrir(); }
    painel.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !aberto) return;
      ev.preventDefault();
      ev.stopPropagation();   // não fecha os outros diálogos (a ficha, a conversa) que estejam embaixo
      fechar(true);
    });
    if (botaoFechar) botaoFechar.addEventListener("click", () => fechar(true));
    return { abrir, fechar, alternar, estaAberto: () => aberto };
  }

  global.Recepcao = { pendentes, classeVazio, encaixar, criar, marcarFichaDaRecepcao, consumirFichaDaRecepcao };
})(typeof window !== "undefined" ? window : globalThis);
