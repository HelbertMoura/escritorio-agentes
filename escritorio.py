# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Escritório dos agentes: página que mostra quem do time do agentes.chat está trabalhando.

Lê o agentes.chat pelo conector MCP de apps externos (OAuth, escopo só "read"), a cada
ESCRITORIO_INTERVALO segundos, e guarda um resumo em memória. Não chama modelo de IA nenhum.
Serve a página em 127.0.0.1; quem publica é a Tailscale (tailscale serve), só na rede privada
da pessoa, com HTTPS. Na frente de tudo há login com usuário e senha (acesso.py).

Rotas: /entrar /primeiro-acesso /sair /logo  /  /<estático>  /api/estado /api/config /api/marca
       /api/logo /oauth/conectar /oauth/retorno   (as quatro primeiras e os estáticos do login sem sessão)
Uso: python3 -I escritorio.py           serviço (variáveis no /etc/escritorio.env)
     python3 -I escritorio.py codigo    mostra o código de primeiro acesso, só lendo (sudo escritorio-codigo)
Só biblioteca padrão do Python 3.
"""
import base64
import collections
import datetime
import hashlib
import html
import json
import os
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from acesso import ARQ_CODIGO, ARQ_USUARIOS, Acesso, UsuariosIlegiveis, gravar, ler_codigo, ler_usuarios  # noqa: E402

VERSAO = "1.0.0"
MCP = os.environ.get("AGENTES_MCP", "https://app.agentes.chat/mcp")
EMISSOR = os.environ.get("AGENTES_EMISSOR", "https://app.agentes.chat")
BASE = os.environ.get("ESCRITORIO_BASE", "http://127.0.0.1:7371").rstrip("/")
PORTA = int(os.environ.get("ESCRITORIO_PORTA", "7371"))
ORG = os.environ.get("AGENTES_ORG", "").strip().lower()  # id da organização no agentes.chat; obrigatório no main()
TIMES = os.environ.get("ESCRITORIO_TIMES", os.path.join(os.path.dirname(os.path.abspath(__file__)), "times.json"))
DADOS = os.environ.get("ESCRITORIO_DADOS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados"))
ESTATICO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
# AGPL §13: quem usa pela rede tem acesso ao código. Um fork modificado aponta ESCRITORIO_FONTE para o próprio código.
FONTE_PADRAO = "https://github.com/HelbertMoura/escritorio-agentes"
FONTE_OK = re.compile(r"https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~:/%+-]*)?")   # o mesmo do instalar.sh


def fonte_codigo(valor):
    """Endereço do código-fonte: https, sem aspas, espaços nem nada que o shell interprete, até 200 caracteres;
    fora disso, o padrão."""
    valor = valor or ""
    return valor if len(valor) <= 200 and FONTE_OK.fullmatch(valor) else FONTE_PADRAO


FONTE = fonte_codigo(os.environ.get("ESCRITORIO_FONTE"))
INTERVALO = max(10, int(os.environ.get("ESCRITORIO_INTERVALO", "15")))
ARQ_TOKEN = os.path.join(DADOS, "oauth.json")
URL_APP = re.compile(r"https://app\.agentes\.chat/org/" + re.escape(ORG) + r"/c/[0-9a-f\-]{36}(\?m=[0-9a-f\-]{36})?")
ARQUIVOS = {  # estáticos servidos (lista fechada)
    "index.html": "text/html; charset=utf-8", "app.js": "text/javascript; charset=utf-8",
    "avatar.js": "text/javascript; charset=utf-8", "mapa.js": "text/javascript; charset=utf-8",
    "vida.js": "text/javascript; charset=utf-8", "som.js": "text/javascript; charset=utf-8",
    "ceu.js": "text/javascript; charset=utf-8", "clima.js": "text/javascript; charset=utf-8",
    "festas.js": "text/javascript; charset=utf-8", "efeitos.js": "text/javascript; charset=utf-8",
    "estilo.css": "text/css; charset=utf-8", "tema/atlas.png": "image/png", "tema/atlas.json": "application/json",
    "logo.png": "image/png", "fontes/figtree.ttf": "font/ttf", "fontes/silkscreen.ttf": "font/ttf",
    "fontes/source-sans-3.woff2": "font/woff2", "fontes/doto.woff2": "font/woff2",
    "entrar.css": "text/css; charset=utf-8", "entrar.js": "text/javascript; charset=utf-8",
    "personalizar.js": "text/javascript; charset=utf-8", "brincar.js": "text/javascript; charset=utf-8",
    "simular.js": "text/javascript; charset=utf-8",
    "maquete.js": "text/javascript; charset=utf-8",   # ES module, carregado por import() só quando a pessoa abre a maquete 3D
    # three.js sem alteração (cópia do npm, sha256 conferido em teste); a versão no caminho permite cache imutável
    "vendor/three-0.186.1/three.module.js": "text/javascript; charset=utf-8",
    "vendor/three-0.186.1/three.core.js": "text/javascript; charset=utf-8",
}
TIMEOUT = 20


def log(**campos):
    campos["hora"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    print(json.dumps(campos, ensure_ascii=False), flush=True)


# ---------------------------------------------------------------- OAuth (cliente público + PKCE)

class Credenciais:
    def __init__(self, caminho):
        self.caminho, self.trava, self.pendentes = caminho, threading.Lock(), {}
        self.dados = {}
        if os.path.exists(caminho):
            try:
                with open(caminho, encoding="utf-8") as f:
                    self.dados = json.load(f)
            except (ValueError, OSError):
                log(evento="oauth", resultado="arquivo_invalido")  # começa do zero; basta reconectar

    def salvar(self):
        gravar(self.caminho, json.dumps(self.dados).encode("utf-8"))

    def redirect_uri(self):
        return BASE + "/oauth/retorno"

    def registrar(self):
        if self.dados.get("client_id") and self.dados.get("redirect_uri") == self.redirect_uri():
            return self.dados["client_id"]
        corpo = {"client_name": "Escritório dos agentes (leitura)", "redirect_uris": [self.redirect_uri()],
                 "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                 "token_endpoint_auth_method": "none", "scope": "read"}
        resp = post_json(EMISSOR + "/api/oauth/register", corpo)
        self.dados = {"client_id": resp["client_id"], "redirect_uri": self.redirect_uri()}
        self.salvar()
        return resp["client_id"]

    def url_autorizacao(self):
        with self.trava:
            cliente = self.registrar()
            verificador = secrets.token_urlsafe(64)
            desafio = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).rstrip(b"=").decode()
            estado = secrets.token_urlsafe(24)
            agora = time.time()
            vivos = sorted(((k, v) for k, v in self.pendentes.items() if agora - v[1] < 600), key=lambda kv: kv[1][1])
            self.pendentes = dict(vivos[-4:])  # no máximo 5 logins em andamento
            self.pendentes[estado] = (verificador, agora)
            q = {"response_type": "code", "client_id": cliente, "redirect_uri": self.redirect_uri(), "scope": "read",
                 "state": estado, "code_challenge": desafio, "code_challenge_method": "S256", "resource": MCP}
            return EMISSOR + "/api/oauth/authorize?" + urllib.parse.urlencode(q)

    def concluir(self, codigo, estado):
        with self.trava:
            pend = self.pendentes.pop(estado, None)
            if not pend or time.time() - pend[1] > 600:
                raise ValueError("estado do login inválido ou expirado; comece de novo em /oauth/conectar")
            tok = post_form(EMISSOR + "/api/oauth/token", {
                "grant_type": "authorization_code", "code": codigo, "redirect_uri": self.redirect_uri(),
                "client_id": self.dados["client_id"], "code_verifier": pend[0], "resource": MCP})
            self._guardar(tok)

    def _guardar(self, tok):
        escopo = set(str(tok.get("scope", "read")).split())
        if escopo - {"read"}:
            raise PermissaoNegada("o agentes.chat concedeu mais que leitura; conexão recusada")
        self.dados["access_token"] = tok["access_token"]
        if tok.get("refresh_token"):
            self.dados["refresh_token"] = tok["refresh_token"]
        self.dados["expira"] = time.time() + int(tok.get("expires_in", 3600))
        self.dados["escopo"] = tok.get("scope", "")
        self.salvar()

    def token(self):
        with self.trava:
            if not self.dados.get("access_token"):
                return None
            if time.time() > self.dados.get("expira", 0) - 90:
                if not self.dados.get("refresh_token"):
                    return None
                try:
                    tok = post_form(EMISSOR + "/api/oauth/token", {
                        "grant_type": "refresh_token", "refresh_token": self.dados["refresh_token"],
                        "client_id": self.dados["client_id"], "resource": MCP})
                    self._guardar(tok)
                except PermissaoNegada:
                    for k in ("access_token", "refresh_token", "expira"):  # revogado: pede nova conexão
                        self.dados.pop(k, None)
                    self.salvar()
                    return None
            return self.dados["access_token"]


def _abrir(req):
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, dict(r.headers), r.read(2_000_000)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read(200_000)


def post_json(url, corpo):
    req = urllib.request.Request(url, json.dumps(corpo).encode(), {"Content-Type": "application/json", "Accept": "application/json"})
    st, _, dados = _abrir(req)
    if st >= 300:
        raise RuntimeError(f"{url} respondeu HTTP {st}")
    return json.loads(dados)


def post_form(url, campos):
    req = urllib.request.Request(url, urllib.parse.urlencode(campos).encode(),
                                 {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    st, _, dados = _abrir(req)
    if st >= 300:
        raise PermissaoNegada(f"o login do agentes.chat recusou o token (HTTP {st})")
    return json.loads(dados)


class PermissaoNegada(Exception):
    pass


# ---------------------------------------------------------------- MCP do agentes.chat

class ClienteMCP:
    def __init__(self, cred):
        self.cred, self.sessao, self.n = cred, None, 0

    def _post(self, corpo, token):
        cab = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
               "MCP-Protocol-Version": "2025-06-18"}
        if self.sessao:
            cab["Mcp-Session-Id"] = self.sessao
        req = urllib.request.Request(MCP, json.dumps(corpo).encode(), cab)
        req.add_unredirected_header("Authorization", "Bearer " + token)  # nunca segue para outro host
        st, headers, dados = _abrir(req)
        sid = {k.lower(): v for k, v in headers.items()}.get("mcp-session-id")
        if sid:
            self.sessao = sid
        if st == 401:
            raise PermissaoNegada("o agentes.chat recusou o acesso (HTTP 401)")
        if st == 404 and self.sessao:
            self.sessao = None
            raise ConnectionResetError("sessão MCP expirou")
        if st >= 300:
            raise RuntimeError(f"MCP respondeu HTTP {st}")
        return _resposta_jsonrpc(dados)

    def _rpc(self, metodo, params, token):
        self.n += 1
        resp = self._post({"jsonrpc": "2.0", "id": self.n, "method": metodo, "params": params}, token)
        if resp is None:
            raise RuntimeError(f"MCP sem resposta para {metodo}")
        if "error" in resp:
            raise RuntimeError(f"MCP {metodo}: {resp['error'].get('message', 'erro')}")
        return resp.get("result", {})

    def iniciar(self, token):
        self.sessao = None
        self._rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                 "clientInfo": {"name": "escritorio-agentes", "version": VERSAO}}, token)
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, token)

    def ferramenta(self, nome, args, token):
        res = self._rpc("tools/call", {"name": nome, "arguments": args}, token)
        if res.get("isError"):
            raise RuntimeError(f"{nome}: {_texto(res)[:200]}")
        if isinstance(res.get("structuredContent"), dict):
            return res["structuredContent"]
        return json.loads(_texto(res) or "{}")


def _texto(res):
    return "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")


def _resposta_jsonrpc(dados):
    txt = dados.decode("utf-8", "replace").strip()
    if not txt:
        return None
    if txt.startswith("{"):
        return json.loads(txt)
    ultima = None  # text/event-stream: pega a última mensagem JSON-RPC com resultado
    for linha in txt.splitlines():
        if linha.startswith("data:"):
            try:
                msg = json.loads(linha[5:].strip())
            except ValueError:
                continue
            if "result" in msg or "error" in msg:
                ultima = msg
    return ultima


# ---------------------------------------------------------------- resumo do estado

def limpa_rotulo(txt, nomes=None):
    """Texto curto e legível da tarefa. Resposta de outro agente vem como
    "handle: <external_data ...>", às vezes cortada no meio da marcação."""
    txt = (txt or "")[:500]
    m = re.match(r"\s*([\w.\-]+):\s*<external_data", txt)
    if m:
        quem = (nomes or {}).get(m.group(1).lower(), "@" + m.group(1))
        return f"Lendo a resposta de {quem}"
    txt = re.sub(r"<[^>]{0,400}>", " ", txt)
    txt = re.sub(r"<[^>]*$", " ", txt)  # marcação cortada no fim
    txt = re.sub(r"\s+", " ", html.unescape(txt)).strip()
    return (txt[:110] + "…") if len(txt) > 110 else txt


def resumir(agentes, tarefas):
    lista = [{"id": a["id"], "nome": a.get("name", "")[:60], "handle": a.get("handle", "")[:40],
              "funcao": (a.get("role") or "")[:120]} for a in agentes]
    ids = {a["id"] for a in lista}
    nomes = {a["handle"].lower(): a["nome"] for a in lista}
    por_agente, todas = {}, []
    for t in tarefas:
        ag = (t.get("agent") or {}).get("id")
        if ag not in ids:
            continue
        url = str(t.get("url") or "")[:200]
        inicio = str(t.get("started_at", ""))[:40]
        item = {"agente_id": ag, "run_id": str(t.get("run_id") or f"{ag}:{inicio}")[:80],
                "status": str(t.get("status", ""))[:30], "rotulo": limpa_rotulo(t.get("label", ""), nomes),
                "inicio": inicio, "started_at": inicio, "url": url if URL_APP.fullmatch(url) else ""}
        todas.append({k: item[k] for k in ("agente_id", "run_id", "status", "started_at")})  # sem rótulo nem url
        atual = por_agente.get(ag)
        # Se o agente tem várias tarefas, mostra a que pede algo da pessoa; senão a mais recente.
        peso = {"waiting_approval": 3, "waiting_input": 2}.get(item["status"], 1)
        if not atual or peso > atual[0] or (peso == atual[0] and item["inicio"] > atual[1]["inicio"]):
            por_agente[ag] = (peso, item)
    return {"agentes": lista, "trabalhos": [v[1] for v in por_agente.values()], "tarefas": todas}


def _iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


try:  # "hoje" dos resolvidos, no fuso de Brasília como o relógio da página
    from zoneinfo import ZoneInfo
    FUSO = ZoneInfo("America/Sao_Paulo")
except (ImportError, KeyError):  # sem tzdata (Windows sem o pacote): o Brasil não tem horário de verão desde 2019
    FUSO = datetime.timezone(datetime.timedelta(hours=-3))


def _meia_noite(t):
    """Início do dia (fuso de Brasília) em que cai o instante t, em segundos."""
    return datetime.datetime.fromtimestamp(t, FUSO).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


class Diario:
    """Transições de estado das tarefas, a cada leitura. Fica só na memória: reiniciar o serviço zera.
    Por run_id guarda o status e desde quando ele foi visto; o run_id que some sai do diário.
    A primeira leitura é só a linha de base (sem rajada de "comecou"). Eventos sem nenhum conteúdo.
    Também guarda os pedidos resolvidos hoje (fuso de Brasília): aprovação ou pergunta que voltou a trabalhar,
    terminou ou virou outro pedido, com o mesmo rótulo limpo que os trabalhos já mostram."""
    LIMITE = 50
    PEDIDO = {"waiting_approval": "pediu_aprovacao", "waiting_input": "pediu_resposta"}
    TIPO = {"waiting_approval": "aprovacao", "waiting_input": "pergunta"}

    def __init__(self):
        self.runs = {}  # run_id -> {"status", "desde", "agente", "inicio", "rotulo"}
        self.eventos = collections.deque(maxlen=self.LIMITE)  # do mais novo para o mais velho
        self.resolvidos = collections.deque(maxlen=self.LIMITE)  # (instante, item), do mais novo para o mais velho
        self.base = False

    def aplicar(self, resumo, completa=True, agora=None):
        """Registra a leitura do resumir(): põe "desde" nas tarefas e nos trabalhos e os "eventos"."""
        rotulos = {t["run_id"]: t["rotulo"] for t in resumo["trabalhos"]}   # tarefas segue sem rótulo
        resumo["eventos"] = self.registrar(resumo["tarefas"], {a["id"]: a["handle"] for a in resumo["agentes"]}, agora,
                                           completa, rotulos)
        resumo["resolvidos"] = self.resolvidos_hoje(agora)
        desde = {t["run_id"]: t.get("desde") for t in resumo["tarefas"]}
        for t in resumo["trabalhos"]:
            t["desde"] = desde.get(t["run_id"])
        return resumo

    def registrar(self, tarefas, handles, agora=None, completa=True, rotulos=None):
        """Põe "desde" em cada tarefa e devolve a lista de eventos recentes. Leitura incompleta (parou no
        teto de páginas) não termina nem apaga quem não apareceu."""
        agora = time.time() if agora is None else agora
        em = _iso(agora)
        vistos = set()
        for t in tarefas:
            rid, st = t["run_id"], t["status"]
            if rid in vistos:  # run_id repetido na mesma leitura: vale o primeiro (a cópia leva o mesmo "desde")
                t["desde"] = self.runs[rid]["desde"]
                continue
            vistos.add(rid)
            antes = self.runs.get(rid)
            if not antes or self.PEDIDO.get(antes["status"]) != self.PEDIDO.get(st):  # running e still_running são o mesmo estado
                agente = handles.get(t["agente_id"], "")
                if self.base:
                    self._transicao(em, agente, rid, antes and antes["status"], st)
                    if antes and antes["status"] in self.PEDIDO:
                        self._resolvido(agora, antes, rid, "outro_pedido" if st in self.PEDIDO else "voltou_a_trabalhar")
                antes = self.runs[rid] = {"status": st, "desde": em, "agente": agente, "inicio": not self.base, "rotulo": ""}
            if st in self.PEDIDO and rid in (rotulos or {}):   # o rótulo do pedido, enquanto ele espera
                antes["rotulo"] = rotulos[rid]
            t["desde"] = antes["desde"]
        for rid in [r for r in self.runs if r not in vistos] if completa else []:
            if self.base:
                self._evento(em, "terminou", self.runs[rid]["agente"], rid)
                if self.runs[rid]["status"] in self.PEDIDO:
                    self._resolvido(agora, self.runs[rid], rid, "terminou")
            del self.runs[rid]
        self.base = True
        return list(self.eventos)

    def _transicao(self, em, agente, rid, antes, agora):
        if antes is None:
            self._evento(em, "comecou", agente, rid)
        if agora in self.PEDIDO:
            self._evento(em, self.PEDIDO[agora], agente, rid)
        elif antes in self.PEDIDO:
            self._evento(em, "voltou_a_trabalhar", agente, rid)

    def _evento(self, em, tipo, agente, rid):
        self.eventos.appendleft({"em": em, "tipo": tipo, "agente": agente, "run_id": rid})

    def _resolvido(self, agora, pedido, rid, desfecho):
        self.resolvidos.appendleft((agora, {"run_id": rid, "agente": pedido["agente"], "tipo": self.TIPO[pedido["status"]],
                                            "rotulo": pedido["rotulo"], "pediu_em": pedido["desde"], "resolvido_em": _iso(agora),
                                            "desfecho": desfecho, "desde_inicio": pedido["inicio"]}))

    def resolvidos_hoje(self, agora=None):
        """Os resolvidos de hoje (fuso de Brasília); os de antes da meia-noite saem da memória."""
        inicio = _meia_noite(time.time() if agora is None else agora)
        while self.resolvidos and self.resolvidos[-1][0] < inicio:
            self.resolvidos.pop()
        return [item for _, item in self.resolvidos]


class Leitor(threading.Thread):
    def __init__(self, cred):
        super().__init__(daemon=True)
        self.cred, self.mcp = cred, ClienteMCP(cred)
        self.estado = {"agentes": [], "trabalhos": [], "tarefas": [], "eventos": [], "resolvidos": [], "atualizado": None,
                       "erro": "Carregando…"}
        self.trava = threading.Lock()
        self.diario = Diario()

    def ler(self):
        token = self.cred.token()
        if not token:
            raise PermissaoNegada("o escritório ainda não está conectado ao agentes.chat (abra /oauth/conectar)")
        if not self.mcp.sessao:
            self.mcp.iniciar(token)
        try:
            return self._coletar(token)
        except ConnectionResetError:
            self.mcp.iniciar(token)
            return self._coletar(token)

    def _paginas(self, nome, args, chave, token):
        """Junta até 10 páginas. Devolve (itens, completa); resposta sem a lista é erro (fica a leitura anterior)."""
        itens, cursor = [], None
        for _ in range(10):
            r = self.mcp.ferramenta(nome, {**args, "limit": 50, **({"cursor": cursor} if cursor else {})}, token)
            if not isinstance(r.get(chave), list):
                raise RuntimeError(f"{nome}: resposta sem a lista {chave}")
            itens += r[chave]
            cursor = r.get("next_cursor")
            if not cursor:
                return itens, True
        return itens, False

    def _coletar(self, token):
        """Devolve (resumo, completa)."""
        agentes, ok1 = self._paginas("list_agents", {}, "agents", token)
        tarefas, ok2 = self._paginas("list_recent_tasks", {"scope": "working"}, "tasks", token)
        return resumir(agentes, tarefas), ok1 and ok2

    def run(self):
        while True:
            try:
                novo, completa = self.ler()
                self.diario.aplicar(novo, completa)
                novo.update(atualizado=_iso(time.time()), erro=None)
                with self.trava:
                    self.estado = novo
            except PermissaoNegada as e:
                with self.trava:
                    self.estado = {**self.estado, "erro": str(e)}
                log(evento="leitura", resultado="sem_acesso", detalhe=str(e)[:200])
            except Exception as e:  # rede, MCP fora do ar: mantém o último estado e avisa
                self.mcp.sessao = None
                with self.trava:
                    self.estado = {**self.estado, "erro": "agentes.chat não respondeu; mostrando a última leitura"}
                log(evento="leitura", resultado="erro", detalhe=f"{type(e).__name__}: {str(e)[:200]}")
            time.sleep(INTERVALO)

    def foto(self):
        with self.trava:
            return dict(self.estado)


# ---------------------------------------------------------------- clima real (Open-Meteo, sem chave)

def tipo_do_clima(codigo, nuvens):
    """Código WMO do Open-Meteo -> efeito do escritório."""
    if codigo in (95, 96, 99):
        return "tempestade"
    if codigo in (71, 73, 75, 77, 85, 86):
        return "neve"
    if codigo in (61, 63, 65, 66, 67, 80, 81, 82):
        return "chuva"
    if codigo in (51, 53, 55, 56, 57):
        return "garoa"
    if codigo in (45, 48):
        return "neblina"
    if codigo in (2, 3) or (nuvens or 0) >= 60:
        return "nublado"
    return "limpo"


class Clima(threading.Thread):
    def __init__(self, lat, lon, cidade):
        super().__init__(daemon=True)
        self.lat, self.lon, self.cidade = lat, lon, cidade
        self.estado, self.trava = None, threading.Lock()

    def run(self):
        q = urllib.parse.urlencode({"latitude": self.lat, "longitude": self.lon, "timezone": "auto",
                                    "current": "weather_code,is_day,temperature_2m,precipitation,cloud_cover,wind_speed_10m"})
        while True:
            try:
                req = urllib.request.Request("https://api.open-meteo.com/v1/forecast?" + q, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                    atual = json.loads(r.read(200_000)).get("current", {})
                codigo = int(atual.get("weather_code", 0))
                with self.trava:
                    self.estado = {"tipo": tipo_do_clima(codigo, atual.get("cloud_cover")), "codigo": codigo,
                                   "temperatura": atual.get("temperature_2m"), "vento": atual.get("wind_speed_10m"),
                                   "nuvens": atual.get("cloud_cover"), "cidade": self.cidade[:40]}
            except Exception as e:  # sem clima: o escritório segue com céu limpo
                log(evento="clima", resultado="erro", detalhe=f"{type(e).__name__}: {str(e)[:120]}")
            time.sleep(900)

    def foto(self):
        with self.trava:
            return self.estado


# ---------------------------------------------------------------- times e aparência (arquivo do dono)

ROTULO_OK = re.compile(r"[\w .'&À-ÿ\-]{1,40}")
HANDLE_OK = re.compile(r"[a-z0-9][a-z0-9\-]{0,40}")
CORES = {"sky", "indigo", "violet", "rose", "amber", "green", "teal", "graphite"}
OLHOS = {"happy", "sleepy", "round", "wide", "dots"}
ACESSORIOS = {"crown", "hat", "headphones", "headset", "flower", "antenna", "cap", "bow", ""}
ICONES_OK = {"codigo", "megafone", "servidor", "coroa", "sino", "controle", "xicara", "pessoas", "grafico", "pincel", "estrela"}


EMPRESA_PADRAO = "Minha empresa"


def carregar_times(caminho=None):
    """Lê times.json e devolve só o que passa na validação (o resto é ignorado). Arquivo fora do formato
    ("times" que não é lista, "parede": "x"...) vale como vazio, com um evento no log: a página nunca cai por ele."""
    padrao = _validar_times({})   # o vazio com os mesmos campos do válido (cor, app_url, clima): o app usa todos
    try:
        with open(caminho or TIMES, encoding="utf-8") as f:
            bruto = json.load(f)
    except (OSError, ValueError, RecursionError):   # RecursionError: JSON aninhado demais
        return padrao
    try:
        return _validar_times(bruto)
    except (AttributeError, KeyError, OverflowError, TypeError, ValueError) as x:   # OverflowError: "parede": 1e400
        log(evento="times", resultado="invalido", detalhe=type(x).__name__)
        return padrao


def _validar_times(bruto):
    empresa = str(bruto.get("empresa", EMPRESA_PADRAO))
    times = []
    for t in bruto.get("times", [])[:12]:
        nome = str(t.get("nome", ""))
        if not ROTULO_OK.fullmatch(nome):
            continue
        agentes = [h for h in t.get("agentes", [])[:24] if isinstance(h, str) and HANDLE_OK.fullmatch(h)]
        cor_t = str(t.get("cor", ""))
        icone = str(t.get("icone", ""))
        times.append({"nome": nome, "parede": int(t.get("parede", 0)) % 6, "piso": int(t.get("piso", 0)) % 10,
                      "cor": cor_t if re.fullmatch(r"#[0-9a-fA-F]{6}", cor_t) else None,
                      "icone": icone if icone in ICONES_OK else None,
                      "tipo": "ops" if t.get("tipo") == "ops" else ("gabinete" if t.get("tipo") == "gabinete" else "mesas"),
                      "agentes": agentes})
    aparencia = {}
    for h, a in dict(bruto.get("aparencia", {})).items():
        if HANDLE_OK.fullmatch(str(h)) and isinstance(a, dict) and a.get("color") in CORES and a.get("eyes") in OLHOS \
                and a.get("accessory", "") in ACESSORIOS:
            aparencia[h] = {"color": a["color"], "eyes": a["eyes"], "accessory": a.get("accessory", "")}
    cl = bruto.get("clima") if isinstance(bruto.get("clima"), dict) else {}
    try:
        clima = {"cidade": str(cl.get("cidade", ""))[:40], "lat": max(-90.0, min(90.0, float(cl["lat"]))), "lon": max(-180.0, min(180.0, float(cl["lon"])))}
    except (KeyError, TypeError, ValueError):
        clima = None
    cor = str(bruto.get("cor", "#f5b83d"))
    return {"empresa": empresa[:40] if ROTULO_OK.fullmatch(empresa[:40]) else EMPRESA_PADRAO, "times": times, "aparencia": aparencia,
            "cor": cor if re.fullmatch(r"#[0-9a-fA-F]{6}", cor) else "#f5b83d",
            "app_url": f"https://app.agentes.chat/org/{ORG}", "clima": clima}


# ---------------------------------------------------------------- marca (personalização salva pela tela "Personalizar")

ARQ_MARCA = os.path.join(DADOS, "marca.json")
ARQ_LOGO = os.path.join(DADOS, "logo.img")
LOGO_MAX = 600_000


def tipo_imagem(dados):
    if dados.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if dados.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "image/webp"
    return None


def _versao_logo(caminho):
    try:
        with open(caminho, "rb") as f:
            return hashlib.sha256(f.read(LOGO_MAX + 1)).hexdigest()[:16]
    except OSError:
        return None


def config_publica():
    """times.json + o que a pessoa personalizou (nome, cor, logo)."""
    cfg = carregar_times()
    try:
        with open(ARQ_MARCA, encoding="utf-8") as f:
            m = json.load(f)
    except (OSError, ValueError, RecursionError):
        m = {}
    if not isinstance(m, dict):
        m = {}
    if isinstance(m.get("empresa"), str) and ROTULO_OK.fullmatch(m["empresa"]):
        cfg["empresa"] = m["empresa"]
    if isinstance(m.get("cor"), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", m["cor"]):
        cfg["cor"] = m["cor"]
    # hash do conteúdo: muda a cada logo novo, até dois no mesmo segundo (o mtime não garante isso). Sem logo enviado,
    # vale o do logo padrão (static/logo.png, com cache público de 1 h): trocar a arte também fura o cache
    versao = _versao_logo(ARQ_LOGO) or _versao_logo(os.path.join(ESTATICO, "logo.png")) or 0
    cfg["logo"] = f"/logo?v={versao}"
    # Personalizar > empresa do times.json > padrão; no padrão, a página mostra a etiqueta "exemplo"
    cfg["marca_exemplo"] = cfg["empresa"] == EMPRESA_PADRAO
    cfg["fonte"] = FONTE   # link "Código-fonte" do rodapé (AGPL §13)
    return cfg


def salvar_marca(empresa, cor):
    if not ROTULO_OK.fullmatch(empresa or ""):
        raise ValueError("nome da empresa: até 40 letras, números e . ' & -")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", cor or ""):
        raise ValueError("cor inválida")
    gravar(ARQ_MARCA, json.dumps({"empresa": empresa, "cor": cor}).encode("utf-8"))


# ---------------------------------------------------------------- HTTP

def nome_cookie():
    return "__Host-esc_sessao" if BASE.startswith("https://") else "esc_sessao"


PUBLICOS = {"entrar.css", "entrar.js", "avatar.js", "fontes/figtree.ttf", "fontes/silkscreen.ttf", "fontes/source-sans-3.woff2",
            "fontes/doto.woff2", "logo.png"}  # liberados na tela de login


def pagina_login(erro="", primeiro=False):
    with open(os.path.join(ESTATICO, "entrar.html"), encoding="utf-8") as f:
        modelo = f.read()
    try:  # a marca nunca derruba a tela de login
        cfg = config_publica()
    except Exception as x:
        log(evento="marca", resultado="erro", detalhe=type(x).__name__)
        cfg = {}
    cor = str(cfg.get("cor", ""))
    valores = {"erro": html.escape(erro), "oculto_erro": "" if erro else "hidden",
               "modo_primeiro": "" if primeiro else "hidden", "modo_entrar": "hidden" if primeiro else "",
               "oculto_exemplo": "" if cfg.get("marca_exemplo", True) else "hidden",
               "acao": "/primeiro-acesso" if primeiro else "/entrar",
               "empresa": html.escape(str(cfg.get("empresa") or EMPRESA_PADRAO)),
               "cor": cor if re.fullmatch(r"#[0-9a-fA-F]{6}", cor) else "#f5b83d",
               "fonte": html.escape(str(cfg.get("fonte") or FONTE)),
               "logo": html.escape(str(cfg.get("logo") or "logo.png"))}   # /logo?v=<hash>, público como a marca
    # uma passada só: um valor que contenha {{...}} não vira outro marcador
    return re.sub(r"\{\{(\w+)\}\}", lambda m: valores.get(m[1], m[0]), modelo).encode()


class Pagina(BaseHTTPRequestHandler):
    server_version = "escritorio"
    sys_version = ""
    timeout = 15  # conexão parada não segura uma thread para sempre

    def log_message(self, *a):
        pass

    def _cabecalhos_seguranca(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")  # com no-referrer o POST de formulário sai com Origin: null
        if BASE.startswith("https://"):
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; "
                         "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def _envia(self, status, corpo=b"", tipo="text/plain; charset=utf-8", extra=None, cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", cache)
        self._cabecalhos_seguranca()
        for k, v in (extra or {}).items():
            if isinstance(v, list):
                for item in v:
                    self.send_header(k, item)
            else:
                self.send_header(k, v)
        try:
            self.end_headers()
            if self.command != "HEAD":  # em blocos: o timeout vale por sendall, e o three.core.js tem 1,4 MB
                pedacos = memoryview(corpo)
                for i in range(0, len(pedacos), 65536):
                    self.wfile.write(pedacos[i:i + 65536])
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):   # fecharam a aba antes ou no meio: sem traceback
            self.close_connection = True

    def _json(self, status, obj):
        return self._envia(status, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _token(self):
        nome = nome_cookie()  # em https só vale o __Host-: outro host da tailnet não consegue criá-lo
        for parte in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == nome:
                return v
        return None

    def _usuario(self):
        if getattr(self.server, "previa_sem_login", False):  # só a prévia local (ferramentas/previa.py)
            return "previa"
        return self.server.acesso.sessao(self._token())

    def _mesma_origem(self):
        """POST só vale vindo do próprio site. Origin "null" é recusado; o Referer só conta sem Origin."""
        origem = self.headers.get("Origin")
        if origem:
            return origem.rstrip("/") == BASE
        ref = self.headers.get("Referer") or ""
        return ref == BASE or ref.startswith(BASE + "/")

    def _corpo(self, maximo):
        tam = self.headers.get("Content-Length", "")
        if not re.fullmatch(r"[0-9]{1,7}", tam) or int(tam) > maximo:
            raise ValueError("tamanho inválido")
        return self.rfile.read(int(tam))

    def _cookie(self, token, idade):
        # Lax: a volta do agentes.chat (/oauth/retorno) é navegação de outro site e precisa do cookie.
        # POST de outro site segue sem cookie e barrado pela origem; nenhum GET muda estado, fora o OAuth
        # (state de uso único, criado só com login).
        seguro = "; Secure" if BASE.startswith("https://") else ""
        return f"{nome_cookie()}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={idade}{seguro}"

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        caminho = urllib.parse.urlsplit(self.path)
        rota = caminho.path
        nome = rota.lstrip("/")
        acesso = self.server.acesso
        if rota in ("/entrar", "/primeiro-acesso"):
            primeiro = acesso.precisa_configurar()
            return self._envia(200, pagina_login(primeiro=primeiro), "text/html; charset=utf-8")
        if nome in PUBLICOS:
            return self._estatico(nome)
        if rota == "/logo":   # público: a tela de entrar mostra a marca. Só PNG, JPEG ou WEBP pelos bytes; o resto vira o padrão
            if os.path.exists(ARQ_LOGO):
                with open(ARQ_LOGO, "rb") as f:
                    dados = f.read(LOGO_MAX + 1)
                t = tipo_imagem(dados)
                if t and len(dados) <= LOGO_MAX:
                    return self._envia(200, dados, t, cache="private, max-age=86400")
            return self._estatico("logo.png")
        usuario = self._usuario()
        if not usuario:
            if rota.startswith("/api/"):
                return self._json(401, {"erro": "entre de novo"})
            return self._envia(302, b"", extra={"Location": "/entrar"})
        if rota == "/api/estado":
            clima = getattr(self.server, "clima", None)
            return self._json(200, {**self.server.leitor.foto(), "clima": clima.foto() if clima else None, "usuario": usuario})
        if rota == "/api/config":
            cfg = config_publica()
            if getattr(self.server, "previa_sem_login", False):  # o front mostra a faixa "Prévia de desenvolvimento · dados fixos"
                cfg["previa"] = True
            return self._json(200, cfg)
        if rota == "/oauth/conectar":
            try:
                return self._envia(302, b"", extra={"Location": self.server.cred.url_autorizacao()})
            except Exception as e:
                log(evento="oauth", resultado="erro", detalhe=str(e)[:200])
                return self._envia(502, "Não consegui falar com o login do agentes.chat.".encode())
        if rota == "/oauth/retorno":
            q = urllib.parse.parse_qs(caminho.query)
            if "error" in q:
                return self._envia(400, "O agentes.chat recusou a conexão. Tente de novo em /oauth/conectar.".encode())
            try:
                self.server.cred.concluir(q.get("code", [""])[0], q.get("state", [""])[0])
            except Exception as e:
                log(evento="oauth", resultado="erro", detalhe=str(e)[:200])
                return self._envia(400, f"Não deu para conectar: {str(e)[:160]}".encode())
            log(evento="oauth", resultado="conectado", usuario=usuario)
            return self._envia(302, b"", extra={"Location": "/"})
        return self._estatico("index.html" if rota in ("/", "") else nome)

    def _estatico(self, nome):
        if nome not in ARQUIVOS:
            return self._envia(404, b"")
        with open(os.path.join(ESTATICO, nome), "rb") as f:
            corpo = f.read()
        if nome.startswith("vendor/"):
            cache = "private, max-age=31536000, immutable"
        else:
            cache = "public, max-age=3600" if nome.endswith((".png", ".ttf", ".woff2")) else "no-cache"
        return self._envia(200, corpo, ARQUIVOS[nome], cache=cache)

    def do_POST(self):
        rota = urllib.parse.urlsplit(self.path).path
        acesso = self.server.acesso
        if not self._mesma_origem():
            log(evento="http", rota=rota[:40], resultado="origem_recusada")
            return self._envia(403, "Origem não permitida.".encode())
        if rota in ("/entrar", "/primeiro-acesso"):
            try:
                campos = urllib.parse.parse_qs(self._corpo(4096).decode("utf-8", "replace"))
            except ValueError:
                return self._envia(400, b"")
            v = lambda k: campos.get(k, [""])[0]
            try:
                if rota == "/primeiro-acesso":
                    if v("senha") != v("confirmar"):
                        raise ValueError("as senhas não conferem")
                    acesso.criar_primeiro(v("codigo"), v("usuario"), v("senha"))
                    log(evento="acesso", resultado="primeiro_usuario_criado")
                token = acesso.entrar(v("usuario"), v("senha"))
            except (PermissionError, ValueError) as e:
                log(evento="acesso", resultado="recusado", rota=rota)
                return self._envia(200, pagina_login(str(e), primeiro=acesso.precisa_configurar()), "text/html; charset=utf-8")
            log(evento="acesso", resultado="entrou")
            return self._envia(303, b"", extra={"Location": "/", "Set-Cookie": self._cookie(token, 30 * 86400)})
        if rota == "/sair":
            acesso.sair(self._token())
            return self._envia(303, b"", extra={"Location": "/entrar", "Set-Cookie": self._cookie("", 0)})
        if not self._usuario():
            return self._json(401, {"erro": "entre de novo"})
        if rota == "/api/marca":
            try:
                dados = json.loads(self._corpo(2048))
                salvar_marca(str(dados.get("empresa", "")), str(dados.get("cor", "")))
            except (ValueError, AttributeError) as e:
                return self._json(400, {"erro": str(e)[:120]})
            return self._json(200, config_publica())
        if rota == "/api/logo":
            try:
                dados = self._corpo(LOGO_MAX)
            except ValueError:
                return self._json(400, {"erro": "a imagem precisa ter até 600 KB"})
            if not tipo_imagem(dados):
                return self._json(400, {"erro": "envie PNG, JPEG ou WEBP"})
            gravar(ARQ_LOGO, dados)
            return self._json(200, config_publica())
        if rota == "/api/logo/remover":
            if os.path.exists(ARQ_LOGO):
                os.unlink(ARQ_LOGO)
            return self._json(200, config_publica())
        return self._envia(404, b"")


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64  # fila do listen(): com o padrão (5), vários navegadores carregando juntos levavam conexão recusada


def main():
    if BASE.startswith("http://") and not BASE.startswith("http://127.0.0.1"):
        sys.exit("ESCRITORIO_BASE precisa ser https (ou http://127.0.0.1 para teste local)")
    if BASE.startswith("https://") and not 1 <= PORTA < 1024:
        sys.exit("com https, ESCRITORIO_PORTA precisa ser menor que 1024 (porta privilegiada): numa porta alta, "
                 "qualquer usuário da máquina pode ocupá-la quando o serviço reinicia")
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", ORG):
        sys.exit("defina AGENTES_ORG com o id da sua organização no agentes.chat "
                 "(o que vem depois de /org/ no endereço do app)")
    try:  # antes de ler o agentes.chat e de abrir a porta: usuarios.json ilegível não sobe nada
        contas = Acesso(DADOS)
    except UsuariosIlegiveis as x:
        sys.exit(str(x))
    cred = Credenciais(ARQ_TOKEN)
    leitor = Leitor(cred)
    leitor.start()
    srv = Servidor(("127.0.0.1", PORTA), Pagina)  # a Tailscale (serve) publica só na rede privada
    srv.cred, srv.leitor, srv.acesso = cred, leitor, contas
    if contas.precisa_configurar():
        log(evento="acesso", resultado="aguardando_primeiro_usuario", ver_codigo="sudo escritorio-codigo")
    cl = carregar_times().get("clima")
    if cl:
        srv.clima = Clima(cl["lat"], cl["lon"], cl["cidade"])
        srv.clima.start()
    log(evento="inicio", versao=VERSAO, onde=f"127.0.0.1:{PORTA}", base=BASE)
    srv.serve_forever()


def mostrar_codigo():
    """Subcomando `codigo` (sudo escritorio-codigo): mostra o código de primeiro acesso enquanto não há usuário.
    Só lê, com as mesmas funções do serviço: não instancia Acesso (que criaria pasta e código), não grava nada e
    não chama log(). O código só sai no stdout; os recusados saem com 1 pelo stderr. Quadro só em ASCII."""
    try:
        usuarios = ler_usuarios(os.path.join(DADOS, ARQ_USUARIOS))   # usuários primeiro: um código que sobrou não vale
    except UsuariosIlegiveis as x:
        sys.exit(str(x))
    if usuarios:
        sys.exit(f"o primeiro acesso já foi feito; entre em {BASE}/entrar")
    codigo = ler_codigo(os.path.join(DADOS, ARQ_CODIGO))
    if codigo is None:
        sys.exit("o código é criado quando o serviço sobe (veja systemctl status escritorio)")
    linhas = [f"Código de primeiro acesso: {codigo}", f"Crie o seu usuário em {BASE}/entrar",
              "Vale uma vez: some quando o primeiro usuário é criado."]
    largura = max(map(len, linhas))
    borda = "+" + "-" * (largura + 2) + "+"
    print("\n".join([borda, *(f"| {linha.ljust(largura)} |" for linha in linhas), borda]))


if __name__ == "__main__":
    if sys.argv[1:] == ["codigo"]:
        mostrar_codigo()
    else:
        main()
