import { extractBearerToken, methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import { findUserById, readStore, verifyAccessToken } from '../collab/store.js'
import { writeClientErrorLog } from '../collab/admin-store.js'

async function getOptionalAuthenticatedUser(req) {
  const payload = verifyAccessToken(extractBearerToken(req))
  if (!payload?.sub) return null
  const data = await readStore()
  return findUserById(data, payload.sub)
}

function buildSafeContext(body = {}) {
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  return {
    source: normalizeText(context.source),
    component: normalizeText(context.component),
    info: normalizeText(context.info),
    filename: normalizeText(context.filename),
    lineno: Number(context.lineno ?? 0) || 0,
    colno: Number(context.colno ?? 0) || 0,
    user_agent: normalizeText(body.userAgent),
    debug: sanitizeDebugValue(context.debug),
  }
}

function truncateText(value, maxLength = 600) {
  const text = String(value ?? '')
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function sanitizeDebugValue(value, depth = 0) {
  if (value == null) return null
  if (depth >= 4) {
    return truncateText(value, 240)
  }
  if (typeof value === 'string') {
    return truncateText(value, 600)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitizeDebugValue(item, depth + 1))
      .filter((item) => item !== undefined)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, entryValue]) => [key, sanitizeDebugValue(entryValue, depth + 1)])
        .filter(([, entryValue]) => entryValue !== undefined),
    )
  }
  return truncateText(value, 240)
}

export default async function clientLogsHandler(req, res) {
  if (methodGuard(req, res, ['POST'])) return

  const pathname = normalizePath(req, '/api/client-logs')
  if (pathname !== '/') {
    sendJson(res, 404, {
      error: 'not_found',
      message: 'route not found',
    })
    return
  }

  try {
    const body = parseBody(req)
    const message = normalizeText(body.message)
    if (!message) {
      sendJson(res, 400, {
        error: 'message_required',
        message: '缺少錯誤訊息',
      })
      return
    }

    const user = await getOptionalAuthenticatedUser(req)
    const saved = await writeClientErrorLog({
      userId: normalizeText(user?.id),
      userEmail: normalizeText(user?.email ?? user?.account),
      level: 'error',
      code: normalizeText(body.code),
      message,
      stack: String(body.stack ?? ''),
      routePath: normalizeText(body.routePath),
      appVersion: normalizeText(body.appVersion),
      platform: normalizeText(body.platform),
      releaseChannel: normalizeText(body.releaseChannel),
      context: buildSafeContext(body),
    })

    sendJson(res, 201, {
      ok: true,
      id: saved.id,
      created_at: saved.created_at,
    })
  } catch (error) {
    sendJson(res, Number(error?.status ?? 500) || 500, {
      error: normalizeText(error?.code) || 'client_log_save_failed',
      message: normalizeText(error?.message ?? error) || '儲存錯誤紀錄失敗',
    })
  }
}
