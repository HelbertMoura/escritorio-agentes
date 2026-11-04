// Clima lá fora (vem do servidor, que consulta o Open-Meteo para a cidade configurada):
// chuva, garoa, tempestade (raios e trovão), neve, neblina e nublado. Tudo só na área
// externa; dentro do prédio o clima aparece pelas janelas. ?clima=tempestade simula.
"use strict";

const Clima = (() => {
  const simulado = new URLSearchParams(location.search).get("clima");
  let atual = { tipo: "limpo" }, gotas = [], flocos = [], respingos = [], neveAcumulada = 0, raio = 0, proxRaio = 6, nuvens = [];

  function definir(c) { atual = simulado ? { tipo: simulado } : (c || { tipo: "limpo" }); }
  function tipo() { return atual.tipo || "limpo"; }
  function chove() { return ["chuva", "garoa", "tempestade"].includes(tipo()); }
  function texto(curto) { // curto: só a temperatura (relógio do celular)
    if (curto) return atual.temperatura != null ? `${Math.round(atual.temperatura)}°C` : "";
    const nomes = { limpo: "céu limpo", nublado: "nublado", neblina: "neblina", garoa: "garoa", chuva: "chuva", tempestade: "tempestade", neve: "neve" };
    const t = atual.temperatura != null ? ` · ${Math.round(atual.temperatura)}°C` : "";
    return `${nomes[tipo()] || tipo()}${t}${atual.cidade ? " · " + atual.cidade : ""}`;
  }

  function fora(p, x, y) { const r = p.predioRet; return !(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h); }

  // atualiza e desenha as partículas (coordenadas do mundo)
  function desenhar(ctx, p, dt, t, som) {
    const W = p.W, H = p.H, k = tipo();
    // sombras de nuvem andando na grama (nublado e chuva)
    if (k !== "limpo" && k !== "neve") {
      if (!nuvens.length) for (let i = 0; i < 4; i++) nuvens.push({ x: Math.random() * W, y: Math.random() * H, r: 30 + Math.random() * 40 });
      ctx.save(); clipFora(ctx, p);
      for (const n of nuvens) {
        n.x += dt * 6; if (n.x - n.r > W) n.x = -n.r;
        ctx.fillStyle = `rgba(20,24,40,${k === "nublado" ? 0.05 : 0.07})`;
        ctx.beginPath(); ctx.ellipse(n.x, n.y, n.r, n.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (chove()) {
      const alvo = k === "garoa" ? 120 : k === "tempestade" ? 520 : 320, vel = k === "garoa" ? 160 : 300;
      while (gotas.length < alvo) gotas.push({ x: Math.random() * W, y: Math.random() * H, v: vel * (0.8 + Math.random() * 0.4) });
      gotas.length = Math.min(gotas.length, alvo);
      ctx.save(); clipFora(ctx, p);
      ctx.fillStyle = "rgba(30,40,70,.12)"; ctx.fillRect(0, 0, W, H);                // chão molhado
      ctx.strokeStyle = "rgba(190,210,255,.55)"; ctx.lineWidth = 1; ctx.beginPath();
      for (const g of gotas) {
        g.y += g.v * dt; g.x -= g.v * dt * 0.18;
        if (g.y > H || g.x < 0) { if (fora(p, g.x, g.y) && Math.random() < 0.3) respingos.push({ x: g.x, y: Math.min(g.y, H - 2), v: 0 }); g.y = -4; g.x = Math.random() * (W + 40); }
        ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + 1.5, g.y - 5);
      }
      ctx.stroke();
      for (const r of respingos) { r.v += dt; ctx.fillStyle = `rgba(200,220,255,${0.6 - r.v * 2})`; ctx.fillRect(r.x - 1 - r.v * 6, r.y, 1, 1); ctx.fillRect(r.x + 1 + r.v * 6, r.y, 1, 1); }
      respingos = respingos.filter(r => r.v < 0.3);
      ctx.restore();
      if (som) som.chuva(k === "garoa" ? 0.25 : k === "tempestade" ? 0.9 : 0.55);
    } else if (som) som.chuva(0);
    if (k === "tempestade") {
      proxRaio -= dt;
      if (proxRaio <= 0) { raio = 1; proxRaio = 5 + Math.random() * 12; if (som) setTimeout(() => som.trovao(), 300 + Math.random() * 1500); }
    }
    if (raio > 0) { ctx.fillStyle = `rgba(235,240,255,${raio * 0.55})`; ctx.fillRect(0, 0, W, H); raio = Math.max(0, raio - dt * 3.2); }
    if (k === "neve") {
      while (flocos.length < 260) flocos.push({ x: Math.random() * W, y: Math.random() * H, v: 18 + Math.random() * 22, f: Math.random() * 6 });
      neveAcumulada = Math.min(1, neveAcumulada + dt / 120);
      ctx.save(); clipFora(ctx, p);
      ctx.fillStyle = `rgba(245,248,255,${0.55 * neveAcumulada})`; ctx.fillRect(0, 0, W, H);  // chão branquinho
      ctx.fillStyle = "rgba(255,255,255,.9)";
      for (const f of flocos) {
        f.y += f.v * dt; f.x += Math.sin(t / 700 + f.f) * dt * 8;
        if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
        ctx.fillRect(f.x, f.y, f.f > 4 ? 2 : 1, f.f > 4 ? 2 : 1);
      }
      ctx.restore();
    } else neveAcumulada = Math.max(0, neveAcumulada - dt / 60);
    if (k === "neblina") { ctx.save(); clipFora(ctx, p); ctx.fillStyle = "rgba(220,225,235,.35)"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  function clipFora(ctx, p) { // recorta só a área externa (fora do prédio)
    const r = p.predioRet;
    ctx.beginPath(); ctx.rect(0, 0, p.W, p.H); ctx.rect(r.x + r.w, r.y, -r.w, r.h); ctx.clip("evenodd");
  }

  // efeitos do clima na janela (chamado depois do céu)
  function naJanela(ctx, j, t) {
    const k = tipo();
    if (k === "nublado" || chove() || k === "neblina") { ctx.fillStyle = k === "neblina" ? "rgba(210,214,224,.55)" : "rgba(90,98,120,.35)"; ctx.fillRect(j.x, j.y, j.w, j.h); }
    if (chove()) {
      ctx.fillStyle = "rgba(200,220,255,.75)";
      for (let i = 0; i < (k === "garoa" ? 3 : 7); i++) {
        const x = j.x + ((i * 7 + 3) % j.w), y = j.y + ((t / (k === "garoa" ? 90 : 45) + i * 11) % (j.h + 6)) - 4;
        ctx.fillRect(x, y, 1, 3);
      }
    }
    if (k === "neve") { ctx.fillStyle = "#ffffff"; for (let i = 0; i < 6; i++) ctx.fillRect(j.x + ((i * 5 + t / 400) % j.w), j.y + ((t / 120 + i * 9) % j.h), 1, 1); ctx.fillRect(j.x, j.y + j.h - 2, j.w, 2); }
    if (raio > 0.05) { ctx.fillStyle = `rgba(255,255,255,${raio})`; ctx.fillRect(j.x, j.y, j.w, j.h); }
  }

  return { definir, desenhar, naJanela, texto, tipo, chove, get raio() { return raio; } };
})();

window.Clima = Clima;
