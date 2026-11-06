// Regressão da vida do escritório (static/vida.js) num Chrome ou Edge headless sobre a prévia.
// Relógio virtual (performance.now) e laço do app parado: a simulação chama Vida.passo em passos de 1/30 s,
// muito mais rápido que o tempo real, e confere a cada 0,5 s virtual:
//   - invasão parado: alguém parado numa vaga criada na hora (roda, torcida, plateia, aquário...) em cima de móvel;
//   - invasão andando: alguém andando por dentro de móvel, longe do começo e do fim do trecho (perto deles é onde se senta);
//   - presos: andando sem sair do lugar por 5 s (fora a pausa do high-five);
//   - sem lugar: parado sem lugar nem rota;
//   - vagas órfãs: reservadas por mais de 3 s para alguém que não está nela, nem indo, nem chamado para a roda;
//   - espera fora da mesa: quem espera você (status waiting*) longe da mesa e sem ir para ela por mais de 3 s;
//   - trabalho na cena: alguém com tarefa lutando ou parado na plateia do ringue (vida social: o trabalho real manda);
//   - exceções no Vida.passo e erros ou avisos no console da página.
// Com --acoes, depois do estresse confere também a interface das brincadeiras (Vida.objetoClicado, Vida.festaGeral e os sons).
// Com --prints, tira um print de cada cena (campeonato, xadrez, piada na roda...) em .previa/telas/<prefixo>_<cena>.png.
// Com --brigas N, força N brigas da vida social (uma de cada vez, no formato do servidor) entre dois livres e conta as que
// lutaram e as que tiveram plateia; briga marcada que não chegou a lutar é achado. O par sai de todos os livres no prédio,
// andando ou não, e em 2 de cada 3 brigas alguém (lutador ou plateia) pega tarefa no meio da luta: tem de ir para a mesa
// em até 3 s (tarefaSemMesa). Com --longe, o par sai dos dois livres mais longe do ringue. Com --calmo, a página roda
// com prefers-reduced-motion: reduce: ninguém pode correr (pressaNoCalmo), e o lutador que não chega andando aparece
// direto no ponto de luta (conta em "diretos"). Com --greves N, força N greves (fatia 2; uma de cada vez, no formato do
// servidor) com até 8 livres: alguém tem de sentar no chão (greveSemSentar), só quem está sentado tem plaquinha
// (placaErrada), em 2 de cada 3 um grevista sentado pega tarefa e vai para a mesa em até 3 s (tarefaSemMesa), metade acaba
// atendida e metade no horário, e 6 s depois do fim ninguém segue sentado na greve nem com plaquinha (greveNaoDispersou).
// Ninguém senta atrás da base do ringue, entre a parede e as cordas (greveAtrasDoRingue). A greve atendida traz a entrega
// do pedido (um motivo diferente a cada uma): a entrega tem de chegar (entregaSemChegar), alguém da turma vai até ela
// (entregaSemTurma), ninguém com tarefa fica parado nela (entregaComTrabalho), o motoboy da pizza para no balcão da recepção
// (motoboyLonge) e, 6 s depois, todos voltaram (greveNaoDispersou).
// Com --times N (1 a 20), remonta o
// prédio com N times, com os agentes repartidos entre eles. Durante o estresse, o Vida.social do app fica desligado.
//
// Uso (com a prévia no ar: python ferramentas/previa.py dados.json):
//   node ferramentas/estresse_vida.mjs [url] [--minutos 40] [--acoes] [--prints <prefixo>] [--grande] [--brigas 10] [--longe] [--calmo] [--greves 6] [--times 20]
//   url padrão http://127.0.0.1:7372/?hora=10.5; outros cenários: ?demo=1, ?data=2026-11-06&hora=17 (sexta à tarde)
//   --grande acrescenta 14 times vazios (prédio e salão largos) e procura uma marca com jukebox e xadrez
//   NAVEGADOR=<caminho do executável> troca o navegador; sem ela, usa o Chrome e, na falta, o Edge.
// Sai com 0 sem achados, 1 com algum achado e 2 se não conseguir rodar (navegador, prévia ou página).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opcao = nome => { const i = args.indexOf(nome); return i < 0 ? null : args.splice(i, 2)[1] ?? ""; };
const flag = nome => { const i = args.indexOf(nome); return i >= 0 && !!args.splice(i, 1); };
const MINUTOS = Number(opcao("--minutos") ?? 40), PREFIXO = opcao("--prints"), ACOES = flag("--acoes"), GRANDE = flag("--grande");
const BRIGAS = Number(opcao("--brigas") ?? 0), GREVES = Number(opcao("--greves") ?? 0), TIMES = Number(opcao("--times") ?? 0), LONGE = flag("--longe"), CALMO = flag("--calmo");
const URL_PAGINA = args[0] || "http://127.0.0.1:7372/?hora=10.5";
const TELAS = fileURLToPath(new URL("../.previa/telas/", import.meta.url));
const espera = ms => new Promise(r => setTimeout(r, ms));
let nav, perfil, ws;
// fecha o navegador, espera ele soltar o perfil temporário e apaga o perfil
const sair = async (codigo, msg) => {
  if (msg) console.error(msg);
  try { ws && ws.close(); } catch {}
  if (nav && nav.exitCode === null) { const fim = new Promise(r => nav.once("exit", r)); nav.kill(); await Promise.race([fim, espera(5000)]); }
  if (perfil) try { rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  process.exit(codigo);
};
process.on("exit", () => { try { nav && nav.exitCode === null && nav.kill(); } catch {} });   // falha no meio: não deixa navegador órfão
if (!(MINUTOS > 0)) await sair(2, "--minutos precisa ser um número maior que zero");
if (!Number.isInteger(GREVES) || GREVES < 0) await sair(2, "--greves precisa ser um inteiro >= 0");
if (!Number.isInteger(BRIGAS) || BRIGAS < 0 || !Number.isInteger(TIMES) || TIMES < 0 || TIMES > 20) await sair(2, "--brigas precisa ser um inteiro >= 0 e --times, de 1 a 20");
try { await (await fetch(URL_PAGINA)).arrayBuffer(); } catch { await sair(2, `prévia fora do ar em ${URL_PAGINA} (python ferramentas/previa.py dados.json)`); }

const NAVEGADOR = [process.env.NAVEGADOR, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/microsoft-edge"].find(c => c && existsSync(c));
if (!NAVEGADOR) await sair(2, "Chrome ou Edge não encontrado (defina NAVEGADOR)");
perfil = mkdtempSync(join(tmpdir(), "estresse-vida-"));
nav = spawn(NAVEGADOR, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${perfil}`, "--autoplay-policy=no-user-gesture-required",
  "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

// DevTools: a porta escolhida pelo navegador fica no arquivo DevToolsActivePort do perfil
let alvo;
for (let i = 0; i < 75 && !alvo; i++) {
  await espera(200);
  try { const porta = readFileSync(join(perfil, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
    alvo = (await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json()).find(t => t.type === "page"); } catch {}
}
if (!alvo) await sair(2, `o navegador não abriu o DevTools (${NAVEGADOR})`);
ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
let seq = 0; const pend = new Map(), consoleMsgs = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { r, j } = pend.get(m.id); pend.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); return; }
  if (m.method === "Runtime.exceptionThrown") consoleMsgs.push("exceção: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) consoleMsgs.push(`console.${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description).join(" "));
  if (m.method === "Log.entryAdded") consoleMsgs.push(`log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url || ""}`);
});
const cdp = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pend.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const js = async expr => { const x = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description || expr); return x.result.value; };
await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

