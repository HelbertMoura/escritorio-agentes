"""O desenho do brasil.png: o mapa ilustrado em pixel art, a partir dos dados já em pixels (montar_mundo.py).

Camadas, de baixo para cima: o chão de cada bioma (dois tons em manchas, com a passagem entre biomas em pontilhado),
os glifos do bioma (copas, capim, cactos, poças, tufos, araucárias) empilhados de cima para baixo, os rios, as serras
(glifos de montanha com luz à esquerda e sombra à direita), a areia da costa, as divisas (a da UF um tom mais escuro do
chão, a do país forte), o mar (duas faixas rasas em pontilhado e ondas no fundo) e a vinheta na borda da caixa, que
some no mar de fora da imagem. Os vizinhos usam as mesmas cores, apagadas. Tudo sai de semente fixa na posição: o
mesmo dado dá sempre a mesma imagem. Água tem B > G e terra G >= B (o navegador separa as duas pela cor).
"""
from collections import deque

ESTRANGEIRO = "--"
BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
VINHETA = 18      # pixels: até onde, na média, a borda da caixa some no mar de fora (com ruído, nunca em linha reta)
FORA = "mar_fundo"  # o mar além da imagem (o navegador pinta essa cor e as ondas fora dela)
LARGOS = {"Amazonas", "Paraná", "São Francisco"}   # rios de 2 px

# as cores cheias (Brasil); cada uma ganha a versão apagada (vizinhos) e a da divisa de UF (mais escura; na Amazônia, o
# verde claro am_divisa, que lê sobre as copas escuras)
BASE = {
    "mar": "#1d3b5c", "mar_fundo": "#1a3452", "onda": "#26496d", "raso": "#2a5a7c", "raso_claro": "#3a7a99",
    "rio": "#56a2d2", "areia": "#dcc890", "fronteira": "#2a2217",
    # Amazônia: copas densas e escuras
    "am_chao": "#173d22", "am_chao2": "#1c4626", "am_sombra": "#22532b", "am_copa": "#2c6a32", "am_luz": "#41843a",
    "am_brilho": "#5f9e43", "am_divisa": "#93bd66",
    # Mata Atlântica: copas mais claras e recortadas
    "ma_chao": "#3b7a3c", "ma_chao2": "#468644", "ma_sombra": "#2e6836", "ma_copa": "#409046", "ma_luz": "#62ad55",
    "ma_brilho": "#8cc868",
    # Cerrado: capim amarelado e árvores tortas
    "ce_chao": "#a89f53", "ce_chao2": "#b5ab5c", "ce_capim": "#cdbf6b", "ce_seco": "#8e8743", "ce_arvore": "#5f7d37",
    "ce_arvore_luz": "#7d9a45", "ce_arvore_sombra": "#465f2b", "ce_tronco": "#6b4a2b",
    # Caatinga: chão seco alaranjado, mato e mandacarus
    "ca_chao": "#c28a4c", "ca_chao2": "#cd9757", "ca_claro": "#ddad6b", "ca_sombra": "#a3703e", "ca_mato": "#8a8b55",
    "ca_cacto": "#4b7639", "ca_cacto_luz": "#73a04a",
    # Pantanal: verde úmido com poças
    "pa_chao": "#5a9649", "pa_chao2": "#4e8842", "pa_capim": "#7db45b", "pa_margem": "#3d7238", "pa_poca": "#3f86ae",
    "pa_poca_luz": "#7cbadb",
    # Pampa: campo claro com tufos e as araucárias do planalto
    "pp_chao": "#93b85e", "pp_chao2": "#88ad56", "pp_tufo": "#b3d27b", "pp_tufo_sombra": "#6f9548", "pp_flor": "#e3d47c",
    "pp_arau": "#2a5532", "pp_arau_luz": "#3d7141", "pp_tronco": "#5d402b",
    # altiplano e puna (só nos vizinhos)
    "an_chao": "#a88c60", "an_chao2": "#b69b6c", "an_pedra": "#7c6446", "an_mato": "#7f8650", "an_sal": "#e2dccb",
    # serras: verdes, de rocha e com neve
    "mv_luz": "#b4c08e", "mv_sombra": "#6d7d5a", "mv_contorno": "#26331f",
    "mr_luz": "#dcc596", "mr_sombra": "#9a7c58", "mr_contorno": "#3f3022",
    "mn_luz": "#bdb5a6", "mn_sombra": "#746c62", "mn_contorno": "#332f2a", "mn_neve": "#f3f4ef", "mn_neve_sombra": "#c9d0ce",
}
AGUA_BASE = {"mar", "mar_fundo", "onda", "raso", "raso_claro", "rio", "pa_poca", "pa_poca_luz"}
CINZA = (112, 117, 106)   # para onde os vizinhos se apagam (G >= B: a terra continua terra)
APAGA, ESCURECE = 0.42, 0.74


