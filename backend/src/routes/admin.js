import { requireAdminUser } from '../collab/auth-session.js'
import { methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import {
  buildAdminOverview,
  deleteUserAccountByAdmin,
  listClientErrorLogs,
  syncAdminMembershipGrantForUser,
  updateClientErrorLogReview,
} from '../collab/admin-store.js'
import { buildPublicUserProfile } from '../collab/auth-store.js'

function getPathSegments(pathname) {
  return normalizeText(pathname)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
}

export default async function adminHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return

  const user = await requireAdminUser(req, res, sendJson)
  if (!user) return

  const pathname = normalizePath(req, '/api/admin')
  const segments = getPathSegments(pathname)

  try {
    if (!segments.length && req.method === 'GET') {
      const overview = await buildAdminOverview()
      sendJson(res, 200, {
        ...overview,
        current_user: await buildPublicUserProfile(user),
      })
      return
    }

    if (segments[0] === 'error-logs' && req.method === 'GET' && segments.length === 1) {
      const items = await listClientErrorLogs({
        reviewStatus: normalizeText(req.query?.reviewStatus ?? ''),
      })
      sendJson(res, 200, { items })
      return
    }

    if (segments[0] === 'error-logs' && req.method === 'POST' && segments[2] === 'review') {
      const body = parseBody(req)
      const item = await updateClientErrorLogReview(segments[1], {
        reviewStatus: normalizeText(body.reviewStatus) || 'reviewed',
        reviewedByUserId: user.id,
        linearIssueId: normalizeText(body.linearIssueId),
      })
      sendJson(res, 200, { item })
      return
    }

    if (segments[0] === 'users' && req.method === 'POST' && segments[2] === 'membership') {
      const body = parseBody(req)
      const item = await syncAdminMembershipGrantForUser(segments[1], {
        plan: normalizeText(body.plan),
        active: body.active !== false,
      })
      sendJson(res, 200, { item })
      return
    }

    if (segments[0] === 'users' && req.method === 'DELETE' && segments.length === 2) {
      if (normalizeText(segments[1]) === normalizeText(user.id)) {
        sendJson(res, 400, {
          error: 'admin_delete_self_forbidden',
          message: '不可刪除目前登入的管理員帳號',
        })
        return
      }
      const result = await deleteUserAccountByAdmin(segments[1])
      sendJson(res, 200, { ok: true, ...result })
      return
    }

    sendJson(res, 404, {
      error: 'not_found',
      message: 'route not found',
    })
  } catch (error) {
    sendJson(res, Number(error?.status ?? 400) || 400, {
      error: normalizeText(error?.code) || 'admin_request_failed',
      message: normalizeText(error?.message ?? error) || '管理員操作失敗',
    })
  }
}