if (CALMO) await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await cdp("Page.navigate", { url: URL_PAGINA });
const carregou = async () => { for (let i = 0; i < 60; i++) { await espera(500); try { if (await js("typeof mundo !== 'undefined' && !!mundo && mundo.lista.length > 0")) return true; } catch {} } return false; };
if (!await carregou()) await sair(2, `a página não montou o escritório (mundo vazio) em ${URL_PAGINA}\n${consoleMsgs.join("\n")}`);
if (CALMO && !await js(`matchMedia("(prefers-reduced-motion: reduce)").matches`)) await sair(2, "--calmo: o navegador não aplicou o prefers-reduced-motion");
if (TIMES) {   // os agentes repartidos em N times (1 time: uma sala só; 20: o prédio mais largo)
  console.log("times:", await js(`(() => { const hs = estado.agentes.map(a => a.handle), base = config.times[0] || {};
    config.times = Array.from({ length: ${TIMES} }, (_, i) => ({ ...base, nome: "Time " + (i + 1), tipo: "mesas", parede: i % 6, piso: i % 10,
      agentes: hs.filter((_, j) => j % ${TIMES} === i) }));
    assinatura = ""; montar(estado.agentes); return { times: config.times.length, ringue: !!predio.ringue }; })()`));
  if (!await carregou()) await sair(2, "o prédio com --times não montou");
}
if (GRANDE) {
  console.log("grande:", await js(`(() => { config.times = [...config.times, ...Array.from({ length: 14 }, (_, i) => ({ ...config.times[0], nome: "Time extra " + (i + 1), agentes: [] }))];
    const nome0 = config.empresa;
    for (let i = 0; i < 60; i++) {   // a ordem dos cantinhos do salão é sorteada pela marca (nome da empresa): procura uma com jukebox e xadrez
      config.empresa = i ? nome0 + " " + i : nome0; assinatura = ""; montar(estado.agentes);
      const r = { empresa: config.empresa, xadrez: mundo.vagas.filter(v => v.tipo === "xadrez").length, jukebox: mundo.vagas.filter(v => v.jukebox).length };
      if (r.xadrez && r.jukebox) return r;
    }
    return "sem jukebox e xadrez em 60 marcas"; })()`));
  if (!await carregou()) await sair(2, "o prédio grande não montou");
}

