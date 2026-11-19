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

  /* ---------- Gente (você e as visitas) ---------- */
  var GENTE_CORPO = ['..hhhh..', '.hhhhhs.', '.hhssos.', '..ssss..', '...ss...', '..cccc..', '.cccccc.', '.sccccs.', '..cccc..', '..pppp..'];
  var GENTE_PERNAS = [['..p..p..', '.p....p.', '.p....p.', 'bb....bb'], ['...pp...', '...pp...', '...pp...', '..bbb...']];
  var CABELOS = ['#3b2a20', '#1b1a2b', '#c98a1e', '#8a3b2a', '#d9d2c0'];
  var PELES = ['#f2c9a0', '#d8a47a', '#a8714a', '#7a4b2e'];
  var ROUPAS = ['#e8574a', '#4ade80', '#5fa8ff', '#f5b83d', '#c38bff', '#ff7a8a'];
  function gente(c, x, pes, f, esquerda, v) {
    var cores = { h: CABELOS[v % 5], s: PELES[(v >> 2) % 4], o: '#1b1a2b', c: ROUPAS[(v >> 1) % 6], p: '#2c3a78', b: '#1b1a2b' };
    var linhas = GENTE_CORPO.concat(GENTE_PERNAS[f % 2]);
    sprite(c, linhas, cores, x, pes - linhas.length + (f % 2 ? 0 : 0), esquerda);
  }

  /* ---------- Terminaizinhos (terminais locais) ---------- */
  var TERM_CORPO = ['gggggggggg', 'g########g', 'g#e####e#g', 'g########g', 'g###uu###g', 'gggggggggg', '....kk....', '..bbbbbb..', '.bbbbbbbb.', '.kbbbbbbk.', '..bbbbbb..'];
  var TERM_PERNAS = [['..k....k..', '.k......k.', 'kk......kk'], ['....kk....', '....kk....', '...kkk....']];
  var MOLDURAS = ['#e8794a', '#5fa8ff', '#9be15d', '#c38bff', '#ffd166'];
  function terminal(c, x, pes, f, esquerda, v, agora) {
    var g = MOLDURAS[v % 5];
    var piscar = Math.floor((agora || 0) / 420) % 2;
    var cores = { g: g, '#': '#0d1a12', e: '#4ade80', u: piscar ? '#4ade80' : '#0d1a12', k: '#9aa3b8', b: escurecer(g) };
    var linhas = TERM_CORPO.concat(TERM_PERNAS[f % 2]);
    sprite(c, linhas, cores, x, pes - linhas.length, esquerda);
  }
  function escurecer(hex) {
    var n = parseInt(hex.slice(1), 16), k = 0.62;
    return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v * k); }).join(',') + ')';
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
