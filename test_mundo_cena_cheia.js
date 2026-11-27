"use strict";
// Mundo em cena cheia (mundo.js: Camera com opcoes.inteira): a cidade e o bairro sempre em escala inteira, sem tarja.
// "cobrir" (cidade): em retrato (celular), a menor escala inteira que cobre a tela toda; em paisagem, a cidade inteira. "ceu" (bairro): uns 85% da altura em escala inteira,
// pelo menos a largura toda, e a caixa esticada para cima até o topo da tela (o céu que o nível pinta).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = { window: {}, document: { getElementById: () => null }, location: { search: "", hash: "", pathname: "/mundo.html" },
  URLSearchParams, performance, console };
vm.runInNewContext(fs.readFileSync("static/mundo.js", "utf8") + "\n;globalThis.__Mundo = Mundo;", contexto);
const { Camera } = contexto.__Mundo;

// telas de celular a ultrawide, em vários dpr (o W e o H da câmera são pixels do canvas)
const TELAS = [[390, 590], [360, 540], [430, 650], [768, 700], [1100, 900], [1366, 768], [1440, 900], [2560, 1080]];
for (const dpr of [1, 1.5, 2, 3]) for (const [w, h] of TELAS) {
  const W = Math.round(w * dpr), H = Math.round(h * dpr);

  const cidade = Camera([0, 0, 480, 270], { inteira: "cobrir" }).tamanho(W, H, dpr);
  if (H > W) {   // retrato (celular): cena cheia em escala inteira
    assert.ok(Number.isInteger(cidade.base), `cidade ${w}x${h}@${dpr}: escala ${cidade.base} não é inteira`);
    assert.ok(480 * cidade.base >= W && 270 * cidade.base >= H, `cidade ${w}x${h}@${dpr}: sobra tarja`);
    assert.ok(480 * (cidade.base - 1) < W || 270 * (cidade.base - 1) < H, `cidade ${w}x${h}@${dpr}: escala maior que o preciso`);
  } else assert.equal(cidade.base, Math.min(W / 480, H / 270), `cidade ${w}x${h}@${dpr}: em paisagem, a cidade inteira a 1x`);

  const bairro = Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(W, H, dpr);
  assert.ok(Number.isInteger(bairro.base), `bairro ${w}x${h}@${dpr}: escala ${bairro.base} não é inteira`);
  assert.ok(320 * bairro.base >= W, `bairro ${w}x${h}@${dpr}: tarja dos lados`);
  bairro.y = 999; bairro.limitar();   // como o nível entra: o chão encostado embaixo
  const [, oy] = bairro.origem();
  assert.ok(oy + 180 * bairro.P >= H - 1, `bairro ${w}x${h}@${dpr}: tarja embaixo`);
  assert.ok(bairro.caixa[1] === 0 && bairro.mundo(0, 0)[1] >= Math.min(0, 180 - H / bairro.base) - 1e-6, `bairro ${w}x${h}@${dpr}: o topo da tela fica fora da caixa`);
  bairro.zoomPara(2); bairro.passo(1, true);
  assert.ok(Number.isInteger(bairro.P), `bairro ${w}x${h}@${dpr}: o zoom saiu do pixel inteiro (${bairro.P})`);
}
// as escalas do plano: 4x no computador e 3x no celular (dpr 1)
assert.equal(Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(1100, 900, 1).base, 4);
assert.equal(Camera([0, 0, 320, 180], { inteira: "ceu" }).tamanho(390, 590, 1).base, 3);
// sem a opção, a câmera continua como antes (a 1x a caixa cabe inteira, em escala fracionária)
assert.equal(Camera([0, 0, 320, 180]).tamanho(1100, 900, 1).base, 1100 / 320);