// instala o simulador na página
await js(`(() => {
  const raf = window.requestAnimationFrame.bind(window), agoraReal = performance.now.bind(performance);
  let virt = agoraReal(), desenhando = false, base = 0, ancora = 0;
  performance.now = () => desenhando ? base + (agoraReal() - ancora) : virt;
  window.requestAnimationFrame = f => desenhando ? raf(f) : 0;   // sem desenhar: o laço do app para no próximo quadro
  const solo = (x, y) => [...mundo.predio.salas, ...mundo.predio.baixo].some(s => x >= s.px + 5 && x <= s.px + s.pw - 5 && y >= s.chao + 5 && y <= s.py + s.ph - 3);
  const E = window.__E = { seg: 0, passos: 0, erros: [], invasaoParado: 0, invasaoAndando: 0, exInvasao: [], presos: 0, exPresos: [], semLugar: 0, exSemLugar: [],
    orfas: 0, exOrfas: [], esperaFora: 0, exEsperaFora: [], trabalhoNaCena: 0, exTrabalhoNaCena: [], eventos: {}, poses: {}, falas: {}, tiposVaga: {} };
  // vida social: o app.js não mexe na cena (a prévia manda o social de verdade a cada 10 s); as brigas forçadas usam o original
  // As tarefas também ficam com o estresse: na regra dura, um lutador ou alguém da plateia pega tarefa no meio da luta
  const social = Vida.social, sincronizar = Vida.sincronizar;
  Vida.social = () => {}; Vida.sincronizar = () => {};
  const B = E.brigas = { faltam: ${BRIGAS}, prox: virt / 1000 + 20, atual: null, n: 0, marcadas: 0, lutaram: 0, comPlateia: 0, maiorPlateia: 0,
    tarefas: 0, semMesa: 0, exSemMesa: [], diretos: 0, pressaCalmo: 0, exPressaCalmo: [] };
  const CALMO = ${CALMO}, LONGE = ${LONGE};
  const G = E.greves = { faltam: ${GREVES}, prox: virt / 1000 + 25, atual: null, n: 0, marcadas: 0, sentaram: 0, maiorSentados: 0, atendidas: 0,
    semSentar: 0, placaErrada: 0, exPlaca: [], naoDispersou: 0, exDispersou: [], atras: 0,
    entregas: 0, entregues: 0, semChegar: 0, semTurma: 0, comTrabalho: 0, motoboyLonge: 0, itens: {} };
  const MOTIVOS = [0, 7, 9, 1, 8, 5, 2, 3, 4, 6];   // café, pizza, ar, sexta livre, soneca, bolo, pufe, wi-fi, menos reunião, bug
  const naGreve = (o, id) => !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.tipo === "greve" && o.lugar.vaga.dono === id;
  const noPredio = b => b.x >= 0 && (b.rota.length ? !(b.destino && b.destino.tipo === "fora") : !!b.lugar && b.lugar.tipo !== "fora");
  const extras = [], STATUS = ["running", "waiting_input", "waiting_approval"];
  const tarefas = () => {
    const mesas = new Map();
    for (const s of mundo.predio.salas) for (const k of s.mesas || []) if (k.handle) mesas.set(k.handle, k);
    sincronizar(mundo, estado.agentes || [], [...(estado.trabalhos || []), ...extras], mesas, aparencia, false);
  };
  const iso = s => new Date(s * 1000).toISOString();
  const plateia = id => mundo.lista.filter(o => !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.tipo === "ringue" && o.lugar.vaga.dono === id).length;
  const brigar = agora => {
    const c = B.atual;
    if (CALMO) for (const o of mundo.lista) if (o.pressa > 1) {   // movimento reduzido: ninguém corre, nem lutador nem plateia
      B.pressaCalmo++; if (B.exPressaCalmo.length < 5) B.exPressaCalmo.push({ id: o.id, pressa: o.pressa, cena: c && c.id });
    }
    if (c) {
      if (!c.chamado && mundo.cena && mundo.cena.id === c.id && mundo.cena.fase !== "espera") {   // primeiro instante depois do gongo
        c.chamado = true;
        for (const id of [c.a, mundo.cena.b]) { const o = mundo.bonecos.get(id);
          if (o && !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.tipo === "luta" && o.lugar.vaga.dono === c.id) B.diretos++; }
      }
      if (mundo.cenaSocial && mundo.cenaSocial.id === c.id && mundo.cenaSocial.fase === "luta") {
        c.lutou = true; c.plateia = Math.max(c.plateia, plateia(c.id));
        if (!c.dada && c.n % 3) {   // 2 de cada 3 brigas: tarefa (running ou waiting_*) para um lutador ou para alguém da plateia
          const alvo = c.n % 3 === 1 ? mundo.bonecos.get(c.a)
            : mundo.lista.find(o => !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.tipo === "ringue" && o.lugar.vaga.dono === c.id);
          if (alvo && alvo.mesa) {
            c.dada = { id: alvo.id, em: agora, ok: false };
            extras.push({ agente_id: alvo.id, run_id: "estresse-" + c.id, status: STATUS[B.tarefas++ % 3], rotulo: "Tarefa do estresse", url: "" });
            tarefas();
          }
        }
      }
      if (c.dada && !c.dada.ok) {   // quem pegou a tarefa vai para a mesa em até 3 s
        const b = mundo.bonecos.get(c.dada.id);
        if (b && ((b.lugar && b.lugar.tipo === "mesa") || (b.destino && b.destino.tipo === "mesa"))) c.dada.ok = true;
        else if (agora - c.dada.em > 3) {
          c.dada.ok = true; B.semMesa++;
          if (B.exSemMesa.length < 5) B.exSemMesa.push({ id: c.dada.id, cena: c.id, lugar: b && b.lugar && (b.lugar.vaga ? b.lugar.vaga.tipo : b.lugar.tipo) });
        }
      }
      if (agora < c.fim + 10) return;
      social(mundo, { v: 1, agora: iso(agora), serio: false, cena: null, eventos: [] });   // o servidor tira a cena no fim + 10 s
      if (c.dada) { extras.length = 0; tarefas(); }   // a tarefa acaba: volta a ficar livre
      B.lutaram += c.lutou; B.comPlateia += c.lutou && c.plateia > 0; B.maiorPlateia = Math.max(B.maiorPlateia, c.plateia);
      B.atual = null; B.prox = agora + 20;
      return;
    }
    if (!B.faltam || agora < B.prox || G.atual) return;
    // o par sai de todos os livres no prédio, andando ou não, como fazem o servidor e o seletor da ficha
    const livres = mundo.lista.filter(b => !b.trabalho && !b.reuniao && noPredio(b)).sort(() => Math.random() - 0.5);
    const r = mundo.predio.ringue, rx = r ? r.x + r.w / 2 : 0;
    if (LONGE && r) livres.sort((p, q) => Math.abs(q.x - rx) - Math.abs(p.x - rx));   // os dois mais longe do ringue
    if (livres.length < 2) { B.prox = agora + 15; return; }
    const id = "estresse-" + ++B.n, [a, b] = livres;
    // com --calmo, metade das brigas chega atrasada, no pior caso real: a tela lê o /api/estado a cada 10 s, então vê a cena
    // até 10 s depois de marcada (gongo em 5 s, fim em 35 s). Aí o lutador longe não chega andando a 1x e tem de aparecer
    // direto no ponto de luta
    const [ini, fim] = CALMO && B.n % 2 === 0 ? [5, 35] : [15, 45];
    B.atual = { id, n: B.n, a: a.id, fim: agora + fim, lutou: false, plateia: 0, dada: null }; B.faltam--; B.marcadas++;
    social(mundo, { v: 1, agora: iso(agora), serio: false, eventos: [], cena: { id, tipo: "briga", a: a.id, b: b.id, vencedor: Math.random() < 0.5 ? a.id : b.id,
      inicio: iso(agora + ini), fim: iso(agora + fim), origem: "ordem" } });
  };
  const grevar = agora => {
    const c = G.atual;
    if (c && !c.acabou) {
      const sentados = mundo.lista.filter(o => naGreve(o, c.id));
      c.max = Math.max(c.max, sentados.length);
      const pr = mundo.predio.ringue;   // na frente do ringue, nunca entre a parede e as cordas
      if (pr) for (const o of sentados) if (o.y < pr.y + pr.h && !c.atras.has(o.id)) { c.atras.add(o.id); G.atras++; }
      const ativa = mundo.cena && mundo.cena.id === c.id && mundo.cena.fase !== "fim";   // no "ate", as plaquinhas saem antes de levantarem
      for (const o of mundo.lista) if (ativa && !!o.placa !== sentados.includes(o)) {   // plaquinha só em quem está sentado na greve
        G.placaErrada++; if (G.exPlaca.length < 5) G.exPlaca.push({ id: o.id, placa: o.placa, sentado: sentados.includes(o), greve: c.id });
      }
      if (!c.dada && c.n % 3 && sentados.length && sentados[0].mesa) {   // 2 de cada 3: um grevista sentado pega tarefa
        c.dada = { id: sentados[0].id, em: agora, ok: false };
        extras.push({ agente_id: sentados[0].id, run_id: "estresse-" + c.id, status: STATUS[B.tarefas++ % 3], rotulo: "Tarefa do estresse", url: "" });
        tarefas();
      }
      if (c.dada && !c.dada.ok) {
        const b = mundo.bonecos.get(c.dada.id);
        if (b && ((b.lugar && b.lugar.tipo === "mesa") || (b.destino && b.destino.tipo === "mesa"))) c.dada.ok = true;
        else if (agora - c.dada.em > 3) {
          c.dada.ok = true; B.semMesa++;
          if (B.exSemMesa.length < 5) B.exSemMesa.push({ id: c.dada.id, cena: c.id, lugar: b && b.lugar && (b.lugar.vaga ? b.lugar.vaga.tipo : b.lugar.tipo) });
        }
      }
      if (agora < c.acaba) return;
      c.acabou = agora;   // atendida (o servidor tira a cena e manda o evento) ou no horário (o servidor tira a cena no "ate")
      social(mundo, { v: 1, agora: iso(agora), serio: false, cena: null, eventos: c.n % 2 ? [{ id: "atd-" + c.id, tipo: "atendida", greve: c.id,
        motivo: c.motivo, participantes: c.ps, em: iso(agora) }] : [] });
      G.atendidas += c.n % 2;
      if (c.dada) { extras.length = 0; tarefas(); }
      return;
    }
    if (c && c.n % 2 && !c.fimEntrega) {   // greve atendida: a entrega do pedido chega, a turma vai até ela e depois volta
      const en = mundo.entrega, eid = "entrega-atd-" + c.id;
      if (en && en.id === eid) {
        if (!c.viu) {
          c.viu = true; G.entregas++; G.itens[en.item] = (G.itens[en.item] || 0) + 1;
          if (en.item === "pizza" && !(en.entregador && en.entregador.parada.sala.tipo === "recepcao")) G.motoboyLonge++;   // a pizza fica no balcão
        }
        if (en.fase === "entregue") {
          if (!c.entregue) { c.entregue = true; G.entregues++; }
          const turma = mundo.lista.filter(o => c.ps.includes(o.id) && !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.dono === eid);
          c.turma = Math.max(c.turma || 0, turma.length);
        }
        for (const o of mundo.lista) if (o.trabalho && !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.dono === eid) G.comTrabalho++;
      }
      if ((c.viu && (!en || en.id !== eid)) || agora - c.acabou > 120) {
        c.fimEntrega = agora;
        if (!c.entregue) G.semChegar++;
        else if (!c.turma) G.semTurma++;
      }
      return;
    }
    if (c) {
      if (agora - (c.fimEntrega || c.acabou) < 6) return;
      const ficou = mundo.lista.filter(o => naGreve(o, c.id) || o.placa || (!o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.dono === "entrega-atd-" + c.id));
      G.naoDispersou += ficou.length;
      for (const o of ficou.slice(0, 5 - G.exDispersou.length)) G.exDispersou.push({ id: o.id, placa: o.placa, greve: c.id });
      G.sentaram += c.max > 0; G.semSentar += c.max === 0; G.maiorSentados = Math.max(G.maiorSentados, c.max);
      G.atual = null; G.prox = agora + 20;
      return;
    }
    if (!G.faltam || agora < G.prox || B.atual) return;
    const livres = mundo.lista.filter(b => !b.trabalho && !b.reuniao && noPredio(b)).sort(() => Math.random() - 0.5).slice(0, 8);
    if (livres.length < 3) { G.prox = agora + 15; return; }
    const id = "greve-" + ++G.n, ps = livres.map(b => b.id), dura = 60;
    const motivo = MOTIVOS[Math.floor((G.n - 1) / 2) % MOTIVOS.length];
    G.atual = { id, n: G.n, ps, motivo, acaba: G.n % 2 ? agora + 45 : agora + dura + 0.5, max: 0, dada: null, atras: new Set() }; G.faltam--; G.marcadas++;
    social(mundo, { v: 1, agora: iso(agora), serio: false, eventos: [], cena: { id, tipo: "greve", participantes: ps, motivo,
      inicio: iso(agora), ate: iso(agora + dura), origem: "auto" } });
  };
  const rastro = new Map(), orfaDesde = new Map(), foraDesde = new Map(), inicio = new Map(), feitas = new Set();
  let cena = null;
  const falasDe = Vida.FRASES;
  const marca = (k, n = 1) => { E.falas[k] = (E.falas[k] || 0) + n; };
  window.__simular = segundos => {
    const dt = 1 / 30;
    for (let k = 0; k < Math.round(segundos * 30); k++) {
      virt += dt * 1000; E.passos++;
      try { Vida.passo(mundo, dt); } catch (e) { if (E.erros.length < 5) E.erros.push(String(e && e.stack || e)); }
      for (const ev of mundo.eventos.splice(0)) { const n = ev.nome || ev; E.eventos[n] = (E.eventos[n] || 0) + 1; }
      // começo do trecho: guardado a cada rota nova. Quem troca de destino no meio do caminho ganha outra rota (outro array)
      // que sai de onde está, e esse ponto de partida conta como começo, mesmo se o destino for o mesmo
      for (const b of mundo.lista) { if (b.rota.length) { const i = inicio.get(b.id); if (!i || i.rota !== b.rota) inicio.set(b.id, { x: b.x, y: b.y, rota: b.rota }); } else inicio.delete(b.id); }
      if (!cena) for (const [nome, f] of Object.entries(window.__cenas || {})) if (!feitas.has(nome)) { const p = f(); if (p) { feitas.add(nome); cena = { nome, p }; } }
      if (cena) { const c = cena; cena = null; return { seg: E.seg, cena: c }; }
      if (k % 15) continue;   // conferências a cada 0,5 s
      E.seg += 0.5;
      const agora = virt / 1000;
      const cs = mundo.cena && mundo.cena.fase !== "fim" && mundo.cena.fase !== "espera" ? mundo.cena : null;
      for (const b of mundo.lista) {
        E.poses[b.pose] = (E.poses[b.pose] || 0) + 1;
        const v = b.lugar && b.lugar.vaga;
        if (v && !b.rota.length) E.tiposVaga[v.tipo] = (E.tiposVaga[v.tipo] || 0) + 1;
        if (b.fala) {
          if (/^(Campeão|É campeão|Levei essa|Xeque-mate|Mate em três)/.test(b.fala)) marca("campeao");
          if (falasDe.risadas.includes(b.fala)) marca("risada");
          if (falasDe.piadas.some(p => p[0] === b.fala)) marca("piada");
          if (falasDe.karaoke.includes(b.fala)) marca("karaoke");
          if (falasDe.guerra.includes(b.fala)) marca("guerra");
          if (falasDe.aviao.includes(b.fala)) marca("aviao");
        }
        if (b.rota.length && !(b.pausa > agora)) {
          const r = rastro.get(b.id);
          if (!r || Math.hypot(r.x - b.x, r.y - b.y) > 1) rastro.set(b.id, { x: b.x, y: b.y, t: agora });
          else if (agora - r.t > 5) { E.presos++; if (E.exPresos.length < 5) E.exPresos.push({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), destino: b.destino && b.destino.tipo }); r.t = agora; }
        } else rastro.delete(b.id);
        if (!b.rota.length && !b.lugar) { E.semLugar++; if (E.exSemLugar.length < 5) E.exSemLugar.push({ id: b.id, x: Math.round(b.x), y: Math.round(b.y) }); }
        if (!b.rota.length && v && v.temp && !v.senta && v.tipo !== "festa" && v.tipo !== "visita" && solo(b.x, b.y) && !mundo.predio.livre(b.x, b.y)) {
          E.invasaoParado++; if (E.exInvasao.length < 5) E.exInvasao.push({ id: b.id, tipo: v.tipo, x: Math.round(b.x), y: Math.round(b.y) });
        }
        if (b.rota.length && solo(b.x, b.y) && !mundo.predio.livre(b.x, b.y)) {
          const fim = b.rota[b.rota.length - 1], ini = inicio.get(b.id);
          if (Math.hypot(fim[0] - b.x, fim[1] - b.y) > 24 && (!ini || Math.hypot(ini.x - b.x, ini.y - b.y) > 24)) {
            E.invasaoAndando++; if (E.exInvasao.length < 5) E.exInvasao.push({ id: b.id, andando: true, x: Math.round(b.x), y: Math.round(b.y), para: b.destino && (b.destino.vaga ? b.destino.vaga.tipo : b.destino.tipo) });
          }
        }
        if (b.trabalho && /^waiting/.test(b.trabalho.status) && b.mesa && !(b.lugar && b.lugar.tipo === "mesa") && !(b.destino && b.destino.tipo === "mesa")) {
          const d = foraDesde.get(b.id) ?? agora; foraDesde.set(b.id, d);
          if (agora - d > 3) { E.esperaFora++; if (E.exEsperaFora.length < 5) E.exEsperaFora.push({ id: b.id, lugar: b.lugar && (b.lugar.vaga ? b.lugar.vaga.tipo : b.lugar.tipo) }); foraDesde.set(b.id, agora); }
        } else foraDesde.delete(b.id);
        const dono = (v && v.dono) || (b.destino && b.destino.vaga && b.destino.vaga.dono);
        if (cs && b.trabalho && (cs.lutadores.includes(b.id) || (dono === cs.id && !b.rota.length))) {
          E.trabalhoNaCena++; if (E.exTrabalhoNaCena.length < 5) E.exTrabalhoNaCena.push({ id: b.id, cena: cs.id, fase: cs.fase });
        }
      }
      for (const v of mundo.vagas) {
        const b = v.ocupante && mundo.bonecos.get(v.ocupante);
        const ok = !v.ocupante || (b && ((b.lugar && b.lugar.vaga === v) || (b.destino && b.destino.vaga === v) || b.irRoda === v));
        if (ok) { orfaDesde.delete(v); continue; }
        const d = orfaDesde.get(v) ?? agora; orfaDesde.set(v, d);
        if (agora - d > 3) { E.orfas++; if (E.exOrfas.length < 5) E.exOrfas.push({ tipo: v.tipo, x: v.x, y: v.y, ocupante: v.ocupante }); orfaDesde.set(v, agora); }
      }
      brigar(agora); grevar(agora);   // depois das conferências: a tarefa dada agora só é cobrada depois que o vida.js teve quadros para reagir
    }
    return { seg: E.seg, cena: null };
  };
  window.__desenhar = liga => { if (liga && !desenhando) { base = virt; ancora = agoraReal(); desenhando = true; raf(quadro); } else if (!liga && desenhando) { virt = performance.now(); desenhando = false; } };
  return true;
})()`);

