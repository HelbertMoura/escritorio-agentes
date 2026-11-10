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
NEVOA = ("nevoa", "nevoa_2")   # a névoa em que a terra esmaece na borda, antes do mar de fora
NEVOA_ESCURA, NEVOA_FORA = 0.22, 0.42   # na borda: acima de 0 a névoa clara, depois a escura, depois o mar
ESTRADA = {"estrada", "estrada_sombra"}   # as rodovias (só na camada de perto)
LARGOS = {"Amazonas", "Paraná", "São Francisco"}   # rios de 2 px
# a camada de perto: os glifos miúdos entre os grandes saem com MIUDO da chance da camada; entre duas montanhas de uma
# serra, um morro de SOPE linhas (mais relevo, de perto)
MIUDO, SOPE = 0.4, (3, 5)

# as cores cheias (Brasil); cada uma ganha a versão apagada (vizinhos) e a da divisa de UF (mais escura; na Amazônia, o
# verde claro am_divisa, que lê sobre as copas escuras)
BASE = {
    "mar": "#1d3b5c", "mar_fundo": "#1a3452", "onda": "#26496d", "raso": "#2a5a7c", "raso_claro": "#3a7a99",
    "rio": "#56a2d2", "areia": "#dcc890", "fronteira": "#2a2217",
    "estrada": "#e2d2a4", "estrada_sombra": "#6e5f45", "nevoa": "#7c8c98", "nevoa_2": "#4a6680",
    # só a 4x (refinar): a ponte, e a lavoura e o pasto em volta das cidades
    "ponte": "#c4bcaa", "lavoura": "#cdb65c", "lavoura_verde": "#9cb24f", "pasto": "#b4cc72",
    "terra_arada": "#9a7048",
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
    # chaco (só nos vizinhos): mato seco oliva com quebrachos, palmeiras carandá e esteros
    "ch_chao": "#9a9152", "ch_chao2": "#a79d5c", "ch_seco": "#c2b26c", "ch_copa": "#5d6f33", "ch_luz": "#7f8f42",
    "ch_sombra": "#424f25", "ch_tronco": "#5e4429", "ch_palma": "#6f8a3c", "ch_estero": "#4e8790", "ch_estero_luz": "#8cc0c8",
    # serras: verdes, de rocha e com neve
    "mv_luz": "#b4c08e", "mv_sombra": "#6d7d5a", "mv_contorno": "#26331f",
    "mr_luz": "#dcc596", "mr_sombra": "#9a7c58", "mr_contorno": "#3f3022",
    "mn_luz": "#bdb5a6", "mn_sombra": "#746c62", "mn_contorno": "#332f2a", "mn_neve": "#f3f4ef", "mn_neve_sombra": "#c9d0ce",
}
AGUA_BASE = {"mar", "mar_fundo", "onda", "raso", "raso_claro", "rio", "pa_poca", "pa_poca_luz", "ch_estero", "ch_estero_luz",
             *NEVOA}
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
           "pampa": "pp_", "andes": "an_", "chaco": "ch_"}
