import {
  consumeAuthNonce,
  createAuthError,
  createAuthNonce,
  createUserFromExternalIdentity,
  findUserByAuthProvider,
  findUserByEmail,
  getOptionalAuthenticatedUser,
  getRequestContext,
  linkUserAuthProvider,
  parseBody,
  readStore,
  requireAuthenticatedUser,
  resolveGoogleAuthPurpose,
  sendAuthSession,
  sendJson,
  updateUserFromAuthProviderLogin,
  verifyGoogleIdTokenForAuth,
  writeAuthAuditLog,
  normalizeText,
} from './shared.js'

export async function handleGooglePrepare(req, res) {
  const body = parseBody(req)
  const requestedPurpose = normalizeText(body.purpose)
  const wantsAuthenticatedPurpose = requestedPurpose === 'link' || requestedPurpose === 'password_change'
  const context = getRequestContext(req)
  const currentUser = wantsAuthenticatedPurpose
    ? await requireAuthenticatedUser(req, res, sendJson)
    : await getOptionalAuthenticatedUser(req)

  if (wantsAuthenticatedPurpose && !currentUser) {
    return
  }

  const purpose = resolveGoogleAuthPurpose(requestedPurpose, {
    authenticated: Boolean(currentUser),
  })

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

export async function handleGoogleAuth(req, res) {
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
  const purpose = resolveGoogleAuthPurpose(body.purpose, {
    authenticated: Boolean(currentUser),
  })

  try {
    await consumeAuthNonce({
      provider: 'google',
      nonce,
      purpose,
      userId: currentUser?.id ?? '',
    })

    const googleProfile = await verifyGoogleIdTokenForAuth({
      idToken,
      expectedNonce: nonce,
    })

    let resolvedUser = null
    let eventType = 'google_login'
    const linkedUser = await findUserByAuthProvider('google', googleProfile.sub)

    if (purpose === 'password_change') {
      if (!currentUser) {
        throw createAuthError('請先登入帳號', 'auth_required', 401)
      }

      if (linkedUser && String(linkedUser.id) !== String(currentUser.id)) {
        throw createAuthError('此 Google 帳號已綁定其他使用者', 'provider_already_linked', 409)
      }

      resolvedUser = linkedUser
        ? await updateUserFromAuthProviderLogin({
            userId: linkedUser.id,
            email: googleProfile.email,
            emailVerified: googleProfile.email_verified,
            displayName: googleProfile.name,
            avatarUrl: googleProfile.picture,
          })
        : await linkUserAuthProvider({
            userId: currentUser.id,
            provider: 'google',
            providerSub: googleProfile.sub,
            email: googleProfile.email,
            emailVerified: googleProfile.email_verified,
            displayName: googleProfile.name,
            avatarUrl: googleProfile.picture,
          })
      eventType = linkedUser ? 'google_password_change_verify' : 'google_link'
    } else if (currentUser) {
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
      req,
      extra: {
        linked: purpose === 'link' || purpose === 'password_change',
      },
    })
  } catch (error) {
    await writeAuthAuditLog({
      userId: currentUser?.id ?? '',
      provider: 'google',
      eventType: purpose === 'link'
        ? 'google_link'
        : purpose === 'password_change'
          ? 'google_password_change_verify'
          : 'google_login',
      eventStatus: 'failure',
      ...context,
      detail: {
        code: String(error?.code ?? 'google_auth_failed'),
      },
    }).catch(() => null)
    throw error
  }
}
