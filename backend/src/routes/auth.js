import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { verifyGoogleIdToken } from '../collab/google-id-token.js'
import { sendTemporaryPasswordEmail } from '../collab/mailer.js'
import {
  extractBearerToken,
  getClientIp,
  getUserAgent,
  methodGuard,
  normalizePath,
  normalizeText,
  parseBody,
  sendJson,
} from '../collab/http.js'
import {
  buildPublicUserProfile,
  consumeAuthNonce,
  createAuthNonce,
  createId,
  createLoginSession,
  createTemporaryPassword,
  createUniqueReferralCode,
  createUserFromExternalIdentity,
  findUserByAuthProvider,
  findUserByEmail,
  findUserById,
  hashPassword,
  hashSensitiveToken,
  linkUserAuthProvider,
  normalizeAvatarUrl,
  normalizeDisplayName,
  nowIso,
  readStore,
  revokeRefreshSession,
  rotateRefreshSession,
  updateStore,
  updateUserFromAuthProviderLogin,
  validateEmail,
  validatePassword,
  verifyAccessToken,
  verifyPassword,
  writeAuthAuditLog,
} from '../collab/store.js'

const LOGIN_LOCK_THRESHOLD = 5
const LOGIN_LOCK_DURATION_MS = 10 * 60 * 1000
const LOGIN_FORCE_RESET_THRESHOLD = 10
const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60 * 1000
const DEBUG_PASSWORD_RESET_RESPONSE = isTruthy(process.env.SHARED_LEDGER_DEBUG_PASSWORD_RESET)

function isTruthy(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function createAuthError(message, code = 'auth_request_failed', status = 400, extras = {}) {
  const error = new Error(String(message ?? '').trim() || 'auth request failed')
  error.code = code
  error.status = status
  Object.assign(error, extras)
  return error
}

function clearPasswordResetState(user) {
  user.password_reset_token_hash = ''
  user.password_reset_requested_at = ''
  user.password_reset_expires_at = ''
}

function clearLoginFailureState(user) {
  user.login_failed_attempts = 0
  user.last_failed_login_at = ''
  user.login_locked_until = ''
  user.password_reset_required = false
}

function clearTemporaryPasswordState(user) {
  user.must_change_password = false
  user.temporary_password_issued_at = ''
}

function getLockRemainingMinutes(lockedUntil) {
  const lockedUntilMs = Date.parse(String(lockedUntil ?? ''))
  if (!Number.isFinite(lockedUntilMs)) return 0
  return Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 60_000))
}

function getCooldownRemainingSeconds(dateString, cooldownMs) {
  const issuedAtMs = Date.parse(String(dateString ?? ''))
  if (!Number.isFinite(issuedAtMs)) return 0
  return Math.max(0, Math.ceil((issuedAtMs + cooldownMs - Date.now()) / 1000))
}

function getLockedUntil(user) {
  const lockedUntil = String(user?.login_locked_until ?? '').trim()
  const lockedUntilMs = Date.parse(lockedUntil)
  return lockedUntil && Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()
    ? lockedUntil
    : ''
}

function assertLoginAllowed(user) {
  if (Boolean(user?.password_reset_required)) {
    throw createAuthError('密碼錯誤已達 10 次，請先申請臨時密碼', 'password_reset_required', 403)
  }
}

function registerFailedLoginAttempt(user) {
  const attempts = Math.max(0, Math.floor(Number(user?.login_failed_attempts) || 0)) + 1
  const now = nowIso()
  user.login_failed_attempts = attempts
  user.last_failed_login_at = now
  user.updated_at = now

  if (attempts >= LOGIN_FORCE_RESET_THRESHOLD) {
    user.password_reset_required = true
    user.login_locked_until = ''
    return {
      attempts,
      resetRequired: true,
      lockedUntil: '',
    }
  }

  if (attempts >= LOGIN_LOCK_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + LOGIN_LOCK_DURATION_MS).toISOString()
    user.login_locked_until = lockedUntil
    return {
      attempts,
      resetRequired: false,
      lockedUntil,
    }
  }

  return {
    attempts,
    resetRequired: false,
    lockedUntil: '',
  }
}

