# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Autoria das cenas integrais das cidades (static/mundo/cenas/<id>.png e <id>.json, esquema v1).

Uso: python3 ferramentas/montar_cenas.py <subcomando>
  importar <id> <png_bruto>   grava o PNG indexado, sem perda, e anota a proveniência. O bruto é o que o
                              ../trabalho/escolhas.json (ao lado da pasta dele) mandar; sem escolha, o da 1ª tentativa
      --retocado PNG --nota TEXTO   (juntas) importa o retoque do bruto: mesmo tamanho, até 256 cores, guardado fora do
                              repositório (firmopolis-pixellab-cenas/retoques/); a nota tem até 160 caracteres.
                              Retocar cidade já integrada é troca de arte e volta ao gate
  paleta <id> --saida DIR     cada cor do PNG, com índice, hex, contagem e onde aparece (para preencher "superficies");
                              se o JSON existir, a classe de cada cor vai por cima
  sugerir <id> --saida DIR    rede de calçadas (até 160 nós) e pista tiradas das "superficies": só sugestão, o autor copia
                              e corrige. A pista que reprova no A3 sai vazia
  validar [id ...]            esquema, limites e o aceite A1 a A9; sai com 1 e lista as violações (sem id: todas)
  revisar <id> --saida DIR    a arte a 3x com a geometria por cima, de dia, e a arte à noite com as luzes
  indice                      regrava static/mundo_cidade_cenas.js (rode antes do validar: o A1 confere o manifesto)

