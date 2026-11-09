# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Verifica o log da aplicação, sem presumir a configuração de proxy ou CDN."""
import contextlib
import io
import unittest

import test_visitas_http as suporte_http


class PrivacidadeLogs(unittest.TestCase):
    setUp = suporte_http.VisitasHTTP.setUp
    tearDown = suporte_http.VisitasHTTP.tearDown
    pedir = suporte_http.VisitasHTTP.pedir

    def test_credenciais_e_mensagens_fora_dos_logs_http(self):
        saida, erros = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erros):
            status, _, resposta = self.pedir('criar', {}, admin=True)
            self.assertEqual(status, 200)
            convite = resposta['convite']
            status, _, resposta = self.pedir('entrar', {'convite': convite})
            self.assertEqual(status, 200)
            sessao = resposta['sessao']
            mensagem = 'conteúdo privado de teste'
            self.assertEqual(self.pedir('enviar', {'sessao': sessao, 'texto': mensagem})[0], 200)
            self.assertEqual(self.pedir('receber', {'sessao': sessao})[2]['mensagens'], [mensagem])
            self.assertEqual(self.pedir('sair', {'sessao': sessao})[0], 200)
        log = saida.getvalue() + erros.getvalue()
        for valor in (convite, sessao, mensagem):
            self.assertNotIn(valor, log)


if __name__ == '__main__':
    unittest.main()
