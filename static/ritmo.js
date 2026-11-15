// Ritmo do desenho do mapa: quantos passos por segundo o laço do app.js dá e quando um passo redesenha.
// O laço segue no requestAnimationFrame, mas só trabalha no ritmo daqui: 30 passos por segundo com a aba em foco,
// 10 sem foco (outro monitor, outra janela na frente) e 15 no modo TV (?fps= de 10 a 60 troca o da TV).
// Em todo passo a vida anda (Vida.passo); o desenho só sai quando algo se mexe sem parar (a câmera, alguém andando,
// os carros e o clima à vista, partículas, portas e luzes no meio da troca) ou quando o relógio comum das animações
// bate (10 vezes por segundo): ele junta num instante só as trocas de quadro dos sprites (gato, café, monitores,
// aquário, ventilador...), que antes faziam o prédio inteiro ser redesenhado a cada quadro da tela. Entre dois toques
// do relógio, uma cena parada não é redesenhada; com o mapa fora de vista, nada é desenhado.
"use strict";

const Ritmo = (() => {
  const FOCO = 30, SEM_FOCO = 10, TV = 15, MIN = 10, MAX = 60, RELOGIO = 100;   // RELOGIO: ms entre dois toques
  const MARGEM = 4;   // ms: o quadro da tela chega um pouco antes do intervalo exato e ainda conta (60, 120 e 144 Hz)

  // ?fps= do endereço, só do modo TV: inteiro de 10 a 60; fora disso (ou ausente), o padrão
  function fpsPedido(busca) {
    const v = new URLSearchParams(busca || "").get("fps");
    return /^\d{1,2}$/.test(v || "") ? Math.max(MIN, Math.min(MAX, +v)) : null;
  }
  function fps({ tv, foco, pedido }) { return tv ? pedido || TV : foco ? FOCO : SEM_FOCO; }
  const ehPasso = (t, ultimo, alvo) => t - ultimo >= 1000 / alvo - MARGEM;
  const relogio = t => Math.floor(t / RELOGIO);
  // teto do passo de tempo (s): segura o salto da volta de uma aba escondida sem atrasar a vida a 10 passos por segundo
  const dtMax = alvo => Math.max(0.1, 1.5 / alvo);
  // oculto: o mapa fora de vista. sujo: tamanho, rota ou ponteiro mudaram. camera: a câmera não está onde foi desenhada.
  function precisaDesenhar({ oculto, sujo, movimento, camera, relogioAgora, relogioDesenhado }) {
    if (oculto) return false;
    return !!(sujo || movimento || camera) || relogioAgora !== relogioDesenhado;
  }
  return { fps, fpsPedido, ehPasso, relogio, dtMax, precisaDesenhar, FOCO, SEM_FOCO, TV, RELOGIO };
})();

window.Ritmo = Ritmo;