function sendAuthError(res, error) {
  sendJson(res, Number(error?.status ?? 400) || 400, {
    error: String(error?.code ?? 'auth_request_failed'),
    message: String(error?.message ?? error ?? 'auth request failed'),
    locked_until: String(error?.locked_until ?? ''),
    retry_after_seconds: Math.max(0, Number(error?.retry_after_seconds ?? 0) || 0),
  })
}

async function getOptionalAuthenticatedUser(req) {
  const payload = verifyAccessToken(extractBearerToken(req))
  if (!payload?.sub) return null
  const data = await readStore()
  return findUserById(data, payload.sub)
}

function getCurrentSessionFamilyId(req) {
  const payload = verifyAccessToken(extractBearerToken(req))
  return String(payload?.sid ?? '').trim()
}

function getRequestContext(req) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  }
}

async function sendAuthSession(res, user, {
  issuedByProvider = 'password',
  context = {},
  status = 200,
  extra = {},
} = {}) {
  const session = await createLoginSession(user, {
    issuedByProvider,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })
  const publicProfile = await buildPublicUserProfile(session.user)
  sendJson(res, status, {
    token: session.accessToken,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresInSec,
    refresh_token: session.refreshToken,
    refresh_token_expires_in: session.refreshExpiresInSec,
    refresh_token_expires_at: session.refreshTokenExpiresAt,
    user: publicProfile,
    ...extra,
  })
}

async function handleRegister(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const password = validatePassword(body.password)
  const displayName = normalizeDisplayName(body.displayName, email)
  const avatarUrl = normalizeAvatarUrl(body.avatarUrl)

  const createdUser = await updateStore(async (data) => {
    if (findUserByEmail(data, email)) {
      throw createAuthError('此 Email 已被註冊', 'email_already_registered', 400)
    }

    const passwordRecord = hashPassword(password)
    const now = nowIso()
    const user = {
      id: createId('user'),
      email,
      account: email,
      email_verified: false,
      display_name: displayName,
      avatar_url: avatarUrl,
      referral_code: createUniqueReferralCode(data),
      membership_grants: [],
      login_failed_attempts: 0,
      last_failed_login_at: '',
      login_locked_until: '',
      must_change_password: false,
      temporary_password_issued_at: '',
      password_reset_required: false,
      password_reset_token_hash: '',
      password_reset_requested_at: '',
      password_reset_expires_at: '',
      password_hash: passwordRecord.hash,
      password_salt: passwordRecord.salt,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    }
    data.users.push(user)
    return user
  })

  await writeAuthAuditLog({
    userId: createdUser.id,
    provider: 'password',
    eventType: 'register',
    eventStatus: 'success',
    ...getRequestContext(req),
    detail: { email },
  }).catch(() => null)

  await sendAuthSession(res, createdUser, {
    issuedByProvider: 'password',
    context: getRequestContext(req),
    status: 201,
  })
}