def _rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _hex(c):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)


def _paleta():
    cores = dict(BASE)
    for n, h in BASE.items():
        c = _rgb(h)
        cores[n + "_ap"] = _hex([v * (1 - APAGA) + g * APAGA for v, g in zip(c, CINZA)])
        if n not in AGUA_BASE:
            cores[n + "~"] = BASE["am_divisa"] if n.startswith("am_") else _hex([v * ESCURECE for v in c])
    return cores


CORES = _paleta()   # nome -> '#rrggbb', na ordem dos índices do PNG
AGUA = {n for n in CORES if n.split("_ap")[0].rstrip("~") in AGUA_BASE}
PREFIXO = {"amazonia": "am_", "mata-atlantica": "ma_", "cerrado": "ce_", "caatinga": "ca_", "pantanal": "pa_",
           "pampa": "pp_", "andes": "an_"}


def cores_do_bioma(bioma):
    """As cores cheias (e a versão da divisa) do bioma, em '#rrggbb'."""
    p = PREFIXO[bioma]
    return {h for n, h in CORES.items() if n.startswith(p) and "_ap" not in n}


def cores_apagadas():
    return {h for n, h in CORES.items() if "_ap" in n}


# --- ruído e sementes -------------------------------------------------------------------------------------------------
def _h(x, y, s):
    """Número em [0, 1) fixo para (x, y, s)."""
    n = (x * 374761393 + y * 668265263 + s * 1442695041) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffffff) / 4294967296


def _ruido(x, y, passo, s):
    """Ruído de valor suave (manchas de `passo` pixels)."""
    fx, fy = x / passo, y / passo
    x0, y0 = int(fx), int(fy)
    ax, ay = fx - x0, fy - y0
    ax, ay = ax * ax * (3 - 2 * ax), ay * ay * (3 - 2 * ay)
    a, b = _h(x0, y0, s), _h(x0 + 1, y0, s)
    c, d = _h(x0, y0 + 1, s), _h(x0 + 1, y0 + 1, s)
    return (a + (b - a) * ax) + ((c + (d - c) * ax) - (a + (b - a) * ax)) * ay


def _bayer(x, y):
    return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16


# --- glifos: cada letra é um papel, trocado pela cor do bioma; "." é vazio ---------------------------------------------
COPA_G = [".bll.", "blccs", "lccss", ".css."]
COPA_M = [".bl.", "lccs", ".ss."]
COPA_GG = ["..bll..", ".bllcc.", "blcccss", "lcccsss", ".cssss."]
COPA_MATA = [".bl.", "lccs", "lcss", ".ss."]
COPA_MATA_P = [".l.", "lcs", ".s."]
ARVORE_CERRADO = [".ll..", "lccs.", ".sst.", "...t."]
ARVORE_CERRADO_2 = ["..ll.", ".lccs", "lcs..", ".t...", ".t..."]
TUFO = ["k.k", ".d."]
CAPIM = ["k.k.k"]
CACTO = ["..a..", "a.ab.", "a.a.b", ".aab.", "..ab.", "..a.."]
CACTO_P = [".a.", "aab", ".ab", ".a."]
MATO = ["mm", "s."]
POCA_G = [".mppm.", "mpLppm", ".mppm."]
POCA_M = ["mpLm", ".mm."]
ARAUCARIA = [".lllll.", "aaaaaaa", "..lll..", ".aaaaa.", "...t...", "...t..."]
PEDRA = [".p", "pp"]
ARBUSTO = [".m.", "mms"]
SALAR = [".ss..", "sssss", ".sss."]

