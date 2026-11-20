// Firmópolis: plugin global do OpenCode (firmopolis), vindo do Escritório Vivo.
// Manda os eventos de estado das sessões para a ponte local (127.0.0.1:47820), com o
// token do arquivo de config e o MAESTRI_TERMINAL_ID. Nunca bloqueia o OpenCode nem
// lança erro: envio sem await, tempo-limite de 1 s e falha silenciosa.
// Só os campos que a ponte usa saem daqui; conteúdo de arquivo e texto de pergunta ficam
// no OpenCode.
// Responder pelo escritório: no pedido de permissão, o plugin manda à ponte a ferramenta e o
// que o diálogo mostra (o comando ou o arquivo) e espera a decisão do Firmópolis; com ela,
// responde pelo próprio OpenCode. O diálogo segue na tela e quem responder primeiro leva: se o
// terminal responder antes, o plugin desiste. A ponte só segura o pedido com alguém atendendo.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const URL_PONTE = "http://127.0.0.1:47820/evento/opencode"
const URL_PENDENTE = "http://127.0.0.1:47820/pendente/opencode"
const ESPERA_MS = 130000 // a espera da ponte (120 s) e a folga

const PERGUNTAS = new Set(["permission.asked", "permission.v2.asked"])
const RESPOSTAS = new Set(["permission.replied", "permission.v2.replied"])

const TIPOS = new Set([
  "session.created", "session.deleted", "session.status", "session.idle", "session.error",
  "permission.asked", "permission.v2.asked", "permission.replied", "permission.v2.replied",
  "question.asked", "question.v2.asked", "question.replied", "question.v2.replied",
  "question.rejected", "question.v2.rejected",
])

const ARGS_ALVO = ["filePath", "path", "command", "url"]

// a pasta da ponte: Firmopolis, ou a EscritorioVivo de quem ainda não rodou a ponte nova
function arquivosToken() {
  const base = process.platform === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? join(homedir(), "Library", "Application Support")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return [join(base, "Firmopolis", "token"), join(base, "EscritorioVivo", "token")]
}

function lerToken() {
  for (const arquivo of arquivosToken()) {
    try {
      const t = readFileSync(arquivo, "utf8").trim()
      if (t) return t
    } catch {}
  }
  return ""
}

function enviar(corpo) {
  const token = lerToken()
  if (!token) return
  try {
    fetch(URL_PONTE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ponte-Token": token,
        "X-Maestri-Terminal-Id": process.env.MAESTRI_TERMINAL_ID || "",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(1000),
    }).catch(() => {})
  } catch {
    // ponte desligada ou fetch indisponível: o OpenCode segue normalmente
  }
}

// o pedido de permissão como a ponte lê: a sessão, o id, a ferramenta e os padrões que o
// diálogo mostra (v1: permission e patterns; v2: action e resources), cortados
function pedidoDe(p) {
  const padroes = Array.isArray(p.patterns) ? p.patterns : Array.isArray(p.resources) ? p.resources : []
  return {
    sessionID: p.sessionID,
    id: p.id,
    permission: p.permission ?? p.action,
    patterns: padroes.filter((s) => typeof s === "string").slice(0, 8).map((s) => s.slice(0, 1000)),
  }
}

// o HMAC do token sobre as partes, como o decisao.Assinar da ponte (cada parte seguida de um 0)
function assinar(token, ...partes) {
  const h = createHmac("sha256", token)
  for (const p of partes) h.update(p).update(Buffer.from([0]))
  return h.digest("hex")
}

function confere(token, assinatura, ...partes) {
  const a = Buffer.from(assinar(token, ...partes)), b = Buffer.from(typeof assinatura === "string" ? assinatura : "")
  return a.length === b.length && timingSafeEqual(a, b)
}

function resumir(p) {
  p = p || {}
  return {
    sessionID: p.sessionID ?? p.info?.id,
    status: p.status && { type: p.status.type },
    info: p.info && { id: p.info.id, parentID: p.info.parentID, directory: p.info.directory },
    error: p.error && { name: p.error.name },
  }
}