async function handleLogin(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const password = normalizeText(body.password)
  if (!password) {
    throw createAuthError('請輸入密碼', 'password_required', 400)
  }

  const context = getRequestContext(req)
  const data = await readStore()
  const user = findUserByEmail(data, email)
  if (!user) {
    await writeAuthAuditLog({
      provider: 'password',
      eventType: 'login',
      eventStatus: 'failure',
      ...context,
      detail: { email, code: 'invalid_credentials' },
    }).catch(() => null)
    sendJson(res, 401, {
      error: 'invalid_credentials',
      message: 'Email 或密碼錯誤',
    })
    return
  }

  if (!String(user.password_hash ?? '').trim() || !String(user.password_salt ?? '').trim()) {
    throw createAuthError('此帳號尚未設定密碼，請改用 Google 登入或先綁定密碼', 'password_login_not_available', 400)
  }

  try {
    assertLoginAllowed(user)
  } catch (error) {
    sendAuthError(res, error)
    return
  }

  const lockedUntil = getLockedUntil(user)
  if (lockedUntil) {
    if (!verifyPassword(user, password)) {
      const failureState = await updateStore(async (nextData) => {
        const targetUser = findUserByEmail(nextData, email)
        if (!targetUser) return null
        return registerFailedLoginAttempt(targetUser)
      })

      if (failureState?.resetRequired) {
        sendJson(res, 403, {
          error: 'password_reset_required',
          message: '密碼錯誤已達 10 次，請先申請臨時密碼',
        })
        return
      }
    }

    sendJson(res, 429, {
      error: 'login_temporarily_locked',
      message: `密碼錯誤已達 ${LOGIN_LOCK_THRESHOLD} 次，請 ${getLockRemainingMinutes(lockedUntil)} 分鐘後再試`,
      locked_until: lockedUntil,
    })
    return
  }

  if (!verifyPassword(user, password)) {
    const failureState = await updateStore(async (nextData) => {
      const targetUser = findUserByEmail(nextData, email)
      if (!targetUser) return null
      return registerFailedLoginAttempt(targetUser)
    })

    await writeAuthAuditLog({
      userId: user.id,
      provider: 'password',
      eventType: 'login',
      eventStatus: 'failure',
      ...context,
      detail: {
        email,
        code: failureState?.resetRequired
          ? 'password_reset_required'
          : failureState?.lockedUntil
            ? 'login_temporarily_locked'
            : 'invalid_credentials',
      },
    }).catch(() => null)

    if (failureState?.resetRequired) {
      sendJson(res, 403, {
        error: 'password_reset_required',
        message: '密碼錯誤已達 10 次，請先申請臨時密碼',
      })
      return
    }

    if (failureState?.lockedUntil) {
      sendJson(res, 429, {
        error: 'login_temporarily_locked',
        message: `密碼錯誤已達 ${LOGIN_LOCK_THRESHOLD} 次，請 ${getLockRemainingMinutes(failureState.lockedUntil)} 分鐘後再試`,
        locked_until: failureState.lockedUntil,
      })
      return
    }

    sendJson(res, 401, {
      error: 'invalid_credentials',
      message: 'Email 或密碼錯誤',
    })
    return
  }

  const loggedInUser = await updateStore(async (nextData) => {
    const targetUser = findUserByEmail(nextData, email)
    if (!targetUser) {
      throw createAuthError('找不到使用者', 'user_not_found', 404)
    }
    clearLoginFailureState(targetUser)
    targetUser.last_login_at = nowIso()
    targetUser.updated_at = targetUser.last_login_at
    return targetUser
  })

  await writeAuthAuditLog({
    userId: loggedInUser.id,
    provider: 'password',
    eventType: 'login',
    eventStatus: 'success',
    ...context,
    detail: { email },
  }).catch(() => null)

  await sendAuthSession(res, loggedInUser, {
    issuedByProvider: 'password',
    context,
  })
}

async function handleGooglePrepare(req, res) {
  const body = parseBody(req)
  const requestedPurpose = normalizeText(body.purpose)
  const purpose = requestedPurpose === 'link' ? 'link' : 'login'
  const context = getRequestContext(req)
  const currentUser = purpose === 'link'
    ? await requireAuthenticatedUser(req, res, sendJson)
    : await getOptionalAuthenticatedUser(req)

  if (purpose === 'link' && !currentUser) {
    return
  }

  const challenge = await createAuthNonce({
    provider: 'google',
    purpose,
    userId: purpose === 'link' ? currentUser.id : '',
    ...context,
  })

  await writeAuthAuditLog({
    userId: currentUser?.id ?? '',
    provider: 'google',
    eventType: 'prepare',
    eventStatus: 'success',
    ...context,
    detail: { purpose },
  }).catch(() => null)

  sendJson(res, 200, challenge)
}