const print = async nome => {
  mkdirSync(TELAS, { recursive: true });
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(TELAS, `${nome}.png`), Buffer.from(data, "base64")); console.log(`print .previa/telas/${nome}.png`);
};
// desenha uns quadros em tempo real com a câmera no ponto e tira o print; depois o relógio volta a ser virtual
const fotografar = async (nome, x, y, k = 3.4) => {
  if (PREFIXO === null) return;
  await js(`__desenhar(true); moverCamera({ x: ${x}, y: ${y}, k: ${k} }, true)`); await espera(450);
  await print(`${PREFIXO}_${nome}`); await js("__desenhar(false)");
};

// cenas: quando a condição aparece na simulação, a simulação para ali e sai o print
const CENAS = {
  campeonato_torcida: `(() => { const t = mundo.lista.find(b => !b.rota.length && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "torcida"); const d = t && mundo.bonecos.get(t.lugar.vaga.dono); return d && d.parceiro && d.placar && (d.placar[0] + d.placar[1]) >= 1 && mundo.lista.filter(o => o.lugar && o.lugar.vaga && o.lugar.vaga.dono === d.id && !o.rota.length).length >= 2 ? [d.x, d.y] : null; })()`,
  campeao: `(() => { const b = mundo.lista.find(b => b.fala && /^(Campeão|É campeão|Levei essa|Xeque-mate|Mate em três)/.test(b.fala) && b.festa > performance.now() / 1000); return b ? [b.x, b.y] : null; })()`,
  xadrez: `(() => { const j = mundo.lista.filter(b => !b.rota.length && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "xadrez"); return j.length >= 2 && j[0].parceiro ? [(j[0].x + j[1].x) / 2, j[0].y] : null; })()`,
  piada_roda: `(() => { const b = mundo.lista.find(b => b.grupo && b.fala && Vida.FRASES.risadas.includes(b.fala)); return b && mundo.lista.filter(o => o.grupo === b.grupo && o.fala).length >= 2 ? [b.x, b.y] : null; })()`,
  highfive: `(() => { const b = mundo.lista.find(b => b.pausa > performance.now() / 1000 && b.rota.length); return b ? [b.x, b.y] : null; })()`,
  jukebox_danca: `(() => { const d = mundo.lista.filter(b => b.pose === "dancando" && !b.rota.length); return d.length >= 2 ? [d[0].x, d[0].y] : null; })()`,
  violao_plateia: `(() => { const b = mundo.lista.find(b => b.pose === "violao"); return b && mundo.lista.some(o => !o.rota.length && o.lugar && o.lugar.vaga && o.lugar.vaga.dono === b.id) ? [b.x, b.y] : null; })()`,
  dardos: `(() => { const b = mundo.lista.find(b => b.pose === "arremesso" && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "dardos"); return b ? [b.x, b.y - 20] : null; })()`,
  basquete: `(() => { const b = mundo.lista.find(b => b.pose === "arremesso" && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "basquete"); return b ? [b.x, b.y - 20] : null; })()`,
  cesta_de_papel: `(() => { const b = mundo.lista.find(b => b.pose === "arremesso" && b.lugar && b.lugar.tipo === "mesa"); return b ? [b.x, b.y] : null; })()`,
  aviaozinho: `(() => { const b = mundo.lista.find(b => b.pose === "arremesso" && b.fala && Vida.FRASES.aviao.includes(b.fala)); return b ? [b.x, b.y] : null; })()`,
  guerra_de_papel: `(() => { const b = mundo.lista.find(b => b.pose === "arremesso" && b.fala && Vida.FRASES.guerra.includes(b.fala)); return b ? [b.x, b.y] : null; })()`,
};
// entrega: um print por item, com pelo menos 2 da turma no ponto; e o motoboy da pizza parado no balcão da recepção
if (GREVES) for (const item of ["cafe", "pizza", "ar", "faixa", "travesseiro"]) CENAS["entrega_" + item] = `(() => { const e = mundo.entrega;
  return e && e.item === "${item}" && e.fase === "entregue" && mundo.lista.filter(o => !o.rota.length && o.lugar && o.lugar.vaga
  && o.lugar.vaga.dono === e.id).length >= 2 ? [e.x, e.y - 8] : null; })()`;
