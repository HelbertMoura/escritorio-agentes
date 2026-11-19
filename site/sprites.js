/* Firmópolis — sprites do site: as três espécies de morador e os veículos da rua.
 * Cada sprite é uma grade de letras (paleta por letra), desenhada com contorno escuro automático.
 * Os bichinhos de feltro vêm do avatar.js do próprio escritório; aqui ficam os terminaizinhos, a gente e os carros. */
(function () {
  'use strict';
  var CONTORNO = '#14131f';

  // Desenha a grade em (x, y) = canto superior esquerdo; espelha para a esquerda; contorno de 1 px em volta.
  function sprite(c, linhas, cores, x, y, esquerda) {
    var h = linhas.length, w = linhas[0].length, i, j, ch;
    var cel = function (i, j) { return linhas[i] && linhas[i][esquerda ? w - 1 - j : j]; };
    c.fillStyle = CONTORNO;
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) {
      ch = cel(i, j); if (!ch || ch === '.') continue;
      c.fillRect(x + j - 1, y + i, 1, 1); c.fillRect(x + j + 1, y + i, 1, 1);
      c.fillRect(x + j, y + i - 1, 1, 1); c.fillRect(x + j, y + i + 1, 1, 1);
    }
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) {
      ch = cel(i, j); if (!ch || ch === '.') continue;
      c.fillStyle = cores[ch] || CONTORNO; c.fillRect(x + j, y + i, 1, 1);
    }
  }

  /* ---------- Gente (você e as visitas): cabelo com brilho, crachá no cordão, braços e pernas no passo ---------- */
  var GENTE = [
    '...hhhh...',
    '..hHHhhh..',
    '.hHhhhhhh.',
    '.hhhsssss.',
    '.hhssssos.',
    '.hhsssssk.',
    '..hsssss..',
    '...sssm...',
    '....ss....',
    '..cwwlcc..',
    '.cCCclccc.'];
  var GENTE_PASSO = [
    ['acCCcyycca', 'a.cccyyc.a', 's.cccccc.s', '..pppppp..', '..pp..pp..', '.pp....pp.', '.pp....pp.', 'zzz....zzz'],
    ['.acCcyyca.', '.acccyyca.', '.sccccccs.', '..pppppp..', '...pppp...', '...pp.pp..', '...pp.pp..', '..zzzzzz..']];
  var CABELOS = ['#3b2a20', '#1b1a2b', '#c98a1e', '#8a3b2a', '#d9d2c0', '#5b3a7a'];
  var PELES = ['#f6d2ae', '#e0ad84', '#b07a52', '#7a4b2e'];
  var ROUPAS = ['#e8574a', '#3fb35c', '#3a92e6', '#f5b83d', '#9566e6', '#ff7a8a', '#33b3a0'];
  var CALCAS = ['#2c3a78', '#3b3b47', '#5a4632', '#1f2650'];
  function gente(c, x, pes, f, esquerda, v) {
    var cab = CABELOS[v % 6], roupa = ROUPAS[(v >> 1) % 7];
    var cores = { h: cab, H: clarear(cab), s: PELES[(v >> 2) % 4], o: '#1b1a2b', k: '#ff9aa5', m: '#b5615a',
      c: roupa, C: clarear(roupa), w: '#fff4dc', l: '#f5b83d', y: '#fff4dc', a: escurecer(roupa), p: CALCAS[(v >> 3) % 4], z: '#1b1a2b' };
    var linhas = GENTE.concat(GENTE_PASSO[f % 2]);
    sprite(c, linhas, cores, x, pes - linhas.length - (f % 2), esquerda);
  }

  /* ---------- Terminaizinhos (terminais locais): monitor CRT de cabeça, olhos que piscam, cursor de boca, crachá ---------- */
  var TERM = [
    '.GGGGGGGGGG.',
    'GgrS######gd',
    'Gg#EE##EE#gd',
    'Gg#ee##ee#gd',
    'Ggxxxxxxxxgd',
    'Gg###uu###gd',
    'Gg########gd',
    '.dddddddddd.',
    '....kKKk....',
    '..bBBbbbbb..',
    '.bBBbbbyybb.'];
  var TERM_PASSO = [
    ['abBbbbbyyba.', 'k.bbbbbbbb.k', '..bbbbbbbb..', '..pp....pp..', '.pp......pp.', 'zzz......zzz'],
    ['.abbbbbyyba.', '.kbbbbbbbbk.', '..bbbbbbbb..', '...pp..pp...', '...pp..pp...', '..zzz..zzz..']];
  var MOLDURAS = ['#e8794a', '#5fa8ff', '#9be15d', '#c38bff', '#ffd166'];
  function terminal(c, x, pes, f, esquerda, v, agora) {
    var g = MOLDURAS[v % 5], t = (agora || 0) + v * 997;
    var piscando = (t % 3600) < 140, cursor = Math.floor(t / 420) % 2;
    var tela = '#0b1a12', olho = '#4ade80';
    var cores = { G: clarear(g), g: g, d: escurecer(g), '#': tela, x: '#10261a', r: '#c8ffd9', S: '#5f8f70',
      E: piscando ? tela : olho, e: olho, u: cursor ? olho : tela, k: '#7a8196', K: '#b5bccc',
      b: escurecer(g), B: g, y: '#fff4dc', a: escurecer(escurecer(g)), p: '#2b2b35', z: '#14131f' };
    var linhas = TERM.concat(TERM_PASSO[f % 2]);
    sprite(c, linhas, cores, x, pes - linhas.length - (f % 2), esquerda);
  }
  function escurecer(cor) {
    var rgb = cor[0] === '#' ? [1, 3, 5].map(function (i) { return parseInt(cor.slice(i, i + 2), 16); }) : cor.match(/\d+/g).map(Number);
    return 'rgb(' + rgb.map(function (v) { return Math.round(v * 0.62); }).join(',') + ')';
  }

  /* ---------- Bichinhos de feltro (agentes.chat), pelo avatar.js do escritório ---------- */
  var APARENCIAS = [];
  function bichinho(c, x, pes, f, esquerda, v, agora) {
    var Av = window.Avatar;
    if (!Av) return;
    if (!APARENCIAS.length) APARENCIAS = ['ana', 'bento', 'cacau', 'dara', 'enzo', 'flora', 'gael', 'hana', 'icaro', 'jade'].map(Av.padrao);
    Av.boneco(c, { x: x + 11, y: pes, ap: APARENCIAS[v % APARENCIAS.length], pose: 'andando', olha: esquerda ? 'esq' : 'dir', semente: v }, agora || 0, 1);
  }

  /* ---------- Veículos ---------- */
  var CARRO = [
    '.......CCCCCCCCCC...........',
    '......CwwwwCwwwwwC..........',
    '.....CwwwwwCwwwwwwC.........',
    '..CCCCCCCCCCCCCCCCCCCCCCC...',
    '.CLLLLLLLLLLLLLLLLLLLLLLLCY.',
    'RCCCCCCCCCCCCCCCCCCCCCCCCCY.',
    '.DDDDDDDDDDDDDDDDDDDDDDDDDD.',
    '...WWW..............WWW.....',
    '..WhhW..............WhhW....',
    '...WWW..............WWW.....'];
  var VAN = [
    '....CCCCCCCCCCCCCCCCCCCCC.....',
    '...CCCCCCCCCCCCCCCCCCCwwwC....',
    '...CCCCCCCCCCCCCCCCCCCwwwwC...',
    '...CCCCCCCCCCCCCCCCCCCwwwwwC..',
    '...AAAAAAAAAAAAAAAAAAACCCCCCC.',
    '...CCCCCCCCCCCCCCCCCCCCCCCCCY.',
    '..RCCCCCCCCCCCCCCCCCCCCCCCCCY.',
    '...DDDDDDDDDDDDDDDDDDDDDDDDDD.',
    '.....WWW............WWW.......',
    '....WhhW............WhhW......',
    '.....WWW............WWW.......'];
  var MOTO = ['....AAA.....', '....AAA.....', '..sss.......', '..CCCCw.....', '.CCCCCCCCC..', 'WW.....WW...', 'WhW...WhW...', 'WW.....WW...'];
  var PINTURAS = ['#e8574a', '#f5b83d', '#4ade80', '#5fa8ff', '#fff4dc', '#ff7a8a', '#c38bff'];
  function veiculo(c, tipo, x, rodas, esquerda, v, noite) {
    var cor = PINTURAS[v % PINTURAS.length];
    var linhas = tipo === 'van' ? VAN : tipo === 'moto' ? MOTO : CARRO;
    var cores = { C: tipo === 'moto' ? '#e8574a' : cor, L: clarear(tipo === 'moto' ? '#e8574a' : cor), D: escurecer(cor), w: '#9fd3ff', W: '#1b1a2b', h: '#9aa3b8',
      R: '#ff4f4f', Y: noite ? '#fff1a8' : '#ffe9a0', A: '#f5b83d', s: '#f2c9a0' };
    sprite(c, linhas, cores, x, rodas - linhas.length, esquerda);
    if (noite && tipo !== 'moto') {  // farol na rua
      c.fillStyle = 'rgba(255,236,150,.32)';
      var fx = esquerda ? x - 18 : x + linhas[0].length - 1;
      c.fillRect(fx, rodas - 6, 18, 4);
    }
  }
  function clarear(hex) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * 0.3); }).join(',') + ')';
  }

  window.Sprites = { gente: gente, terminal: terminal, bichinho: bichinho, veiculo: veiculo, larguras: { carro: 28, van: 30, moto: 12 } };
})();
