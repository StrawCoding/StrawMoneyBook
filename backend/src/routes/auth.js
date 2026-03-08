import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import {
  createId,
  findUserByAccount,
  hashPassword,
  issueAccessToken,
  normalizeAccount,
  normalizeDisplayName,
  nowIso,
  publicUser,
  readStore,
  updateStore,
  validatePassword,
  verifyPassword,
} from '../collab/store.js'

function validateAccount(account) {
  const normalized = normalizeAccount(account)
  if (!normalized) {
    throw new Error('請輸入帳號')
  }
  if (!/^[a-z0-9._-]{3,32}$/i.test(normalized)) {
    throw new Error('帳號僅限 3-32 碼英數、點、底線或連字號')
  }
  return normalized
}

async function handleRegister(req, res) {
  const body = parseBody(req)
  const account = validateAccount(body.account)
  const password = validatePassword(body.password)
  const displayName = normalizeDisplayName(body.displayName, account)

  const createdUser = await updateStore(async (data) => {
    if (findUserByAccount(data, account)) {
      throw new Error('此帳號已被註冊')
    }

    const passwordRecord = hashPassword(password)
    const now = nowIso()
    const user = {
      id: createId('user'),
      account,
      display_name: displayName,
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
  const account = validateAccount(body.account)
  const password = normalizeText(body.password)
  if (!password) {
    throw new Error('請輸入密碼')
  }

  const data = await readStore()
  const user = findUserByAccount(data, account)
  if (!user || !verifyPassword(user, password)) {
    sendJson(res, 401, {
      error: 'invalid_credentials',
      message: '帳號或密碼錯誤',
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

    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    sendJson(res, 400, {
      error: 'auth_request_failed',
      message: String(error?.message ?? error ?? 'auth request failed'),
    })
  }
}
