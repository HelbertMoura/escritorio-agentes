#!/usr/bin/env python3
"""Gera o áudio do tour da Firmópolis: trilha lo-fi/chiptune original + SFX + narração PT-BR.

Nada vem de serviço pago. A trilha e os efeitos são sintetizados aqui com numpy;
a narração usa o edge-tts (voz pt-BR-AntonioNeural), que roda na máquina.

Uso:
    ~/.local/share/firmopolis-video-venv/bin/python gerar-audio.py

Saídas:
    .build/musica.wav      trilha lo-fi (44.1 kHz estéreo)
    .build/sfx/*.wav       efeitos isolados
    .build/narracao/*.wav  falas isoladas
    assets/audio/mestre.mp3 mix final (música + SFX + narração com ducking)
"""

import json
import math
import os
import random
import subprocess
import sys
import wave

import numpy as np

RAIZ = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(RAIZ, ".build")
SAIDA = os.path.join(RAIZ, "assets", "audio")
SR = 44100
DURACAO = 40.0
BPM = 84.0
VOZ = "pt-BR-AntonioNeural"

# ---------------------------------------------------------------- roteiro ----
# (inicio_s, texto, nome-do-arquivo)  -- o inicio e em segundos do filme.
# Duracoes medidas com edge-tts na voz pt-BR-AntonioNeural a +8%.
NARRACAO = [
    (0.70, "Seu time de agentes de IA, trabalhando no mesmo pr\u00e9dio.", "01-abertura"),
    (6.30, "Cada agente tem uma sala, um andar e uma cidade.", "02-salas"),
    (10.40, "De dia o time trabalha. \u00c0 noite, acende.", "03-dia-noite"),
    (15.30, "Cada terminal vira uma ponte para o escrit\u00f3rio.", "04-ponte"),
    (19.00, "Um agente pede permiss\u00e3o. Voc\u00ea responde do mapa.", "05-permissao"),
    (23.80, "E isso tamb\u00e9m pelo celular.", "06-celular"),
    (27.00, "O pr\u00e9dio tem vida pr\u00f3pria: r\u00e1dio e andares.", "07-vida"),
    (30.80, "Cada workspace vira uma cidade no mapa.", "08-cidades"),
    (34.20, "Zero token. S\u00f3 leitura por padr\u00e3o. C\u00f3digo aberto.", "09-fechamento"),
]

# Efeitos: (inicio_s, arquivo) -- cada um tem causa na imagem.
SFX = [
    (0.05, "whoosh"),    # entra a abertura
    (0.30, "pop"),       # assina a marca
    (1.05, "blip"),      # primeira palavra do gancho
    (5.35, "whoosh"),    # corte para o escritorio
    (5.60, "blip"),      # titulo "O Escritorio Vivo"
    (8.10, "click"),     # corte para o dia
    (10.30, "whoosh"),   # dia -> noite com chuva
    (12.10, "whoosh"),   # noite -> fachada acesa
    (13.75, "whoosh"),   # corte para os terminais
    (14.00, "blip"),     # titulo "Do terminal ao mapa"
    (16.10, "click"),    # cartao de permissao
    (18.70, "click"),    # cartao de resposta
    (21.30, "blip"),     # celular
    (24.55, "whoosh"),   # corte para a vida propria
    (24.90, "blip"),     # titulo "Vida propria"
    (26.90, "blip"),     # radio
    (28.90, "blip"),     # andares por cidade
    (30.90, "blip"),     # mapa do mundo
    (33.05, "riser"),    # entrada do fechamento
    (33.55, "pop"),      # assinatura da marca
    (34.35, "blip"),     # chip "Zero token"
    (35.55, "blip"),     # chip "So leitura por padrao"
    (37.45, "blip"),     # chip "Codigo aberto"
    (37.90, "click"),    # endereco do site
]

# --------------------------------------------------------------- utilidades ---