async function handleGoogleAuth(req, res) {
  const body = parseBody(req)
  const idToken = normalizeText(body.idToken ?? body.id_token)
  const nonce = normalizeText(body.nonce)
  if (!idToken) {
    throw createAuthError('缺少 Google ID token', 'google_token_required', 400)
  }
  if (!nonce) {
    throw createAuthError('缺少 Google nonce', 'google_nonce_required', 400)
  }

  const context = getRequestContext(req)
  const currentUser = await getOptionalAuthenticatedUser(req)
  const purpose = currentUser ? 'link' : 'login'

  try {
    await consumeAuthNonce({
      provider: 'google',
      nonce,
      purpose,
      userId: currentUser?.id ?? '',
    })

    const googleProfile = await verifyGoogleIdToken({
      idToken,
      expectedNonce: nonce,
    })

    let resolvedUser = null
    let eventType = 'google_login'
    const linkedUser = await findUserByAuthProvider('google', googleProfile.sub)

    if (currentUser) {
      if (linkedUser && String(linkedUser.id) !== String(currentUser.id)) {
        throw createAuthError('此 Google 帳號已綁定其他使用者', 'provider_already_linked', 409)
      }

      resolvedUser = await linkUserAuthProvider({
        userId: currentUser.id,
        provider: 'google',
        providerSub: googleProfile.sub,
        email: googleProfile.email,
        emailVerified: googleProfile.email_verified,
        displayName: googleProfile.name,
        avatarUrl: googleProfile.picture,
      })
      eventType = linkedUser ? 'google_login_linked_user' : 'google_link'
    } else if (linkedUser) {
      resolvedUser = await updateUserFromAuthProviderLogin({
        userId: linkedUser.id,
        email: googleProfile.email,
        emailVerified: googleProfile.email_verified,
        displayName: googleProfile.name,
        avatarUrl: googleProfile.picture,
      })
      eventType = 'google_login'
    } else {
      if (!googleProfile.email || !googleProfile.email_verified) {
        throw createAuthError('Google 帳號 Email 未驗證，無法建立本地帳號', 'google_email_not_verified', 403)
      }

      const existingData = await readStore()
      const existingUser = findUserByEmail(existingData, googleProfile.email)
      if (existingUser) {
        throw createAuthError(
          '此 Email 已有帳號，請先用原登入方式登入後再到帳號頁綁定 Google',
          'existing_account_link_required',
          409,
        )
      }

      resolvedUser = await createUserFromExternalIdentity({
        provider: 'google',
        providerSub: googleProfile.sub,
        email: googleProfile.email,
        emailVerified: googleProfile.email_verified,
        displayName: googleProfile.name,
        avatarUrl: googleProfile.picture,
      })
      eventType = 'google_register'
    }

    await writeAuthAuditLog({
      userId: resolvedUser.id,
      provider: 'google',
      eventType,
      eventStatus: 'success',
      ...context,
      detail: {
        sub: googleProfile.sub,
        email: googleProfile.email,
        email_verified: googleProfile.email_verified,
      },
    }).catch(() => null)

    await sendAuthSession(res, resolvedUser, {
      issuedByProvider: 'google',
      context,
      extra: {
        linked: purpose === 'link',
      },
    })
  } catch (error) {
    await writeAuthAuditLog({
      userId: currentUser?.id ?? '',
      provider: 'google',
      eventType: purpose === 'link' ? 'google_link' : 'google_login',
      eventStatus: 'failure',
      ...context,
      detail: {
        code: String(error?.code ?? 'google_auth_failed'),
      },
    }).catch(() => null)
    throw error
  }
}

