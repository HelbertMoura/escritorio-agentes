"""Mundo vivo: dados de entrada da montagem (arte/mundo/cidades.json).
Uso: python -B -I -m unittest discover -p "test_montar_mundo.py"
"""
import json
import os
import unittest

RAIZ = os.path.dirname(os.path.abspath(__file__))
CIDADES = os.path.join(RAIZ, "arte", "mundo", "cidades.json")

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


if __name__ == "__main__":
    unittest.main()
