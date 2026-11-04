import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request

PASTA = tempfile.mkdtemp(prefix="escritorio-teste-")
os.environ["ESCRITORIO_DADOS"] = PASTA
os.environ["AGENTES_ORG"] = "00000000-0000-4000-8000-000000000000"  # org fictícia
import acesso  # noqa: E402
import escritorio as e  # noqa: E402
from acesso import Acesso  # noqa: E402

AG = [{"id": "a1", "name": "Pixel", "handle": "pixel", "role": "Conteúdo"},
      {"id": "a2", "name": "Órbita", "handle": "agent-orbita-qa-acme", "role": "QA"}]  # agentes fictícios
ORG_URL = f"https://app.agentes.chat/org/{e.ORG}/c/11111111-2222-4333-8444-555555555555"


class Rotulo(unittest.TestCase):
    def test_resposta_de_agente_cortada(self):
        r = e.limpa_rotulo('agent-orbita-qa-acme: <external_data source="reply from agent-orb…',
                           {"agent-orbita-qa-acme": "Órbita"})
        self.assertEqual(r, "Lendo a resposta de Órbita")

    def test_tira_marcacao_e_limita(self):
        r = e.limpa_rotulo("<b>Post</b> do dia &amp; " + "x" * 300)
        self.assertTrue(r.startswith("Post do dia & x"))
        self.assertLessEqual(len(r), 111)
        self.assertNotIn("<", e.limpa_rotulo("texto <script"))


class Resumo(unittest.TestCase):
    def test_prioriza_o_que_pede_a_pessoa_e_filtra_url(self):
        tarefas = [
            {"agent": {"id": "a1"}, "status": "still_running", "label": "A", "started_at": "2026-11-04T10:00:00Z", "url": ORG_URL},
            {"agent": {"id": "a1"}, "status": "waiting_approval", "label": "B", "started_at": "2026-11-04T09:00:00Z",
             "url": "https://app.agentes.chat/api/oauth/authorize?client_id=x"},
            {"agent": {"id": "zz"}, "status": "still_running", "label": "de fora", "started_at": "x"},
        ]
        r = e.resumir(AG, tarefas)
        self.assertEqual(len(r["trabalhos"]), 1)
        t = r["trabalhos"][0]
        self.assertEqual((t["status"], t["rotulo"], t["url"]), ("waiting_approval", "B", ""))
        self.assertEqual(e.resumir(AG, tarefas[:1])["trabalhos"][0]["url"], ORG_URL)

    def test_repassa_run_id_e_todas_as_tarefas(self):
        tarefas = [
            {"run_id": "r1", "agent": {"id": "a1"}, "status": "still_running", "label": "A", "started_at": "2026-11-04T10:00:00Z"},
            {"run_id": "r2", "agent": {"id": "a1"}, "status": "waiting_input", "label": "B", "started_at": "2026-11-04T11:00:00Z"},
        ]
        r = e.resumir(AG, tarefas)
        self.assertEqual([(t["run_id"], t["status"], t["started_at"]) for t in r["tarefas"]],
                         [("r1", "still_running", "2026-11-04T10:00:00Z"), ("r2", "waiting_input", "2026-11-04T11:00:00Z")])
        self.assertEqual(r["trabalhos"][0]["run_id"], "r2")  # o front segue com uma por agente
        self.assertEqual(set(r["tarefas"][0]), {"agente_id", "run_id", "status", "started_at"})  # sem rótulo nem url


def tarefa(run_id, status, agente="a1"):
    return {"agente_id": agente, "run_id": run_id, "status": status, "rotulo": "conteúdo que não pode vazar"}