# por bioma: as cores dos papéis e as camadas de glifos (célula da grade, chance, glifos)
ESTILOS = {
    "amazonia": {"papeis": {"b": "am_brilho", "l": "am_luz", "c": "am_copa", "s": "am_sombra"},
                 "manchas": ("am_chao", "am_chao2", None),
                 "camadas": [((4, 3), 0.97, [COPA_G, COPA_M, COPA_GG, COPA_G])]},
    "mata-atlantica": {"papeis": {"b": "ma_brilho", "l": "ma_luz", "c": "ma_copa", "s": "ma_sombra"},
                       "manchas": ("ma_chao", "ma_chao2", None),
                       "camadas": [((5, 4), 0.8, [COPA_MATA, COPA_MATA_P, COPA_M])]},
    "cerrado": {"papeis": {"l": "ce_arvore_luz", "c": "ce_arvore", "s": "ce_arvore_sombra", "t": "ce_tronco",
                           "k": "ce_capim", "d": "ce_seco"},
                "manchas": ("ce_chao", "ce_chao2", "ce_capim"),
                "camadas": [((5, 4), 0.55, [TUFO, CAPIM]), ((10, 8), 0.5, [ARVORE_CERRADO, ARVORE_CERRADO_2])]},
    "caatinga": {"papeis": {"a": "ca_cacto_luz", "b": "ca_cacto", "m": "ca_mato", "s": "ca_sombra"},
                 "manchas": ("ca_chao", "ca_chao2", "ca_claro"),
                 "camadas": [((5, 4), 0.5, [MATO]), ((11, 9), 0.6, [CACTO, CACTO_P])]},
    "pantanal": {"papeis": {"m": "pa_margem", "p": "pa_poca", "L": "pa_poca_luz", "k": "pa_capim", "d": "pa_margem"},
                 "manchas": ("pa_chao", "pa_chao2", "pa_capim"),
                 "camadas": [((5, 4), 0.45, [TUFO]), ((9, 7), 0.6, [POCA_G, POCA_M])]},
    "pampa": {"papeis": {"k": "pp_tufo", "d": "pp_tufo_sombra", "a": "pp_arau", "l": "pp_arau_luz", "t": "pp_tronco"},
              "manchas": ("pp_chao", "pp_chao2", "pp_flor"),
              "camadas": [((5, 4), 0.55, [TUFO, CAPIM])]},
    "andes": {"papeis": {"p": "an_pedra", "m": "an_mato", "s": "an_sal"}, "manchas": ("an_chao", "an_chao2", "an_pedra"),
              "camadas": [((5, 4), 0.55, [PEDRA, ARBUSTO, PEDRA]), ((23, 19), 0.35, [SALAR])]},
}
ARAUCARIAS = ((7, 6), 0.75, [ARAUCARIA])
ONDA = [".ww..", "w..ww"]
SERRA_CORES = {"verde": ("mv_luz", "mv_sombra", "mv_contorno", "mv_luz", "mv_sombra"),
               "rocha": ("mr_luz", "mr_sombra", "mr_contorno", "mr_luz", "mr_sombra"),
               "neve": ("mn_luz", "mn_sombra", "mn_contorno", "mn_neve", "mn_neve_sombra")}


