"""Máscara de segredos (#19): todo texto que vem do agentes.chat passa por ajustes.mascarar_segredos antes de ir à tela.
Os segredos aqui são de mentira, montados em pedaços para nenhum varredor de segredo do GitHub apitar no repositório."""
import atexit
import os
import shutil
import tempfile
import time
import types
import unittest
from unittest.mock import patch

PASTA = tempfile.mkdtemp(prefix="escritorio-teste-segredos-")


@atexit.register
def _apagar_pasta():
    """No fim do processo, e não do módulo: rodando a suíte inteira, ela é o ESCRITORIO_DADOS dos módulos seguintes. No
    Windows, uma thread de fundo lendo o marca.json ou o times.json nessa hora segura o arquivo: tenta de novo."""
    for _ in range(10):
        shutil.rmtree(PASTA, ignore_errors=True)
        if not os.path.exists(PASTA):
            return
        time.sleep(0.2)


os.environ.setdefault("ESCRITORIO_DADOS", PASTA)   # rodando junto com o test_escritorio, vale a pasta dele
if "ESCRITORIO_TIMES" not in os.environ:
    os.environ["ESCRITORIO_TIMES"] = os.path.join(PASTA, "times.json")
    with open(os.environ["ESCRITORIO_TIMES"], "w", encoding="utf-8") as _f:
        _f.write("{}")
os.environ.setdefault("AGENTES_ORG", "00000000-0000-4000-8000-000000000000")  # org fictícia
import ajustes  # noqa: E402
import escritorio  # noqa: E402
from ajustes import mascarar_segredos as mascarar, texto_do_chat  # noqa: E402

M = ajustes.MASCARA
B64 = "Zk9xT2c3bVJ1dkw4cFQ5d0EyZHNIeTZiTjFjWDBlVQ"   # 42 caracteres, letras e dígitos misturados
GHP = "ghp" + "_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
JWT = "eyJ" + "hbGciOiJIUzI1NiJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "." + "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"
PEM = ("-----BEGIN " + "RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn\nqZ3wq8ZcWQ1n2C9Xb5w+ce1\n"
       "-----END RSA PRIVATE KEY-----")
CANAL = "01a1bda0-9c52-74b8-8f93-79ac3cc91d90"


