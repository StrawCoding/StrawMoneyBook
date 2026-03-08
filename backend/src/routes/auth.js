import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import {
  createId,
  createUniqueReferralCode,
  findUserByEmail,
  hashPassword,
  issueAccessToken,
  normalizeAvatarUrl,
  normalizeDisplayName,
  nowIso,
  publicUser,
  readStore,
  updateStore,
  validateEmail,
  validatePassword,
  verifyPassword,
} from '../collab/store.js'

async function handleRegister(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const password = validatePassword(body.password)
  const displayName = normalizeDisplayName(body.displayName, email)
  const avatarUrl = normalizeAvatarUrl(body.avatarUrl)

  const createdUser = await updateStore(async (data) => {
    if (findUserByEmail(data, email)) {
      throw new Error('此 Email 已被註冊')
    }

    const passwordRecord = hashPassword(password)
    const now = nowIso()
    const user = {
      id: createId('user'),
      email,
      account: email,
      display_name: displayName,
      avatar_url: avatarUrl,
      referral_code: createUniqueReferralCode(data),
      membership_grants: [],
      password_hash: passwordRecord.hash,
      password_salt: passwordRecord.salt,
      created_at: now,
      updated_at: now,
    }
    data.users.push(user)
    return user
  })

  sendJson(res, 201, {
    token: issueAccessToken(createdUser),
    user: publicUser(createdUser),
  })
}

async function handleLogin(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const password = normalizeText(body.password)
  if (!password) {
    throw new Error('請輸入密碼')
  }

  const data = await readStore()
  const user = findUserByEmail(data, email)
  if (!user || !verifyPassword(user, password)) {
    sendJson(res, 401, {
      error: 'invalid_credentials',
      message: 'Email 或密碼錯誤',
    })
    return
  }

  sendJson(res, 200, {
    token: issueAccessToken(user),
    user: publicUser(user),
  })
}

async function handleMe(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return
  sendJson(res, 200, { user: publicUser(user) })
}

async function handleProfileUpdate(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const body = parseBody(req)
  const displayName = normalizeDisplayName(body.displayName, user.display_name || user.email)
  const avatarUrl = normalizeAvatarUrl(body.avatarUrl)

  const updatedUserId = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!targetUser) {
      throw new Error('找不到使用者')
    }

    targetUser.display_name = displayName
    targetUser.avatar_url = avatarUrl
    targetUser.updated_at = nowIso()
    return targetUser.id
  })

  const data = await readStore()
  const updatedUser = data.users.find((item) => String(item.id) === String(updatedUserId))
  sendJson(res, 200, { user: publicUser(updatedUser) })
}

export default async function authHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST'])) return

  const pathname = normalizePath(req, '/api/auth')

  try {
    if (req.method === 'POST' && pathname === '/register') {
      await handleRegister(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/login') {
      await handleLogin(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/logout') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && pathname === '/me') {
      await handleMe(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/profile') {
      await handleProfileUpdate(req, res)
      return
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    sendJson(res, 400, {
      error: 'auth_request_failed',
      message: String(error?.message ?? error ?? 'auth request failed'),
    })
  }
}
