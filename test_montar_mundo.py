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
COM_MARCO = {"rio-de-janeiro", "belo-horizonte", "sao-paulo", "brasilia", "salvador", "manaus",
             "belem", "florianopolis", "porto-alegre", "mateus-leme"}


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
            if c["marco"] is not None:
                self.assertRegex(c["marco"], r"^[a-z-]+$")

        por_id = {c["id"]: c for c in cidades}
        self.assertEqual({c["uf"] for c in cidades}, UFS)
        self.assertEqual(por_id["mateus-leme"]["uf"], "MG")
        self.assertEqual({c["id"] for c in cidades if c["marco"] is not None}, COM_MARCO)


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
        for nome in ("brasil.png", "terra.png", "mundo.json"):
            self.assertEqual(self.sha(self.pastas[0], nome), self.sha(self.pastas[1], nome), nome)

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
        for nome in ("brasil.png", "terra.png", "mundo.json"):
            self.assertEqual(self.sha(os.path.join(RAIZ, "static", "mundo"), nome), self.sha(self.pastas[0], nome), nome)

if __name__ == "__main__":
    unittest.main()
