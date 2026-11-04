// Tela "Personalizar": nome, cor e logo da empresa (salvos no servidor), com prévia ao vivo
// e checagem de contraste da cor escolhida (WCAG). A prévia mostra a placa da recepção e o painel
// da sala comunal desenhados como no mapa. Tudo (nome, cor e logo) só vale ao clicar em "Salvar".
"use strict";
const Personalizar = (() => {
  const $ = id => document.getElementById(id);
  const PALETA = [["#f5b83d", "Âmbar"], ["#f97316", "Laranja"], ["#e8587a", "Rosa"], ["#a855f7", "Roxo"], ["#3b82f6", "Azul"], ["#14b8a6", "Turquesa"], ["#22c55e", "Verde"], ["#e5e7eb", "Gelo"]];
  const FUNDO = "#0f0f11", LOGO_PADRAO = "logo.png", ESCALA = 3;
  let salvo = null;          // { empresa, cor, logo } como estão no servidor
  let logoNovo = null;       // arquivo escolhido, enviado só no "Salvar"
  let tirarLogo = false;     // "voltar ao logo padrão", também só no "Salvar"
  let urlLocal = null;       // endereço temporário do arquivo escolhido, para a prévia
  let configApp = null;      // a config da página (app.js), para o logo salvo valer ao reabrir sem recarregar
  let placa = null, painel = null;

  async function enviar(url, corpo, tipo) {
    if (window.Brincar && Brincar.demo) throw new Error("na demonstração nada é salvo");   // segunda trava: nenhum POST na demo
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": tipo }, body: corpo });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || `HTTP ${r.status}`);
    return d;
  }
  function aviso(t, tipo) { const a = $("m-aviso"); a.textContent = t; a.className = "aviso-form" + (tipo ? ` ${tipo}` : ""); }

  // paleta pronta: rádios de verdade (teclado e leitor de tela); a mesma no Personalizar e nas boas-vindas
  function montarPaleta(p, grupo, aoEscolher) {
    if (p.childElementCount) return;
    p.setAttribute("role", "radiogroup"); p.setAttribute("aria-label", "Cores sugeridas");
    for (const [cor, nome] of PALETA) {
      const l = document.createElement("label"), i = document.createElement("input");
      l.style.background = cor; l.title = nome;
      i.type = "radio"; i.name = grupo; i.value = cor; i.setAttribute("aria-label", nome);
      i.addEventListener("change", () => aoEscolher(cor));
      l.append(i); p.append(l);
    }
  }

  // miniaturas: onde a marca aparece de verdade no mapa (mesmas medidas e cores do efeitos.js)
  function montarMiniaturas() {
    if (placa) return;
    const caixa = document.createElement("div"), cria = (rotulo, w, h) => {
      const fig = document.createElement("figure"), cv = document.createElement("canvas"), leg = document.createElement("figcaption");
      cv.width = w * ESCALA; cv.height = h * ESCALA; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", rotulo);
      Object.assign(cv.style, { width: "100%", maxWidth: `${w * ESCALA}px`, height: "auto", imageRendering: "pixelated", borderRadius: "8px", display: "block" });
      Object.assign(fig.style, { margin: "0", display: "flex", flexDirection: "column", gap: "6px" });
      Object.assign(leg.style, { fontSize: "12px", color: "var(--suave)" });
      leg.textContent = rotulo; fig.append(cv, leg); caixa.append(fig);
      return cv;
    };
    Object.assign(caixa.style, { display: "grid", gap: "12px", width: "100%" });
    placa = cria("Placa da recepção", 60, 40);
    painel = cria("Painel da sala comunal", 100, 50);
    $("p-logo").closest(".previa-marca").querySelector(".previa-corpo").prepend(caixa);
    $("p-logo").addEventListener("load", desenharMiniaturas);
    if (document.fonts) document.fonts.load("5px Silkscreen").then(desenharMiniaturas, () => {});
  }

  function logoPixel(img) { // como no mapa: 26 px de altura, até 64 de largura, sem suavizar
    if (!img.complete || !img.naturalWidth) return null;
    const h = 26, w = Math.min(64, Math.round(img.naturalWidth * h / img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, w, h);
    return cv;
  }

  function desenharMiniaturas() {
    if (!placa) return;
    const cor = $("m-cor").value, nome = ($("m-empresa").value.trim() || "Nome da empresa").toUpperCase(), logo = logoPixel($("p-logo"));
    const desenhar = (cv, w, h, fazer, texto) => { // desenha em 1x e amplia sem suavizar; o texto vai já na escala, nítido
      const base = document.createElement("canvas"); base.width = w; base.height = h;
      const b = base.getContext("2d"); b.imageSmoothingEnabled = false; fazer(b);
      const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height); c.drawImage(base, 0, 0, cv.width, cv.height);
      if (texto) { c.save(); c.scale(ESCALA, ESCALA); texto(c); c.restore(); }
    };
    desenhar(placa, 60, 40, c => { // parede da recepção com a placa do logo
      c.fillStyle = "#2c2a3e"; c.fillRect(0, 0, 60, 40); c.fillStyle = "#24223a"; c.fillRect(0, 34, 60, 6);
      c.fillStyle = "#1b1a26"; c.fillRect(12, 5, 36, 30); c.fillStyle = "#0d1020"; c.fillRect(14, 7, 32, 26);
      if (logo) { const k = Math.min(28 / logo.width, 22 / logo.height), w = Math.round(logo.width * k), h = Math.round(logo.height * k); c.drawImage(logo, 14 + Math.round((32 - w) / 2), 7 + Math.round((26 - h) / 2), w, h); }
    });
    desenhar(painel, 100, 50, c => { // parede de tijolo da sala comunal com o painel em neon
      c.fillStyle = "#7d4a3e"; c.fillRect(0, 0, 100, 50);
      c.fillStyle = "#6a3c32"; for (let y = 3; y < 50; y += 5) { c.fillRect(0, y, 100, 1); for (let x = (y % 10 ? 0 : 6); x < 100; x += 12) c.fillRect(x, y - 4, 1, 4); }
      const L = { x: 6, y: 7, w: 88, h: 38 };
      const n = parseInt(cor.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
      const g = c.createRadialGradient(50, 26, 0, 50, 26, 62); g.addColorStop(0, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 100, 50);
      c.fillStyle = "#1b1a26"; c.fillRect(L.x - 2, L.y - 2, L.w + 4, L.h + 4);
      c.fillStyle = "#0d1020"; c.fillRect(L.x, L.y, L.w, L.h);
      c.fillStyle = cor; c.fillRect(L.x, L.y, L.w, 1); c.fillRect(L.x, L.y + L.h - 1, L.w, 1);
      c.fillStyle = "#3a3f58"; c.fillRect(L.x + 3, L.y - 4, 1, 3); c.fillRect(L.x + L.w - 4, L.y - 4, 1, 3);   // suportes
      if (logo) c.drawImage(logo, Math.round(L.x + (L.w - logo.width) / 2), L.y + 3);
    }, c => {
      c.font = "5px Silkscreen, monospace"; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = "#ffffff";
      c.fillText(nome, 50, 42, 84);   // nome da empresa embaixo do logo, como no mapa
    });
  }

  function mostrarLogo(src) { $("m-previa").src = $("p-logo").src = src; }
  function alterado() { return !!salvo && ($("m-empresa").value.trim() !== salvo.empresa || $("m-cor").value.toLowerCase() !== salvo.cor.toLowerCase() || !!logoNovo || tirarLogo); }

  function mudou() {
    const cor = $("m-cor").value, nome = $("m-empresa").value.trim();
    for (const i of document.querySelectorAll("#m-paleta input")) i.checked = i.value.toLowerCase() === cor.toLowerCase();
    aplicarCor(cor);   // a página inteira vira a prévia (volta se sair sem salvar)
    $("p-nome").textContent = nome || "Nome da empresa";
    const noFundo = contraste(cor, FUNDO), noBotao = contraste(cor, textoSobre(cor));
    const ok = noFundo >= 3;
    $("m-contraste").textContent = `Contraste com o fundo: ${noFundo.toFixed(1).replace(".", ",")}:1${ok ? "" : " (baixo: links e destaques ficam apagados; escolha uma cor mais clara)"} · texto do botão: ${noBotao.toFixed(1).replace(".", ",")}:1.`;
    $("m-contraste").classList.toggle("ruim", !ok);
    $("m-desfazer").hidden = !alterado();
    if (alterado()) aviso("Alterações ainda não salvas. Nome, cor e logo valem juntos ao clicar em Salvar.");
    desenharMiniaturas();
  }

  function esquecerLogo() { logoNovo = null; tirarLogo = false; if (urlLocal) { URL.revokeObjectURL(urlLocal); urlLocal = null; } }

  function abrir(cfg) {
    if (!cfg) return;
    montarPaleta($("m-paleta"), "paleta", cor => { $("m-cor").value = cor; mudou(); }); montarMiniaturas();
    $("m-salvar").textContent = "Salvar";
    $("m-logo-ajuda").textContent = "PNG, JPEG ou WEBP, até 600 KB. Também dá para arrastar a imagem para cá. O logo novo aparece na prévia e só vale ao clicar em Salvar, junto com o nome e a cor.";
    esquecerLogo(); configApp = cfg;
    salvo = { empresa: cfg.empresa || "", cor: cfg.cor || "#f5b83d", logo: cfg.logo || LOGO_PADRAO };
    $("m-empresa").value = salvo.empresa; $("m-cor").value = salvo.cor;
    mostrarLogo(salvo.logo);
    aviso(""); mudou();
  }
  window.addEventListener("hashchange", () => { // saiu sem salvar: volta a cor e descarta o logo escolhido
    if (salvo && location.hash !== "#personalizar") { aplicarCor(salvo.cor); if (logoNovo || tirarLogo) { esquecerLogo(); mostrarLogo(salvo.logo); } }
  });

  $("m-empresa").addEventListener("input", mudou);
  $("m-cor").addEventListener("input", mudou);
  $("m-desfazer").addEventListener("click", () => {
    $("m-empresa").value = salvo.empresa; $("m-cor").value = salvo.cor; esquecerLogo(); mostrarLogo(salvo.logo);
    mudou(); aviso("Voltou ao que estava salvo.");
  });
  $("form-marca").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (window.Brincar && Brincar.demo) { aviso("Na demonstração nada é salvo.", "ruim"); return; }   // dados fictícios: nenhum POST
    if (!$("m-empresa").reportValidity()) return;
    const bt = $("m-salvar"); bt.disabled = true; bt.textContent = "Salvando…";
    let logoFoi = false;
    try {
      if (logoNovo || tirarLogo) {
        const d = logoNovo ? await enviar("/api/logo", logoNovo, logoNovo.type) : await enviar("/api/logo/remover", "{}", "application/json");
        logoFoi = true; salvo.logo = configApp.logo = d.logo || LOGO_PADRAO;   // endereço do servidor, não o blob local
      }
      await enviar("/api/marca", JSON.stringify({ empresa: $("m-empresa").value.trim(), cor: $("m-cor").value }), "application/json");
      esquecerLogo();
      aviso("Salvo. Recarregando para aplicar no mapa…", "ok"); setTimeout(() => location.reload(), 700);
    } catch (e) {
      if (logoFoi) { esquecerLogo(); mostrarLogo(salvo.logo); }   // o logo já foi; só o nome e a cor ficaram para trás
      bt.disabled = false; bt.textContent = "Salvar"; mudou();
      aviso(`Não salvou${logoFoi ? " o nome e a cor (o logo já foi salvo)" : ""}: ${e.message}`, "ruim");   // depois do mudou(), que reescreve o aviso
    }
  });

  function erroDoLogo(f) { // o mesmo limite do servidor, para avisar antes de enviar
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return "Use uma imagem PNG, JPEG ou WEBP.";
    if (f.size > 600000) return `A imagem tem ${Math.round(f.size / 1000)} KB; o limite é 600 KB.`;
    return "";
  }
  function escolherLogo(f) {
    if (!f) return;
    const erro = erroDoLogo(f); if (erro) { aviso(erro, "ruim"); return; }
    esquecerLogo(); logoNovo = f; urlLocal = URL.createObjectURL(f);
    mostrarLogo(urlLocal); mudou();
  }
  $("m-logo").addEventListener("change", () => { escolherLogo($("m-logo").files[0]); $("m-logo").value = ""; });
  const zona = $("m-soltar");
  zona.addEventListener("dragover", ev => { ev.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", ev => { ev.preventDefault(); zona.classList.remove("sobre"); escolherLogo(ev.dataTransfer.files[0]); });
  $("m-remover").addEventListener("click", () => { esquecerLogo(); tirarLogo = true; mostrarLogo(LOGO_PADRAO); mudou(); });

  // Boas-vindas: enquanto o nome ainda é o de exemplo (marca_exemplo), uma vez por sessão, pergunta nome, cor e logo
  // (opcional). Salva pelo mesmo caminho do Personalizar (/api/logo e /api/marca); "Pular" deixa tudo para depois.
  function boasVindas(cfg) {
    const d = $("boas-vindas");
    if (!cfg || cfg.marca_exemplo !== true || (window.Brincar && Brincar.demo) || !d.showModal) return;
    try { if (sessionStorage.getItem("escritorio:boas-vindas")) return; sessionStorage.setItem("escritorio:boas-vindas", "1"); } catch (e) { /* sem armazenamento: mostra mesmo assim */ }
    let cor = cfg.cor || PALETA[0][0], salvou = false;
    montarPaleta($("bv-paleta"), "bv-paleta", c => { cor = c; aplicarCor(c); });   // a página mostra a cor na hora
    d.addEventListener("close", () => { if (!salvou) { aplicarCor(cfg.cor || PALETA[0][0]); $("principal").focus({ preventScroll: true }); } });   // pulou (ou Esc): volta a cor de antes e o foco vai ao conteúdo
    for (const i of document.querySelectorAll("#bv-paleta input")) i.checked = i.value.toLowerCase() === cor.toLowerCase();
    const avisoBv = (t, tipo) => { const a = $("bv-aviso"); a.textContent = t; a.className = "aviso-form" + (tipo ? ` ${tipo}` : ""); };
    $("bv-logo").addEventListener("change", () => {
      const f = $("bv-logo").files[0], erro = f ? erroDoLogo(f) : "";
      if (erro) $("bv-logo").value = "";
      $("bv-logo-nome").textContent = f && !erro ? f.name : "Nenhuma imagem escolhida";
      avisoBv(erro, erro ? "ruim" : "");
    });
    $("bv-pular").addEventListener("click", () => d.close());
    $("form-bv").addEventListener("submit", async ev => {
      ev.preventDefault();
      if (!$("bv-empresa").reportValidity()) return;
      const bt = $("bv-salvar"), f = $("bv-logo").files[0];
      bt.disabled = true; bt.textContent = "Salvando…";
      let logoFoi = false;
      try {
        if (f) { await enviar("/api/logo", f, f.type); logoFoi = true; }
        await enviar("/api/marca", JSON.stringify({ empresa: $("bv-empresa").value.trim(), cor }), "application/json");
        salvou = true; avisoBv("Pronto. Recarregando para aplicar…", "ok"); setTimeout(() => location.reload(), 600);
      } catch (e) {
        bt.disabled = false; bt.textContent = "Salvar";
        avisoBv(`Não salvou${logoFoi ? " o nome e a cor (o logo já foi)" : ""}: ${e.message}. Tente de novo ou pule e faça depois em Personalizar.`, "ruim");
      }
    });
    d.showModal(); $("bv-empresa").focus();
  }
  return { abrir, boasVindas };
})();
window.Personalizar = Personalizar;