def montanha(alto, mesa=False):
    """Glifo de montanha com `alto` linhas: contorno escuro em cima, luz à esquerda, sombra à direita e o cume com
    neve (N/M). Mesa: o topo chato da chapada."""
    meio, linhas = alto - 1, []
    topo = alto // 2 if mesa else 0
    for r in range(alto):
        a = max(r, topo)
        s = ""
        for c in range(2 * alto - 1):
            d = c - meio
            if abs(d) > a:
                s += "."
            elif (abs(d) == a or (mesa and r == topo and topo)) and r < alto - 1:
                s += "o"
            else:
                neve = r <= alto * 0.4 and not mesa
                s += ("N" if neve else "L") if d <= -(r // 3) else ("M" if neve else "S")
        linhas.append(s if r >= topo or not mesa else "." * (2 * alto - 1))
    return [l for l in linhas if l.strip(".")]


# --- o desenho ---------------------------------------------------------------------------------------------------------
def _distancia(dentro, w, h):
    """Para cada índice com dentro[i], passos (8 vizinhos) até o pixel mais perto fora; fora, 0."""
    dist, fila = [0] * (w * h), deque()
    for i in range(w * h):
        if not dentro[i]:
            fila.append(i)
    visto = [not d for d in dentro]
    while fila:
        i = fila.popleft()
        x, y = i % w, i // w
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not visto[ny * w + nx]:
                    visto[ny * w + nx] = True
                    dist[ny * w + nx] = dist[i] + 1
                    fila.append(ny * w + nx)
    return dist


def _biomas(terra, biomas, w, h):
    """O bioma de cada pixel de terra: o primeiro polígono que o contém ou, fora de todos, o mais perto (pela terra)."""
    bioma, fila = [None] * (w * h), deque()
    for nome, pixels in biomas:
        for x, y in sorted(pixels):
            i = y * w + x
            if 0 <= x < w and 0 <= y < h and terra[i] and bioma[i] is None:
                bioma[i] = nome
    fila.extend(i for i in range(w * h) if bioma[i] is not None)
    while fila:
        i = fila.popleft()
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and terra[ny * w + nx] and bioma[ny * w + nx] is None:
                bioma[ny * w + nx] = bioma[i]
                fila.append(ny * w + nx)
    # a passagem: cada pixel pega o bioma de um ponto deslocado por ruído suave (a divisa ondula, sem linha reta nem de
    # polígono) e por um sorteio fixo de ±2 px (o pontilhado, sem a faixa regular de uma matriz)
    misto = list(bioma)
    for y in range(h):
        for x in range(w):
            sx = x + round((_ruido(x, y, 16, 21) - 0.5) * 22) + int(_h(x, y, 23) * 5) - 2
            sy = y + round((_ruido(x, y, 16, 22) - 0.5) * 22) + int(_h(x, y, 24) * 5) - 2
            if terra[y * w + x] and 0 <= sx < w and 0 <= sy < h and bioma[sy * w + sx] is not None:
                misto[y * w + x] = bioma[sy * w + sx]
    return misto


def _linha(x0, y0, x1, y1):
    """Pixels de (x0, y0) a (x1, y1) (Bresenham)."""
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    erro, pontos = dx + dy, []
    while True:
        pontos.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return pontos
        e2 = 2 * erro
        if e2 >= dy:
            erro += dy
            x0 += sx
        if e2 <= dx:
            erro += dx
            y0 += sy


def _ao_longo(linha, passo):
    """Pontos a cada `passo` pixels sobre a polilinha (em pixels), com a direção do trecho."""
    pontos, sobra = [], 0.0
    for (x0, y0), (x1, y1) in zip(linha, linha[1:]):
        seg = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        if not seg:
            continue
        t = sobra
        while t <= seg:
            pontos.append((x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg, (x1 - x0) / seg, (y1 - y0) / seg))
            t += passo
        sobra = t - seg
    return pontos


def desenhar(rotulo, biomas, extras, serras, rios, w, h):
    """O brasil.png em índices da paleta CORES. rotulo: (x, y) -> UF ou ESTRANGEIRO (ausente é mar); biomas: lista
    (nome, pixels) na ordem de precedência; extras: nome -> pixels ('araucarias', 'andes'); serras: lista de
    {tipo, linhas, picos, forma} em pixels; rios: lista (nome, linhas) em pixels."""
    N = w * h
    estado = [0] * N   # 0 mar, 1 Brasil, 2 vizinho
    uf = [None] * N
    for (x, y), r in rotulo.items():
        if 0 <= x < w and 0 <= y < h:
            estado[y * w + x] = 2 if r == ESTRANGEIRO else 1
            uf[y * w + x] = r
    terra = [e > 0 for e in estado]
    andes = extras.get("andes", set())
    bioma = _biomas(terra, [("andes", {p for p in andes if rotulo.get(p) == ESTRANGEIRO})] + biomas, w, h)
    arau = [False] * N
    for x, y in extras.get("araucarias", ()):
        if 0 <= x < w and 0 <= y < h:
            arau[y * w + x] = True
    cor = ["mar"] * N

    def por(i, nome):   # a cor no pixel, apagada nos vizinhos
        cor[i] = nome + "_ap" if estado[i] == 2 else nome

    # 1. o chão: dois tons em manchas, com pontilhado entre eles, e uns pontos de um terceiro tom
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not terra[i]:
                continue
            b = "pampa" if arau[i] and bioma[i] in ("mata-atlantica", "pampa") else bioma[i]
            c1, c2, c3 = ESTILOS[b]["manchas"]
            v = _ruido(x, y, 14, 3) * 0.7 + _ruido(x, y, 5, 4) * 0.3
            nome = c2 if v > 0.42 + 0.16 * _bayer(x, y) else c1
            if c3 and _h(x, y, 5) < 0.07:
                nome = c3
            por(i, nome)

    # 2. os glifos dos biomas, de cima para baixo (a copa de baixo cobre a de cima)
    carimbos = []
    for nome, estilo in ESTILOS.items():
        for k, ((cw, ch), chance, glifos) in enumerate(estilo["camadas"]):
            s = len(nome) * 31 + k   # semente da camada
            for gy in range(-1, h // ch + 2):
                for gx in range(-1, w // cw + 2):
                    ax = gx * cw + int(_h(gx, gy, s) * cw)
                    ay = gy * ch + int(_h(gx, gy, s + 7) * ch)
                    if not (0 <= ax < w and 0 <= ay < h) or not terra[ay * w + ax]:
                        continue
                    i = ay * w + ax
                    b = bioma[i]
                    if arau[i] and b in ("mata-atlantica", "pampa"):
                        b = "pampa"
                    if b != nome:
                        continue
                    if _h(gx, gy, s + 13) > chance * (0.95 if estado[i] == 2 else 1):
                        continue
                    g = glifos[int(_h(gx, gy, s + 17) * len(glifos))]
                    carimbos.append((ay, ax, g, estilo["papeis"]))
    (cw, ch), chance, glifos = ARAUCARIAS
    for gy in range(-1, h // ch + 2):
        for gx in range(-1, w // cw + 2):
            ax, ay = gx * cw + int(_h(gx, gy, 91) * cw), gy * ch + int(_h(gx, gy, 92) * ch)
            if 0 <= ax < w and 0 <= ay < h and arau[ay * w + ax] and terra[ay * w + ax] and _h(gx, gy, 93) < chance:
                carimbos.append((ay, ax, glifos[0], ESTILOS["pampa"]["papeis"]))
    for ay, ax, g, papeis in sorted(carimbos, key=lambda c: (c[0] + len(c[2]), c[1])):   # pelo pé do glifo
        for dy, linha in enumerate(g):
            for dx, letra in enumerate(linha):
                x, y = ax + dx - len(linha) // 2, ay + dy
                if letra != "." and 0 <= x < w and 0 <= y < h and terra[y * w + x]:
                    por(y * w + x, papeis[letra])

    # 3. os rios, por cima da terra (2 px nos três largos)
    for nome, linhas in rios:
        largo = " ".join(nome.split()) in LARGOS
        for linha in linhas:
            for (x0, y0), (x1, y1) in zip(linha, linha[1:]):
                a, b = (int(x0), int(y0)), (int(x1), int(y1))
                deitado = abs(b[0] - a[0]) >= abs(b[1] - a[1])
                for x, y in _linha(*a, *b):
                    for px, py in ((x, y), (x, y + 1) if deitado else (x + 1, y))[: 2 if largo else 1]:
                        if 0 <= px < w and 0 <= py < h and terra[py * w + px]:
                            por(py * w + px, "rio")

    # 4. as serras: fileiras de montanhas, de cima para baixo
    montes = []
    for serra in serras:
        mesa = serra.get("forma") == "mesa"
        for k, linha in enumerate(serra["linhas"]):
            grande = serra["tipo"] == "neve"
            for j, (x, y, ux, uy) in enumerate(_ao_longo(linha, 4.0 if grande else 5.0)):
                if grande:   # os Andes: picos de 4 a 8 linhas, uns fora da fila e outros faltando (nada de zíper)
                    if _h(j, k, 60) < 0.15:
                        continue
                    alto = 4 + int(_h(j, k, 61) ** 1.5 * 5)
                    lado, ao_longo = (_h(j, k, 63) - 0.5) * 7, (_h(j, k, 64) - 0.5) * 2.5
                else:
                    alto, lado, ao_longo = (6 if _h(j, k, 62) < 0.4 else 5), (1 if j % 2 else -1) * 1.5, 0
                montes.append((x - uy * lado + ux * ao_longo, y + ux * lado + uy * ao_longo, montanha(alto, mesa), serra["tipo"]))
        for x, y in serra.get("picos", ()):
            montes.append((x, y, montanha(9), serra["tipo"]))
    for x, y, g, tipo in sorted(montes, key=lambda m: (round(m[1]), round(m[0]))):
        luz, sombra, contorno, neve, neve_sombra = SERRA_CORES[tipo]
        papel = {"L": luz, "S": sombra, "o": contorno, "N": neve, "M": neve_sombra}
        x0, y0 = round(x) - len(g[0]) // 2, round(y) - len(g) + 1
        for dy, linha in enumerate(g):
            for dx, c in enumerate(linha):
                px, py = x0 + dx, y0 + dy
                if c != "." and 0 <= px < w and 0 <= py < h and terra[py * w + px]:
                    if tipo == "neve":   # os Andes com neve ficam em tons cheios: são o marco da borda oeste
                        cor[py * w + px] = papel[c]
                    else:
                        por(py * w + px, papel[c])

    # 5. a areia da costa (1 px) e 6. as divisas: a da UF, um tom mais escuro do chão; a do país, forte
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not terra[i]:
                continue
            viz = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            if any(0 <= vx < w and 0 <= vy < h and not terra[vy * w + vx] for vx, vy in viz):
                if cor[i].split("_ap")[0] != "rio":
                    por(i, "areia")
                continue
            if estado[i] == 1:
                if any(estado[vy * w + vx] == 2 for vx, vy in viz if 0 <= vx < w and 0 <= vy < h):
                    cor[i] = "fronteira"
                elif any(0 <= vx < w and 0 <= vy < h and estado[vy * w + vx] == 1 and uf[vy * w + vx] != uf[i]
                         for vx, vy in viz[0::2]) and cor[i] not in AGUA:
                    cor[i] = cor[i] + "~"

    # 7. o mar: duas faixas rasas em pontilhado junto da costa, ondas no fundo e o alto-mar um pouco mais escuro
    do_mar = _distancia([not t for t in terra], w, h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if terra[i]:
                continue
            d, t = do_mar[i], _bayer(x, y)
            if d <= 1 or (d == 2 and t < 0.5):
                cor[i] = "raso_claro"
            elif d <= 4 or (d == 5 and t < 0.5) or (d == 6 and t < 0.25):
                cor[i] = "raso"
            elif d > 24 + 8 * _ruido(x, y, 30, 8) + 4 * t:
                cor[i] = "mar_fundo"
            else:
                cor[i] = "mar"
    for gy in range(h // 7 + 1):
        for gx in range(w // 11 + 1):
            ax, ay = gx * 11 + int(_h(gx, gy, 71) * 11), gy * 7 + int(_h(gx, gy, 72) * 7)
            if _h(gx, gy, 73) > 0.6:
                continue
            for dy, linha in enumerate(ONDA):
                for dx, c in enumerate(linha):
                    px, py = ax + dx, ay + dy
                    if c != "." and 0 <= px < w and 0 <= py < h and not terra[py * w + px] and do_mar[py * w + px] > 7:
                        cor[py * w + px] = "onda"

    # 8. a borda: o mapa some no mar de fora da imagem (FORA) a uma distância que ondula com o ruído, em pontilhado de
    # manchinhas; a terra do Brasil numa faixa estreita (o litoral do Nordeste e as cidades dele ficam a 8 px ou mais da
    # borda); os 2 px de fora são só mar, iguais ao que o navegador pinta além da imagem
    for y in range(h):
        for x in range(w):
            e = min(x, y, w - 1 - x, h - 1 - y)
            alcance = VINHETA * (0.6 + 1.0 * _ruido(x, y, 19, 31))
            if estado[y * w + x] == 1:
                alcance = min(alcance, 7)
            sorte = 0.6 * _ruido(x, y, 4, 34) + 0.4 * _h(x, y, 33)   # o pontilhado em manchinhas, não em grão solto
            if e < 2 or (e < alcance and sorte < ((alcance - e) / alcance) ** 0.7):
                cor[y * w + x] = FORA

    indice = {n: k for k, n in enumerate(CORES)}
    return [indice[n] for n in cor]