if (GREVES) CENAS.motoboy_balcao = `(() => { const e = mundo.entrega, g = e && e.entregador;
  return e && e.item === "pizza" && e.fase === "entregue" && g && !g.rota.length && g.destino ? [g.x, g.y - 8] : null; })()`;
if (GREVES) CENAS.greve = `(() => { const c = mundo.cenaSocial; return c && c.tipo === "greve" && c.fase === "greve"
  && mundo.lista.filter(o => o.placa).length >= 3 ? [c.x, c.y] : null; })()`;
if (BRIGAS) CENAS.briga_plateia = `(() => { const c = mundo.cenaSocial; return c && c.fase === "luta" && mundo.lista.filter(o => !o.rota.length && o.lugar && o.lugar.vaga
  && o.lugar.vaga.tipo === "ringue" && o.lugar.vaga.dono === c.id).length >= 2 ? [c.x, c.y] : null; })()`;
const feitas = new Set();
if (PREFIXO !== null) await js(`window.__cenas = { ${Object.entries(CENAS).map(([n, c]) => `${n}: () => ${c}`).join(",\n")} }; true`);
for (let seg = 0; seg < MINUTOS * 60;) {
  const r = await js("__simular(10)");
  seg = r.seg;
  if (r.cena) { feitas.add(r.cena.nome); await fotografar(r.cena.nome, r.cena.p[0], r.cena.p[1], r.cena.nome === "briga_plateia" ? 2.4 : undefined); }   // o ringue com a plateia em volta
}
await js("window.__cenas = {}; true");

