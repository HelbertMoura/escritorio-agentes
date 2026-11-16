import atexit
import json
import os
import shutil
import stat
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

PASTA = tempfile.mkdtemp(prefix="escritorio-teste-andares-")
# no fim do processo, e não do módulo: rodando a suíte inteira, ela pode ser o ESCRITORIO_DADOS dos módulos seguintes
atexit.register(shutil.rmtree, PASTA, ignore_errors=True)
os.environ.setdefault("ESCRITORIO_DADOS", PASTA)   # rodando junto com o test_escritorio, vale a pasta dele
if "ESCRITORIO_TIMES" not in os.environ:
    os.environ["ESCRITORIO_TIMES"] = os.path.join(PASTA, "times.json")
    with open(os.environ["ESCRITORIO_TIMES"], "w", encoding="utf-8") as _f:
        _f.write("{}")
os.environ.setdefault("AGENTES_ORG", "00000000-0000-4000-8000-000000000000")  # org fictícia
import andares  # noqa: E402
import escritorio as e  # noqa: E402
from acesso import Acesso  # noqa: E402

ORG_B = "11111111-1111-4111-8111-111111111111"
ORG_C = "22222222-2222-4222-8222-222222222222"


def tarefa(org, agente="b1"):
    return {"agent": {"id": agente}, "status": "running", "label": "x", "started_at": "2026-11-14T10:00:00Z",
            "url": f"https://app.agentes.chat/org/{org}/c/33333333-3333-4333-8333-333333333333"}


