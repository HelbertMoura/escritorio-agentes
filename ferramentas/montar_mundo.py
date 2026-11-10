"""Monta o mundo vivo: static/mundo/terra.png, brasil.png, mundo.json e o atlas da arte do PixelLab.

Entradas (arte/mundo): cidades.json, biomas.json, serras.json, planeta.json e os contornos e rios do Natural Earth em
fontes/ (países 1:110m, as 27 UFs e os rios 1:50m). Aqui os dados viram pixels: preenchimento de polígono por varredura
par-ímpar (pixel marcado pelo centro), a costa alisada e as linhas das serras e dos rios na escala da imagem. O desenho
do brasil.png (o mapa ilustrado) fica em mundo_terreno.py; o do terra.png (o globo, com os biomas do mundo), em
mundo_planeta.py. O mesmo dado gera sempre os mesmos PNG.

Uso: python ferramentas/montar_mundo.py [pasta de entrada] [pasta de saída]
"""
import hashlib
import json
import math
import os
import sys
from collections import Counter, deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mundo_planeta  # noqa: E402  (o desenho do globo; sem Pillow)
import mundo_terreno  # noqa: E402  (o desenho do mapa; sem Pillow)

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ENTRADA = os.path.join(RAIZ, "arte", "mundo")
SAIDA = os.path.join(RAIZ, "static", "mundo")

CAIXA_BRASIL = (-74.0, -34.0, -34.0, 6.0)  # (lon_min, lat_min, lon_max, lat_max)
W_BRASIL, H_BRASIL = 400, 400
CAIXA_TERRA = (-180.0, -90.0, 180.0, 90.0)
W_TERRA, H_TERRA = 720, 360  # 0,5° por pixel
PALETA = mundo_planeta.PALETA  # terra.png
NAO_CAPITAIS = {"mateus-leme"}
ROTA_MAX_KM, ROTAS_MAX = 1500, 40
ESTRANGEIRO = mundo_terreno.ESTRANGEIRO  # rótulo da terra de outros países no mapa do Brasil
FRESTA_LONGE_DO_MAR = 4  # pixels: ver desenhar_brasil()
CIDADE_RAIO = 6  # pixels: até onde a cidade da costa pode ser puxada para a terra brasileira
RIOS = "ne_50m_rivers_lake_centerlines.geojson"


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


def distancias(dentro, w, h):
    """Para cada pixel de `dentro`, quantos passos (8 vizinhos) até o pixel mais perto fora dele."""
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
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dist:
                    dist[(nx, ny)] = d
                    fila.append((nx, ny))
    return dist


def vizinhos4(x, y):
    return (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)


