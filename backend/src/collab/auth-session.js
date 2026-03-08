import { extractBearerToken } from './http.js'
import { findUserById, readStore, verifyAccessToken } from './store.js'

export async function requireAuthenticatedUser(req, res, sendJson, options = {}) {
  const token = extractBearerToken(req)
  const payload = verifyAccessToken(token)
  if (!payload?.sub) {
    sendJson(res, 401, {
      error: 'unauthorized',
      message: '請先登入共同帳本帳號',
    })
    return null
  }

  const data = await readStore()
  const user = findUserById(data, payload.sub)
  if (!user) {
    sendJson(res, 401, {
      error: 'unauthorized',
      message: '登入狀態已失效，請重新登入',
    })
    return null
  }

  if (Boolean(user?.must_change_password) && !options.allowTemporaryPassword) {
    sendJson(res, 403, {
      error: 'password_change_required',
      message: '請先使用臨時密碼登入後更改密碼',
    })
    return null
  }

  return user
}
