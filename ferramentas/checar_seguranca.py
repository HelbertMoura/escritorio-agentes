"""Confere no servidor de verdade (rotas reais, sem rede) as regras de login, origem, cookie e limite de tentativas.
Uso: python -B ferramentas/checar_seguranca.py <pasta do projeto>   (sai com 1 se algo falhar)
"""
import json, os, sys, tempfile, threading, time, urllib.parse, urllib.request, urllib.error
PROJ = sys.argv[1]
os.environ["ESCRITORIO_DADOS"] = tempfile.mkdtemp(prefix="esc-verif-")
os.environ["ESCRITORIO_TIMES"] = os.path.join(os.environ["ESCRITORIO_DADOS"], "times.json")  # nunca o times.json real
with open(os.environ["ESCRITORIO_TIMES"], "w", encoding="utf-8") as f:
    f.write('{"conversas": "ler"}')
sys.path.insert(0, PROJ)
import escritorio as e
from acesso import Acesso, LIMITE
from http.server import ThreadingHTTPServer

class L:
    def foto(self): return {"agentes": [], "trabalhos": [], "atualizado": None, "erro": None}
srv = ThreadingHTTPServer(("127.0.0.1", 0), e.Pagina)
srv.leitor, srv.acesso = L(), Acesso(os.environ["ESCRITORIO_DADOS"])
srv.cred = e.Credenciais(os.path.join(os.environ["ESCRITORIO_DADOS"], "oauth.json"))  # sem conexao; o state e conferido antes da rede
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = "http://127.0.0.1:%d" % srv.server_address[1]; e.BASE = base
cod = open(os.path.join(os.environ["ESCRITORIO_DADOS"], "codigo-primeiro-acesso.txt")).read().strip()
srv.acesso.criar_primeiro(cod, "dono", "senha-bem-grande")

class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NR)
def req(rota, cab=None, dados=None, metodo=None):
    r = urllib.request.Request(base + rota, headers=cab or {}, data=dados, method=metodo)
    try:
        with op.open(r) as x: return x.status, x.headers
    except urllib.error.HTTPError as err: return err.code, err.headers

falhas = []
def confere(rotulo, obtido, esperado):
    ok = obtido == esperado
    if not ok: falhas.append(rotulo)
    print("%s %s -> %s%s" % ("ok   " if ok else "FALHA", rotulo, obtido, "" if ok else " (esperado %s)" % (esperado,)))

form = urllib.parse.urlencode({"usuario": "dono", "senha": "senha-bem-grande"}).encode()
print("== Achado 2: formularios de entrar, primeiro acesso e sair")
confere("GET /entrar Referrer-Policy (o navegador passa a mandar o Origin real no POST)", req("/entrar")[1]["Referrer-Policy"], "same-origin")
for rota in ("/entrar", "/primeiro-acesso", "/sair"):
    confere("POST %s com Origin: null continua recusado" % rota, req(rota, {"Origin": "null"}, form)[0], 403)
confere("POST /entrar com Origin: null e Referer valido (Referer so conta sem Origin)", req("/entrar", {"Origin": "null", "Referer": base + "/entrar"}, form)[0], 403)
confere("POST /entrar sem Origin e sem Referer", req("/entrar", {}, form)[0], 403)
st, h = req("/entrar", {"Origin": base}, form)
confere("POST /entrar com o Origin que o navegador manda agora", st, 303)
ck = h.get("Set-Cookie") or ""

print("== Achado 3: volta do OAuth (navegacao vinda do agentes.chat)")
confere("cookie da sessao com SameSite=Lax (vai junto numa navegacao GET de outro site)", "SameSite=Lax" in ck, True)
confere("cookie da sessao sem SameSite=Strict", "SameSite=Strict" in ck, False)
st, h = req("/oauth/retorno?code=abc&state=xyz")
confere("GET /oauth/retorno sem cookie (outro site, sem sessao) cai no login", (st, h.get("Location")), (302, "/entrar"))
st, _ = req("/oauth/retorno?code=abc&state=xyz", {"Cookie": ck.split(";")[0]})
confere("GET /oauth/retorno com o cookie Lax chega ao OAuth (state falso -> 400, nao 302 /entrar)", st, 400)

print("== Conectar (C1): paginas de erro do OAuth, endereco errado e bind")
def req_corpo(rota, cab=None, dados=None):
    r = urllib.request.Request(base + rota, headers=cab or {}, data=dados)
    try:
        with op.open(r) as x: return x.status, x.headers, x.read().decode()
    except urllib.error.HTTPError as err: return err.code, err.headers, err.read().decode()
