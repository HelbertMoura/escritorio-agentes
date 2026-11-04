// Confere o Avatar.voxels (caixas do boneco da maquete 3D) em todas as combinações de cor, olhos, acessório, pose, passo e piscar:
// até 16 caixas, cores #rrggbb, nada abaixo do chão, sem faces coincidentes (z-fighting), sem peça solta longe do corpo,
// olhos fechados ao piscar e cache sem alocação (a mesma lista congelada a cada chamada). Confere também o Avatar.estado
// (o mesmo objeto, valores válidos, sem balanço com reduzir movimento). Roda o static/avatar.js de verdade, sem navegador.
// Uso: node ferramentas/checar_voxels.js   (sai com 1 se algo falhar)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "static", "avatar.js"), "utf8");
const carregar = window => { const ctx = { window }; vm.createContext(ctx); vm.runInContext(fonte, ctx, { filename: "avatar.js" }); return ctx.window.Avatar; };
const A = carregar({});

const MAX = 16, FOLGA = 3;   // mão "flutuante" do bichinho (como no 2D, sem braço) pode ficar a até 3 px do resto
const falhas = [];
const falha = (onde, msg) => { if (falhas.length < 40) falhas.push(`${onde}: ${msg}`); };

// a API do 2D continua igual
for (const k of ["desenhar", "boneco", "estado", "padrao", "voxels"]) if (typeof A[k] !== "function") falha("API", `Avatar.${k} não é função`);
if (A.TAM !== 22) falha("API", "Avatar.TAM mudou");

const cores = [...Object.keys(A.CORES), "inexistente"];
const olhos = ["happy", "sleepy", "round", "wide", "dots", undefined];
const acessorios = ["crown", "hat", "headphones", "headset", "flower", "antenna", "cap", "bow", "", "inexistente"];
const poses = [...A.POSES, "pose-inexistente"];

