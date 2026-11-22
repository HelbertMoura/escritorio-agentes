/* Firmópolis — menu do celular (gaveta) e scroll-spy do menu.
 * Vai sozinho nas tres paginas do site: index.html, novidades.html e novidades.modelo.html.
 * O menu abre e fecha, devolve o foco e marca a secao que esta na tela. */
(function () {
  'use strict';

  /* ---------- Menu do celular: uma gaveta que abre e fecha ---------- */
  var botaoMenu = document.querySelector('.menu-botao'), painelMenu = document.querySelector('.menu-painel');
  if (botaoMenu && painelMenu) {
    var fecharMenu = document.querySelector('.menu-painel-fechar');
    var ultimoFoco = null;
    var timerFechar = 0;
    var DURACAO = 220;   // o mesmo tempo da transicao da gaveta no CSS

    /* O que esta fora da gaveta fica inerte enquanto ela esta aberta. */
    function travarFundo(ligado) {
      if (!ligado) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-travado]'), function (el) {
          el.removeAttribute('inert');
          el.removeAttribute('aria-hidden');
          el.removeAttribute('data-travado');
        });
        return;
      }
      // sobe da gaveta ate o body travando cada irmao que nao a contem
      var alvos = [], no = painelMenu;
      while (no && no !== document.body && no.parentElement) {
        var pai = no.parentElement;
        Array.prototype.forEach.call(pai.children, function (irmao) {
          if (irmao !== no && !irmao.contains(painelMenu)) alvos.push(irmao);
        });
        no = pai;
      }
      alvos.forEach(function (el) {
        el.setAttribute('inert', '');
        el.setAttribute('data-travado', 'true');
        // aria-hidden so quando nao ha nada focavel dentro: aria-hidden com foco e erro
        var focavel = 'a[href], button, input, select, textarea, [tabindex]';
        if (!el.matches(focavel) && !el.querySelector(focavel)) el.setAttribute('aria-hidden', 'true');
      });
    }

    /* Os itens que recebem Tab dentro da gaveta, na ordem em que aparecem. */
    function itensFocaveis() {
      return Array.prototype.filter.call(
        painelMenu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (el) { return el.getClientRects().length > 0; }
      );
    }

    function abrirMenu() {
      // cancela um fechamento ainda pendente: senao a gaveta sumiria no meio da animacao
      if (timerFechar) { clearTimeout(timerFechar); timerFechar = 0; }
      ultimoFoco = document.activeElement;
      painelMenu.hidden = false;
      // dois quadros: o primeiro forca o reflow, o segundo sobe a transicao
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { painelMenu.setAttribute('data-aberto', 'true'); });
      });
      botaoMenu.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      // o foco entra na gaveta antes de travar o resto da pagina
      var primeiro = painelMenu.querySelector('a, button');
      if (primeiro) primeiro.focus();
      travarFundo(true);
    }

    /* devolverFoco: so Escape e o botao X devolvem o foco para quem abriu a gaveta.
     * Link de ancora e redimensionamento nao: ali o foco tem que seguir para a pagina. */
    function fechar(devolverFoco) {
      painelMenu.setAttribute('data-aberto', 'false');
      botaoMenu.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      travarFundo(false);
      if (timerFechar) clearTimeout(timerFechar);
      // espera a gaveta sair da tela antes de tira-la da arvore de acessibilidade
      timerFechar = setTimeout(function () { timerFechar = 0; painelMenu.hidden = true; }, DURACAO);
      if (devolverFoco) {
        // o body nao recebe foco: quando nao ha nada melhor, volta para o botao
        var alvo = (ultimoFoco && ultimoFoco !== document.body && document.contains(ultimoFoco)) ? ultimoFoco : botaoMenu;
        if (alvo && typeof alvo.focus === 'function') alvo.focus();
      }
    }

    botaoMenu.addEventListener('click', function () {
      if (painelMenu.getAttribute('data-aberto') === 'true') fechar(false); else abrirMenu();
    });
    if (fecharMenu) fecharMenu.addEventListener('click', function () { fechar(true); });
    // clicar em um link fecha a gaveta e leva para a secao (o foco fica na pagina)
    painelMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) fechar(false);
    });
    document.addEventListener('keydown', function (e) {
      if (painelMenu.getAttribute('data-aberto') !== 'true') return;
      if (e.key === 'Escape') { fechar(true); return; }
      if (e.key !== 'Tab') return;
      // Tab e Shift+Tab ficam dentro da gaveta
      var itens = itensFocaveis();
      if (!itens.length) { e.preventDefault(); return; }
      var primeiro = itens[0], ultimo = itens[itens.length - 1], atual = document.activeElement;
      if (e.shiftKey) {
        if (atual === primeiro || !painelMenu.contains(atual)) { e.preventDefault(); ultimo.focus(); }
      } else if (atual === ultimo || !painelMenu.contains(atual)) {
        e.preventDefault(); primeiro.focus();
      }
    });
    // a gaveta some quando a tela cresce e volta a caber na linha
    var larga = window.matchMedia('(min-width: 761px)');
    (larga.addEventListener ? larga.addEventListener.bind(larga, 'change') : larga.addListener.bind(larga))(function (e) {
      if (e.matches && painelMenu.getAttribute('data-aberto') === 'true') fechar(false);
    });
  }

  /* ---------- Scroll-spy: o menu marca a seção que está na tela ---------- */
  var secoes = [].slice.call(document.querySelectorAll('main section[id]'));
  var linksMenu = [].slice.call(document.querySelectorAll('.menu a[href^="#"]'));
  var linksGaveta = [].slice.call(document.querySelectorAll('.menu-painel-lista a[href^="#"]'));
  var linksSpy = linksMenu.concat(linksGaveta);
  if (secoes.length && linksSpy.length) {
    // a linha que decide qual seção vale: um pouco abaixo do topo fixo
    var linha = function () { return Math.max(120, Math.round(window.innerHeight * 0.28)); };
    // uma seção vale se algum menu (a linha ou a gaveta) tem link para ela
    var temLink = function (id) {
      return !!document.querySelector('.menu a[href="#' + id + '"], .menu-painel-lista a[href="#' + id + '"]');
    };
    var marcar = function () {
      var y = linha(), atual = null;
      // a última seção que já passou da linha é a que está valendo
      for (var i = 0; i < secoes.length; i++) {
        var r = secoes[i].getBoundingClientRect();
        if (r.top <= y) atual = secoes[i];
      }
      // no fim da página, vale a última seção com link
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        for (var j = secoes.length - 1; j >= 0; j--) {
          if (temLink(secoes[j].id)) { atual = secoes[j]; break; }
        }
      }
      // se a seção que vale não tem link no menu, fica a anterior que tem
      while (atual && !temLink(atual.id)) {
        var idx = secoes.indexOf(atual);
        atual = idx > 0 ? secoes[idx - 1] : null;
      }
      linksSpy.forEach(function (a) {
        if (atual && a.getAttribute('href') === '#' + atual.id) {
          a.setAttribute('aria-current', 'location');
        } else if (a.getAttribute('aria-current') === 'location') {
          // remove so a marca do scroll-spy: "page" (a pagina atual) continua
          a.removeAttribute('aria-current');
        }
      });
    };
    var pendente = 0;
    var pedir = function () { if (!pendente) pendente = requestAnimationFrame(function () { pendente = 0; marcar(); }); };
    addEventListener('scroll', pedir, { passive: true });
    addEventListener('resize', pedir);
    marcar();
  }
})();