st, h, pag = req_corpo("/entrar", {"Origin": "https://outro.exemplo"}, form)
confere("POST /entrar de outro endereco: 403 com a pagina de entrar, sem cookie", (st, h.get("Set-Cookie")), (403, None))
confere("... mostra o endereco configurado e nao ecoa o Origin", (base in pag, "outro.exemplo" in pag), (True, False))
sessao = {"Cookie": ck.split(";")[0]}
hostil = urllib.parse.quote("<script>alert(1)</script> evil.example")
st, h, pag = req_corpo("/oauth/retorno?error=access_denied&error_description=" + hostil, sessao)
confere("GET /oauth/retorno com error_description hostil: 400 em HTML, sem repetir o texto",
        (st, h.get("Content-Type"), "evil" in pag, "<script" in pag), (400, "text/html; charset=utf-8", False, False))
st, _, pag = req_corpo("/oauth/retorno?error=" + hostil, sessao)
confere("GET /oauth/retorno com error hostil: o codigo fora de [a-z_] nao aparece", (st, "evil" in pag, "<script" in pag), (400, False, False))
emissor, e.EMISSOR = e.EMISSOR, "http://127.0.0.1:9"   # porta fechada: nada sai para o agentes.chat
st, h, pag = req_corpo("/oauth/conectar", sessao)
confere("GET /oauth/conectar sem rede: 502 com a pagina de aviso", (st, h.get("Content-Type"), 'href="/oauth/conectar"' in pag),
        (502, "text/html; charset=utf-8", True))
e.EMISSOR = emissor
confere("ESCRITORIO_BIND=0.0.0.0 sem ESCRITORIO_BASE definida nao sobe", e.erro_rede(base, "0.0.0.0", 7371, False) is None, False)
confere("ESCRITORIO_BIND fora de 127.0.0.1 e 0.0.0.0 nao sobe", e.erro_rede(base, "::", 7371, True) is None, False)
confere("ESCRITORIO_BASE com caminho ou barra no fim nao sobe", [e.erro_rede(base + x, "127.0.0.1", 7371, True) is None for x in ("/", "/app")], [False, False])

print("== Achado 4: limite de tentativas por usuario")
ruim = urllib.parse.urlencode({"usuario": "qualquer", "senha": "errada-errada"}).encode()
t0 = time.time()
fios = [threading.Thread(target=req, args=("/entrar", {"Origin": base}, ruim)) for _ in range(LIMITE)]
for f in fios: f.start()
for f in fios: f.join()
print("      %d falhas em paralelo com usuario inexistente levaram %.1fs (o atraso fica fora da trava)" % (LIMITE, time.time() - t0))
try:
    srv.acesso.entrar("dono", "senha-bem-grande"); r = "entrou"
except PermissionError as x:
    r = str(x)
confere("dono com a senha certa depois disso", r, "entrou")
a2 = Acesso(tempfile.mkdtemp(prefix="esc-verif2-"))
for _ in range(LIMITE):
    try: a2.entrar("qualquer", "errada-errada")
    except PermissionError: pass
try:
    c2 = open(os.path.join(a2.pasta, "codigo-primeiro-acesso.txt")).read().strip()
    a2.criar_primeiro(c2, "dono", "senha-bem-grande"); r = "criado"
except PermissionError as x:
    r = str(x)
confere("primeiro acesso com o codigo certo depois de %d falhas de inexistente" % LIMITE, r, "criado")

print("== Fase R: modo resposta e envio (Origin obrigatorio, JSON exato, senha)")
class CredEscrita:  # conexao com escrita de mentira: nada sai para o agentes.chat
    def tem_escrita(self): return True
    def token(self): return None
e.TIMES = os.path.join(os.environ["ESCRITORIO_DADOS"], "times.json")
with open(e.TIMES, "w", encoding="utf-8") as f:
    f.write('{"conversas": "responder"}')
srv.cred, srv.respostas = CredEscrita(), e.Respostas(srv.leitor, None)
sessao = {"Cookie": ck.split(";")[0]}
js = lambda senha: json.dumps({"senha": senha}).encode()
for rota in ("/api/conversa/modo", "/api/conversa/responder", "/api/conversa/modo/fechar"):
    confere("POST %s sem Origin, com Referer valido (aqui o Referer nao conta)" % rota,
            req(rota, {**sessao, "Referer": base + "/", "Content-Type": "application/json"}, js("x"))[0], 403)
    confere("POST %s com Origin: null" % rota, req(rota, {**sessao, "Origin": "null", "Content-Type": "application/json"}, js("x"))[0], 403)
