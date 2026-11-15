# Copyright (C) 2026 Dev Maniac's
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Migração para o saguão (1.6, D1 b-A): o térreo vira um saguão sem agentes e a empresa principal sobe para um andar
próprio, como as outras. Só pelo subcomando, com o serviço parado: python3 -I escritorio.py saguao [--desfazer]
(no Docker: docker compose run --rm escritorio python3 -I escritorio.py saguao). Sem HTTP e sem log.

O que a ida faz, tudo ou nada (E.1 do plano):
 1. confere a trava do serviço (dados/servico.trava: o serviço a segura enquanto roda), o andares.json (ausente ou v1),
    que cabe mais um andar, o usuarios.json e o espaço livre;
 2. sorteia o id e cria dados/andares/<id>/ (0700). MOVE para lá o oauth.json, equipe.json, planta.json, placar.json,
    jornal.json e, se existirem, o banco e os anexos das conversas (o chat da empresa nunca vira o do saguão). COPIA o
    times.json (no código ou no volume), o marca.json e o logo.img: a raiz fica com a marca do prédio e da tela de entrar;
 3. grava o andares.json v2: {"v": 2, "terreo": "saguao", "andares": [o andar novo, os extras de antes]}, com a org do
    AGENTES_ORG e o nome da marca;
 4. papéis: a conta só do principal, e todo admin do principal, ganha o andar novo com o mesmo papel. A conta com o
    principal e outros andares não ganha (o principal dela pode ser o forçado de antes): sai na lista de pendentes, só o
    login, para o admin dar o andar pela tela de Membros;
 5. o papel no principal fica como está: passa a ser o papel no prédio;
 6. grava o diário dados/migracao-saguao.json (0600, com a cópia de antes do usuarios.json e do andares.json, os dois
    que são reescritos) antes de mexer em qualquer coisa e o marca como feito no fim.
Falhou no meio: desfaz o que fez e apaga o diário. Caiu no meio (o processo morreu): rodar de novo termina a ida, e
--desfazer volta. Rodar de novo depois de feita não muda nada.

