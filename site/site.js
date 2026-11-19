/* Firmópolis — site: céu e rua animados, o prédio-mascote que olha o cursor, o elevador que desce com a rolagem,
 * crachás, TV com chiado e a rua à noite no rodapé. Segredo: digite "pizza" em qualquer lugar da página. */
(function () {
  'use strict';
  var A = window.Abertura;
  var parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]estatico\b/.test(location.search);
  var COR = A ? A.COR : {};

  /* ---------- Mascote ---------- */
  var OLHOS = [9, 18];
  var JANELAS = [[21, 25, 2, 2], [9, 22, 2, 2], [18, 22, 2, 2], [21, 22, 2, 2], [14, 26, 4, 4]];
  var FALAS = ['Bom dia, firma!', 'Quem pediu pizza?', 'Deploy na sexta, não!', 'Reunião às 15h?', 'Tem gente esperando você.',
    'Café passado agora.', 'Ninguém gastou token hoje.', 'O ringue tá aberto.', 'Ei, isso faz cócegas!', 'Já bateu o ponto?'];

  function grade(e) {
    var g = A.MASCOTE.map(function (l) { return l.split(''); });
    JANELAS.forEach(function (j, i) {
      if (i < e.janelas) return;
      for (var y = j[1]; y < j[1] + j[3]; y++) for (var x = j[0]; x < j[0] + j[2]; x++) if (g[y][x] === 'a' || g[y][x] === 'A') g[y][x] = 'd';
    });
    OLHOS.forEach(function (ex) {
      for (var y = 13; y <= 17; y++) for (var x = ex; x < ex + 5; x++) g[y][x] = e.olho === 'aberto' ? 'w' : 'b';
      if (e.olho === 'fechado') { for (var a = ex; a < ex + 5; a++) g[16][a] = 'p'; return; }
      if (e.olho === 'feliz') { g[16][ex] = 'p'; g[15][ex + 1] = 'p'; g[14][ex + 2] = 'p'; g[15][ex + 3] = 'p'; g[16][ex + 4] = 'p'; return; }
      var px = ex + 1 + e.dx, py = 14 + e.dy;
      g[py][px] = 'h'; g[py][px + 1] = 'p'; g[py + 1][px] = 'p'; g[py + 1][px + 1] = 'p';
    });
    if (!e.antena) { g[1][15] = 'o'; g[1][16] = 'o'; g[2][15] = 'o'; g[2][16] = 'o'; }
    return g;
  }
  function pintar(ctx, g, u, sobe, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    var corte = 30 - Math.round((sobe == null ? 1 : sobe) * 30);
    for (var y = 0; y < 32; y++) {
      if (y < 30 && y < corte) continue;
      for (var x = 0; x < 32; x++) {
        var c = g[y][x]; if (c === '.') continue;
        ctx.fillStyle = COR[c]; ctx.fillRect(ox + x * u, oy + y * u, u, u);
      }
    }
  }

  var botaoMascote = document.querySelector('.mascote-botao');
  var tela = document.querySelector('.mascote');
  var balao = document.querySelector('.balao');
  var falaTimer = 0;
  function falar(texto) {
    if (!balao) return;
    balao.textContent = texto || FALAS[Math.floor(Math.random() * FALAS.length)];
    balao.classList.add('mostrar');
    clearTimeout(falaTimer);
    falaTimer = setTimeout(function () { balao.classList.remove('mostrar'); }, 2600);
  }

  if (tela && A) {
    var ctx = tela.getContext('2d');
    var est = { janelas: 0, olho: 'fechado', dx: 1, dy: 1, antena: true };
    var alvo = { dx: 1, dy: 1 }, inicio = performance.now(), piscada = 2600, felizAte = 0, falou = false;
    addEventListener('pointermove', function (e) {
      var r = tela.getBoundingClientRect();
      var ox = r.left + r.width / 2, oy = r.top + r.height * 0.47;
      var ang = Math.atan2(e.clientY - oy, e.clientX - ox);
      if (Math.hypot(e.clientX - ox, e.clientY - oy) < r.width * 0.12) { alvo.dx = 1; alvo.dy = 1; return; }
      alvo.dx = Math.max(0, Math.min(2, Math.round(1 + Math.cos(ang) * 1.4)));
      alvo.dy = Math.max(0, Math.min(2, Math.round(1 + Math.sin(ang) * 1.4)));
    }, { passive: true });
    botaoMascote.addEventListener('click', function () { felizAte = performance.now() + 900; falar(); });

    var quadro = function (agora) {
      var t = agora - inicio;
      var sobe = parado ? 1 : Math.min(1, t / 700); sobe = sobe * sobe * (3 - 2 * sobe);
      est.janelas = parado ? 5 : Math.max(0, Math.min(5, Math.floor((t - 700) / 120)));
      est.antena = parado || (t > 900 && Math.floor(t / 600) % 2 === 0);
      est.dx = alvo.dx; est.dy = alvo.dy;
      if (agora < felizAte) est.olho = 'feliz';
      else if (!parado && (t < 1400 || (t > piscada && t < piscada + 130))) est.olho = 'fechado';
      else est.olho = 'aberto';
      if (t > piscada + 130) piscada = t + 2200 + Math.random() * 2600;
      if (!falou && t > 1500) { falou = true; if (!parado) falar('Bom dia, firma!'); }
      ctx.clearRect(0, 0, tela.width, tela.height);
      pintar(ctx, grade(est), 10, sobe);
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  /* ---------- Céu do hero ---------- */
  var ceu = document.querySelector('.ceu');
  if (ceu) {
    var c2 = ceu.getContext('2d'), P = 4, estrelas = [], predios = [];
    var montarCeu = function () {
      ceu.width = Math.ceil(ceu.clientWidth / P); ceu.height = Math.ceil(ceu.clientHeight / P);
      var W = ceu.width, H = ceu.height; estrelas = []; predios = [];
      for (var i = 0; i < W * H / 140; i++) estrelas.push({ x: Math.random() * W | 0, y: Math.random() * H * 0.6 | 0, f: Math.random() * 6.28 });
      for (var x = -4; x < W;) {
        var w = 10 + (Math.random() * 18 | 0), h = 10 + (Math.random() * H * 0.28 | 0), jan = [];
        for (var yy = H - h + 3; yy < H - 4; yy += 4) for (var xx = x + 2; xx < x + w - 2; xx += 3) if (Math.random() < 0.35) jan.push([xx, yy, Math.random()]);
        predios.push({ x: x, w: w, h: h, jan: jan }); x += w + (Math.random() * 4 | 0);
      }
    };
    var desenharCeu = function (agora) {
      var W = ceu.width, H = ceu.height;
      c2.clearRect(0, 0, W, H);
      estrelas.forEach(function (s) {
        c2.fillStyle = 'rgba(255,244,220,' + (parado ? 0.6 : 0.35 + 0.35 * Math.sin(agora / 700 + s.f)).toFixed(2) + ')';
        c2.fillRect(s.x, s.y, 1, 1);
      });
      predios.forEach(function (p) {
        c2.fillStyle = '#15162e'; c2.fillRect(p.x, H - p.h, p.w, p.h);
        p.jan.forEach(function (j) {
          c2.fillStyle = (parado ? j[2] > 0.3 : ((agora / 4000 + j[2] * 7) % 7) > 1.6) ? 'rgba(245,184,61,.55)' : 'rgba(40,42,80,.9)';
          c2.fillRect(j[0], j[1], 1, 2);
        });
      });
      if (!parado) requestAnimationFrame(desenharCeu);
    };
    montarCeu();
    addEventListener('resize', function () { montarCeu(); if (parado) desenharCeu(0); });
    requestAnimationFrame(desenharCeu);
  }

  /* ---------- Ruas (hero e rodapé à noite): carros, pedestres e o motoboy da pizza ---------- */
  var CORES_CARRO = ['#e8574a', '#f5b83d', '#4ade80', '#5468bf', '#fff4dc', '#ff7a8a'];
  var CORES_PESSOA = ['#3d4f9e', '#e8574a', '#4ade80', '#f5b83d', '#b07ad8', '#ff7a8a'];
  var ruas = [];
  function Rua(canvas, noite) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.noite = noite; this.coisas = []; this.proxima = 0; this.medir();
    if (parado) for (var i = 0; i < 4; i++) { this.nova(); this.coisas[i].x = (i + 0.5) * this.c.width / 4; }
  }
  Rua.prototype.medir = function () {
    this.c.width = Math.ceil(this.c.clientWidth / 3); this.c.height = Math.ceil(this.c.clientHeight / 3);
    if (this.noite) this.predios = montarPredios(this.c.width, this.c.height);
  };
  Rua.prototype.nova = function (tipo) {
    var W = this.c.width, H = this.c.height, dir = Math.random() < 0.5 ? 1 : -1;
    if (tipo === 'pizza') { this.coisas.push({ tipo: 'pizza', x: -20, dir: 1, y: H - 4, v: 0.9 }); return; }
    if (Math.random() < 0.65) this.coisas.push({ tipo: 'carro', x: dir > 0 ? -20 : W + 20, dir: dir, y: dir > 0 ? H - 3 : H - 13, v: 0.5 + Math.random() * 0.6, cor: CORES_CARRO[Math.random() * 6 | 0] });
    else this.coisas.push({ tipo: 'pessoa', x: dir > 0 ? -6 : W + 6, dir: dir, y: H - 32, v: 0.15 + Math.random() * 0.1, cor: CORES_PESSOA[Math.random() * 6 | 0], f: 0 });
  };
  Rua.prototype.desenhar = function (agora) {
    var c = this.ctx, W = this.c.width, H = this.c.height, noite = this.noite;
    c.clearRect(0, 0, W, H);
    if (noite) desenharBairro(c, this.predios, W, H, agora);
    c.fillStyle = '#5b6275'; c.fillRect(0, H - 23, W, 3);   // meio-fio
    c.fillStyle = '#7a8196'; c.fillRect(0, H - 25, W, 2);
    c.fillStyle = '#2b2b35'; c.fillRect(0, H - 20, W, 20);  // asfalto
    c.fillStyle = 'rgba(255,244,220,.75)';
    for (var x = 2; x < W; x += 16) c.fillRect(x, H - 10, 8, 1);
    if (!parado && agora > this.proxima) { this.nova(); this.proxima = agora + 900 + Math.random() * 2200; }
    this.coisas = this.coisas.filter(function (o) {
      if (!parado) o.x += o.v * o.dir;
      var px = Math.round(o.x);
      if (o.tipo === 'carro') {
        c.fillStyle = o.cor; c.fillRect(px, o.y - 4, 14, 4); c.fillRect(px + 3, o.y - 7, 8, 3);
        c.fillStyle = '#9fd3ff'; c.fillRect(px + (o.dir > 0 ? 7 : 4), o.y - 6, 3, 2);
        c.fillStyle = '#1b1a2b'; c.fillRect(px + 2, o.y, 3, 2); c.fillRect(px + 9, o.y, 3, 2);
        if (noite) { c.fillStyle = 'rgba(255,230,140,.85)'; c.fillRect(o.dir > 0 ? px + 14 : px - 3, o.y - 3, 3, 1); }
      } else if (o.tipo === 'pessoa') {
        o.f += o.v;
        var passo = Math.floor(o.f / 2) % 2;
        c.fillStyle = '#f2c9a0'; c.fillRect(px, o.y, 3, 3);
        c.fillStyle = o.cor; c.fillRect(px, o.y + 3, 3, 4);
        c.fillStyle = '#1b1a2b'; c.fillRect(px + passo, o.y + 7, 1, 2); c.fillRect(px + 2 - passo, o.y + 7, 1, 2);
      } else {  // motoboy da pizza
        c.fillStyle = '#e8574a'; c.fillRect(px, o.y - 5, 10, 3); c.fillRect(px + 1, o.y - 10, 6, 5);
        c.fillStyle = '#f5b83d'; c.fillRect(px + 1, o.y - 13, 6, 3);
        c.fillStyle = '#1b1a2b'; c.fillRect(px - 1, o.y - 2, 3, 3); c.fillRect(px + 9, o.y - 2, 3, 3);
        c.fillStyle = '#fff4dc'; c.fillRect(px + 8, o.y - 9, 3, 2);
      }
      return o.x > -30 && o.x < W + 30;
    });
  };
  function montarPredios(W, H) {
    var ps = [];
    for (var x = 0; x < W;) {
      var w = 14 + (Math.random() * 20 | 0), h = 18 + (Math.random() * (H - 50) | 0), jan = [];
      for (var y = H - 25 - h + 4; y < H - 30; y += 5) for (var xx = x + 3; xx < x + w - 3; xx += 4) jan.push([xx, y, Math.random()]);
      ps.push({ x: x, w: w, h: h, jan: jan }); x += w + 2;
    }
    return ps;
  }
  function desenharBairro(c, ps, W, H, agora) {
    var ox = Math.round(W * 0.5 - 16), oy = H - 25 - 31;
    ps.forEach(function (p) {
      if (p.x + p.w > ox && p.x < ox + 32) return;  // espaço do mascote
      c.fillStyle = '#1f2040'; c.fillRect(p.x, H - 25 - p.h, p.w, p.h);
      p.jan.forEach(function (j) {
        var acesa = parado ? j[2] > 0.55 : ((agora / 5000 + j[2] * 9) % 9) > 4.5;
        c.fillStyle = acesa ? '#f5b83d' : '#2c2e5a'; c.fillRect(j[0], j[1], 2, 2);
      });
    });
    if (!A) return;
    // o prédio-mascote dormindo no meio do bairro, com zzz
    pintar(c, grade({ janelas: 2, olho: 'fechado', dx: 1, dy: 1, antena: !parado && Math.floor(agora / 900) % 2 === 0 }), 1, 1, ox, oy);
    var z = parado ? 1 : (agora / 600) % 3;
    c.fillStyle = 'rgba(255,244,220,.85)';
    var zx = ox + 27 + Math.floor(z * 2), zy = oy + 6 - Math.floor(z * 3);
    c.fillRect(zx, zy, 3, 1); c.fillRect(zx + 1, zy + 1, 1, 1); c.fillRect(zx, zy + 2, 3, 1);
  }
  document.querySelectorAll('.rua, .rua-noite').forEach(function (cv) { ruas.push(new Rua(cv, cv.classList.contains('rua-noite'))); });
  if (ruas.length) {
    addEventListener('resize', function () { ruas.forEach(function (r) { r.medir(); if (parado) r.desenhar(0); }); });
    var loopRuas = function (agora) {
      ruas.forEach(function (r) { r.desenhar(agora); });
      if (!parado) requestAnimationFrame(loopRuas);
    };
    requestAnimationFrame(loopRuas);
  }

  // Segredo: digitar "pizza" manda o motoboy pelas ruas.
  var digitado = '';
  addEventListener('keydown', function (e) {
    if (!e.key || e.key.length !== 1 || /input|textarea/i.test(e.target.tagName)) return;
    digitado = (digitado + e.key.toLowerCase()).slice(-5);
    if (digitado === 'pizza') { ruas.forEach(function (r) { r.nova('pizza'); }); falar('PIZZA CHEGOU!'); }
  });

  /* ---------- Elevador: desce pelo poço junto com a rolagem e mostra o andar ---------- */
  var andares = Array.prototype.slice.call(document.querySelectorAll('.andar'));
  var poco = document.querySelector('.poco'), elevador = document.querySelector('.elevador'), visor = document.querySelector('.elevador-visor');
  var miniEl = document.querySelector('.elevador-mascote');
  if (miniEl && A) pintar(miniEl.getContext('2d'), grade({ janelas: 5, olho: 'aberto', dx: 1, dy: 1, antena: true }), 1, 1);
  function moverElevador() {
    var meio = innerHeight * 0.45, atual = null;
    andares.forEach(function (a) { var ar = a.getBoundingClientRect(); if (ar.top < meio && ar.bottom > meio) atual = a; });
    andares.forEach(function (a) { a.classList.toggle('ativo', a === atual); });
    if (!poco || !elevador || getComputedStyle(poco).display === 'none') return;
    var r = poco.getBoundingClientRect();
    var y = Math.max(0, Math.min(r.height - 64, meio - r.top - 32));
    elevador.style.transform = 'translateY(' + Math.round(y) + 'px)';
    if (atual && visor.textContent !== atual.dataset.andar) visor.textContent = atual.dataset.andar;
  }
  addEventListener('scroll', function () { requestAnimationFrame(moverElevador); }, { passive: true });
  addEventListener('resize', moverElevador);
  moverElevador();

  if ('IntersectionObserver' in window && !parado) {
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visivel'); obs.unobserve(e.target); } });
    }, { threshold: 0.15 });
    andares.forEach(function (a) {
      if (a.getBoundingClientRect().top > innerHeight) { a.classList.add('revelar'); obs.observe(a); }
    });
  }

  /* ---------- Crachás viram com toque ---------- */
  document.querySelectorAll('.cracha').forEach(function (b) {
    b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
  });

  /* ---------- Clima: noite com chuva ou Natal ---------- */
  var climaImgs = document.querySelectorAll('.janela-clima img');
  var climaBotoes = document.querySelectorAll('[data-clima]');
  climaBotoes.forEach(function (b) {
    b.addEventListener('click', function () {
      climaBotoes.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      climaImgs.forEach(function (img, i) { img.hidden = String(i) !== b.dataset.clima; });
    });
  });

  /* ---------- TV com chiado (só enquanto está na tela) ---------- */
  var chiado = document.querySelector('.tv-chiado');
  if (chiado) {
    chiado.width = 160; chiado.height = 90;
    var tctx = chiado.getContext('2d'), img = tctx.createImageData(160, 90), noAr = false, ultimo = -1000;
    var chiar = function (agora) {
      if (agora - ultimo > 70) {
        ultimo = agora;
        for (var i = 0; i < img.data.length; i += 4) { var v = Math.random() * 255 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        tctx.putImageData(img, 0, 0);
      }
      if (noAr && !parado) requestAnimationFrame(chiar);
    };
    chiar(0);
    if ('IntersectionObserver' in window && !parado) new IntersectionObserver(function (es) {
      var antes = noAr; noAr = es[0].isIntersecting; if (noAr && !antes) requestAnimationFrame(chiar);
    }).observe(chiado);
  }

  /* ---------- Copiar comando ---------- */
  document.querySelectorAll('[data-copiar]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = navigator.clipboard ? navigator.clipboard.writeText(b.getAttribute('data-copiar')) : Promise.reject();
      p.then(function () { b.textContent = 'Copiado!'; }, function () { b.textContent = 'Selecione e copie'; })
        .then(function () { setTimeout(function () { b.textContent = 'Copiar'; }, 1800); });
    });
  });

  /* ---------- Chamar o elevador (voltar ao topo) ---------- */
  var chamar = document.querySelector('.chamar-elevador');
  if (chamar) chamar.addEventListener('click', function () {
    scrollTo({ top: 0, behavior: parado ? 'auto' : 'smooth' });
    setTimeout(function () { falar('Subiu! Bem-vindo de volta.'); }, parado ? 0 : 700);
  });

  var ano = document.querySelector('[data-ano]');
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