// Festa no celular (achado 1 da auditoria do PR #49), nas 90 cenas: a cidade abre como o entrar() do mundo_cidade.js e,
// em dia de festa em retrato, vai para a praça (e o palco, se cabem juntos) com o MundoFesta.enquadrar. Os fogos estouram
// dentro da vista (MundoFesta.estouro) e a praça ou o palco ficam inteiros na tela (390x582: o palco do mundo.html num
// celular de 390x844, com o painel embaixo).
{
  const ctxPlanta = vm.createContext({ window: {} });
  for (const f of ["static/mundo_cidade_cenas.js", "static/mundo_cidade_planta.js", "static/mundo_festa.js"]) {
    vm.runInContext(fs.readFileSync(f, "utf8"), ctxPlanta);
  }
  const { CidadePlanta: CP, CidadeCenas: CENAS, MundoFesta: MF } = ctxPlanta.window;
  const ids = Object.keys(CENAS);
  assert.equal(ids.length, 90, "as 90 cenas do manifesto");
  const dentro = (r, v) => r[0] >= v[0] - 1e-6 && r[1] >= v[1] - 1e-6 && r[2] <= v[2] + 1e-6 && r[3] <= v[3] + 1e-6;
  const abrir = (p, W, H, festa) => {   // as contas do entrar() (e do abrirNaFesta) do mundo_cidade.js
    const c = Camera([0, 0, p.W, p.H], { inteira: "cobrir" }).tamanho(W, H, 1);
    c.x = p.centro.x; c.y = p.centro.y; c.limitar([0, 0, p.W, p.H]);
    if (festa && H > W) { [c.x, c.y] = MF.enquadrar(p, W / c.base, H / c.base); c.limitar(); }
    return [...c.mundo(0, 0), ...c.mundo(W, H)];
  };
  for (const id of ids) {
    const p = CP.cena(JSON.parse(fs.readFileSync(`static/mundo/cenas/${id}.json`, "utf8")));
    const f = p.cena.festa, ceu = f && f.ceu, palco = f && f.palco;
    const [fw, fh] = p.praca.fonte, fonte = [p.praca.x - fw / 2, p.praca.y - fh, p.praca.x + fw / 2, p.praca.y];
    for (const [w, h] of [[390, 844], [390, 582], [390, 664], [360, 740], [430, 932]]) for (const dpr of [1, 2, 3]) {
      const W = w * dpr, H = h * dpr, vista = abrir(p, W, H, true), nome = `${id} ${w}x${h}@${dpr}`;
      assert.ok(dentro(fonte, vista) || (palco && dentro(palco.r, vista)), `${nome}: praça e palco fora da vista na entrada`);
      const e = MF.estouro(ceu, vista);
      assert.ok(e[2] > e[0] && e[3] > e[1] && dentro(e, vista), `${nome}: fogos fora da vista ${JSON.stringify(e)}`);
    }
    // no computador (paisagem) nada muda: abre no marco e os fogos estouram no céu inteiro da cena, como antes
    const vista = abrir(p, 1440, 900, true), comum = abrir(p, 1440, 900, false);
    assert.deepEqual(vista, comum, `${id}: a 1440 a abertura não muda na festa`);
    if (ceu) assert.deepEqual(MF.estouro(ceu, vista), ceu, `${id}: a 1440 os fogos seguem no céu da cena`);
    // dia comum no celular: segue abrindo no marco
    const marco = Camera([0, 0, p.W, p.H], { inteira: "cobrir" }).tamanho(390, 844, 1);
    marco.x = p.centro.x; marco.y = p.centro.y; marco.limitar();
    assert.deepEqual(abrir(p, 390, 844, false), [...marco.mundo(0, 0), ...marco.mundo(390, 844)], `${id}: o dia comum abre no marco`);
  }
  // o céu que cruza a vista: só a parte na tela; a lasca na borda não conta
  assert.deepEqual([...MF.estouro([0, 0, 100, 80], [40, 20, 200, 300])], [40, 20, 100, 80]);
  assert.deepEqual([...MF.estouro([0, 0, 50, 80], [40, 20, 200, 300])], [70, 36, 170, 148]);
  assert.deepEqual([...MF.estouro(null, [40, 20, 200, 300])], [70, 36, 170, 148]);
}
console.log("test_mundo_cena_cheia.js: ok");