class Padroes(unittest.TestCase):
    """Cada padrão da issue: o segredo some inteiro e o texto em volta fica."""

    def assertMascara(self, segredo, antes="o valor é ", depois=" e pronto"):
        saida = mascarar(antes + segredo + depois)
        self.assertEqual(saida, antes + M + depois)

    def test_prefixos_conhecidos(self):
        for segredo in ("sk-" + "proj-Ab12Cd34Ef56Gh78Ij90", "sk-" + "ant-api03-Xy9Zw8Vu7Ts6", "sk-" + "A1b2C3d4E5f6",
                        GHP, "gho" + "_" + "16C7e42F292c6912E7710c838347Ae178B4a",
                        "github_pat_" + "11ABCDEFG0123456789_abcdefXYZ",
                        "glpat-" + "x1Y2z3W4v5U6t7S8r9Q0",
                        "AIza" + "SyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY",
                        "xoxb-" + "123456789012-1234567890123-AbCdEfGhIjKl",
                        "xoxp-" + "123456789012-1234567890123-AbCdEfGhIjKl"):
            with self.subTest(segredo=segredo[:8]):
                self.assertMascara(segredo)

    def test_jwt_inteiro_com_os_tres_pedacos(self):
        self.assertMascara(JWT)

    def test_chave_privada_em_varias_linhas(self):
        saida = mascarar("segue a chave:\n" + PEM + "\nguarde bem")
        self.assertEqual(saida, "segue a chave:\n" + M + "\nguarde bem")

    def test_chave_privada_cortada_sem_o_end_some_ate_o_fim(self):
        self.assertEqual(mascarar("chave: " + PEM[:60]), "chave: " + M)

    def test_base64_longo_e_misturado(self):
        self.assertMascara(B64)
        self.assertMascara("a3f1c9e2b7d4" * 4 + "ab")   # hex de 50 (sha256 cortado)

    def test_base64_avaliado_por_segmento(self):
        self.assertEqual(mascarar("/srv/app/" + B64 + "/x"), "/srv/app/" + M + "/x")
        self.assertEqual(mascarar("C:\\dados\\" + B64), "C:\\dados\\" + M)

    def test_bearer_e_basic(self):
        self.assertEqual(mascarar("Authorization: Bearer abc.def-123_xyz"), "Authorization: Bearer " + M)
        self.assertEqual(mascarar("curl -H 'authorization: bearer " + JWT + "'"), "curl -H 'authorization: bearer " + M + "'")
        self.assertEqual(mascarar("Authorization: Basic dXNlcjpzZW5oYTEyMw=="), "Authorization: Basic " + M)

    def test_token_no_meio_da_url(self):
        self.assertEqual(mascarar("abre https://api.exemplo.com/v1/hook?token=Ab12Cd34&modo=1 depois"),
                         "abre https://api.exemplo.com/v1/hook?token=" + M + "&modo=1 depois")
        self.assertEqual(mascarar("https://x.com/a?access_token=" + GHP + "&b=2"), "https://x.com/a?access_token=" + M + "&b=2")
        self.assertEqual(mascarar("https://x.com/cb#id_token=" + JWT), "https://x.com/cb#id_token=" + M)

    def test_chave_em_json(self):
        self.assertEqual(mascarar('{"api_key": "abc123def456", "nome": "ok"}'), '{"api_key": "' + M + '", "nome": "ok"}')
        self.assertEqual(mascarar('{"password":"hunter2","senha":\'trocar123\'}'),
                         '{"password":"' + M + '","senha":\'' + M + "'}")
        self.assertEqual(mascarar('{"client_secret": "' + B64 + '"}'), '{"client_secret": "' + M + '"}')
        self.assertEqual(mascarar('{"token": ""}'), '{"token": ""}')   # vazio não tem o que esconder

    def test_variavel_de_ambiente_e_senha_solta(self):
        self.assertEqual(mascarar("DB_PASSWORD=minhaSenha99 no .env"), "DB_PASSWORD=" + M + " no .env")
        self.assertEqual(mascarar("export OPENAI_API_KEY=algumacoisa"), "export OPENAI_API_KEY=" + M)
        self.assertEqual(mascarar("senha: Prim@vera2026"), "senha: " + M)
        self.assertEqual(mascarar("x-api-key: 9f8e7d6c"), "x-api-key: " + M)

    def test_texto_multilinha_mascara_cada_linha_e_guarda_as_quebras(self):
        texto = "linha 1\ntoken=" + GHP + "\n\nlinha 3 com " + B64 + "\nfim"
        self.assertEqual(mascarar(texto), "linha 1\ntoken=" + M + "\n\nlinha 3 com " + M + "\nfim")

    def test_vazio_e_nada(self):
        self.assertEqual(mascarar(""), "")
        self.assertEqual(mascarar(None), "")
        self.assertEqual(texto_do_chat("", 10), ("", False))
        self.assertEqual(texto_do_chat(None, 10), ("", False))

    def test_mascarar_de_novo_nao_muda(self):
        for texto in ("token=" + GHP, PEM, '{"senha": "abc"}', "Bearer " + JWT, B64):
            uma = mascarar(texto)
            self.assertEqual(mascarar(uma), uma)

    def test_caractere_invisivel_nao_esconde_o_segredo(self):
        self.assertEqual(texto_do_chat("ghp\u200b_" + GHP[4:], 200)[0], M)   # o zero-width no meio do token


class Preserva(unittest.TestCase):
    """O que não é segredo continua aparecendo: caminhos longos reais, ids, links e palavras parecidas."""

    def test_caminhos_longos_reais(self):
        for caminho in ("/home/agentes/agentes/jarvis-20f219bf/repos/HelbertMoura/escritorio-agentes/static/mundo_navegacao.js",
                        "C:\\Users\\Helbert\\Documents\\Unity Projects\\AlemDaSoleira\\Assets\\Scripts\\ControladorDoJogador2D.cs",
                        "0001-docs-Roteiro-de-compra-de-teste-do-Apoiador-com-test.patch",
                        "agentes/jarvis/roteiro-compra-teste-apoiador-com-testador-de-licenca-s4",
                        "/home/agentes/agentes/shared/flutter/bin/cache/dart-sdk/lib/_internal/vm_shared/lib/integers_patch.dart",
                        "arte/pixellab/mundo/marco-catedral-fortaleza.png",
                        "Relatorio_Financeiro_Consolidado_Trimestre_3_2026_versao_final.xlsx",
                        "docs/roteiro-compra-teste-apoiador.md"):
            with self.subTest(caminho=caminho):
                self.assertEqual(mascarar("abri " + caminho + " agora"), "abri " + caminho + " agora")

    def test_ids_hashes_curtos_e_links(self):
        for texto in ("run 01a1dfd3-5464-729b-9ad0-1d8bf4e2b10e terminou",
                      "commit 77f985e0c4f1e094ac1c0960e46af68502bcc4c5 na main",   # sha1 tem 40: não passa de 40
                      "https://devmaniacs-prod.tail96744a.ts.net/org/26004ebc-6f83-4f59-8031-279ee4a66ba7/c/"
                      "0f8e40a6-02d2-41a2-ac9e-40d5dacf18dd?m=01a1e091-3a22-7363-8508-1fe94b701519",
                      "https://github.com/HelbertMoura/escritorio-agentes/pull/30",
                      "PR #54 aberto às 12:14"):
            with self.subTest(texto=texto[:20]):
                self.assertEqual(mascarar(texto), texto)

    def test_palavras_parecidas(self):
        for texto in ("desk-direcao e task-force", "Skynet", "a secretaria: Maria", "tokens: 1500 por dia",
                      "o token expirou", "a senha do wi-fi mudou", "basic understanding of bearer bonds",
                      "Rodando pytest -k test_mundo_navegacao_cidades_medias_e_de_fora",
                      "====================================================================", "Bearer"):
            with self.subTest(texto=texto):
                self.assertEqual(mascarar(texto), texto)