// interface das brincadeiras, também em tempo virtual (as conferências do estresse continuam valendo)
const falhasAcoes = [];
if (ACOES) {
  const ok = (c, t, e = "") => { console.log(`${c ? "ok   " : "FALHA"} ${t}${e ? " -> " + e : ""}`); if (!c) falhasAcoes.push(t + (e ? ": " + e : "")); };
  const ate = async (expr, seg) => { for (let t = 0; t < seg; t += 0.5) { await js("__simular(0.5)"); const v = await js(expr); if (v) return v; } return null; };
  ok(await js("typeof Vida.objetoClicado + typeof Vida.festaGeral") === "functionfunction", "Vida.objetoClicado e Vida.festaGeral exportadas");
  const sons = ["risada", "palma", "jogo_xadrez", "dardo", "cesta", "papel", "musica", "sino", "ronrono", "jukebox", "camera", "konami"];
  const errosSom = await js(`(() => { Som.ajustar({ ligado: true }); const erros = [];
    for (const n of ${JSON.stringify(sons)}) for (const d of [{}, { acerto: true }, { instrumento: "piano" }, { instrumento: "jukebox" }, { instrumento: "violao" }]) { try { Som.evento(n, d); } catch (e) { erros.push(n + ": " + e.message); } }
    Som.ajustar({ ligado: false }); return erros; })()`);
  ok(errosSom.length === 0, `${sons.length} sons das brincadeiras tocam sem erro`, errosSom.join("; "));

  // Os cliques só mexem com quem está livre, como no Vida.objetoClicado: sem trabalho, reunião, roda, dupla nem violão,
  // parado numa vaga fixa. Sem ninguém assim (acontece na demo e na sexta à tarde), o clique não é testado.
  const LIVRE = `b => !b.trabalho && !b.reuniao && !b.grupo && !b.parceiro && !b.rota.length && b.lugar && b.lugar.tipo === "vaga" && !b.lugar.vaga.temp && !(b.violao > performance.now() / 1000)`;
  const temLivre = () => js(`mundo.lista.some(${LIVRE})`);

  // clique em café, TV, fliperama ou jukebox: o livre mais perto vai até a vaga livre daquele tipo (testa o primeiro que tiver vaga)
  // prazo pelo tamanho do caminho (a 40 px/s, no prédio grande o café pode ficar a mais de 1000 px), com folga
  const prazoRota = quem => js(`(() => { const b = ${quem}; let d = 0, x = b.x, y = b.y; for (const [px, py] of b.rota) { d += Math.hypot(px - x, py - y); x = px; y = py; } return Math.ceil(d / 40) + 10; })()`);
  const livre = await temLivre();
  let clicou = false;
  if (!livre) console.log("(ninguém livre parado numa vaga: clique em café, TV, fliperama e jukebox não testado)");
  else for (const [tipo, teste] of [["cafe", 'v.tipo === "cafe"'], ["tv", 'v.tipo === "tv"'], ["arcade", 'v.tipo === "arcade"'], ["jukebox", "v.jukebox"]]) {
    const v = await js(`(() => { const v = mundo.vagas.find(v => ${teste} && !v.ocupante && !v.fechada); return v && { x: v.x, y: v.y }; })()`);
    if (!v) continue;
    clicou = true;
    await js(`Vida.objetoClicado(mundo, { tipo: "${tipo}", x: ${v.x}, y: ${v.y}, sala: null })`);
    const indo = await ate(`(() => { const b = mundo.lista.find(b => b.destino && b.destino.vaga && b.destino.vaga.x === ${v.x} && b.destino.vaga.y === ${v.y}); return b ? b.id : null; })()`, 3);
    const quem = `mundo.bonecos.get(${JSON.stringify(indo)})`;
    const prazo = indo && await prazoRota(quem);
    const chegou = indo && await ate(`(() => { const b = ${quem}; return b && !b.rota.length && b.lugar && b.lugar.vaga && b.lugar.vaga.x === ${v.x} && b.lugar.vaga.y === ${v.y} ? [b.x, b.y] : null; })()`, prazo);
    const onde = indo && !chegou && await js(`(() => { const b = ${quem}, d = b.destino || b.lugar; return d ? (d.vaga ? d.vaga.tipo : d.tipo) + (b.rota.length ? " (a caminho)" : "") : "sem lugar"; })()`);
    ok(!!chegou, `clique em ${tipo}: o livre mais perto vai até lá`, indo ? (chegou ? "" : `não chegou em ${prazo} s; está em/indo para ${onde}`) : "ninguém foi");
    if (chegou) await fotografar(`clique_${tipo}`, chegou[0], chegou[1]);
    break;
  }
  if (livre && !clicou) console.log("(café, TV, fliperama e jukebox sem vaga livre agora: clique não testado)");

  const aq = await js(`(() => { const o = mundo.predio.objetos.find(o => /^aquario/.test(o.nome || "")); return o && { x: o.x + o.w / 2, y: o.y + o.h }; })()`);
  if (aq && !await temLivre()) console.log("(ninguém livre parado numa vaga: clique no aquário não testado)");
  else if (aq) {
    await js(`Vida.objetoClicado(mundo, { tipo: "aquario", x: ${aq.x}, y: ${aq.y}, sala: null })`);
    // o único livre pode estar do outro lado do prédio: como no café, o prazo sai do caminho de quem foi
    const noAquario = b => `(${b}.destino && ${b}.destino.vaga && ${b}.destino.vaga.tipo === "aquario") || (${b}.lugar && ${b}.lugar.vaga && ${b}.lugar.vaga.tipo === "aquario")`;
    const indo = await ate(`(() => { const b = mundo.lista.find(b => ${noAquario("b")}); return b ? b.id : null; })()`, 3);
    const quem = `mundo.bonecos.get(${JSON.stringify(indo)})`;
    const prazo = indo && await prazoRota(quem);
    const olha = indo && await ate(`(() => { const b = ${quem}; return b && !b.rota.length && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "aquario" ? [b.x, b.y, mundo.predio.livre(b.x, b.y)] : null; })()`, prazo);
    ok(!!olha && olha[2], "clique no aquário: alguém vai olhar, em chão livre", indo ? (olha ? JSON.stringify(olha) : `não chegou em ${prazo} s`) : "ninguém foi");
    if (olha) await fotografar("clique_aquario", olha[0], olha[1] - 10);
  } else console.log("(sem aquário neste prédio: clique não testado)");

  // sino: livres comemoram e quem espera você não sai do lugar
  const esperando = `JSON.stringify(mundo.lista.filter(b => b.trabalho && /^waiting/.test(b.trabalho.status)).map(b => [b.id, b.lugar && b.lugar.tipo]))`;
  const sino = await js(`(() => { const b = mundo.lista.find(${LIVRE}); return b && [b.x, b.y]; })()`);
  if (sino) {
    const antes = await js(esperando);
    await js(`Vida.objetoClicado(mundo, { tipo: "sino", x: ${sino[0]}, y: ${sino[1]}, sala: null }); __simular(0.6)`);
    ok(await js("mundo.lista.some(b => b.pose === 'comemorando')"), "sino: alguém comemora");
    ok(antes === await js(esperando), "sino: quem espera você não sai do lugar");
    await fotografar("clique_sino", sino[0], sino[1], 3);
  } else console.log("(ninguém livre parado numa vaga: sino não testado)");

  const rel = await js(`(() => { const b = mundo.lista.find(${LIVRE}); return b && [b.x, b.y]; })()`);
  if (rel) {
    await js(`Vida.objetoClicado(mundo, { tipo: "relogio", x: ${rel[0]}, y: ${rel[1] - 30}, sala: null })`);
    ok(await js("mundo.lista.some(b => Vida.FRASES.objeto.relogio.includes(b.fala))"), "relógio: quem está perto comenta");
  } else console.log("(ninguém livre parado numa vaga: relógio não testado)");

  // Konami: festa geral para todos no prédio (quem anda dança ao chegar), sem tirar quem espera você da mesa
  const festa = await js(`(() => { Vida.festaGeral(mundo, 8);
    const agora = performance.now() / 1000, espera = b => b.trabalho && /^waiting/.test(b.trabalho.status), parados = mundo.lista.filter(b => b.lugar && !b.rota.length && !espera(b));
    const r = { semFesta: mundo.lista.filter(b => !espera(b) && (b.lugar || b.rota.length) && !(b.festa > agora || b.danca > agora)).map(b => b.id),
      esperaDanca: mundo.lista.filter(b => espera(b) && b.danca > agora).map(b => b.id), parados: parados.length };
    __simular(0.7);
    r.festejando = parados.filter(b => b.pose === "dancando" || b.pose === "comemorando").length;
    return r; })()`);
  ok(!festa.semFesta.length && !festa.esperaDanca.length && (festa.festejando > 0 || !festa.parados), "Konami: festa geral (quem espera você não dança)", JSON.stringify(festa));
  const d = await js(`(() => { const b = mundo.lista.find(b => b.pose === "dancando") || mundo.lista.find(b => b.pose === "comemorando"); return b && [b.x, b.y]; })()`);
  if (d) await fotografar("konami", d[0], d[1], 2.6);
  await js("__simular(10)");   // a festa acaba e a vida segue sob as conferências

  // entradas inválidas, inclusive nomes herdados do protótipo: ninguém sai do lugar nem fala
  const ruim = await js(`(() => { try {
    const antes = mundo.lista.map(b => [b.destino, b.fala]);
    Vida.objetoClicado(mundo, null); Vida.objetoClicado(null, { tipo: "cafe", x: 1, y: 1 }); Vida.festaGeral(null); Vida.festaGeral(mundo, "abc");
    for (const tipo of ["foguete", "constructor", "toString", "__proto__", "__defineGetter__", "hasOwnProperty"]) {
      const b = mundo.lista.find(b => !b.trabalho && b.lugar && b.lugar.tipo === "vaga" && !b.rota.length);
      Vida.objetoClicado(mundo, { tipo, x: b ? b.x : 1, y: b ? b.y : 1, sala: null });
    }
    const mudou = mundo.lista.filter((b, i) => b.destino !== antes[i][0] || b.fala !== antes[i][1]).map(b => b.id);
    return mudou.length ? "mexeu em " + mudou.join(", ") : "ok"; } catch (e) { return e.message; } })()`);
  ok(ruim === "ok", "entradas inválidas são ignoradas", ruim);
}

