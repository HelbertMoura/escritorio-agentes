# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""As cenas integrais das cidades (static/mundo/cenas): o manifesto confere com o disco, o peso fica no teto e o servidor
só serve a lista fechada."""
import base64
import contextlib
import hashlib
import http.client
import io
import json
import os
import re
import struct
import tempfile
import threading
import unittest

import acesso
import escritorio as e

PASTA = os.path.join(e.ESTATICO, "mundo", "cenas")
MANIFESTO = "mundo_cidade_cenas.js"
TETO_PNG, TETO_PASTA = 120 * 1024, 8 * 1024 * 1024
# o PNG do Recife é o original de 7c0df2c, byte a byte (RGBA, 153 KB): o teto por arquivo e o modo indexado valem para as
# cenas que chegam depois
ORIGINAIS = {"recife.png": "63dd8988030d4ea21198d938284f95b64a3e36881bd465c34dd1a77ad430cad2"}


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
            if nome in ORIGINAIS:
                self.assertEqual(hashlib.sha256(dados).hexdigest(), ORIGINAIS[nome], nome)
            elif nome.endswith(".png"):
                self.assertLessEqual(len(dados), TETO_PNG, nome)
                self.assertEqual(dados[25], 3, f"{nome}: PNG indexado (modo P)")
        self.assertLessEqual(total, TETO_PASTA)


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