--desfazer devolve tudo (o andares.json de antes, os arquivos, os papéis) e recusa, sem mexer em nada, quando há dado
novo que se perderia ou vazaria: arquivo no andar novo que não veio da migração (histórico, anexo), uma cópia mudada
(a marca, o logo ou os times do andar), conversa no saguão, um arquivo movido que reapareceu na raiz ou uma conta nova no
andar. O deploy faz backup do volume antes da ida.
"""
import hashlib
import json
import os
import secrets
import shutil
import sys
import time

import andares
import conversas_equipe
from acesso import PAPEIS, UsuariosIlegiveis, gravar, ler_usuarios

if os.name == "nt":
    import msvcrt
else:
    import fcntl

ARQ_DIARIO = "migracao-saguao.json"
ARQ_TRAVA = "servico.trava"
ARQ_USUARIOS, ARQ_MARCA, ARQ_LOGO = "usuarios.json", "marca.json", "logo.img"
PRINCIPAL = andares.PRINCIPAL
CONVERSAS = (conversas_equipe.ARQ, conversas_equipe.ARQ + "-wal", conversas_equipe.ARQ + "-shm", conversas_equipe.ANEXOS)
MOVER = (andares.OAUTH, andares.EQUIPE, andares.PLANTA, andares.PLACAR, andares.JORNAL, *CONVERSAS)
NOME_PADRAO = "Minha empresa"   # o EMPRESA_PADRAO do escritorio.py: marca ausente ou fora do formato
ESPACO_MIN = 64 * 1024 * 1024


class MigracaoRecusada(Exception):
    """A migração (ou o desfazer) não começou ou foi desfeita: o motivo é para quem opera, sem conteúdo de arquivo."""


class ServicoRodando(MigracaoRecusada):
    """Outro processo segura a trava do volume: o serviço está no ar (ou outra migração está rodando)."""


def travar(dados):
    """Pega a trava do volume, sem esperar. O serviço chama ao subir e a segura até sair; a migração, enquanto roda.
    Devolve o descritor (para soltar). Já tem dono: ServicoRodando."""
    os.makedirs(dados, mode=0o700, exist_ok=True)
    fd = os.open(os.path.join(dados, ARQ_TRAVA), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if os.name == "nt":
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ServicoRodando("o serviço do escritório está rodando: ele precisa estar parado (systemctl stop escritorio "
                             "ou docker compose stop) para migrar") from None
    return fd


def soltar(fd):
    if os.name == "nt":
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
    os.close(fd)   # no POSIX, fechar solta o flock


def _iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def _ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def _gravar_json(caminho, dados):
    gravar(caminho, json.dumps(dados).encode("utf-8"))


def _gravar_andares(dados, conteudo):
    """O mesmo formato do Andares._gravar."""
    gravar(os.path.join(dados, andares.ARQ), json.dumps(conteudo, ensure_ascii=False).encode("utf-8"))


def _sha(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(64 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def _texto(caminho):
    try:
        with open(caminho, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None


def _ler_v2(dados):
    """A lista do andares.json v2, ou None se não for o v2. Validado com as funções públicas do andares.py."""
    try:
        with open(os.path.join(dados, andares.ARQ), "rb") as f:
            bruto = json.loads(f.read(andares.BYTES_MAX + 1))
    except FileNotFoundError:
        return None
    except (OSError, ValueError, RecursionError):
        raise MigracaoRecusada("o andares.json não pode ser lido; corrija ou restaure o backup") from None
    if not isinstance(bruto, dict) or bruto.get("v") != 2:
        return None
    try:
        if bruto.get("terreo") != "saguao" or not isinstance(bruto.get("andares"), list) \
                or len(bruto["andares"]) > andares.MAX_EXTRAS:   # o teto do v2 é o mesmo do v1 (o andares.py do Neo)
            raise ValueError("formato")
        lista, ids, orgs = [], set(), set()
        for a in bruto["andares"]:
            if not isinstance(a, dict) or set(a) != {"id", "nome", "org"} or not isinstance(a["id"], str) \
                    or not andares.ID_OK.fullmatch(a["id"]) or a["id"] in ids:
                raise ValueError("andar")
            org = andares.validar_org(a["org"])
            if org in orgs:
                raise ValueError("org repetida")
            ids.add(a["id"])
            orgs.add(org)
            lista.append({"id": a["id"], "nome": andares.validar_nome(a["nome"]), "org": org})
    except ValueError:
        raise MigracaoRecusada("o andares.json v2 está fora do formato; corrija ou restaure o backup") from None
    return lista


def _nome_da_marca(dados):
    try:
        return andares.validar_nome(_ler_json(os.path.join(dados, ARQ_MARCA)).get("empresa"))
    except (OSError, ValueError, AttributeError, RecursionError):
        return NOME_PADRAO


def _planejar(dados, times, org, relogio):
    """Confere tudo e monta o plano (que vira o diário). Nada é gravado aqui."""
    try:
        org = andares.validar_org(org)
    except ValueError:
        raise MigracaoRecusada("AGENTES_ORG precisa ser o id da organização no agentes.chat") from None
    if _ler_v2(dados) is not None:
        raise MigracaoRecusada("o andares.json já é o v2, mas não há diário da migração; restaure o backup")
    existia = os.path.exists(os.path.join(dados, andares.ARQ))
    try:
        extras = andares.Andares(dados, org).lista
    except andares.AndaresIlegiveis as x:
        raise MigracaoRecusada(str(x)) from None
    if len(extras) >= andares.MAX_EXTRAS:
        raise MigracaoRecusada(f"o prédio já tem {andares.MAX_EXTRAS} andares extras; remova um antes")
    try:
        usuarios = ler_usuarios(os.path.join(dados, ARQ_USUARIOS))
    except UsuariosIlegiveis as x:
        raise MigracaoRecusada(str(x)) from None
    copias = [(n, o) for n, o in ((andares.TIMES, times), (ARQ_MARCA, os.path.join(dados, ARQ_MARCA)),
                                  (ARQ_LOGO, os.path.join(dados, ARQ_LOGO))) if os.path.isfile(o)]
    if shutil.disk_usage(dados).free < ESPACO_MIN + sum(os.path.getsize(o) for _, o in copias):
        raise MigracaoRecusada("pouco espaço livre no volume de dados")
    ids = {a["id"] for a in extras}
    id_andar = secrets.token_hex(4)
    while id_andar in ids or os.path.exists(andares.pasta(dados, id_andar)):
        id_andar = secrets.token_hex(4)
    contas, pendentes = {}, []
    for login, u in usuarios.items():
        if not isinstance(u, dict):
            continue
        if "andares" not in u:   # conta de antes dos andares: admin do principal (acesso._papel_de)
            contas[login] = {"papel": "admin", "sem_andares": True}
            continue
        validos = {a: p for a, p in u["andares"].items() if p in PAPEIS} if isinstance(u["andares"], dict) else {}
        papel = validos.get(PRINCIPAL)
        if papel == "admin" or papel and set(validos) == {PRINCIPAL}:
            contas[login] = {"papel": papel, "sem_andares": False}
        elif papel:
            pendentes.append(login)
    return {"v": 1, "estado": "em_andamento", "andar": id_andar, "nome": _nome_da_marca(dados), "org": org,
            "inicio": _iso(relogio()), "fim": None,
            "andares_antes": {"existia": existia, "lista": extras},
            "pasta_andares_existia": os.path.isdir(os.path.join(dados, "andares")),
            "movidos": [n for n in MOVER if os.path.exists(os.path.join(dados, n))],
            "copiados": [{"nome": n, "origem": os.path.abspath(o), "sha256": _sha(o)} for n, o in copias],
            "contas": contas, "pendentes": sorted(pendentes),
            # para voltar à mão se o desfazer for recusado (o desfazer em si só tira o que a ida pôs)
            "copia_de_antes": {ARQ_USUARIOS: _texto(os.path.join(dados, ARQ_USUARIOS)),
                               andares.ARQ: _texto(os.path.join(dados, andares.ARQ))}}


def _aplicar(dados, plano):
    """A ida. Cada passo pode rodar de novo (retomar depois de uma queda)."""
    pasta = andares.pasta(dados, plano["andar"])
    os.makedirs(pasta, mode=0o700, exist_ok=True)
    for c in plano["copiados"]:
        destino = os.path.join(pasta, c["nome"])
        if not os.path.exists(destino):
            with open(c["origem"], "rb") as f:
                gravar(destino, f.read())
    for nome in plano["movidos"]:
        origem, destino = os.path.join(dados, nome), os.path.join(pasta, nome)
        if os.path.exists(origem):
            if os.path.exists(destino):
                raise MigracaoRecusada(f"{nome} existe na raiz e no andar novo; resolva à mão")
            os.replace(origem, destino)
    caminho = os.path.join(dados, ARQ_USUARIOS)
    usuarios, mudou = ler_usuarios(caminho), False
    for login, c in plano["contas"].items():
        u = usuarios.get(login)
        if not isinstance(u, dict):
            continue
        atual = {PRINCIPAL: "admin"} if "andares" not in u else u["andares"]
        if isinstance(atual, dict) and plano["andar"] not in atual:
            usuarios[login] = {**u, "andares": {**atual, plano["andar"]: c["papel"]}}
            mudou = True
    if mudou:
        _gravar_json(caminho, usuarios)
    _gravar_andares(dados, {"v": 2, "terreo": "saguao", "andares": [
        {"id": plano["andar"], "nome": plano["nome"], "org": plano["org"]}, *plano["andares_antes"]["lista"]]})


def _reverter(dados, plano, restantes):
    """A volta: os papéis, os arquivos e o andares.json de antes (v1 com os extras restantes, ou nenhum). Cada passo
    pode rodar de novo."""
    pasta = andares.pasta(dados, plano["andar"])
    caminho = os.path.join(dados, ARQ_USUARIOS)
    if os.path.exists(caminho):
        usuarios, mudou = ler_usuarios(caminho), False
        for login, c in plano["contas"].items():
            u = usuarios.get(login)
            if isinstance(u, dict) and isinstance(u.get("andares"), dict) and plano["andar"] in u["andares"]:
                resto = {a: p for a, p in u["andares"].items() if a != plano["andar"]}
                if c["sem_andares"] and resto == {PRINCIPAL: "admin"}:
                    usuarios[login] = {k: v for k, v in u.items() if k != "andares"}
                else:
                    usuarios[login] = {**u, "andares": resto}
                mudou = True
        if mudou:
            _gravar_json(caminho, usuarios)
    for nome in plano["movidos"]:
        origem, destino = os.path.join(dados, nome), os.path.join(pasta, nome)
        if os.path.exists(destino):
            if os.path.exists(origem):
                raise MigracaoRecusada(f"{nome} existe na raiz e no andar novo; resolva à mão")
            os.replace(destino, origem)
    for c in plano["copiados"]:
        try:
            os.unlink(os.path.join(pasta, c["nome"]))
        except FileNotFoundError:
            pass
    for sobra in [n for n in (os.listdir(pasta) if os.path.isdir(pasta) else []) if n.startswith(".grava-")]:
        os.unlink(os.path.join(pasta, sobra))   # temporário do gravar() de uma queda
    if os.path.isdir(pasta):
        os.rmdir(pasta)
    if not plano["pasta_andares_existia"] and os.path.isdir(os.path.join(dados, "andares")) \
            and not os.listdir(os.path.join(dados, "andares")):
        os.rmdir(os.path.join(dados, "andares"))
    if restantes or plano["andares_antes"]["existia"]:
        _gravar_andares(dados, {"v": 1, "andares": restantes})
    elif os.path.exists(os.path.join(dados, andares.ARQ)):
        os.unlink(os.path.join(dados, andares.ARQ))


def _dado_novo(dados, plano):
    """O que se perderia ou vazaria ao desfazer (lista de motivos, só com nomes de arquivo e logins)."""
    pasta = andares.pasta(dados, plano["andar"])
    vieram = set(plano["movidos"]) | {c["nome"] for c in plano["copiados"]}
    motivos = []
    novos = sorted(set(os.listdir(pasta)) - vieram) if os.path.isdir(pasta) else []
    if novos:
        motivos.append("o andar novo já tem dado que não existia antes: " + ", ".join(novos))
    mudadas = [c["nome"] for c in plano["copiados"] if not os.path.isfile(os.path.join(pasta, c["nome"]))
               or _sha(os.path.join(pasta, c["nome"])) != c["sha256"]]
    if mudadas:
        motivos.append("mudou no andar novo desde a migração: " + ", ".join(mudadas))
    conversa = [n for n in CONVERSAS if n not in plano["movidos"] and os.path.exists(os.path.join(dados, n))]
    if conversa:
        motivos.append("o saguão já tem conversa: " + ", ".join(conversa))
    voltaram = [n for n in plano["movidos"] if os.path.exists(os.path.join(dados, n))]
    if voltaram:
        motivos.append("reapareceu na raiz: " + ", ".join(voltaram))
    usuarios = ler_usuarios(os.path.join(dados, ARQ_USUARIOS))
    contas = sorted(login for login, u in usuarios.items() if login not in plano["contas"] and isinstance(u, dict)
                    and isinstance(u.get("andares"), dict) and plano["andar"] in u["andares"])
    if contas:
        motivos.append("contas que entraram no andar novo depois: " + ", ".join(contas))
    return motivos


def _relatorio(resultado, plano, caminho_diario):
    return {"resultado": resultado, "andar": plano["andar"], "nome": plano["nome"], "movidos": list(plano["movidos"]),
            "copiados": [c["nome"] for c in plano["copiados"]],
            "contas": {login: c["papel"] for login, c in plano["contas"].items()}, "pendentes": list(plano["pendentes"]),
            "diario": caminho_diario}


def _ida(dados, times, org, plano, caminho, relogio):
    if plano and plano["estado"] == "feito":
        lista = _ler_v2(dados)
        if lista is None or not any(a["id"] == plano["andar"] for a in lista):
            raise MigracaoRecusada("o diário diz que a migração foi feita, mas o andares.json não é o v2 dela; "
                                   "restaure o backup")
        return _relatorio("ja_migrado", plano, caminho)
    if plano and plano["estado"] == "desfazendo":
        raise MigracaoRecusada("um desfazer ficou pela metade: rode saguao --desfazer para terminar")
    if not plano or plano["estado"] != "em_andamento":   # sem diário ou desfeita: começa do zero
        plano = _planejar(dados, times, org, relogio)
        _gravar_json(caminho, plano)
    try:
        _aplicar(dados, plano)
        plano = {**plano, "estado": "feito", "fim": _iso(relogio())}
        _gravar_json(caminho, plano)
    except BaseException:
        try:
            _reverter(dados, plano, plano["andares_antes"]["lista"])
        except BaseException:   # noqa: B036 (o diário fica em_andamento: rodar de novo retoma; sobe o erro original)
            pass
        else:
            os.unlink(caminho)
        raise
    return _relatorio("migrado", plano, caminho)


def _volta(dados, plano, caminho, relogio):
    if plano is None:
        raise MigracaoRecusada("não há diário da migração (dados/migracao-saguao.json): nada para desfazer")
    if plano["estado"] == "desfeito":
        return _relatorio("ja_desfeito", plano, caminho)
    if plano["estado"] == "feito":
        motivos = _dado_novo(dados, plano)
        if motivos:
            raise MigracaoRecusada("desfazer recusado (restaure o backup do volume se precisar voltar): " + "; ".join(motivos))
        lista = _ler_v2(dados)
        if lista is None or not any(a["id"] == plano["andar"] for a in lista):
            raise MigracaoRecusada("o andares.json não é o v2 desta migração; restaure o backup")
        plano = {**plano, "estado": "desfazendo", "restantes": [a for a in lista if a["id"] != plano["andar"]]}
        _gravar_json(caminho, plano)
    restantes = plano.get("restantes", plano["andares_antes"]["lista"])   # em_andamento: o que havia antes
    _reverter(dados, plano, restantes)
    plano = {**plano, "estado": "desfeito", "fim": _iso(relogio())}
    _gravar_json(caminho, plano)
    return _relatorio("desfeito", plano, caminho)


def migrar(dados, *, times, org, desfazer=False, relogio=time.time):
    """A ida (ou a volta, com desfazer=True) com a trava do volume. Devolve o relatório:
    {"resultado": "migrado" | "ja_migrado" | "desfeito" | "ja_desfeito", "andar", "nome", "movidos", "copiados",
     "contas": {login: papel no andar novo}, "pendentes": [logins], "diario"}.
    Recusa com MigracaoRecusada (ServicoRodando se o serviço estiver no ar); erro de disco no meio sobe como OSError,
    depois de desfazer o que já tinha feito."""
    if hasattr(os, "geteuid") and os.path.isdir(dados) and os.stat(dados).st_uid != os.geteuid():
        raise MigracaoRecusada("rode como o dono da pasta de dados, o usuário do serviço (sudo -u escritorio ...); "
                               "como outro usuário, os arquivos novos ficariam fora do alcance do serviço")
    fd = travar(dados)
    try:
        caminho = os.path.join(dados, ARQ_DIARIO)
        try:
            plano = _ler_json(caminho)
        except FileNotFoundError:
            plano = None
        except (OSError, ValueError):
            raise MigracaoRecusada("o diário da migração não pode ser lido; restaure o backup") from None
        return _volta(dados, plano, caminho, relogio) if desfazer else _ida(dados, times, org, plano, caminho, relogio)
    finally:
        soltar(fd)


def principal(argv, dados, times, org):
    """O subcomando: argv são os argumentos depois de "saguao" ([] ou ["--desfazer"]). Devolve o código de saída
    (0 feito, 1 recusado ou falhou, 2 uso errado). O relatório vai para o stdout; o motivo, para o stderr."""
    if argv not in ([], ["--desfazer"]):
        print("uso: escritorio.py saguao [--desfazer]", file=sys.stderr)
        return 2
    try:
        rel = migrar(dados, times=times, org=org, desfazer=argv == ["--desfazer"])
    except MigracaoRecusada as x:
        print(f"migração recusada: {x}", file=sys.stderr)
        return 1
    except OSError as x:
        print(f"a migração falhou no disco ({type(x).__name__}) e foi desfeita; rode de novo depois de conferir o "
              "volume (se o diário ficou em_andamento, rodar de novo termina a ida)", file=sys.stderr)
        return 1
    titulo = {"migrado": "Migração para o saguão feita.", "ja_migrado": "A migração para o saguão já estava feita.",
              "desfeito": "Migração desfeita: o térreo voltou a ser o andar principal.",
              "ja_desfeito": "A migração já estava desfeita."}[rel["resultado"]]
    linhas = [titulo, f"Andar da empresa: {rel['nome']} (id {rel['andar']})",
              "Movidos para o andar: " + (", ".join(rel["movidos"]) or "nenhum"),
              "Copiados para o andar: " + (", ".join(rel["copiados"]) or "nenhum"),
              "Contas com o andar: " + (", ".join(f"{u} ({p})" for u, p in rel["contas"].items()) or "nenhuma")]
    if rel["pendentes"]:
        linhas.append("Sem o andar (dê pela tela de Membros, se forem da empresa): " + ", ".join(rel["pendentes"]))
    linhas += [f"Diário: {rel['diario']}", "Suba o serviço de novo."]
    print("\n".join(linhas))
    return 0
