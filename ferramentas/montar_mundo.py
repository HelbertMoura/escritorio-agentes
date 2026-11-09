"""Monta o mundo vivo: static/mundo/terra.png, brasil.png e mundo.json.

Entradas (arte/mundo): cidades.json e os contornos do Natural Earth em fontes/ (países 1:110m e as
27 UFs 1:50m). Tudo é desenhado aqui por código, numa paleta fixa: preenchimento de polígono por
varredura par-ímpar (pixel marcado pelo centro), relevo em faixas por distância à costa e a borda
de 1 pixel entre UFs. O mesmo dado gera sempre os mesmos PNG.

Uso: python ferramentas/montar_mundo.py [pasta de entrada] [pasta de saída]
"""
import hashlib
import json
import math
import os
import sys
from collections import deque

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ENTRADA = os.path.join(RAIZ, "arte", "mundo")
SAIDA = os.path.join(RAIZ, "static", "mundo")

CAIXA_BRASIL = (-74.0, -34.0, -34.0, 6.0)  # (lon_min, lat_min, lon_max, lat_max)
W_BRASIL, H_BRASIL = 400, 400
CAIXA_TERRA = (-180.0, -90.0, 180.0, 90.0)
W_TERRA, H_TERRA = 360, 180  # 1° por pixel
PALETA = {"mar": "#1d3b5c", "mar_raso": "#2a5a7c", "terra": "#5a8a3c", "terra_alta": "#7a9a4a",
          "serra": "#8a7a5a", "borda_uf": "#3e5e2a", "rio": "#3a7ab0",  # rio: sem uso até haver fonte de rios
          "vizinho": "#4a5a3e", "borda_pais": "#2e3a22"}  # só no brasil.png
UFS_SERRA = {"MG", "ES", "RJ", "SP", "PR", "SC", "RS"}
COSTA, INTERIOR = 3, 20  # faixas de relevo: 0–3, 4–20 e 21+ pixels da costa
NAO_CAPITAIS = {"mateus-leme"}
ROTA_MAX_KM, ROTAS_MAX = 1500, 40
ESTRANGEIRO = "--"  # rótulo da terra de outros países no mapa do Brasil
FRESTA_LONGE_DO_MAR = 4  # pixels: ver desenhar_brasil()
CIDADE_RAIO = 6  # pixels: até onde a cidade da costa pode ser puxada para a terra brasileira


def para_pixel(lat, lon, caixa, w, h):
    """Pixel (x, y) da coordenada na imagem w×h que cobre a caixa; fora da caixa, preso à borda."""
    lon0, lat0, lon1, lat1 = caixa
    x = math.floor((lon - lon0) / (lon1 - lon0) * w)
    y = math.floor((lat1 - lat) / (lat1 - lat0) * h)
    return min(max(x, 0), w - 1), min(max(y, 0), h - 1)


def preencher(poligono, w, h):
    """Pixels (x, y) cujo centro fica dentro do polígono (vértices em pixels), por varredura par-ímpar."""
    return preencher_aneis([poligono], w, h)


def preencher_aneis(aneis, w, h):
    """Como preencher(), mas com vários anéis de uma vez: a regra par-ímpar já abre os buracos."""
    cortes = {}  # linha -> x onde as arestas cruzam o centro da linha
    for anel in aneis:
        for k in range(len(anel)):
            (x1, y1), (x2, y2) = anel[k - 1], anel[k]
            if y1 == y2:
                continue
            if y1 > y2:
                x1, y1, x2, y2 = x2, y2, x1, y1
            # linhas j com y1 <= j + 0.5 < y2 (meio aberto, para o vértice não contar duas vezes)
            for j in range(max(0, math.ceil(y1 - 0.5)), min(h - 1, math.ceil(y2 - 0.5) - 1) + 1):
                cortes.setdefault(j, []).append(x1 + (j + 0.5 - y1) * (x2 - x1) / (y2 - y1))
    feitos = set()
    for j, xs in cortes.items():
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):  # x com a <= x + 0.5 < b
            for i in range(max(0, math.ceil(a - 0.5)), min(w - 1, math.ceil(b - 0.5) - 1) + 1):
                feitos.add((i, j))
    return feitos