class AntesDeCortar(unittest.TestCase):
    def test_texto_do_chat_mascara_e_depois_corta(self):
        texto = "x" * 95 + " " + GHP
        saida, cortado = texto_do_chat(texto, 100)
        self.assertEqual(saida, "x" * 95 + " " + M)
        self.assertFalse(cortado)
        saida, cortado = texto_do_chat(texto, 98)   # o corte cai no meio da máscara, nunca no meio do token
        self.assertNotIn("ghp", saida)
        self.assertTrue(cortado)

    def test_rotulo_da_tarefa(self):
        rotulo = escritorio.limpa_rotulo("Subir a chave " + GHP + " no cofre")
        self.assertEqual(rotulo, "Subir a chave " + M + " no cofre")
        rotulo = escritorio.limpa_rotulo("a" * 100 + " " + GHP)   # o token cruza o corte de 110
        self.assertNotIn("ghp", rotulo)
        self.assertNotIn(GHP[4:14], rotulo)
        self.assertEqual(escritorio.limpa_rotulo("ver ghp&#95;" + GHP[4:]), "ver " + M)   # entidade html não esconde

    def test_conversa_texto_e_nome_do_agente(self):
        bruto = {"messages": [{"author": {"kind": "agent", "name": "Jarvis " + GHP}, "untrusted_text": "a chave é " + JWT,
                               "sent_at": "2026-11-15T18:00:00Z"},
                              {"author": {"kind": "person"}, "untrusted_text": "senha=abc12345\nvaleu", "sent_at": None}]}
        r = escritorio.resumir_conversa(bruto, "", 0)
        self.assertEqual([m["texto"] for m in r["mensagens"]], ["a chave é " + M, "senha=" + M + "\nvaleu"])
        self.assertEqual(r["mensagens"][0]["nome"], "Jarvis " + M)

    def test_resposta_do_anfitriao_na_sala_de_visitas(self):
        publicadas = []
        falso = types.SimpleNamespace(do_anfitriao=lambda m, agente: True,
                                      salas=types.SimpleNamespace(publicar=lambda chave, texto: publicadas.append(texto)))
        msgs = [{"id": "m1", "sent_at": "2026-11-15T18:00:00Z", "untrusted_text": "use Bearer " + GHP + " no teste"}]
        self.assertEqual(escritorio.PonteVisitas._publicar(falso, "sala", {"nome": "Jarvis"}, {}, msgs), 1)
        self.assertEqual(publicadas, ["Jarvis (agente): use Bearer " + M + " no teste"])

    def test_agentes_e_rotulos_do_resumo(self):
        agentes = [{"id": "a1", "name": "Bot " + GHP, "handle": "bot", "role": "usa a chave " + B64,
                    "department": {"name": "Infra " + GHP, "position": 1}}]
        tarefas = [{"agent": {"id": "a1"}, "run_id": "r1", "status": "running", "label": "token=" + GHP,
                    "started_at": "2026-11-15T18:00:00Z"}]
        lista, itens = escritorio.normalizar(agentes, tarefas)
        self.assertEqual(lista[0]["nome"], "Bot " + M)
        self.assertEqual(lista[0]["funcao"], "usa a chave " + M)
        self.assertEqual(lista[0]["setor"]["nome"], "Infra " + M)
        self.assertEqual(itens[0]["rotulo"], "token=" + M)

    def test_recepcionista_mascara_o_agente_e_o_canal(self):
        """v2.2: o nome do agente e o nome do canal (do list_channels) vão para a tela da recepção."""
        class Respostas:
            def _canais(self, token, agora, nomes=None):
                if nomes is not None:
                    nomes.update({CANAL: "visitas token=" + GHP})
                return ({CANAL}, True, agora)
        andar = types.SimpleNamespace(respostas=Respostas(), leitor=types.SimpleNamespace(
            cred=types.SimpleNamespace(token=lambda: "tok"), pausado=lambda agora=None: False))
        falso = types.SimpleNamespace(
            _agentes_lidos=lambda: [{"id": "ag-1", "nome": "Recepção " + GHP, "handle": "recepcao"}],
            _recepcao=lambda: andar)
        with patch.object(escritorio, "tela_aceita", lambda *a: True):
            st, corpo = escritorio.Pagina._conferir_recepcao(falso, "recepcao", CANAL)
        self.assertEqual(st, 200)
        self.assertEqual(corpo["nome"], "Recepção " + M)
        self.assertEqual(corpo["canal_nome"], "visitas token=" + M)
        self.assertNotIn(GHP[4:14], corpo["nome"])
        self.assertNotIn(GHP[4:14], corpo["canal_nome"])


