# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""As cenas integrais das cidades (static/mundo/cenas): o manifesto confere com o disco, o peso fica no teto, o servidor
só serve a lista fechada e a ferramenta (ferramentas/montar_cenas.py) importa, confere (A1 a A9) e desenha a autoria. As
partes da ferramenta pedem Pillow, numpy e node."""
import base64
import contextlib
import hashlib
import http.client
import io
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import threading
import unittest

import acesso
import escritorio as e

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ferramentas"))
try:
    import montar_cenas as mc
    from PIL import Image, ImageDraw
except ImportError:   # sem Pillow ou numpy, o manifesto e o servidor seguem conferidos
    mc = None
FERRAMENTA = unittest.skipIf(mc is None or not shutil.which("node"), "a ferramenta pede Pillow, numpy e node")

PASTA = os.path.join(e.ESTATICO, "mundo", "cenas")
MANIFESTO = "mundo_cidade_cenas.js"
TETO_PNG, TETO_PASTA = 120 * 1024, 8 * 1024 * 1024


def ler(*partes):
    with open(os.path.join(*partes), "rb") as f:
        return f.read()


def sri(dados):
    return "sha256-" + base64.b64encode(hashlib.sha256(dados).digest()).decode()


def nomes():
    return sorted(os.listdir(PASTA))


def ids():
    return sorted({os.path.splitext(n)[0] for n in nomes()})


class Disco(unittest.TestCase):
    def test_pares_de_cidades_do_mundo(self):
        mundo = json.loads(ler(e.ESTATICO, "mundo", "mundo.json"))
        cidades = {c["id"] for c in mundo["cidades"] + mundo["exterior"] + mundo["niveis"]["brasil"]["medias"]}
        self.assertIn("recife", ids())
        self.assertEqual(nomes(), sorted(i + ext for i in ids() for ext in (".json", ".png")))
        for i in ids():
            self.assertIn(i, cidades)
            cena, png = json.loads(ler(PASTA, i + ".json")), ler(PASTA, i + ".png")
            self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n", i)
            self.assertEqual((cena["id"], cena["W"], cena["H"]), (i, *struct.unpack(">II", png[16:24])), i)

    def test_manifesto_igual_ao_disco(self):
        """Byte a byte: a ordem alfabética, a versão e o SRI dos dois arquivos, nada a mais nem a menos."""
        linhas = []
        for i in ids():
            png, cena = ler(PASTA, i + ".png"), ler(PASTA, i + ".json")
            linhas.append(f'  "{i}": Object.freeze({{ v: "{hashlib.sha256(png).hexdigest()[:12]}", '
                          f'png: "{sri(png)}", json: "{sri(cena)}" }}),\n')
        esperado = ('"use strict";\n// gerado por ferramentas/montar_cenas.py indice: não editar\n'
                    "const CidadeCenas = Object.freeze({\n" + "".join(linhas) + "});\nwindow.CidadeCenas = CidadeCenas;\n")
        self.assertEqual(ler(e.ESTATICO, MANIFESTO).decode(), esperado)

    def test_peso(self):
        total = 0
        for nome in nomes():
            dados = ler(PASTA, nome)
            total += len(dados)
            if nome.endswith(".png"):
                self.assertLessEqual(len(dados), TETO_PNG, nome)
                self.assertEqual(dados[25], 3, f"{nome}: PNG indexado (modo P)")
        self.assertLessEqual(total, TETO_PASTA)


# a cena sintética: uma calçada em L com um ramo que atravessa a rua, um tabuleiro de ponte e a volta do carro
FUNDO, CALCADA, ASFALTO, FAIXA, PONTE, JARDIM = range(6)
CORES = ["204020", "d0d0b0", "404050", "ffffff", "a08050", "308030"]
NOS = [[60, 100], [200, 100], [300, 100], [340, 100], [400, 100], [400, 250], [200, 150], [200, 170], [200, 200]]
ARESTAS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 6], [6, 7], [7, 8]]
PISTA = [[100, 160], [300, 160], [300, 280], [100, 280]]


def dados_sinteticos():
    return {
        "versao": 1, "id": "manaus", "W": 480, "H": 320,
        "texto": {"cena": "Cena de teste", "vida": "Um pedestre e um carro", "portaria": "na porta de teste"},
        "portaria": {"x": 60, "y": 100, "r": [50, 70, 70, 100], "placa": [60, 75], "farol": [60, 90]},
        "praca": {"x": 410, "y": 290, "r": [380, 260, 440, 300], "fonte": [20, 14]},
        "pontos": [{"x": 410, "y": 300, "r": [380, 260, 440, 300], "nome": "Praça"}],
        "calcadas": {"nos": [list(n) for n in NOS], "arestas": [list(a) for a in ARESTAS], "travessias": [6], "pontes": [2]},
        "pista": [list(p) for p in PISTA],
        "carros": [{"s": 0, "v": 10, "peca": "carro-1", "tamanho": [8, 4]}],
        "pedestres": [{"de": 0, "para": 1, "s": 0, "v": 10}],
        "oclusoes": [{"frente": [100, 80, 110, 105], "pes": [100, 90, 110, 105], "transparente": [CORES[1], CORES[0]]}],
        "cordoes": [], "luzes": [[240, 100, 8, 0.5]],
        "superficies": {"calcada": [CORES[1]], "faixa": [CORES[3]], "ponte": [CORES[4]], "asfalto": [CORES[2]]},
    }


def arte_sintetica():
    img = Image.new("P", (480, 320), FUNDO)
    img.putpalette([int(c[i:i + 2], 16) for c in CORES for i in (0, 2, 4)])
    g = ImageDraw.Draw(img)
    for (x0, y0), (x1, y1) in zip(PISTA, PISTA[1:] + PISTA[:1]):
        g.rectangle([min(x0, x1) - 6, min(y0, y1) - 6, max(x0, x1) + 6, max(y0, y1) + 6], fill=ASFALTO)
    for caixa in ([57, 97, 403, 103], [397, 97, 403, 253], [197, 100, 203, 153], [197, 167, 203, 203]):
        g.rectangle(caixa, fill=CALCADA)
    g.rectangle([300, 97, 340, 103], fill=PONTE)
    g.line([198, 151, 202, 151], fill=FAIXA)
    g.point((0, 319), fill=JARDIM)
    return img


@FERRAMENTA
class Validacao(unittest.TestCase):
    def raiz(self, mudar=None, pintar=None, salvar=None, indexar=True):
        pasta = tempfile.mkdtemp(prefix="cenas-raiz-")
        self.addCleanup(shutil.rmtree, pasta)
        cenas = os.path.join(pasta, "static", "mundo", "cenas")
        os.makedirs(cenas)
        dados, img = dados_sinteticos(), arte_sintetica()
        if mudar:
            mudar(dados)
        if pintar:
            pintar(ImageDraw.Draw(img))
        (salvar or (lambda im, arq: im.save(arq, optimize=True)))(img, os.path.join(cenas, "manaus.png"))
        with open(os.path.join(cenas, "manaus.json"), "w", encoding="utf-8") as f:
            json.dump(dados, f)
        if indexar:
            mc.indice(pasta)
        return pasta

    def violacoes(self, **k):
        return mc.validar("manaus", self.raiz(**k))[0]

    def reprova(self, regra, **k):
        achadas = self.violacoes(**k)
        self.assertTrue(any(v.startswith(regra + ":") for v in achadas), f"esperava {regra}, veio {achadas}")

    def test_cena_sintetica_limpa(self):
        self.assertEqual(mc.validar("manaus", self.raiz()), ([], []))

    def test_a1_png(self):
        self.reprova("A1", salvar=lambda im, arq: im.convert("RGB").save(arq))
        ruido = bytes(hashlib.sha256(str(i).encode()).digest()[0] % 6 for i in range(480 * 320))

        def pesado(im, arq):   # com 256 entradas na paleta, 8 bits por pixel
            grande = Image.frombytes("P", im.size, ruido)
            grande.putpalette((im.getpalette() + [0] * 768)[:768])
            grande.save(arq, compress_level=0)
        self.reprova("A1", salvar=pesado)
        self.reprova("A1", mudar=lambda d: d.update(W=482))
        raiz = self.raiz()
        with open(os.path.join(raiz, "static", "mundo", "cenas", "manaus.png"), "ab") as f:
            f.write(b" ")
        self.assertTrue(any(v.startswith("A1: ") and "manifesto" in v for v in mc.validar("manaus", raiz)[0]))
        self.assertTrue(any("manifesto" in v for v in self.violacoes(indexar=False)))

    def test_a2_pedestre_em_jardim_ou_na_rua(self):
        self.reprova("A2", pintar=lambda g: g.rectangle([120, 97, 130, 103], fill=JARDIM))
        self.reprova("A2", pintar=lambda g: g.rectangle([120, 97, 130, 103], fill=ASFALTO))
        # na travessia a rua vale; fora dela, não
        self.reprova("A2", mudar=lambda d: d["calcadas"].update(travessias=[]))

    def test_a2_tolerancia(self):
        def soltos(n):   # n pixels isolados fora, no eixo da calçada vertical
            return lambda g: [g.point((400, 105 + 4 * i), fill=JARDIM) for i in range(n)]
        self.assertEqual(self.violacoes(pintar=soltos(15)), [], "até 3% das amostras da cidade")
        self.reprova("A2", pintar=soltos(25))
        self.assertEqual(self.violacoes(pintar=lambda g: g.line([400, 120, 400, 121], fill=JARDIM)), [])
        self.reprova("A2", pintar=lambda g: g.line([400, 120, 400, 122], fill=JARDIM))

    def test_a2_oclusao_esconde_mas_nao_desculpa_a_aresta(self):
        def copa(x0, x1):
            return (lambda d: d["oclusoes"].append({"frente": [x0, 90, x1, 106], "pes": [x0, 90, x1, 106],
                                                     "transparente": [CORES[1], CORES[4]]}),
                    lambda g: g.rectangle([x0, 97, x1 - 1, 103], fill=JARDIM))
        mudar, pintar = copa(120, 140)
        self.assertEqual(self.violacoes(mudar=mudar, pintar=pintar), [], "o pé escondido não conta")
        self.reprova("A2", pintar=pintar)
        # fora da faixa dos pés ou com a cor transparente, a máscara do cliente não esconde
        self.reprova("A2", mudar=lambda d: (mudar(d), d["oclusoes"][-1].update(pes=[120, 110, 140, 120])), pintar=pintar)
        self.reprova("A2", mudar=lambda d: (mudar(d), d["oclusoes"][-1]["transparente"].append(CORES[5])), pintar=pintar)
        mudar, pintar = copa(302, 332)   # 30 das 41 amostras da aresta 2
        achadas = self.violacoes(mudar=mudar, pintar=pintar)
        self.assertTrue(any("aresta 2" in v and "escondidas" in v for v in achadas), achadas)

    def test_a3_pista(self):
        for y in (158, 160, 162):   # as duas paralelas e a central
            self.reprova("A3", pintar=lambda g: g.line([150, y, 160, y], fill=JARDIM))
        self.reprova("A3", pintar=lambda g: g.line([100, 220, 100, 230], fill=CALCADA))   # o trecho que fecha a volta
        self.assertEqual(self.violacoes(pintar=lambda g: g.line([150, 160, 151, 160], fill=JARDIM)), [])

    def test_a4_a_a9(self):
        casos = {
            "A4": [lambda d: d["portaria"].update(x=61), lambda d: d["portaria"].update(r=[55, 70, 65, 100]),
                   lambda d: d["portaria"].update(placa=[80, 75]), lambda d: d["portaria"].update(farol=[60, 105])],
            "A5": [lambda d: d.update(pontos=[]), lambda d: d["pontos"][0].update(nome=""),
                   lambda d: d["pontos"][0].update(r=[380, 260, 481, 300])],
            "A7": [lambda d: d["praca"].update(fonte=[80, 14])],
            "A8": [lambda d: d["calcadas"].update(arestas=d["calcadas"]["arestas"][:-1]),
                   lambda d: d["calcadas"]["nos"].__setitem__(8, [200, 171]), lambda d: d["carros"][0].update(s=1000),
                   lambda d: d["pedestres"][0].update(para=5), lambda d: d["pedestres"][0].update(s=500)],
            "A9": [lambda d: d["texto"].update(cena="<b>"), lambda d: d["texto"].update(vida="a" * 161),
                   lambda d: d["pontos"][0].update(nome="a\nb")],
        }
        for regra, mudancas in casos.items():
            for i, mudar in enumerate(mudancas):
                with self.subTest(regra=regra, caso=i):
                    self.reprova(regra, mudar=mudar)

    def test_a6_mascara_inutil_e_so_aviso(self):
        violacoes, avisos = mc.validar("manaus", self.raiz(
            mudar=lambda d: d["oclusoes"][0].update(frente=[10, 10, 20, 20], pes=[10, 10, 20, 20])))
        self.assertEqual(violacoes, [])
        self.assertTrue(avisos and avisos[0].startswith("A6:"), avisos)

    def test_superficies_obrigatorias(self):
        for mudar in (lambda d: d.pop("superficies"), lambda d: d["superficies"].pop("faixa"),
                      lambda d: d["superficies"].update(calcada=[]), lambda d: d["superficies"].update(asfalto=[]),
                      lambda d: d["superficies"]["ponte"].append("123456"), lambda d: d["superficies"].update(faixa=["FFF"])):
            self.reprova("superficies", mudar=mudar)

    def test_esquema_igual_ao_do_cliente(self):
        self.reprova("esquema", mudar=lambda d: d["carros"][0].update(v=41))
        self.reprova("esquema", mudar=lambda d: d.update(versao=2))
        self.assertTrue(mc.validar("salvador", self.raiz())[0], "sem os arquivos, reprova")

    def test_saidas_da_autoria(self):
        raiz = self.raiz()
        with tempfile.TemporaryDirectory() as saida:
            mc.paleta("manaus", saida, raiz)
            mc.revisar("manaus", saida, raiz)
            mc.sugerir("manaus", saida, raiz)
            for nome in ("paleta", "revisao", "revisao-noite", "sugestao"):
                with Image.open(os.path.join(saida, f"manaus-{nome}.png")) as im:
                    self.assertGreater(min(im.size), 150, nome)
            with Image.open(os.path.join(saida, "manaus-revisao.png")) as im:
                self.assertEqual(im.size, (1440, 960))
                self.assertEqual(im.getpixel((120 * 3 + 1, 100 * 3 + 1))[:3], (0, 255, 0), "a calçada em verde")
            with Image.open(os.path.join(saida, "manaus-revisao-noite.png")) as im:
                self.assertGreater(sum(im.getpixel((720, 300))[:3]), sum(im.getpixel((660, 300))[:3]), "a luz acesa")
                self.assertLess(sum(im.getpixel((120 * 3, 300))[:3]), 3 * 0xb0, "a arte escurecida")
            with open(os.path.join(saida, "manaus-sugestao.json"), encoding="utf-8") as f:
                s = json.load(f)
        nos, arestas = s["calcadas"]["nos"], s["calcadas"]["arestas"]
        for alvo in ((60, 100), (200, 100), (400, 100), (400, 250), (200, 200)):
            self.assertLessEqual(min(abs(x - alvo[0]) + abs(y - alvo[1]) for x, y in nos), 10, (alvo, nos))
        self.assertTrue(all(0 <= i < len(nos) and 0 <= j < len(nos) and i != j for i, j in arestas))
        self.assertTrue(s["calcadas"]["pontes"])
        self.assertTrue(4 <= len(s["pista"]) <= 64, s["pista"])
        for alvo in PISTA:
            self.assertLessEqual(min(abs(x - alvo[0]) + abs(y - alvo[1]) for x, y in s["pista"]), 16, (alvo, s["pista"]))
        for dentro in (e.ESTATICO, os.path.join(raiz, "saida")):
            with self.assertRaises(mc.Erro):
                mc.paleta("manaus", dentro, raiz)


@FERRAMENTA
class Importar(unittest.TestCase):
    def setUp(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        self.raiz, self.base = os.path.join(pasta.name, "repo"), os.path.join(pasta.name, "arte")
        for p in (("static", "mundo", "cenas"), ("arte", "pixellab", "mundo")):
            os.makedirs(os.path.join(self.raiz, *p))
        shutil.copy(os.path.join(e.ESTATICO, "mundo", "mundo.json"), os.path.join(self.raiz, "static", "mundo"))
        self.proveniencia = os.path.join(self.raiz, "arte", "pixellab", "mundo", "PROVENIENCIA-cidades.md")
        with open(self.proveniencia, "w", encoding="utf-8") as f:
            f.write("# Proveniência\n")
        os.makedirs(os.path.join(self.base, "raw"))
        os.makedirs(os.path.join(self.base, "trabalho"))

    def bruto(self, nome="manaus-pixen-480x320.png", tamanho=(480, 320), cores=40, semente=0):
        im = Image.new("RGBA", tamanho)
        im.putdata([(i % cores % 256, semente, i % cores // 256, 255) for i in range(tamanho[0] * tamanho[1])])
        im.putpixel((0, 0), (9, 9, 9, 0))   # transparente com cor, e um meio transparente
        im.putpixel((1, 0), (1, 2, 3, 128))
        arq = os.path.join(self.base, "raw", nome)
        im.save(arq)
        return arq

    def test_indexado_sem_perda_e_deterministico(self):
        bruto = self.bruto()
        mc.importar("manaus", bruto, self.raiz)
        saida = os.path.join(self.raiz, "static", "mundo", "cenas", "manaus.png")
        primeiro = ler(saida)
        mc.importar("manaus", bruto, self.raiz)
        self.assertEqual(ler(saida), primeiro)
        with Image.open(saida) as a, Image.open(bruto) as b:
            self.assertEqual(a.mode, "P")
            self.assertEqual(a.convert("RGBA").tobytes(), b.convert("RGBA").tobytes())
        self.assertLessEqual({m.decode() for m in re.findall(rb"(?:IHDR|PLTE|tRNS|IDAT|IEND|tEXt|zTXt|iTXt|pHYs|tIME|iCCP|gAMA)", primeiro)},
                             {"IHDR", "PLTE", "tRNS", "IDAT", "IEND"})
        texto = ler(self.proveniencia).decode()
        self.assertEqual(texto.count("| `manaus` |"), 1, "o mesmo bruto, uma linha só")
        self.assertIn(f"`manaus-pixen-480x320.png` | `{hashlib.sha256(ler(bruto)).hexdigest()}`", texto)
        mc.importar("manaus", self.bruto(semente=1), self.raiz)
        self.assertEqual(ler(self.proveniencia).decode().count("| `manaus` |"), 2)

    def test_recusas(self):
        casos = [("manaus", {"cores": 300}), ("manaus", {"tamanho": (400, 320)}), ("manaus", {"tamanho": (480, 500)}),
                 ("atlantida", {}), ("../manaus", {}), ("manaus", {"nome": "manaus-pixen-480x320-retry.png"})]
        for cidade, opcoes in casos:
            with self.subTest(cidade=cidade, opcoes=opcoes), self.assertRaises(mc.Erro):
                mc.importar(cidade, self.bruto(**opcoes), self.raiz)
        self.assertEqual(os.listdir(os.path.join(self.raiz, "static", "mundo", "cenas")), [])
        self.assertEqual(ler(self.proveniencia).decode(), "# Proveniência\n")

    def test_escolhas_manda(self):
        with open(os.path.join(self.base, "trabalho", "escolhas.json"), "w", encoding="utf-8") as f:
            json.dump({"manaus": "manaus-pixen-480x320-retry.png"}, f)
        with self.assertRaises(mc.Erro):
            mc.importar("manaus", self.bruto(), self.raiz)
        mc.importar("manaus", self.bruto("manaus-pixen-480x320-retry.png"), self.raiz)


@FERRAMENTA
class Cidades(unittest.TestCase):
    def test_toda_cidade_do_manifesto_passa(self):
        for i in ids():
            with self.subTest(cidade=i):
                self.assertEqual(mc.validar(i)[0], [])

    def test_indice_reproduz_o_manifesto(self):
        self.assertEqual(mc.indice_texto().encode(), ler(e.ESTATICO, MANIFESTO))

    def test_comando(self):
        with contextlib.redirect_stdout(io.StringIO()) as saida:
            self.assertEqual(mc.main(["validar", "recife"]), 0)
            self.assertEqual(mc.main(["validar"]), 0)
            self.assertEqual(mc.main(["validar", "atlantida"]), 1)
        self.assertIn("recife: ok", saida.getvalue())


class Servidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pasta = tempfile.TemporaryDirectory()
        cls.srv = e.Servidor(("127.0.0.1", 0), e.Pagina)
        cls.srv.leitor, cls.srv.cred, cls.srv.acesso = None, None, acesso.Acesso(cls.pasta.name)
        codigo = ler(cls.pasta.name, "codigo-primeiro-acesso.txt").decode().strip()
        cls.srv.acesso.criar_primeiro(codigo, "dono", "senha-bem-grande")
        cls.cookie = f"{e.nome_cookie()}={cls.srv.acesso.entrar('dono', 'senha-bem-grande')}"
        cls.thread = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.thread.join()
        cls.pasta.cleanup()

    def pedir(self, rota, cookie=None):
        conexao = http.client.HTTPConnection(*self.srv.server_address, timeout=3)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                conexao.request("GET", rota, headers={"Cookie": cookie} if cookie else {})
                resposta = conexao.getresponse()
                return resposta.status, resposta, resposta.read()
        finally:
            conexao.close()

    def test_lista_publica_exata(self):
        disco = {"mundo/cenas/" + n for n in nomes()}
        for lista in (e.ARQUIVOS, e.PUBLICOS):
            self.assertEqual({n for n in lista if n.startswith("mundo/cenas/")}, disco)
            self.assertIn(MANIFESTO, lista)
            self.assertNotIn("mundo/recife.png", lista)
        self.assertFalse(os.path.exists(os.path.join(e.ESTATICO, "mundo", "recife.png")))
        for nome in disco:
            self.assertEqual(e.ARQUIVOS[nome], "image/png" if nome.endswith(".png") else "application/json")

    def test_varredura_fechada(self):
        for nome in ("recife.png", "recife.json", "belo-horizonte.png", "sao-jose-2.json"):
            self.assertIsNotNone(e._CENA.fullmatch(nome), nome)
        for nome in ("Recife.png", "recife.PNG", "recife.png.bak", "recife", "recife.js", "-recife.png", "recife-.png",
                     "a--b.json", "a_b.png", ".recife.png", "../mundo.json", "a/b.png", "recife.png\n"):
            self.assertIsNone(e._CENA.fullmatch(nome), repr(nome))

    def test_cenas_sem_cookie(self):
        casos = [("mundo/cenas/" + n, "image/png" if n.endswith(".png") else "application/json") for n in nomes()]
        for nome, tipo in casos + [(MANIFESTO, "text/javascript; charset=utf-8")]:
            status, resposta, corpo = self.pedir("/" + nome)
            self.assertEqual((status, resposta.getheader("Content-Type")), (200, tipo), nome)
            self.assertIsNone(resposta.getheader("Set-Cookie"), nome)
            self.assertEqual(resposta.getheader("Cache-Control"),
                             "public, max-age=3600" if nome.endswith(".png") else "no-cache", nome)
            self.assertEqual(corpo, ler(e.ESTATICO, nome), nome)

    def test_fora_da_lista(self):
        for rota in ("/mundo/cenas/../mundo.json", "/mundo/cenas/%2e%2e/mundo.json", "/mundo/cenas/recife.PNG",
                     "/mundo/cenas/", "/mundo/cenas/recife.png.bak", "/mundo/recife.png"):
            self.assertEqual(self.pedir(rota, self.cookie)[0], 404, rota)
            status, resposta, _ = self.pedir(rota)   # sem sessão, o de sempre: vai para a tela de entrar
            self.assertEqual((status, resposta.getheader("Location")), (302, "/entrar"), rota)


if __name__ == "__main__":
    unittest.main()