class Diario(unittest.TestCase):
    HANDLES = {"a1": "pixel", "a2": "agent-orbita-qa-acme"}

    def setUp(self):
        self.d = e.Diario()

    def ler(self, tarefas, agora):
        return self.d.registrar(tarefas, self.HANDLES, agora)

    def test_primeira_leitura_e_so_linha_de_base(self):
        lista = [tarefa("r1", "still_running"), tarefa("r2", "waiting_approval", "a2")]
        self.assertEqual(self.ler(lista, 1000), [])
        self.assertEqual({t["desde"] for t in lista}, {"1970-01-01T00:16:40Z"})

    def test_transicoes_geram_eventos_sem_conteudo(self):
        self.ler([tarefa("r1", "still_running")], 0)
        self.ler([tarefa("r1", "waiting_approval"), tarefa("r2", "running", "a2")], 60)
        self.ler([tarefa("r1", "still_running"), tarefa("r2", "waiting_input", "a2")], 120)
        ev = self.ler([tarefa("r2", "waiting_input", "a2")], 180)
        self.assertEqual([(x["tipo"], x["agente"], x["run_id"]) for x in ev], [
            ("terminou", "pixel", "r1"), ("pediu_resposta", "agent-orbita-qa-acme", "r2"), ("voltou_a_trabalhar", "pixel", "r1"),
            ("comecou", "agent-orbita-qa-acme", "r2"), ("pediu_aprovacao", "pixel", "r1")])  # do mais novo para o mais velho
        self.assertEqual(ev[0], {"em": "1970-01-01T00:03:00Z", "tipo": "terminou", "agente": "pixel", "run_id": "r1"})
        self.assertNotIn("conteúdo", json.dumps(ev, ensure_ascii=False))

    def test_tarefa_que_ja_nasce_esperando(self):
        self.ler([], 0)
        ev = self.ler([tarefa("r9", "waiting_approval")], 10)
        self.assertEqual([x["tipo"] for x in ev], ["pediu_aprovacao", "comecou"])

    def test_desde_fica_estavel_enquanto_o_status_nao_muda(self):
        self.ler([tarefa("r1", "running")], 0)
        for agora in (15, 30, 45):
            lista = [tarefa("r1", "still_running" if agora % 2 else "running")]  # as duas formas de "trabalhando"
            self.assertEqual(self.ler(lista, agora), [])
            self.assertEqual(lista[0]["desde"], "1970-01-01T00:00:00Z")
        lista = [tarefa("r1", "waiting_input")]
        self.ler(lista, 60)
        self.assertEqual(lista[0]["desde"], "1970-01-01T00:01:00Z")

    def test_run_que_some_sai_do_diario_e_a_lista_tem_limite(self):
        self.ler([tarefa("r0", "running")], 0)
        for i in range(1, 80):
            self.ler([tarefa(f"r{i}", "running")], i)  # cada leitura: um começa e o anterior termina
        self.assertEqual(list(self.d.runs), ["r79"])
        ev = self.ler([tarefa("r79", "running")], 100)
        self.assertEqual(len(ev), e.Diario.LIMITE)
        self.assertEqual([(x["tipo"], x["run_id"]) for x in ev[:2]], [("terminou", "r78"), ("comecou", "r79")])

    def test_leitura_incompleta_nao_termina_nem_apaga(self):
        self.ler([tarefa("r1", "running"), tarefa("r2", "running")], 0)
        self.assertEqual(self.d.registrar([tarefa("r1", "running")], self.HANDLES, 15, completa=False), [])
        self.assertEqual(set(self.d.runs), {"r1", "r2"})
        lista = [tarefa("r1", "running"), tarefa("r2", "running")]
        self.assertEqual(self.ler(lista, 30), [])  # voltou na leitura completa: sem "comecou" e com o mesmo desde
        self.assertEqual(lista[1]["desde"], "1970-01-01T00:00:00Z")
        self.assertEqual([x["tipo"] for x in self.ler([tarefa("r1", "running")], 45)], ["terminou"])

    def test_run_id_repetido_na_mesma_leitura_nao_oscila(self):
        self.ler([tarefa("r1", "running")], 0)
        dupla = [tarefa("r1", "waiting_approval"), tarefa("r1", "running")]
        self.assertEqual([x["tipo"] for x in self.ler(dupla, 15)], ["pediu_aprovacao"])
        self.assertEqual(self.ler([tarefa("r1", "waiting_approval"), tarefa("r1", "running")], 30)[0]["em"], "1970-01-01T00:00:15Z")

    def test_run_id_repetido_tambem_recebe_desde(self):
        self.ler([], 0)
        dupla = [tarefa("r1", "waiting_approval"), tarefa("r1", "running")]
        self.ler(dupla, 15)
        self.assertEqual([t.get("desde") for t in dupla], ["1970-01-01T00:00:15Z"] * 2)  # a cópia leva o "desde" do primeiro

    def test_aplicar_poe_desde_nos_trabalhos_e_os_eventos(self):
        r = e.resumir(AG, [{"run_id": "r1", "agent": {"id": "a1"}, "status": "running", "started_at": "x"}])
        self.d.aplicar(r, agora=60)
        self.assertEqual((r["trabalhos"][0]["desde"], r["tarefas"][0]["desde"], r["eventos"]), ("1970-01-01T00:01:00Z",) * 2 + ([],))

    # --- resolvidos hoje (fuso de Brasília). T = 04/11/2026 12:00 em Brasília (15:00Z)
    T = 1793804400

    def resolver(self, tarefas, agora, rotulos=None, completa=True):
        self.d.registrar(tarefas, self.HANDLES, agora, completa, rotulos or {})
        return self.d.resolvidos_hoje(agora)

    def test_pedido_que_voltou_a_trabalhar(self):
        T = self.T
        self.resolver([tarefa("r1", "running")], T)
        self.resolver([tarefa("r1", "waiting_approval")], T + 60, {"r1": "Publicar o post"})
        self.assertEqual(self.resolver([tarefa("r1", "still_running")], T + 660), [
            {"run_id": "r1", "agente": "pixel", "tipo": "aprovacao", "rotulo": "Publicar o post", "pediu_em": "2026-11-04T15:01:00Z",
             "resolvido_em": "2026-11-04T15:11:00Z", "desfecho": "voltou_a_trabalhar", "desde_inicio": False}])

    def test_pedido_que_sumiu_terminou(self):
        self.resolver([], self.T)
        self.resolver([tarefa("r1", "waiting_input")], self.T + 60, {"r1": "Qual cor?"})
        r = self.resolver([], self.T + 120)
        self.assertEqual([(x["desfecho"], x["tipo"], x["rotulo"]) for x in r], [("terminou", "pergunta", "Qual cor?")])

    def test_aprovacao_que_vira_pergunta_e_outro_pedido(self):
        self.resolver([], self.T)
        self.resolver([tarefa("r1", "waiting_approval")], self.T + 60, {"r1": "Aprovar"})
        agora = [tarefa("r1", "waiting_input")]
        r = self.resolver(agora, self.T + 120, {"r1": "Responder"})
        self.assertEqual([(x["desfecho"], x["tipo"], x["rotulo"]) for x in r], [("outro_pedido", "aprovacao", "Aprovar")])
        self.assertEqual((self.d.runs["r1"]["status"], agora[0]["desde"]), ("waiting_input", "2026-11-04T15:02:00Z"))   # segue esperando
        r = self.resolver([tarefa("r1", "running")], self.T + 300)
        self.assertEqual([(x["desfecho"], x["tipo"], x["rotulo"], x["pediu_em"]) for x in r][0],
                         ("voltou_a_trabalhar", "pergunta", "Responder", "2026-11-04T15:02:00Z"))

    def test_leitura_incompleta_nao_resolve(self):
        self.resolver([], self.T)
        self.resolver([tarefa("r1", "waiting_approval")], self.T + 60)
        self.assertEqual(self.resolver([], self.T + 120, completa=False), [])
        self.assertEqual([x["desfecho"] for x in self.resolver([], self.T + 180)], ["terminou"])

    def test_virada_do_dia_em_brasilia_limpa(self):
        meia_noite = 1793847600   # 05/11 03:00Z = 00:00 em Brasília
        self.resolver([], meia_noite - 120)
        self.resolver([tarefa("r1", "waiting_approval")], meia_noite - 90)
        self.assertEqual(len(self.resolver([], meia_noite - 60)), 1)   # 23:59 em Brasília, ainda "hoje"
        self.assertEqual(len(self.d.resolvidos_hoje(meia_noite - 1)), 1)
        self.assertEqual(self.d.resolvidos_hoje(meia_noite), [])

    def test_rotulo_limpo_com_teto_sem_url_e_sem_o_que_vem_das_tarefas(self):
        rotulo = "<b>Aprovar</b> &amp; publicar <a href='https://x.example/segredo'>o link</a> " + "palavra " * 30
        url = f"https://app.agentes.chat/org/{e.ORG}/c/11111111-2222-4333-8444-555555555555"
        bruta = {"run_id": "r1", "agent": {"id": "a1"}, "status": "waiting_approval", "started_at": "x", "label": rotulo, "url": url}
        self.d.aplicar(e.resumir(AG, []), agora=self.T)
        self.d.aplicar(e.resumir(AG, [bruta]), agora=self.T + 60)
        r = self.d.aplicar(e.resumir(AG, [dict(bruta, status="running")]), agora=self.T + 120)
        item = r["resolvidos"][0]
        self.assertTrue(item["rotulo"].startswith("Aprovar & publicar o link palavra"))   # texto puro, sem marcação
        self.assertLessEqual(len(item["rotulo"]), 111)
        self.assertNotIn("<", item["rotulo"])
        self.assertNotIn("http", json.dumps(r["resolvidos"]))
        self.assertEqual(set(r["tarefas"][0]), {"agente_id", "run_id", "status", "started_at", "desde"})   # tarefas segue sem rótulo
        self.resolver([tarefa("r2", "waiting_input")], self.T + 180)   # o rótulo de tarefa() nunca entra (só o dos trabalhos)
        self.assertNotIn("conteúdo que não pode vazar", json.dumps(self.resolver([], self.T + 240), ensure_ascii=False))

    def test_resolvidos_tem_teto(self):
        self.resolver([], self.T)
        for i in range(60):
            self.resolver([tarefa(f"r{i}", "waiting_input")], self.T + 10 * i)
            self.resolver([tarefa(f"r{i}", "running")], self.T + 10 * i + 5)
        r = self.d.resolvidos_hoje(self.T + 1000)
        self.assertEqual((len(r), r[0]["run_id"], r[-1]["run_id"]), (50, "r59", "r10"))   # do mais novo para o mais velho

    def test_desde_inicio_so_para_pedido_da_linha_de_base(self):
        self.resolver([tarefa("r1", "waiting_approval"), tarefa("r2", "running", "a2")], self.T)   # r1 já esperava ao subir
        self.resolver([tarefa("r1", "waiting_approval"), tarefa("r2", "waiting_input", "a2")], self.T + 60)
        r = self.resolver([tarefa("r1", "running"), tarefa("r2", "running", "a2")], self.T + 120)
        self.assertEqual({x["run_id"]: x["desde_inicio"] for x in r}, {"r1": True, "r2": False})


