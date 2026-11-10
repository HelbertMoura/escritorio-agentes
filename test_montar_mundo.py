"""Mundo vivo: dados de entrada (arte/mundo/cidades.json) e a montagem (ferramentas/montar_mundo.py).
Uso: python -B -I -m unittest discover -p "test_montar_mundo.py"
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.abspath(__file__))
CIDADES = os.path.join(RAIZ, "arte", "mundo", "cidades.json")
sys.path.insert(0, os.path.join(RAIZ, "ferramentas"))  # com -I a pasta não entra sozinha no sys.path

UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
       "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
ARTE = os.path.join(RAIZ, "arte", "pixellab", "mundo")
MARCOS = {"rio-de-janeiro": "cristo", "belo-horizonte": "pampulha", "sao-paulo": "paulista", "brasilia": "congresso",
          "salvador": "pelourinho", "manaus": "teatro-amazonas", "belem": "ver-o-peso", "florianopolis": "hercilio-luz",
          "porto-alegre": "mercado-publico", "mateus-leme": "matriz-mateus-leme",
          "rio-branco": "palacio-rio-branco", "maceio": "jangada", "macapa": "fortaleza-macapa",
          "fortaleza": "catedral-fortaleza", "vitoria": "convento-penha", "goiania": "tres-racas",
          "sao-luis": "casarao-azulejos", "cuiaba": "igreja-rosario", "campo-grande": "obelisco",
          "joao-pessoa": "farol-cabo-branco", "curitiba": "jardim-botanico", "recife": "recife-antigo",
          "teresina": "ponte-estaiada", "natal": "forte-reis-magos", "porto-velho": "tres-caixas-dagua",
          "boa-vista": "garimpeiro", "aracaju": "arcos-atalaia", "palmas": "palacio-araguaia"}
# as peças que toda cidade pode usar; carros e mobiliário entram no atlas já na metade do desenho
GENERICOS = ({f"predios-{i}" for i in range(1, 7)} | {f"chale-{i}" for i in range(1, 9)}
             | {f"arvore-{i}" for i in range(1, 4)} | {f"carro-{i}" for i in range(1, 5)} | {"aviao-1", "aviao-2"}
             | {"praca-1", "banca-1", "ponto-onibus-1", "carrinho-1", "banco-poste-1"})
# peças de festa que podem faltar na arte: entram no atlas quando existem, na metade como o mobiliário
OPCIONAIS = {"festa-arvore-natal", "festa-fogueira", "festa-barraca-junina", "festa-abobora", "festa-ovo-pascoa",
             "festa-carro-alegorico", "festa-palco-anonovo"}
METADE = {"carro-1", "carro-2", "carro-3", "carro-4", "banca-1", "ponto-onibus-1", "carrinho-1", "banco-poste-1"} | OPCIONAIS
# as miniaturas do mapa do Brasil: uma por marco e as dos dois aviões
MINIS = {"mini-" + m for m in MARCOS.values()} | {"mini-aviao-1", "mini-aviao-2"}
BIOMAS = {"amazonia", "cerrado", "caatinga", "pantanal", "mata-atlantica", "pampa"}
# um ponto bem dentro de cada bioma (lat, lon): ali o desenho tem de ser o do bioma
NO_BIOMA = {"amazonia": (-5.0, -64.0), "cerrado": (-13.0, -46.5), "caatinga": (-6.5, -39.8),
            "pantanal": (-18.5, -56.8), "mata-atlantica": (-22.8, -51.0), "pampa": (-31.0, -54.0)}
SERRAS = {"serra-do-mar", "mantiqueira", "espinhaco", "chapada-diamantina", "serra-geral", "guianas", "andes"}


class Cidades(unittest.TestCase):
    def test_cidades_validas(self):
        with open(CIDADES, encoding="utf-8") as f:
            cidades = json.load(f)
        self.assertEqual(len(cidades), 28)

        ids = [c["id"] for c in cidades]
        self.assertEqual(len(set(ids)), 28)
        for c in cidades:
            self.assertEqual(set(c), {"id", "nome", "uf", "lat", "lon", "marco"}, c["id"])
            self.assertRegex(c["id"], r"^[a-z-]+$")
            self.assertTrue(c["nome"].strip(), c["id"])
            self.assertTrue(-34 <= c["lat"] <= 6, c["id"])
            self.assertTrue(-74 <= c["lon"] <= -34, c["id"])
            self.assertRegex(c["marco"], r"^[a-z-]+$")   # as 28 têm marco

        por_id = {c["id"]: c for c in cidades}
        self.assertEqual({c["uf"] for c in cidades}, UFS)
        self.assertEqual(por_id["mateus-leme"]["uf"], "MG")
        self.assertEqual({c["id"]: c["marco"] for c in cidades}, MARCOS)

    def test_todo_marco_tem_arte(self):
        for cid, marco in MARCOS.items():
            self.assertTrue(os.path.isfile(os.path.join(ARTE, f"marco-{marco}.png")), cid)

    def test_biomas_e_serras_validos(self):
        """biomas.json: os seis biomas, cada um com um polígono em (lon, lat) perto da caixa do mapa; serras.json: as
        serras pedidas, cada uma uma linha de dois pontos ou mais, com a neve só nos Andes."""
        dentro = lambda lon, lat: -80 <= lon <= -28 and -40 <= lat <= 12
        with open(os.path.join(RAIZ, "arte", "mundo", "biomas.json"), encoding="utf-8") as f:
            biomas = json.load(f)
        self.assertEqual({b["id"] for b in biomas["biomas"]}, BIOMAS)
        for b in biomas["biomas"] + list(biomas["extras"].values()):
            pontos = b["poligono"]
            self.assertGreaterEqual(len(pontos), 3)
            self.assertTrue(all(len(p) == 2 and dentro(*p) for p in pontos), b.get("id"))
        self.assertIn("araucarias", biomas["extras"])
        with open(os.path.join(RAIZ, "arte", "mundo", "serras.json"), encoding="utf-8") as f:
            serras = json.load(f)
        self.assertEqual({s["id"] for s in serras}, SERRAS)
        for s in serras:
            self.assertTrue(s["nome"].strip())
            self.assertIn(s["tipo"], {"verde", "rocha", "neve"})
            for linha in s["linhas"]:
                self.assertGreaterEqual(len(linha), 2, s["id"])
                self.assertTrue(all(len(p) == 2 and dentro(*p) for p in linha), s["id"])
        self.assertEqual({s["id"] for s in serras if s["tipo"] == "neve"}, {"andes"})
        self.assertTrue(any(p.get("nome") == "Pico da Neblina" for s in serras for p in s.get("picos", [])))

    def test_rios_recortados(self):
        """O recorte dos rios do Natural Earth: só linhas na caixa do mapa (com 1° de folga), com os três rios largos."""
        with open(os.path.join(RAIZ, "arte", "mundo", "fontes", "ne_50m_rivers_lake_centerlines.geojson"),
                  encoding="utf-8") as f:
            rios = json.load(f)["features"]
        nomes = set()
        for r in rios:
            g = r["geometry"]
            self.assertEqual(g["type"], "MultiLineString")
            for linha in g["coordinates"]:
                self.assertGreaterEqual(len(linha), 2)
                self.assertTrue(all(-75 <= lon <= -33 and -35 <= lat <= 7 for lon, lat in linha))
            nomes.add(" ".join(r["properties"]["name"].split()))
        self.assertTrue({"Amazonas", "Paraná", "São Francisco", "Tocantins", "Negro"} <= nomes, nomes)


class Preencher(unittest.TestCase):
    def test_preencher_quadrado(self):
        import montar_mundo
        feitos = montar_mundo.preencher([(1, 1), (4, 1), (4, 4), (1, 4)], 6, 6)
        self.assertEqual(feitos, {(x, y) for x in range(1, 4) for y in range(1, 4)})

    def test_preencher_concavo(self):
        import montar_mundo
        # "U" aberto para cima: hastes em x 1..2 e 4..5, fundo em y 4..5
        u = [(1, 1), (2, 1), (2, 4), (4, 4), (4, 1), (5, 1), (5, 5), (1, 5)]
        feitos = montar_mundo.preencher(u, 6, 6)
        self.assertNotIn((2, 2), feitos)
        self.assertNotIn((3, 2), feitos)  # meio da abertura
        self.assertIn((1, 2), feitos)
        self.assertIn((4, 2), feitos)
        self.assertIn((3, 4), feitos)  # fundo do U
        self.assertEqual(len(feitos), 3 + 3 + 4)

    def test_para_pixel(self):
        import montar_mundo
        self.assertEqual(montar_mundo.para_pixel(-19.92, -43.94, montar_mundo.CAIXA_BRASIL, 400, 400), (300, 259))


class Montagem(unittest.TestCase):
    """Roda ferramentas/montar_mundo.py como processo, igual ao uso real. Com -I o teste não vê o Pillow
    do site-packages do usuário; o processo filho (sem -I) vê."""
    SCRIPT = os.path.join(RAIZ, "ferramentas", "montar_mundo.py")
    ENTRADA = os.path.join(RAIZ, "arte", "mundo")

    @classmethod
    def setUpClass(cls):
        if subprocess.run([sys.executable, "-c", "import PIL"], capture_output=True).returncode:
            raise unittest.SkipTest("Pillow ausente: a montagem do mundo precisa dele (pip install pillow)")
        cls.pastas = [tempfile.mkdtemp() for _ in range(3)]
        cls.montar(cls.pastas[0])
        with open(os.path.join(cls.pastas[0], "mundo.json"), encoding="utf-8") as f:
            cls.mundo = json.load(f)

    @classmethod
    def tearDownClass(cls):
        for p in cls.pastas:
            shutil.rmtree(p, ignore_errors=True)

    @classmethod
    def cores(cls, pontos, nome="brasil.png"):
        """Cor '#rrggbb' de cada (x, y) do PNG montado (brasil.png ou terra.png), lida pelo Pillow no processo filho."""
        ler = ("import json, sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert('RGB')\n"
               "print(json.dumps(['#%02x%02x%02x' % im.getpixel(tuple(p)) for p in json.loads(sys.stdin.read())]))")
        r = subprocess.run([sys.executable, "-c", ler, os.path.join(cls.pastas[0], nome)], input=json.dumps(pontos),
                           capture_output=True, text=True, timeout=60)
        if r.returncode:
            raise AssertionError(r.stderr)
        return json.loads(r.stdout)

    @classmethod
    def montar(cls, pasta):
        r = subprocess.run([sys.executable, "-B", cls.SCRIPT, cls.ENTRADA, pasta], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        if r.returncode:
            raise AssertionError(r.stderr)

    def sha(self, pasta, nome):
        with open(os.path.join(pasta, nome), "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    def test_deterministico(self):
        self.montar(self.pastas[1])
        for nome in ("brasil.png", "terra.png", "mundo.json", "atlas.png", "atlas.json"):
            self.assertEqual(self.sha(self.pastas[0], nome), self.sha(self.pastas[1], nome), nome)

    def atlas(self, arte, pasta):
        """Roda só montar_atlas() com a arte de `arte`, grava em `pasta` e devolve o atlas.json."""
        montar = ("import json, sys\nsys.path.insert(0, sys.argv[1])\nimport montar_mundo as mm\n"
                  "mm.montar_atlas(sys.argv[2], mm.ler(sys.argv[3]), sys.argv[4])")
        r = subprocess.run([sys.executable, "-B", "-c", montar, os.path.join(RAIZ, "ferramentas"), arte, CIDADES, pasta],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        if r.returncode:
            raise AssertionError(r.stderr)
        with open(os.path.join(pasta, "atlas.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_atlas_deterministico(self):
        """O atlas sai igual a cada montagem, com as peças pedidas, cada uma dentro da imagem e sem sobrepor outra."""
        pasta = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, pasta, True)
        atlas = self.atlas(ARTE, pasta)
        for nome in ("atlas.png", "atlas.json"):
            self.assertEqual(self.sha(self.pastas[0], nome), self.sha(pasta, nome), nome)
        marcos = {"marco-" + m for m in MARCOS.values()}   # as 28 cidades: todo marco tem quadro no atlas
        self.assertEqual(len(marcos), 28)
        self.assertEqual(set(atlas), {"versao", "quadros"})
        self.assertIsInstance(atlas["versao"], int)
        presentes = {n for n in OPCIONAIS if os.path.exists(os.path.join(ARTE, n + ".png"))}
        self.assertEqual(set(atlas["quadros"]), marcos | GENERICOS | presentes | MINIS)
        with open(os.path.join(pasta, "atlas.png"), "rb") as f:
            cabeca = f.read(24)
        largura, altura = int.from_bytes(cabeca[16:20], "big"), int.from_bytes(cabeca[20:24], "big")
        caixas = list(atlas["quadros"].values())
        for x, y, w, h in caixas:
            self.assertTrue(w > 0 and h > 0 and x >= 0 and y >= 0 and x + w <= largura and y + h <= altura, (x, y, w, h))
        for i, (x, y, w, h) in enumerate(caixas):
            for a, b, c, d in caixas[i + 1:]:
                self.assertFalse(x < a + c and a < x + w and y < b + d and b < y + h, ((x, y, w, h), (a, b, c, d)))

    def test_atlas_sem_marco_usa_generico(self):
        """Marco sem arte não derruba a montagem: ele fica fora do atlas, e a cidade usa os prédios genéricos."""
        arte, pasta = tempfile.mkdtemp(), tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, arte, True)
        self.addCleanup(shutil.rmtree, pasta, True)
        origem = os.path.join(RAIZ, "arte", "pixellab", "mundo")
        for nome in os.listdir(origem):
            if nome != "marco-cristo.png":
                shutil.copy(os.path.join(origem, nome), arte)
        quadros = self.atlas(arte, pasta)["quadros"]
        self.assertNotIn("marco-cristo", quadros)
        self.assertNotIn("mini-cristo", quadros)   # sem a arte, o mapa usa o ícone genérico
        self.assertIn("marco-pampulha", quadros)
        self.assertIn("mini-pampulha", quadros)
        self.assertTrue(GENERICOS <= set(quadros))
        # sem uma peça genérica (que toda cidade usa), a montagem para com erro
        os.remove(os.path.join(arte, "predios-2.png"))
        with self.assertRaises(AssertionError) as erro:
            self.atlas(arte, pasta)
        self.assertIn("predios-2", str(erro.exception))

    def test_atlas_com_e_sem_pecas_opcionais(self):
        """As peças de festa são opcionais: com a arte, entram no atlas (na metade, test_atlas_na_escala_final); sem
        nenhuma, ou só com uma, a montagem segue sem erro e o resto do atlas não muda."""
        with open(os.path.join(self.pastas[0], "atlas.json"), encoding="utf-8") as f:
            completo = json.load(f)["quadros"]
        self.assertTrue(OPCIONAIS <= set(completo), "a arte das festas está em arte/pixellab/mundo")
        self.assertNotIn("onibus-1", completo)   # o ônibus saiu da cidade (fica só o ponto)
        arte, pasta = tempfile.mkdtemp(), tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, arte, True)
        self.addCleanup(shutil.rmtree, pasta, True)
        for nome in os.listdir(ARTE):
            if nome[:-4] not in OPCIONAIS or nome == "festa-fogueira.png":
                shutil.copy(os.path.join(ARTE, nome), arte)
        quadros = self.atlas(arte, pasta)["quadros"]
        self.assertEqual(set(quadros) & OPCIONAIS, {"festa-fogueira"})
        os.remove(os.path.join(arte, "festa-fogueira.png"))
        quadros = self.atlas(arte, pasta)["quadros"]
        self.assertEqual(set(quadros), set(completo) - OPCIONAIS)

    def test_atlas_na_escala_final(self):
        """Carros e mobiliário entram no atlas na metade da arte (o navegador desenha 1:1); o resto, inteiro. O alfa
        do atlas inteiro fica binário (pixel nítido, sem borda translúcida)."""
        with open(os.path.join(self.pastas[0], "atlas.json"), encoding="utf-8") as f:
            quadros = json.load(f)["quadros"]
        medir = ("import json, os, sys\nfrom PIL import Image\nat = Image.open(sys.argv[1]).convert('RGBA')\n"
                 "alfa = sorted(set(at.getchannel('A').tobytes()))\ntam = {}\n"
                 "for nome in json.loads(sys.argv[3]):\n"
                 "    im = Image.open(os.path.join(sys.argv[2], nome + '.png')).convert('RGBA')\n"
                 "    x0, y0, x1, y1 = im.getchannel('A').getbbox()\n    tam[nome] = [x1 - x0, y1 - y0]\n"
                 "print(json.dumps([alfa, tam]))")
        presentes = {n for n in OPCIONAIS if os.path.exists(os.path.join(ARTE, n + ".png"))}
        r = subprocess.run([sys.executable, "-c", medir, os.path.join(self.pastas[0], "atlas.png"), ARTE,
                            json.dumps(sorted(GENERICOS | presentes))], capture_output=True, text=True, timeout=60)
        if r.returncode:
            raise AssertionError(r.stderr)
        alfa, tam = json.loads(r.stdout)
        self.assertEqual(alfa, [0, 255])
        for nome in MINIS:   # as miniaturas do mapa: 28 a 36 px de tela a 1x (1 px da arte por px de CSS)
            w, h = quadros[nome][2:]
            if nome.startswith("mini-aviao"):
                self.assertTrue(18 <= max(w, h) <= 24, (nome, w, h))
            else:
                self.assertTrue(26 <= max(w, h) <= 36 and min(w, h) >= 14, (nome, w, h))
        for nome, (w, h) in tam.items():
            qw, qh = quadros[nome][2:]
            if nome in METADE:   # metade arredondada para cima; o recorte do alfa pode tirar uma linha da borda
                self.assertTrue((w + 1) // 2 - 1 <= qw <= (w + 1) // 2 and (h + 1) // 2 - 1 <= qh <= (h + 1) // 2,
                                (nome, w, h, qw, qh))
            else:
                self.assertEqual([qw, qh], [w, h], nome)

    def test_rotas(self):
        rotas = self.mundo["rotas"]
        ids = {c["id"] for c in self.mundo["cidades"]}
        self.assertTrue(0 < len(rotas) <= 40)
        for a, b in rotas:
            self.assertNotEqual(a, b)
            self.assertIn(a, ids)
            self.assertIn(b, ids)
        self.assertEqual(len({frozenset(r) for r in rotas}), len(rotas))  # sem rota repetida

    def test_mundo_json(self):
        self.assertIsInstance(self.mundo["versao"], int)
        brasil = self.mundo["niveis"]["brasil"]
        self.assertEqual(set(self.mundo["niveis"]), {"brasil"})
        self.assertEqual({k: brasil[k] for k in ("w", "h", "caixa")}, {"w": 400, "h": 400, "caixa": [-74.0, -34.0, -34.0, 6.0]})
        # as células de 0,5° do Brasil, para o globo (80 linhas de 80, de lat 6 para baixo e de lon −74 para a direita)
        celulas = brasil["celulas"]
        self.assertEqual(set(brasil), {"w", "h", "caixa", "celulas"})
        self.assertEqual(len(celulas), 80)
        self.assertTrue(all(len(l) == 80 and set(l) <= {"0", "1"} for l in celulas))
        celula = lambda lat, lon: celulas[int((6 - lat) * 2)][int((lon + 74) * 2)]
        self.assertEqual(celula(-15.8, -47.9), "1")   # Brasília
        self.assertEqual(celula(-3.1, -60.0), "1")    # Manaus
        self.assertEqual(celula(-23.0, -58.0), "0")   # Paraguai
        self.assertEqual(celula(-20.0, -36.0), "0")   # mar
        self.assertEqual(celula(-12.0, -70.0), "0")   # Peru, logo ao sul do Acre
        self.assertTrue(2600 <= "".join(celulas).count("1") <= 3200, "".join(celulas).count("1"))
        self.assertEqual(len(self.mundo["cidades"]), 28)
        bh = next(c for c in self.mundo["cidades"] if c["id"] == "belo-horizonte")
        self.assertEqual((bh["x"], bh["y"]), (300, 259))
        for c in self.mundo["cidades"]:
            self.assertEqual(set(c), {"id", "nome", "uf", "lat", "lon", "x", "y", "marco"})
        for nome, tamanho in (("brasil.png", (400, 400)), ("terra.png", (720, 360))):
            with open(os.path.join(self.pastas[0], nome), "rb") as f:
                cabeca = f.read(24)
            self.assertEqual(cabeca[1:4], b"PNG", nome)
            self.assertEqual((int.from_bytes(cabeca[16:20], "big"), int.from_bytes(cabeca[20:24], "big")), tamanho, nome)

    def test_cidades_em_terra(self):
        import montar_mundo as mm
        import mundo_terreno as mt
        # em terra: nenhuma cor de mar (o rio pode passar no ponto da cidade, como em Manaus: a miniatura fica por cima)
        agua = {mt.CORES[n] for n in mt.AGUA if not n.startswith("rio")}
        cidades = self.mundo["cidades"]
        for c, cor in zip(cidades, self.cores([[c["x"], c["y"]] for c in cidades])):
            self.assertIn(cor, set(mt.CORES.values()) - agua, c["id"])
            x0, y0 = mm.para_pixel(c["lat"], c["lon"], mm.CAIXA_BRASIL, 400, 400)
            self.assertLessEqual((c["x"] - x0) ** 2 + (c["y"] - y0) ** 2, 36, c["id"])
        movidas = {c["id"] for c in cidades
                   if (c["x"], c["y"]) != mm.para_pixel(c["lat"], c["lon"], mm.CAIXA_BRASIL, 400, 400)}
        self.assertTrue({"belem", "recife", "rio-de-janeiro", "florianopolis"} <= movidas, movidas)

    def janela(self, lat, lon, r):
        """As cores da janela (2r+1)² em volta de (lat, lon) no brasil.png."""
        import montar_mundo as mm
        x, y = mm.para_pixel(lat, lon, mm.CAIXA_BRASIL, 400, 400)
        return self.cores([[i, j] for j in range(y - r, y + r + 1) for i in range(x - r, x + r + 1)
                           if 0 <= i < 400 and 0 <= j < 400])

    def test_vizinhos_apagados(self):
        """Os vizinhos usam a mesma linguagem do Brasil em tons apagados; o Brasil, os tons cheios."""
        import mundo_terreno as mt
        apagadas, cheias = mt.cores_apagadas(), set(mt.CORES.values()) - mt.cores_apagadas()
        for lat, lon in ((-23.0, -58.0), (-3.0, -72.0), (-31.5, -56.5), (4.0, -58.5)):   # Paraguai, Peru, Uruguai, Guiana
            cores = self.janela(lat, lon, 3)
            self.assertGreaterEqual(sum(c in apagadas for c in cores) / len(cores), 0.9, (lat, lon))
        cores = self.janela(-13.0, -56.0, 3)   # Mato Grosso
        self.assertGreaterEqual(sum(c in cheias for c in cores) / len(cores), 0.9)

    def test_cada_bioma_no_seu_lugar(self):
        """No meio de cada bioma, a maior parte dos pixels é das cores dele (os seis aparecem, cada um no seu canto)."""
        import mundo_terreno as mt
        for bioma, (lat, lon) in NO_BIOMA.items():
            cores, dele = self.janela(lat, lon, 5), mt.cores_do_bioma(bioma)
            self.assertGreaterEqual(sum(c in dele for c in cores) / len(cores), 0.5, bioma)
            for outro in BIOMAS - {bioma}:   # as paletas não se confundem
                self.assertFalse(dele & mt.cores_do_bioma(outro), (bioma, outro))

    def test_rios_e_mar(self):
        """Há rios (o Amazonas com 2 px perto de Óbidos), areia na costa e um mar com textura, não liso."""
        import mundo_terreno as mt
        rio = mt.CORES["rio"]
        self.assertGreaterEqual(sum(c == rio for c in self.janela(-1.95, -55.5, 3)), 6, "Amazonas largo")
        tudo = self.janela(-14.0, -54.0, 200)
        self.assertGreater(sum(c == rio for c in tudo), 1500)
        self.assertGreater(sum(c == mt.CORES["areia"] for c in tudo), 300)
        alto_mar = self.janela(-22.0, -37.0, 12)
        self.assertGreaterEqual(len(set(alto_mar)), 2, "o mar fundo tem textura")
        self.assertTrue(set(alto_mar) <= {mt.CORES[n] for n in mt.AGUA}, set(alto_mar))

    def test_borda_irregular(self):
        """A borda da caixa não é moldura: os 2 px de fora são do mar de fora da imagem (a cor que o navegador pinta além
        dela) e a terra some a uma distância que varia ao longo da borda (ruído), não numa linha reta."""
        import mundo_terreno as mt
        fora = mt.CORES[mt.FORA]
        with open(os.path.join(RAIZ, "static", "mundo_mapa.js"), encoding="utf-8") as f:
            self.assertIn(f'MAR = "{fora}"', f.read())
        borda = [[x, y] for y in range(400) for x in (0, 1, 398, 399)] + [[x, y] for x in range(400) for y in (0, 1, 398, 399)]
        self.assertEqual(set(self.cores(borda)), {fora})
        agua = {mt.CORES[n] for n in mt.AGUA}
        for linhas in ((range(60, 340), lambda j, i: [i, j]), (range(30, 160), lambda j, i: [j, i])):   # borda oeste e norte
            fundo = []
            for j in linhas[0][::4]:
                cores = self.cores([linhas[1](j, i) for i in range(0, 40)])
                fundo.append(next((i for i, c in enumerate(cores) if c not in agua), 40))
            terra = [d for d in fundo if d < 40]
            self.assertGreater(len(terra), 10)
            self.assertGreaterEqual(max(terra) - min(terra), 6, terra)

    def test_barcos_rosa_e_oceano_no_mar(self):
        """As rotas dos barcos, a rosa dos ventos e o nome do oceano (pixels fixos em mundo_mapa.js) caem no mar."""
        import re
        import mundo_terreno as mt
        with open(os.path.join(RAIZ, "static", "mundo_mapa.js"), encoding="utf-8") as f:
            js = f.read()
        barcos = json.loads(re.search(r"const BARCOS = (\[\[.*?\]\]);", js).group(1))
        rosa, oceano = (json.loads(re.search(nome + r" = (\[\d+, \d+\])", js).group(1)) for nome in ("ROSA", "OCEANO"))
        agua = {mt.CORES[n] for n in mt.AGUA}
        pontos = [[round(x0 + (x1 - x0) * k / 20), round(y0 + (y1 - y0) * k / 20)] for x0, y0, x1, y1 in barcos for k in range(21)]
        pontos += [[rosa[0] + dx, rosa[1] + dy] for dx in range(-13, 14) for dy in range(-13, 14)]
        pontos += [[oceano[0] + dx, oceano[1] + dy] for dx in range(-46, 47) for dy in range(-12, 12)]
        fora = [p for p, c in zip(pontos, self.cores(pontos)) if c not in agua]
        self.assertEqual(fora, [])

    def test_divisa_le_na_floresta(self):
        """A divisa de UF é o tom do chão local: mais escuro, salvo na Amazônia, onde as copas já são escuras e a divisa é
        um verde claro, para ler sobre elas."""
        import mundo_terreno as mt
        lum = lambda h: sum(k * int(h[i:i + 2], 16) for k, i in ((0.3, 1), (0.59, 3), (0.11, 5)))
        for nome, cor in mt.BASE.items():
            if nome in mt.AGUA_BASE or nome == "am_divisa":
                continue
            divisa = mt.CORES[nome + "~"]
            if nome.startswith("am_"):
                self.assertGreaterEqual(lum(divisa) - lum(cor), 30, nome)
            else:
                self.assertLessEqual(lum(divisa), lum(cor) * 0.8, nome)

    def test_agua_e_terra_pela_cor(self):
        """O navegador separa água de terra pelo azul: água com B > G, terra com G >= B (todas as cores)."""
        import mundo_terreno as mt
        import mundo_planeta as mp
        for cores, agua in ((mt.CORES, mt.AGUA), (mp.PALETA, mp.AGUA)):   # o mapa e o terra.png (o globo)
            for nome, cor in cores.items():
                r, g, b = (int(cor[i:i + 2], 16) for i in (1, 3, 5))
                self.assertEqual(b > g, nome in agua, nome)

    def janela_terra(self, lat, lon, r):
        """As cores da janela (2r+1)² em volta de (lat, lon) no terra.png (0,5° por pixel, a longitude dá a volta)."""
        x, y = int((lon + 180) * 2), int((90 - lat) * 2)
        return self.cores([[(i + 720) % 720, j] for j in range(y - r, y + r + 1) for i in range(x - r, x + r + 1)
                           if 0 <= j < 360], "terra.png")

    def test_planeta_com_biomas(self):
        """O terra.png fala a língua do mapa: cada bioma do mundo no seu lugar (a maior parte da janela nas cores dele),
        montanhas com rocha e neve, gelo nos polos e no mar do Ártico, e água rasa mais clara junto da costa."""
        import mundo_planeta as mp
        lugares = {"deserto": [(25.0, 10.0), (21.0, 47.0), (-25.0, 128.0)], "floresta": [(-4.0, -63.0), (0.0, 22.0), (0.5, 114.0)],
                   "taiga": [(60.0, 100.0), (55.0, -110.0)], "tundra": [(70.0, 150.0)], "gelo": [(75.0, -40.0), (-80.0, 30.0), (86.0, 0.0)],
                   "cerrado": [(-13.0, -46.5)], "savana": [(-12.0, 25.0)], "mata": [(-22.8, -51.0), (49.0, 10.0)],
                   "estepe": [(48.0, 68.0)], "caatinga": [(-6.5, -39.8)]}
        for classe, pontos in lugares.items():
            dela = mp.cores_da_classe(classe)
            for lat, lon in pontos:
                cores = self.janela_terra(lat, lon, 2)
                self.assertGreaterEqual(sum(c in dela for c in cores) / len(cores), 0.5, (classe, lat, lon, cores))
        himalaia = set(self.janela_terra(28.5, 86.0, 3))
        self.assertTrue(himalaia & mp.cores_da_classe("neve") and himalaia & mp.cores_da_classe("rocha"), himalaia)
        agua = {mp.PALETA[n] for n in mp.AGUA}
        alto_mar = self.janela_terra(-30.0, -20.0, 4)
        self.assertTrue(set(alto_mar) <= agua - {mp.PALETA["raso_claro"]}, set(alto_mar))
        costa = self.janela_terra(-8.0, -34.6, 3)   # Recife: terra, a faixa clara e o raso
        self.assertIn(mp.PALETA["raso_claro"], costa)
        self.assertIn(mp.PALETA["raso"], costa)

    def test_versao_muda_com_a_paleta(self):
        """Só uma cor da PALETA muda: os índices dos pixels ficam iguais e a versão muda (cache do navegador)."""
        trocar = "\n".join([
            "import hashlib, json, os, sys",
            "sys.path.insert(0, sys.argv[1])",
            "import montar_mundo as mm",
            "from PIL import Image",
            "mm.PALETA['mar'] = '#010203'",
            "mundo = mm.montar(sys.argv[2], sys.argv[4])",
            "indices = lambda p: [hashlib.sha256(Image.open(os.path.join(p, n)).tobytes()).hexdigest()",
            "                     for n in ('brasil.png', 'terra.png')]",
            "print(json.dumps([mundo['versao'], indices(sys.argv[3]), indices(sys.argv[4])]))"])
        r = subprocess.run([sys.executable, "-B", "-c", trocar, os.path.join(RAIZ, "ferramentas"), self.ENTRADA,
                            self.pastas[0], self.pastas[2]], capture_output=True, text=True, timeout=120)
        if r.returncode:
            raise AssertionError(r.stderr)
        versao, antes, depois = json.loads(r.stdout)
        self.assertEqual(antes, depois)  # mesmos pixels
        self.assertNotEqual(versao, self.mundo["versao"])

    def test_estaticos_em_dia(self):
        """static/mundo/ versionado bate com o que a ferramenta gera hoje."""
        for nome in ("brasil.png", "terra.png", "mundo.json", "atlas.png", "atlas.json"):
            self.assertEqual(self.sha(os.path.join(RAIZ, "static", "mundo"), nome), self.sha(self.pastas[0], nome), nome)

if __name__ == "__main__":
    unittest.main()
