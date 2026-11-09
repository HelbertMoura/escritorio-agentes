"use strict";
(() => {
  const criar = document.getElementById("criar"), copiar = document.getElementById("copiar");
  const entrar = document.getElementById("entrar"), revogar = document.getElementById("revogar");
  const link = document.getElementById("link"), estado = document.getElementById("estado");
  const agente = document.getElementById("agente");
  let convite = null, ocupada = false;
  // só os anfitriões que o servidor libera (lista configurada, canal de visitas e modo "responder"); vazio, fica só pessoas
  pedir("anfitrioes", {}).then(dados => {
    for (const a of Array.isArray(dados.agentes) ? dados.agentes : []) {
      if (typeof a.id !== "string" || !a.id) continue;
      const opcao = document.createElement("option"); opcao.value = a.id; opcao.textContent = a.nome || a.handle || a.id; agente.append(opcao);
    }
  }).catch(() => {});
  async function pedir(acao, dados) {
    const resposta = await fetch(`/api/visitas/${acao}`, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    if (!resposta.ok) throw new Error("Não foi possível concluir. Verifique sua sessão e tente novamente.");
    return resposta.json();
  }
  criar.addEventListener("click", async () => {
    if (ocupada) return;
    ocupada = true; criar.disabled = revogar.disabled = true;
    try {
      if (convite) {
        await pedir("revogar", { convite });
        convite = null; link.value = "";
        copiar.disabled = entrar.disabled = revogar.disabled = true;
      }
      convite = (await pedir("criar", agente.value ? { agente: agente.value } : {})).convite;
      link.value = `${location.origin}/visita.html#${convite}`;
      copiar.disabled = entrar.disabled = revogar.disabled = false;
      estado.textContent = "Convite criado. Ele expira em uma hora.";
    } catch (e) { estado.textContent = e.message; }
    finally { ocupada = false; criar.disabled = false; revogar.disabled = !convite; }
  });
  copiar.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link.value); estado.textContent = "Link copiado."; }
    catch (_) { link.focus(); link.select(); estado.textContent = "Selecione e copie o link acima."; }
  });
  entrar.addEventListener("click", () => { if (convite) window.open(link.value, "_blank", "noopener"); });
  revogar.addEventListener("click", async () => {
    if (ocupada || !convite) return;
    ocupada = true; criar.disabled = revogar.disabled = true;
    try {
      await pedir("revogar", { convite }); convite = null; link.value = "";
      copiar.disabled = entrar.disabled = revogar.disabled = true; estado.textContent = "Convite encerrado.";
    } catch (e) { estado.textContent = e.message; }
    finally { ocupada = false; criar.disabled = false; revogar.disabled = !convite; }
  });
})();
