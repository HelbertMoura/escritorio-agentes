// Vida dos agentes: vão para a mesa quando têm tarefa, saem para a sala comunal quando ficam livres,
// visitam colegas, fazem roda de café, jogam, sentam de verdade, brincam com o gato e conversam por
// balões. Nenhum nome real no código: todas as frases ficam em FRASES (troque ali no white-label).
// Este arquivo só decide comportamento e pose (b.pose, b.olha, b.chave); quem desenha é o avatar.js.
"use strict";

const Vida = (() => {
  const VEL = 40;                 // px do mapa por segundo
  const GRADE = 4;                // célula da grade de caminhos dentro das salas
  const FRASES = {
    atividade: {
      videogame: ["Bora mais uma partida?", "GG!", "Essa fase é impossível", "Passa o controle!", "Recorde novo!"],
      tv: ["Esse episódio é top", "Não dá spoiler!", "Alguém viu o jogo ontem?", "Muda de canal?"],
      arcade: ["Só mais uma ficha", "Combo!", "Quase bati o recorde", "Esse fliperama é raiz"],
      sinuca: ["Na caçapa!", "Bola sete no canto", "Errei feio", "Sua vez"],
      cafe: ["Café tá pronto ☕", "Mais um café?", "Hoje o dia rende", "Cheirinho de café"],
      poltrona: ["Pausa merecida", "Lendo a documentação…", "Só descansando os circuitos"],
      pufe: ["Que pufe confortável", "Pensando na próxima ideia"],
      papo: ["E aí, como foi o deploy?", "Viu o post novo?", "Bora revisar aquele PR?", "Tudo tranquilo por aí?"],
      recepcao: ["Esperando a próxima tarefa", "Alguém precisa de ajuda?"],
      reuniao: ["Alinhando a sprint", "Próximo item da pauta", "Quem anota a ata?", "Fechado, vamos nessa"],
      cozinha: ["Quem deixou a pizza aqui?", "Esquentando o almoço", "Tem bolo!"],
      lanche: ["Hora do lanche", "Esse café tá forte", "Pausa rápida"],
      pebolim: ["Gol!", "Defende essa!", "Revanche?"],
      pingpong: ["Saque!", "Na quina!", "Ponto meu"],
      musica: ["Tocando um lo-fi", "Bora uma jam?", "Essa é das antigas"],
      pc: ["Só uma partida rapidinha", "Testando a build nova", "GG WP"],
      roda: ["Pausa pro café ☕", "Alguém quer açúcar?", "Esse café salva o dia", "E o fim de semana?", "Bora que hoje rende"],
      gato: ["Psiu, gatinho!", "Quem é o gato mais lindo?", "Ele dormiu de novo", "Miau? 🐱"],
    },
    respostas: ["Haha, verdade", "Bora!", "Depois te conto", "Tô dentro", "Boa!", "Nem me fala", "Com certeza"],
    dialogos: [
      ["E aí, como tá o sprint?", "Puxado, mas sai!"], ["Viu o deploy de ontem?", "Vi! Zero erro, milagre"], ["Esse café tá ótimo", "É o grão novo"],
      ["Bora revisar aquele PR?", "Depois do café, fechado"], ["Que chuva, hein?", "Bom pra ficar no código"], ["Alguém viu meu teclado?", "Tá embaixo dos papéis"],
      ["Terminei a pauta", "Manda pro time revisar"], ["O cliente aprovou!", "Bora comemorar!"], ["Testou no celular?", "Testei, ficou lindo"],
      ["Qual o plano pra hoje?", "Fechar a fila de aprovações"], ["Ouvi falar em pizza", "Sexta tem!"], ["Essa música é boa", "Playlist de foco"],
    ],
    convites: { sinuca: "Bora uma sinuca?", pebolim: "Pebolim? Valendo café!", pingpong: "Topa um pingue-pongue?", videogame: "Pega o outro controle!",
      reuniao: "Bora alinhar rapidinho?", roda: "Pausa pro café?", padrao: "Bora um café?" },
    jogo: { ganhou: ["Ganhei!", "Isso!", "Que jogada!"], perdeu: ["Revanche!", "Quase…", "Sorte sua"] },
    daily: ["Ontem fechei a pauta", "Hoje vou revisar os PRs", "Sem bloqueios por aqui", "Preciso de ajuda com o deploy", "Bora que a sprint acaba sexta"],
    reuniaoDados: [["Vamos alinhar isso", "Fechado"], ["Te mandei o resumo", "Já tô lendo"], ["Faz sentido pra você?", "Faz, segue assim"], ["Próximo ponto", "Anotado"]],
    visita: { chega: ["Tem um minuto?", "Dá uma olhada nisso", "Posso te mostrar uma coisa?"], responde: ["Claro, manda", "Deixa eu ver…", "Boa ideia!"],
      tchau: ["Valeu!", "Fechado então", "Te mando depois"] },
    // balões genéricos de quem trabalha, pela função do agente (nunca o conteúdo das mensagens)
    trabalho: {
      dev: ["Compilando…", "Rodando os testes…", "Quase lá", "Refatorando…"], qa: ["Revisando…", "Achei um detalhe", "Testando de novo…"],
      conteudo: ["Escrevendo…", "Ajustando o texto…", "Ficou bom!"], infra: ["Olhando os logs…", "Tudo verde", "Subindo o serviço…"],
      dados: ["Cruzando os dados…", "Hmm, interessante", "Gráfico pronto"], gestao: ["Organizando a fila…", "Alinhando o time…", "Priorizando…"],
      geral: ["Trabalhando nisso…", "Quase lá", "Hmm, interessante"],
    },
    estado: { aprovacao: "Preciso do seu OK!", pergunta: "Tenho uma pergunta pra você", aindaAprovacao: "Ainda esperando seu OK…",
      aindaPergunta: "Preciso de uma resposta sua", partiu: "Partiu trabalhar!", pronto: "Pronto! ✔" },
    // quando você aprova ou responde e o agente volta a trabalhar
    obrigado: ["Obrigado, chefe!", "Valeu! Seguindo…", "Opa, liberado! Obrigado!"], aplauso: ["Isso aí!", "👏👏", "Boa, chefe!"],
    parabens: ["Boa!", "Mandou bem!", "Arrasou!", "👏👏"],
    chegada: ["Bom dia, time!", "Cheguei!", "Bom dia!"],
    saida: ["Até amanhã, time!", "Fui, até amanhã!"],
    robo: ["Opa, robozinho!", "Valeu pela faxina"],
    recorde: ["Recorde novo!", "Bati meu recorde!"],
    // brincadeiras: campeonato com placar e torcida, piada na roda, high-five, música, papel, dardos e basquete
    campeao: { padrao: ["Campeão!", "É campeão!", "Levei essa!"], xadrez: ["Xeque-mate!", "Mate em três!"] },
    revanche: ["Quero revanche!", "Semana que vem eu ganho", "Foi sorte…", "Melhor de cinco?"],
    torcida: { chega: ["Quem tá ganhando?", "Vim torcer!", "Partida boa essa"], ponto: ["Uhuul!", "Que jogada!", "Vai, vai!", "Boa!"],
      final: ["👏👏", "Que final!", "Campeão!"] },
    piadas: [["Por que o dev foi ao médico?", "Tava cheio de bugs 🐛"], ["Qual o café preferido do dev?", "O Java ☕"],
      ["Quantos devs pra trocar uma lâmpada?", "Nenhum, é problema de hardware"], ["Por que o teste ficou triste?", "Ninguém deu assert nele"],
      ["O que o servidor disse pro cliente?", "Tô sem cache pra isso"], ["Qual o animal preferido do dev?", "O pato de borracha 🦆"]],
    risadas: ["Hahaha", "kkkk", "Essa foi boa", "😂", "Ai, não…"],
    highfive: ["Toca aqui! ✋", "Boa, parceiro! ✋"], highfiveVolta: ["✋", "Opa! ✋"],
    karaoke: ["🎤 Lá-lá-lá…", "🎤 Essa eu sei!", "🎤 Agora todo mundo!", "🎵 Aumenta o som!"],
    danca: ["Uhuu!", "🎶", "Olha o passinho!", "Essa música é boa"],
    violao: ["🎸 Uma moda?", "🎸 Essa é das antigas", "🎸 Pede uma música!"], plateia: ["Toca mais uma!", "Que bonito", "Essa eu conheço!"],
    papel: { acerto: ["Cesta!", "No lixo, de primeira", "Três pontos!"], erro: ["Errei…", "Depois eu pego", "Quase"] },
    aviao: ["Lá vai o aviãozinho! ✈️", "Correio aéreo!"], aviaoVolta: ["Pousou!", "Haha, mandou bem"],
    guerra: ["Guerra de papel!", "Toma essa!", "Revida!", "Sextou!"],
    dardos: { acerto: ["Na mosca!", "Cinquenta!", "Bem no centro"], erro: ["Errei feio", "Quase na mosca", "Mais uma"] },
    basquete: { acerto: ["Cesta!", "Swish!", "Três pontos!"], erro: ["Bateu no aro", "Ihhh", "Agora vai"] },
    objeto: { aquario: ["Olha o peixinho!", "Alguém deu comida pros peixes?"], lousa: ["Quem desenhou isso?", "Bora rabiscar uma ideia"],
      quadro_avisos: ["Tem aviso novo?", "Já li esse aviso"], relogio: ["Já é hora do café?", "O dia tá voando"],
      luminaria: ["Agora sim, iluminou", "Clima de foco"], planta: ["Alguém regou a planta?", "Que planta bonita"],
      sino: ["Venda fechada!", "Bateu a meta!", "🔔 Bora comemorar!"] },
  };
  // função do agente (texto livre do agentes.chat) -> grupo de balões de trabalho
  const PAPEIS = [[/qa|revis|teste|complian|lgpd/i, "qa"], [/dev|c[oó]dig|full|front|back|tech|arquitet|program/i, "dev"],
    [/conte[uú]do|rede|social|marketing|copy|comunidade/i, "conteudo"], [/infra|noc|ops|servidor|deploy/i, "infra"],
    [/dado|seo|estrat|an[aá]lis/i, "dados"], [/chefe|orquestr|gest|gerent|gabinete|coorden/i, "gestao"]];
  // material do piso de cada sala (índice "piso" do times.json), para o som dos passos
  const MATERIAL = ["ladrilho", "madeira", "carpete", "carpete", "ladrilho", "carpete", "ladrilho", "carpete", "concreto", "madeira"];

  // Peso de cada atividade: jogos e conversa atraem mais que a recepção
  const PESO = { videogame: 3, arcade: 3, sinuca: 3, pebolim: 3, pingpong: 3, pc: 3, musica: 2, cafe: 2.5, lanche: 2.5, papo: 2.5, tv: 2, reuniao: 1, poltrona: 1.2, pufe: 1.2, cozinha: 1.5, recepcao: 0.4,
    xadrez: 2.5, dardos: 2.5, basquete: 2.5 };
  const EM_DUPLA = new Set(["sinuca", "pebolim", "pingpong", "cafe", "lanche", "papo", "videogame", "reuniao", "xadrez", "dardos", "basquete"]);
  const JOGOS = new Set(["sinuca", "pebolim", "pingpong", "videogame", "xadrez", "dardos", "basquete"]);   // em dupla: placar até 3
  const ARREMESSO = new Set(["dardos", "basquete"]);   // jogo de mira: cada vez é um arremesso, que acerta ou erra
  const PLACAR = 3;
  const SENTA = new Set(["tv", "poltrona", "pufe", "recepcao", "reuniao", "lanche", "videogame"]);
  const OLHA = { arcade: "cima", pc: "cima", videogame: "cima", musica: "cima", cozinha: "cima", cafe: "cima" };
  const POSE = { videogame: "jogando", arcade: "fliperama", pc: "fliperama", pingpong: "raquete", sinuca: "taco", pebolim: "pebolim",
    musica: "tocando", cafe: "cafe", lanche: "cafe", roda: "cafe", gato: "carinho" };
  const VIZ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // expediente.js traz o horário do Personalizar (inclusive o turno que vira a meia-noite); sem ele, 07:00-20:00
  const foraDoExpediente = (h = Ceu.agora().h) => window.Expediente ? Expediente.fora(h) : h >= 20 || h < 7;
  const sorteia = lista => lista[Math.floor(Math.random() * lista.length)];
  const entre = (a, b) => a + Math.random() * (b - a);
  const esperando = b => !!b.trabalho && /^waiting/.test(b.trabalho.status);
  const trabalhando = b => !!b.trabalho && !esperando(b);
  const rumo = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "esq" : "dir") : (dy < 0 ? "cima" : "baixo"));

  function criarMundo(predio) {
    const vagas = predio.vagas.map(v => ({ ...v, ocupante: null }));
    const m = { predio, vagas, bonecos: new Map(), lista: [], grades: new Map(), eventos: [], roda: null,
      proxPapo: 4, proxTrabalho: 10, proxJogo: 0, proxVisita: entre(12, 25), proxRoda: entre(40, 80), proxGato: entre(30, 60), proxRobo: 1, proxPasso: 0,
      proxToca: 0.4, proxMusica: 2, proxViolao: entre(30, 60), proxPapel: entre(20, 40), proxAviao: entre(40, 80), proxGuerra: 8 };
    for (const v of vagas) {   // a mesa de xadrez vem do mapa com duas vagas de papo: aqui viram partida (a cópia é da vida.js)
      if (v.tipo === "papo" && movelPerto(predio, v, /^mesa_xadrez/, 40)) v.tipo = "xadrez";
      if (v.tipo === "musica") v.jukebox = !!movelPerto(predio, v, /^jukebox/, 48);
    }
    for (const v of vagas) prepararVaga(m, v);
    for (const v of vagas) if (["recepcao", "reuniao", "lounge", "cozinha"].includes(v.sala.tipo)) v.fechada = !alcanca(m, v);
    return m;
  }

  // móvel com esse nome a até "raio" px do ponto (distância até a borda do retângulo)
  function movelPerto(predio, p, nome, raio) {
    for (const ob of predio.objetos) {
      if (!ob.nome || !nome.test(ob.nome)) continue;
      const dx = Math.max(ob.x - p.x, 0, p.x - (ob.x + ob.w)), dy = Math.max(ob.y - p.y, 0, p.y - (ob.y + ob.h));
      if (Math.hypot(dx, dy) <= raio) return ob;
    }
    return null;
  }

  // assento, direção do olhar e ordem de desenho de cada vaga, a partir do móvel que fica embaixo dela
  function prepararVaga(m, v) {
    let o = null;
    for (const ob of m.predio.objetos) {
      if (!ob.nome || ob.chave < 0 || v.x < ob.x || v.x > ob.x + ob.w || v.y < ob.y || v.y > ob.y + ob.h + 2) continue;
      if (!o || ob.w * ob.h < o.w * o.h) o = ob;
    }
    // senta só com um assento embaixo (a mesa de reunião e a da cozinha já trazem as cadeiras no desenho)
    v.senta = !!o && ((SENTA.has(v.tipo) || v.tipo === "papo") && /sofa|poltrona|pufe|banco|cadeira/.test(o.nome) || v.tipo === "reuniao" || v.tipo === "lanche");
    v.chave = v.senta && o ? o.chave + 0.2 : v.y + 0.5;   // sentado fica na frente (em cima) do próprio móvel
    if (!v.olha) {
      const irmas = m.vagas.filter(o2 => o2 !== v && o2.tipo === v.tipo && o2.sala === v.sala && Math.hypot(o2.x - v.x, o2.y - v.y) < 120);
      if (OLHA[v.tipo]) v.olha = OLHA[v.tipo];
      else if (v.senta || !irmas.length) v.olha = "baixo";
      else v.olha = rumo(irmas.reduce((t, o2) => t + o2.x, 0) / irmas.length - v.x, irmas.reduce((t, o2) => t + o2.y, 0) / irmas.length - v.y);
    }
  }

  // --- caminhos -------------------------------------------------------------------------
  // dentro das salas: busca em largura numa grade de 4 px sobre o chão livre (predio.livre)
  function grade(m, s) {
    let g = m.grades.get(s);
    if (g) return g;
    const y0 = s.chao, cols = Math.ceil(s.pw / GRADE), lins = Math.ceil((s.py + s.ph - y0) / GRADE), n = cols * lins;
    const livre = new Uint8Array(n), ok = m.predio.livre || (() => true);
    for (let j = 0; j < lins; j++) for (let i = 0; i < cols; i++) { // a célula inteira (centro e cantos) fora dos móveis
      const x = s.px + i * GRADE, y = y0 + j * GRADE;
      livre[j * cols + i] = ok(x + 2, y + 2) && ok(x, y) && ok(x + GRADE, y) && ok(x, y + GRADE) && ok(x + GRADE, y + GRADE) ? 1 : 0;
    }
    g = { x0: s.px, y0, cols, lins, livre, de: new Int32Array(n), fila: new Int32Array(n) };
    m.grades.set(s, g);
    return g;
  }

  function rotaNaSala(m, s, a, b) {
    const g = grade(m, s), { cols, lins } = g;
    const ci = x => Math.max(0, Math.min(cols - 1, Math.floor((x - g.x0) / GRADE))), cj = y => Math.max(0, Math.min(lins - 1, Math.floor((y - g.y0) / GRADE)));
    const ai = ci(a[0]), aj = cj(a[1]), bi = ci(b[0]), bj = cj(b[1]);
    // perto da saída ou do destino pode passar "dentro" do móvel: é onde o agente senta
    const passa = (i, j) => i >= 0 && j >= 0 && i < cols && j < lins && (g.livre[j * cols + i] === 1 || (i - ai) ** 2 + (j - aj) ** 2 <= 16 || (i - bi) ** 2 + (j - bj) ** 2 <= 16);
    g.de.fill(-1);
    const ini = aj * cols + ai, fim = bj * cols + bi;
    let cab = 0, cauda = 0;
    g.fila[cauda++] = ini; g.de[ini] = ini;
    while (cab < cauda && g.de[fim] < 0) {
      const c = g.fila[cab++], i = c % cols, j = (c - i) / cols;
      for (const [di, dj] of VIZ) {
        const ni = i + di, nj = j + dj;
        if (!passa(ni, nj) || (di && dj && (!passa(i + di, j) || !passa(i, j + dj)))) continue;   // diagonal sem cortar quina
        const k = nj * cols + ni;
        if (g.de[k] < 0) { g.de[k] = c; g.fila[cauda++] = k; }
      }
    }
    if (g.de[fim] < 0) return null;
    const celulas = [];
    for (let c = fim; c !== ini; c = g.de[c]) celulas.push(c);
    celulas.reverse();
    const ponto = c => [g.x0 + (c % cols) * GRADE + GRADE / 2, g.y0 + Math.floor(c / cols) * GRADE + GRADE / 2];
    const vista = (p, q) => { // linha reta entre p e q só por células que passam
      const passos = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2);
      for (let k = 1; k < passos; k++) { const x = p[0] + ((q[0] - p[0]) * k) / passos, y = p[1] + ((q[1] - p[1]) * k) / passos; if (!passa(ci(x), cj(y))) return false; }
      return true;
    };
    const rota = [];
    let atual = a;
    for (let k = 0; k < celulas.length;) { // corta caminho onde a linha reta é livre (andar natural, sem escadinha)
      let longe = k;
      while (longe + 1 < celulas.length && vista(atual, ponto(celulas[longe + 1]))) longe++;
      atual = ponto(celulas[longe]); rota.push(atual); k = longe + 1;
    }
    rota.push([b[0], b[1]]);
    return rota;
  }

  function entradas(m, s) { // ponto logo dentro de cada porta e o trecho até o corredor
    const cy = m.predio.corredorY;
    if (s.portas) return s.portas.map(px => ({ dentro: [px, s.chao + 8], fora: [[px, cy]] }));
    return [{ dentro: [s.porta.x, s.py + s.ph - 8], fora: [[s.porta.x, s.py + s.ph + 6], [s.porta.x, cy]] }];
  }
  const portaPerto = (m, s, x) => entradas(m, s).reduce((a, b) => (Math.abs(b.dentro[0] - x) < Math.abs(a.dentro[0] - x) ? b : a));

  function alcanca(m, v) { const e = portaPerto(m, v.sala, v.x); return !!rotaNaSala(m, v.sala, e.dentro, [v.x, v.y]); }

  function saidaMesa(m, k) {
    const s = k.sala;
    if (s.porta.emCima) // sala de time na fileira de baixo: a porta fica na parede de cima
      return [[k.saida, k.pe], [k.saida, k.corredor], [s.faixaX, k.corredor], [s.faixaX, s.chao + 8], [s.porta.x, s.chao + 8], [s.porta.x, m.predio.corredorY]];
    return [[k.saida, k.pe], [k.saida, k.corredor], [s.faixaX, k.corredor], [s.faixaX, s.py + s.ph - 6], [s.porta.x, s.py + s.ph + 6], [s.porta.x, m.predio.corredorY]];
  }

  function rotaRua(m) { // da ponta do corredor até sumir na calçada, à esquerda
    const p = m.predio, e = p.entrada;
    return [[e.x, p.corredorY], [e.x - 22, p.corredorY], [e.x - 22, e.calcadaY], [-24, e.calcadaY]];
  }

  const pontoDe = l => (l.tipo === "mesa" ? [l.mesa.x, l.mesa.pe] : [l.vaga.x, l.vaga.y]);
  const mesaDe = l => (l.tipo === "mesa" ? l.mesa : l.vaga && l.vaga.mesa) || null;

  function sair(m, l) { // do lugar até o corredor
    const k = mesaDe(l);
    if (k) return saidaMesa(m, k);
    const p = pontoDe(l), e = portaPerto(m, l.vaga.sala, p[0]);
    return [...(rotaNaSala(m, l.vaga.sala, p, e.dentro) || [e.dentro]), ...e.fora];
  }

  function entrar(m, l) { // do corredor até o lugar
    const k = mesaDe(l), p = pontoDe(l);
    if (k) return [...saidaMesa(m, k).reverse(), p];
    const e = portaPerto(m, l.vaga.sala, p[0]);
    return [...[...e.fora].reverse(), e.dentro, ...(rotaNaSala(m, l.vaga.sala, e.dentro, p) || [p])];
  }

  function caminho(m, de, para) {
    const k = de && de.tipo !== "fora" && mesaDe(de);
    if (k && para.tipo !== "fora" && mesaDe(para) === k) return [[k.saida, k.pe], pontoDe(para)];   // ali do lado da própria mesa
    if (de && de.tipo !== "fora" && para.tipo !== "fora" && !mesaDe(de) && !mesaDe(para) && de.vaga.sala === para.vaga.sala) {
      const r = rotaNaSala(m, de.vaga.sala, pontoDe(de), pontoDe(para));
      if (r) return r;
    }
    const ida = !de ? [] : de.tipo === "fora" ? rotaRua(m).reverse().slice(1) : sair(m, de);
    return para.tipo === "fora" ? [...ida, ...rotaRua(m)] : [...ida, ...entrar(m, para)];
  }

  // --- estado vindo do agentes.chat ------------------------------------------------------
  function sincronizar(m, agentes, trabalhos, mesasPorHandle, aparencia, primeira) {
    const vistos = new Set(), agora = performance.now() / 1000;
    for (const ag of agentes) {
      vistos.add(ag.id);
      const t = trabalhos.find(x => x.agente_id === ag.id) || null;
      let b = m.bonecos.get(ag.id);
      const mesa = mesasPorHandle.get(ag.handle) || null;
      if (!b) {
        b = { id: ag.id, handle: ag.handle, nome: ag.nome, funcao: ag.funcao, ap: aparencia(ag.handle), mesa, rota: [], lugar: null, fala: null, ate: 0, status: null,
          pose: "parado", olha: "baixo", chave: 0, festa: 0, aceno: 0, passos: 0, semente: [...ag.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 997 };
        m.bonecos.set(ag.id, b);
        if (t && mesa) colocar(b, { tipo: "mesa", mesa });
        else if (foraDoExpediente()) colocar(b, { tipo: "fora" });
        else { const v = vagaLivre(m, b); colocar(b, v ? { tipo: "vaga", vaga: v } : mesa ? { tipo: "mesa", mesa } : { tipo: "fora" }); }
      }
      b.nome = ag.nome; b.funcao = ag.funcao; b.mesa = mesa || b.mesa; b.ap = aparencia(ag.handle);
      b.papel = (PAPEIS.find(([re]) => re.test(ag.funcao || "")) || [0, "geral"])[1];
      const antes = b.status, depois = t ? t.status : null;
      b.trabalho = t;
      if (!primeira && antes !== depois) {
        if (depois === "waiting_approval") { falar(b, FRASES.estado.aprovacao, 6); m.eventos.push({ nome: "aprovacao" }); }
        else if (depois === "waiting_input") { falar(b, FRASES.estado.pergunta, 6); m.eventos.push({ nome: "pergunta" }); }
        else if (depois && !antes) falar(b, FRASES.estado.partiu, 3);
        else if (depois && /^waiting/.test(antes)) agradecer(m, b, agora);
        else if (!depois && antes) comemorar(m, b, agora);
      }
      b.status = depois;
    }
    for (const id of [...m.bonecos.keys()]) if (!vistos.has(id)) {
      const b = m.bonecos.get(id), d = b.destino && b.destino.vaga;
      soltarVaga(b); if (d && d.ocupante === b.id) d.ocupante = null;   // a reservada no destino também
      sairDaRoda(m, b); m.bonecos.delete(id);
    }
    m.lista = [...m.bonecos.values()];
    combinarReunioes(m);
  }

  // tarefa terminou: sai de trás da mesa (para aparecer), pula com confete (efeitos.js) e os colegas aplaudem
  function comemorar(m, b, agora) {
    falar(b, FRASES.estado.pronto, 4);
    m.eventos.push({ nome: "pronto" });
    const k = b.lugar && b.lugar.tipo === "mesa" && !b.rota.length && b.lugar.mesa;
    if (k) irPara(m, b, { tipo: "vaga", vaga: { sala: k.sala, x: k.saida, y: k.pe + 2, tipo: "festa", mesa: k, olha: "baixo", chave: k.topo + 18, temp: true } });
    else festejar(m, b, agora);
    for (const o of m.lista) if (o !== b && !o.rota.length && o.lugar && o.lugar.tipo !== "fora" && Math.hypot(o.x - b.x, o.y - b.y) < 130 && Math.random() < 0.7)
      o.responde = { em: agora + entre(0.5, 1.4), texto: sorteia(FRASES.parabens), aceno: true };
  }

  // você aprovou ou respondeu: o agente agradece acenando para a câmera e o colega mais perto aplaude
  function agradecer(m, b, agora) {
    falar(b, sorteia(FRASES.obrigado), 3.5); b.aceno = agora + 1.5;
    let perto = null, dist = 130;
    for (const o of m.lista) {
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (o !== b && d < dist && !esperando(o) && !o.rota.length && o.lugar && o.lugar.tipo !== "fora") { perto = o; dist = d; }   // quem espera você segue parado
    }
    if (perto) perto.responde = { em: agora + entre(0.7, 1.2), texto: sorteia(FRASES.aplauso), aceno: true, som: "aplauso" };
  }

  function festejar(m, b, agora) { b.confete = performance.now(); b.festa = agora + 2.6; m.eventos.push({ nome: "festa" }); }

  // conversa entre agentes nos dados ("Lendo a resposta de <nome>"): os dois vão para a reunião,
  // desde que quem trabalha não esteja esperando você e o outro esteja livre (ou na mesma conversa)
  function combinarReunioes(m) {
    const porNome = new Map(m.lista.map(b => [b.nome, b]));
    for (const b of m.lista) { const r = trabalhando(b) && /^Lendo a resposta de (.+)$/.exec(b.trabalho.rotulo || ""); b.conversaCom = r && porNome.get(r[1]) || null; }
    for (const b of m.lista) b.reuniao = null;
    for (const b of m.lista) {
      const p = b.conversaCom;
      if (!p || p === b || b.reuniao || p.reuniao) continue;
      const pOk = p.conversaCom === b || (!p.trabalho && !(foraDoExpediente() && p.lugar && p.lugar.tipo === "fora"));
      if (pOk && m.vagas.some(v => v.tipo === "reuniao" && !v.fechada)) { b.reuniao = p.id; p.reuniao = b.id; }
    }
  }

  function colocar(b, lugar) {
    soltarVaga(b);
    b.lugar = lugar; b.rota = [];
    if (lugar.tipo === "fora") { b.x = -24; b.y = 0; }
    else if (lugar.tipo === "mesa") { b.x = lugar.mesa.x; b.y = lugar.mesa.pe; }
    else { lugar.vaga.ocupante = b.id; b.x = lugar.vaga.x; b.y = lugar.vaga.y; }
    b.desde = performance.now() / 1000; b.fica = entre(25, 70);
  }

  function soltarVaga(b) { if (b && b.lugar && b.lugar.vaga && b.lugar.vaga.ocupante === b.id) b.lugar.vaga.ocupante = null; }

  // rotina do dia (horário real): daily, almoço e pausa do café puxam todo mundo que está livre; fora do expediente, nada
  function momento() {
    const h = Ceu.agora().h;
    if (foraDoExpediente(h)) return null;
    if (h >= 9.5 && h < 9.84) return { nome: "daily", tipos: { reuniao: 60 } };
    if (h >= 12 && h < 13) return { nome: "almoco", tipos: { lanche: 12, cozinha: 10, cafe: 4 } };
    if (h >= 15.5 && h < 15.84) return { nome: "cafe", tipos: { cafe: 14, lanche: 6, roda: 1 } };
    return null;
  }

  function vagaLivre(m, b, evitar) {
    const livres = m.vagas.filter(v => !v.ocupante && !v.fechada && v !== evitar);
    if (!livres.length) return null;
    const mo = m.mo !== undefined ? m.mo : momento();   // o passo já lê o momento uma vez por quadro
    let tot = 0; const pesos = livres.map(v => (tot += (mo && mo.tipos[v.tipo]) || PESO[v.tipo] || 1));
    const r = Math.random() * tot;
    return livres[pesos.findIndex(p => p >= r)];
  }

  // vaga irmã: mesma atividade, livre e perto (o parceiro do jogo ou da conversa)
  const BEBIDA = ["cafe", "lanche", "papo"];
  function vagaIrma(m, v) {
    const op = m.vagas.filter(o => o !== v && !o.ocupante && !o.fechada && o.sala === v.sala && (o.tipo === v.tipo || (BEBIDA.includes(v.tipo) && BEBIDA.includes(o.tipo))) && Math.hypot(o.x - v.x, o.y - v.y) < 130);
    return op.sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0] || null;
  }

  const livreParaConvite = (b, agora) => !b.trabalho && !b.reuniao && !b.grupo && !b.parceiro && !b.rota.length && b.lugar && b.lugar.tipo === "vaga"
    && !b.lugar.vaga.temp && agora - b.desde > 6;

  // chama um colega livre para a mesma atividade
  function chamarParceiro(m, b, v, agora) {
    if (!EM_DUPLA.has(v.tipo) || b.reuniao) return;
    const irma = vagaIrma(m, v); if (!irma) return;
    const cand = m.lista.filter(o => o !== b && livreParaConvite(o, agora));
    if (!cand.length || Math.random() < 0.25) return;
    const o = sorteia(cand);
    irPara(m, o, { tipo: "vaga", vaga: irma });
    b.parceiro = o.id; o.parceiro = b.id; b.vez = 0; o.vez = 1;
    falar(b, FRASES.convites[v.tipo] || FRASES.convites.padrao, 3); m.eventos.push({ nome: "conversa", voz: b.handle });
  }

  function irPara(m, b, para) {
    b.rota = caminho(m, b.lugar, para);
    soltarVaga(b);
    if (b.parceiro) { const o = m.bonecos.get(b.parceiro); if (o && o.parceiro === b.id) o.parceiro = null; b.parceiro = null; }
    if (b.grupo && para.vaga !== b.grupo.vagas.get(b.id)) sairDaRoda(m, b);
    if (!(para.vaga && para.vaga.tipo === "visita")) b.visita = null;
    b.violao = 0; b.placar = null;   // levantou: acabou a música e a partida
    if (para.vaga) para.vaga.ocupante = b.id; // reserva ao sair
    b.destino = para;
    b.lugar = null;
  }

  function falar(b, texto, seg) { b.fala = texto; b.ate = performance.now() / 1000 + (seg || 4); }

  // --- iniciativas: visita, roda de café, gato e robô --------------------------------------
  function visitar(m, agora) {
    const alvos = m.lista.filter(o => trabalhando(o) && !o.reuniao && !o.rota.length && o.lugar && o.lugar.tipo === "mesa" && !m.lista.some(x => x.visita === o.id));
    const quem = m.lista.filter(b => livreParaConvite(b, agora));
    if (!alvos.length || !quem.length) return;
    const b = sorteia(quem), o = sorteia(alvos), k = o.lugar.mesa;
    b.visita = o.id;
    irPara(m, b, { tipo: "vaga", vaga: { sala: k.sala, x: k.saida, y: k.pe, tipo: "visita", mesa: k, olha: "esq", chave: k.pe + 0.5, temp: true } });
  }

  // pontos de chão livre numa elipse em volta de (cx, cy), olhando para o centro (roda de café, torcida, plateia)
  function pontosEmVolta(m, s, cx, cy, rx, ry, tipo, longeDe) {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      if (x > s.px + 6 && x < s.px + s.pw - 6 && y > s.chao + 6 && y < s.py + s.ph - 4 && (!m.predio.livre || m.predio.livre(x, y))
        && !(longeDe && longeDe.some(o => Math.hypot(o.x - x, o.y - y) < 16)))
        pts.push({ sala: s, x, y, tipo, olha: rumo(cx - x, cy - y), chave: y + 0.5, temp: true });
    }
    return pts;
  }

  function pontosDeRoda(m, centro, n) {
    const pts = pontosEmVolta(m, centro.sala, centro.x, centro.y + 20, 18 + n * 4, 13, "roda");
    const passo = pts.length / n;   // espalha em volta do centro
    return pts.length < n ? pts : Array.from({ length: n }, (_, i) => pts[Math.floor(i * passo)]);
  }

  // torcida (jogo em dupla) e plateia (violão): até "max" livres vêm assistir em volta e saem quando acaba
  function chamarPublico(m, dono, cx, cy, rx, ry, tipo, max, agora) {
    const cand = m.lista.filter(o => o !== dono && livreParaConvite(o, agora) && Math.hypot(o.x - cx, o.y - cy) < 600);
    if (!cand.length) return;
    const ocupadas = m.vagas.filter(v => v.ocupante && v.sala === dono.lugar.vaga.sala);
    const pts = pontosEmVolta(m, dono.lugar.vaga.sala, cx, cy, rx, ry, tipo, [...m.lista.filter(o => o.lugar && o.lugar.vaga && o.lugar.vaga.sala === dono.lugar.vaga.sala), ...ocupadas])
      .filter(v => alcanca(m, v)).sort(() => Math.random() - 0.5);
    cand.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(max, pts.length, cand.length); i++) { pts[i].dono = dono.id; irPara(m, cand[i], { tipo: "vaga", vaga: pts[i] }); }
  }

  // reação do público do dono: "ponto", "final" (aplaude, um som só) ou "chega"
  function reagirPublico(m, dono, tipo, agora) {
    let som = tipo === "final";
    for (const t of m.lista) {
      const v = t.lugar && t.lugar.vaga;
      if (!v || v.dono !== dono.id || t.rota.length || Math.random() > (tipo === "final" ? 0.9 : 0.5)) continue;
      t.responde = { em: agora + entre(0.3, 1.1), texto: sorteia(tipo === "final" && v.tipo === "plateia" ? FRASES.aplauso : FRASES.torcida[tipo]), aceno: true, som: som ? "aplauso" : undefined };
      som = false;
      if (tipo === "final") t.fica = agora - t.desde + entre(2.5, 4);   // aplaude e vai embora
    }
  }

  // devolve true se montou; senão o motivo (fica em m.rodaMotivo, para conferir) e quem chamou tenta de novo
  function montarRoda(m, agora, maximo) {
    if (m.roda) return true;
    // parados e quem está a caminho de uma vaga comum (esse termina o trecho e segue para a roda)
    const aCaminho = b => b.rota.length && b.destino && b.destino.vaga && !b.destino.vaga.temp;
    const quem = m.lista.filter(b => livreParaConvite(b, agora) || (m.mo && !b.trabalho && !b.grupo && !b.reuniao && !b.visita
      && ((!b.rota.length && b.lugar && b.lugar.tipo === "vaga") || aCaminho(b))));
    if (quem.length < 3) return (m.rodaMotivo = `só ${quem.length} livres`);
    // centro: o café da cozinha; se ali não couberem 3, o café da sala comunal
    const cafes = m.vagas.filter(v => v.tipo === "cafe" && !v.fechada).sort((a, b) => (b.sala.tipo === "cozinha") - (a.sala.tipo === "cozinha"));
    let pts = [];
    for (const centro of cafes) { pts = pontosDeRoda(m, centro, Math.min(quem.length, maximo)).filter(v => alcanca(m, v)); if (pts.length >= 3) break; }
    if (pts.length < 3) return (m.rodaMotivo = cafes.length ? `só ${pts.length} pontos livres em volta do café` : "sem vaga de café");
    quem.sort(() => Math.random() - 0.5);
    const roda = { membros: new Set(), vagas: new Map(), fim: agora + entre(25, 45), proxFala: 3, ultimo: null };
    m.roda = roda;
    pts.forEach((v, i) => {
      const b = quem[i]; roda.vagas.set(b.id, v);
      if (b.rota.length) { b.irRoda = v; v.ocupante = b.id; } else irPara(m, b, { tipo: "vaga", vaga: v });
      b.grupo = roda; roda.membros.add(b);
    });
    falar(quem.find(b => !b.rota.length) || quem[0], FRASES.convites.roda, 3); m.eventos.push({ nome: "conversa", voz: quem[0].handle });
    m.rodaMotivo = null;
    return true;
  }

  function sairDaRoda(m, b) {
    const r = b.grupo; if (!r) return;
    const v = r.vagas.get(b.id); if (b.irRoda === v && v && v.ocupante === b.id) v.ocupante = null;
    b.grupo = null; b.irRoda = null; r.membros.delete(b); r.vagas.delete(b.id);
    if (r.membros.size < 2) encerrarRoda(m, r);
  }

  function encerrarRoda(m, r) {
    const agora = performance.now() / 1000;
    for (const b of r.membros) {
      if (b.irRoda && b.irRoda.ocupante === b.id) b.irRoda.ocupante = null;   // ainda não tinha chegado
      b.irRoda = null; b.grupo = null; b.desde = agora; b.fica = entre(0.5, 5);
    }
    r.membros.clear();
    if (m.roda === r) m.roda = null;
  }

  function cuidarDaRoda(m, dt, agora) {
    const r = m.roda; if (!r) return;
    if (agora > r.fim) { encerrarRoda(m, r); return; }
    if ((r.proxFala -= dt) > 0) return;
    const chegados = [...r.membros].filter(b => !b.rota.length && b.lugar && b.lugar.vaga === r.vagas.get(b.id));
    if (chegados.length < 2) { r.proxFala = 0.5; return; }
    r.proxFala = entre(2.2, 3.6);
    const a = sorteia(chegados.filter(b => b !== r.ultimo)) || chegados[0];
    r.ultimo = a;
    const outro = sorteia(chegados.filter(b => b !== a)), r0 = Math.random();
    if (r0 < 0.15) {   // piada: pergunta, resposta e a roda inteira ri (uma risada só no som)
      const [p, q] = sorteia(FRASES.piadas);
      falar(a, p, 2.6); a.responde = { em: agora + 2.8, texto: q };
      let som = true;
      for (const o of chegados) if (o !== a) { o.responde = { em: agora + entre(4, 4.8), texto: sorteia(FRASES.risadas), som: som ? "risada" : undefined }; som = false; }
      r.proxFala = 7.5;
    } else if (r0 < 0.45) { const d = sorteia(FRASES.dialogos); falar(a, d[0], 2.6); outro.responde = { em: agora + 1.6, texto: d[1] }; }
    else falar(a, sorteia(Math.random() < 0.7 ? FRASES.atividade.roda : FRASES.respostas), 2.6);
    m.eventos.push({ nome: "conversa", voz: a.handle });
  }

  function verGato(m, agora) {
    const g = m.predio.animados.find(a => a.tipo === "gato"), quem = m.lista.filter(b => livreParaConvite(b, agora));
    if (!g || !quem.length || m.lista.some(b => b.lugar && b.lugar.vaga && b.lugar.vaga.tipo === "gato")) return;
    const s = [...m.predio.salas, ...m.predio.baixo].find(x => g.x >= x.px && g.x <= x.px + x.pw && g.y >= x.py && g.y <= x.py + x.ph);
    if (!s) return;
    const y = Math.min(g.y + g.h, s.py + s.ph - 6);
    for (const [x, olha] of [[g.x - 7, "dir"], [g.x + g.w + 7, "esq"]]) {
      const v = { sala: s, x: Math.round(x), y: Math.round(y), tipo: "gato", olha, chave: y + 0.5, temp: true };
      if ((!m.predio.livre || m.predio.livre(v.x, v.y)) && alcanca(m, v)) { irPara(m, sorteia(quem), { tipo: "vaga", vaga: v }); return; }
    }
  }

  function verRobo(m, agora) {
    const r = window.Efeitos && Efeitos.aspirador && Efeitos.aspirador();
    if (!r) return;
    for (const b of m.lista) if (!b.rota.length && !b.fala && b.lugar && b.lugar.tipo !== "fora" && Math.hypot(b.x - r.x, b.y - r.y) < 20 && agora > (b.proxRobo || 0)) {
      b.proxRobo = agora + 40; falar(b, sorteia(FRASES.robo), 3); b.aceno = agora + 1.5; m.eventos.push({ nome: "robo" });
    }
  }

  // --- passo de simulação ----------------------------------------------------------------
  function passo(m, dt) {
    const agora = performance.now() / 1000, ceu = Ceu.agora();
    m.fora = foraDoExpediente(ceu.h); m.noite = ceu.escuro; m.mo = momento();   // lidos uma vez por quadro
    for (const b of m.lista) {
      if (b.fala && agora > b.ate) b.fala = null;
      if (b.responde && agora >= b.responde.em) {
        if (!b.rota.length) {
          falar(b, b.responde.texto, 3); m.eventos.push({ nome: "conversa", voz: b.handle }); if (b.responde.aceno) b.aceno = agora + 1.2; if (b.responde.som) m.eventos.push({ nome: b.responde.som });
          const o = b.responde.lanca && m.bonecos.get(b.responde.lanca);   // guerra de papel: revida
          if (o && o.lugar && window.Efeitos && Efeitos.lancar) { b.arremesso = agora + 0.8; Efeitos.lancar(b.x, b.y - 16, o.x, o.y - 14, "papel"); m.eventos.push({ nome: "papel" }); }
        }
        b.responde = null;
      }
      if (b.rota.length) { andar(m, b, dt, agora); if (!b.rota.length) chegar(m, b, agora); }
      else if (b.lugar) decidir(m, b, dt, agora);
      posar(m, b, agora);
    }
    duplas(m, dt, agora);
    cuidarDaRoda(m, dt, agora);
    if (!m.fora) {
      if ((m.proxVisita -= dt) <= 0) { m.proxVisita = entre(25, 50); visitar(m, agora); }
      if ((m.proxGato -= dt) <= 0) { m.proxGato = entre(45, 90); verGato(m, agora); }
      const mo = m.mo;
      if (mo && mo.nome === "cafe" && !m.roda && !m.rodaDoCafe && m.proxRoda > 5) m.proxRoda = 0;   // começou a pausa: tenta já
      if ((m.proxRoda -= dt) <= 0) {
        const pausa = !!mo && mo.nome === "cafe", ok = montarRoda(m, agora, pausa ? 5 : 4) === true;
        m.proxRoda = ok ? entre(70, 140) : pausa ? 5 : entre(20, 40);   // na pausa do café, tenta de novo logo
        if (pausa && ok) m.rodaDoCafe = true;
      }
      if (!mo) m.rodaDoCafe = false;
    }
    if ((m.proxRobo -= dt) <= 0) { m.proxRobo = 1; verRobo(m, agora); }
    jogosSozinho(m, dt);
    if (!m.fora) brincadeiras(m, dt, agora);
    papo(m, dt, agora);
    comentarTrabalho(m, dt);
  }

  // onde cada um quer estar agora: dados primeiro (reunião, mesa), depois o horário
  function alvoDe(m, b) {
    if (b.reuniao) return "reuniao";
    if (b.trabalho && b.mesa) return "mesa";
    return m.fora ? "fora" : "livre";
  }

  function decidir(m, b, dt, agora) {
    const alvo = alvoDe(m, b), l = b.lugar;
    if (alvo === "fora") {
      if (l.tipo !== "fora" && Math.random() < dt * 0.25) { falar(b, sorteia(FRASES.saida), 3); irPara(m, b, { tipo: "fora" }); }
      return;
    }
    if (alvo === "mesa") { if (l.tipo !== "mesa") irPara(m, b, { tipo: "mesa", mesa: b.mesa }); return; }
    if (alvo === "reuniao") { if (!(l.vaga && l.vaga.tipo === "reuniao") && agora > (b.espera || 0)) irReuniao(m, b, agora); return; }
    if (l.tipo === "fora") {
      if (Math.random() < dt * 0.2) { const v = vagaLivre(m, b); if (v) { irPara(m, b, { tipo: "vaga", vaga: v }); b.chegou = true; } }
      return;
    }
    if (l.tipo === "mesa") { // comemora antes de levantar; sem vaga livre, tenta de novo daqui a pouco
      if (b.festa < agora && agora > (b.espera || 0)) { const v = vagaLivre(m, b); if (v) irPara(m, b, { tipo: "vaga", vaga: v }); else b.espera = agora + entre(3, 6); }
      return;
    }
    const v = l.vaga;
    if (b.emReuniao) { b.emReuniao = false; b.fica = 0; }
    if (v.tipo === "visita") { const o = m.bonecos.get(b.visita); if (!o || !o.lugar || o.lugar.mesa !== v.mesa || !o.trabalho) b.fica = Math.min(b.fica, agora - b.desde); }
    if (v.dono) {   // torcida e plateia: acabou o jogo (ou a música), vão embora logo
      const d = m.bonecos.get(v.dono), ativo = d && (v.tipo === "torcida" ? !!d.parceiro : d.violao > agora - 5);   // 5 s para aplaudir no fim
      if (!ativo) b.fica = Math.min(b.fica, agora - b.desde + 2);
    }
    if (b.grupo || b.violao > agora) return;
    const mo = m.mo, cansou = agora - b.desde > b.fica, foraDaHora = mo && !mo.tipos[v.tipo] && agora - b.desde > 4;
    if (!cansou && !foraDaHora) return;
    const nv = vagaLivre(m, b, v);
    if (!nv) { b.desde = agora; b.fica = entre(3, 6); return; }
    if (v.tipo === "visita") { falar(b, sorteia(FRASES.visita.tchau), 2.5); b.visita = null; }
    irPara(m, b, { tipo: "vaga", vaga: nv });
  }

  function irReuniao(m, b, agora) {
    const p = m.bonecos.get(b.reuniao), pv = p && ((p.destino && p.destino.vaga) || (p.lugar && p.lugar.vaga));
    const livres = m.vagas.filter(v => v.tipo === "reuniao" && !v.ocupante && !v.fechada);
    if (!livres.length) { if (b.mesa && b.lugar.tipo !== "mesa") irPara(m, b, { tipo: "mesa", mesa: b.mesa }); else b.espera = agora + entre(3, 6); return; }
    const oposto = { cima: "baixo", baixo: "cima", esq: "dir", dir: "esq" };
    const nota = v => (pv && pv.tipo === "reuniao" ? Math.hypot(v.x - pv.x, v.y - pv.y) - (oposto[v.olha] === pv.olha ? 60 : 0) : Math.random());
    irPara(m, b, { tipo: "vaga", vaga: livres.sort((a, c) => nota(a) - nota(c))[0] });
    b.emReuniao = true;
  }

  function andar(m, b, dt, agora) {
    if (b.pausa > agora) return;   // parou um instante no caminho (high-five)
    let resto = VEL * dt;
    while (resto > 0 && b.rota.length) {
      const [tx, ty] = b.rota[0], dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
      if (d > 0.5) b.olha = rumo(dx, dy);
      if (d <= resto) { b.x = tx; b.y = ty; b.rota.shift(); resto -= d; b.passos += d; }
      else { b.x += (dx / d) * resto; b.y += (dy / d) * resto; b.passos += resto; resto = 0; }
    }
    if (b.passos > 11) { // um passo a cada ~0,3 s de caminhada, no som do piso de onde ele pisa
      b.passos = 0;
      if (agora > m.proxPasso && b.x > -20) { m.proxPasso = agora + 0.12; m.eventos.push({ nome: "passo", piso: pisoEm(m, b.x, b.y) }); }
    }
  }

  function pisoEm(m, x, y) {
    const p = m.predio;
    for (const s of p.salas) if (x >= s.px && x <= s.px + s.pw && y >= s.py && y <= s.py + s.ph) return MATERIAL[s.piso] || "madeira";
    for (const s of p.baixo) if (x >= s.px && x <= s.px + s.pw && y >= s.py && y <= s.py + s.ph) return MATERIAL[s.piso] || "madeira";
    const r = p.predioRet;
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h ? "ladrilho" : "calcada";
  }

  function chegar(m, b, agora) {
    const d = b.destino; b.destino = null;
    b.lugar = d; b.desde = agora; b.fica = entre(25, 70);
    if (b.irRoda && !b.trabalho) { const v = b.irRoda; b.irRoda = null; if (b.grupo && b.grupo.vagas.get(b.id) === v) { irPara(m, b, { tipo: "vaga", vaga: v }); return; } }   // chamado para a roda no caminho
    if (b.chegou && d.tipo !== "fora") { falar(b, sorteia(FRASES.chegada), 3); b.aceno = agora + 1.5; b.chegou = false; }
    if (!d.vaga) return;
    const tipo = d.vaga.tipo;
    if (tipo !== "reuniao") b.emReuniao = false;
    if (tipo === "visita") {
      const o = m.bonecos.get(b.visita);
      falar(b, sorteia(FRASES.visita.chega), 3); m.eventos.push({ nome: "conversa", voz: b.handle });
      if (o) o.responde = { em: agora + 1.8, texto: sorteia(FRASES.visita.responde) };
      b.fica = entre(9, 14);
    } else if (tipo === "festa") {
      festejar(m, b, agora); b.fica = 3.2;
    } else if (tipo === "torcida" || tipo === "plateia") {
      if (Math.random() < 0.4) falar(b, sorteia(tipo === "torcida" ? FRASES.torcida.chega : FRASES.plateia), 2.6);
      b.fica = 120;   // fica até o jogo ou a música acabar (decidir)
    } else if (tipo === "aquario") {
      falar(b, sorteia(FRASES.objeto.aquario), 3); b.fica = entre(7, 11);
    } else if (tipo === "gato") {
      falar(b, sorteia(FRASES.atividade.gato), 3); m.eventos.push({ nome: "miau" }); b.fica = entre(6, 10);
    } else if (tipo === "reuniao" && b.reuniao) {
      const p = m.bonecos.get(b.reuniao);
      if (p && !p.rota.length && p.lugar && p.lugar.vaga && p.lugar.vaga.tipo === "reuniao") { b.parceiro = p.id; p.parceiro = b.id; b.vez = 0; p.vez = 1; }
    } else if (!d.vaga.temp && !b.parceiro) chamarParceiro(m, b, d.vaga, agora);
    if (tipo === "cafe") m.eventos.push({ nome: "cafe" });
  }

  // pose, direção e ordem de desenho de cada um (o avatar.js só lê estes campos)
  function posar(m, b, agora) {
    const l = b.lugar;
    b.chave = b.y + 0.5; b.sentado = false;
    if (b.rota.length || !l) { b.pose = !b.rota.length ? "parado" : b.pausa > agora ? "acenando" : "andando"; return; }
    if (l.tipo === "mesa") {
      b.olha = "baixo"; b.sentado = true;
      b.pose = b.festa > agora ? "comemorando" : b.aceno > agora ? "acenando" : b.arremesso > agora ? "arremesso" : trabalhando(b) ? "digitando" : esperando(b) ? "esperando" : "sentado";
      return;
    }
    if (l.tipo !== "vaga") return;
    const v = l.vaga;
    b.olha = v.olha || "baixo"; b.chave = v.chave || b.chave;
    if (b.festa > agora) b.pose = "comemorando";
    else if (b.arremesso > agora) b.pose = "arremesso";
    else if (b.violao > agora) b.pose = "violao";
    else if (b.aceno > agora) b.pose = v.senta ? "sentado" : "acenando";
    else if (b.danca > agora && !v.senta) b.pose = "dancando";
    else if (POSE[v.tipo]) b.pose = POSE[v.tipo];
    else if (v.senta) b.pose = m.noite > 0.6 && v.tipo !== "reuniao" ? "dormindo" : "sentado";
    else b.pose = "parado";
    b.sentado = v.senta;
  }

  // duplas: quem chegou junto conversa (ou joga) revezando a vez
  function duplas(m, dt, agora) {
    for (const b of m.lista) {
      if (!b.parceiro || b.vez !== 0) continue;
      const o = m.bonecos.get(b.parceiro);
      if (!o || o.parceiro !== b.id) { b.parceiro = null; b.placar = null; continue; }
      const juntos = !b.rota.length && !o.rota.length && b.lugar && o.lugar && b.lugar.tipo === "vaga" && o.lugar.tipo === "vaga" && Math.hypot(b.x - o.x, b.y - o.y) < 160;
      if (!juntos || (b.proxFala = (b.proxFala || 0) - dt) > 0) continue;
      b.proxFala = entre(2.4, 4);
      const tipo = b.lugar.vaga.tipo, jogo = JOGOS.has(tipo) && !b.reuniao;
      if (jogo) { partida(m, b, o, tipo, agora); continue; }
      if (!b.dialogo || b.passoDialogo >= b.dialogo.length) {
        b.dialogo = b.reuniao ? sorteia(FRASES.reuniaoDados) : sorteia(FRASES.dialogos);
        b.passoDialogo = 0; b.rodadas = (b.rodadas || 0) + 1;
      }
      const quem = b.passoDialogo % 2 === 0 ? b : o;
      falar(quem, b.dialogo[b.passoDialogo++], 2.6);
      m.eventos.push({ nome: "conversa", voz: quem.handle });
      if (!b.reuniao && b.rodadas > 4 && b.passoDialogo >= b.dialogo.length) { b.parceiro = null; o.parceiro = null; b.rodadas = 0; b.fica = 0; o.fica = 3; } // cansaram
    }
  }

  // jogo em dupla: cada vez é uma jogada; quem fizer 3 pontos é campeão (a torcida chega no começo e aplaude no fim)
  function partida(m, b, o, tipo, agora) {
    if (!b.placar) { b.placar = [0, 0]; b.vezJogo = 0; if (Math.random() < 0.7) chamarPublico(m, b, (b.x + o.x) / 2, (b.y + o.y) / 2, 52, 30, "torcida", 3, agora); }
    const quem = b.vezJogo++ % 2 === 0 ? b : o, outro = quem === b ? o : b;
    let ponto = null;
    if (ARREMESSO.has(tipo)) {   // dardos e basquete: quem joga arremessa e acerta ou erra
      const acerta = Math.random() < 0.45;
      quem.arremesso = agora + 0.8; falar(quem, sorteia(FRASES[tipo][acerta ? "acerto" : "erro"]), 2.2);
      m.eventos.push({ nome: tipo === "dardos" ? "dardo" : "cesta", acerto: acerta });
      if (acerta) ponto = quem;
    } else {
      falar(quem, sorteia(FRASES.atividade[tipo] || ["GG!"]), 2.6);
      m.eventos.push({ nome: "jogo_" + tipo });
      if (Math.random() < 0.35) ponto = Math.random() < 0.5 ? b : o;
    }
    if (!ponto) { if (b.vezJogo > 40) encerrarPartida(m, b, o); return; }   // segurança: ninguém joga para sempre
    const p = b.placar, perde = ponto === b ? o : b;
    p[ponto === b ? 0 : 1]++;
    if (Math.max(p[0], p[1]) >= PLACAR) {   // fim: campeão comemora, o outro pede revanche, a torcida aplaude
      ponto.festa = agora + 2.6; falar(ponto, `${sorteia(FRASES.campeao[tipo] || FRASES.campeao.padrao)} ${p[0]} x ${p[1]}`, 3.2);
      perde.responde = { em: agora + 1.4, texto: sorteia(FRASES.revanche) };
      m.eventos.push({ nome: "vitoria" });
      reagirPublico(m, b, "final", agora);
      encerrarPartida(m, b, o);
      return;
    }
    if (!ARREMESSO.has(tipo)) { ponto.festa = agora + 1.4; falar(ponto, `${sorteia(FRASES.jogo.ganhou)} ${p[0]} x ${p[1]}`, 2.4); perde.responde = { em: agora + 1.2, texto: sorteia(FRASES.jogo.perdeu) }; }
    else outro.responde = { em: agora + 1.2, texto: `${p[0]} x ${p[1]}` };
    reagirPublico(m, b, "ponto", agora);
  }

  function encerrarPartida(m, b, o) {
    b.placar = null; b.vezJogo = 0; b.parceiro = null; o.parceiro = null; b.rodadas = 0;
    b.fica = Math.min(b.fica, performance.now() / 1000 - b.desde + 4); o.fica = Math.min(o.fica, performance.now() / 1000 - o.desde + 6);
  }

  // --- brincadeiras soltas -----------------------------------------------------------------
  // high-five no caminho, música (dancinha e karaokê na jukebox), violão com plateia, cesta de papel na mesa,
  // aviãozinho e guerra de bolinha de papel na sexta à tarde. Tudo por temporizador, nada por quadro.
  function brincadeiras(m, dt, agora) {
    if ((m.proxToca -= dt) <= 0) { m.proxToca = 0.4; highFive(m, agora); }
    if ((m.proxMusica -= dt) <= 0) { m.proxMusica = entre(2.5, 4); musica(m, agora); }
    if ((m.proxViolao -= dt) <= 0) { m.proxViolao = entre(60, 120); violao(m, agora); }
    if ((m.proxPapel -= dt) <= 0) { m.proxPapel = entre(25, 50); cestaDePapel(m, agora); }
    if ((m.proxAviao -= dt) <= 0) { m.proxAviao = entre(50, 100); lancarPapel(m, agora, "aviao"); }
    if ((m.proxGuerra -= dt) <= 0) { m.proxGuerra = entre(7, 12); if (sextaATarde()) lancarPapel(m, agora, "guerra"); }
  }

  // sexta das 16h às 18h (a data respeita ?data=AAAA-MM-DD, como as festas)
  function sextaATarde() {
    const h = Ceu.agora().h, d = new URLSearchParams(location.search).get("data");
    return h >= 16 && h < 18 && (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date()).getDay() === 5;
  }

  // dois livres que se cruzam andando param um instante e batem a mão (cada um no máximo a cada 1-2 min)
  function highFive(m, agora) {
    const L = m.lista;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.rota.length || a.trabalho || a.pausa > agora || agora < (a.proxToca || 0) || a.x < 0) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.rota.length || b.trabalho || b.pausa > agora || agora < (b.proxToca || 0) || Math.abs(a.x - b.x) > 16 || Math.abs(a.y - b.y) > 10) continue;
        a.proxToca = b.proxToca = agora + entre(60, 120);
        if (Math.random() < 0.5) break;   // nem todo cruzamento vira high-five
        a.pausa = b.pausa = a.aceno = b.aceno = agora + 0.9;
        a.olha = b.x < a.x ? "esq" : "dir"; b.olha = a.x < b.x ? "esq" : "dir";
        falar(a, sorteia(FRASES.highfive), 1.8); falar(b, sorteia(FRASES.highfiveVolta), 1.8);
        m.eventos.push({ nome: "palma" });
        return;
      }
    }
  }

  // quem toca (piano, jukebox ou violão) faz som; na jukebox canta e quem está de pé na sala dança
  function musica(m, agora) {
    for (const b of m.lista) {
      if (b.violao && b.violao <= agora) { b.violao = 0; reagirPublico(m, b, "final", agora); continue; }   // acabou a música: aplausos
      const v = !b.rota.length && b.lugar && b.lugar.vaga, viola = b.violao > agora;
      if (!viola && !(v && v.tipo === "musica")) continue;
      m.eventos.push({ nome: "musica", instrumento: viola ? "violao" : v.jukebox ? "jukebox" : "piano" });
      if (viola) { if (Math.random() < 0.2 && !b.fala) falar(b, sorteia(FRASES.violao), 2.6); continue; }
      if (!v.jukebox) continue;
      b.danca = agora + 5;
      if (Math.random() < 0.25 && !b.fala) falar(b, sorteia(FRASES.karaoke), 2.6);
      for (const o of m.lista) {
        const ov = o !== b && !o.rota.length && o.lugar && o.lugar.vaga;
        if (!ov || ov.sala !== v.sala || ov.senta || o.trabalho || o.reuniao) continue;
        o.danca = agora + 5;
        if (Math.random() < 0.08 && !o.fala) falar(o, sorteia(FRASES.danca), 2.2);
      }
    }
  }

  // alguém sentado num pufe, poltrona ou sofá pega o violão; até 2 colegas vêm ouvir
  function violao(m, agora) {
    if (m.lista.some(b => b.violao > agora)) return;
    const quem = m.lista.filter(b => livreParaConvite(b, agora) && b.lugar.vaga.senta && ["pufe", "poltrona", "papo", "tv"].includes(b.lugar.vaga.tipo));
    if (!quem.length) return;
    const b = sorteia(quem);
    b.violao = agora + entre(25, 40); falar(b, sorteia(FRASES.violao), 3);
    chamarPublico(m, b, b.x, b.y + 6, 34, 22, "plateia", 2, agora);
  }

  // quem trabalha na mesa amassa um papel e joga na lixeira mais perto (sem lixeira por perto, não joga)
  function cestaDePapel(m, agora) {
    const quem = m.lista.filter(b => trabalhando(b) && !b.rota.length && b.lugar && b.lugar.tipo === "mesa" && !b.fala);
    if (!quem.length) return;
    const b = sorteia(quem), lixo = movelPerto(m.predio, b, /^lixeira/, 90);
    if (!lixo) return;
    const acerta = Math.random() < 0.6, lx = lixo.x + lixo.w / 2 + (acerta ? 0 : Math.random() < 0.5 ? -10 : 10);
    b.arremesso = agora + 0.8; falar(b, sorteia(FRASES.papel[acerta ? "acerto" : "erro"]), 2.4);
    if (window.Efeitos && Efeitos.lancar) Efeitos.lancar(b.x + 6, b.y - 16, lx, lixo.y + lixo.h / 2, "papel");
    m.eventos.push({ nome: "papel" });
  }

  // aviãozinho (qualquer hora) ou guerra de bolinha (sexta à tarde, com revide) entre dois livres da mesma sala
  function lancarPapel(m, agora, modo) {
    const quem = m.lista.filter(b => livreParaConvite(b, agora) && !b.fala);
    for (const a of quem.sort(() => Math.random() - 0.5)) {
      const alvo = quem.find(o => o !== a && o.lugar.vaga.sala === a.lugar.vaga.sala && Math.abs(Math.hypot(o.x - a.x, o.y - a.y) - 95) < 65);
      if (!alvo) continue;
      a.arremesso = agora + 0.8;
      falar(a, sorteia(modo === "aviao" ? FRASES.aviao : FRASES.guerra), 2.4);
      if (window.Efeitos && Efeitos.lancar) Efeitos.lancar(a.x, a.y - 16, alvo.x, alvo.y - 14, modo === "aviao" ? "aviao" : "papel");
      alvo.responde = modo === "aviao" ? { em: agora + 1, texto: sorteia(FRASES.aviaoVolta) } : { em: agora + 1.2, texto: sorteia(FRASES.guerra), lanca: a.id };
      m.eventos.push({ nome: "papel" });
      return;
    }
  }

  // --- interface do brincar.js (Front): objeto clicado no mapa e festa geral (Konami) --------
  // Só quem está livre reage; quem trabalha ou espera você não sai da mesa.
  const ALVO_CLIQUE = { cafe: v => v.tipo === "cafe", tv: v => v.tipo === "tv", arcade: v => v.tipo === "arcade", jukebox: v => v.tipo === "musica" && v.jukebox };
  const salaEm = (m, x, y) => m.predio.salas.find(s => x >= s.px && x <= s.px + s.pw && y >= s.py && y <= s.py + s.ph)
    || m.predio.baixo.find(s => x >= s.px && x <= s.px + s.pw && y >= s.py && y <= s.py + s.ph) || null;

  function objetoClicado(m, alvo) {
    const { tipo, x, y } = alvo || {};
    if (!m || typeof tipo !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const agora = performance.now() / 1000, sala = (alvo && alvo.sala) || salaEm(m, x, y);
    const nota = b => Math.hypot(b.x - x, b.y - y) + (sala && b.lugar.vaga.sala !== sala ? 400 : 0);
    const perto = m.lista.filter(b => !b.trabalho && !b.reuniao && !b.grupo && !b.parceiro && !b.rota.length && b.lugar && b.lugar.tipo === "vaga"
      && !b.lugar.vaga.temp && !(b.violao > agora)).sort((a, b) => nota(a) - nota(b));
    if (Object.hasOwn(ALVO_CLIQUE, tipo)) {   // só as chaves próprias: "constructor", "toString"... são tipo desconhecido
      const v = m.vagas.filter(v => ALVO_CLIQUE[tipo](v) && !v.ocupante && !v.fechada).sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))[0];
      if (v && perto.length) irPara(m, perto[0], { tipo: "vaga", vaga: v });
      return;
    }
    if (tipo === "gato") { verGato(m, agora); return; }
    if (tipo === "sino") {   // até 3 livres comemoram; quem está por perto (menos quem espera você) aplaude
      const festa = perto.slice(0, 3);
      for (const b of festa) b.festa = agora + 2.6;
      if (festa[0]) falar(festa[0], sorteia(FRASES.objeto.sino), 3);
      let som = true;
      for (const o of m.lista) if (!festa.includes(o) && !esperando(o) && o.lugar && o.lugar.tipo !== "fora" && Math.hypot(o.x - x, o.y - y) < 260) {
        o.responde = { em: agora + entre(0.4, 1.2), texto: sorteia(FRASES.aplauso), aceno: true, som: som ? "aplauso" : undefined }; som = false;
      }
      return;
    }
    if (tipo === "aquario") {   // alguém vai olhar de perto, num ponto livre e alcançável na frente
      const s = sala || salaEm(m, x, y + 8);
      if (!s || !perto.length) return;
      for (const dx of [0, -12, 12]) {
        const v = { sala: s, x: Math.round(x + dx), y: Math.round(Math.min(y + 8, s.py + s.ph - 6)), tipo: "aquario", olha: "cima", temp: true };
        v.chave = v.y + 0.5;
        if ((!m.predio.livre || m.predio.livre(v.x, v.y)) && alcanca(m, v)) { irPara(m, perto[0], { tipo: "vaga", vaga: v }); return; }
      }
      return;
    }
    const frases = Object.hasOwn(FRASES.objeto, tipo) && FRASES.objeto[tipo];   // lousa, quadro de avisos, relógio, luminária, planta: um comentário
    if (frases && perto.length && Math.hypot(perto[0].x - x, perto[0].y - y) < 260) { falar(perto[0], sorteia(frases), 3); m.eventos.push({ nome: "conversa", voz: perto[0].handle }); }
  }

  function festaGeral(m, seg) {
    if (!m) return;
    const agora = performance.now() / 1000, dur = Math.min(Math.max(Number(seg) || 8, 1), 30);
    for (const b of m.lista) {
      if (esperando(b) || (!b.lugar && !b.rota.length)) continue;   // quem espera você fica como está
      if (b.lugar && (b.lugar.tipo === "mesa" || (b.lugar.vaga && b.lugar.vaga.senta))) b.festa = agora + Math.min(dur, 3);   // comemora sem levantar
      else b.danca = agora + dur;
    }
  }

  // quem joga sozinho no fliperama/videogame faz barulhinho de jogo (e às vezes bate o recorde)
  function jogosSozinho(m, dt) {
    if ((m.proxJogo -= dt) > 0) return;
    m.proxJogo = entre(1.2, 2.2);
    for (const b of m.lista) {   // dardos e basquete sozinho: um arremesso a cada poucos segundos
      const v = !b.rota.length && b.lugar && b.lugar.vaga;
      if (!v || !ARREMESSO.has(v.tipo) || b.parceiro || performance.now() / 1000 < (b.proxArremesso || 0)) continue;
      const agora = performance.now() / 1000, acerta = Math.random() < 0.5;
      b.proxArremesso = agora + entre(3.5, 6); b.arremesso = agora + 0.8;
      if (!b.fala || Math.random() < 0.5) falar(b, sorteia(FRASES[v.tipo][acerta ? "acerto" : "erro"]), 2.2);
      m.eventos.push({ nome: v.tipo === "dardos" ? "dardo" : "cesta", acerto: acerta });
    }
    const jogando = m.lista.filter(b => !b.rota.length && b.lugar && b.lugar.vaga && ["arcade", "videogame", "pc"].includes(b.lugar.vaga.tipo));
    if (!jogando.length) return;
    m.eventos.push({ nome: "jogo_arcade" });
    const b = sorteia(jogando);
    if (!b.parceiro && !b.fala && Math.random() < 0.06) { b.festa = performance.now() / 1000 + 1.6; falar(b, sorteia(FRASES.recorde), 2.4); m.eventos.push({ nome: "vitoria" }); }
  }

  // papo solto: alguém livre comenta a atividade e um vizinho responde
  function papo(m, dt, agora) {
    if ((m.proxPapo -= dt) > 0) return;
    m.proxPapo = entre(5, 11);
    const livres = m.lista.filter(b => !b.rota.length && b.lugar && b.lugar.tipo === "vaga" && !b.lugar.vaga.temp && !b.fala && !b.grupo);
    if (!livres.length) return;
    const a = sorteia(livres), tipo = a.lugar.vaga.tipo;
    const festa = window.Festas && Festas.ativa(), mo = m.mo;
    falar(a, mo && mo.nome === "daily" && tipo === "reuniao" ? sorteia(FRASES.daily)
      : festa && Math.random() < 0.35 ? sorteia(festa.falas) : sorteia(FRASES.atividade[tipo] || FRASES.atividade.papo), 4);
    m.eventos.push(tipo === "arcade" || tipo === "videogame" ? { nome: "jogo_arcade" } : { nome: "conversa", voz: a.handle });
    const perto = livres.filter(o => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < 90);
    if (perto.length && Math.random() < 0.7) sorteia(perto).responde = { em: agora + 1.8, texto: sorteia(FRASES.respostas) };
  }

  // de vez em quando alguém na mesa solta um balão genérico do que faz (pela função, sem conteúdo)
  function comentarTrabalho(m, dt) {
    if ((m.proxTrabalho -= dt) > 0) return;
    m.proxTrabalho = entre(14, 30);
    const naMesa = m.lista.filter(b => b.lugar && b.lugar.tipo === "mesa" && b.trabalho && !b.fala);
    if (!naMesa.length) return;
    const b = sorteia(naMesa);
    if (b.trabalho.status === "waiting_approval") falar(b, FRASES.estado.aindaAprovacao, 5);
    else if (b.trabalho.status === "waiting_input") falar(b, FRASES.estado.aindaPergunta, 5);
    else falar(b, sorteia(FRASES.trabalho[b.papel] || FRASES.trabalho.geral), 4);
  }

  function digitando(m) {
    let n = 0;
    for (const b of m.lista) if (b.pose === "digitando") n++;
    return n;
  }

  return { criarMundo, sincronizar, passo, digitando, momento, objetoClicado, festaGeral, FRASES };
})();

window.Vida = Vida;
