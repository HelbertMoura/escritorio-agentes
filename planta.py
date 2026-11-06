# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Planta do escritório (modo construção): o que a conta logada mudou no prédio automático.

É uma sobreposição: guarda só pintura por sala, peça automática movida, espelhada ou tirada e peça nova do
catálogo. Vazia ou ausente, o prédio é o de sempre. O servidor confere formato e limites; a geometria e a lista
de peças são do navegador (static/mapa.js e static/planta.js).

dados/planta.json, até 64 KB:
  {"v": 1, "rev": 3,
   "salas":  {"lounge": {"parede": 2, "piso": 5}, "time:Dev": {"piso": 3}},
   "moveis": {"lounge|sofa_cinza|0": {"x": 120, "y": 70, "e": true}, "time:Dev|planta_alta|1": {"fora": true}},
   "novos":  [{"nome": "planta_g1", "sala": "cozinha", "x": 40, "y": 30, "e": false}]}
Só biblioteca padrão do Python 3.
"""
import json
import re
import threading

PLANTA_BYTES = 65536
MAX_SALAS, MAX_MOVEIS, MAX_NOVOS = 64, 400, 200
REV_TETO, COORD_TETO, PAREDE_TETO, PISO_TETO = 10 ** 9, 4095, 6, 9
SALAS_FIXAS = {"recepcao", "reuniao", "lounge", "cozinha"}
ROTULO_OK = re.compile(r"[\w .'&À-ÿ\-]{1,40}")   # o mesmo dos times (escritorio.ROTULO_OK); não aceita "|"
PECA_OK = re.compile(r"[a-z][a-z0-9_]{0,39}")
OCORRENCIA_OK = re.compile(r"[0-9]{1,2}")
CAMPOS = {"rev", "salas", "moveis", "novos"}
MSG_REV = "A planta mudou em outra tela. Recarregue o editor para ver a versão nova."
MSG_GRAVAR = "Não deu para salvar a planta agora."


def vazia(rev=0):
    return {"rev": rev, "salas": {}, "moveis": {}, "novos": []}


def _inteiro(x, teto):
    if type(x) is not int or not 0 <= x <= teto:   # type(): o True não vale como 1
        raise ValueError("número fora da faixa")
    return x


def _sala(chave):
    if not isinstance(chave, str) or not (chave in SALAS_FIXAS or chave.startswith("time:") and ROTULO_OK.fullmatch(chave[5:])):
        raise ValueError("sala")
    return chave


def _peca(nome):
    if not isinstance(nome, str) or not PECA_OK.fullmatch(nome):
        raise ValueError("peça")
    return nome


def _espelho(e):
    if type(e) is not bool:
        raise ValueError("espelho")
    return e


def _movel(chave, valor):
    partes = chave.split("|")
    if len(partes) != 3 or not OCORRENCIA_OK.fullmatch(partes[2]):
        raise ValueError("id")
    _sala(partes[0]), _peca(partes[1])
    if not isinstance(valor, dict):
        raise ValueError("móvel")
    if set(valor) == {"fora"} and valor["fora"] is True:
        return {"fora": True}
    if not valor or not set(valor) <= {"x", "y", "e"} or ("x" in valor) != ("y" in valor):
        raise ValueError("móvel")
    limpo = {k: _inteiro(valor[k], COORD_TETO) for k in ("x", "y") if k in valor}
    if "e" in valor:
        limpo["e"] = _espelho(valor["e"])
    return limpo


def validar_planta(d, arquivo=False):
    """Tudo ou nada: a planta no formato exato, ou ValueError. arquivo=True é o planta.json (com "v": 1); sem ele, o
    corpo do POST /api/planta. Devolve uma cópia nova {rev, salas, moveis, novos}, sem nada a mais."""
    if not isinstance(d, dict) or set(d) != (CAMPOS | {"v"} if arquivo else CAMPOS):
        raise ValueError("formato")
    if arquivo and (type(d["v"]) is not int or d["v"] != 1):
        raise ValueError("versão")
    salas, moveis, novos = d["salas"], d["moveis"], d["novos"]
    if not isinstance(salas, dict) or len(salas) > MAX_SALAS:
        raise ValueError("salas")
    if not isinstance(moveis, dict) or len(moveis) > MAX_MOVEIS:
        raise ValueError("moveis")
    if not isinstance(novos, list) or len(novos) > MAX_NOVOS:
        raise ValueError("novos")
    limpas = {}
    for chave, s in salas.items():
        if not isinstance(s, dict) or not s or not set(s) <= {"parede", "piso"}:
            raise ValueError("pintura")
        limpas[_sala(chave)] = {k: _inteiro(s[k], PAREDE_TETO if k == "parede" else PISO_TETO) for k in ("parede", "piso") if k in s}
    limpos = {chave: _movel(chave, valor) for chave, valor in moveis.items()}
    lista = []
    for n in novos:
        if not isinstance(n, dict) or set(n) != {"nome", "sala", "x", "y", "e"}:
            raise ValueError("novo")
        lista.append({"nome": _peca(n["nome"]), "sala": _sala(n["sala"]), "x": _inteiro(n["x"], COORD_TETO),
                      "y": _inteiro(n["y"], COORD_TETO), "e": _espelho(n["e"])})
    return {"rev": _inteiro(d["rev"], REV_TETO), "salas": limpas, "moveis": limpos, "novos": lista}


def bytes_da_planta(p):
    """O planta.json gravado: compacto e em UTF-8, como o JSON.stringify do editor mede."""
    return json.dumps({"v": 1, **p}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def ler_planta(arquivo, log):
    """dados/planta.json validado. Ausente vale vazio; ilegível, grande demais ou fora do formato também, com 1 linha
    de log: falha aberta, porque é enfeite e a página mostra o automático. Nunca derruba o serviço."""
    try:
        with open(arquivo, "rb") as f:
            bruto = f.read(PLANTA_BYTES + 1)
        if len(bruto) > PLANTA_BYTES:
            raise ValueError("grande demais")
        return validar_planta(json.loads(bruto), arquivo=True)
    except FileNotFoundError:
        return vazia()
    except Exception as x:   # OSError, UTF-8, JSON, RecursionError, formato: tudo sobe vazio
        log(evento="planta", resultado="planta_invalida", detalhe=type(x).__name__)
        return vazia()


class Planta:
    """A planta na memória e a única gravação dela. self.atual é trocada inteira, nunca mexida no lugar: quem lê
    (o /api/config) serializa fora da trava. guardar(bytes) grava o arquivo (o gravar() atômico, em 0600)."""

    def __init__(self, arquivo, log, guardar):
        self._log, self._guardar = log, guardar
        self._trava = threading.Lock()
        self.atual = ler_planta(arquivo, log)

    def salvar(self, pedido, usuario):
        """pedido: o corpo do POST já validado (validar_planta). Devolve (status, corpo) da resposta."""
        with self._trava:
            rev = self.atual["rev"]
            if pedido["rev"] != rev:
                return 409, {"erro": "rev", "mensagem": MSG_REV, "rev": rev}
            nova = {**pedido, "rev": rev + 1}
            dados = bytes_da_planta(nova)
            if len(dados) > PLANTA_BYTES:   # o "v" e o rev novo podem passar do teto: o arquivo nunca sai ilegível
                return 400, {"erro": "pedido", "mensagem": "A planta ficou grande demais para salvar."}
            try:
                self._guardar(dados)
            except OSError as x:
                self._log(evento="planta", resultado="planta_nao_gravou", detalhe=type(x).__name__)
                return 500, {"erro": "gravar", "mensagem": MSG_GRAVAR}
            self.atual = nova
        self._log(evento="planta", resultado="salva", usuario=usuario, rev=nova["rev"], salas=len(nova["salas"]),
                  moveis=len(nova["moveis"]), novos=len(nova["novos"]))
        return 200, {"rev": nova["rev"]}

    def publica(self):
        """A planta do /api/config: a mesma estrutura, sem cópia (nunca é mexida no lugar)."""
        return self.atual