async function handleRefresh(req, res) {
  const body = parseBody(req)
  const refreshToken = normalizeText(body.refreshToken ?? body.refresh_token)
  if (!refreshToken) {
    throw createAuthError('缺少 refresh token', 'refresh_token_required', 400)
  }

  const context = getRequestContext(req)
  const session = await rotateRefreshSession(refreshToken, context)
  const publicProfile = await buildPublicUserProfile(session.user)

  await writeAuthAuditLog({
    userId: session.user.id,
    provider: 'session',
    eventType: 'refresh',
    eventStatus: 'success',
    ...context,
    detail: { session_family_id: session.sessionFamilyId },
  }).catch(() => null)

  sendJson(res, 200, {
    token: session.accessToken,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresInSec,
    refresh_token: session.refreshToken,
    refresh_token_expires_in: session.refreshExpiresInSec,
    refresh_token_expires_at: session.refreshTokenExpiresAt,
    user: publicProfile,
  })
}

async function handlePasswordResetRequest(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const data = await readStore()
  const existingUser = findUserByEmail(data, email)

  let debugTemporaryPassword = ''
  let cooldownSeconds = 0
  if (existingUser) {
    cooldownSeconds = getCooldownRemainingSeconds(existingUser.password_reset_requested_at, PASSWORD_RESET_REQUEST_COOLDOWN_MS)
    if (cooldownSeconds > 0) {
      throw createAuthError(
        `臨時密碼已寄出，請 ${cooldownSeconds} 秒後再試`,
        'password_reset_request_cooldown',
        429,
        { retry_after_seconds: cooldownSeconds },
      )
    }

    const temporaryPassword = createTemporaryPassword()
    const passwordRecord = hashPassword(temporaryPassword)
    const issuedAt = nowIso()

    await updateStore(async (nextData) => {
      const targetUser = findUserByEmail(nextData, email)
      if (!targetUser) return
      targetUser.password_hash = passwordRecord.hash
      targetUser.password_salt = passwordRecord.salt
      targetUser.must_change_password = true
      targetUser.temporary_password_issued_at = issuedAt
      clearPasswordResetState(targetUser)
      clearLoginFailureState(targetUser)
      targetUser.updated_at = issuedAt
    })

    await sendTemporaryPasswordEmail({
      email,
      displayName: existingUser.display_name || existingUser.email,
      temporaryPassword,
    })

    if (DEBUG_PASSWORD_RESET_RESPONSE) {
      debugTemporaryPassword = temporaryPassword
    }
  }

  sendJson(res, 200, {
    ok: true,
    message: '如果此 Email 已註冊，系統會寄出臨時密碼',
    debug_temporary_password: debugTemporaryPassword,
    cooldown_seconds: Math.ceil(PASSWORD_RESET_REQUEST_COOLDOWN_MS / 1000),
  })
}

async function handlePasswordResetConfirm(req, res) {
  const body = parseBody(req)
  const token = normalizeText(body.token)
  const password = validatePassword(body.password)
  if (!token) {
    throw createAuthError('缺少重設密碼 token', 'password_reset_token_required', 400)
  }

  const tokenHash = hashSensitiveToken(token)
  const updatedUser = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item?.password_reset_token_hash ?? '') === tokenHash)
    if (!targetUser) {
      throw createAuthError('重設連結無效或已失效', 'password_reset_token_invalid', 400)
    }

    const expiresAtMs = Date.parse(String(targetUser.password_reset_expires_at ?? ''))
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      clearPasswordResetState(targetUser)
      targetUser.updated_at = nowIso()
      throw createAuthError('重設連結已失效，請重新申請', 'password_reset_token_expired', 400)
    }

    const passwordRecord = hashPassword(password)
    targetUser.password_hash = passwordRecord.hash
    targetUser.password_salt = passwordRecord.salt
    targetUser.email_verified = Boolean(targetUser.email_verified)
    targetUser.last_login_at = nowIso()
    clearTemporaryPasswordState(targetUser)
    clearPasswordResetState(targetUser)
    clearLoginFailureState(targetUser)
    targetUser.updated_at = targetUser.last_login_at
    return targetUser
  })

  await revokeRefreshSession('', {
    userId: updatedUser.id,
    reason: 'password_reset',
  }).catch(() => null)

  await sendAuthSession(res, updatedUser, {
    issuedByProvider: 'password',
    context: getRequestContext(req),
  })
}