class Custo(unittest.TestCase):
    """ReDoS: nenhum padrão da máscara pode voltar atrás em cima de um texto hostil. O teto é o do projeto (1 s) e o
    texto do agentes.chat não pode segurar o escritório: 100 KB de cada padrão, e 1 MB no topo da máscara."""

    HOSTIS = (
        ("_PEM", "-----BEGIN " + "A" * 100_000),                      # chave privada sem o fim
        ("_PEM", "-----BEGIN " + "-----END" * 12_500),                # o END repetido
        ("_PEM", "-----BEGIN " + "-----ENDx" * 8_888),                # o END sem fechar
        ("_PEM", "-----BEGIN\n" + "x" * 999 + "\n" * 100),            # a chave em várias linhas
        ("_JWT", "eyJ" + "A" * 100_000),                               # JWT sem ponto
        ("_JWT", "eyJ" + "A" * 50_000 + "." + "B" * 50_000),           # JWT com ponto no meio
        ("_PREFIXOS", "sk-" + "A" * 100_000),                         # prefixo conhecido
        ("_PREFIXOS", "ghp_" + "a1" * 33_000),                        # prefixo do GitHub
        ("_AUTORIZACAO", "bearer " + "A" * 100_000),                  # Bearer sem dígito
        ("_AUTORIZACAO", "basic " + "a1" * 50_000),                   # Basic com dígito
        ("_CHAVE_VALOR", "password=" * 11_111),                       # chave: valor sem delimitador
        ("_CHAVE_VALOR", "password_" + "A" * 50_000 + " token=" * 5_000),   # chave com prefixo e sufixo
        ("_CHAVE_VALOR", '"token": "' + "A" * 100_000),                # valor entre aspas sem fechar
        ("_CHAVE_VALOR", "senha: " * 12_500),                         # a mesma chave repetida
        ("_TRECHO", "a1" * 50_000),                                   # base64 longo e misturado
    )

    def test_padroes_em_100_kb_de_texto_hostil(self):
        for nome, texto in self.HOSTIS:
            with self.subTest(padrao=nome, tamanho=len(texto)):
                padrao = getattr(ajustes, nome)
                inicio = time.perf_counter()
                padrao.sub(M, texto)
                self.assertLess(time.perf_counter() - inicio, 1.0)

    def test_megabytes_de_texto_nao_seguram_o_escritorio(self):
        """O teto do que a máscara lê (64 KB) segura o custo do filtro por caractere: 1 MB de texto hostil não passa."""
        inicio = time.perf_counter()
        saida = mascarar("token=" + "A" * (1024 * 1024))
        self.assertLess(time.perf_counter() - inicio, 1.0)
        self.assertEqual(saida, "token=" + M)
        inicio = time.perf_counter()
        saida, _ = texto_do_chat("token=" + "A" * (1024 * 1024), 1500)
        self.assertLess(time.perf_counter() - inicio, 1.0)
        self.assertEqual(saida, "token=" + M)

    def test_o_segredo_da_ponta_some_no_texto_hostil(self):
        """O segredo da ponta some inteiro, mesmo com o resto do texto enorme e hostil."""
        for texto, segredo in (("token=" + "A" * 100_000, "A" * 60),
                                ("password=" + "B" * 100_000, "B" * 60),
                                ("sk-" + "C" * 100_000, "C" * 60),
                                ("bearer " + "d1" * 50_000, "d1" * 30)):
            with self.subTest(texto=texto[:12]):
                saida = mascarar(texto)
                self.assertNotIn(segredo, saida)


if __name__ == "__main__":
    unittest.main()
