"""Prévia local da página, sem OAuth: serve static/ e um /api/estado montado com a mesma
função resumir() do servidor, a partir de um arquivo com as respostas brutas do MCP.
O arquivo é relido quando muda e passa pelo mesmo diário de transições do servidor: para ver
os eventos, edite o status das tarefas (ou tire/ponha tarefas) com a prévia aberta.
Só para desenvolvimento; não vai para a VPS.
Uso: python ferramentas/previa.py dados_brutos.json [--resolvidos]  ->  http://127.0.0.1:7372 (outra porta: PREVIA_PORTA=7373)
--resolvidos: na subida, passa o diário por leituras no passado para mostrar pedidos "resolvidos hoje" (os 3 desfechos).
"""
import json, os, sys, threading, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tempfile
os.environ["ESCRITORIO_DADOS"] = tempfile.mkdtemp(prefix="escritorio-previa-")
PORTA = int(os.environ.get("PREVIA_PORTA", "7372"))
# A checagem de origem dos POST compara com a BASE: a prévia declara a própria, antes do import.
os.environ["ESCRITORIO_BASE"] = f"http://127.0.0.1:{PORTA}"
import escritorio as e

class Falso:
    def __init__(self, arquivo):
        self.arquivo, self.marca = arquivo, None
        self.estado = {"agentes": [], "trabalhos": [], "tarefas": [], "eventos": [], "resolvidos": []}
        self.diario, self.trava = e.Diario(), threading.Lock()

    def semear_resolvidos(self):
        """--resolvidos: o Diario de verdade passa por 4 leituras no passado (sem lista inventada). Até 3 tarefas em
        andamento, de agentes diferentes, viram pedidos; uma vira outro pedido no meio; mais um pedido extra some no fim.
        A última leitura é o próprio arquivo, então a primeira foto não gera transição nova."""
        with open(self.arquivo, encoding="utf-8") as f:
            bruto = json.load(f)
        livres, vistos = [], set()
        for t in bruto["tasks"]:
            ag = (t.get("agent") or {}).get("id")
            if t.get("status") in ("running", "still_running") and ag not in vistos:
                vistos.add(ag); livres.append(t)
        livres = livres[:3]
        if not livres:
            return
        pedidos = [dict(t, status=s) for t, s in zip(livres, ("waiting_approval", "waiting_input", "waiting_approval"))]
        # o extra vai para um agente sem tarefa, para ter rótulo próprio (2 pedidos do mesmo agente: só 1 tem rótulo)
        sem_tarefa = [a["id"] for a in bruto["agents"] if a["id"] not in {(t.get("agent") or {}).get("id") for t in bruto["tasks"]}]
        extra = dict(livres[0], agent={"id": sem_tarefa[0]} if sem_tarefa else livres[0]["agent"], run_id="previa-resolvido",
                     status="waiting_input", label="Confirmar o horário da reunião")
        outros = [t for t in bruto["tasks"] if t not in livres]
        agora = time.time()
        leituras = ((40, bruto["tasks"]), (30, outros + pedidos + [extra]),   # minutos atrás
                    (15, outros + pedidos[:2] + [dict(pedidos[2], status="waiting_input")] + [extra]), (5, bruto["tasks"]))
        for minutos, tarefas in leituras:
            self.diario.aplicar(e.resumir(bruto["agents"], tarefas), agora=agora - minutos * 60)

    def foto(self):
        with self.trava:
            erro = None
            try:
                marca = os.stat(self.arquivo).st_mtime_ns
                if marca != self.marca:  # arquivo mudou: é uma "leitura" nova
                    with open(self.arquivo, encoding="utf-8") as f:
                        bruto = json.load(f)
                    self.estado = self.diario.aplicar(e.resumir(bruto["agents"], bruto["tasks"]))
                    self.marca = marca
            except (OSError, ValueError, KeyError, TypeError) as x:  # salvo pela metade, renomeado ou sem as listas
                erro = f"prévia: não consegui ler {os.path.basename(self.arquivo)} ({type(x).__name__}); mostrando a leitura anterior"
            return {**self.estado, "atualizado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "erro": erro}

srv = e.Servidor(("127.0.0.1", PORTA), e.Pagina)
srv.leitor, srv.cred = Falso([a for a in sys.argv[1:] if not a.startswith("--")][0]), None
if "--resolvidos" in sys.argv[1:]:
    srv.leitor.semear_resolvidos()
srv.acesso = e.Acesso(os.environ["ESCRITORIO_DADOS"])
srv.previa_sem_login = True  # prévia local, só em 127.0.0.1
cl = e.carregar_times().get("clima")
if cl:
    srv.clima = e.Clima(cl["lat"], cl["lon"], cl["cidade"]); srv.clima.start()
print(e.BASE, flush=True)
srv.serve_forever()