class Coleta(unittest.TestCase):
    """O leitor segue as páginas do MCP e recusa resposta sem lista (mantém a leitura anterior)."""
    def leitor(self, paginas):
        class Mcp:
            def ferramenta(self, nome, args, token):
                return paginas[nome][args.get("cursor") or ""]
        l = e.Leitor(None)
        l.mcp = Mcp()
        return l

    def test_pagina_as_tarefas_e_marca_leitura_completa(self):
        l = self.leitor({"list_agents": {"": {"agents": AG}},
                         "list_recent_tasks": {"": {"tasks": [{"run_id": "r1", "agent": {"id": "a1"}}], "next_cursor": "p2"},
                                               "p2": {"tasks": [{"run_id": "r2", "agent": {"id": "a2"}}]}}})
        r, completa = l._coletar("t")
        self.assertEqual(([t["run_id"] for t in r["tarefas"]], completa), (["r1", "r2"], True))

    def test_teto_de_paginas_marca_leitura_incompleta(self):
        sem_fim = {"": {"tasks": [], "next_cursor": "p"}, "p": {"tasks": [], "next_cursor": "p"}}
        _, completa = self.leitor({"list_agents": {"": {"agents": AG}}, "list_recent_tasks": sem_fim})._coletar("t")
        self.assertFalse(completa)

    def test_resposta_sem_lista_e_erro_e_lista_vazia_vale(self):
        with self.assertRaises(RuntimeError):
            self.leitor({"list_agents": {"": {"agents": AG}}, "list_recent_tasks": {"": {}}})._coletar("t")
        with self.assertRaises(RuntimeError):
            self.leitor({"list_agents": {"": {}}, "list_recent_tasks": {"": {"tasks": []}}})._coletar("t")
        r, completa = self.leitor({"list_agents": {"": {"agents": AG}}, "list_recent_tasks": {"": {"tasks": []}}})._coletar("t")
        self.assertEqual((r["tarefas"], completa), ([], True))


class JsonRpcEClima(unittest.TestCase):
    def test_json_e_sse(self):
        self.assertEqual(e._resposta_jsonrpc(b'{"jsonrpc":"2.0","id":1,"result":{"ok":1}}')["result"]["ok"], 1)
        sse = b'event: message\ndata: {"jsonrpc":"2.0","method":"x"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"v":2}}\n\n'
        self.assertEqual(e._resposta_jsonrpc(sse)["result"]["v"], 2)
        self.assertIsNone(e._resposta_jsonrpc(b""))

    def test_tipo_do_clima(self):
        self.assertEqual([e.tipo_do_clima(c, 0) for c in (95, 73, 63, 53, 45, 0)], ["tempestade", "neve", "chuva", "garoa", "neblina", "limpo"])
        self.assertEqual(e.tipo_do_clima(1, 80), "nublado")


def em_paralelo(funcao, vezes):
    """Dispara as tentativas juntas (o atraso fica fora da trava) e devolve as mensagens de recusa."""
    recusas = []

    def uma():
        try:
            funcao()
        except PermissionError as x:
            recusas.append(str(x))
    fios = [threading.Thread(target=uma) for _ in range(vezes)]
    for f in fios:
        f.start()
    for f in fios:
        f.join()
    return recusas


DEMAIS = "tentativas demais; espere alguns minutos"