class Registro(unittest.TestCase):
    def setUp(self):
        self.dados = tempfile.mkdtemp(prefix="andares-reg-")
        self.addCleanup(shutil.rmtree, self.dados, ignore_errors=True)

    def test_sem_arquivo_nao_tem_andar_extra(self):
        self.assertEqual(andares.Andares(self.dados, e.ORG).lista, [])
        self.assertFalse(os.path.exists(os.path.join(self.dados, andares.ARQ)))

    def test_criar_renomear_remover_e_reler(self):
        r = andares.Andares(self.dados, e.ORG)
        a = r.criar(" Marketing ", ORG_B.upper())
        self.assertRegex(a["id"], r"^[0-9a-f]{8}$")
        self.assertEqual((a["nome"], a["org"]), ("Marketing", ORG_B))
        self.assertTrue(os.path.isdir(andares.pasta(self.dados, a["id"])))
        if os.name != "nt":   # o Windows não tem os bits de permissão do Unix
            modo = stat.S_IMODE(os.stat(os.path.join(self.dados, andares.ARQ)).st_mode)
            self.assertEqual(modo, 0o600)
        r.renomear(a["id"], "Vendas")
        self.assertEqual(andares.Andares(self.dados, e.ORG).lista, [{**a, "nome": "Vendas"}])
        r.remover(a["id"])
        self.assertEqual(andares.Andares(self.dados, e.ORG).lista, [])
        self.assertTrue(os.path.isdir(andares.pasta(self.dados, a["id"])))   # a pasta fica

    def test_recusas(self):
        r = andares.Andares(self.dados, e.ORG)
        for nome, org in (("", ORG_B), ("<b>", ORG_B), ("x" * 41, ORG_B), ("Ok", "nao-e-uuid"), ("Ok", e.ORG)):
            with self.assertRaises(ValueError, msg=(nome, org)):
                r.criar(nome, org)
        r.criar("B", ORG_B)
        with self.assertRaisesRegex(ValueError, "já é um andar"):
            r.criar("B de novo", ORG_B)
        with self.assertRaises(KeyError):
            r.renomear("ffffffff", "X")

    def test_teto_de_andares_extras(self):
        r = andares.Andares(self.dados, e.ORG)
        for i in range(andares.MAX_EXTRAS):
            r.criar(f"Andar {i}", f"{i + 1:08x}-0000-4000-8000-000000000000")
        with self.assertRaisesRegex(ValueError, "andares extras"):
            r.criar("Mais um", ORG_C)

    def test_arquivo_ilegivel_nao_sobe(self):
        for conteudo in ("{", json.dumps({"v": 1, "andares": [{"id": "../../x", "nome": "A", "org": ORG_B}]}),
                         json.dumps({"v": 1, "andares": [{"id": "aaaaaaaa", "nome": "A", "org": e.ORG}]}),
                         json.dumps({"v": 2, "andares": []})):
            with open(os.path.join(self.dados, andares.ARQ), "w", encoding="utf-8") as f:
                f.write(conteudo)
            with self.assertRaises(andares.AndaresIlegiveis, msg=conteudo):
                andares.Andares(self.dados, e.ORG)

    def test_v2_do_saguao(self):
        """O v2 (gravado pela migração): o térreo é o saguão, e a org do principal pode ser a de um andar extra."""
        v2 = {"v": 2, "terreo": "saguao", "andares": [{"id": "aaaaaaaa", "nome": "Dev Maniac's", "org": e.ORG}]}
        with open(os.path.join(self.dados, andares.ARQ), "w", encoding="utf-8") as f:
            json.dump(v2, f)
        r = andares.Andares(self.dados, e.ORG)
        self.assertTrue(r.saguao)
        self.assertEqual(r.lista, v2["andares"])
        b = r.criar("B", ORG_B)
        with self.assertRaisesRegex(ValueError, "já é um andar"):
            r.criar("De novo", e.ORG)
        with open(os.path.join(self.dados, andares.ARQ), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {**v2, "andares": [*v2["andares"], b]})   # grava o v2 que leu
        self.assertFalse(andares.Andares(tempfile.mkdtemp(dir=self.dados), e.ORG).saguao)   # sem arquivo: clássico
        for ruim in ({**v2, "terreo": "outro"}, {"v": 2, "andares": []}, {**v2, "extra": 1},
                     {"v": 1, "terreo": "saguao", "andares": []}):
            with open(os.path.join(self.dados, andares.ARQ), "w", encoding="utf-8") as f:
                json.dump(ruim, f)
            with self.assertRaises(andares.AndaresIlegiveis, msg=ruim):
                andares.Andares(self.dados, e.ORG)

    def test_v1_continua_classico(self):
        r = andares.Andares(self.dados, e.ORG)
        r.criar("B", ORG_B)
        self.assertFalse(andares.Andares(self.dados, e.ORG).saguao)
        with open(os.path.join(self.dados, andares.ARQ), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["v"], 1)

    def test_pasta_so_sai_do_id(self):
        for ruim in ("../x", "AAAAAAAA", "aaaaaaa", "aaaaaaaa/..", None):
            with self.assertRaises(ValueError):
                andares.pasta(self.dados, ruim)


