"use strict";
// Recepção no mapa (static/recepcao.js): a contagem da fila (agentes + terminais, sem duplicata), o estado vazio que não
// vira zero em falha e o abrir/fechar com foco e Esc. Só a peça nova, sem carregar o app.js inteiro.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {}, Date, console };
vm.runInNewContext(fs.readFileSync("static/recepcao.js", "utf8"), contexto);
const { pendentes, classeVazio, encaixar, criar, marcarFichaDaRecepcao, consumirFichaDaRecepcao } = contexto.window.Recepcao;

const trabalho = (id, status, extra = {}) => ({ id, agente_id: `agente-${id}`, status, rotulo: `Tarefa ${id}`, started_at: "2026-11-25T10:00:00Z", ...extra });

// ---------------------------------------------------------------- contagem por origem (arrays já filtrados)
{
  const agentes = [trabalho(1, "waiting_approval"), trabalho(2, "waiting_input")];
  const terminais = [
    { id: "t1", estado: "aprovacao" },
    { id: "t2", estado: "pergunta" },
    { id: "t3", estado: "erro" },
  ];
  const r = pendentes(agentes, terminais);
  assert.equal(r.total, 5, "2 agentes + 3 terminais, o mesmo que o widget mostra");
  assert.deepEqual([...r.agentes].map(t => t.id), [1, 2]);
  assert.deepEqual([...r.terminais].map(d => d.id), ["t1", "t2", "t3"]);
}

// duplicata não conta duas vezes: o mesmo run_id de agente e o mesmo id de terminal
{
  const mesmo = trabalho(7, "waiting_approval", { run_id: "run-7" });
  const r = pendentes([mesmo, { ...mesmo }, mesmo], [{ id: "x", estado: "pergunta" }, { id: "x", estado: "pergunta" }]);
  assert.equal(r.total, 2, "um agente e um terminal, mesmo repetidos");
  assert.equal(r.agentes.length, 1);
  assert.equal(r.terminais.length, 1);
}

// sem lista (carregando, falha ou saguão) não inventa pendência
{
  assert.equal(pendentes(null, null).total, 0);
  assert.equal(pendentes([], []).total, 0);
  assert.equal(pendentes(undefined, undefined).total, 0);
}

// a ordem da fonte é preservada (o widget já ordena por quem espera há mais tempo)
{
  const r = pendentes([trabalho(1, "waiting_approval"), trabalho(2, "waiting_input")], []);
  assert.deepEqual([...r.agentes].map(t => t.id), [1, 2]);
}

// ---------------------------------------------------------------- vazio x falha
{
  assert.equal(classeVazio("pronto", 0), "sem-pendencias");
  assert.equal(classeVazio("pronto", 3), "");
  assert.equal(classeVazio("carregando", 0), "carregando");
  for (const situacao of ["falha", "sem_conexao", "recusada", "outra_org", "pausa", "conferindo"])
    assert.equal(classeVazio(situacao, 0), "indisponivel", `${situacao} não pode parecer zero`);
}

// ---------------------------------------------------------------- encaixe no mapa
{
  const area = { w: 800, h: 600 };
  let enc = encaixar(-50, -50, 100, 40, area);
  assert.equal(enc.x, 0); assert.equal(enc.y, 0);
  enc = encaixar(900, 900, 100, 40, area);
  assert.equal(enc.x, 700); assert.equal(enc.y, 560);
  // embaixo dos controles da câmera (canto de cima à direita): sobe para cima deles
  const ctl = { x: 650, y: 8, w: 140, h: 40 };
  const p = encaixar(660, 10, 120, 30, area, ctl);
  assert.ok(p.y + 30 <= ctl.y || p.x + 120 <= ctl.x || p.y >= ctl.y + ctl.h, "o atalho não fica em cima dos controles");
}

// ---------------------------------------------------------------- abrir, fechar, foco e Esc
function falso(extra = {}) {
  const e = { hidden: false, attrs: {}, ouvintes: {}, focado: false, ...extra };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = k => (k in e.attrs ? e.attrs[k] : null);
  e.addEventListener = (t, f) => { (e.ouvintes[t] ||= []).push(f); };
  e.focus = () => { e.focado = true; };
  e.clique = () => (e.ouvintes.click || []).forEach(f => f({ target: e }));
  return e;
}
{
  const item = falso(), fecharBt = falso(), gatilho = falso();
  const painel = falso({ querySelector: sel => (sel.includes("recepc-fechar") ? fecharBt : item) });
  const ctrl = criar({ botao: gatilho, painel, botaoFechar: fecharBt });

  assert.equal(ctrl.estaAberto(), false, "começa fechada");
  ctrl.abrir();
  assert.equal(ctrl.estaAberto(), true);
  assert.equal(painel.hidden, false);
  assert.equal(gatilho.getAttribute("aria-expanded"), "true");
  assert.equal(item.focado, true, "o foco vai para o primeiro item da lista");

  // Esc com o foco na interface acionada fecha, devolve o foco ao gatilho e não deixa o Esc seguir
  const esc = { key: "Escape", preventDefault() { this.p = 1; }, stopPropagation() { this.s = 1; } };
  (painel.ouvintes.keydown || []).forEach(f => f(esc));
  assert.equal(ctrl.estaAberto(), false);
  assert.equal(painel.hidden, true);
  assert.equal(gatilho.getAttribute("aria-expanded"), "false");
  assert.equal(gatilho.focado, true, "o foco volta ao gatilho");
  assert.equal(esc.p, 1); assert.equal(esc.s, 1);

  // outra tecla não fecha
  ctrl.abrir();
  (painel.ouvintes.keydown || []).forEach(f => f({ key: "ArrowDown", preventDefault() {}, stopPropagation() {} }));
  assert.equal(ctrl.estaAberto(), true);

  // o botão de fechar também devolve o foco
  gatilho.focado = false;
  fecharBt.clique();
  assert.equal(ctrl.estaAberto(), false);
  assert.equal(gatilho.focado, true);
}

// fechar sem devolver foco não rouba o foco da ficha que abriu pelo item
{
  const item = falso(), gatilho = falso();
  const painel = falso({ querySelector: sel => (sel.includes("recepc-fechar") ? null : item) });
  const ctrl = criar({ botao: gatilho, painel });
  ctrl.abrir();
  gatilho.focado = false;
  ctrl.fechar(false);
  assert.equal(ctrl.estaAberto(), false);
  assert.equal(gatilho.focado, false);
  ctrl.abrir(); ctrl.fechar(false);   // repetir não quebra
  assert.equal(ctrl.estaAberto(), false);
}

// ---------------------------------------------------------------- a ficha da recepção (marca de uso único)
{
  assert.equal(consumirFichaDaRecepcao(), false, "sem clique na recepção, nenhuma ficha é marcada");
  marcarFichaDaRecepcao();
  assert.equal(consumirFichaDaRecepcao(), true, "a próxima ficha aberta vem da recepção");
  assert.equal(consumirFichaDaRecepcao(), false, "a marca vale uma vez só; outra origem não herda");
}

console.log("test_recepcao.js: ok");