const E = await js("window.__E");
const achados = { erros: E.erros.length, invasaoParado: E.invasaoParado, invasaoAndando: E.invasaoAndando, presos: E.presos, semLugar: E.semLugar,
  vagasOrfas: E.orfas, esperaForaDaMesa: E.esperaFora, trabalhoNaCena: E.trabalhoNaCena, console: consoleMsgs.length, acoes: falhasAcoes.length,
  brigasSemLuta: E.brigas.marcadas - E.brigas.lutaram - (E.brigas.atual ? 1 : 0), brigasPendentes: E.brigas.faltam + (E.brigas.atual ? 1 : 0),
  tarefaSemMesa: E.brigas.semMesa, pressaNoCalmo: E.brigas.pressaCalmo, greveSemSentar: E.greves.semSentar, placaErrada: E.greves.placaErrada,
  greveNaoDispersou: E.greves.naoDispersou, greveAtrasDoRingue: E.greves.atras, entregaSemChegar: E.greves.semChegar,
  entregaSemTurma: E.greves.semTurma, entregaComTrabalho: E.greves.comTrabalho, motoboyLonge: E.greves.motoboyLonge, grevesPendentes: E.greves.faltam + (E.greves.atual ? 1 : 0) };
const total = Object.values(achados).reduce((a, n) => a + n, 0);
console.log("RESULTADO " + JSON.stringify({ url: URL_PAGINA, minutosVirtuais: E.seg / 60, agentes: await js("mundo.lista.length"), achados,
  exemplos: { erros: E.erros, invasao: E.exInvasao, presos: E.exPresos, semLugar: E.exSemLugar, orfas: E.exOrfas, esperaFora: E.exEsperaFora,
    trabalhoNaCena: E.exTrabalhoNaCena, tarefaSemMesa: E.brigas.exSemMesa, pressaNoCalmo: E.brigas.exPressaCalmo, placaErrada: E.greves.exPlaca,
    greveNaoDispersou: E.greves.exDispersou, acoes: falhasAcoes },
  brigas: BRIGAS ? { marcadas: E.brigas.marcadas, lutaram: E.brigas.lutaram, comPlateia: E.brigas.comPlateia, maiorPlateia: E.brigas.maiorPlateia,
    tarefasNoMeio: E.brigas.tarefas, diretos: E.brigas.diretos } : null,
  greves: GREVES ? { marcadas: E.greves.marcadas, sentaram: E.greves.sentaram, maiorSentados: E.greves.maiorSentados, atendidas: E.greves.atendidas,
    entregas: E.greves.entregas, entregues: E.greves.entregues, itens: E.greves.itens } : null,
  cenasSemPrint: PREFIXO === null ? [] : Object.keys(CENAS).filter(c => !feitas.has(c)), eventos: E.eventos, falas: E.falas, poses: E.poses, vagas: E.tiposVaga }));
console.log("CONSOLE:", consoleMsgs.length ? consoleMsgs.slice(0, 15).join("\n") : "limpo");
console.log(total ? `${total} achado(s): ${Object.entries(achados).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}` : "0 achados");
await sair(total ? 1 : 0);