class AcessoUnidade(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp(prefix="acesso-")
        self.a = Acesso(self.pasta)

    def codigo(self):
        with open(os.path.join(self.pasta, "codigo-primeiro-acesso.txt")) as f:
            return f.read().strip()

    def test_primeiro_acesso_exige_codigo_e_some_depois(self):
        self.assertTrue(self.a.precisa_configurar())
        with self.assertRaises(PermissionError):
            self.a.criar_primeiro("errado", "dono", "senha-bem-grande")
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        self.assertFalse(os.path.exists(os.path.join(self.pasta, "codigo-primeiro-acesso.txt")))
        with self.assertRaises(PermissionError):
            self.a.criar_primeiro("qualquer", "outro", "senha-bem-grande")

    def test_senha_curta_e_usuario_invalido(self):
        with self.assertRaises(ValueError):
            self.a.criar_primeiro(self.codigo(), "dono", "curta")
        with self.assertRaises(ValueError):
            self.a.criar_primeiro(self.codigo(), "Dono Com Espaco", "senha-bem-grande")

    def test_login_sessao_e_sair(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        with self.assertRaises(PermissionError):
            self.a.entrar("dono", "senha-errada!!")
        tok = self.a.entrar("Dono", "senha-bem-grande")
        self.assertEqual(self.a.sessao(tok), "dono")
        with open(os.path.join(self.pasta, "sessoes.json")) as f:
            self.assertNotIn(tok, f.read())  # no disco só vai o hash do token
        self.a.sair(tok)
        self.assertIsNone(self.a.sessao(tok))

    def test_hash_de_senha_no_disco(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        with open(os.path.join(self.pasta, "usuarios.json")) as f:
            self.assertNotIn("senha-bem-grande", f.read())

    def test_inexistentes_nao_trancam_o_dono_nem_o_primeiro_acesso(self):
        recusas = em_paralelo(lambda: self.a.entrar("fulano", "errada-errada"), acesso.LIMITE + 2)
        self.assertEqual(recusas.count(DEMAIS), 2)  # o balde dos inexistentes encheu, mesmo em paralelo
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        self.assertEqual(self.a.sessao(self.a.entrar("dono", "senha-bem-grande")), "dono")

    def test_primeiro_acesso_tem_balde_proprio(self):
        recusas = em_paralelo(lambda: self.a.criar_primeiro("errado", "dono", "senha-bem-grande"), acesso.LIMITE)
        self.assertEqual(recusas, ["código de primeiro acesso incorreto"] * acesso.LIMITE)
        with self.assertRaisesRegex(PermissionError, DEMAIS):
            self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        self.a._criar("dono", "senha-bem-grande")  # com o dono existindo, o balde cheio do primeiro acesso não o tranca
        self.assertEqual(self.a.sessao(self.a.entrar("dono", "senha-bem-grande")), "dono")

    def test_erros_num_usuario_trancam_so_ele(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        self.a._criar("outro", "outra-senha-grande")
        em_paralelo(lambda: self.a.entrar("dono", "errada-errada"), acesso.LIMITE)
        with self.assertRaisesRegex(PermissionError, DEMAIS):
            self.a.entrar("dono", "senha-bem-grande")
        self.assertEqual(self.a.sessao(self.a.entrar("outro", "outra-senha-grande")), "outro")
        with self.assertRaisesRegex(PermissionError, "incorretos"):
            self.a.entrar("fulano", "errada-errada")

    def test_sessao_cai_quando_o_usuario_some(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        tok = self.a.entrar("dono", "senha-bem-grande")
        os.unlink(os.path.join(self.pasta, "usuarios.json"))  # dono apagou os usuários para recuperar o acesso
        self.assertIsNone(Acesso(self.pasta).sessao(tok))

    def test_sessao_antiga_cai_quando_o_mesmo_nome_e_recriado(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        roubado = self.a.entrar("dono", "senha-bem-grande")
        os.unlink(os.path.join(self.pasta, "usuarios.json"))  # recomeçar do zero, com o mesmo nome
        novo = Acesso(self.pasta)
        novo.criar_primeiro(self.codigo(), "dono", "outra-senha-grande")
        self.assertIsNone(novo.sessao(roubado))
        self.assertIsNone(Acesso(self.pasta).sessao(roubado))  # e continua sem valer depois de reiniciar

    def test_codigo_vazio_nunca_vale(self):
        open(os.path.join(self.pasta, "codigo-primeiro-acesso.txt"), "w").close()  # gravação que falhou no meio
        with self.assertRaisesRegex(PermissionError, "não encontrado"):
            self.a.criar_primeiro("", "dono", "senha-bem-grande")
        self.assertTrue(self.a.precisa_configurar())
        novo = Acesso(self.pasta)  # ao subir, o servidor troca o arquivo inválido por um código novo
        self.assertEqual(len(self.codigo()), 16)
        with self.assertRaises(PermissionError):
            novo.criar_primeiro("", "dono", "senha-bem-grande")
        novo.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        self.assertFalse(novo.precisa_configurar())

    def test_scrypt_grava_parametros_e_recusa_hash_sem_eles(self):
        self.a.criar_primeiro(self.codigo(), "dono", "senha-bem-grande")
        u = self.a.usuarios["dono"]
        self.assertEqual((u["n"], u["r"], u["p"]), (2 ** 15, 8, 1))
        sal = os.urandom(16)
        antigo = hashlib.scrypt(b"senha-antiga-ok", salt=sal, n=2 ** 14, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
        self.a.usuarios["velho"] = {"sal": sal.hex(), "hash": antigo.hex(), "criado": 0}  # gravado sem n, r e p
        with self.assertRaisesRegex(PermissionError, "incorretos"):
            self.a.entrar("velho", "senha-antiga-ok")


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Leitor:
            def foto(self):
                return {**e.resumir(AG, []), "atualizado": None, "erro": None}
        cls.srv = e.Servidor(("127.0.0.1", 0), e.Pagina)
        cls.srv.leitor, cls.srv.cred, cls.srv.acesso = Leitor(), None, Acesso(PASTA)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_address[1]
        e.BASE = cls.base
        with open(os.path.join(PASTA, "codigo-primeiro-acesso.txt")) as f:
            codigo = f.read().strip()
        cls.srv.acesso.criar_primeiro(codigo, "dono", "senha-bem-grande")

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, rota, cab=None, dados=None, metodo=None):
        r = urllib.request.Request(self.base + rota, headers=cab or {}, data=dados, method=metodo)

        class SemRedirecionar(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        op = urllib.request.build_opener(SemRedirecionar)
        try:
            with op.open(r) as resp:
                return resp.status, resp.read(), resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read(), err.headers

    def entrar(self):
        corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande"}).encode()
        st, _, h = self.req("/entrar", {"Origin": self.base, "Content-Type": "application/x-www-form-urlencoded"}, corpo)
        self.assertEqual(st, 303)
        ck = h["Set-Cookie"]
        self.assertIn("HttpOnly", ck); self.assertIn("SameSite=Lax", ck)
        return {"Cookie": ck.split(";")[0]}

    def test_sem_login_vai_para_entrar(self):
        self.assertEqual(self.req("/")[0], 302)
        self.assertEqual(self.req("/api/estado")[0], 401)
        self.assertEqual(self.req("/oauth/conectar")[0], 302)
        self.assertEqual(self.req("/entrar")[0], 200)
        self.assertEqual(self.req("/logo.png")[0], 200)

    def test_login_errado_nao_cria_sessao(self):
        corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "errada-errada"}).encode()
        st, html, h = self.req("/entrar", {"Origin": self.base}, corpo)
        self.assertEqual(st, 200); self.assertIsNone(h.get("Set-Cookie")); self.assertIn("incorretos", html.decode())

    def test_post_de_outra_origem_e_recusado(self):
        corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande"}).encode()
        self.assertEqual(self.req("/entrar", {"Origin": "https://malicioso.example"}, corpo)[0], 403)
        self.assertEqual(self.req("/entrar", {}, corpo)[0], 403)

    def test_origin_null_e_recusado_mesmo_com_referer(self):
        self.assertEqual(self.req("/entrar")[2]["Referrer-Policy"], "same-origin")  # o navegador manda o Origin real
        corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande", "codigo": "x"}).encode()
        for rota in ("/entrar", "/primeiro-acesso", "/sair"):
            self.assertEqual(self.req(rota, {"Origin": "null"}, corpo)[0], 403, rota)
            self.assertEqual(self.req(rota, {"Origin": "null", "Referer": self.base + "/entrar"}, corpo)[0], 403, rota)

    def test_em_https_o_cookie_e_host_e_so_ele_vale(self):
        antes, e.BASE = e.BASE, "https://escritorio.exemplo.ts.net"
        try:
            corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande"}).encode()
            st, _, h = self.req("/entrar", {"Origin": e.BASE}, corpo)
            ck = h["Set-Cookie"]
            self.assertTrue(ck.startswith("__Host-esc_sessao="), ck[:20])
            self.assertIn("; Path=/;", ck); self.assertIn("; Secure", ck); self.assertNotIn("Domain", ck)
            tok = ck.split(";")[0].partition("=")[2]
            self.assertEqual(self.req("/api/estado", {"Cookie": "esc_sessao=" + tok})[0], 401)
            self.assertEqual(self.req("/api/estado", {"Cookie": "__Host-esc_sessao=" + tok})[0], 200)
        finally:
            e.BASE = antes

    def test_com_login_ve_tudo_e_estaticos_fechados(self):
        cab = self.entrar()
        st, corpo, h = self.req("/api/estado", cab)
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(corpo)["agentes"][0]["nome"], "Pixel")
        self.assertIn("frame-ancestors 'none'", h["Content-Security-Policy"])
        self.assertEqual(self.req("/", cab)[0], 200)
        for rota in ("/escritorio.py", "/../escritorio.py", "/static/app.js", "/dados/oauth.json", "/entrar.html", "/acesso.py"):
            self.assertEqual(self.req(rota, cab)[0], 404, rota)

    def test_marca_e_logo(self):
        cab = {**self.entrar(), "Origin": self.base}
        st, corpo, _ = self.req("/api/marca", {**cab, "Content-Type": "application/json"}, json.dumps({"empresa": "Acme", "cor": "#112233"}).encode())
        self.assertEqual(st, 200); self.assertEqual(json.loads(corpo)["empresa"], "Acme")
        self.assertEqual(self.req("/api/marca", cab, json.dumps({"empresa": "<script>", "cor": "#112233"}).encode())[0], 400)
        self.assertEqual(self.req("/api/logo", {**cab, "Content-Type": "image/png"}, b"nao e imagem")[0], 400)
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
        self.assertEqual(self.req("/api/logo", {**cab, "Content-Type": "image/png"}, png)[0], 200)
        st, dados, h = self.req("/logo", cab)
        self.assertEqual((st, h["Content-Type"]), (200, "image/png")); self.assertTrue(dados.startswith(b"\x89PNG"))
        self.assertEqual(self.req("/api/logo", {"Origin": self.base, "Content-Type": "image/png"}, png)[0], 401)  # sem sessão

    def test_versao_do_logo_muda_a_cada_troca(self):
        cab = {**self.entrar(), "Origin": self.base, "Content-Type": "image/png"}
        logo = lambda dados: json.loads(self.req("/api/logo", cab, b"\x89PNG\r\n\x1a\n" + dados)[1])["logo"]
        a, b = logo(b"1" * 64), logo(b"2" * 64)   # seguidas, no mesmo segundo
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("/logo?v=") and b.startswith("/logo?v="))
        self.assertEqual(logo(b"1" * 64), a)   # o mesmo conteúdo mantém a URL (e o cache)
        st, corpo, _ = self.req("/api/logo/remover", {**cab, "Content-Type": "application/json"}, b"{}")
        with open(os.path.join(e.ESTATICO, "logo.png"), "rb") as f:   # sem logo enviado: a versão do logo padrão
            padrao = hashlib.sha256(f.read()).hexdigest()[:16]
        self.assertEqual((st, json.loads(corpo)["logo"]), (200, f"/logo?v={padrao}"))

    def test_fontes_publicas_com_tipo_e_cache(self):
        for nome, tipo in (("fontes/source-sans-3.woff2", "font/woff2"), ("fontes/doto.woff2", "font/woff2"), ("fontes/figtree.ttf", "font/ttf")):
            st, corpo, h = self.req("/" + nome)   # sem sessão: a tela de entrar usa
            self.assertEqual((st, h["Content-Type"], h["Cache-Control"]), (200, tipo, "public, max-age=3600"), nome)
            with open(os.path.join(e.ESTATICO, nome), "rb") as f:
                self.assertEqual(corpo, f.read(), nome)
        self.assertEqual(self.req("/fontes/OFL-source-sans-3-doto.txt")[0], 302)   # fora da lista fechada: vai para /entrar

    def test_logo_publico_so_como_imagem(self):
        # a tela de entrar mostra o logo personalizado: sem sessão, só PNG/JPEG/WEBP pelos bytes; o resto vira o padrão
        with open(os.path.join(e.ESTATICO, "logo.png"), "rb") as f:
            padrao = f.read()
        try:
            for dados, tipo in ((b"\xff\xd8\xff\xe0" + b"j" * 64, "image/jpeg"), (b"RIFF\0\0\0\0WEBP" + b"w" * 64, "image/webp"),
                                (b"<script>alert(1)</script>", None), (b"<svg xmlns='http://www.w3.org/2000/svg'/>", None),
                                (b"\x89PNG\r\n\x1a\n" + b"p" * e.LOGO_MAX, None)):   # maior que o limite
                with open(e.ARQ_LOGO, "wb") as f:
                    f.write(dados)
                st, corpo, h = self.req("/logo?v=qualquer")
                self.assertEqual(st, 200)
                self.assertEqual((h["Content-Type"], corpo), (tipo, dados) if tipo else ("image/png", padrao))
                self.assertEqual(h["X-Content-Type-Options"], "nosniff")
                self.assertIsNone(h["Access-Control-Allow-Origin"])
        finally:
            os.unlink(e.ARQ_LOGO)
        self.assertEqual(self.req("/logo")[1], padrao)   # sem logo enviado
        self.assertEqual(self.req("/api/config")[0], 401)
        self.assertEqual(self.req("/api/logo", {"Origin": self.base, "Content-Type": "image/png"}, b"\x89PNG\r\n\x1a\n")[0], 401)

    def test_previa_so_na_previa(self):
        # a faixa "Prévia de desenvolvimento" nunca pode aparecer no servidor de verdade
        cab = self.entrar()
        st, corpo, _ = self.req("/api/config", cab)
        self.assertEqual(st, 200); self.assertNotIn("previa", json.loads(corpo))
        self.srv.previa_sem_login = True
        try:
            self.assertIs(json.loads(self.req("/api/config")[1])["previa"], True)
        finally:
            del self.srv.previa_sem_login

    def test_scripts_e_vendor_com_login_tipo_e_cache(self):
        cab = self.entrar()
        for nome, tipo in e.ARQUIVOS.items():
            if not nome.endswith(".js"):
                continue
            st, corpo, h = self.req("/" + nome, cab)
            self.assertEqual((st, h["Content-Type"]), (200, "text/javascript; charset=utf-8"), nome)
            cache = "private, max-age=31536000, immutable" if nome.startswith("vendor/") else "no-cache"
            self.assertEqual(h["Cache-Control"], cache, nome)
            with open(os.path.join(e.ESTATICO, nome), "rb") as f:
                self.assertEqual(corpo, f.read(), nome)   # inteiro, mesmo com a escrita em blocos
        for rota in ("/vendor/three-0.186.1/LICENSE", "/vendor/", "/vendor/three-0.186.1/", "/vendor/three-0.186.1/../../app.js"):
            self.assertEqual(self.req(rota, cab)[0], 404, rota)

    def test_vendor_sem_login_vai_para_entrar(self):
        for nome in VENDOR:
            if nome.endswith(".js"):
                st, _, h = self.req("/vendor/three-0.186.1/" + nome)
                self.assertEqual((st, h["Location"]), (302, "/entrar"), nome)

    def test_csp_so_scripts_da_propria_origem(self):
        h = self.req("/entrar")[2]["Content-Security-Policy"]
        diretivas = {d.split()[0]: d.split()[1:] for d in h.split(";") if d.strip()}
        self.assertEqual(diretivas["script-src"], ["'self'"])
        self.assertNotIn("unsafe-eval", h); self.assertNotIn("unsafe-inline", h)

    def test_retorno_do_oauth_nao_repete_texto_de_fora(self):
        erro = urllib.parse.quote("acesso negado, entre em evil.example")
        st, corpo, _ = self.req("/oauth/retorno?error=" + erro, self.entrar())
        self.assertEqual(st, 400)
        self.assertNotIn(b"evil.example", corpo)

    def test_sair_encerra_sessao(self):
        cab = self.entrar()
        self.assertEqual(self.req("/sair", {**cab, "Origin": self.base}, b"", "POST")[0], 303)
        self.assertEqual(self.req("/api/estado", cab)[0], 401)


VENDOR = {  # three@0.186.1 do npm (tarball sha512-blFeqb49...), sem alteração
    "three.module.js": "9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea",
    "three.core.js": "9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6",
    "LICENSE": "8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc",
}
# Especificadores de módulo em qualquer posição (minificado, depois de ";", nome importado entre aspas): todo
# from "x" (import e export), import "x" e import("x"). Sem parser: um texto 'from "x"' dentro de string também
# conta, e o teste reprova; é o lado seguro.
ESTATICO_DE = re.compile(r"\bfrom\s*(['\"])([^'\"\n]+)\1|\bimport\s*(['\"])([^'\"\n]+)\3")
VAO = r"(?:\s|/\*.*?\*/|//[^\n]*\n)*"   # espaço, quebra de linha, comentário /* */ ou // (até o fim da linha) entre as partes do import( )
DINAMICO = re.compile(r"\bimport" + VAO + r"\((?!\s*\))", re.S)   # "import()" vazio só aparece em comentário
DINAMICO_LITERAL = re.compile(r"\bimport" + VAO + r"\(" + VAO + r"(['\"`])([^'\"`\n]+)\1", re.S)


class Vendor(unittest.TestCase):
    def test_sha256_igual_ao_do_npm(self):
        for nome, sha in VENDOR.items():
            with open(os.path.join(e.ESTATICO, "vendor", "three-0.186.1", nome), "rb") as f:
                self.assertEqual(hashlib.sha256(f.read()).hexdigest(), sha, nome)

    def importados(self, nome):
        with open(os.path.join(e.ESTATICO, nome), encoding="utf-8") as f:
            js = f.read()
        literais = DINAMICO_LITERAL.findall(js)
        self.assertEqual(len(DINAMICO.findall(js)), len(literais), f"{nome}: import() sem caminho literal")
        return [m[1] or m[3] for m in ESTATICO_DE.findall(js)] + [m[1] for m in literais]

    def test_extrator_pega_import_fora_do_comeco_da_linha(self):
        js = ('const a=1;import{b}from"./um.js";export*from"./dois.js"\n'
              'import { "nome com aspas" as c } from "./tres.js"; import "./quatro.js";\n'
              'export {\n  d,\n} from "three"; const m = await import(`./cinco.js?v=${v}`);\n'
              'import\n  ("./seis.js"); import /* x */ ( /* y */ "./sete.js"); import(\n  caminho)\n'
              'import // comentário (com parêntese)\n  ("./oito.js"); import( // o caminho\n  "./nove.js")')
        self.assertEqual([m[1] or m[3] for m in ESTATICO_DE.findall(js)], ["./um.js", "./dois.js", "./tres.js", "./quatro.js", "three"])
        self.assertEqual([m[1] for m in DINAMICO_LITERAL.findall(js)], ["./cinco.js?v=${v}", "./seis.js", "./sete.js", "./oito.js", "./nove.js"])
        self.assertEqual(len(DINAMICO.findall(js)), 6)   # o import(caminho) não é literal: o teste do grafo reprova

    def test_grafo_de_modulos_fechado(self):
        for nome in e.ARQUIVOS:
            if not nome.endswith(".js"):
                continue
            with open(os.path.join(e.ESTATICO, nome), encoding="utf-8") as f:
                self.assertNotRegex(f.read(), r"Worker\b|importScripts", f"{nome}: Worker ou importScripts carregam código fora do grafo")
            for spec in self.importados(nome):
                self.assertRegex(spec, r"^\.{1,2}/", f"{nome}: '{spec}' não é caminho relativo (especificador nu ou outra origem)")
                alvo = posixpath.normpath(posixpath.join(posixpath.dirname(nome), spec.split("?")[0]))
                self.assertIn(alvo, e.ARQUIVOS, f"{nome} importa {spec}, que o servidor não serve")
        self.assertEqual(self.importados("vendor/three-0.186.1/three.module.js"), ["./three.core.js", "./three.core.js"])
        self.assertEqual(self.importados("vendor/three-0.186.1/three.core.js"), [])

    def test_paginas_so_carregam_o_que_o_servidor_serve(self):
        # todo <script src>, <link href> e <img src> local das páginas tem que estar em ARQUIVOS e existir no disco;
        # o que a tela de login carrega tem que ser público (sem sessão, o resto vira redirecionamento para /entrar)
        ref = re.compile(r"<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
        for pagina, publico in (("index.html", False), ("entrar.html", True)):
            with open(os.path.join(e.ESTATICO, pagina), encoding="utf-8") as f:
                html = f.read()
            if pagina == "entrar.html":
                html = e.pagina_login().decode()   # o que o navegador recebe, com os {{...}} preenchidos
            locais = [u for u in ref.findall(html) if not re.match(r"[a-z][a-z0-9+.-]*:|//|#", u, re.I)]
            self.assertTrue(locais, pagina)
            versoes = set()
            for u in locais:
                nome = u.split("?")[0].lstrip("/")
                if nome == "logo":   # rota pública do logo (test_logo_publico_so_como_imagem); o ?v= dela é o hash do logo
                    continue
                self.assertIn(nome, e.ARQUIVOS, f"{pagina} carrega {u}, que o servidor não serve (404)")
                self.assertTrue(os.path.isfile(os.path.join(e.ESTATICO, nome)), f"{pagina}: {nome} não existe")
                if publico:
                    self.assertIn(nome, e.PUBLICOS, f"{pagina} carrega {u}, que exige login")
                if "?v=" in u:
                    versoes.add(u.split("?v=")[1])
            self.assertLessEqual(len(versoes), 1, f"{pagina} com ?v= diferentes: {sorted(versoes)}")

    def test_css_so_carrega_o_que_o_servidor_serve(self):
        # as fontes entram pelo @font-face, url(...), que o teste das páginas não lê; o que o entrar.css usa tem que ser público
        for folha, publico in (("estilo.css", False), ("entrar.css", True)):
            with open(os.path.join(e.ESTATICO, folha), encoding="utf-8") as f:
                css = f.read()
            locais = [u for u in re.findall(r"url\(\s*[\"']?([^\"')]+?)[\"']?\s*\)", css) if not re.match(r"[a-z][a-z0-9+.-]*:|//|#", u, re.I)]
            self.assertTrue(locais, folha)
            for u in locais:
                nome = u.split("?")[0].lstrip("/")
                self.assertIn(nome, e.ARQUIVOS, f"{folha} carrega {u}, que o servidor não serve (404)")
                self.assertTrue(os.path.isfile(os.path.join(e.ESTATICO, nome)), f"{folha}: {nome} não existe")
                if publico:
                    self.assertIn(nome, e.PUBLICOS, f"{folha} carrega {u}, que exige login")

    def test_vendor_sem_execucao_dinamica(self):
        for nome in VENDOR:
            if nome.endswith(".js"):
                with open(os.path.join(e.ESTATICO, "vendor", "three-0.186.1", nome), encoding="utf-8") as f:
                    js = f.read()
                self.assertNotRegex(js, r"\beval\s*\(|new\s+Function\b", nome)

    def test_maquete_sem_atalhos_perigosos(self):
        caminho = os.path.join(e.ESTATICO, "maquete.js")
        if not os.path.exists(caminho):
            self.skipTest("static/maquete.js ainda não existe (fatia 1)")
        with open(caminho, encoding="utf-8") as f:
            js = f.read()
        for proibido in (r"innerHTML", r"outerHTML", r"insertAdjacentHTML", r"document\.write", r"\beval\s*\(",
                         r"new\s+Function\b", r"importmap", r"setAttribute\(\s*['\"]style", r"Worker\b", r"importScripts",
                         r"\bURL\s*\(", r"createObjectURL", r"blob:"):
            self.assertNotRegex(js, proibido)


class Envio(unittest.TestCase):
    class Saida:   # o socket do navegador: aceita os cabeçalhos e o 1º bloco, depois falha
        def __init__(self, erro):
            self.erro, self.escritas = erro, 0

        def write(self, dados):
            self.escritas += 1
            if self.escritas > 2:
                raise self.erro

    def manipulador(self, erro):
        h = e.Pagina.__new__(e.Pagina)
        h.request_version, h.command, h.requestline, h.client_address = "HTTP/1.1", "GET", "GET /x HTTP/1.1", ("127.0.0.1", 0)
        h.close_connection, h.wfile = False, self.Saida(erro)
        return h

    def test_aba_fechada_no_meio_do_envio_encerra_em_silencio(self):
        for erro in (BrokenPipeError(), ConnectionResetError(), ConnectionAbortedError()):
            h = self.manipulador(erro)
            h._envia(200, b"x" * 300_000, "text/javascript; charset=utf-8")
            self.assertTrue(h.close_connection, type(erro).__name__)
            self.assertEqual(h.wfile.escritas, 3)   # parou no bloco que falhou

    def test_aba_fechada_antes_do_corpo_tambem(self):
        h = self.manipulador(BrokenPipeError())
        h.wfile.escritas = 2   # a próxima escrita (a dos cabeçalhos) já falha
        h._envia(200, b"x" * 10)
        self.assertTrue(h.close_connection)

    def test_outro_erro_de_escrita_continua_subindo(self):
        with self.assertRaises(OSError):
            self.manipulador(OSError("disco cheio"))._envia(200, b"x" * 300_000)


class PrimeiroAcessoFechado(unittest.TestCase):
    """usuarios.json ilegível nunca vira "sem usuários", e o `escritorio.py codigo` só lê."""
    CODIGO = "0123456789abcdef"
    ILEGIVEIS = {"json cortado": b'{"segredo-123"', "vazio": b"", "lista": b"[]", "utf-8 inválido": b"\xff", "pasta": None}

    def setUp(self):
        self.pasta = tempfile.mkdtemp(prefix="primeiro-acesso-")
        self.usuarios, self.arq_codigo = os.path.join(self.pasta, "usuarios.json"), os.path.join(self.pasta, "codigo-primeiro-acesso.txt")

    def tearDown(self):
        shutil.rmtree(self.pasta, ignore_errors=True)

    def plantar(self, usuarios, codigo=True):
        if usuarios is None:
            os.mkdir(self.usuarios)   # IsADirectoryError no Linux, PermissionError no Windows: o ramo OSError
        else:
            with open(self.usuarios, "wb") as f:
                f.write(usuarios)
        if codigo:
            with open(self.arq_codigo, "w") as f:
                f.write(self.CODIGO + "\n")

    def foto(self):   # o que há na pasta, com o conteúdo de cada arquivo
        r = {}
        for n in sorted(os.listdir(self.pasta)):
            c = os.path.join(self.pasta, n)
            r[n] = None if os.path.isdir(c) else open(c, "rb").read()
        return r

    def codigo_cli(self, pasta=None, base="http://127.0.0.1:7999"):
        caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), "escritorio.py")
        return subprocess.run([sys.executable, "-I", caminho, "codigo"], capture_output=True, text=True, errors="replace", timeout=60,
                              env={**os.environ, "ESCRITORIO_DADOS": pasta or self.pasta, "ESCRITORIO_BASE": base})

    def test_acesso_nao_sobe_com_usuarios_ilegivel(self):
        for nome, conteudo in self.ILEGIVEIS.items():
            for com_codigo in (False, True):
                with self.subTest(nome, com_codigo=com_codigo):
                    self.tearDown(); self.setUp()
                    self.plantar(conteudo, com_codigo)
                    antes = self.foto()
                    with self.assertRaises(acesso.UsuariosIlegiveis) as c:
                        Acesso(self.pasta)
                    self.assertEqual(self.foto(), antes)   # nem código novo, nem arquivo apagado ou trocado
                    self.assertIn("usuarios.json", str(c.exception))
                    self.assertNotIn("segredo-123", str(c.exception))
        self.tearDown(); self.setUp()   # controle: sem o arquivo é o primeiro acesso de sempre
        a = Acesso(self.pasta)
        self.assertTrue(a.precisa_configurar())
        self.assertEqual(len(acesso.ler_codigo(self.arq_codigo)), 16)

    def test_main_para_antes_de_ler_e_de_abrir_a_porta(self):
        self.plantar(b"{", codigo=False)
        antes = e.DADOS, e.BASE, e.Credenciais, e.Leitor, e.Servidor
        def proibido(*a, **k):
            self.fail("o main() montou leitor/servidor com usuarios.json ilegível")
        e.DADOS, e.BASE, e.Credenciais, e.Leitor, e.Servidor = self.pasta, "http://127.0.0.1:7371", proibido, proibido, proibido
        try:
            with self.assertRaises(SystemExit) as c:
                e.main()
        finally:
            e.DADOS, e.BASE, e.Credenciais, e.Leitor, e.Servidor = antes
        self.assertIn("usuarios.json", str(c.exception.code))
        self.assertFalse(os.path.exists(self.arq_codigo))

    def test_codigo_mostrado_vale_e_depois_some(self):
        Acesso(self.pasta)   # o serviço subindo cria o código
        r = self.codigo_cli()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("http://127.0.0.1:7999/entrar", r.stdout)
        self.assertEqual(r.stderr, "")
        mostrado = re.findall(r"\b[0-9a-f]{16}\b", r.stdout)
        self.assertEqual(mostrado, [acesso.ler_codigo(self.arq_codigo)])
        self.assertTrue(r.stdout.startswith("+---"))   # quadro em ASCII: no Windows, com pipe, a saída é cp1252 (o -I ignora PYTHONIOENCODING)
        Acesso(self.pasta).criar_primeiro(mostrado[0], "dono", "senha-bem-grande")
        with open(self.arq_codigo, "w") as f:   # um código que sobrou (unlink que falhou) também não aparece
            f.write(mostrado[0] + "\n")
        r = self.codigo_cli()
        self.assertEqual(r.returncode, 1)
        self.assertIn("foi feito", r.stderr)   # trecho ASCII: o filho escreve no encoding do sistema
        self.assertNotIn(mostrado[0], r.stdout + r.stderr)

    def test_codigo_so_le(self):
        nova = os.path.join(self.pasta, "nao-existe")
        r = self.codigo_cli(nova)
        self.assertEqual(r.returncode, 1)
        self.assertIn("systemctl status escritorio", r.stderr)
        self.assertFalse(os.path.exists(nova))
        r = self.codigo_cli()
        self.assertEqual((r.returncode, os.listdir(self.pasta)), (1, []))

    def test_codigo_recusa_usuarios_ilegivel(self):
        self.plantar(b'{"segredo-123"')
        r = self.codigo_cli()
        self.assertEqual(r.returncode, 1)
        self.assertIn("usuarios.json", r.stderr)
        self.assertNotIn(self.CODIGO, r.stdout + r.stderr)
        self.assertNotIn("segredo-123", r.stdout + r.stderr)


class MarcaNoLogin(unittest.TestCase):
    def setUp(self):
        self.antes, self.pasta = (e.ESTATICO, e.TIMES, e.ARQ_MARCA, e.ARQ_LOGO), tempfile.mkdtemp(prefix="escritorio-login-")
        e.ESTATICO, e.TIMES, e.ARQ_MARCA, e.ARQ_LOGO = (self.pasta, os.path.join(self.pasta, "times.json"),
                                                        os.path.join(self.pasta, "marca.json"), os.path.join(self.pasta, "logo.img"))
        with open(os.path.join(self.pasta, "entrar.html"), "w", encoding="utf-8") as f:
            f.write("{{empresa}}|{{cor}}|{{logo}}|{{erro}}|{{nada}}")

    def tearDown(self):
        e.ESTATICO, e.TIMES, e.ARQ_MARCA, e.ARQ_LOGO = self.antes
        shutil.rmtree(self.pasta)

    def times(self, conteudo):
        with open(e.TIMES, "w", encoding="utf-8") as f:
            json.dump(conteudo, f)

    def test_marca_escapada_e_cor_validada(self):
        # & e ' passam no rótulo e precisam sair escapados (o entrar.html usa a empresa em atributo e texto)
        self.times({"empresa": "Café & Cia's", "cor": "red"})
        self.assertEqual(e.pagina_login("a<b").decode(), "Café &amp; Cia&#x27;s|#f5b83d|/logo?v=0|a&lt;b|{{nada}}")
        self.times({"empresa": "Acme", "cor": "#12abEF"})
        self.assertEqual(e.pagina_login().decode(), "Acme|#12abEF|/logo?v=0||{{nada}}")

    def test_logo_versionado_pelo_conteudo(self):
        self.times({"empresa": "Acme"})
        padrao = b"\x89PNG\r\n\x1a\n" + b"padrao"
        with open(os.path.join(e.ESTATICO, "logo.png"), "wb") as f:   # o logo padrão novo fura o cache de 1 h
            f.write(padrao)
        self.assertEqual(e.config_publica()["logo"], f"/logo?v={hashlib.sha256(padrao).hexdigest()[:16]}")
        png = b"\x89PNG\r\n\x1a\n" + b"1" * 64   # o do Personalizar vem antes
        with open(e.ARQ_LOGO, "wb") as f:
            f.write(png)
        self.assertEqual(e.pagina_login().decode(), f"Acme|#f5b83d|/logo?v={hashlib.sha256(png).hexdigest()[:16]}||{{{{nada}}}}")

    def test_times_quebrado_nao_derruba_o_login(self):
        self.times(["não é um objeto"])
        self.assertEqual(e.pagina_login().decode(), f"{e.EMPRESA_PADRAO}|#f5b83d|/logo?v=0||{{{{nada}}}}")

    def test_times_fora_do_formato_vale_como_vazio(self):
        # /api/config estourava (o app recarregava a cada 10 s): agora vale o padrão, com um evento no log.
        # O padrão tem os mesmos campos do válido: sem app_url os links "No agentes.chat" viravam "undefined/agents"
        vazio = {"empresa": e.EMPRESA_PADRAO, "times": [], "aparencia": {}, "cor": "#f5b83d",
                 "app_url": f"https://app.agentes.chat/org/{e.ORG}", "clima": None}
        self.assertEqual(e.carregar_times(os.path.join(self.pasta, "nao-existe.json")), vazio)
        for bruto in (["lista"], {"times": ["Dev"]}, {"times": {"Dev": 1}}, {"times": [{"nome": "Dev", "parede": "x"}]},
                      {"aparencia": ["x"]}):
            with self.subTest(bruto=bruto):
                self.times(bruto)
                self.assertEqual(e.carregar_times(), vazio)
                self.assertEqual(e.config_publica()["times"], [])
        self.times({"empresa": "Acme", "times": [{"nome": "Dev", "parede": 2, "agentes": ["pixel"]}]})   # o válido segue igual
        self.assertEqual([(t["nome"], t["parede"], t["agentes"]) for t in e.carregar_times()["times"]], [("Dev", 2, ["pixel"])])

    def test_times_e_marca_absurdos_valem_como_padrao(self):
        # "parede": 1e400 (int(inf) dá OverflowError) e JSON aninhado demais (RecursionError): /api/config sem 500
        self.times({"empresa": "Acme", "times": [{"nome": "Dev", "parede": 1e400}]})
        self.assertEqual(e.config_publica()["empresa"], e.EMPRESA_PADRAO)
        with open(e.TIMES, "w", encoding="utf-8") as f:
            f.write("[" * 100_000 + "]" * 100_000)
        self.assertEqual(e.config_publica()["times"], [])
        self.times({"empresa": "Acme"})
        for marca in ("[]", "null", '"texto"', "[" * 100_000):   # marca.json que não é objeto vale como vazio
            with self.subTest(marca=marca[:10]):
                with open(e.ARQ_MARCA, "w", encoding="utf-8") as f:
                    f.write(marca)
                self.assertEqual(e.config_publica()["empresa"], "Acme")

    def test_fonte_do_codigo_validada(self):
        # AGPL §13: link "Código-fonte". O .env é lido pelo shell como root (escritorio-codigo): nada que ele interprete
        for valor in ("https://git.example.com/acme/escritorio", "https://code.example.com:8443/a/esc_v2~x%20"):
            self.assertEqual(e.fonte_codigo(valor), valor)
        for valor in (None, "", "http://x.example", "https://", "https://x.example/a b", 'https://x.example/"', "https://x.example/'",
                      "https://x.example/$(id)", "https://x.example/a;b", "https://x.example/`id`", "javascript:alert(1)",
                      "https://x.example/a?b=1", " https://x.example", "https://x.example/" + "a" * 190):
            self.assertEqual(e.fonte_codigo(valor), e.FONTE_PADRAO, valor)
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar.sh"), encoding="utf-8") as f:
            self.assertIn(f"=~ ^{e.FONTE_OK.pattern}$ ]]", f.read())   # o instalador valida com a mesma regra
        antes = e.FONTE
        e.FONTE = "https://git.example.com/a-b"
        try:
            self.assertEqual(e.config_publica()["fonte"], "https://git.example.com/a-b")
            with open(os.path.join(self.pasta, "entrar.html"), "w", encoding="utf-8") as f:
                f.write("<a href='{{fonte}}'>")
            self.assertEqual(e.pagina_login().decode(), "<a href='https://git.example.com/a-b'>")
        finally:
            e.FONTE = antes

    def test_etiqueta_exemplo_so_no_nome_padrao(self):
        with open(os.path.join(self.pasta, "entrar.html"), "w", encoding="utf-8") as f:
            f.write("{{empresa}}|{{oculto_exemplo}}")
        casos = (({}, None, True), ({"empresa": "Acme"}, None, False), ({}, {"empresa": "Café Aurora"}, False),
                 ({"empresa": "Acme"}, {"empresa": "Café Aurora"}, False))   # Personalizar > times.json > padrão
        for times, marca, exemplo in casos:
            with self.subTest(times=times, marca=marca):
                self.times(times)
                if marca:
                    with open(e.ARQ_MARCA, "w", encoding="utf-8") as f:
                        json.dump(marca, f)
                elif os.path.exists(e.ARQ_MARCA):
                    os.unlink(e.ARQ_MARCA)
                self.assertIs(e.config_publica()["marca_exemplo"], exemplo)
                self.assertTrue(e.pagina_login().decode().endswith("|" if exemplo else "|hidden"))
        # a instalação nova copia o times.exemplo.json: ele não pode trazer empresa, senão o nome fictício sai sem a etiqueta
        exemplo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "times.exemplo.json")
        self.assertEqual(e.carregar_times(exemplo)["empresa"], e.EMPRESA_PADRAO)


class Voxels(unittest.TestCase):
    def test_avatar_voxels_em_todas_as_combinacoes(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("sem node nesta máquina (o ferramentas/checar_voxels.js roda o avatar.js)")
        r = subprocess.run([node, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ferramentas", "checar_voxels.js")],
                           capture_output=True, text=True, encoding="utf-8", timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-1000:])
        self.assertIn("RESULTADO: tudo certo", r.stdout)


class Configuracao(unittest.TestCase):
    def setUp(self):
        self.antes = e.BASE, e.PORTA, e.ORG
        e.PORTA = 0  # numa regressão, o main() sobe numa porta livre em vez de disputar a 7371

    def tearDown(self):
        e.BASE, e.PORTA, e.ORG = self.antes

    def test_sem_org_o_servidor_nao_sobe(self):
        e.ORG = ""
        with self.assertRaises(SystemExit) as c:
            e.main()
        self.assertIn("AGENTES_ORG", str(c.exception.code))

    def test_https_exige_porta_privilegiada(self):
        e.BASE, e.PORTA, e.ORG = "https://escritorio.exemplo.ts.net", 7371, ""  # sem org: nunca chega a subir
        with self.assertRaises(SystemExit) as c:
            e.main()
        self.assertIn("1024", str(c.exception.code))
        e.PORTA = 737  # porta baixa passa e para só na falta da org
        with self.assertRaises(SystemExit) as c:
            e.main()
        self.assertIn("AGENTES_ORG", str(c.exception.code))


class Credenciais(unittest.TestCase):
    def test_estado_desconhecido_e_recusado(self):
        with tempfile.TemporaryDirectory() as d:
            c = e.Credenciais(os.path.join(d, "oauth.json"))
            c.dados = {"client_id": "c"}
            with self.assertRaises(ValueError):
                c.concluir("codigo", "estado-que-nao-existe")

    def test_escopo_maior_que_leitura_e_recusado(self):
        with tempfile.TemporaryDirectory() as d:
            c = e.Credenciais(os.path.join(d, "oauth.json"))
            with self.assertRaises(e.PermissaoNegada):
                c._guardar({"access_token": "t", "scope": "read write"})


if __name__ == "__main__":
    unittest.main()