def aneis_em_pixels(geometria, caixa, w, h):
    """Todos os anéis (externos e buracos) de um Polygon ou MultiPolygon, em coordenadas de pixel."""
    lon0, lat0, lon1, lat1 = caixa
    sx, sy = w / (lon1 - lon0), h / (lat1 - lat0)
    poligonos = geometria["coordinates"] if geometria["type"] == "MultiPolygon" else [geometria["coordinates"]]
    return [[((lon - lon0) * sx, (lat1 - lat) * sy) for lon, lat in anel] for poligono in poligonos for anel in poligono]


def distancias(dentro, w, h, rodar=False):
    """Para cada pixel de `dentro`, quantos passos (8 vizinhos) até o pixel mais perto fora dele.
    rodar=True liga a borda esquerda à direita (mapa-múndi)."""
    dist, fila = {}, deque()
    for y in range(h):
        for x in range(w):
            if (x, y) not in dentro:
                dist[(x, y)] = 0
                fila.append((x, y))
    while fila:
        x, y = fila.popleft()
        d = dist[(x, y)] + 1
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = (x + dx) % w if rodar else x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dist:
                    dist[(nx, ny)] = d
                    fila.append((nx, ny))
    return dist


def vizinhos4(x, y):
    return (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)


def vizinhos8(x, y):
    return [(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]


def relevo(dist_costa, uf=None):
    if dist_costa <= COSTA:
        return "terra"
    if dist_costa > INTERIOR and uf in UFS_SERRA:
        return "serra"
    return "terra_alta"


def pintar(w, h, cor_de):
    """Imagem em paleta (modo P): cor_de(x, y) devolve um nome da PALETA."""
    from PIL import Image  # só aqui: preencher() e para_pixel() funcionam sem o Pillow
    nomes = list(PALETA)
    im = Image.new("P", (w, h))
    im.putpalette([int(PALETA[n][i:i + 2], 16) for n in nomes for i in (1, 3, 5)])
    im.putdata([nomes.index(cor_de(x, y)) for y in range(h) for x in range(w)])
    return im


def desenhar(rotulo, w, h, rodar=False):
    """Mar raso perto da costa, relevo na terra, vizinhos numa cor só e borda de 1 pixel em volta de cada UF
    (borda_pais contra vizinho, borda_uf contra outra UF).
    rotulo: pixel -> UF, ESTRANGEIRO ou None (terra sem UF); pixel ausente é mar."""
    terra = set(rotulo)
    da_terra = distancias(terra, w, h, rodar)                   # na terra: passos até o mar
    do_mar = distancias(set(da_terra) - terra, w, h, rodar)     # no mar: passos até a terra

    def cor(x, y):
        if (x, y) not in terra:
            return "mar_raso" if do_mar[(x, y)] <= COSTA else "mar"
        uf = rotulo[(x, y)]
        if uf == ESTRANGEIRO:
            return "vizinho"
        if uf:
            outros = {rotulo[v] for v in vizinhos4(x, y) if v in terra} - {uf}
            if ESTRANGEIRO in outros:
                return "borda_pais"
            if outros:
                return "borda_uf"
        return relevo(da_terra[(x, y)], uf)
    return pintar(w, h, cor)


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def desenhar_terra(paises):
    rotulo = {}
    for p in paises:
        for px in preencher_aneis(aneis_em_pixels(p["geometry"], CAIXA_TERRA, W_TERRA, H_TERRA), W_TERRA, H_TERRA):
            rotulo[px] = None
    return desenhar(rotulo, W_TERRA, H_TERRA, rodar=True)


def desenhar_brasil(paises, estados):
    rotulo, brasil_110m = {}, set()
    for p in paises:
        pixels = preencher_aneis(aneis_em_pixels(p["geometry"], CAIXA_BRASIL, W_BRASIL, H_BRASIL), W_BRASIL, H_BRASIL)
        if p["properties"]["ADM0_A3"] == "BRA":  # o Brasil vem das UFs, no contorno 1:50m
            brasil_110m |= pixels
        else:
            rotulo.update(dict.fromkeys(pixels, ESTRANGEIRO))
    ate_o_mar = distancias(brasil_110m | set(rotulo), W_BRASIL, H_BRASIL)  # mar do 1:110m
    for e in sorted(estados, key=lambda e: e["properties"]["postal"]):
        uf = e["properties"]["postal"]
        for px in preencher_aneis(aneis_em_pixels(e["geometry"], CAIXA_BRASIL, W_BRASIL, H_BRASIL), W_BRASIL, H_BRASIL):
            rotulo[px] = uf
    # O 1:110m e o 1:50m não casam: sobra Brasil 110m fora das UFs. Longe do mar e ligada a um vizinho, é
    # fresta de fronteira e vira terra do vizinho; o resto (costa e canais da foz do Amazonas) fica água.
    fresta = {px for px in brasil_110m - set(rotulo) if ate_o_mar[px] > FRESTA_LONGE_DO_MAR}
    fila = deque(px for px in sorted(fresta) if any(rotulo.get(v) == ESTRANGEIRO for v in vizinhos8(*px)))
    rotulo.update(dict.fromkeys(fila, ESTRANGEIRO))
    while fila:
        for v in vizinhos8(*fila.popleft()):
            if v in fresta and v not in rotulo:
                rotulo[v] = ESTRANGEIRO
                fila.append(v)
    return desenhar(rotulo, W_BRASIL, H_BRASIL), rotulo


def na_terra(cidade, rotulo):
    """Pixel da cidade no brasil.png: o de para_pixel ou, se ele cair fora do Brasil (cidade da costa,
    de ilha ou de baía), o pixel de UF mais perto em distância euclidiana, até CIDADE_RAIO."""
    x, y = para_pixel(cidade["lat"], cidade["lon"], CAIXA_BRASIL, W_BRASIL, H_BRASIL)
    perto = sorted((dx * dx + dy * dy, dy, dx) for dy in range(-CIDADE_RAIO, CIDADE_RAIO + 1)
                   for dx in range(-CIDADE_RAIO, CIDADE_RAIO + 1)
                   if dx * dx + dy * dy <= CIDADE_RAIO ** 2 and rotulo.get((x + dx, y + dy)) not in (None, ESTRANGEIRO))
    if not perto:
        raise ValueError(f"cidade {cidade['id']}: nenhum pixel do Brasil a até {CIDADE_RAIO} px de ({x}, {y})")
    _, dy, dx = perto[0]
    return x + dx, y + dy


def km(a, b):
    """Distância em km pelo círculo máximo (haversine)."""
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    s = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(s))