def vizinhos8(x, y):
    return [(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]


def pintar(w, h, cor_de):
    """Imagem em paleta (modo P): cor_de(x, y) devolve um nome da PALETA."""
    from PIL import Image  # só aqui: preencher() e para_pixel() funcionam sem o Pillow
    nomes = list(PALETA)
    im = Image.new("P", (w, h))
    im.putpalette([int(PALETA[n][i:i + 2], 16) for n in nomes for i in (1, 3, 5)])
    im.putdata([nomes.index(cor_de(x, y)) for y in range(h) for x in range(w)])
    return im


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def desenhar_terra(paises, fontes, celulas_brasil):
    """O terra.png (mundo_planeta.desenhar): a terra dos países menos os lagos, os biomas do Brasil (biomas.json; o
    altiplano só fora das células do Brasil) e os do planeta.json, passados para os pixels de 0,5°."""
    terra = set()
    for p in paises:
        terra |= preencher_aneis(aneis_em_pixels(p["geometry"], CAIXA_TERRA, W_TERRA, H_TERRA), W_TERRA, H_TERRA)
    sx, sy = W_TERRA / 360, H_TERRA / 180
    em_px = lambda lon, lat: ((lon + 180) * sx, (90 - lat) * sy)
    poligono = lambda pontos: preencher([em_px(*p) for p in pontos], W_TERRA, H_TERRA)
    planeta = ler(os.path.join(fontes, "planeta.json"))
    for lago in planeta["lagos"]:   # os grandes lagos, que os contornos dos países cobrem
        terra -= poligono(lago["poligono"])
    do_brasil = {(int((CAIXA_BRASIL[0] + 180) * sx) + i, int((90 - CAIXA_BRASIL[3]) * sy) + j)
                 for j, linha in enumerate(celulas_brasil) for i, c in enumerate(linha) if c == "1"}
    biomas = ler(os.path.join(fontes, "biomas.json"))
    brasil = [(mundo_planeta.DO_BRASIL["andes"], poligono(biomas["extras"]["andes"]["poligono"]) - do_brasil),
              (mundo_planeta.DO_BRASIL["araucarias"], poligono(biomas["extras"]["araucarias"]["poligono"]))]
    brasil += [(mundo_planeta.DO_BRASIL[b["id"]], poligono(b["poligono"])) for b in biomas["biomas"]]
    mundo = [(b["classe"], poligono(b["poligono"])) for b in planeta["biomas"]]
    serras = [{"tipo": s["tipo"], "largura": s["largura"] * sx, "linha": [em_px(*p) for p in s["linha"]]}
              for s in planeta["serras"]]
    lista = [(x, y) in terra for y in range(H_TERRA) for x in range(W_TERRA)]
    nomes = mundo_planeta.desenhar(lista, brasil, mundo, serras, W_TERRA, H_TERRA)
    return pintar(W_TERRA, H_TERRA, lambda x, y: nomes[y * W_TERRA + x])


def rotular_brasil(paises, estados):
    """O rótulo de cada pixel de terra do brasil.png: a UF (contorno 1:50m) ou ESTRANGEIRO; pixel ausente é água."""
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
    return alisar_costa(rotulo, W_BRASIL, H_BRASIL)


def alisar_costa(rotulo, w, h, vezes=2):
    """Tira os dentes da costa: pixel de terra com um vizinho de terra ou menos (dos 4) vira água, e pixel de água
    cercado de terra em 3 lados vira terra, com o rótulo mais comum em volta."""
    for _ in range(vezes):
        tirar, por = [], {}
        for y in range(h):
            for x in range(w):
                viz = [rotulo[v] for v in vizinhos4(x, y) if v in rotulo]
                if (x, y) in rotulo and len(viz) <= 1:
                    tirar.append((x, y))
                elif (x, y) not in rotulo and len(viz) >= 3 and 0 < x < w - 1 and 0 < y < h - 1:
                    por[(x, y)] = sorted(Counter(viz).items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        for px in tirar:
            del rotulo[px]
        rotulo.update(por)
    return rotulo


def em_pixels(lon, lat):
    """(lon, lat) em pixels (fracionários) do brasil.png."""
    lon0, lat0, lon1, lat1 = CAIXA_BRASIL
    return (lon - lon0) * W_BRASIL / (lon1 - lon0), (lat1 - lat) * H_BRASIL / (lat1 - lat0)


def desenhar_brasil(rotulo, fontes):
    """O mapa ilustrado (mundo_terreno.desenhar), com biomas, serras e rios passados para pixels."""
    from PIL import Image
    poligono = lambda pontos: preencher([em_pixels(*p) for p in pontos], W_BRASIL, H_BRASIL)
    dados = ler(os.path.join(fontes, "biomas.json"))
    biomas = [(b["id"], poligono(b["poligono"])) for b in dados["biomas"]]
    extras = {nome: poligono(e["poligono"]) for nome, e in dados["extras"].items()}
    serras = [{"tipo": s["tipo"], "forma": s.get("forma"), "linhas": [[em_pixels(*p) for p in l] for l in s["linhas"]],
               "picos": [em_pixels(*p["ponto"]) for p in s.get("picos", [])]}
              for s in ler(os.path.join(fontes, "serras.json"))]
    rios = [(r["properties"]["name"], [[em_pixels(*p) for p in l] for l in r["geometry"]["coordinates"]])
            for r in ler(os.path.join(fontes, "fontes", RIOS))["features"]]
    indices = mundo_terreno.desenhar(rotulo, biomas, extras, serras, rios, W_BRASIL, H_BRASIL)
    im = Image.new("P", (W_BRASIL, H_BRASIL))
    im.putpalette([int(c[i:i + 2], 16) for c in mundo_terreno.CORES.values() for i in (1, 3, 5)])
    im.putdata(indices)
    return im


def celulas(rotulo):
    """As células de 0,5° do Brasil, para o globo: 80 linhas (de lat 6 para baixo) de 80 '0'/'1' (de lon −74 para a
    direita). A célula é do Brasil se 4 das 9 amostras (1, 2 e 3 px dentro do bloco de 5x5) forem de UF."""
    uf = lambda x, y: rotulo.get((x, y)) not in (None, ESTRANGEIRO)
    return ["".join("1" if sum(uf(i * 5 + a, j * 5 + b) for a in (1, 2, 3) for b in (1, 2, 3)) >= 4 else "0"
                    for i in range(80)) for j in range(80)]


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
    rotulo = rotular_brasil(paises, estados)
    terra, brasil = desenhar_terra(paises, fontes, celulas(rotulo)), desenhar_brasil(rotulo, fontes)

    mundo = {
        "cidades": [{"id": c["id"], "nome": c["nome"], "uf": c["uf"], "lat": c["lat"], "lon": c["lon"],
                     "x": x, "y": y, "marco": c["marco"]}
                    for c in cidades for x, y in [na_terra(c, rotulo)]],
        "rotas": rotas(cidades),
        "niveis": {"brasil": {"w": W_BRASIL, "h": H_BRASIL, "caixa": list(CAIXA_BRASIL), "celulas": celulas(rotulo)}},
    }
    # versão derivada do conteúdo (pixels, cores e dados), para o navegador não guardar arquivo velho;
    # tobytes() de imagem em modo P só traz os índices, então a paleta entra à parte
    h = hashlib.sha256(terra.tobytes() + brasil.tobytes()
                       + json.dumps([PALETA, mundo_terreno.CORES, mundo], sort_keys=True).encode())
    mundo = {"versao": int(h.hexdigest()[:8], 16), **mundo}

    os.makedirs(saida, exist_ok=True)
    terra.save(os.path.join(saida, "terra.png"), optimize=True)
    brasil.save(os.path.join(saida, "brasil.png"), optimize=True)
    with open(os.path.join(saida, "mundo.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(mundo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return mundo


ARTE = os.path.join(RAIZ, "arte", "pixellab", "mundo")   # a arte do PixelLab (marcos e peças genéricas)
# as peças que toda cidade pode usar: prédios, chalés, árvores, carros, aviões, a praça e o mobiliário da rua
GENERICOS = ([f"predios-{i}" for i in range(1, 7)] + [f"chale-{i}" for i in range(1, 9)] + ["arvore-1", "arvore-2", "arvore-3"]
             + ["carro-1", "carro-2", "carro-3", "carro-4", "aviao-1", "aviao-2"]
             + ["praca-1", "banca-1", "ponto-onibus-1", "carrinho-1", "banco-poste-1"])
# as peças das festas, ao lado da fonte da praça: entram quando a arte existe (sem ela, a festa fica só nos enfeites)
OPCIONAIS = ["festa-arvore-natal", "festa-fogueira", "festa-barraca-junina", "festa-abobora", "festa-ovo-pascoa",
             "festa-carro-alegorico", "festa-palco-anonovo"]
# desenhadas pelo PixelLab grandes demais para a cidade: entram no atlas na metade (o navegador desenha 1:1)
METADE = {"carro-1", "carro-2", "carro-3", "carro-4", "banca-1", "ponto-onibus-1", "carrinho-1", "banco-poste-1",
          *OPCIONAIS}
ATLAS_LARGURA = 512
MINI_MARCO, MINI_AVIAO = 32, 20   # pixels: o lado maior da miniatura do mapa, antes do contorno de 1 px
MINI_CONTORNO = (28, 22, 18, 255)


def metade(im):
    """A peça na metade, sem borrão nem borda translúcida: cada bloco 2x2 vira um pixel com a média das cores opacas
    (pela pré-multiplicação do alfa), opaco se a maior parte do bloco era opaca. Recortada de novo pelo alfa."""
    from PIL import Image
    w, h = im.size
    par = Image.new("RGBA", (w + w % 2, h + h % 2))
    par.paste(im, (0, 0))
    menor = par.convert("RGBa").reduce(2).convert("RGBA")
    menor.putalpha(menor.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    return menor.crop(menor.getchannel("A").getbbox())


def mini(im, lado):
    """A miniatura do mapa do Brasil: a peça reduzida até `lado` px no lado maior, com contorno escuro de 1 px (para
    ler sobre qualquer terreno). Cada bloco vira a cor real do bloco mais perto da média das cores opacas (sem borrão e
    sem cor nova), opaco se a maior parte do bloco era opaca; o alfa fica binário."""
    from PIL import Image
    w, h = im.size
    f = max(w, h) / lado
    nw, nh = max(1, round(w / f)), max(1, round(h / f))
    px, out = im.load(), Image.new("RGBA", (nw + 2, nh + 2))
    o = out.load()
    for j in range(nh):
        for i in range(nw):
            x0, y0 = i * w // nw, j * h // nh
            x1, y1 = max(x0 + 1, (i + 1) * w // nw), max(y0 + 1, (j + 1) * h // nh)
            bloco = [px[x, y] for y in range(y0, y1) for x in range(x0, x1)]
            opacos = [c for c in bloco if c[3] >= 128]
            if len(opacos) * 2 < len(bloco):
                continue
            m = [sum(c[k] for c in opacos) / len(opacos) for k in range(3)]
            o[i + 1, j + 1] = min(opacos, key=lambda c: (sum((c[k] - m[k]) ** 2 for k in range(3)), c))[:3] + (255,)
    borda = [(x, y) for y in range(nh + 2) for x in range(nw + 2) if not o[x, y][3]
             and any(0 <= x + dx < nw + 2 and 0 <= y + dy < nh + 2 and o[x + dx, y + dy][3] == 255
                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for p in borda:
        o[p] = MINI_CONTORNO
    return out


def montar_atlas(arte, cidades, saida):
    """atlas.png e atlas.json em `saida` com a arte do PixelLab (`arte`): os marcos das cidades e as peças genéricas.
    Cada peça vai recortada pela caixa do alfa (o código ancora pelo pé do recorte), as de METADE já reduzidas, e é
    empilhada em prateleiras, da mais alta para a mais baixa. Marco ou peça OPCIONAL sem arte fica de fora (a cidade
    usa os prédios genéricos, a festa fica nos enfeites desenhados por código); peça genérica sem arte é erro. Cada
    marco e os dois aviões ganham também a miniatura do mapa do Brasil (mini-<nome>, ver mini())."""
    from PIL import Image
    pecas = {}

    def abrir(nome):
        im = Image.open(os.path.join(arte, nome + ".png")).convert("RGBA")
        im = im.crop(im.getchannel("A").getbbox())
        return metade(im) if nome in METADE else im
    for nome in GENERICOS:
        if not os.path.exists(os.path.join(arte, nome + ".png")):
            raise FileNotFoundError(f"atlas: falta a arte {nome}.png em {arte}")
        pecas[nome] = abrir(nome)
    for nome in OPCIONAIS:
        if os.path.exists(os.path.join(arte, nome + ".png")):
            pecas[nome] = abrir(nome)
    for nome in ("aviao-1", "aviao-2"):
        pecas["mini-" + nome] = mini(pecas[nome], MINI_AVIAO)
    for c in cidades:
        nome = "marco-" + c["marco"] if c["marco"] else None
        if nome and os.path.exists(os.path.join(arte, nome + ".png")):
            pecas[nome] = abrir(nome)
            pecas["mini-" + c["marco"]] = mini(pecas[nome], MINI_MARCO)
        elif nome:
            print(f"atlas: sem {nome}.png, {c['id']} usa os prédios genéricos")

    x = y = alto = 0
    quadros = {}
    for nome, im in sorted(pecas.items(), key=lambda p: (-p[1].height, p[0])):
        if x + im.width > ATLAS_LARGURA:
            x, y, alto = 0, y + alto + 1, 0
        quadros[nome] = [x, y, im.width, im.height]
        x += im.width + 1
        alto = max(alto, im.height)
    imagem = Image.new("RGBA", (ATLAS_LARGURA, y + alto))
    for nome, (px, py, _, _) in quadros.items():
        imagem.paste(pecas[nome], (px, py))
    quadros = dict(sorted(quadros.items()))
    h = hashlib.sha256(imagem.tobytes() + json.dumps(quadros, sort_keys=True).encode())
    atlas = {"versao": int(h.hexdigest()[:8], 16), "quadros": quadros}

    os.makedirs(saida, exist_ok=True)
    imagem.save(os.path.join(saida, "atlas.png"), optimize=True)
    with open(os.path.join(saida, "atlas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(atlas, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return atlas


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else ENTRADA
    saida = sys.argv[2] if len(sys.argv) > 2 else SAIDA
    mundo = montar(entrada, saida)
    print(f"mundo: {len(mundo['cidades'])} cidades, {len(mundo['rotas'])} rotas, versão {mundo['versao']} -> {os.path.normpath(saida)}")
    atlas = montar_atlas(ARTE, ler(os.path.join(entrada, "cidades.json")), saida)
    print(f"atlas: {len(atlas['quadros'])} peças, versão {atlas['versao']} -> {os.path.normpath(saida)}")


if __name__ == "__main__":
    main()
