import {
  buildAuthSessionResponse,
  clearRefreshTokenCookie,
  extractRefreshTokenFromRequest,
  setRefreshTokenCookie,
  usesCookieAuthStorage,
} from '../../collab/auth-cookies.js'
import {
  assertLoginAllowed,
  buildPublicUserProfile,
  clearLoginFailureState,
  clearPasswordResetState,
  clearTemporaryPasswordState,
  consumeAuthNonce,
  createAuthError,
  createId,
  createUniqueReferralCode,
  findUserByAuthProvider,
  findUserByEmail,
  getCurrentSessionFamilyId,
  getLockedUntil,
  getLockRemainingMinutes,
  getOptionalAuthenticatedUser,
  getRequestContext,
  hashPassword,
  linkUserAuthProvider,
  listUserAuthProviders,
  normalizeAvatarUrl,
  normalizeDisplayName,
  normalizeFutureIso,
  normalizeMembershipPlan,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  registerFailedLoginAttempt,
  requireAuthenticatedUser,
  revokeRefreshSession,
  sendAuthError,
  rotateRefreshSession,
  sendAuthSession,
  sendJson,
  syncMembershipGrantBySource,
  updateStore,
  validateEmail,
  validatePassword,
  verifyPassword,
  verifyGoogleIdTokenForAuth,
  writeAuthAuditLog,
  GOOGLE_PLAY_CLIENT_SYNC_SOURCE,
  GOOGLE_PLAY_LIFETIME_SYNC_EXPIRES_AT,
} from './shared.js'

export async function handleRegister(req, res) {
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
    req,
  })
}

export async function handleLogin(req, res) {
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
    sendJson(res, 429, {
      error: 'login_temporarily_locked',
      message: `密碼錯誤已達 5 次，請 ${getLockRemainingMinutes(lockedUntil)} 分鐘後再試`,
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
        message: `密碼錯誤已達 5 次，請 ${getLockRemainingMinutes(failureState.lockedUntil)} 分鐘後再試`,
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
    req,
  })
}

export async function handleRefresh(req, res) {
  const body = parseBody(req)
  const refreshToken = extractRefreshTokenFromRequest(req, body)
  if (!refreshToken) {
    throw createAuthError('缺少 refresh token', 'refresh_token_required', 400)
  }

  const context = getRequestContext(req)
  const session = await rotateRefreshSession(refreshToken, context)
  const publicProfile = await buildPublicUserProfile(session.user)
  const cookieMode = usesCookieAuthStorage(req)

  await writeAuthAuditLog({
    userId: session.user.id,
    provider: 'session',
    eventType: 'refresh',
    eventStatus: 'success',
    ...context,
    detail: { session_family_id: session.sessionFamilyId },
  }).catch(() => null)

  if (cookieMode) {
    setRefreshTokenCookie(res, session.refreshToken, {
      req,
      maxAgeSec: session.refreshExpiresInSec,
    })
  }

  sendJson(res, 200, buildAuthSessionResponse({
    ...session,
    publicProfile,
  }, {
    cookieMode,
  }))
}

export async function handleMe(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson, { allowTemporaryPassword: true })
  if (!user) return
  sendJson(res, 200, { user: await buildPublicUserProfile(user) })
}

export async function handleProfileUpdate(req, res) {
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

export async function handleGooglePlayMembershipSync(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const body = parseBody(req)
  const active = Boolean(body.active)
  const plan = normalizeMembershipPlan(body.plan)
  const observedAt = normalizeFutureIso(body.observedAt ?? body.observed_at) || nowIso()
  const expiresAt = plan === 'lifetime'
    ? GOOGLE_PLAY_LIFETIME_SYNC_EXPIRES_AT
    : normalizeFutureIso(body.expiresAt ?? body.expires_at)

  const updatedUser = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!targetUser) {
      throw createAuthError('找不到使用者', 'user_not_found', 404)
    }

    syncMembershipGrantBySource(targetUser, GOOGLE_PLAY_CLIENT_SYNC_SOURCE, {
      active: active && Boolean(plan),
      startAt: observedAt,
      endAt: expiresAt,
      meta: {
        plan,
        source: 'google_play_client_sync',
        observed_at: observedAt,
        reported_expires_at: expiresAt,
        last_sync_status: String(body.lastSyncStatus ?? body.last_sync_status ?? '').trim(),
        reason: String(body.reason ?? '').trim(),
      },
    })

    return targetUser
  })

  sendJson(res, 200, {
    user: await buildPublicUserProfile(updatedUser),
    membership_synced: true,
  })
}

export async function handlePasswordChange(req, res) {
  const user = await requireAuthenticatedUser(req, res, sendJson, { allowTemporaryPassword: true })
  if (!user) return

  const body = parseBody(req)
  const currentPassword = normalizeText(body.currentPassword)
  const nextPassword = validatePassword(body.nextPassword ?? body.password)
  const googleIdToken = normalizeText(body.googleIdToken ?? body.google_id_token)
  const googleNonce = normalizeText(body.googleNonce ?? body.google_nonce)
  const hasPassword = Boolean(String(user.password_hash ?? '').trim() && String(user.password_salt ?? '').trim())
  const googleProvider = (await listUserAuthProviders(user.id))
    .find((item) => String(item?.provider ?? '').trim() === 'google') ?? null

  if (!user.must_change_password && !hasPassword && googleProvider) {
    if (!googleIdToken || !googleNonce) {
      throw createAuthError('請先完成 Google 驗證，再新增密碼', 'google_reauth_required', 400)
    }

    await consumeAuthNonce({
      provider: 'google',
      nonce: googleNonce,
      purpose: 'password_change',
      userId: user.id,
    })

    const googleProfile = await verifyGoogleIdTokenForAuth({
      idToken: googleIdToken,
      expectedNonce: googleNonce,
    })
    const linkedUser = await findUserByAuthProvider('google', googleProfile.sub)
    if (linkedUser && String(linkedUser.id) !== String(user.id)) {
      throw createAuthError('此 Google 帳號已綁定其他使用者', 'provider_already_linked', 409)
    }
    if (!linkedUser) {
      await linkUserAuthProvider({
        userId: user.id,
        provider: 'google',
        providerSub: googleProfile.sub,
        email: googleProfile.email,
        emailVerified: googleProfile.email_verified,
        displayName: googleProfile.name,
        avatarUrl: googleProfile.picture,
      })
    }
  }

  const updatedUser = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!targetUser) {
      throw createAuthError('找不到使用者', 'user_not_found', 404)
    }

    const targetHasPassword = Boolean(String(targetUser.password_hash ?? '').trim() && String(targetUser.password_salt ?? '').trim())
    if (!targetUser.must_change_password && targetHasPassword) {
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
    req,
  })
}

export async function handleLogout(req, res) {
  const body = parseBody(req)
  const refreshToken = extractRefreshTokenFromRequest(req, body)
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

  if (usesCookieAuthStorage(req)) {
    clearRefreshTokenCookie(res, req)
  }

  sendJson(res, 200, { ok: true })
}