class OutroWorkspace(unittest.TestCase):
    def test_tarefa_de_outra_org(self):
        self.assertFalse(e.outra_org([tarefa(ORG_B)], ORG_B))
        self.assertTrue(e.outra_org([tarefa(ORG_B), tarefa(ORG_C)], ORG_B))
        self.assertFalse(e.outra_org([{"url": ""}, {}], ORG_B))

    def test_leitor_do_andar_marca_outra_org_e_nao_publica(self):
        class Cred:
            def token(self):
                return "t"
        l = e.Leitor(Cred(), e.url_app(e.AGENTES, ORG_B), os.path.join(PASTA, "nao-existe.json"), org=ORG_B)
        l.mcp.sessao = "s"
        l._coletar = lambda token, agora=None: (_ for _ in ()).throw(e.OutraOrg())
        l.ciclo(1_000_000)
        foto = l.foto()
        self.assertEqual((foto["conexao"], foto["agentes"], foto["tarefas"]), ("outra_org", [], []))

    def test_conexao_nova_so_publica_depois_de_confirmar_a_org(self):
        """E.2 item 5: o consentimento pode ter escolhido outra org sem tarefa com link para denunciar. A conexão nova
        fica em "conferindo", sem agentes, até uma tarefa com o link do workspace do andar."""
        confirmou = []

        class Cred:
            def token(self):
                return "t"

            def conferir_org(self):
                return not confirmou

            def confirmar_org(self):
                confirmou.append(True)
        l = e.Leitor(Cred(), e.url_app(e.AGENTES, ORG_B), os.path.join(PASTA, "nao-existe.json"), org=ORG_B)
        l.mcp.sessao = "s"
        tarefas = [{"agent": {"id": "b1"}, "status": "running", "label": "x", "started_at": "2026-11-14T10:00:00Z"}]
        l.agentes, l.agentes_em = [{"id": "b1", "name": "Bolt", "handle": "bolt"}], 1_000_000
        l._paginas = lambda nome, args, chave, token: (tarefas if chave == "tasks" else [], True)
        l.ciclo(1_000_000)
        foto = l.foto()
        self.assertEqual((foto["conexao"], foto["agentes"], confirmou), ("conferindo", [], []))
        tarefas.append(tarefa(ORG_B))
        l.ciclo(1_000_030)
        foto = l.foto()
        self.assertEqual((foto["conexao"], [a["id"] for a in foto["agentes"]], confirmou), ("conectado", ["b1"], [True]))

    def test_principal_continua_sem_conferir_org(self):
        l = e.Leitor(None)
        self.assertIsNone(l.org)

    def test_alguem_vendo_o_andar_adianta_a_primeira_leitura(self):
        """O escalonamento da partida (atraso) deixava o andar sem agentes até a vez dele; quem abre o andar não espera."""
        class Leitor(e.Leitor):
            def ciclo(self, agora=None):
                self.voltas += 1
                return 3600
        l = Leitor(None, atraso=3600)
        l.voltas = 0
        l.start()
        time.sleep(0.2)
        self.assertEqual(l.voltas, 0)   # controle: sem ninguém olhando, espera a vez dele
        l.ver()
        fim = time.monotonic() + 5
        while l.voltas < 1 and time.monotonic() < fim:
            time.sleep(0.01)
        self.assertEqual(l.voltas, 1)
        l.ver()   # já leu: as próximas telas não puxam leituras a mais
        time.sleep(0.2)
        self.assertEqual(l.voltas, 1)
        l.parar()


