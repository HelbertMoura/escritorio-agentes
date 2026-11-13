# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Testes de unidade de contas, papéis, perfil e sessões por pessoa em acesso.py."""
import hashlib
import json
import os
import secrets
import shutil
import tempfile
import threading
import time
import unittest

import acesso
from acesso import (
    ANDAR_PRINCIPAL,
    Acesso,
    ContaExiste,
    NaoGravou,
    UltimoAdmin,
)


def em_paralelo(chamadas):
    """Executa uma lista de callables ao mesmo tempo e devolve [(indice, ok, valor_ou_erro)]."""
    resultados = [None] * len(chamadas)

    def rodar(i, fn):
        try:
            resultados[i] = (i, True, fn())
        except Exception as err:
            resultados[i] = (i, False, err)

    fios = [threading.Thread(target=rodar, args=(i, fn)) for i, fn in enumerate(chamadas)]
    for f in fios:
        f.start()
    for f in fios:
        f.join()
    return resultados


class ContasUnidade(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp(prefix="contas-")
        self.addCleanup(shutil.rmtree, self.pasta, ignore_errors=True)
        self.a = Acesso(self.pasta)

    def codigo(self):
        with open(os.path.join(self.pasta, "codigo-primeiro-acesso.txt"), encoding="utf-8") as f:
            return f.read().strip()

    def criar_dono(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")

    def test_t1_retrocompativel_sem_andares_sobe_como_admin_e_mantem_sessao(self):
        pasta_legado = tempfile.mkdtemp(prefix="legado-")
        self.addCleanup(shutil.rmtree, pasta_legado, ignore_errors=True)
        sal = secrets.token_bytes(16)
        h = acesso._hash("senha-legada-123", sal)
        with open(os.path.join(pasta_legado, "usuarios.json"), "w", encoding="utf-8") as f:
            json.dump({
                "dono": {
                    "sal": sal.hex(),
                    "hash": h.hex(),
                    "n": acesso.N,
                    "r": acesso.R,
                    "p": acesso.P,
                    "criado": 1700000000,
                }
            }, f)
        token = "token-antigo-do-navegador"
        sha = hashlib.sha256(token.encode()).hexdigest()
        with open(os.path.join(pasta_legado, "sessoes.json"), "w", encoding="utf-8") as f:
            json.dump({sha: {"usuario": "dono", "expira": time.time() + 3600}}, f)

        acc = Acesso(pasta_legado)
        self.assertEqual(acc.sessao(token), "dono")
        self.assertEqual(acc.papel("dono"), "admin")
        self.assertEqual(acc.papel("dono", "segundo-andar"), None)
        self.assertEqual(acc.perfil("dono"), {
            "usuario": "dono",
            "nome": "dono",
            "avatar": None,
            "papel": "admin",
            "trocar_senha": False,
        })

    def test_t2_primeiro_acesso_grava_andares_principal_admin(self):
        self.criar_dono()
        self.assertEqual(self.a.papel("dono"), "admin")
        with open(os.path.join(self.pasta, "usuarios.json"), encoding="utf-8") as f:
            dados = json.load(f)
        self.assertEqual(dados["dono"]["andares"], {ANDAR_PRINCIPAL: "admin"})

    def test_criar_conta_e_listar_contas_sem_segredos(self):
        self.criar_dono()
        senha = self.a.criar_conta("Maria.Silva", "Maria Silva", "membro")
        self.assertGreaterEqual(len(senha), 16)
        self.assertEqual(self.a.papel("maria.silva"), "membro")
        self.assertTrue(self.a.perfil("maria.silva")["trocar_senha"])

        tok = self.a.entrar("maria.silva", senha)
        self.assertEqual(self.a.sessao(tok), "maria.silva")

        lista = self.a.contas()
        self.assertEqual([c["usuario"] for c in lista], ["dono", "maria.silva"])
        for c in lista:
            self.assertEqual(set(c), {"usuario", "nome", "papel", "criado", "trocar_senha"})
            self.assertNotIn("sal", c)
            self.assertNotIn("hash", c)

        with self.assertRaises(ContaExiste):
            self.a.criar_conta("maria.silva", "Outra Maria", "membro")
        with self.assertRaises(ValueError):
            self.a.criar_conta("usuario invalido", "Fulano", "membro")
        with self.assertRaises(ValueError):
            self.a.criar_conta("carlos", "Carlos", "chefe")

    def test_t6_ultimo_admin_protegido_no_rebaixamento_e_remocao(self):
        self.criar_dono()
        self.a.criar_conta("ana", "Ana", "membro")
        arq = os.path.join(self.pasta, "usuarios.json")
        with open(arq, "rb") as f:
            antes = f.read()

        with self.assertRaises(UltimoAdmin):
            self.a.mudar_papel("dono", "membro")
        with self.assertRaises(UltimoAdmin):
            self.a.remover("dono")
        with open(arq, "rb") as f:
            self.assertEqual(f.read(), antes)

        # Com dois admins, rebaixar um passa e o segundo fica protegido
        self.a.mudar_papel("ana", "admin")
        self.assertEqual(self.a.papel("ana"), "admin")
        self.a.mudar_papel("dono", "membro")
        self.assertEqual(self.a.papel("dono"), "membro")

        with self.assertRaises(UltimoAdmin):
            self.a.mudar_papel("ana", "membro")
        with self.assertRaises(UltimoAdmin):
            self.a.remover("ana")

        # Membro pode ser removido normalmente
        self.a.remover("dono")
        self.assertEqual([c["usuario"] for c in self.a.contas()], ["ana"])

    def test_t10_validacao_perfil_nome_e_avatar(self):
        self.criar_dono()
        avatar_ok = {"color": "teal", "eyes": "happy", "accessory": "crown"}
        perfil = self.a.salvar_perfil("dono", "  Helbert Moura  ", avatar_ok)
        self.assertEqual(perfil["nome"], "Helbert Moura")
        self.assertEqual(perfil["avatar"], avatar_ok)
        self.assertEqual(Acesso(self.pasta).perfil("dono")["nome"], "Helbert Moura")
        self.assertEqual(Acesso(self.pasta).perfil("dono")["avatar"], avatar_ok)

        # Limite exato de 40 caracteres passa; 41, vazio ou controle falham
        self.a.salvar_perfil("dono", "a" * 40, {"color": "sky", "eyes": "dots", "accessory": ""})
        for ruim in ("", "   ", "a" * 41, "ana\x00", "ana\n", "ana\r", "ana\u200b", 123, None):
            with self.subTest(nome=ruim):
                with self.assertRaises(ValueError):
                    self.a.salvar_perfil("dono", ruim, avatar_ok)

        for av_ruim in (
            None,
            "teal",
            {"color": "dourado", "eyes": "happy", "accessory": ""},
            {"color": "teal", "eyes": "laser", "accessory": ""},
            {"color": "teal", "eyes": "happy", "accessory": "espada"},
            {"color": "teal", "eyes": "happy"},
            {"color": "teal", "eyes": "happy", "accessory": "", "extra": 1},
        ):
            with self.subTest(avatar=av_ruim):
                with self.assertRaises(ValueError):
                    self.a.salvar_perfil("dono", "Ana", av_ruim)

    def test_papel_invalido_falha_fechada(self):
        self.criar_dono()
        arq = os.path.join(self.pasta, "usuarios.json")
        with open(arq, encoding="utf-8") as f:
            dados = json.load(f)
        dados["estranho"] = {**dados["dono"], "andares": {"principal": "superadmin"}}
        dados["sem_andar"] = {**dados["dono"], "andares": {}}
        with open(arq, "w", encoding="utf-8") as f:
            json.dump(dados, f)

        acc = Acesso(self.pasta)
        self.assertIsNone(acc.papel("estranho"))
        self.assertIsNone(acc.papel("sem_andar"))
        self.assertEqual(acc.papel("dono"), "admin")

    def test_redefinir_trocar_senha_remover_e_sair_todos_por_pessoa(self):
        self.criar_dono()
        prov = self.a.criar_conta("ana", "Ana", "membro")

        tok_dono = self.a.entrar("dono", "senha-bem-grande")
        modo_dono = self.a.abrir_modo(tok_dono, "senha-bem-grande", agora=1000)
        tok_ana1 = self.a.entrar("ana", prov)
        tok_ana2 = self.a.entrar("ana", prov)

        # Trocar senha limpa trocar_senha, derruba outra sessão da Ana e mantém a atual e a do dono
        antes_atraso, acesso.ATRASO = acesso.ATRASO, 0
        self.addCleanup(setattr, acesso, "ATRASO", antes_atraso)
        with self.assertRaises(PermissionError):
            self.a.trocar_senha(tok_ana1, "senha-errada-123", "nova-senha-segura")
        with self.assertRaises(ValueError):
            self.a.trocar_senha(tok_ana1, prov, "curta")

        self.a.trocar_senha(tok_ana1, prov, "nova-senha-ana-123")
        self.assertFalse(self.a.perfil("ana")["trocar_senha"])
        self.assertEqual(self.a.sessao(tok_ana1), "ana")
        self.assertIsNone(self.a.sessao(tok_ana2))
        self.assertEqual(self.a.sessao(tok_dono), "dono")

        # sair_todos da Ana derruba só as sessões dela
        tok_ana3 = self.a.entrar("ana", "nova-senha-ana-123")
        n = self.a.sair_todos(tok_ana1, "nova-senha-ana-123")
        self.assertEqual(n, 2)
        self.assertIsNone(self.a.sessao(tok_ana1))
        self.assertIsNone(self.a.sessao(tok_ana3))
        self.assertEqual(self.a.sessao(tok_dono), "dono")
        self.assertIsNotNone(self.a.modo(tok_dono, modo_dono, agora=1010))

        # redefinir_senha força trocar_senha=True e derruba sessões da Ana sem mexer no dono
        tok_ana4 = self.a.entrar("ana", "nova-senha-ana-123")
        prov2 = self.a.redefinir_senha("ana")
        self.assertGreaterEqual(len(prov2), 16)
        self.assertTrue(self.a.perfil("ana")["trocar_senha"])
        self.assertIsNone(self.a.sessao(tok_ana4))
        self.assertEqual(self.a.sessao(tok_dono), "dono")

        # remover derruba sessões da Ana e preserva o dono
        tok_ana5 = self.a.entrar("ana", prov2)
        self.a.remover("ana")
        self.assertIsNone(self.a.sessao(tok_ana5))
        self.assertEqual(self.a.sessao(tok_dono), "dono")
        with self.assertRaises(KeyError):
            self.a.remover("nao_existe")

    def test_falha_no_disco_nao_altera_memoria(self):
        self.criar_dono()
        antes = acesso._gravar

        def falha(*_):
            raise OSError("disco cheio")

        acesso._gravar = falha
        self.addCleanup(setattr, acesso, "_gravar", antes)

        with self.assertRaises(NaoGravou):
            self.a.criar_conta("ana", "Ana", "membro")
        self.assertNotIn("ana", self.a.usuarios)

        with self.assertRaises(NaoGravou):
            self.a.salvar_perfil("dono", "Outro Nome", {"color": "rose", "eyes": "wide", "accessory": ""})
        self.assertEqual(self.a.perfil("dono")["nome"], "dono")

    def test_t15_criar_20_contas_em_paralelo(self):
        self.criar_dono()
        chamadas = [
            (lambda i=i: self.a.criar_conta(f"pessoa{i:02d}", f"Pessoa {i:02d}", "membro"))
            for i in range(20)
        ]
        res = em_paralelo(chamadas)
        falhas = [r for r in res if not r[1]]
        self.assertEqual(falhas, [])
        for _, ok, senha in res:
            self.assertTrue(ok)
            self.assertGreaterEqual(len(senha), 16)

        esperados = {"dono"} | {f"pessoa{i:02d}" for i in range(20)}
        self.assertEqual(set(self.a.usuarios), esperados)
        acc_disco = Acesso(self.pasta)
        self.assertEqual(set(acc_disco.usuarios), esperados)
        for i in range(20):
            self.assertTrue(acc_disco.perfil(f"pessoa{i:02d}")["trocar_senha"])

        # Corrida com o mesmo usuário: só 1 cria, os demais levam ContaExiste
        corrida = em_paralelo([lambda: self.a.criar_conta("duplicada", "Dup", "membro") for _ in range(5)])
        sucessos = [r for r in corrida if r[1]]
        erros = [r[2] for r in corrida if not r[1]]
        self.assertEqual(len(sucessos), 1)
        self.assertTrue(all(isinstance(err, ContaExiste) for err in erros))


if __name__ == "__main__":
    unittest.main()