confere("POST /api/conversa/modo em text/plain (formulario de outro site)", req("/api/conversa/modo", {**sessao, "Origin": base, "Content-Type": "text/plain"}, js("senha-bem-grande"))[0], 415)
confere("POST /api/conversa/modo sem sessao", req("/api/conversa/modo", {"Origin": base, "Content-Type": "application/json"}, js("senha-bem-grande"))[0], 401)
confere("POST /api/conversa/modo com a senha errada", req("/api/conversa/modo", {**sessao, "Origin": base, "Content-Type": "application/json"}, js("errada-errada"))[0], 403)
st, h = req("/api/conversa/modo", {**sessao, "Origin": base, "Content-Type": "application/json"}, js("senha-bem-grande"))
modo = h.get("Set-Cookie") or ""
confere("POST /api/conversa/modo com a senha certa", st, 200)
confere("cookie do modo SameSite=Strict, HttpOnly e sem Max-Age/Expires (some ao fechar o navegador)",
        ("SameSite=Strict" in modo, "HttpOnly" in modo, "Max-Age" in modo or "Expires" in modo), (True, True, False))
envio = json.dumps({"id": "abcdefghijkl", "run_id": "r1", "texto": "oi", "chave": "0b9c5c55-3b3a-4c7e-9a1e-2f6d1c8b7a10"}).encode()
st, _ = req("/api/conversa/responder", {**sessao, "Origin": base, "Content-Type": "application/json"}, envio)
confere("envio da mesma sessao sem o cookie do modo (outro navegador)", st, 403)

print("== Modo construcao: salvar a planta (Origin obrigatorio, JSON exato, rev)")
srv.planta = e.Planta(e.ARQ_PLANTA, e.log, lambda dados: e.gravar(e.ARQ_PLANTA, dados))
pl = lambda rev, **x: json.dumps({"rev": rev, "salas": {}, "moveis": {}, "novos": [], **x}).encode()
jp = {**sessao, "Origin": base, "Content-Type": "application/json"}
confere("POST /api/planta sem Origin, com Referer valido (aqui o Referer nao conta)",
        req("/api/planta", {**sessao, "Referer": base + "/", "Content-Type": "application/json"}, pl(0))[0], 403)
confere("POST /api/planta com Origin: null", req("/api/planta", {**sessao, "Origin": "null", "Content-Type": "application/json"}, pl(0))[0], 403)
confere("POST /api/planta com Origin de outro site", req("/api/planta", {**jp, "Origin": "https://outro.exemplo"}, pl(0))[0], 403)
confere("POST /api/planta em text/plain (formulario de outro site)", req("/api/planta", {**jp, "Content-Type": "text/plain"}, pl(0))[0], 415)
confere("POST /api/planta sem sessao", req("/api/planta", {"Origin": base, "Content-Type": "application/json"}, pl(0))[0], 401)
confere("POST /api/planta com True no lugar de numero", req("/api/planta", jp, pl(0, salas={"lounge": {"piso": True}}))[0], 400)
grande = pl(0)[:-1] + b" " * 65536 + b"}"
confere("POST /api/planta com JSON valido de mais de 64 KB", req("/api/planta", jp, grande)[0], 400)
confere("POST /api/planta com rev certo", req("/api/planta", jp, pl(0, salas={"lounge": {"piso": 3}}))[0], 200)
confere("POST /api/planta com rev velho", req("/api/planta", jp, pl(0))[0], 409)
st, h = req("/construir.html")
confere("GET /construir.html sem sessao cai no login", (st, h.get("Location")), (302, "/entrar"))

