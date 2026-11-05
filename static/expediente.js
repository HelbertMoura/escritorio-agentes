// Expediente: das quantas às quantas o escritório abre ("expediente": {abre, fecha} em HH:MM, do Personalizar ou
// do times.json, já normalizado pelo /api/config). Fora dele, quem está sem tarefa vai para casa (vida.js) e uma
// faixa no mapa avisa (app.js). Sem configuração (e na demonstração): 07:00 às 20:00. abre > fecha é o turno que
// vira a meia-noite (22:00 às 06:00); abre == fecha não vale. As horas comparadas são decimais, como o Ceu.agora().h.
"use strict";
const Expediente = (() => {
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  let abre = "07:00", fecha = "20:00";
  const horas = t => { const m = HHMM.exec(t); return m ? +m[1] + +m[2] / 60 : NaN; };
  const valido = (a, f) => HHMM.test(a) && HHMM.test(f) && a !== f;
  function definir(e) { if (e && valido(e.abre, e.fecha)) { abre = e.abre; fecha = e.fecha; } }
  function fora(h, a = abre, f = fecha) {
    const ha = horas(a), hf = horas(f);
    return ha < hf ? h < ha || h >= hf : h >= hf && h < ha;
  }
  // quanto dura o turno, em horas (22:00 às 06:00 = 8)
  const duracao = (a = abre, f = fecha) => (horas(f) - horas(a) + 24) % 24;
  return { definir, fora, valido, duracao, proximaAbertura: () => abre, get abre() { return abre; }, get fecha() { return fecha; } };
})();
window.Expediente = Expediente;
