/* Firmópolis — site: céu da cidade, o prédio-mascote que olha o cursor, andares que acendem e o botão de copiar. */
(function () {
  'use strict';
  var A = window.Abertura;
  var parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]estatico\b/.test(location.search);

  /* ---------- Mascote ---------- */
  var OLHOS = [9, 18];
  var JANELAS = [[21, 25, 2, 2], [9, 22, 2, 2], [18, 22, 2, 2], [21, 22, 2, 2], [14, 26, 4, 4]];
  var FALAS = ['Bom dia, firma!', 'Quem pediu pizza?', 'Deploy na sexta, não!', 'Reunião às 15h?', 'Tem gente esperando você.',
    'Café passado agora.', 'Ninguém gastou token hoje.', 'O ringue tá aberto.'];

  function grade(estado) {
    var g = A.MASCOTE.map(function (l) { return l.split(''); });
    JANELAS.forEach(function (j, i) {
      if (i < estado.janelas) return;
      for (var y = j[1]; y < j[1] + j[3]; y++) for (var x = j[0]; x < j[0] + j[2]; x++) if (g[y][x] === 'a' || g[y][x] === 'A') g[y][x] = 'd';
    });
    OLHOS.forEach(function (ex) {
      for (var y = 13; y <= 17; y++) for (var x = ex; x < ex + 5; x++) g[y][x] = estado.olho === 'fechado' ? 'b' : 'w';
      if (estado.olho === 'fechado') { for (var a = ex; a < ex + 5; a++) g[16][a] = 'p'; return; }
      if (estado.olho === 'feliz') {  // ^ ^
        for (var y2 = 13; y2 <= 17; y2++) for (var x2 = ex; x2 < ex + 5; x2++) g[y2][x2] = 'b';
        g[16][ex] = 'p'; g[15][ex + 1] = 'p'; g[14][ex + 2] = 'p'; g[15][ex + 3] = 'p'; g[16][ex + 4] = 'p';
        return;
      }
      var px = ex + 1 + estado.dx, py = 14 + estado.dy;
      g[py][px] = 'p'; g[py][px + 1] = 'p'; g[py + 1][px] = 'p'; g[py + 1][px + 1] = 'p'; g[py][px] = 'h';
    });
    if (!estado.antena) { g[1][15] = 'o'; g[1][16] = 'o'; g[2][15] = 'o'; g[2][16] = 'o'; }
    return g;
  }

  function pintar(ctx, g, u, sobe) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var corte = 30 - Math.round((sobe == null ? 1 : sobe) * 30);
    for (var y = 0; y < 32; y++) {
      if (y < 30 && y < corte) continue;
      for (var x = 0; x < 32; x++) {
        var c = g[y][x]; if (c === '.') continue;
        ctx.fillStyle = A.COR[c]; ctx.fillRect(x * u, y * u, u, u);
      }
    }
  }

  var tela = document.querySelector('.mascote');
  var balao = document.querySelector('.balao');
  if (tela && A) {
    var ctx = tela.getContext('2d');
    var estado = { janelas: 0, olho: 'fechado', dx: 1, dy: 1, antena: true };
    var alvo = { dx: 1, dy: 1 }, inicio = performance.now(), proximaPiscada = 2600, felizAte = 0, falaTimer = 0;

    function olharPara(cx, cy) {
      var r = tela.getBoundingClientRect();
      var ox = r.left + r.width / 2, oy = r.top + r.height * 0.47;
      var ang = Math.atan2(cy - oy, cx - ox), dist = Math.hypot(cx - ox, cy - oy);
      if (dist < r.width * 0.12) { alvo.dx = 1; alvo.dy = 1; return; }
      alvo.dx = Math.max(0, Math.min(2, Math.round(1 + Math.cos(ang) * 1.4)));
      alvo.dy = Math.max(0, Math.min(2, Math.round(1 + Math.sin(ang) * 1.4)));
    }
    addEventListener('pointermove', function (e) { olharPara(e.clientX, e.clientY); }, { passive: true });

    function falar() {
      if (!balao) return;
      balao.textContent = FALAS[Math.floor(Math.random() * FALAS.length)];
      balao.classList.add('mostrar');
      clearTimeout(falaTimer);
      falaTimer = setTimeout(function () { balao.classList.remove('mostrar'); }, 2600);
    }
    tela.addEventListener('click', function () { felizAte = performance.now() + 900; falar(); });

    function quadro(agora) {
      var t = agora - inicio;
      var sobe = parado ? 1 : Math.min(1, t / 700);
      sobe = sobe * sobe * (3 - 2 * sobe);
      estado.janelas = parado ? 5 : Math.max(0, Math.min(5, Math.floor((t - 700) / 120)));
      estado.antena = parado || (t > 900 && Math.floor(t / 600) % 2 === 0);
      estado.dx = alvo.dx; estado.dy = alvo.dy;
      if (agora < felizAte) estado.olho = 'feliz';
      else if (!parado && t < 1400) estado.olho = 'fechado';
      else if (!parado && t > proximaPiscada && t < proximaPiscada + 130) estado.olho = 'fechado';
      else estado.olho = 'aberto';
      if (t > proximaPiscada + 130) proximaPiscada = t + 2200 + Math.random() * 2600;
      if (t > 1500 && t < 1530 && !parado) falar();
      pintar(ctx, grade(estado), 10, sobe);
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
  }

  // Mascote dormindo no rodapé.
  var mini = document.querySelector('.mascote-mini');
  if (mini && A) pintar(mini.getContext('2d'), grade({ janelas: 1, olho: 'fechado', dx: 1, dy: 1, antena: false }), 2, 1);

  /* ---------- Céu da cidade ---------- */
  var ceu = document.querySelector('.ceu');
  if (ceu) {
    var c2 = ceu.getContext('2d'), P = 4, estrelas = [], predios = [];
    function montar() {
      ceu.width = Math.ceil(ceu.clientWidth / P); ceu.height = Math.ceil(ceu.clientHeight / P);
      var W = ceu.width, H = ceu.height;
      estrelas = []; predios = [];
      for (var i = 0; i < W * H / 140; i++) estrelas.push({ x: Math.random() * W | 0, y: Math.random() * H * 0.6 | 0, f: Math.random() * 6.28 });
      var x = -4;
      while (x < W) {
        var w = 10 + (Math.random() * 18 | 0), h = 10 + (Math.random() * H * 0.28 | 0);
        var jan = [];
        for (var yy = H - h + 3; yy < H - 4; yy += 4) for (var xx = x + 2; xx < x + w - 2; xx += 3) if (Math.random() < 0.35) jan.push([xx, yy, Math.random()]);
        predios.push({ x: x, w: w, h: h, jan: jan });
        x += w + (Math.random() * 4 | 0);
      }
    }
    function desenharCeu(agora) {
      var W = ceu.width, H = ceu.height;
      c2.clearRect(0, 0, W, H);
      estrelas.forEach(function (s) {
        var a = parado ? 0.6 : 0.35 + 0.35 * Math.sin(agora / 700 + s.f);
        c2.fillStyle = 'rgba(255,244,220,' + a.toFixed(2) + ')'; c2.fillRect(s.x, s.y, 1, 1);
      });
      predios.forEach(function (p) {
        c2.fillStyle = '#15162e'; c2.fillRect(p.x, H - p.h, p.w, p.h);
        p.jan.forEach(function (j) {
          var acesa = parado ? j[2] > 0.3 : ((agora / 4000 + j[2] * 7) % 7) > 1.6;
          c2.fillStyle = acesa ? 'rgba(245,184,61,.55)' : 'rgba(40,42,80,.9)';
          c2.fillRect(j[0], j[1], 1, 2);
        });
      });
      if (!parado) requestAnimationFrame(desenharCeu);
    }
    montar();
    addEventListener('resize', function () { montar(); if (parado) desenharCeu(performance.now()); });
    requestAnimationFrame(desenharCeu);
  }

  /* ---------- Andares: aparecem ao subir e acendem a placa ---------- */
  var andares = document.querySelectorAll('.andar');
  if ('IntersectionObserver' in window) {
    andares.forEach(function (a) { a.classList.add('revelar'); });
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('visivel');
        e.target.classList.toggle('ativo', e.isIntersecting && e.intersectionRatio > 0.5);
      });
    }, { threshold: [0, 0.5] });
    andares.forEach(function (a) { obs.observe(a); });
  }

  /* ---------- Copiar comando ---------- */
  document.querySelectorAll('[data-copiar]').forEach(function (b) {
    b.addEventListener('click', function () {
      var texto = b.getAttribute('data-copiar');
      (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () {
        b.textContent = 'Copiado!';
      }, function () { b.textContent = 'Selecione e copie'; })
        .then(function () { setTimeout(function () { b.textContent = 'Copiar'; }, 1800); });
    });
  });

  var ano = document.querySelector('[data-ano]');
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