DIR fica fora do repositório. Precisa de Pillow e numpy; o validar também de node (o esquema é conferido pela mesma
CidadePlanta.cena que o navegador usa).
"""
import argparse
import base64
import datetime
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
COR = re.compile(r"[0-9a-f]{6}")
LARGURAS, ALTURAS, TETO_PNG = (480, 704), (320, 480), 120 * 1024
CLASSES = ("calcada", "faixa", "ponte", "asfalto")
TOLERANCIA, SEGUIDOS = 0.03, 2   # amostras fora da superfície: parte do total e quantas seguidas
NO_ASFALTO = 0.7   # a linha central da pista: no mínimo esta parte em asfalto ou ponte (o resto pode ser faixa)
# o sugerir: componente menor sai, raio inscrito mínimo, galho menor sai, nós mais perto que isto viram um, teto de nós
MINIMO, RAIO = {"calcada": 24, "asfalto": 80}, {"calcada": 1, "asfalto": 2}
GALHO, FUSAO, TETO_NOS, EPS = 8, 3, 160, (1.5, 2.5, 4)
SECAO = "## Cenas importadas (montar_cenas.py)"
CABECALHO = ("PNG indexado sem perda (RGBA igual ao do bruto ou, com retoque, ao do retocado).\n\n"
             "| Cidade | Arquivo de origem | SHA-256 do bruto | Data |\n|---|---|---|---|")
SECAO_RETOQUES = "## Retoques das cenas importadas (montar_cenas.py)"
CABECALHO_RETOQUES = ("| Cidade | SHA-256 do bruto | SHA-256 do retocado | Retocado | Nota | Data |\n"
                      "|---|---|---|---|---|---|")
LUZ = (255, 214, 130)   # a cor das luzes do mundo_cidade.js
# o esquema e os limites são os do cliente: uma fonte só
NODE = ('const fs=require("fs"),vm=require("vm"),c=vm.createContext({window:{}});'
        'vm.runInContext(fs.readFileSync(process.argv[1],"utf8"),c);'
        'try{c.window.CidadePlanta.cena(JSON.parse(fs.readFileSync(process.argv[2],"utf8")))}'
        'catch(e){console.log(e.message);process.exit(1)}')


class Erro(Exception):
    """Entrada recusada, com o motivo para quem rodou."""


def caminho(raiz, *partes):
    return os.path.join(raiz, "static", "mundo", "cenas", *partes)


def ler(arquivo):
    with open(arquivo, "rb") as f:
        return f.read()


def gravar(arquivo, dados):
    with open(arquivo + ".tmp", "wb") as f:
        f.write(dados)
    os.replace(arquivo + ".tmp", arquivo)


def abrir_arte(arquivo):
    """Os bytes do arquivo e a imagem em RGBA."""
    try:
        dados = ler(arquivo)
        with Image.open(io.BytesIO(dados)) as im:
            return dados, im.convert("RGBA")
    except (OSError, ValueError) as erro:
        raise Erro(f"não deu para ler a imagem {arquivo} ({erro})") from erro


def ler_json(cidade, raiz):
    try:
        return json.loads(ler(caminho(raiz, cidade + ".json")))
    except (OSError, ValueError) as erro:
        raise Erro(f"{cidade}: não deu para ler o JSON da cena ({erro})") from erro


def arte_de(cidade, raiz):
    if not ID.fullmatch(cidade):
        raise Erro(f"id inválido: {cidade!r}")
    return abrir_arte(caminho(raiz, cidade + ".png"))[1]


def carregar(cidade, raiz):
    """O JSON da cena e a arte dela em RGBA."""
    arte = arte_de(cidade, raiz)
    return ler_json(cidade, raiz), arte


# manifesto

def sri(dados):
    return "sha256-" + base64.b64encode(hashlib.sha256(dados).digest()).decode()


def ids(raiz=RAIZ):
    nomes = os.listdir(caminho(raiz))
    cidades = sorted({os.path.splitext(n)[0] for n in nomes})
    esperados = {c + ext for c in cidades for ext in (".json", ".png")}
    if set(nomes) != esperados or not all(ID.fullmatch(c) for c in cidades):
        raise Erro("static/mundo/cenas só leva pares <id>.png e <id>.json; confira: "
                   + ", ".join(sorted(set(nomes) ^ esperados) or cidades))
    return cidades


def linha_do_manifesto(cidade, png, cena):
    return (f'  "{cidade}": Object.freeze({{ v: "{hashlib.sha256(png).hexdigest()[:12]}", '
            f'png: "{sri(png)}", json: "{sri(cena)}" }}),\n')


def indice_texto(raiz=RAIZ):
    linhas = [linha_do_manifesto(c, ler(caminho(raiz, c + ".png")), ler(caminho(raiz, c + ".json"))) for c in ids(raiz)]
    return ('"use strict";\n// gerado por ferramentas/montar_cenas.py indice: não editar\n'
            "const CidadeCenas = Object.freeze({\n" + "".join(linhas) + "});\nwindow.CidadeCenas = CidadeCenas;\n")


def indice(raiz=RAIZ):
    gravar(os.path.join(raiz, "static", "mundo_cidade_cenas.js"), indice_texto(raiz).encode())


# importar

def cidades_do_mundo(raiz):
    mundo = json.loads(ler(os.path.join(raiz, "static", "mundo", "mundo.json")))
    return {c["id"] for c in mundo["cidades"] + mundo["exterior"] + mundo["niveis"]["brasil"]["medias"]}


def no_repositorio(arquivo, raiz):
    real = os.path.realpath(arquivo)
    return any(os.path.commonpath([real, os.path.realpath(r)]) == os.path.realpath(r) for r in (RAIZ, raiz))


def importar(cidade, bruto, raiz=RAIZ, retocado=None, nota=None):
    if (retocado is None) != (nota is None):
        raise Erro("--retocado e --nota andam juntas")
    if nota is not None and (not 1 <= len(nota) <= 160 or any(c == "|" or unicodedata.category(c) == "Cc" for c in nota)):
        raise Erro("a nota tem de 1 a 160 caracteres, sem | nem controle")
    if not ID.fullmatch(cidade) or cidade not in cidades_do_mundo(raiz):
        raise Erro(f"cidade fora do mundo.json: {cidade!r}")
    nome = os.path.basename(bruto)
    escolhas = os.path.join(os.path.dirname(os.path.abspath(bruto)), "..", "trabalho", "escolhas.json")
    escolha = json.loads(ler(escolhas)).get(cidade) if os.path.isfile(escolhas) else None
    if escolha and nome != escolha:
        raise Erro(f"o escolhas.json manda usar {escolha}")
    if not escolha and nome.endswith("-retry.png"):
        raise Erro("nova tentativa só entra se o escolhas.json mandar")
    dados, arte = abrir_arte(bruto)
    if retocado is not None:
        if no_repositorio(retocado, raiz):
            raise Erro("o retocado fica fora do repositório (firmopolis-pixellab-cenas/retoques/)")
        feito, nova = abrir_arte(retocado)
        if nova.size != arte.size:
            raise Erro(f"o retocado tem {nova.width}x{nova.height} e o bruto {arte.width}x{arte.height}")
        arte = nova
    W, H = arte.size
    if not (LARGURAS[0] <= W <= LARGURAS[1] and ALTURAS[0] <= H <= ALTURAS[1]):
        raise Erro(f"tamanho {W}x{H} fora de {LARGURAS} x {ALTURAS}")
    cores = arte.getcolors(256)
    if cores is None:
        raise Erro("mais de 256 cores: o PNG indexado perderia pixels")
    paleta = [cor for _, cor in sorted(cores, key=lambda c: (-c[0], c[1]))]
    chaves = np.array(paleta, np.uint8).view(np.uint32).ravel()
    ordem = np.argsort(chaves)
    indices = ordem[np.searchsorted(chaves[ordem], np.asarray(arte).copy().view(np.uint32).ravel())]
    saida = Image.frombytes("P", arte.size, indices.astype(np.uint8).tobytes())
    saida.putpalette([v for cor in paleta for v in cor[:3]])
    opcoes = {"optimize": True}
    if any(cor[3] != 255 for cor in paleta):
        opcoes["transparency"] = bytes(cor[3] for cor in paleta)
    buffer = io.BytesIO()
    saida.save(buffer, "PNG", **opcoes)
    with Image.open(io.BytesIO(buffer.getvalue())) as volta:
        if volta.convert("RGBA").tobytes() != arte.tobytes():
            raise Erro("o PNG indexado não saiu igual à arte, pixel a pixel")
    os.makedirs(caminho(raiz), exist_ok=True)
    gravar(caminho(raiz, cidade + ".png"), buffer.getvalue())
    arquivo = os.path.join(raiz, "arte", "pixellab", "mundo", "PROVENIENCIA-cidades.md")
    texto, hoje = ler(arquivo).decode(), f"{datetime.date.today():%d/%m/%Y}"
    soma = hashlib.sha256(dados).hexdigest()
    texto = anotar(texto, SECAO, CABECALHO, [cidade, f"`{nome}`", f"`{soma}`", hoje], (soma,))
    if retocado is not None:
        nova_soma = hashlib.sha256(feito).hexdigest()
        texto = anotar(texto, SECAO_RETOQUES, CABECALHO_RETOQUES, [cidade, f"`{soma}`", f"`{nova_soma}`",
                       f"`{os.path.abspath(retocado)}`", nota, hoje], (soma, nova_soma))
    gravar(arquivo, texto.encode())
    return len(buffer.getvalue())


def anotar(texto, secao, cabecalho, colunas, somas):
    """O texto com a linha na tabela da seção (criada no fim, se faltar): uma só por cidade e somas."""
    if secao not in texto:
        texto = texto.rstrip("\n") + f"\n\n{secao}\n\n{cabecalho}\n"
    antes, depois = texto.split(secao)
    corpo, proxima, resto = depois.partition("\n## ")
    linhas = corpo.split("\n")
    inicio = f"| `{colunas[0]}` |"
    if any(l.startswith(inicio) and all(f"`{s}`" in l for s in somas) for l in linhas):
        return texto
    ultima = max(i for i, l in enumerate(linhas) if l.startswith("|"))
    linhas.insert(ultima + 1, " | ".join([f"{inicio[:-2]}", *colunas[1:]]) + " |")
    return antes + secao + "\n".join(linhas) + proxima + resto


# validar

def arestas_de(d):
    c = d["calcadas"]
    return c["arestas"] if c["arestas"] is not None else [[i, i + 1] for i in range(len(c["nos"]) - 1)]


def travessias_de(d):
    return {t if isinstance(t, int) else t["aresta"] for t in d["calcadas"]["travessias"]}


def bresenham(a, b):
    (x, y), (x1, y1) = a, b
    dx, dy, sx, sy = abs(x1 - x), -abs(y1 - y), 1 if x < x1 else -1, 1 if y < y1 else -1
    erro = dx + dy
    while True:
        yield x, y
        if (x, y) == (x1, y1):
            return
        dobro = 2 * erro
        if dobro >= dy:
            erro += dy
            x += sx
        if dobro <= dx:
            erro += dx
            y += sy


def hexa(pixel):
    return "%02x%02x%02x" % pixel[:3]


def cor_em(arte, x, y):
    """O hex do pixel; None fora da arte ou transparente."""
    if not (0 <= x < arte.width and 0 <= y < arte.height):
        return None
    pixel = arte.getpixel((x, y))
    return hexa(pixel) if pixel[3] else None


def escondido(d, arte, x, y):
    """A mesma máscara do cliente: com o pé na faixa de uma oclusão, o que está opaco na frente cobre o pedestre."""
    for o in d["oclusoes"]:
        (px0, py0, px1, py1), (fx0, fy0, fx1, fy1) = o["pes"], o["frente"]
        if px0 <= x < px1 and py0 <= y < py1 and fx0 <= x < fx1 and fy0 <= y < fy1:
            cor = cor_em(arte, x, y)
            if cor and cor not in o["transparente"]:
                return True
    return False


def maior_sequencia(fora, circular=False):
    if circular and not all(fora):   # a volta fechada: começa numa amostra boa
        k = fora.index(False)
        fora = fora[k:] + fora[:k]
    maior = atual = 0
    for f in fora:
        atual = atual + 1 if f else 0
        maior = max(maior, atual)
    return maior


def a1_png(d, arte, cidade, raiz):
    dados = ler(caminho(raiz, cidade + ".png"))
    with Image.open(io.BytesIO(dados)) as im:
        if im.mode != "P" or im.getcolors(256) is None:
            yield f"o PNG não é indexado com até 256 cores (modo {im.mode})"
    if arte.size != (d["W"], d["H"]):
        yield f"PNG {arte.width}x{arte.height}, JSON {d['W']}x{d['H']}"
    if not (LARGURAS[0] <= arte.width <= LARGURAS[1] and ALTURAS[0] <= arte.height <= ALTURAS[1]):
        yield f"tamanho {arte.width}x{arte.height} fora dos limites"
    if len(dados) > TETO_PNG:
        yield f"PNG com {len(dados)} bytes (teto {TETO_PNG})"
    arquivo = os.path.join(raiz, "static", "mundo_cidade_cenas.js")
    manifesto = ler(arquivo).decode() if os.path.isfile(arquivo) else ""
    if linha_do_manifesto(cidade, dados, ler(caminho(raiz, cidade + ".json"))) not in manifesto:
        yield "o SHA do PNG ou do JSON não é o do manifesto (rode: montar_cenas.py indice)"


def a2_calcadas(d, arte, resumo):
    nos, sup = d["calcadas"]["nos"], d["superficies"]
    chao = set(sup["calcada"]) | set(sup["faixa"]) | set(sup["ponte"])
    rua, travessias = set(sup["asfalto"]), travessias_de(d)
    total = ruins = 0
    for k, (i, j) in enumerate(arestas_de(d)):
        aceitas = chao | rua if k in travessias else chao
        amostras = list(bresenham(nos[i], nos[j]))
        # a amostra com o pé escondido sai da conta (a sequência segue pelas visíveis), mas não desculpa a aresta inteira
        visiveis = [(x, y) for x, y in amostras if not escondido(d, arte, x, y)]
        ocultas = len(amostras) - len(visiveis)
        fora = [cor_em(arte, x, y) not in aceitas for x, y in visiveis]
        total += len(visiveis)
        ruins += sum(fora)
        if ocultas * 2 > len(amostras):
            yield f"aresta {k} ({i}-{j}): {ocultas} de {len(amostras)} amostras escondidas por oclusão (mais da metade)"
        if maior_sequencia(fora) > SEGUIDOS:
            onde = visiveis[fora.index(True)]
            yield f"aresta {k} ({i}-{j}): {maior_sequencia(fora)} px seguidos fora da calçada (1º fora em {onde})"
    resumo.append(f"A2 {ruins}/{total} amostras visíveis fora ({ruins / max(total, 1):.1%})")
    if ruins > TOLERANCIA * total:
        yield f"{ruins} de {total} amostras visíveis fora ({ruins / total:.1%}, teto {TOLERANCIA:.0%})"


def amostras_da_volta(pista, desvio):
    """Pontos a cada 1 px (ou menos) da volta, deslocados de lado."""
    for i, a in enumerate(pista):
        b = pista[(i + 1) % len(pista)]
        L = math.dist(a, b)
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        n = math.ceil(L)
        for j in range(n):
            s = L * j / n
            yield math.floor(a[0] + ux * s - uy * desvio), math.floor(a[1] + uy * s + ux * desvio)


def a3_pista(d, arte, resumo):
    rua = set(d["superficies"]["asfalto"]) | set(d["superficies"]["ponte"])
    aceitas = rua | set(d["superficies"]["faixa"])
    meia = max((c["tamanho"][1] for c in d["carros"]), default=0) / 2
    for nome, desvio in (("central", 0), ("direita", meia), ("esquerda", -meia)):
        amostras = list(amostras_da_volta(d["pista"], desvio))
        fora = [cor_em(arte, x, y) not in aceitas for x, y in amostras]
        resumo.append(f"A3 {nome} {sum(fora)}/{len(amostras)}")
        if maior_sequencia(fora, circular=True) > SEGUIDOS:
            yield (f"linha {nome}: {maior_sequencia(fora, circular=True)} px seguidos fora do asfalto "
                   f"(1º fora em {amostras[fora.index(True)]})")
        if sum(fora) > TOLERANCIA * len(amostras):
            yield f"linha {nome}: {sum(fora)} de {len(amostras)} amostras fora (teto {TOLERANCIA:.0%})"
        if not desvio:
            n = sum(cor_em(arte, x, y) in rua for x, y in amostras)
            if n < NO_ASFALTO * len(amostras):
                yield f"linha central: só {n / len(amostras):.1%} em asfalto ou ponte (mínimo {NO_ASFALTO:.0%})"


def contem(r, ponto):
    return r[0] <= ponto[0] <= r[2] and r[1] <= ponto[1] <= r[3]


def na_imagem(d, r):
    return 0 <= r[0] < r[2] <= d["W"] and 0 <= r[1] < r[3] <= d["H"]


def a4_portaria(d):
    p, nos = d["portaria"], d["calcadas"]["nos"]
    pe = [p["x"], p["y"]]
    if pe not in nos or not any(nos.index(pe) in a for a in arestas_de(d)):
        yield f"a portaria {pe} não é um nó com calçada"
    r = p["r"]
    if not na_imagem(d, r) or r[2] - r[0] < 16 or r[3] - r[1] < 24:
        yield f"portaria.r {r} precisa de 16x24 dentro da imagem"
    for nome in ("placa", "farol"):
        if not contem(r, p[nome]):
            yield f"{nome} {p[nome]} fora de portaria.r"


def a5_pontos(d):
    if not 1 <= len(d["pontos"]) <= 6:
        yield f"{len(d['pontos'])} pontos (de 1 a 6)"
    for p in d["pontos"]:
        if not na_imagem(d, p["r"]):
            yield f"ponto {p['nome']!r}: r {p['r']} fora da imagem"
        if not 1 <= len(p["nome"]) <= 40:
            yield f"ponto com nome de {len(p['nome'])} caracteres (de 1 a 40)"


def a6_oclusoes(d):
    """Só aviso: a máscara cuja faixa de pés nenhuma calçada cruza não serve para nada."""
    nos = d["calcadas"]["nos"]
    caminho_dos_pes = {z for i, j in arestas_de(d) for z in bresenham(nos[i], nos[j])}
    for k, o in enumerate(d["oclusoes"]):
        x0, y0, x1, y1 = o["pes"]
        if not any(x0 <= x < x1 and y0 <= y < y1 for x, y in caminho_dos_pes):
            yield f"oclusão {k}: nenhuma calçada cruza os pés {o['pes']} (máscara inútil)"


def a7_praca(d):
    """A caixa da fonte como a festa a desenha (mundo_festa.js): apoiada no pé, de y - h até y."""
    p = d["praca"]
    w, h = p["fonte"]
    caixa = [p["x"] - math.ceil(w / 2), p["y"] - h, p["x"] + math.ceil(w / 2), p["y"]]
    if not (contem(p["r"], caixa[:2]) and contem(p["r"], caixa[2:])):
        yield f"a fonte {w}x{h}, apoiada no pé ({caixa}), não cabe em praca.r {p['r']}"


def a8_grafo(d):
    nos, arestas = d["calcadas"]["nos"], arestas_de(d)
    for i, a in enumerate(nos):
        for j in range(i + 1, len(nos)):
            if math.dist(a, nos[j]) < 2:
                yield f"nós {i} e {j} repetidos (a menos de 2 px)"
    viz = [set() for _ in nos]
    for i, j in arestas:
        viz[i].add(j)
        viz[j].add(i)
    vistos, fila = {0}, [0]
    for i in fila:
        for j in viz[i] - vistos:
            vistos.add(j)
            fila.append(j)
    if len(vistos) != len(nos):
        yield f"calçadas desconexas: sem caminho até os nós {sorted(set(range(len(nos))) - vistos)}"
    volta = sum(math.dist(a, d["pista"][(i + 1) % len(d["pista"])]) for i, a in enumerate(d["pista"]))
    for k, c in enumerate(d["carros"]):
        if not 0 <= c["s"] < volta:
            yield f"carro {k} começa fora da volta (s={c['s']}, volta={volta:.1f})"
    for k, p in enumerate(d["pedestres"]):
        if p["para"] not in viz[p["de"]] or not 0 <= p["s"] <= math.dist(nos[p["de"]], nos[p["para"]]):
            yield f"pedestre {k} começa fora de uma calçada"


def a9_textos(d):
    textos = [(f"texto.{k}", d["texto"][k], 160) for k in ("cena", "vida", "portaria")]
    textos += [(f"nome do ponto {i}", p["nome"], 40) for i, p in enumerate(d["pontos"])]
    for nome, t, teto in textos:
        if not 1 <= len(t) <= teto or any(c in "<>" or unicodedata.category(c) == "Cc" for c in t):
            yield f"{nome}: de 1 a {teto} caracteres, sem < > nem controle"


def superficies(d, arte):
    sup = d.get("superficies")
    if not isinstance(sup, dict) or set(sup) != set(CLASSES):
        yield f"obrigatório, com as listas {', '.join(CLASSES)}"
        return
    da_arte = {hexa(cor) for _, cor in arte.getcolors(arte.width * arte.height) if cor[3]}
    for classe in CLASSES:
        cores = sup[classe]
        if not isinstance(cores, list) or not all(isinstance(c, str) and COR.fullmatch(c) for c in cores):
            yield f"{classe}: lista de cores em hex minúsculo"
        elif not cores and classe in ("calcada", "asfalto"):
            yield f"{classe}: vazia"
        elif set(cores) - da_arte:
            yield f"{classe}: cores que a arte não tem: {', '.join(sorted(set(cores) - da_arte))}"
    onde = {}
    for classe in CLASSES:
        for cor in sup[classe] if isinstance(sup[classe], list) else []:
            onde.setdefault(str(cor), set()).add(classe)
    for cor, classes in sorted(onde.items()):
        if len(classes) > 1:
            yield f"cor {cor} em mais de uma classe ({', '.join(sorted(classes))}): as classes são disjuntas"


def validar(cidade, raiz=RAIZ, resumo=None):
    """(violações, avisos); cada linha começa pela regra: esquema, superficies ou A1 a A9."""
    resumo = [] if resumo is None else resumo
    try:
        d, arte = carregar(cidade, raiz)
    except Erro as erro:
        return [f"A1: {erro}"], []
    violacoes, avisos = [], []
    no = subprocess.run(["node", "-e", NODE, os.path.join(RAIZ, "static", "mundo_cidade_planta.js"),
                         caminho(raiz, cidade + ".json")], capture_output=True, text=True, timeout=60)
    if no.returncode:
        violacoes.append("esquema: " + (no.stdout.strip() or no.stderr.strip()[-300:]))
    if not isinstance(d, dict) or d.get("id") != cidade:
        violacoes.append(f"esquema: o id do JSON não é {cidade!r}")
    regras = (("A1", lambda: a1_png(d, arte, cidade, raiz)), ("superficies", lambda: superficies(d, arte)),
              ("A2", lambda: a2_calcadas(d, arte, resumo)), ("A3", lambda: a3_pista(d, arte, resumo)),
              ("A4", lambda: a4_portaria(d)), ("A5", lambda: a5_pontos(d)), ("A6", lambda: a6_oclusoes(d)),
              ("A7", lambda: a7_praca(d)), ("A8", lambda: a8_grafo(d)), ("A9", lambda: a9_textos(d)))
    for nome, regra in regras:
        destino = avisos if nome == "A6" else violacoes
        try:
            destino.extend(f"{nome}: {v}" for v in regra())
        except (KeyError, TypeError, ValueError, IndexError, AttributeError, ZeroDivisionError, OSError) as erro:
            violacoes.append(f"{nome}: não deu para conferir ({type(erro).__name__}: {erro})")
    return violacoes, avisos


# saídas visuais da autoria

def fora_do_repositorio(saida, raiz):
    real = os.path.realpath(saida)
    if no_repositorio(real, raiz):
        raise Erro("--saida precisa ficar fora do repositório")
    os.makedirs(real, exist_ok=True)
    return real


def paleta(cidade, saida, raiz=RAIZ):
    saida = fora_do_repositorio(saida, raiz)
    arte = arte_de(cidade, raiz)
    classes = {}
    if os.path.isfile(caminho(raiz, cidade + ".json")):
        sup = ler_json(cidade, raiz).get("superficies") or {}
        for classe in CLASSES:
            for cor in sup.get(classe, []):
                classes.setdefault(cor, []).append(classe)
    pixels = np.asarray(arte)
    cores = sorted(arte.getcolors(arte.width * arte.height), key=lambda c: (-c[0], c[1]))
    w, h, colunas = arte.width // 2, arte.height // 2, 6
    folha = Image.new("RGB", (colunas * (w + 6), math.ceil(len(cores) / colunas) * (h + 24)), (24, 24, 30))
    g = ImageDraw.Draw(folha)
    escura = (pixels[:h * 2:2, :w * 2:2, :3] // 4).astype(np.uint8)
    for i, (n, cor) in enumerate(cores):
        onde = np.all(pixels[:h * 2, :w * 2] == cor, axis=2).reshape(h, 2, w, 2).any(axis=(1, 3))
        mapa = escura.copy()
        mapa[onde] = (255, 0, 255)
        x, y = i % colunas * (w + 6), i // colunas * (h + 24)
        g.rectangle([x, y + 3, x + 18, y + 19], fill=cor[:3], outline=(255, 255, 255))
        g.text((x + 24, y + 5), f"#{i}  {hexa(cor)}  {n} px" + ("" if cor[3] == 255 else f"  alfa {cor[3]}"),
               fill=(255, 255, 255))
        folha.paste(Image.fromarray(mapa), (x, y + 22))
        if hexa(cor) in classes:
            rotulo = " + ".join(classes[hexa(cor)])
            g.rectangle([x, y + 22, x + 8 + g.textlength(rotulo), y + 36], fill=(0, 0, 0))
            g.text((x + 4, y + 23), rotulo, fill=(255, 224, 138))
    folha.save(os.path.join(saida, f"{cidade}-paleta.png"))


def tela_3x(arte):
    return arte.convert("RGB").resize((arte.width * 3, arte.height * 3), Image.Resampling.NEAREST)


def em_3x(ponto):   # o centro do pixel ampliado
    return int(ponto[0] * 3) + 1, int(ponto[1] * 3) + 1


def tracejado(g, r, cor):
    x0, y0, x1, y1 = (v * 3 for v in r)
    for x in range(x0, x1, 8):
        g.line([x, y0, min(x + 4, x1), y0], fill=cor)
        g.line([x, y1, min(x + 4, x1), y1], fill=cor)
    for y in range(y0, y1, 8):
        g.line([x0, y, x0, min(y + 4, y1)], fill=cor)
        g.line([x1, y, x1, min(y + 4, y1)], fill=cor)


def desenhar_rede(g, nos, arestas, travessias, pontes, pista):
    for k, (i, j) in enumerate(arestas):
        cor = (255, 255, 0) if k in travessias else (0, 255, 255) if k in pontes else (0, 255, 0)
        g.line([em_3x(nos[i]), em_3x(nos[j])], fill=cor)
    for i, a in enumerate(pista):
        b = pista[(i + 1) % len(pista)]
        (x0, y0), (x1, y1) = em_3x(a), em_3x(b)
        g.line([x0, y0, x1, y1], fill=(255, 0, 0))
        L = math.hypot(x1 - x0, y1 - y0)
        if L >= 8:   # a seta do sentido, no meio do trecho
            ux, uy, mx, my = (x1 - x0) / L, (y1 - y0) / L, (x0 + x1) / 2, (y0 + y1) / 2
            g.polygon([(mx + ux * 6, my + uy * 6), (mx - uy * 4, my + ux * 4), (mx + uy * 4, my - ux * 4)], fill=(255, 0, 0))


def revisar(cidade, saida, raiz=RAIZ):
    saida = fora_do_repositorio(saida, raiz)
    d, arte = carregar(cidade, raiz)
    dia = tela_3x(arte)
    g = ImageDraw.Draw(dia)

    def caixa(r, cor):
        g.rectangle([v * 3 for v in r], outline=cor)

    def marca(ponto, cor, raio=3):
        x, y = em_3x(ponto)
        g.ellipse([x - raio, y - raio, x + raio, y + raio], outline=cor)

    desenhar_rede(g, d["calcadas"]["nos"], arestas_de(d), travessias_de(d), set(d["calcadas"]["pontes"]), d["pista"])
    for i, no in enumerate(d["calcadas"]["nos"]):
        g.text((no[0] * 3 + 4, no[1] * 3 + 3), str(i), fill=(255, 255, 255))
    p, praca = d["portaria"], d["praca"]
    caixa(p["r"], (255, 255, 255))
    marca(p["placa"], (255, 255, 255))
    marca(p["farol"], (255, 255, 255))
    for ponto in d["pontos"]:
        caixa(ponto["r"], (255, 136, 0))
    for o in d["oclusoes"]:
        caixa(o["frente"], (0, 90, 255))
        tracejado(g, o["pes"], (0, 90, 255))
    magenta, (fw, fh) = (255, 0, 255), praca["fonte"]
    caixa(praca["r"], magenta)
    caixa([praca["x"] - fw / 2, praca["y"] - fh / 2, praca["x"] + fw / 2, praca["y"] + fh / 2], magenta)
    for x0, y0, x1, y1 in d["cordoes"]:
        g.line([em_3x((x0, y0)), em_3x((x1, y1))], fill=magenta)
    for x, y, r, _ in d["luzes"]:
        marca((x, y), magenta, r * 3)
    dia.save(os.path.join(saida, f"{cidade}-revisao.png"))

    # à noite: o escuro do cliente (0,62 de #060a22) e cada luz somada, do centro para a borda
    noite = np.asarray(arte.convert("RGB"), float) * 0.38 + np.array((6, 10, 34)) * 0.62
    ys, xs = np.mgrid[0:arte.height, 0:arte.width]
    for x, y, r, forca in d["luzes"]:
        brilho = np.clip(1 - np.hypot(xs + 0.5 - x, ys + 0.5 - y) / r, 0, 1) * forca
        noite += brilho[..., None] * np.array(LUZ)
    tela_3x(Image.fromarray(np.clip(noite, 0, 255).astype(np.uint8))).save(os.path.join(saida, f"{cidade}-revisao-noite.png"))


# sugestão de rede e pista (esqueleto das superfícies)

def afinar(mascara):
    """Zhang-Suen: o esqueleto de 1 px da máscara."""
    img = np.pad(mascara.astype(np.uint8), 1)
    mudou = True
    while mudou:
        mudou = False
        for passo in (0, 1):
            # os 8 vizinhos, do norte no sentido horário
            n = [np.roll(img, (-dy, -dx), (0, 1))
                 for dy, dx in ((-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1))]
            vizinhos = sum(n)
            subidas = sum((n[k] == 0) & (n[(k + 1) % 8] == 1) for k in range(8))
            N, L, S, O = n[0], n[2], n[4], n[6]
            lados = (N & L & S, L & S & O) if passo == 0 else (N & L & O, N & S & O)
            apagar = ((img == 1) & (vizinhos >= 2) & (vizinhos <= 6) & (subidas == 1)
                      & (lados[0] == 0) & (lados[1] == 0))
            if apagar.any():
                img[apagar] = 0
                mudou = True
    return img[1:-1, 1:-1].astype(bool)


def tracar(esqueleto):
    """[(a, b, [pixels de a até b])]: os trechos entre pontas e junções (a e b são pixels que representam cada uma)."""
    pixels = {(int(x), int(y)) for y, x in zip(*np.nonzero(esqueleto))}
    viz = {p: [(p[0] + dx, p[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
               if (dx or dy) and (p[0] + dx, p[1] + dy) in pixels] for p in sorted(pixels)}
    no_de = {}
    for p in sorted(pixels):   # junções vizinhas viram um nó só, no pixel mais perto do meio delas
        if len(viz[p]) == 2 or p in no_de:
            continue
        grupo, fila = {p}, [p]
        for q in fila:
            for v in viz[q]:
                if len(viz[v]) != 2 and v not in grupo:
                    grupo.add(v)
                    fila.append(v)
        meio = (sum(x for x, _ in grupo) / len(grupo), sum(y for _, y in grupo) / len(grupo))
        centro = min(sorted(grupo), key=lambda q: math.dist(q, meio))
        no_de.update(dict.fromkeys(grupo, centro))
    trechos, usados = [], set()

    def seguir(inicio, passo):
        pontos, antes, atual = [inicio], inicio, passo
        while atual not in no_de:
            usados.add(atual)
            pontos.append(atual)
            antes, atual = atual, next(v for v in viz[atual] if v != antes)
        a, b = no_de[inicio], no_de[atual]
        trechos.append((a, b, [a] + pontos[1:] + [b]))

    for p in sorted(no_de):
        for q in viz[p]:
            if q not in no_de and q not in usados:
                seguir(p, q)
    for p in sorted(pixels):   # voltas sem ponta nem junção
        if len(viz[p]) == 2 and p not in usados and p not in no_de:
            no_de[p] = p
            seguir(p, viz[p][0])
    return trechos


def simplificar(pontos, eps=1.5):
    """Ramer-Douglas-Peucker."""
    manter, pilha = {0, len(pontos) - 1}, [(0, len(pontos) - 1)]
    while pilha:
        i, j = pilha.pop()
        (ax, ay), (bx, by) = pontos[i], pontos[j]
        L = math.hypot(bx - ax, by - ay)
        maior, k = eps, None
        for m in range(i + 1, j):
            x, y = pontos[m]
            t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L))) if L else 0
            afastado = math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay))
            if afastado > maior:
                maior, k = afastado, m
        if k is not None:
            manter.add(k)
            pilha += [(i, k), (k, j)]
    return [pontos[i] for i in sorted(manter)]


def por_classe(pontos, classe):
    """Corta o trecho onde a superfície muda, sem contar mudanças de menos de 3 px."""
    corridas = []
    for i, p in enumerate(pontos):
        c = classe(p)
        if corridas and corridas[-1][0] == c:
            corridas[-1][2] = i
        else:
            corridas.append([c, i, i])
    juntas = []
    for c, i, j in corridas:
        if juntas and (j - i < 2 or juntas[-1][0] == c):
            juntas[-1][2] = j
        else:
            juntas.append([c, i, j])
    for k, (c, i, j) in enumerate(juntas):
        fim = juntas[k + 1][1] if k + 1 < len(juntas) else j
        yield c, pontos[i:fim + 1]


def maior_volta(trechos):
    """A maior das voltas fundamentais do grafo (árvore em largura mais um trecho de fora), em pixels."""
    adj = {}
    for k, (a, b, _) in enumerate(trechos):
        adj.setdefault(a, []).append((b, k))
        adj.setdefault(b, []).append((a, k))
    pai, na_arvore = {}, set()
    for raiz in sorted(adj):
        if raiz in pai:
            continue
        pai[raiz] = None
        fila = [raiz]
        for u in fila:
            for v, k in adj[u]:
                if v not in pai:
                    pai[v] = (u, k)
                    na_arvore.add(k)
                    fila.append(v)

    def subida(u):   # [(trecho, de onde)] até a raiz
        passos = []
        while pai[u]:
            passos.append((pai[u][1], u))
            u = pai[u][0]
        return passos

    def sentido(k, de):
        return trechos[k][2] if trechos[k][0] == de else trechos[k][2][::-1]

    melhor = []
    for k, (a, b, _) in enumerate(trechos):
        if k in na_arvore:
            continue
        de_a, de_b = subida(a), subida(b)
        while de_a and de_b and de_a[-1][0] == de_b[-1][0]:   # o caminho comum até a raiz sai
            de_a.pop()
            de_b.pop()
        volta = [p for t, u in de_a for p in sentido(t, u)]
        for t, u in reversed(de_b):
            volta += sentido(t, u)[::-1]
        volta += sentido(k, b)
        if len(volta) > len(melhor):
            melhor = volta
    return melhor


def componentes(mascara):
    """Os pixels (x, y) de cada componente da máscara, com vizinhança de 8."""
    faltam = {(int(x), int(y)) for y, x in zip(*np.nonzero(mascara))}
    for inicio in sorted(faltam):
        if inicio not in faltam:
            continue
        faltam.remove(inicio)
        grupo = [inicio]
        for x, y in grupo:
            for q in ((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                if q in faltam:
                    faltam.remove(q)
                    grupo.append(q)
        yield grupo


def largas(mascara, raio):
    """O que um disco do raio cobre sem sair da máscara: o núcleo é onde a distância até a borda passa do raio."""
    disco = [(dy, dx) for dy in range(-raio, raio + 1) for dx in range(-raio, raio + 1) if dx * dx + dy * dy <= raio * raio]

    def vizinhas(m):
        borda = np.pad(m, raio)
        return [borda[raio + dy:raio + dy + m.shape[0], raio + dx:raio + dx + m.shape[1]] for dy, dx in disco]

    nucleo = np.logical_and.reduce(vizinhas(mascara))
    return mascara & np.logical_or.reduce(vizinhas(nucleo))


def esqueleto(mascara, tipo):
    """Os trechos do esqueleto: sem componentes pequenos, sem o que é estreito demais e sem galhos curtos."""
    limpa = mascara.copy()
    for grupo in componentes(mascara):
        if len(grupo) < MINIMO[tipo]:
            for x, y in grupo:
                limpa[y, x] = False
    fino = afinar(largas(limpa, RAIO[tipo]))
    trechos = tracar(fino)
    graus = {}
    for a, b, _ in trechos:
        graus[a] = graus.get(a, 0) + 1
        graus[b] = graus.get(b, 0) + 1
    for a, b, pontos in trechos:
        pontas = [p for p in (a, b) if graus[p] == 1]
        if a != b and pontas and len(pontos) < GALHO:
            for x, y in pontos[1:-1] + pontas:
                fino[y, x] = False
    return tracar(afinar(fino))


def rede(trechos, classe, eps, portaria):
    """(nós, arestas, o tipo de cada aresta): os trechos simplificados, nós colados fundidos e só o componente da portaria."""
    nos, arestas, tipos = [], [], []

    def no(p):
        for i, q in enumerate(nos):
            if math.dist(p, q) < FUSAO:
                return i
        nos.append([int(p[0]), int(p[1])])
        return len(nos) - 1

    for _, _, trecho in trechos:
        for tipo, parte in por_classe(trecho, classe):
            linha = simplificar(parte, eps)
            if len(linha) == 2 and linha[0] == linha[1]:
                continue
            if linha[0] == linha[-1]:   # uma volta: parte no meio para a RDP ter dois extremos
                meio = len(parte) // 2
                linha = simplificar(parte[:meio + 1], eps) + simplificar(parte[meio:], eps)[1:]
            for a, b in zip(linha, linha[1:]):
                i, j = no(a), no(b)
                if i != j and [i, j] not in arestas and [j, i] not in arestas:
                    arestas.append([i, j])
                    tipos.append(tipo)
    if portaria and nos:
        grupo = list(range(len(nos)))   # união dos componentes

        def raiz_de(i):
            while grupo[i] != i:
                i = grupo[i]
            return i

        for i, j in arestas:
            grupo[raiz_de(i)] = raiz_de(j)
        escolhido = raiz_de(min(range(len(nos)), key=lambda i: math.dist(nos[i], portaria)))
        novo = {i: k for k, i in enumerate(i for i in range(len(nos)) if raiz_de(i) == escolhido)}
        ficam = [(a, t) for a, t in zip(arestas, tipos) if a[0] in novo]
        nos = [nos[i] for i in novo]
        arestas, tipos = [[novo[i], novo[j]] for (i, j), _ in ficam], [t for _, t in ficam]
    return nos, arestas, tipos


def volta_do_carro(trechos):
    """A maior volta do esqueleto do asfalto, simplificada até caber em 64 pontos."""
    volta, pista, eps = maior_volta(trechos), [], EPS[0]
    while volta:
        meio = len(volta) // 2
        pista = simplificar(volta[:meio + 1], eps)[:-1] + simplificar(volta[meio:], eps)[:-1]
        pista = [[int(x), int(y)] for i, (x, y) in enumerate(pista) if (x, y) != tuple(pista[i - 1])]
        if len(pista) <= 64:
            break
        eps *= 1.5
    return pista


def sugerir(cidade, saida, raiz=RAIZ):
    saida = fora_do_repositorio(saida, raiz)
    d, arte = carregar(cidade, raiz)
    sup = d.get("superficies") or {}
    if not sup.get("calcada") or not sup.get("asfalto"):
        raise Erro('preencha "superficies" (calcada e asfalto) antes: use o subcomando paleta')
    pixels = np.asarray(arte).astype(np.uint32)
    rgb = (pixels[..., 0] << 16) | (pixels[..., 1] << 8) | pixels[..., 2]

    def mascara(*classes):
        cores = [int(c, 16) for classe in classes for c in sup.get(classe, [])]
        return np.isin(rgb, cores) & (pixels[..., 3] > 0)

    mapas = {c: mascara(c) for c in ("ponte", "faixa")}

    def classe(p):
        return next((c for c, m in mapas.items() if m[p[1], p[0]]), "calcada")

    portaria = d.get("portaria")
    portaria = portaria and (portaria["x"], portaria["y"])
    trechos = esqueleto(mascara("calcada", "faixa", "ponte"), "calcada")
    for eps in EPS:
        nos, arestas, tipos = rede(trechos, classe, eps, portaria)
        if len(nos) <= TETO_NOS:
            break
    if eps != EPS[0]:
        print(f"{cidade}: calçadas simplificadas com eps {eps} ({len(nos)} nós, teto {TETO_NOS})")
    travessias, pontes = ([k for k, t in enumerate(tipos) if t == tipo] for tipo in ("faixa", "ponte"))
    pista = volta_do_carro(esqueleto(mascara("asfalto", "ponte"), "asfalto"))
    prova = {"superficies": {c: sup.get(c, []) for c in CLASSES}, "carros": d.get("carros") or [], "pista": pista}
    reprovas = list(a3_pista(prova, arte, [])) if len(pista) >= 4 else ["não há volta no asfalto"]
    if reprovas:
        print(f"{cidade}: sem pista sugerida ({'; '.join(reprovas)})")
        pista = []
    sugestao = {"calcadas": {"nos": nos, "arestas": arestas, "travessias": travessias, "pontes": pontes},
                "pista": pista, "eps": eps}
    with open(os.path.join(saida, f"{cidade}-sugestao.json"), "w", encoding="utf-8") as f:
        json.dump(sugestao, f)
    tela = tela_3x(arte)
    desenhar_rede(ImageDraw.Draw(tela), nos, arestas, set(travessias), set(pontes), pista)
    tela.save(os.path.join(saida, f"{cidade}-sugestao.png"))
    return sugestao


def main(argv=None):
    comandos = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = comandos.add_subparsers(dest="comando", required=True)
    p = sub.add_parser("importar")
    p.add_argument("id")
    p.add_argument("png_bruto")
    p.add_argument("--retocado")
    p.add_argument("--nota")
    for nome in ("paleta", "sugerir", "revisar"):
        p = sub.add_parser(nome)
        p.add_argument("id")
        p.add_argument("--saida", required=True)
    sub.add_parser("validar").add_argument("ids", nargs="*")
    sub.add_parser("indice")
    a = comandos.parse_args(argv)
    try:
        if a.comando == "importar":
            tamanho = importar(a.id, a.png_bruto, retocado=a.retocado, nota=a.nota)
            print(f"{a.id}: {tamanho} bytes, pixels iguais aos do {'retocado' if a.retocado else 'bruto'}")
        elif a.comando == "indice":
            indice()
        elif a.comando == "validar":
            reprovadas = 0
            for cidade in a.ids or ids():
                resumo = []
                violacoes, avisos = validar(cidade, resumo=resumo)
                for linha in violacoes:
                    print(f"{cidade}: {linha}")
                for linha in avisos:
                    print(f"{cidade}: aviso {linha}")
                print(f"{cidade}: {f'{len(violacoes)} violações' if violacoes else 'ok'} · {'; '.join(resumo)}")
                reprovadas += bool(violacoes)
            return 1 if reprovadas else 0
        else:
            {"paleta": paleta, "sugerir": sugerir, "revisar": revisar}[a.comando](a.id, a.saida)
            print(f"{a.id}: {a.comando} em {a.saida}")
    except Erro as erro:
        print(erro, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