async function handleMe(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson, { allowTemporaryPassword: true })
  if (!user) return
  sendJson(res, 200, { user: await buildPublicUserProfile(user) })
}

async function handleProfileUpdate(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const body = parseBody(req)
  const displayName = normalizeDisplayName(body.displayName, user.display_name || user.email)
  const avatarUrl = normalizeAvatarUrl(body.avatarUrl)

  const updatedUser = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!targetUser) {
      throw createAuthError('找不到使用者', 'user_not_found', 404)
    }

    targetUser.display_name = displayName
    targetUser.avatar_url = avatarUrl
    targetUser.updated_at = nowIso()
    return targetUser
  })

  sendJson(res, 200, { user: await buildPublicUserProfile(updatedUser) })
}

async function handlePasswordChange(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson, { allowTemporaryPassword: true })
  if (!user) return

  const body = parseBody(req)
  const currentPassword = normalizeText(body.currentPassword)
  const nextPassword = validatePassword(body.nextPassword ?? body.password)

  const updatedUser = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!targetUser) {
      throw createAuthError('找不到使用者', 'user_not_found', 404)
    }

    const hasPassword = Boolean(String(targetUser.password_hash ?? '').trim() && String(targetUser.password_salt ?? '').trim())
    if (!targetUser.must_change_password && hasPassword) {
      if (!currentPassword) {
        throw createAuthError('請輸入目前密碼', 'current_password_required', 400)
      }
      if (!verifyPassword(targetUser, currentPassword)) {
        throw createAuthError('目前密碼錯誤', 'current_password_invalid', 400)
      }
    }

    const passwordRecord = hashPassword(nextPassword)
    targetUser.password_hash = passwordRecord.hash
    targetUser.password_salt = passwordRecord.salt
    targetUser.last_login_at = nowIso()
    clearTemporaryPasswordState(targetUser)
    clearPasswordResetState(targetUser)
    clearLoginFailureState(targetUser)
    targetUser.updated_at = targetUser.last_login_at
    return targetUser
  })

  await revokeRefreshSession('', {
    userId: updatedUser.id,
    reason: 'password_changed',
  }).catch(() => null)

  await sendAuthSession(res, updatedUser, {
    issuedByProvider: 'password',
    context: getRequestContext(req),
  })
}

async function handleLogout(req, res) {
  const body = parseBody(req)
  const refreshToken = normalizeText(body.refreshToken ?? body.refresh_token)
  const currentUser = await getOptionalAuthenticatedUser(req)
  const sessionFamilyId = getCurrentSessionFamilyId(req)

  await revokeRefreshSession(refreshToken, {
    sessionFamilyId,
    userId: currentUser?.id ?? '',
    reason: 'logout',
  }).catch(() => null)

  if (currentUser?.id) {
    await writeAuthAuditLog({
      userId: currentUser.id,
      provider: 'session',
      eventType: 'logout',
      eventStatus: 'success',
      ...getRequestContext(req),
      detail: { session_family_id: sessionFamilyId },
    }).catch(() => null)
  }

  sendJson(res, 200, { ok: true })
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

    if (req.method === 'POST' && pathname === '/google/prepare') {
      await handleGooglePrepare(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/google') {
      await handleGoogleAuth(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/refresh') {
      await handleRefresh(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/password-reset/request') {
      await handlePasswordResetRequest(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/password-reset/confirm') {
      await handlePasswordResetConfirm(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/password/change') {
      await handlePasswordChange(req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/logout') {
      await handleLogout(req, res)
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
    sendAuthError(res, error)
  }
}