def rotas(cidades):
    """Pares de capitais a menos de ROTA_MAX_KM, dos mais perto aos mais longe, até ROTAS_MAX."""
    capitais = [c for c in cidades if c["id"] not in NAO_CAPITAIS]
    pares = sorted((km(a, b), a["id"], b["id"]) for i, a in enumerate(capitais) for b in capitais[i + 1:])
    return [[a, b] for d, a, b in pares if d < ROTA_MAX_KM][:ROTAS_MAX]


def montar(fontes, saida):
    """Desenha terra.png e brasil.png em `saida` a partir de `fontes` (arte/mundo) e devolve o mundo.json."""
    cidades = ler(os.path.join(fontes, "cidades.json"))
    paises = ler(os.path.join(fontes, "fontes", "ne_110m_admin_0_countries.geojson"))["features"]
    estados = ler(os.path.join(fontes, "fontes", "ne_50m_admin_1_states_provinces_lakes.geojson"))["features"]
    terra, (brasil, rotulo) = desenhar_terra(paises), desenhar_brasil(paises, estados)

    mundo = {
        "cidades": [{"id": c["id"], "nome": c["nome"], "uf": c["uf"], "lat": c["lat"], "lon": c["lon"],
                     "x": x, "y": y, "marco": c["marco"]}
                    for c in cidades for x, y in [na_terra(c, rotulo)]],
        "rotas": rotas(cidades),
        "niveis": {"brasil": {"w": W_BRASIL, "h": H_BRASIL, "caixa": list(CAIXA_BRASIL)}},
    }
    # versão derivada do conteúdo (pixels e dados), para o navegador não guardar arquivo velho
    h = hashlib.sha256(terra.tobytes() + brasil.tobytes() + json.dumps(mundo, sort_keys=True).encode())
    mundo = {"versao": int(h.hexdigest()[:8], 16), **mundo}

    os.makedirs(saida, exist_ok=True)
    terra.save(os.path.join(saida, "terra.png"), optimize=True)
    brasil.save(os.path.join(saida, "brasil.png"), optimize=True)
    with open(os.path.join(saida, "mundo.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(mundo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return mundo


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else ENTRADA
    saida = sys.argv[2] if len(sys.argv) > 2 else SAIDA
    mundo = montar(entrada, saida)
    print(f"mundo: {len(mundo['cidades'])} cidades, {len(mundo['rotas'])} rotas, versão {mundo['versao']} -> {os.path.normpath(saida)}")


if __name__ == "__main__":
    main()
