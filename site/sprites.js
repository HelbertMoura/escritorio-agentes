/* Firmópolis — sprites do site: as três espécies de morador e os veículos da rua.
 * Cada sprite é uma grade de letras (paleta por letra), desenhada com contorno escuro automático.
 * Os bichinhos de feltro vêm do avatar.js do próprio escritório; aqui ficam os terminaizinhos, a gente e os carros.
 * Gente e terminais andam num passo de 4 tempos (contato, passagem, contato, passagem) e têm ações:
 * 'andar', 'parar' (olha em volta / digita no celular), 'acenar' e, nos terminais, a telinha muda de cara. */
(function () {
  'use strict';
  var CONTORNO = '#14131f';

  // Desenha a grade em (x, y) = canto superior esquerdo; espelha para a esquerda; contorno de 1 px em volta.
  function sprite(c, linhas, cores, x, y, esquerda) {
    var h = linhas.length, w = 0, i, j, ch;
    for (i = 0; i < h; i++) w = Math.max(w, linhas[i].length);
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
  function sombra(c, x, pes, w) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x, pes, w, 1); c.fillRect(x + 1, pes + 1, w - 2, 1); }
  function trocar(linha, j, ch) { return linha.slice(0, j) + ch + linha.slice(j + 1); }

  /* ---------- Gente (você e as visitas): de três quartos, olhando para onde anda ---------- */
  var CABECA = [
    '...hhhh...',
    '..hHHhhh..',
    '.hHhhhhhh.',
    '.hhhsssss.',
    '.hhssssos.',
    '.hhsssssk.',
    '..hsssss..',
    '...sssm...',
    '....ss....',
    '...cwwlcc.',
    '...cCClcc.'];
  // corpo de baixo: 8 linhas. a = braço (manga escura), s = mão, P = perna de perto (clara), p = de longe, z = sapato
  var CORPO = {
    contato1: ['..acccyyc.', '.a.cccyyc.', 's..cccccc.', '...pppPPP.', '..pp...PP.', '.pp.....PP', '.pp.....PP', 'zz......zzz'],
    passa1:   ['...cccyyc.', '...cacyyc.', '...cscccc.', '...pppPPP.', '....ppPP..', '....pp.PP.', '....pp.zz.', '...zzz....'],
    contato2: ['...cccyyca', '...cccyyca', '...ccccccs', '...PPPppp.', '..PP...pp.', '.PP.....pp', '.PP.....pp', 'zzz.....zz'],
    passa2:   ['...cccyyc.', '...cacyyc.', '...cscccc.', '...PPPppp.', '....PPpp..', '....PPpp..', '....PP....', '....zzz...'],
    parado:   ['...cccyyc.', '...cacyyc.', '...cscccc.', '...PPPppp.', '...PP.pp..', '...PP.pp..', '...PP.pp..', '...zzz.zzz'],
    celular:  ['...cccyyc.', '...ccaayc.', '...cccssg.', '...PPPppp.', '...PP.pp..', '...PP.pp..', '...PP.pp..', '...zzz.zzz']};
  var CICLO = ['contato1', 'passa1', 'contato2', 'passa2'];
  var CABELOS = ['#3b2a20', '#1b1a2b', '#c98a1e', '#8a3b2a', '#d9d2c0', '#5b3a7a'];
  var PELES = ['#f6d2ae', '#e0ad84', '#b07a52', '#7a4b2e'];
  var ROUPAS = ['#e8574a', '#3fb35c', '#3a92e6', '#f5b83d', '#9566e6', '#ff7a8a', '#33b3a0'];
  var CALCAS = ['#2c3a78', '#3b3b47', '#5a4632', '#1f2650'];

  // f: tempo do passo (0..3); acao: 'andar' | 'parar' | 'acenar' | 'celular'; agora: ms (piscar e aceno)
  function gente(c, x, pes, f, esquerda, v, acao, agora) {
    acao = acao || 'andar'; agora = agora || 0;
    var cab = CABELOS[v % 6], roupa = ROUPAS[(v >> 1) % 7], calca = CALCAS[(v >> 3) % 4];
    var cores = { h: cab, H: clarear(cab), s: PELES[(v >> 2) % 4], o: '#1b1a2b', k: '#ff9aa5', m: '#b5615a',
      c: roupa, C: clarear(roupa), w: '#fff4dc', l: '#f5b83d', y: '#fff4dc', a: escurecer(roupa), P: calca, p: escurecer(calca),
      z: '#1b1a2b', g: '#9fd3ff' };
    var t = agora + v * 1311, cabeca = CABECA.slice(), corpo, sobe = 0;
    if ((t % 4200) < 130) cabeca[4] = trocar(cabeca[4], 7, 's');             // piscou
    if (acao === 'andar') { corpo = CORPO[CICLO[f % 4]]; sobe = f % 2; }       // sobe 1 px na passagem
    else if (acao === 'celular') { corpo = CORPO.celular; cabeca[7] = trocar(cabeca[7], 6, 's'); cabeca[4] = trocar(cabeca[4], 7, (t % 2600) < 1300 ? 'o' : 's'); }
    else {
      corpo = CORPO.parado;
      if (acao === 'acenar') {                                                 // a mão sobe ao lado da cabeça e balança
        var lado = Math.floor(agora / 180) % 2;
        cabeca = cabeca.map(function (l) { return (l + '..').slice(0, 12); });
        cabeca[3] = trocar(cabeca[3], 10 + lado, 's');
        cabeca[4] = trocar(cabeca[4], 10 + lado, 'a'); cabeca[5] = trocar(cabeca[5], 10, 'a');
        cabeca[6] = trocar(cabeca[6], 10, 'a'); cabeca[7] = trocar(cabeca[7], 9, 'a'); cabeca[8] = trocar(cabeca[8], 9, 'a');
        cabeca[7] = trocar(cabeca[7], 6, 'o');                                 // boca aberta: "oi!"
      } else if ((t % 5200) > 3600) cabeca[4] = trocar(trocar(cabeca[4], 6, 'o'), 7, 's');   // olha em volta
    }
    var linhas = cabeca.concat(corpo);
    sombra(c, x + 1, pes, 9);
    sprite(c, linhas, cores, x, pes - linhas.length - sobe, esquerda);
  }

  /* ---------- Terminaizinhos (terminais locais): monitor CRT de cabeça, telinha com cara, crachá e o cabo de força ---------- */
  var MONITOR = [
    '.GGGGGGGGGG.',
    'Gg@@@@@@@@gd',
    'Gg@@@@@@@@gd',
    'Gg@@@@@@@@gd',
    'Gg@@@@@@@@gd',
    'Gg@@@@@@@@gd',
    'Gg@@@@@@@@gd',
    '.dddddddddd.',
    '....kKKk....',
    '..bBBbbbbb..',
    '.bBBbbbyybb.'];
  // telinha 8x6 (linhas 1 a 6, colunas 2 a 9). # fundo, e verde, x linha de varredura, r/S brilho, w âmbar, u cursor
  var TELAS = {
    olhos:  ['rS######', '#EE##EE#', '#ee##ee#', 'xxxxxxxx', '###uu###', '########'],
    feliz:  ['rS######', '##e##e##', '#e#ee#e#', 'xxxxxxxx', '#e####e#', '##eeee##'],
    espera: ['rS##w###', '####w###', '####w###', 'xxxxxxxx', '########', '####w###'],
    olhaLado: ['rS######', '#EE##EE#', '##ee##ee', 'xxxxxxxx', '####uu##', '########']};
  var CORPO_T = {
    contato1: ['abBbbbbyyb..', 'k.bbbbbbbb..', '..bbbbbbbbak', '..ppPP..PP..', '.pp.....PP..', 'zzz......zzz'],
    passa1:   ['.abbbbbyyb..', '.kbbbbbbbba.', '..bbbbbbbbk.', '...ppPPPP...', '...pp..PP...', '..zzz..zzz..'],
    contato2: ['..bbbbbyyba.', '..bbbbbbbb.k', 'kabbbbbbbb..', '..PP..ppPP..', '..PP.....pp.', 'zzz......zzz'],
    passa2:   ['.abbbbbyyb..', '.abbbbbbbbk.', '.kbbbbbbbb..', '...PPPPpp...', '...PP..pp...', '..zzz..zzz..'],
    parado:   ['.abbbbbyyba.', '.abbbbbbbba.', '.kbbbbbbbbk.', '...PPPPPP...', '...PP..PP...', '..zzz..zzz..'],
    acenar:   ['.abbbbbyybak', '.abbbbbbbb..', '.kbbbbbbbb..', '...PPPPPP...', '...PP..PP...', '..zzz..zzz..']};
  var MOLDURAS = ['#e8794a', '#5fa8ff', '#9be15d', '#c38bff', '#ffd166'];
  // linhas de código que sobem na telinha quando o terminal está "digitando" (parado pensando)
  function telaDigitando(t) {
    var r = ['rS######'], base = Math.floor(t / 260);
    for (var i = 0; i < 5; i++) {
      var n = (base + i) * 2654435761 >>> 0, larg = 2 + n % 6, rec = 1 + (n >> 5) % 2, s = '#';
      for (var j = 1; j < 8; j++) s += j > rec && j <= rec + larg ? 'e' : '#';
      r.push(i === 4 ? s.slice(0, 7) + (Math.floor(t / 300) % 2 ? 'u' : '#') : s);
    }
    return r;
  }
  // acao: 'andar' | 'parar' (digitando) | 'acenar' (carinha feliz) | 'esperar' (! âmbar)
  function terminal(c, x, pes, f, esquerda, v, agora, acao) {
    acao = acao || 'andar'; agora = agora || 0;
    var g = MOLDURAS[v % 5], t = agora + v * 997;
    var piscando = (t % 3600) < 140, cursor = Math.floor(t / 420) % 2;
    var tela = '#0b1a12', verde = '#4ade80';
    var cores = { G: clarear(g), g: g, d: escurecer(g), '#': tela, x: '#10261a', r: '#c8ffd9', S: '#5f8f70',
      E: piscando ? tela : verde, e: verde, u: cursor ? verde : tela, w: '#f5b83d', k: '#7a8196', K: '#b5bccc',
      b: escurecer(g), B: g, y: '#fff4dc', a: escurecer(escurecer(g)), P: '#3b3b47', p: '#2b2b35', z: '#14131f' };
    var cara = acao === 'acenar' ? TELAS.feliz : acao === 'esperar' ? TELAS.espera : acao === 'parar' ? telaDigitando(t)
      : (t % 6000) > 5200 ? TELAS.olhaLado : TELAS.olhos;
    var monitor = MONITOR.map(function (l, i) { return i >= 1 && i <= 6 ? l.slice(0, 2) + cara[i - 1] + l.slice(10) : l; });
    var corpo, sobe = 0;
    if (acao === 'andar') { corpo = CORPO_T[CICLO[f % 4]]; sobe = f % 2; }
    else if (acao === 'acenar') {
      corpo = CORPO_T.acenar;
      var alto = Math.floor(agora / 180) % 2;   // o braço sobe ao lado da tela e a mão balança
      monitor = monitor.map(function (l) { return (l + '..').slice(0, 14); });
      monitor[8] = trocar(monitor[8], 11, 'B'); monitor[7] = trocar(monitor[7], 12, 'B'); monitor[6] = trocar(monitor[6], 12, 'B');
      monitor[5] = trocar(monitor[5], 12, 'B'); monitor[4] = trocar(monitor[4], 12 + alto, 'K'); monitor[3] = trocar(monitor[3], 12 + alto, 'K');
    } else corpo = CORPO_T.parado;
    var linhas = monitor.concat(corpo), topo = pes - linhas.length - sobe;
    sombra(c, x + 1, pes, 11);
    cabo(c, x, pes, esquerda, agora, acao === 'andar');
    sprite(c, linhas, cores, x, topo, esquerda);
  }
  // o cabo de força arrastando atrás, ondulando no passo
  function cabo(c, x, pes, esquerda, agora, andando) {
    var y0 = pes - 4, dir = esquerda ? 1 : -1, x0 = esquerda ? x + 11 : x;
    c.fillStyle = '#5b6275';
    for (var i = 1; i <= 7; i++) {
      var onda = andando ? Math.round(Math.sin(agora / 120 - i * 0.9) * (i / 7) * 1.4) : 0;
      c.fillRect(x0 + dir * i, Math.min(pes - 1, y0 + Math.min(3, i >> 1) + onda), 1, 1);
    }
    c.fillStyle = '#c8ccd8'; c.fillRect(x0 + dir * 8, pes - 1, 1, 1);   // a tomada na ponta
  }
  function escurecer(cor) {
    var rgb = cor[0] === '#' ? [1, 3, 5].map(function (i) { return parseInt(cor.slice(i, i + 2), 16); }) : cor.match(/\d+/g).map(Number);
    return 'rgb(' + rgb.map(function (v) { return Math.round(v * 0.62); }).join(',') + ')';
  }

  /* ---------- Bichinhos de feltro (agentes.chat), pelo avatar.js do escritório ---------- */
  var APARENCIAS = [];
  var POSE_BICHO = { andar: 'andando', parar: 'cafe', acenar: 'acenando', celular: 'parado', esperar: 'parado' };
  function bichinho(c, x, pes, f, esquerda, v, agora, acao) {
    var Av = window.Avatar;
    if (!Av) return;
    if (!APARENCIAS.length) APARENCIAS = ['ana', 'bento', 'cacau', 'dara', 'enzo', 'flora', 'gael', 'hana', 'icaro', 'jade'].map(Av.padrao);
    Av.boneco(c, { x: x + 11, y: pes, ap: APARENCIAS[v % APARENCIAS.length], pose: POSE_BICHO[acao || 'andar'], olha: esquerda ? 'esq' : 'dir', semente: v }, agora || 0, 1);
  }

  /* ---------- Balõezinhos sobre a cabeça (encontros na calçada) ---------- */
  var ICONES = {
    oi:     ['wwwwwwwww', 'wnwnwwnww', 'wnnnwwnww', 'wnwnwwwww', 'wnwnwwnww', 'wwwwwwwww', '.ww......', '.w.......'],
    coracao:['wwwwwwwww', 'wwrrwrrww', 'wwrrrrrww', 'wwwrrrwww', 'wwwwrwwww', 'wwwwwwwww', '.ww......', '.w.......'],
    nota:   ['wwwwwwwww', 'wwwwwnnww', 'wwwwwnwnw', 'wwnnnwwww', 'wwnnnwwww', 'wwwwwwwww', '.ww......', '.w.......'],
    cafe:   ['wwwwwwwww', 'wwwswswww', 'wwmmmmmww', 'wwmmmmwmw', 'wwwmmmwww', 'wwwwwwwww', '.ww......', '.w.......']};
  function balao(c, tipo, x, y) {
    var g = ICONES[tipo]; if (!g) return;
    sprite(c, g, { w: '#fff4dc', r: '#e8574a', n: '#3d4f9e', m: '#8a5a3a', s: '#b5bccc' }, x, y, false);
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
  function veiculo(c, tipo, x, rodas, esquerda, v, noite, agora) {
    var cor = PINTURAS[v % PINTURAS.length];
    var linhas = tipo === 'van' ? VAN : tipo === 'moto' ? MOTO : CARRO;
    // as rodas giram: o miolo da calota alterna
    var gira = Math.floor((agora || 0) / 90) % 2;
    var cores = { C: tipo === 'moto' ? '#e8574a' : cor, L: clarear(tipo === 'moto' ? '#e8574a' : cor), D: escurecer(cor), w: '#9fd3ff', W: '#1b1a2b',
      h: gira ? '#9aa3b8' : '#5b6275', R: '#ff4f4f', Y: noite ? '#fff1a8' : '#ffe9a0', A: '#f5b83d', s: '#f2c9a0' };
    var sobe = tipo === 'moto' ? 0 : (Math.floor((agora || 0) / 260 + v) % 7 === 0 ? 1 : 0);   // um solavanco de vez em quando
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 2, rodas, linhas[0].length - 4, 1);
    sprite(c, linhas, cores, x, rodas - linhas.length - sobe, esquerda);
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

  window.Sprites = { gente: gente, terminal: terminal, bichinho: bichinho, veiculo: veiculo, balao: balao, larguras: { carro: 28, van: 30, moto: 12 } };
})();
