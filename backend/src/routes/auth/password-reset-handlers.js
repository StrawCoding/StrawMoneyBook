import {
  createAuthError,
  createTemporaryPassword,
  findUserByEmail,
  getCooldownRemainingSeconds,
  getRequestContext,
  hashPassword,
  hashSensitiveToken,
  isDebugPasswordResetResponseEnabled,
  nowIso,
  parseBody,
  readStore,
  revokeRefreshSession,
  sendAuthSession,
  sendJson,
  sendTemporaryPasswordEmail,
  updateStore,
  validateEmail,
  validatePassword,
  clearLoginFailureState,
  clearPasswordResetState,
  clearTemporaryPasswordState,
  PASSWORD_RESET_REQUEST_COOLDOWN_MS,
} from './shared.js'

export async function handlePasswordResetRequest(req, res) {
  const body = parseBody(req)
  const email = validateEmail(body.email ?? body.account)
  const data = await readStore()
  const existingUser = findUserByEmail(data, email)

  let debugTemporaryPassword = ''
  if (existingUser) {
    const cooldownSeconds = getCooldownRemainingSeconds(
      existingUser.password_reset_requested_at,
      PASSWORD_RESET_REQUEST_COOLDOWN_MS,
    )
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
    const previousPasswordState = {
      password_hash: existingUser.password_hash,
      password_salt: existingUser.password_salt,
      must_change_password: existingUser.must_change_password,
      temporary_password_issued_at: existingUser.temporary_password_issued_at,
      password_reset_token_hash: existingUser.password_reset_token_hash,
      password_reset_requested_at: existingUser.password_reset_requested_at,
      password_reset_expires_at: existingUser.password_reset_expires_at,
      login_failed_attempts: existingUser.login_failed_attempts,
      last_failed_login_at: existingUser.last_failed_login_at,
      login_locked_until: existingUser.login_locked_until,
      password_reset_required: existingUser.password_reset_required,
      updated_at: existingUser.updated_at,
    }

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

    try {
      await sendTemporaryPasswordEmail({
        email,
        displayName: existingUser.display_name || existingUser.email,
        temporaryPassword,
      })
    } catch (error) {
      await updateStore(async (nextData) => {
        const targetUser = findUserByEmail(nextData, email)
        if (!targetUser) return
        Object.assign(targetUser, previousPasswordState)
      })
      throw error
    }

    if (isDebugPasswordResetResponseEnabled()) {
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

export async function handlePasswordResetConfirm(req, res) {
  const body = parseBody(req)
  const token = String(body.token ?? '').trim()
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