assert len(CORES) <= 256, "a paleta do PNG tem no máximo 256 cores"


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
QUEBRACHO = [".llll.", "lcccss", ".ssss.", "..tt..", "..t..."]   # copa chata de guarda-chuva
CARANDA = ["p.l.p", ".plp.", "..t..", "..t..", "..t.."]            # a palmeira do chaco
ESTERO = [".mmmm.", "meEeem", ".meem."]                             # o banhado raso

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
    "chaco": {"papeis": {"l": "ch_luz", "c": "ch_copa", "s": "ch_sombra", "t": "ch_tronco", "p": "ch_palma", "k": "ch_seco",
                         "d": "ch_sombra", "m": "ch_sombra", "e": "ch_estero", "E": "ch_estero_luz"},
              "manchas": ("ch_chao", "ch_chao2", "ch_seco"),
              "camadas": [((5, 4), 0.45, [TUFO, CAPIM]), ((7, 6), 0.6, [QUEBRACHO, QUEBRACHO, CARANDA]),
                          ((19, 14), 0.45, [ESTERO])]},
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
                luz = d <= -(r // 3)
                if alto >= 10 and not mesa and r > alto * 0.4:   # as grandes (de perto): uma aresta clara na face da sombra
                    if d == r // 2 + 1 and r < alto - 1:          # e um sulco escuro na face da luz
                        luz = True
                    elif d == -(r * 2 // 3) and r > alto * 0.55:
                        luz = False
                s += ("N" if neve else "L") if luz else ("M" if neve else "S")
        linhas.append(s if r >= topo or not mesa else "." * (2 * alto - 1))
    return [l for l in linhas if l.strip(".")]


_DOBROS = {}


def _dobro(glifo):
    """O glifo no dobro por Scale2x (EPX): cada pixel vira 2x2 e a quina vira a cor dos dois vizinhos iguais dela. O
    desenho e as cores ficam os mesmos; as diagonais saem em degraus de 1 px, não de 2."""
    chave = tuple(glifo)
    if chave in _DOBROS:
        return _DOBROS[chave]
    alto, largo = len(glifo), len(glifo[0])
    em = lambda x, y: glifo[y][x] if 0 <= x < largo and 0 <= y < alto else "."
    linhas = []
    for y in range(alto):
        cima, baixo = "", ""
        for x in range(largo):
            p, a, b, c, d = em(x, y), em(x, y - 1), em(x + 1, y), em(x - 1, y), em(x, y + 1)
            cima += (a if c == a and c != d and a != b else p) + (b if a == b and a != c and b != d else p)
            baixo += (c if d == c and d != b and c != a else p) + (d if b == d and b != a and d != c else p)
        linhas += [cima, baixo]
    _DOBROS[chave] = linhas
    return linhas


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


def _biomas(terra, biomas, w, h, f=1):
    """O bioma de cada pixel de terra: o primeiro polígono que o contém ou, fora de todos, o mais perto (pela terra).
    f: a escala da imagem sobre o mapa de longe (as manchas grandes seguem o mapa de longe; o grão fica mais fino)."""
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
            sx = x + round((_ruido(x / f, y / f, 16, 21) - 0.5) * 22 * f) + int(_h(x, y, 23) * 5) - 2
            sy = y + round((_ruido(x / f, y / f, 16, 22) - 0.5) * 22 * f) + int(_h(x, y, 24) * 5) - 2
            if terra[y * w + x] and 0 <= sx < w and 0 <= sy < h and bioma[sy * w + sx] is not None:
                misto[y * w + x] = bioma[sy * w + sx]
    return misto


def linha(x0, y0, x1, y1):
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


def desenhar(rotulo, biomas, extras, serras, rios, w, h, escala=1, estradas=(), afluentes=(), paises=None):
    """O mapa em índices da paleta CORES. rotulo: (x, y) -> UF ou ESTRANGEIRO (ausente é mar); biomas: lista
    (nome, pixels) na ordem de precedência; extras: nome -> pixels ('araucarias', 'andes', 'chaco'); serras: lista de
    {tipo, linhas, picos, forma} em pixels; rios: lista (nome, linhas) em pixels; paises: (x, y) -> país do vizinho
    (para a divisa entre dois vizinhos), opcional.
    escala: 1 é o brasil.png (o mapa de longe); 2 é a camada de perto, o mesmo mapa no dobro da resolução: as manchas
    grandes (biomas, chão, mar fundo, borda) seguem o ruído do mapa de longe, e o detalhe (glifos, rios, serras,
    costa, divisas) sai na resolução nova, mais denso. Só ela leva as rodovias e os rios menores (afluentes)."""
    f = escala
    N = w * h
    estado = [0] * N   # 0 mar, 1 Brasil, 2 vizinho
    uf = [None] * N
    for (x, y), r in rotulo.items():
        if 0 <= x < w and 0 <= y < h:
            estado[y * w + x] = 2 if r == ESTRANGEIRO else 1
            uf[y * w + x] = r
    terra = [e > 0 for e in estado]
    fora_do_brasil = lambda nome: {p for p in extras.get(nome, ()) if rotulo.get(p) == ESTRANGEIRO}
    bioma = _biomas(terra, [("andes", fora_do_brasil("andes")), ("chaco", fora_do_brasil("chaco"))] + biomas, w, h, f)
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
            v = _ruido(x / f, y / f, 14, 3) * 0.7 + _ruido(x, y, 5, 4) * 0.3
            nome = c2 if v > 0.42 + 0.16 * _bayer(x, y) else c1
            if c3 and _h(x, y, 5) < 0.07:
                nome = c3
            por(i, nome)

    # 2. os glifos dos biomas, de cima para baixo (a copa de baixo cobre a de cima). De perto, a mesma grade nos mesmos
    # lugares (vezes f), com cada glifo no dobro, redesenhado por Scale2x (o mesmo desenho, de beira mais fina): a troca
    # de camada não pula. Entre eles, uma grade de glifos miúdos (os de longe, no tamanho deles, com MIUDO da chance):
    # o detalhe que só aparece de perto
    carimbos = []

    def semear(celula, chance, glifos, s, m, papeis, aqui, sementes=None):
        """Uma grade de glifos: célula `celula` em pixels de longe vezes m; sementes (x, y, chance, glifo) fixas."""
        cw, ch = celula
        sx, sy, sc, sg = sementes or (s, s + 7, s + 13, s + 17)
        for gy in range(-1, h // (ch * m) + 2):
            for gx in range(-1, w // (cw * m) + 2):
                ax, ay = (gx * cw + int(_h(gx, gy, sx) * cw)) * m, (gy * ch + int(_h(gx, gy, sy) * ch)) * m
                if not (0 <= ax < w and 0 <= ay < h) or not terra[ay * w + ax] or not aqui(ay * w + ax):
                    continue
                if _h(gx, gy, sc) > chance * (0.95 if estado[ay * w + ax] == 2 and sg is not None else 1):
                    continue
                g = glifos[int(_h(gx, gy, sg) * len(glifos))] if sg is not None else glifos[0]
                carimbos.append((ay, ax, g if m == 1 else _dobro(g), papeis))

    def do_bioma(nome):
        return lambda i: ("pampa" if arau[i] and bioma[i] in ("mata-atlantica", "pampa") else bioma[i]) == nome
    for nome, estilo in ESTILOS.items():
        for k, (celula, chance, glifos) in enumerate(estilo["camadas"]):
            s = len(nome) * 31 + k   # semente da camada
            semear(celula, chance, glifos, s, f, estilo["papeis"], do_bioma(nome))
            if f > 1:
                semear(celula, chance * MIUDO, glifos, s + 500, 1, estilo["papeis"], do_bioma(nome))
    celula, chance, glifos = ARAUCARIAS
    semear(celula, chance, glifos, 91, f, ESTILOS["pampa"]["papeis"], lambda i: arau[i], sementes=(91, 92, 93, None))
    for ay, ax, g, papeis in sorted(carimbos, key=lambda c: (c[0] + len(c[2]), c[1])):   # pelo pé do glifo
        for dy, fileira in enumerate(g):
            for dx, letra in enumerate(fileira):
                x, y = ax + dx - len(fileira) // 2, ay + dy
                if letra != "." and 0 <= x < w and 0 <= y < h and terra[y * w + x]:
                    por(y * w + x, papeis[letra])

    # 3. os rios, por cima da terra (os três largos com 2 px de longe; tudo na largura vezes a escala); de perto, os rios
    # menores em 1 px
    def tracar(linhas, largura, nome):
        for traco in linhas:
            for (x0, y0), (x1, y1) in zip(traco, traco[1:]):
                a, b = (int(x0), int(y0)), (int(x1), int(y1))
                deitado = abs(b[0] - a[0]) >= abs(b[1] - a[1])
                for x, y in linha(*a, *b):
                    for k in range(largura):
                        px, py = (x, y + k) if deitado else (x + k, y)
                        if 0 <= px < w and 0 <= py < h and terra[py * w + px]:
                            yield py * w + px
    for nome, linhas in afluentes:
        for i in tracar(linhas, 1, nome):
            por(i, "rio")
    for nome, linhas in rios:
        for i in tracar(linhas, (2 if " ".join(nome.split()) in LARGOS else 1) * f, nome):
            por(i, "rio")

    # 4. as rodovias (só de perto): 1 px claro com a sombra embaixo; passam por cima dos rios (a ponte)
    via = [False] * N
    for linhas in estradas:
        for i in tracar(linhas, 1, ""):
            via[i] = True
    for i in range(N):
        if via[i]:
            por(i, "estrada")
            if i + w < N and terra[i + w] and not via[i + w] and cor[i + w].split("_ap")[0] != "rio":
                por(i + w, "estrada_sombra")

    # 5. as serras: fileiras de montanhas, de cima para baixo. De perto, as mesmas montanhas nos mesmos lugares, na
    # altura vezes f (o glifo sai de novo na resolução nova, com a encosta mais fina), e um morro baixo entre duas delas
    montes = []
    for serra in serras:
        mesa = serra.get("forma") == "mesa"
        for k, fileira in enumerate(serra["linhas"]):
            grande = serra["tipo"] == "neve"
            for j, (x, y, ux, uy) in enumerate(_ao_longo(fileira, (4.0 if grande else 5.0) * f)):
                if grande:   # os Andes: picos de 4 a 8 linhas, uns fora da fila e outros faltando (nada de zíper)
                    if _h(j, k, 60) < 0.15:
                        continue
                    alto = 4 + int(_h(j, k, 61) ** 1.5 * 5)
                    lado, ao_longo = (_h(j, k, 63) - 0.5) * 7, (_h(j, k, 64) - 0.5) * 2.5
                else:
                    alto, lado, ao_longo = (6 if _h(j, k, 62) < 0.4 else 5), (1 if j % 2 else -1) * 1.5, 0
                lado, ao_longo = lado * f, ao_longo * f
                montes.append((x - uy * lado + ux * ao_longo, y + ux * lado + uy * ao_longo, montanha(alto * f, mesa), serra["tipo"]))
                if f > 1 and not mesa and _h(j, k, 65) < 0.7:   # o morro do sopé, do outro lado da fila, meio passo adiante
                    meio, m = (2.0 if grande else 2.5) * f, -lado * 0.6
                    alto = SOPE[0] + int(_h(j, k, 66) * (SOPE[1] - SOPE[0] + 1))
                    montes.append((x - uy * m + ux * meio, y + ux * m + uy * meio, montanha(alto), serra["tipo"]))
        for x, y in serra.get("picos", ()):
            montes.append((x, y, montanha(9 * f), serra["tipo"]))
    for x, y, g, tipo in sorted(montes, key=lambda m: (round(m[1]), round(m[0]))):
        luz, sombra, contorno, neve, neve_sombra = SERRA_CORES[tipo]
        papel = {"L": luz, "S": sombra, "o": contorno, "N": neve, "M": neve_sombra}
        x0, y0 = round(x) - len(g[0]) // 2, round(y) - len(g) + 1
        for dy, fileira in enumerate(g):
            for dx, c in enumerate(fileira):
                px, py = x0 + dx, y0 + dy
                if c != "." and 0 <= px < w and 0 <= py < h and terra[py * w + px]:
                    if tipo == "neve":   # os Andes com neve ficam em tons cheios: são o marco da borda oeste
                        cor[py * w + px] = papel[c]
                    else:
                        por(py * w + px, papel[c])

    # 6. a areia da costa (1 px) e 7. as divisas: a da UF, um tom mais escuro do chão; a do país, forte (f px); a entre
    # dois vizinhos, pontilhada no tom apagado
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
                perto = [(x + dx * k, y + dy * k) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) for k in range(1, f + 1)]
                if any(estado[vy * w + vx] == 2 for vx, vy in perto if 0 <= vx < w and 0 <= vy < h):
                    cor[i] = "fronteira"
                elif any(0 <= vx < w and 0 <= vy < h and estado[vy * w + vx] == 1 and uf[vy * w + vx] != uf[i]
                         for vx, vy in viz[0::2]) and cor[i] not in AGUA:
                    cor[i] = cor[i] + "~"
            elif paises and (x // f + y // f) % 2 == 0 and cor[i] not in AGUA:
                meu = paises.get((x, y))
                if meu and any(paises.get(v, meu) != meu for v in viz[0::2] if 0 <= v[0] < w and 0 <= v[1] < h
                               and estado[v[1] * w + v[0]] == 2):
                    cor[i] = "fronteira_ap"

    # 8. o mar: duas faixas rasas em pontilhado junto da costa, ondas no fundo e o alto-mar um pouco mais escuro
    do_mar = _distancia([not t for t in terra], w, h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if terra[i]:
                continue
            d, t = do_mar[i], _bayer(x, y)
            if d <= f or (d <= 2 * f and t < 0.5):
                cor[i] = "raso_claro"
            elif d <= 4 * f or (d <= 5 * f and t < 0.5) or (d <= 6 * f and t < 0.25):
                cor[i] = "raso"
            elif d > (24 + 8 * _ruido(x / f, y / f, 30, 8) + 4 * t) * f:
                cor[i] = "mar_fundo"
            else:
                cor[i] = "mar"
    onda = ONDA if f == 1 else _dobro(ONDA)   # de perto, as mesmas ondas nos mesmos lugares, redesenhadas no dobro
    for gy in range(h // (7 * f) + 1):
        for gx in range(w // (11 * f) + 1):
            ax, ay = (gx * 11 + int(_h(gx, gy, 71) * 11)) * f, (gy * 7 + int(_h(gx, gy, 72) * 7)) * f
            if _h(gx, gy, 73) > 0.6:
                continue
            for dy, fileira in enumerate(onda):
                for dx, c in enumerate(fileira):
                    px, py = ax + dx, ay + dy
                    if c != "." and 0 <= px < w and 0 <= py < h and not terra[py * w + px] and do_mar[py * w + px] > 7 * f:
                        cor[py * w + px] = "onda"

    # 9. a borda: o mapa some no mar de fora da imagem (FORA) a uma distância que ondula com o ruído; a terra esmaece em
    # névoa (dois tons, em manchinhas) antes do mar, e nunca encosta nele; a terra do Brasil numa faixa estreita (o
    # litoral do Nordeste e as cidades dele ficam longe da borda); os 2 px de fora são só mar, iguais ao que o navegador
    # pinta além da imagem
    for y in range(h):
        for x in range(w):
            i = y * w + x
            e = min(x, y, w - 1 - x, h - 1 - y)
            alcance = VINHETA * f * (0.6 + 1.0 * _ruido(x / f, y / f, 19, 31))
            if estado[i] == 1:
                alcance = min(alcance, 7 * f)
            sorte = 0.75 * _ruido(x / f, y / f, 6, 34) + 0.25 * _h(x, y, 33)   # em manchas de névoa, não em grão solto
            nevoa = ((alcance - e) / alcance) ** 0.7 - sorte if e < alcance else -1
            raso = cor[i] in ("raso", "raso_claro")   # o raso da costa fica (a costa nunca encosta no mar de fora)
            if e < 2 * f or (not terra[i] and not raso and nevoa > 0) or (terra[i] and nevoa > NEVOA_FORA):
                cor[i] = FORA
            elif terra[i] and nevoa > NEVOA_ESCURA:
                cor[i] = "nevoa_2"
            elif terra[i] and nevoa > 0:
                cor[i] = "nevoa"
    for y in range(h):   # terra colada no mar de fora vira névoa escura (nunca um recorte seco de terra)
        for x in range(w):
            i = y * w + x
            if cor[i] not in AGUA and any(0 <= x + a < w and 0 <= y + b < h and cor[(y + b) * w + x + a] == FORA
                                          for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                cor[i] = "nevoa_2"

    indice = {n: k for k, n in enumerate(CORES)}
    return [indice[n] for n in cor]


# --- o terceiro nível (4x) ----------------------------------------------------------------------------------------------
# O mapa de 4x sai do de 2x dobrado por Scale2x (as mesmas formas e cores: a troca de nível não pula) e ganha o detalhe que
# só cabe nessa escala, sempre na mesma paleta e com semente fixa na posição.
COPAS = {"am_copa": ("am_luz", "am_sombra"), "am_luz": ("am_brilho", "am_copa"), "ma_copa": ("ma_luz", "ma_sombra"),
         "ma_luz": ("ma_brilho", "ma_copa"), "ce_arvore": ("ce_arvore_luz", "ce_arvore_sombra"),
         "ch_copa": ("ch_luz", "ch_sombra"), "pp_arau": ("pp_arau_luz", "pp_arau"), "ca_cacto": ("ca_cacto_luz", "ca_cacto")}
SOMBRA_DA_COPA = {"am_": "am_sombra", "ma_": "ma_sombra", "ce_": "ce_arvore_sombra", "ch_": "ch_sombra", "pp_": "pp_arau"}
SERRA_SOMBRA = {"mv_sombra": "mv_contorno", "mr_sombra": "mr_contorno", "mn_sombra": "mn_contorno"}
LAVOURAS = ("lavoura", "lavoura_verde", "pasto", "terra_arada")
CAMPO = (7, 5)   # pixels de 4x: a quadra de lavoura, com 1 px de divisa de chão


def dobrar(indices, w, h):
    """A imagem em índices no dobro, por Scale2x (EPX), como _dobro faz com os glifos."""
    W, saida = 2 * w, [0] * (4 * w * h)
    for y in range(h):
        lin, cima, baixo = y * w, (y - 1) * w if y else y * w, (y + 1) * w if y < h - 1 else y * w
        for x in range(w):
            p, a, d = indices[lin + x], indices[cima + x], indices[baixo + x]
            c, b = indices[lin + x - 1] if x else p, indices[lin + x + 1] if x < w - 1 else p
            o = 2 * y * W + 2 * x
            saida[o] = a if c == a and c != d and a != b else p
            saida[o + 1] = b if a == b and a != c and b != d else p
            saida[o + W] = c if d == c and d != b and c != a else p
            saida[o + W + 1] = d if b == d and b != a and d != c else p
    return saida


def refinar(indices, w, h, focos=()):
    """O nível de 4x (2w x 2h) a partir do de 2x (indices, w x h): Scale2x e então, de cima para baixo,
    - as copas em tufos de luz e sombra, com a beira de baixo e da direita na sombra (cada árvore se lê sozinha);
    - a face de sombra das serras riscada e o sopé escurecido;
    - os rios com a margem escura, o canal mais fundo no meio e bancos de areia nos largos;
    - o grão do chão;
    - lavoura e pasto em quadras em volta de cada foco (x, y, raio) em pixels de 4x: as cidades;
    - a ponte onde a rodovia cruza o rio (a rodovia segue a de 2x dobrada: clara, com a sombra embaixo)."""
    W, H = 2 * w, 2 * h
    cor = dobrar(indices, w, h)
    nomes = list(CORES)
    ind = {n: k for k, n in enumerate(nomes)}
    ap = lambda k: "_ap" in nomes[k]
    escuro = [ind.get(n + "~", k) for k, n in enumerate(nomes)]       # o tom da divisa (só no Brasil)
    copa = {ind[n + s]: (ind[a + s], ind[b + s]) for n, (a, b) in COPAS.items() for s in ("", "_ap")}
    arvore = {ind[n] for n in CORES if n.split("_ap")[0] in {*COPAS, *(v for p in COPAS.values() for v in p)}}
    sombra_de = {k: ind[SOMBRA_DA_COPA[nomes[k][:3]] + ("_ap" if ap(k) else "")] for k in arvore if nomes[k][:3] in SOMBRA_DA_COPA}
    serra = {ind[n] for n in CORES if n[:3] in ("mv_", "mr_", "mn_")}
    risco = {ind[n + s]: ind[c + s] for n, c in SERRA_SOMBRA.items() for s in ("", "_ap")}
    agua = {ind[n] for n in AGUA}
    chao = {}
    for e in ESTILOS.values():
        c1, c2, c3 = e["manchas"]
        for s in ("", "_ap"):
            chao[ind[c1 + s]], chao[ind[c2 + s]] = ind[(c3 or c2) + s], ind[(c3 or c1) + s]
    rio, raso, areia = ind["rio"], ind["raso_claro"], ind["areia"]
    estrada = {ind["estrada"], ind["estrada_ap"]}
    via = estrada | {ind["estrada_sombra"], ind["estrada_sombra_ap"]}
    viz4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
    dentro = lambda x, y: 0 <= x < W and 0 <= y < H

    # 1. as copas: tufos de luz e sombra pelo ruído fino; a beira de baixo e da direita de cada copa na sombra
    antes = cor[:]
    for i, k in enumerate(antes):
        if k in copa:
            x, y = i % W, i // W
            v = _ruido(x, y, 3, 201)
            cor[i] = copa[k][0] if v > 0.68 else copa[k][1] if v < 0.3 else k
    for i, k in enumerate(antes):
        if k in sombra_de:
            x, y = i % W, i // W
            if (y + 1 < H and antes[i + W] not in arvore) or (x + 1 < W and antes[i + 1] not in arvore):
                cor[i] = sombra_de[k]
    # 2. as serras: a face de sombra riscada na diagonal; o chão logo abaixo da montanha, mais escuro
    for i, k in enumerate(antes):
        x, y = i % W, i // W
        if k in risco and (x - y) % 4 == 0 and _h(x, y, 203) < 0.6:
            cor[i] = risco[k]
        elif k not in serra and k not in agua and y >= 2 and (antes[i - W] in serra or antes[i - 2 * W] in serra):
            cor[i] = escuro[cor[i]]
    # 3. os rios: margem escura, o canal mais fundo no meio e, nos largos, bancos de areia
    for i, k in enumerate(antes):
        x, y = i % W, i // W
        if k == rio:
            perto = [antes[(y + b) * W + x + a] for a in range(-2, 3) for b in range(-2, 3) if dentro(x + a, y + b)]
            if len(perto) == 25 and all(p == rio for p in perto) and _ruido(x, y, 9, 207) > 0.74:
                cor[i] = areia
            elif all(p == rio for p in perto[6:9] + perto[11:14] + perto[16:19]) and _ruido(x, y, 6, 205) > 0.55:
                cor[i] = raso
        elif k not in agua and k not in via and k not in serra and \
                any(dentro(x + a, y + b) and antes[(y + b) * W + x + a] == rio for a, b in viz4):
            cor[i] = escuro[cor[i]]
    # 4. o grão do chão
    for i, k in enumerate(cor):
        if k in chao and _h(i % W, i // W, 209) < 0.05:
            cor[i] = chao[k]
    # 5. lavoura e pasto em quadras em volta das cidades (só no Brasil; no chão liso e, mais perto da cidade, também onde
    # havia mato: a clareira da lavoura)
    for fx, fy, raio in focos:
        for y in range(max(0, int(fy - raio)), min(H, int(fy + raio) + 1)):
            for x in range(max(0, int(fx - raio)), min(W, int(fx + raio) + 1)):
                i, d = y * W + x, ((x - fx) ** 2 + (y - fy) ** 2) ** 0.5 / raio
                # as quadras em fiadas desencontradas; a cerca entre duas só às vezes (quadras de tamanhos variados, não
                # um tabuleiro) e em manchas (umas regiões com mais lavoura que outras)
                cy = y // CAMPO[1]
                xq = x + (CAMPO[0] // 2) * (cy % 2)
                cx = xq // CAMPO[0]
                livre = cor[i] in chao or (d < 0.7 and antes[i] in arvore and cor[i] not in agua)
                cerca = (xq % CAMPO[0] == 0 and _h(cx, cy, 215) < 0.6) or (y % CAMPO[1] == 0 and _h(cx, cy, 216) < 0.6)
                if d >= 1 or not livre or ap(cor[i]) or cerca:
                    continue
                if _h(cx, cy, 211) < 0.8 * (1 - d) * (0.4 + _ruido(cx, cy, 3, 217)):
                    cor[i] = ind[LAVOURAS[int(_h(cx // 2, cy, 213) * len(LAVOURAS))]]
    # 6. a ponte onde a rodovia cruza o rio
    for i, k in enumerate(antes):
        if k in estrada:
            x, y = i % W, i // W
            if sum(dentro(x + a, y + b) and antes[(y + b) * W + x + a] == rio for a, b in viz4) >= 2:
                cor[i] = ind["ponte"]
    return cor
