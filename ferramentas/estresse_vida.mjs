// Regressão da vida do escritório (static/vida.js) num Chrome ou Edge headless sobre a prévia.
// Relógio virtual (performance.now) e laço do app parado: a simulação chama Vida.passo em passos de 1/30 s,
// muito mais rápido que o tempo real, e confere a cada 0,5 s virtual:
//   - invasão parado: alguém parado numa vaga criada na hora (roda, torcida, plateia, aquário...) em cima de móvel;
//   - invasão andando: alguém andando por dentro de móvel, longe do começo e do fim do trecho (perto deles é onde se senta);
//   - presos: andando sem sair do lugar por 5 s (fora a pausa do high-five);
//   - sem lugar: parado sem lugar nem rota;
//   - vagas órfãs: reservadas por mais de 3 s para alguém que não está nela, nem indo, nem chamado para a roda;
//   - espera fora da mesa: quem espera você (status waiting*) longe da mesa e sem ir para ela por mais de 3 s;
//   - exceções no Vida.passo e erros ou avisos no console da página.
// Com --acoes, depois do estresse confere também a interface das brincadeiras (Vida.objetoClicado, Vida.festaGeral e os sons).
// Com --prints, tira um print de cada cena (campeonato, xadrez, piada na roda...) em .previa/telas/<prefixo>_<cena>.png.
//
// Uso (com a prévia no ar: python ferramentas/previa.py dados.json):
//   node ferramentas/estresse_vida.mjs [url] [--minutos 40] [--acoes] [--prints <prefixo>] [--grande]
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

await cdp("Page.navigate", { url: URL_PAGINA });
const carregou = async () => { for (let i = 0; i < 60; i++) { await espera(500); try { if (await js("typeof mundo !== 'undefined' && !!mundo && mundo.lista.length > 0")) return true; } catch {} } return false; };
if (!await carregou()) await sair(2, `a página não montou o escritório (mundo vazio) em ${URL_PAGINA}\n${consoleMsgs.join("\n")}`);
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
    orfas: 0, exOrfas: [], esperaFora: 0, exEsperaFora: [], eventos: {}, poses: {}, falas: {}, tiposVaga: {} };
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
      }
      for (const v of mundo.vagas) {
        const b = v.ocupante && mundo.bonecos.get(v.ocupante);
        const ok = !v.ocupante || (b && ((b.lugar && b.lugar.vaga === v) || (b.destino && b.destino.vaga === v) || b.irRoda === v));
        if (ok) { orfaDesde.delete(v); continue; }
        const d = orfaDesde.get(v) ?? agora; orfaDesde.set(v, d);
        if (agora - d > 3) { E.orfas++; if (E.exOrfas.length < 5) E.exOrfas.push({ tipo: v.tipo, x: v.x, y: v.y, ocupante: v.ocupante }); orfaDesde.set(v, agora); }
      }
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
const feitas = new Set();
if (PREFIXO !== null) await js(`window.__cenas = { ${Object.entries(CENAS).map(([n, c]) => `${n}: () => ${c}`).join(",\n")} }; true`);
for (let seg = 0; seg < MINUTOS * 60;) {
  const r = await js("__simular(10)");
  seg = r.seg;
  if (r.cena) { feitas.add(r.cena.nome); await fotografar(r.cena.nome, r.cena.p[0], r.cena.p[1]); }
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
    // prazo pelo tamanho do caminho (a 40 px/s, no prédio grande o café pode ficar a mais de 1000 px), com folga
    const prazo = indo && await js(`(() => { const b = ${quem}; let d = 0, x = b.x, y = b.y; for (const [px, py] of b.rota) { d += Math.hypot(px - x, py - y); x = px; y = py; } return Math.ceil(d / 40) + 10; })()`);
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
    const olha = await ate(`(() => { const b = mundo.lista.find(b => !b.rota.length && b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "aquario"); return b ? [b.x, b.y, mundo.predio.livre(b.x, b.y)] : null; })()`, 30);
    ok(!!olha && olha[2], "clique no aquário: alguém vai olhar, em chão livre", JSON.stringify(olha));
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
  vagasOrfas: E.orfas, esperaForaDaMesa: E.esperaFora, console: consoleMsgs.length, acoes: falhasAcoes.length };
const total = Object.values(achados).reduce((a, n) => a + n, 0);
console.log("RESULTADO " + JSON.stringify({ url: URL_PAGINA, minutosVirtuais: E.seg / 60, agentes: await js("mundo.lista.length"), achados,
  exemplos: { erros: E.erros, invasao: E.exInvasao, presos: E.exPresos, semLugar: E.exSemLugar, orfas: E.exOrfas, esperaFora: E.exEsperaFora, acoes: falhasAcoes },
  cenasSemPrint: PREFIXO === null ? [] : Object.keys(CENAS).filter(c => !feitas.has(c)), eventos: E.eventos, falas: E.falas, poses: E.poses, vagas: E.tiposVaga }));
console.log("CONSOLE:", consoleMsgs.length ? consoleMsgs.slice(0, 15).join("\n") : "limpo");
console.log(total ? `${total} achado(s): ${Object.entries(achados).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}` : "0 achados");
await sair(total ? 1 : 0);