const eixo = (b, i) => [b[i], b[i] + b[i + 3]];   // i = 0 (x), 1 (y), 2 (z)
const sobrepoe = ([a0, a1], [b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-9;
const folga = ([a0, a1], [b0, b1]) => Math.max(0, b0 - a1, a0 - b1);

// duas caixas com faces no mesmo plano, voltadas para o mesmo lado e com área em comum: z-fighting
function zFighting(a, b) {
  for (let i = 0; i < 3; i++) {
    const outros = [0, 1, 2].filter(j => j !== i);
    if (!outros.every(j => sobrepoe(eixo(a, j), eixo(b, j)))) continue;
    const [a0, a1] = eixo(a, i), [b0, b1] = eixo(b, i);
    if ((Math.abs(a0 - b0) < 1e-9 && !(i === 1 && a0 === 0)) || Math.abs(a1 - b1) < 1e-9) return "xyz"[i];   // a face de baixo no chão não aparece
  }
  return null;
}

let combinacoes = 0, maior = 0, maiorOnde = "";
const contagem = {};
for (const color of cores) for (const eyes of olhos) for (const accessory of acessorios) {
  const ap = { color, eyes, accessory };
  for (const pose of poses) for (const f of [0, 1]) for (const pisca of [false, true]) {
    const onde = `${color}/${eyes}/${accessory || "-"}/${pose}/${f}${pisca ? "/piscando" : ""}`, cx = A.voxels(ap, pose, f, pisca);
    combinacoes++;
    if (cx.length > maior) { maior = cx.length; maiorOnde = onde; }
    contagem[pose] = Math.max(contagem[pose] || 0, cx.length);
    if (cx.length > MAX) falha(onde, `${cx.length} caixas (máximo ${MAX})`);
    if (!Object.isFrozen(cx) || !cx.every(Object.isFrozen)) falha(onde, "lista ou caixa não congelada");
    if (A.voxels({ color, eyes, accessory }, pose, f, pisca) !== cx || A.voxels(ap, pose, f ? 1 : 0, pisca) !== cx) falha(onde, "cache devolveu outra lista");
    const aberto = A.voxels(ap, pose, f);   // a assinatura de 3 argumentos é a de olhos abertos
    if (!pisca && aberto !== cx) falha(onde, "voxels(ap, pose, f) diferente de piscando = false");
    if (pisca) {   // piscar fecha os olhos (a linha do dormindo); como no 2D, "happy" não pisca e, sem mudar o rosto, volta a mesma lista
      const mesmoRosto = eyes === "happy" || pose === "comemorando" || pose === "dormindo" || (pose === "cafe" && f);
      const fechados = cx.filter(b => b[1] === 5 && b[2] === 6 && b[3] === 2 && b[4] === 1 && b[6] === "#1b1b22").length === 2;
      const brancoNoRosto = cx.some(b => b[2] >= 6 && b[1] >= 4 && b[1] <= 9 && b[6] === "#ffffff");
      if (mesmoRosto ? aberto !== cx : aberto === cx || !fechados || brancoNoRosto) falha(onde, "piscar não fechou os olhos como no dormindo");
    }
    for (const b of cx) {
      if (b.length !== 7 || !b.slice(0, 6).every(Number.isFinite)) { falha(onde, `caixa malformada ${JSON.stringify(b)}`); continue; }
      if (!(b[3] > 0 && b[4] > 0 && b[5] > 0)) falha(onde, `tamanho não positivo ${JSON.stringify(b)}`);
      if (!/^#[0-9a-f]{6}$/i.test(b[6])) falha(onde, `cor inválida ${b[6]}`);
      if (b[1] < 0) falha(onde, `abaixo do chão ${JSON.stringify(b)}`);
      if (b[0] < -12 || b[0] + b[3] > 12 || b[1] + b[4] > 20 || b[2] < -10 || b[2] + b[5] > 19) falha(onde, `fora da caixa do boneco ${JSON.stringify(b)}`);
    }
    for (let i = 0; i < cx.length; i++) for (let j = i + 1; j < cx.length; j++) {
      const z = zFighting(cx[i], cx[j]);
      if (z) falha(onde, `faces coincidentes no eixo ${z}: ${JSON.stringify(cx[i])} e ${JSON.stringify(cx[j])}`);
    }
    // tudo ligado ao corpo (caixa 0), com a folga das mãos
    const ligado = new Set([0]);
    for (let mudou = true; mudou;) {
      mudou = false;
      for (let i = 0; i < cx.length; i++) if (!ligado.has(i))
        for (const j of ligado) if ([0, 1, 2].reduce((s, k) => s + folga(eixo(cx[i], k), eixo(cx[j], k)), 0) <= FOLGA) { ligado.add(i); mudou = true; break; }
    }
    if (ligado.size !== cx.length) falha(onde, `${cx.length - ligado.size} caixa(s) solta(s) longe do corpo`);
    // tem rosto: algo na frente do corpo, na altura dos olhos
    if (!cx.some(b => b[2] >= 6 && b[1] >= 4 && b[1] <= 9 && /^#(ffffff|1b1b22)$/.test(b[6]))) falha(onde, "sem olhos na frente");
  }
}

const tri = maior * 12;
// Avatar.estado: o mesmo objeto a cada chamada, valores válidos, quem dorme não pisca; com reduzir movimento, só o passo balança
const DIRS = ["baixo", "cima", "esq", "dir"], calmo = carregar({ matchMedia: () => ({ matches: true }) });
let piscou = 0;
for (const pose of [...A.POSES, undefined]) for (const olha of [...DIRS, undefined]) for (const sentado of [false, true]) {
  const b = { pose, olha, sentado, semente: 0.37, x: 50, y: 50 }, onde = `estado ${pose}/${olha}/${sentado ? "sentado" : "em pé"}`;
  const um = A.estado(b, 0);
  for (let t = 0; t < 24000; t += 41) {
    const e = A.estado(b, t), q = calmo.estado(b, t);
    if (e !== um) { falha(onde, "devolveu outro objeto"); break; }
    if (!A.POSES.includes(e.pose) || !DIRS.includes(e.olha) || (e.f !== 0 && e.f !== 1) || !Number.isInteger(e.oy) || e.oy < 0 || e.oy > 4 || typeof e.piscando !== "boolean") { falha(onde, `valor inválido ${JSON.stringify(e)} em t=${t}`); break; }
    if (e.piscando && e.pose === "dormindo") { falha(onde, "piscando dormindo"); break; }
    if (q.oy !== (q.pose === "andando" ? q.f : 0) || q.olha !== (olha || "baixo")) { falha(onde, `balança com reduzir movimento ${JSON.stringify(q)} em t=${t}`); break; }
    piscou += e.piscando;
  }
}
if (!piscou) falha("estado", "ninguém piscou");

console.log(`combinações: ${combinacoes} (${cores.length} cores x ${olhos.length} olhos x ${acessorios.length} acessórios x ${poses.length} poses x 2 passos x piscar)`);
console.log(`máximo de caixas por boneco: ${maior} (${maiorOnde}); ${tri} triângulos; 60 bonecos = ${60 * tri} triângulos (orçamento total do §4: 150000)`);
console.log("máximo por pose: " + Object.entries(contagem).map(([p, n]) => `${p} ${n}`).join(", "));
if (falhas.length) { console.log(`FALHOU (${falhas.length}${falhas.length >= 40 ? "+" : ""}):\n  ` + falhas.join("\n  ")); process.exit(1); }
console.log("RESULTADO: tudo certo");