print("== Configuracoes: clima e datas (Origin obrigatorio, JSON exato, numero de verdade, teto, rev)")
e.ARQ_CLIMA = os.path.join(os.environ["ESCRITORIO_DADOS"], "clima.json")
e.ARQ_FESTAS = os.path.join(os.environ["ESCRITORIO_DADOS"], "festas.json")
cl = lambda **x: json.dumps({"clima": {"cidade": "Cidade de teste", "lat": -8.05, "lon": -34.88, **x}}).encode()
fe = lambda rev: json.dumps({"rev": rev, "proprias": [], "desligadas": []}).encode()
for rota, bom in (("/api/clima", cl()), ("/api/festas", fe(0))):
    confere("POST %s sem Origin, com Referer valido (aqui o Referer nao conta)" % rota,
            req(rota, {**sessao, "Referer": base + "/", "Content-Type": "application/json"}, bom)[0], 403)
    confere("POST %s com Origin: null" % rota, req(rota, {**sessao, "Origin": "null", "Content-Type": "application/json"}, bom)[0], 403)
    confere("POST %s com Origin de outro site" % rota, req(rota, {**jp, "Origin": "https://outro.exemplo"}, bom)[0], 403)
    confere("POST %s em text/plain (formulario de outro site)" % rota, req(rota, {**jp, "Content-Type": "text/plain"}, bom)[0], 415)
    confere("POST %s sem sessao" % rota, req(rota, {"Origin": base, "Content-Type": "application/json"}, bom)[0], 401)
    teto = e.CLIMA_BYTES if rota == "/api/clima" else e.FESTAS_BYTES
    confere("POST %s com JSON valido acima do teto (%d B)" % (rota, teto), req(rota, jp, bom[:-1] + b" " * teto + b"}")[0], 400)
for rotulo, corpo in (("NaN", b'{"clima": {"cidade": "X", "lat": NaN, "lon": 1}}'), ("Infinity", b'{"clima": {"cidade": "X", "lat": Infinity, "lon": 1}}'),
                      ("1e400", b'{"clima": {"cidade": "X", "lat": 1e400, "lon": 1}}'), ("true", cl(lat=True)), ("fora da faixa", cl(lon=181))):
    confere("POST /api/clima com %s no lugar de numero" % rotulo, req("/api/clima", jp, corpo)[0], 400)
confere("POST /api/clima certo", req("/api/clima", jp, cl())[0], 200)
confere("POST /api/festas com dias=true", req("/api/festas", jp, json.dumps({"rev": 0, "proprias": [{"nome": "X", "data": "01-01", "dias": True, "tema": "natal"}], "desligadas": []}).encode())[0], 400)
confere("POST /api/festas com rev certo", req("/api/festas", jp, fe(0))[0], 200)
confere("POST /api/festas com rev velho", req("/api/festas", jp, fe(0))[0], 409)
confere("GET /api/clima/busca sem sessao", req("/api/clima/busca?q=Recife")[0], 401)
confere("GET /api/clima/busca com 1 letra (recusa antes de qualquer rede)", req("/api/clima/busca?q=R", sessao)[0], 400)

print("== Vida social: mandar pro ringue (Origin obrigatorio, JSON exato)")
briga = json.dumps({"a": "a1", "b": "a2"}).encode()
confere("POST /api/social/briga sem Origin, com Referer valido (aqui o Referer nao conta)",
        req("/api/social/briga", {**sessao, "Referer": base + "/", "Content-Type": "application/json"}, briga)[0], 403)
confere("POST /api/social/briga com Origin: null", req("/api/social/briga", {**sessao, "Origin": "null", "Content-Type": "application/json"}, briga)[0], 403)
confere("POST /api/social/briga em text/plain (formulario de outro site)",
        req("/api/social/briga", {**sessao, "Origin": base, "Content-Type": "text/plain"}, briga)[0], 415)
confere("GET /api/social/placar sem sessao", req("/api/social/placar")[0], 401)
greve = json.dumps({"id": "abc"}).encode()   # atender a greve: as mesmas barreiras do ringue
confere("POST /api/social/greve/atender sem Origin, com Referer valido",
        req("/api/social/greve/atender", {**sessao, "Referer": base + "/", "Content-Type": "application/json"}, greve)[0], 403)
confere("POST /api/social/greve/atender com Origin: null",
        req("/api/social/greve/atender", {**sessao, "Origin": "null", "Content-Type": "application/json"}, greve)[0], 403)
confere("POST /api/social/greve/atender em text/plain",
        req("/api/social/greve/atender", {**sessao, "Origin": base, "Content-Type": "text/plain"}, greve)[0], 415)
confere("POST /api/social/greve/atender sem sessao", req("/api/social/greve/atender", {"Origin": base, "Content-Type": "application/json"}, greve)[0], 401)
srv.shutdown()
print("RESULTADO:", "tudo certo" if not falhas else "%d falha(s)" % len(falhas))
sys.exit(1 if falhas else 0)