// argsDoAlvo guarda só os campos do alvo; do comando, só a 1ª linha.
function argsDoAlvo(args) {
  args = args || {}
  return Object.fromEntries(
    ARGS_ALVO.filter((k) => typeof args[k] === "string").map((k) => [k, k === "command" ? args[k].split("\n")[0] : args[k]]),
  )
}

export const Firmopolis = async ({ directory, client }) => {
  // opencode run é execução não interativa: não vira morador.
  if (process.argv.slice(1).includes("run")) return {}

  const pais = new Map() // sessão filha (subagente) → sessão pai

  const esperando = new Map() // pedido de permissão → AbortController (respondido no terminal: aborta)

  // responde pelo OpenCode: o SDK que o plugin recebe (v1) e, se vier o v2, o reply dele
  const responder = (p, resposta) => {
    if (typeof client?.postSessionIdPermissionsPermissionId === "function") {
      return client.postSessionIdPermissionsPermissionId({ path: { id: p.sessionID, permissionID: p.id }, body: { response: resposta } })
    }
    if (typeof client?.permission?.reply === "function") return client.permission.reply({ requestID: p.id, reply: resposta })
  }

  const pedirDecisao = async (p) => {
    const token = lerToken()
    if (!token || typeof p?.id !== "string" || typeof p.sessionID !== "string" || esperando.has(p.id)) return
    const ctl = new AbortController()
    esperando.set(p.id, ctl)
    try {
      const pai = pais.get(p.sessionID)
      // o token não vai no pedido: vai um nonce e o HMAC dele; a resposta só vale assinada pela ponte
      const corpo = JSON.stringify({ ...pedidoDe(p), cwd: directory, ...(pai && { pai }) })
      const nonce = randomBytes(16).toString("hex")
      const r = await fetch(URL_PENDENTE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ponte-Nonce": nonce,
          "X-Ponte-Assinatura": assinar(token, nonce, createHash("sha256").update(corpo).digest()),
          "X-Maestri-Terminal-Id": process.env.MAESTRI_TERMINAL_ID || "",
        },
        body: corpo,
        signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(ESPERA_MS)]),
      })
      if (r.status !== 200) return
      const d = await r.json()
      if (!esperando.has(p.id) || (d?.acao !== "permitir" && d?.acao !== "negar")) return
      if (!confere(token, d.assinatura, nonce, d.acao)) return // outro processo na porta
      await responder(p, d.acao === "permitir" ? "once" : "reject")
    } catch {
      // ponte desligada, terminal respondeu antes ou o pedido já não existe: o diálogo resolve
    } finally {
      esperando.delete(p.id)
    }
  }

  // O pid do OpenCode deixa a ponte saber quando o processo saiu (não há evento de fim).
  const mandar = (type, properties) => {
    const pai = pais.get(properties.sessionID)
    enviar({ type, properties, cwd: directory, pid: process.pid, ...(pai && { pai }) })
  }

  return {
    event: async (entrada) => {
      try {
        const event = entrada?.event
        if (!TIPOS.has(event?.type)) return
        const p = resumir(event.properties)
        if (event.type === "session.created" && p.info?.parentID) pais.set(p.sessionID, p.info.parentID)
        mandar(event.type, p)
        if (event.type === "session.deleted") pais.delete(p.sessionID)
        if (PERGUNTAS.has(event.type)) pedirDecisao(event.properties) // sem await: não segura o OpenCode
        if (RESPOSTAS.has(event.type)) {
          const id = event.properties?.requestID ?? event.properties?.permissionID
          esperando.get(id)?.abort()
          esperando.delete(id)
        }
      } catch {
        // evento em formato inesperado: ignora, o OpenCode segue
      }
    },
    "tool.execute.before": async (input, output) => {
      try {
        mandar("tool.execute.before", { sessionID: input?.sessionID, tool: input?.tool, args: argsDoAlvo(output?.args) })
      } catch {
        // idem
      }
    },
  }
}