def salvar_wav(caminho, audio, sr=SR):
    """Grava float32 (-1..1) em WAV 16 bits estéreo ou mono."""
    audio = np.clip(audio, -1.0, 1.0)
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    dados = (audio * 32767.0).astype("<i2")
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with wave.open(caminho, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(dados.tobytes())


def envelope(n, ataque, decaimento, curva=2.0):
    """ADSR simplificado: ataque linear e decaimento exponencial."""
    env = np.zeros(n)
    a = max(1, int(ataque * SR))
    a = min(a, n)
    env[:a] = np.linspace(0.0, 1.0, a)
    if n > a:
        resto = np.arange(n - a)
        env[a:] = np.exp(-resto / (decaimento * SR))
    return env


def adsr(n, ataque, decaimento, sustentacao, liberacao):
    """ADSR de verdade, em amostras."""
    a = max(1, int(ataque * SR))
    d = max(1, int(decaimento * SR))
    s = max(1, int(sustentacao * SR))
    r = max(1, int(liberacao * SR))
    env = np.zeros(n)
    i = 0
    for parte, valor in ((a, np.linspace(0, 1, a)), (d, np.linspace(1, 0.62, d)),
                         (s, np.full(s, 0.62)), (r, np.linspace(0.62, 0, r))):
        env[i:i + len(valor)] = valor[: max(0, min(len(valor), n - i))]
        i += len(valor)
    return env


def onda_onda(freq, dur, tipo="tri", duty=0.5, fase=0.0):
    """Oscilador sem harmônicos de glide: pulso/triângulo/senoide."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    if tipo == "seno":
        return np.sin(2 * np.pi * freq * t + fase)
    ph = (freq * t + fase) % 1.0
    if tipo == "pulso":
        return np.where(ph < duty, 1.0, -1.0).astype(float)
    # triângulo
    return 4.0 * np.abs(ph - 0.5) - 1.0


def nota(midi, dur):
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def passa_baixa(x, corte):
    """Filtro de um pólo (lowpass) aplicado duas vezes, em blocos."""
    a = math.exp(-2.0 * math.pi * corte / SR)
    y = np.zeros_like(x)
    z = 0.0
    for i in range(len(x)):
        z = (1 - a) * x[i] + a * z
        y[i] = z
    return y


def passa_alta(x, corte):
    return x - passa_baixa(x, corte)


def distorcao(x,drive=2.0):
    return np.tanh(x * drive) / math.tanh(drive)


def reverberacao(x, tempo=1.1, decaimento=3.0):
    """Convolução por FFT com impulso de ruído em decaimento exponencial."""
    n = int(tempo * SR)
    imp = np.random.default_rng(7).normal(0, 1, n)
    imp *= np.exp(-np.arange(n) / (decaimento * SR * 0.35))
    imp[0] = 1.0
    imp = imp / np.linalg.norm(imp) * 2.2
    nfft = 1 << int(np.ceil(np.log2(len(x) + len(imp))))
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(imp, nfft), nfft)[: len(x)]
    return y


def ruido(n, seed):
    """Ruido branco com semente fixa (nada de aleatorio sem semente no filme)."""
    return np.random.default_rng(seed).normal(0, 1, n)


def normalizar_rms(x, alvo):
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-9
    return x * (alvo / rms)


def normalizar_rms_limitado(x, alvo, teto=0.85):
    """Normaliza pelo RMS mas segura o pico: transiente curto nao satura o WAV."""
    x = normalizar_rms(x, alvo)
    m = float(np.max(np.abs(x)))
    if m > teto:
        x = x * (teto / m)
    return x


# ------------------------------------------------------------------ trilha ---


def construir_musica():
    """Lo-fi chiptune: progressao Am9 - Fmaj7 - Cmaj7 - G6, 84 BPM, vinyl crackle."""
    rng = random.Random(11)
    batida = 60.0 / BPM
    compasso = batida * 4
    total = int(DURACAO * SR) + SR
    out = np.zeros(total)

    # voz 1: baixo (seno com um pouco de 2o armonico)
    baixo = np.zeros(total)
    # voz 2: arpejo (triangular) -- voz principal
    arpejo = np.zeros(total)
    # voz 3: pad (triangular suave, sustentado)
    pad = np.zeros(total)
    # voz 4: sininho (acorde) nos tempos fortes
    sino = np.zeros(total)

    progressao = [
        (45, [57, 60, 64, 71], "Aminor"),   # Am9
        (41, [53, 57, 60, 64], "Fmai7"),    # Fmaj7
        (48, [55, 59, 64, 67], "Cmai7"),    # Cmaj7
        (43, [55, 59, 62, 64], "G6"),       # G6
    ]

    def colocar(buf, ini, valor):
        fim = min(len(buf), ini + len(valor))
        if fim > ini:
            buf[ini:fim] += valor[: fim - ini]

    # 2 compassos de cada acorde -> 8 compassos por volta
    for volta in range(3):
        for idx, (raiz, notas, _nome) in enumerate(progressao):
            compasso_idx = volta * 4 + idx
            t0 = compasso_idx * compasso
            if t0 > DURACAO + compasso:
                break

            # --- baixo: fundamental no tempo 1, quinta no 3, oitava no 4 e
            for pos, dur, grau in ((0.0, 0.55, 0), (2.0, 0.45, 7), (3.5, 0.40, 12)):
                ini = int((t0 + pos * batida) * SR)
                f = nota(raiz - 12 + grau, dur)
                v = onda_onda(f, dur, "seno")
                v += 0.18 * onda_onda(f * 2, dur, "seno")
                v *= envelope(len(v), 0.006, 0.35)
                colocar(baixo, ini, v * 0.55)

            # --- pad: acorde sustentado, entrada lenta
            dur_pad = compasso * 1.05
            p = np.zeros(int(dur_pad * SR))
            for n_midi in notas:
                f = nota(n_midi - 12, dur_pad)
                p += onda_onda(f, dur_pad, "tri") * 0.25
            p *= envelope(len(p), 0.35, 2.0, curva=1)
            colocar(pad, int(t0 * SR), p * 0.22)

            # --- arpejo: colcheias com swing,padrao fixo
            padrao = [0, 1, 2, 3, 2, 1, 2, 3]
            swing = 0.055
            for k in range(8):
                pos = k * 0.5 + (swing if k % 2 else 0.0)
                midi = notas[padrao[k] % len(notas)]
                if k % 4 == 3:
                    midi = notas[(k + 1) % len(notas)] + 12
                dur = 0.34
                f = nota(midi, dur)
                v = onda_onda(f, dur, "tri")
                v *= envelope(len(v), 0.004, 0.16)
                colocar(arpejo, int((t0 + pos * batida) * SR), v * 0.30)

            # --- sino nos tempos 1 e 3
            for pos in (0.0, 2.0):
                dur = 1.1
                midi = notas[0] + 12
                f = nota(midi, dur)
                v = onda_onda(f, dur, "seno") * 0.6 + onda_onda(f * 2.01, dur, "seno") * 0.25
                v *= envelope(len(v), 0.003, 0.30)
                colocar(sino, int((t0 + pos * batida) * SR), v * 0.20)

    # --- bateria
    percussao = np.zeros(total)
    for compasso_idx in range(int(DURACAO / compasso) + 2):
        t0 = compasso_idx * compasso
        # bumbo nos tempos 1 e 3+
        for pos, forte in ((0.0, 1.0), (2.0, 0.82), (3.5, 0.45)):
            ini = int((t0 + pos * batida) * SR)
            dur = 0.30
            t = np.arange(int(dur * SR)) / SR
            f = 92 - 40 * t / dur
            v = np.sin(2 * np.pi * np.cumsum(f) / SR)
            v *= envelope(len(v), 0.002, 0.09)
            colocar(percussao, ini, v * 0.42 * forte)
        # caixa nos tempos 2 e 4
        for pos in (1.0, 3.0):
            ini = int((t0 + pos * batida) * SR)
            dur = 0.20
            v = ruido(int(dur * SR), rng.randrange(1 << 30))
            v = passa_alta(v, 900)
            v *= envelope(len(v), 0.001, 0.055)
            colocar(percussao, ini, v * 0.11)
        # chimbal nas colcheias
        for k in range(8):
            pos = k * 0.5 + (0.055 if k % 2 else 0.0)
            ini = int((t0 + pos * batida) * SR)
            dur = 0.06
            v = ruido(int(dur * SR), rng.randrange(1 << 30))
            v = passa_alta(v, 5200)
            v *= envelope(len(v), 0.0008, 0.022)
            colocar(percussao, ini, v * 0.045)

    # --- vinil: chiado roseado + estalos esparsos
    n = total
    ruido_base = ruido(n, rng.randrange(1 << 30))
    # suaviza o ruido -> som grave de vinil
    chiado = passa_baixa(ruido_base, 1400) * 0.010
    estalos = np.zeros(n)
    for _ in range(180):
        pos = rng.randrange(0, n - 200)
        amp = rng.uniform(0.01, 0.07)
        dur = int(rng.uniform(20, 120))
        estalos[pos:pos + dur] += ruido(dur, rng.randrange(1 << 30)) * amp
    vinil = chiado + estalos * 0.35

    mix = baixo + arpejo + pad + sino + percussao + vinil
    mix = mix[: int(DURACAO * SR)]

    # cor: leve lowpass (cabeca de fita), saturacao macia e reverb curto
    mix = passa_baixa(mix, 5200)
    mix = distorcao(mix * 0.9, 1.6)
    seco = mix.copy()
    mix = mix + reverberacao(mix, 1.0, 3.2) * 0.22
    mix = distorcao(mix, 1.15)
    mix = normalizar_rms(mix, 0.16)

    # fade de entrada e saida
    fade_in = int(0.05 * SR)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)
    fade_out = int(1.4 * SR)
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)

    estereo = np.stack([mix, mix * 0.985 + 0.015 * np.roll(mix, 220)], axis=1)
    return estereo


# --------------------------------------------------------------------- sfx ---


def construir_sfx(nome):
    rng = random.Random(hash(nome) & 0xFFFF)
    if nome == "whoosh":
        n = int(0.55 * SR)
        t = np.arange(n) / SR
        v = ruido(n, rng.randrange(1 << 30))
        v = passa_alta(v, 500)
        v = passa_alta(passa_alta(v, 500), 500)
        corte = 700 + 5200 * (t / 0.55)
        # varredura de corte: aplica um lowpass que desce
        y = np.zeros(n)
        a = math.exp(-2 * math.pi * 3000 / SR)
        z = 0.0
        for i in range(n):
            a_i = math.exp(-2 * math.pi * corte[i] / SR)
            z = (1 - a_i) * v[i] + a_i * z
            y[i] = z
        y *= envelope(n, 0.02, 0.22)
        return normalizar_rms_limitado(y, 0.22) * np.exp(-t * 3.2)
    if nome == "blip":
        n = int(0.16 * SR)
        v = onda_onda(880, 0.16, "tri") * 0.7 + onda_onda(1320, 0.16, "seno") * 0.3
        v *= envelope(n, 0.002, 0.05)
        return normalizar_rms_limitado(v, 0.24)
    if nome == "click":
        n = int(0.07 * SR)
        v = ruido(n, rng.randrange(1 << 30)) * 0.6
        v += onda_onda(2200, 0.07, "seno") * 0.4
        v = passa_alta(v, 1200)
        v *= envelope(n, 0.0005, 0.012)
        return normalizar_rms_limitado(v, 0.22)
    if nome == "pop":
        n = int(0.22 * SR)
        v = onda_onda(660, 0.22, "seno") * 0.7 + onda_onda(990, 0.22, "seno") * 0.3
        v *= envelope(n, 0.002, 0.07)
        return normalizar_rms_limitado(v, 0.26)
    if nome == "riser":
        n = int(1.0 * SR)
        t = np.arange(n) / SR
        v = ruido(n, rng.randrange(1 << 30))
        y = np.zeros(n)
        a = 0.99
        z = 0.0
        for i in range(n):
            a_i = 0.995 - 0.010 * (i / n)
            z = (1 - a_i) * v[i] + a_i * z
            y[i] = z
        y *= (t / 1.0) ** 2
        y += 0.25 * onda_onda(220 + 520 * (t / 1.0), 1.0, "tri") * (t ** 2)
        y *= envelope(n, 0.3, 2.0)
        return normalizar_rms_limitado(y, 0.20)
    raise ValueError(nome)


# --------------------------------------------------------------- execucao ----


def rodar(cmd):
    print("  $", " ".join(cmd[:6]), "..." if len(cmd) > 6 else "")
    subprocess.run(cmd, check=True)


def gerar_narracao():
    """Chama o edge-tts para cada fala e guarda o WAV."""
    out = os.path.join(BUILD, "narracao")
    os.makedirs(out, exist_ok=True)
    falas = []
    for inicio, texto, nome in NARRACAO:
        mp3 = os.path.join(out, f"{nome}.mp3")
        wav = os.path.join(out, f"{nome}.wav")
        if not os.path.exists(mp3):
            rodar(["edge-tts", "--voice", VOZ, "--rate=+8%",
                   "--text", texto, "--write-media", mp3])
        if not os.path.exists(wav):
            rodar(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3,
                   "-ar", "44100", "-ac", "1", wav])
        with wave.open(wav) as w:
            dur = w.getnframes() / w.getframerate()
        falas.append({"inicio": inicio, "dur": dur, "texto": texto, "wav": wav})
        print(f"  fala {nome}: {dur:.2f}s @ {inicio:.2f}s")
    return falas


def main():
    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(SAIDA, exist_ok=True)
    os.makedirs(os.path.join(BUILD, "sfx"), exist_ok=True)

    print("1/4 trilha lo-fi")
    musica = construir_musica()
    musica_wav = os.path.join(BUILD, "musica.wav")
    salvar_wav(musica_wav, musica)

    print("2/4 efeitos")
    sfx_dir = os.path.join(BUILD, "sfx")
    for nome in sorted({n for _, n in SFX}):
        salvar_wav(os.path.join(sfx_dir, f"{nome}.wav"), construir_sfx(nome))

    print("3/4 narracao (edge-tts)")
    falas = gerar_narracao()

    print("4/4 mix")
    comum = (f"aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo"
             f",apad=whole_dur={DURACAO}")
    # A voz manda: a cama fica bem abaixo dela (padrao de mix de locucao).
    GANHO_MUSICA = "-16dB"
    GANHO_SFX = "-12dB"
    GANHO_VOZ = "+3dB"

    # cama: musica + efeitos posicionados
    entradas = ["-i", musica_wav]
    for _i, (inicio, nome) in enumerate(SFX):
        entradas += ["-i", os.path.join(sfx_dir, f"{nome}.wav")]
    filtros = [f"[0]volume={GANHO_MUSICA}[mus]"]
    for i, (inicio, nome) in enumerate(SFX):
        idx = i + 1
        atraso = int(round(inicio * 1000))
        filtros.append(f"[{idx}]adelay={atraso}:all=1,{comum},volume={GANHO_SFX}[s{idx}]")
    partes = "[mus]" + "".join(f"[s{i + 1}]" for i in range(len(SFX)))
    filtros.append(f"{partes}amix=inputs={len(SFX) + 1}:normalize=0,"
                   f"apad=whole_dur={DURACAO}[cama]")

    # vozes: falas posicionadas, com compressao de fala antes do ganho.
    # Os indices de input sao globais no grafo: 0 = musica, 1..N = efeitos, N+1.. = falas.
    entradas_voz = []
    for f in falas:
        entradas_voz += ["-i", f["wav"]]
    base_voz = 1 + len(SFX)
    filtros_voz = []
    for i, f in enumerate(falas):
        idx = base_voz + i
        atraso = int(round(f["inicio"] * 1000))
        filtros_voz.append(
            f"[{idx}]adelay={atraso}:all=1,{comum},"
            f"acompressor=threshold=-20dB:ratio=3:attack=5:release=150:makeup=2,"
            f"volume={GANHO_VOZ}[v{idx}]")
    partes_v = "".join(f"[v{base_voz + i}]" for i in range(len(falas)))
    filtros_voz.append(f"{partes_v}amix=inputs={len(falas)}:normalize=0,"
                       f"apad=whole_dur={DURACAO}[vozes]")

    # diagnostico: guarda as duas pernas do mix para conferir o balanco
    for nome_bus, rotulo, resto in (("[cama]", "cama", "[vozes]anullsink"),
                                     ("[vozes]", "vozes", "[cama]anullsink")):
        rodar(["ffmpeg", "-y", "-loglevel", "error", *entradas, *entradas_voz,
               "-filter_complex", ";".join(filtros + filtros_voz)
               + f";{nome_bus}apad=whole_dur={DURACAO}[b];{resto}",
               "-map", "[b]", "-ar", "44100", "-ac", "2",
               os.path.join(BUILD, f"bus-{rotulo}.wav")])
        d = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i",
                            os.path.join(BUILD, f"bus-{rotulo}.wav"), "-af", "volumedetect",
                            "-f", "null", "-"], capture_output=True, text=True).stderr
        rms = [l for l in d.splitlines() if "mean_volume" in l][0].split("] ")[1]
        pk = [l for l in d.splitlines() if "max_volume" in l][0].split("] ")[1]
        print(f"  bus {rotulo}: rms {rms}  pico {pk}")

    bruto_wav = os.path.join(BUILD, "bruto.wav")
    # a voz abaixa a cama (sidechain) e depois entra por cima
    grafo = ";".join(filtros + filtros_voz) + (
        ";[cama][vozes]sidechaincompress=threshold=0.05:ratio=6:attack=10:release=250"
        " [duvida];[duvida][vozes]amix=inputs=2:normalize=0,"
        f"apad=whole_dur={DURACAO}[bruto]")

    rodar(["ffmpeg", "-y", "-loglevel", "error", *entradas, *entradas_voz,
           "-filter_complex", grafo, "-map", "[bruto]",
           "-ar", "44100", "-ac", "2", bruto_wav])

    # loudnorm em duas passagens: mede o bruto e aplica a correcao linear.
    med = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", bruto_wav, "-af",
         "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    dados = json.loads(med[med.rfind("{"):med.rfind("}") + 1])
    print("  bruto:", {k: dados["input_" + k] for k in ("i", "tp", "lra", "thresh")})

    mestre_wav = os.path.join(BUILD, "mestre.wav")
    medir = (f"measured_I={dados['input_i']}:measured_TP={dados['input_tp']}"
             f":measured_LRA={dados['input_lra']}:measured_thresh={dados['input_thresh']}")
    rodar(["ffmpeg", "-y", "-loglevel", "error", "-i", bruto_wav, "-af",
           f"loudnorm=I=-16:TP=-1.5:LRA=11:{medir}:linear=true:print_format=summary",
           "-ar", "44100", "-ac", "2", mestre_wav])

    mestre_mp3 = os.path.join(SAIDA, "mestre.mp3")
    rodar(["ffmpeg", "-y", "-loglevel", "error", "-i", mestre_wav,
           "-c:a", "libmp3lame", "-b:a", "160k", mestre_mp3])

    with open(os.path.join(BUILD, "narracao.json"), "w") as w:
        json.dump(falas, w, indent=2, ensure_ascii=False)

    print("medindo o master entregue:")
    medir = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", mestre_mp3, "-af",
         "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    print(medir.stderr[medir.stderr.rfind("{"):])
    print("ok ->", mestre_mp3)


if __name__ == "__main__":
    main()
