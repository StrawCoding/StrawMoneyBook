import { extractBearerToken, methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import { findUserById, readStore, verifyAccessToken } from '../collab/store.js'
import { writeClientErrorLog } from '../collab/admin-store.js'
import { redactPiiText, redactPiiValue } from '../collab/pii-redact.js'

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
    debug: redactPiiValue(context.debug),
  }
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
      message: redactPiiText(message),
      stack: redactPiiText(String(body.stack ?? '')),
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