class Http(unittest.TestCase):
    """Dois andares no mesmo servidor: o principal (os arquivos de sempre) e um extra, com leitores falsos."""

    @classmethod
    def setUpClass(cls):
        cls.dados = tempfile.mkdtemp(prefix="andares-http-")
        cls.antes = e.BASE, e.TIMES, e.ARQ_PLANTA, e.ARQ_EQUIPE

        class Leitor:
            def __init__(self, agentes):
                self.agentes = agentes

            def foto(self):
                return {**e.resumir(self.agentes, []), "atualizado": None, "erro": None, "conexao": "conectado"}

            def ver(self):
                self.vistas = getattr(self, "vistas", 0) + 1

        class Conversas:   # só conhece os ids do próprio andar
            def __init__(self, ids):
                self.ids = ids

            def esquecer(self):
                pass

            def ler_id(self, id_):
                return (200, {"id": id_}) if id_ in self.ids else (404, {"erro": "não achei"})

        cls.srv = e.Servidor(("127.0.0.1", 0), e.Pagina)
        cls.srv.leitor = Leitor([{"id": "a1", "name": "Pixel", "handle": "pixel"}])
        cls.srv.cred, cls.srv.acesso = None, Acesso(os.path.join(cls.dados, "contas"))
        cls.srv.conversas = Conversas({"idDoPrincipa"})
        cls.srv.planta = e.Planta(os.path.join(cls.dados, "planta.json"), e.log,
                                  lambda d: e.gravar(os.path.join(cls.dados, "planta.json"), d))
        e.TIMES, e.ARQ_PLANTA = os.path.join(cls.dados, "times.json"), os.path.join(cls.dados, "planta.json")
        e.ARQ_EQUIPE = os.path.join(cls.dados, "equipe.json")
        with open(e.TIMES, "w", encoding="utf-8") as f:
            json.dump({"conversas": "ler", "times": [{"nome": "Térreo time", "agentes": ["pixel"]}]}, f)
        cls.srv.registro_andares = andares.Andares(cls.dados, e.ORG)
        reg = cls.srv.registro_andares.criar("Marketing", ORG_B)
        extra = e.Andar(reg, cls.dados)
        extra.leitor = Leitor([{"id": "b1", "name": "Bolt", "handle": "bolt"}])
        extra.conversas = Conversas({"idDoExtra123"})
        with open(extra.times, "w", encoding="utf-8") as f:
            json.dump({"conversas": "ler", "times": [{"nome": "Time B", "agentes": ["bolt"]}], "empresa": "Ignorada"}, f)
        cls.extra = extra
        cls.srv.andares = {reg["id"]: extra}
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_address[1]
        e.BASE = cls.base
        with open(os.path.join(cls.dados, "contas", "codigo-primeiro-acesso.txt")) as f:
            codigo = f.read().strip()
        cls.srv.acesso.criar_primeiro(codigo, "dono", "senha-bem-grande")   # com o arquivo fechado (unlink no Windows)
        corpo = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande"}).encode()
        st, _, h = cls.req("/entrar", {"Origin": cls.base, "Content-Type": "application/x-www-form-urlencoded"}, corpo)
        assert st == 303, st
        cls.cookie = {"Cookie": h["Set-Cookie"].split(";")[0]}

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        e.BASE, e.TIMES, e.ARQ_PLANTA, e.ARQ_EQUIPE = cls.antes
        shutil.rmtree(cls.dados, ignore_errors=True)

    @classmethod
    def req(cls, rota, cab=None, dados=None):
        class SemRedirecionar(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        r = urllib.request.Request(cls.base + rota, headers=cab or {}, data=dados)
        try:
            with urllib.request.build_opener(SemRedirecionar).open(r) as resp:
                return resp.status, resp.read(), resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read(), err.headers

    def get(self, rota):
        st, corpo, _ = self.req(rota, self.cookie)
        return st, json.loads(corpo) if corpo else None

    def post(self, rota, dados):
        cab = {**self.cookie, "Origin": self.base, "Content-Type": "application/json"}
        st, corpo, _ = self.req(rota, cab, json.dumps(dados).encode())
        return st, json.loads(corpo) if corpo else None

    def test_sem_andar_e_o_principal_de_sempre(self):
        st, cfg = self.get("/api/config")
        self.assertEqual(st, 200)
        self.assertEqual(cfg["andar"], "principal")
        self.assertEqual([a["id"] for a in cfg["andares"]], ["principal", self.extra.id])
        self.assertEqual([t["nome"] for t in cfg["times"]], ["Térreo time"])
        self.assertEqual(self.get("/api/estado")[1]["agentes"][0]["id"], "a1")

    def test_estado_e_config_do_andar_extra(self):
        q = f"?andar={self.extra.id}"
        st, estado = self.get("/api/estado" + q)
        self.assertEqual((st, [a["id"] for a in estado["agentes"]]), (200, ["b1"]))
        st, cfg = self.get("/api/config" + q)
        self.assertEqual(cfg["andar"], self.extra.id)
        self.assertEqual([t["nome"] for t in cfg["times"]], ["Time B"])
        self.assertNotEqual(cfg["empresa"], "Ignorada")   # a marca é do prédio
        self.assertIn(f"/org/{ORG_B}", cfg["app_url"])

    def test_estado_do_andar_avisa_o_leitor_dele_que_tem_gente_vendo(self):
        antes_p, antes_x = getattr(self.srv.leitor, "vistas", 0), getattr(self.extra.leitor, "vistas", 0)
        self.get("/api/config")   # o config lê a conexão de todos os andares: não conta como ver
        self.assertEqual((getattr(self.srv.leitor, "vistas", 0), getattr(self.extra.leitor, "vistas", 0)), (antes_p, antes_x))
        self.get(f"/api/estado?andar={self.extra.id}")
        self.assertEqual((getattr(self.srv.leitor, "vistas", 0), self.extra.leitor.vistas), (antes_p, antes_x + 1))

    def test_andar_inexistente_da_404_igual(self):
        for q in ("?andar=ffffffff", "?andar=../x", "?andar=PRINCIPAL"):
            for rota in ("/api/estado", "/api/config", "/api/jornal", "/api/conversa", "/oauth/conectar"):
                st, corpo = self.get(rota + q)
                self.assertEqual((st, corpo["codigo"]), (404, "andar"), rota + q)
        st, corpo = self.post("/api/planta?andar=ffffffff", {})
        self.assertEqual((st, corpo["codigo"]), (404, "andar"))

    def test_conversa_de_um_andar_nao_abre_no_outro(self):
        self.assertEqual(self.get("/api/conversa?id=idDoExtra123")[0], 404)
        self.assertEqual(self.get(f"/api/conversa?id=idDoExtra123&andar={self.extra.id}")[0], 200)
        self.assertEqual(self.get(f"/api/conversa?id=idDoPrincipa&andar={self.extra.id}")[0], 404)

    def test_planta_e_equipe_gravam_no_andar_certo(self):
        q = f"?andar={self.extra.id}"
        rev = self.get("/api/config" + q)[1]["planta"]["rev"]
        st, _ = self.post("/api/planta" + q, {"rev": rev, "salas": {}, "moveis": {}, "novos": []})
        self.assertEqual(st, 200)
        self.assertTrue(os.path.exists(self.extra.arq_planta))
        self.assertFalse(os.path.exists(e.ARQ_PLANTA))
        st, _ = self.post("/api/equipe" + q, {"rev": 0, "aparencia": {}, "times": [
            {"nome": "Só B", "tipo": "mesas", "cor": None, "icone": None, "parede": 0, "piso": 0, "agentes": []}]})
        self.assertEqual(st, 200)
        self.assertTrue(os.path.exists(self.extra.arq_equipe))
        self.assertFalse(os.path.exists(e.ARQ_EQUIPE))
        self.assertEqual([t["nome"] for t in self.get("/api/config" + q)[1]["times"]], ["Só B"])
        self.assertEqual([t["nome"] for t in self.get("/api/config")[1]["times"]], ["Térreo time"])

    def test_retorno_do_oauth_vai_para_o_andar_dono_do_state(self):
        chamados = []

        class Cred:
            def __init__(self, nome, estados):
                self.nome, self.estados = nome, estados

            def tem_estado(self, s):
                return s in self.estados

            def concluir(self, codigo, s):
                chamados.append((self.nome, s))

        antes_extra, antes_srv = self.extra.cred, self.srv.cred
        self.extra.cred, self.srv.cred = Cred("extra", {"st-extra"}), Cred("principal", set())
        try:
            st, _, h = self.req("/oauth/retorno?code=c&state=st-extra", self.cookie)
            self.assertEqual((st, h["Location"]), (302, f"/#andar={self.extra.id}"))
            st, _, h = self.req("/oauth/retorno?code=c&state=outro", self.cookie)
            self.assertEqual((st, h["Location"]), (302, "/"))
        finally:
            self.extra.cred, self.srv.cred = antes_extra, antes_srv
        self.assertEqual(chamados, [("extra", "st-extra"), ("principal", "outro")])

    def test_membro_so_ve_os_andares_dele(self):
        papeis = {("dono", "principal"): "membro"}
        self.srv.acesso.papel = lambda u, andar="principal": papeis.get((u, andar))
        try:
            self.assertEqual(self.get(f"/api/estado?andar={self.extra.id}")[0], 404)
            self.assertEqual([a["id"] for a in self.get("/api/config")[1]["andares"]], ["principal"])
            self.assertEqual(self.get("/api/andares")[0], 403)
            papeis[("dono", self.extra.id)] = "membro"
            self.assertEqual(self.get(f"/api/estado?andar={self.extra.id}")[0], 200)
        finally:
            del self.srv.acesso.papel

    def test_gestao_pede_senha_e_formato_exato(self):
        self.assertEqual(self.post("/api/andares", {"acao": "criar", "nome": "X", "org": ORG_C})[0], 400)
        st, corpo = self.post("/api/andares", {"acao": "criar", "nome": "X", "org": ORG_C, "senha": "errada-errada"})
        self.assertEqual((st, corpo["codigo"]), (403, "senha_incorreta"))
        st, corpo = self.post("/api/andares", {"acao": "renomear", "id": "ffffffff", "nome": "Y"})
        self.assertEqual((st, corpo["codigo"]), (404, "andar"))
        cab = {**self.cookie, "Origin": "https://outro.exemplo", "Content-Type": "application/json"}
        self.assertEqual(self.req("/api/andares", cab, b'{"acao":"renomear","id":"x","nome":"y"}')[0], 403)

    def test_visitantes_so_no_principal(self):
        self.assertIn("visitantes", self.get("/api/estado")[1])
        self.assertNotIn("visitantes", self.get(f"/api/estado?andar={self.extra.id}")[1])

    def conta(self, usuario, papel="membro"):
        """Uma conta só do andar extra (sem o principal), pelo convite, e o cookie dela."""
        acesso = self.srv.acesso
        if usuario in acesso.usuarios:
            acesso.remover(usuario)
        token, _ = acesso.convidar(usuario.title(), [self.extra.id], principal=False)
        cab = {"Cookie": "esc_sessao=" + acesso.aceitar_convite(token, usuario, "senha-da-pessoa-1", usuario.title(),
                                                                {"color": "rose", "eyes": "round", "accessory": "cap"})}
        if papel == "admin":
            acesso.mudar_papel(usuario, "admin", self.extra.id)
        return cab

    def test_admin_da_empresa_no_classico(self):
        """Sem saguão: a conta só de um andar extra cai nele sem ?andar=, e o admin dele não alcança o principal."""
        bia = self.conta("bia", "admin")
        rodar = lambda rota, cab=bia: self.req(rota, cab)[0]
        st, cfg = self.req("/api/config", bia)[:2]
        cfg = json.loads(cfg)
        self.assertEqual((st, cfg["andar"], cfg["papel"], cfg["terreo"]), (200, self.extra.id, "admin", "classico"))
        self.assertEqual([a["id"] for a in cfg["andares"]], [self.extra.id])   # o térreo de A não aparece
        self.assertEqual([a["id"] for a in json.loads(self.req("/api/estado", bia)[1])["agentes"]], ["b1"])
        self.assertEqual(rodar("/api/estado?andar=principal"), 404)
        self.assertEqual(rodar("/api/andares"), 403)
        self.assertEqual(rodar(f"/api/membros?andar={self.extra.id}"), 200)
        st, corpo = self.req(f"/api/membros?andar={self.extra.id}", bia)[:2]
        self.assertEqual({c["usuario"] for c in json.loads(corpo)["contas"]}, {"bia"})   # nem o dono aparece
        self.srv.acesso.remover("bia")

    def test_oauth_amarrado_a_conta_e_ao_andar(self):
        """E.2: o state guarda quem começou; a volta só vale na sessão dessa conta e com o papel de admin ainda valendo.
        Qualquer outra coisa dá o 400 do state inválido e gasta o state."""
        cred = e.Credenciais(os.path.join(self.dados, "oauth-e2.json"), self.extra.times)
        cred._cliente = lambda escopo, agora: "cliente-x"   # sem o registro de verdade (rede)
        antes = self.extra.cred
        self.extra.cred = cred
        self.addCleanup(setattr, self.extra, "cred", antes)
        bia = self.conta("bia", "admin")
        self.addCleanup(self.srv.acesso.remover, "bia")
        q = f"?andar={self.extra.id}"
        estado = lambda: urllib.parse.parse_qs(urllib.parse.urlsplit(
            self.req("/oauth/conectar" + q, bia)[2]["Location"]).query)["state"][0]
        self.assertEqual(self.req("/oauth/conectar?andar=principal", bia)[0], 404)
        s1 = estado()
        st, corpo, _ = self.req(f"/oauth/retorno?code=c&state={s1}", self.cookie)   # o link de volta na sessão de outro
        self.assertEqual(st, 400)
        self.assertIn("venceu (vale 10 minutos) ou já foi usado", corpo.decode())
        self.assertFalse(cred.tem_estado(s1))   # o state foi gasto
        self.assertEqual(self.req(f"/oauth/retorno?code=c&state={s1}", bia)[0], 400)
        s2 = estado()
        papeis = self.srv.acesso.usuarios["bia"]["andares"]
        papeis[self.extra.id] = "membro"   # o papel caiu dentro do prazo do pendente (o último admin, aqui, não sai)
        # sem papel de admin em nenhum andar, a guarda barra (o 403 do membro); o state se gasta do mesmo jeito
        self.assertEqual(self.req(f"/oauth/retorno?code=c&state={s2}", bia)[0], 403)
        self.assertFalse(cred.tem_estado(s2))
        papeis[self.extra.id] = "admin"
        s3 = estado()
        antes_post = e.post_form
        e.post_form = lambda url, campos: {"access_token": "AC-e2", "refresh_token": "RF-e2", "scope": "read",
                                           "expires_in": 3600}
        self.addCleanup(setattr, e, "post_form", antes_post)
        st, _, h = self.req(f"/oauth/retorno?code=c&state={s3}", bia)
        self.assertEqual((st, h["Location"]), (302, f"/#andar={self.extra.id}"))
        self.assertTrue(cred.conferir_org())   # até uma leitura confirmar a org, nenhum agente aparece
        self.assertFalse(self.extra.cred.tem_estado(s3))
        # o state de um andar não serve no outro: cada conexão tem os seus pendentes
        self.assertEqual(self.req(f"/oauth/retorno?code=c&state={estado()}", self.cookie)[0], 400)

    def test_desconectar_o_andar(self):
        revogou = []

        class Cred:
            def desconectar(self):
                revogou.append(True)

            def tem_estado(self, s):
                return False
        antes = self.extra.cred
        self.extra.cred = Cred()
        self.addCleanup(setattr, self.extra, "cred", antes)
        bia, ana = self.conta("bia", "admin"), self.conta("ana")
        self.addCleanup(self.srv.acesso.remover, "bia")
        self.addCleanup(self.srv.acesso.remover, "ana")
        rota = f"/oauth/desconectar?andar={self.extra.id}"
        post = lambda cab, dados, r=rota: self.req(r, {**cab, "Origin": self.base, "Content-Type": "application/json"},
                                                   json.dumps(dados).encode())[0]
        self.assertEqual(post(ana, {"senha": "senha-da-pessoa-1"}), 403)   # membro
        self.assertEqual(post(bia, {"senha": "errada-errada"}), 403)
        self.assertEqual(post(bia, {}), 400)
        self.assertEqual(post(bia, {"senha": "senha-da-pessoa-1"}, "/oauth/desconectar?andar=principal"), 404)
        self.assertEqual(revogou, [])
        self.assertEqual(post(bia, {"senha": "senha-da-pessoa-1"}), 200)
        fim = time.monotonic() + 5
        while not revogou and time.monotonic() < fim:
            time.sleep(0.01)
        self.assertEqual(revogou, [True])

    def test_criar_renomear_e_remover_de_verdade(self):
        st, corpo = self.post("/api/andares", {"acao": "criar", "nome": "Suporte", "org": ORG_C,
                                               "senha": "senha-bem-grande"})
        self.assertEqual(st, 200, corpo)
        novo = corpo["andar"]["id"]
        andar = self.srv.andares[novo]
        try:
            self.assertEqual(self.get("/api/andares")[1]["andares"][-1]["org"], ORG_C)
            self.assertEqual(self.post("/api/andares", {"acao": "renomear", "id": novo, "nome": "Help"})[0], 200)
            self.assertEqual(andar.nome, "Help")
            self.assertEqual(self.post("/api/andares", {"acao": "remover", "id": novo, "senha": "senha-bem-grande"})[0], 200)
            self.assertNotIn(novo, self.srv.andares)
            self.assertTrue(andar.leitor.parado and andar.social.parado)
            self.assertEqual(self.get(f"/api/estado?andar={novo}")[0], 404)
        finally:
            andar.parar()


if __name__ == "__main__":
    unittest.main()
