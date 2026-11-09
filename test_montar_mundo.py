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
    def cores(cls, pontos):
        """Cor '#rrggbb' de cada (x, y) do brasil.png montado, lida pelo Pillow no processo filho."""
        ler = ("import json, sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert('RGB')\n"
               "print(json.dumps(['#%02x%02x%02x' % im.getpixel(tuple(p)) for p in json.loads(sys.argv[2])]))")
        r = subprocess.run([sys.executable, "-c", ler, os.path.join(cls.pastas[0], "brasil.png"), json.dumps(pontos)],
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
        self.assertEqual(set(atlas["quadros"]), marcos | GENERICOS | presentes)
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
        self.assertIn("marco-pampulha", quadros)
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
        self.assertEqual(self.mundo["niveis"], {"brasil": {"w": 400, "h": 400, "caixa": [-74.0, -34.0, -34.0, 6.0]}})
        self.assertEqual(len(self.mundo["cidades"]), 28)
        bh = next(c for c in self.mundo["cidades"] if c["id"] == "belo-horizonte")
        self.assertEqual((bh["x"], bh["y"]), (300, 259))
        for c in self.mundo["cidades"]:
            self.assertEqual(set(c), {"id", "nome", "uf", "lat", "lon", "x", "y", "marco"})
        for nome, tamanho in (("brasil.png", (400, 400)), ("terra.png", (360, 180))):
            with open(os.path.join(self.pastas[0], nome), "rb") as f:
                cabeca = f.read(24)
            self.assertEqual(cabeca[1:4], b"PNG", nome)
            self.assertEqual((int.from_bytes(cabeca[16:20], "big"), int.from_bytes(cabeca[20:24], "big")), tamanho, nome)

    def test_cidades_em_terra(self):
        import montar_mundo as mm
        brasil = {mm.PALETA[n] for n in ("terra", "terra_alta", "serra", "borda_uf", "borda_pais")}
        cidades = self.mundo["cidades"]
        for c, cor in zip(cidades, self.cores([[c["x"], c["y"]] for c in cidades])):
            self.assertIn(cor, brasil, c["id"])
            x0, y0 = mm.para_pixel(c["lat"], c["lon"], mm.CAIXA_BRASIL, 400, 400)
            self.assertLessEqual((c["x"] - x0) ** 2 + (c["y"] - y0) ** 2, 36, c["id"])
        movidas = {c["id"] for c in cidades
                   if (c["x"], c["y"]) != mm.para_pixel(c["lat"], c["lon"], mm.CAIXA_BRASIL, 400, 400)}
        self.assertTrue({"belem", "recife", "rio-de-janeiro", "florianopolis"} <= movidas, movidas)

    def test_vizinhos_destacados(self):
        import montar_mundo as mm
        paraguai = mm.para_pixel(-23.0, -58.0, mm.CAIXA_BRASIL, 400, 400)
        mato_grosso = mm.para_pixel(-13.0, -56.0, mm.CAIXA_BRASIL, 400, 400)
        cor_py, cor_mt = self.cores([list(paraguai), list(mato_grosso)])
        self.assertEqual(cor_py, mm.PALETA["vizinho"])
        self.assertIn(cor_mt, {mm.PALETA[n] for n in ("terra", "terra_alta", "serra")})

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
