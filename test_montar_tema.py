"""Confere a orientação do hatch na folha publicada, conforme a arte original."""
import json
from pathlib import Path
import unittest

try:
    from PIL import Image, ImageChops
except ImportError:
    Image = ImageChops = None


@unittest.skipIf(Image is None, "Pillow é necessário para comparar os pixels do atlas")
class Veiculos(unittest.TestCase):
    def test_hatch_da_fachada_segue_o_farol_da_arte_original(self):
        raiz = Path(__file__).resolve().parent
        tema = raiz / "static" / "tema"
        sprites = json.loads((tema / "atlas.json").read_text(encoding="utf-8"))["sprites"]
        with Image.open(raiz / "arte" / "pixellab" / "bairro" / "carro.png") as fonte:
            original = fonte.convert("RGBA")
        hatch = original.crop(original.getbbox())
        hatch = hatch.crop((0, 0, hatch.width, hatch.height - 2))
        hatch = hatch.resize((32, 14), Image.Resampling.NEAREST)
        # A composição do atlas zera o RGB dos pixels totalmente transparentes.
        direita = Image.new("RGBA", hatch.size)
        direita.alpha_composite(hatch)
        with Image.open(tema / "atlas.png") as atlas:
            for nome, esperado in (
                ("carro1", direita),
                ("carro1_esq", direita.transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
            ):
                with self.subTest(sprite=nome):
                    x, y, w, h = sprites[nome]
                    publicado = atlas.crop((x, y, x + w, y + h)).convert("RGBA")
                    diferenca = ImageChops.difference(publicado, esperado)
                    self.assertTrue(all(canal.getbbox() is None for canal in diferenca.split()))
