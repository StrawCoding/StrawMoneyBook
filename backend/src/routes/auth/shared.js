import {
  buildAuthSessionResponse,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
  usesCookieAuthStorage,
  usesNativeClientAuthBackup,
} from '../../collab/auth-cookies.js'
import { requireAuthenticatedUser } from '../../collab/auth-session.js'
import { verifyGoogleIdToken } from '../../collab/google-id-token.js'
import { sendTemporaryPasswordEmail } from '../../collab/mailer.js'
import {
  extractBearerToken,
  getClientIp,
  getUserAgent,
  methodGuard,
  normalizePath,
  normalizeText,
  parseBody,
  sendJson,
} from '../../collab/http.js'
import {
  createId,
  createTemporaryPassword,
  createUniqueReferralCode,
  findUserByEmail,
  findUserById,
  nowIso,
  readStore,
  updateStore,
} from '../../collab/store.js'
import {
  buildPublicUserProfile,
  consumeAuthNonce,
  createAuthNonce,
  createLoginSession,
  createUserFromExternalIdentity,
  findUserByAuthProvider,
  hashPassword,
  hashSensitiveToken,
  listUserAuthProviders,
  linkUserAuthProvider,
  normalizeAvatarUrl,
  normalizeDisplayName,
  revokeRefreshSession,
  rotateRefreshSession,
  syncMembershipGrantBySource,
  updateUserFromAuthProviderLogin,
  validateEmail,
  validatePassword,
  verifyAccessToken,
  verifyPassword,
  writeAuthAuditLog,
} from '../../collab/auth-store.js'

export const LOGIN_LOCK_THRESHOLD = 5
export const LOGIN_LOCK_DURATION_MS = 10 * 60 * 1000
export const LOGIN_FORCE_RESET_THRESHOLD = 10
export const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60 * 1000
export const GOOGLE_PLAY_CLIENT_SYNC_SOURCE = 'google_play_client_sync'
export const GOOGLE_PLAY_VERIFIED_SOURCE = 'google_play_verified'
export const GOOGLE_PLAY_LIFETIME_SYNC_EXPIRES_AT = '2099-12-31T23:59:59.999Z'

const DEBUG_PASSWORD_RESET_RESPONSE =
  process.env.NODE_ENV !== 'production' &&
  isTruthy(process.env.SHARED_LEDGER_DEBUG_PASSWORD_RESET)

let googleIdTokenVerifierOverride = null

export function setAuthGoogleIdTokenVerifier(verifier = null) {
  googleIdTokenVerifierOverride = typeof verifier === 'function' ? verifier : null
}

export async function verifyGoogleIdTokenForAuth(options = {}) {
  if (googleIdTokenVerifierOverride) {
    return googleIdTokenVerifierOverride(options)
  }
  return verifyGoogleIdToken(options)
}

export function isDebugPasswordResetResponseEnabled() {
  return DEBUG_PASSWORD_RESET_RESPONSE
}

export function isTruthy(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function createAuthError(message, code = 'auth_request_failed', status = 400, extras = {}) {
  const error = new Error(String(message ?? '').trim() || 'auth request failed')
  error.code = code
  error.status = status
  Object.assign(error, extras)
  return error
}

export function clearPasswordResetState(user) {
  user.password_reset_token_hash = ''
  user.password_reset_requested_at = ''
  user.password_reset_expires_at = ''
}

export function clearLoginFailureState(user) {
  user.login_failed_attempts = 0
  user.last_failed_login_at = ''
  user.login_locked_until = ''
  user.password_reset_required = false
}

export function clearTemporaryPasswordState(user) {
  user.must_change_password = false
  user.temporary_password_issued_at = ''
}

export function getLockRemainingMinutes(lockedUntil) {
  const lockedUntilMs = Date.parse(String(lockedUntil ?? ''))
  if (!Number.isFinite(lockedUntilMs)) return 0
  return Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 60_000))
}

export function getCooldownRemainingSeconds(dateString, cooldownMs) {
  const issuedAtMs = Date.parse(String(dateString ?? ''))
  if (!Number.isFinite(issuedAtMs)) return 0
  return Math.max(0, Math.ceil((issuedAtMs + cooldownMs - Date.now()) / 1000))
}

export function getLockedUntil(user) {
  const lockedUntil = String(user?.login_locked_until ?? '').trim()
  const lockedUntilMs = Date.parse(lockedUntil)
  return lockedUntil && Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()
    ? lockedUntil
    : ''
}

export function assertLoginAllowed(user) {
  if (Boolean(user?.password_reset_required)) {
    throw createAuthError('密碼錯誤已達 10 次，請先申請臨時密碼', 'password_reset_required', 403)
  }
}

export function registerFailedLoginAttempt(user) {
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

export function sendAuthError(res, error) {
  sendJson(res, Number(error?.status ?? 400) || 400, {
    error: String(error?.code ?? 'auth_request_failed'),
    message: String(error?.message ?? error ?? 'auth request failed'),
    locked_until: String(error?.locked_until ?? ''),
    retry_after_seconds: Math.max(0, Number(error?.retry_after_seconds ?? 0) || 0),
  })
}

export function normalizeMembershipPlan(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'monthly') return 'monthly'
  if (normalized === 'lifetime') return 'lifetime'
  return ''
}

export function normalizeFutureIso(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const parsedMs = Date.parse(text)
  if (!Number.isFinite(parsedMs)) return ''
  return new Date(parsedMs).toISOString()
}

export async function getOptionalAuthenticatedUser(req) {
  const payload = verifyAccessToken(extractBearerToken(req))
  if (!payload?.sub) return null
  const data = await readStore()
  return findUserById(data, payload.sub)
}

export function getCurrentSessionFamilyId(req) {
  const payload = verifyAccessToken(extractBearerToken(req))
  return String(payload?.sid ?? '').trim()
}

export function getRequestContext(req) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  }
}

export function resolveGoogleAuthPurpose(rawPurpose, { authenticated = false } = {}) {
  const requestedPurpose = normalizeText(rawPurpose)
  if (authenticated && requestedPurpose === 'password_change') return 'password_change'
  if (authenticated && requestedPurpose === 'link') return 'link'
  return 'login'
}

export async function sendAuthSession(res, user, {
  issuedByProvider = 'password',
  context = {},
  status = 200,
  extra = {},
  req = null,
} = {}) {
  const session = await createLoginSession(user, {
    issuedByProvider,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })
  const publicProfile = await buildPublicUserProfile(session.user)
  const cookieMode = usesCookieAuthStorage(req ?? res?.__request ?? null)
  const nativeClientBackup = cookieMode && usesNativeClientAuthBackup(req ?? res?.__request ?? null)

  if (cookieMode) {
    setRefreshTokenCookie(res, session.refreshToken, {
      req: req ?? res?.__request ?? null,
      maxAgeSec: session.refreshExpiresInSec,
    })
  }

  sendJson(res, status, buildAuthSessionResponse({
    ...session,
    publicProfile,
  }, {
    cookieMode,
    nativeClientBackup,
    extra,
  }))
}

export {
  buildPublicUserProfile,
  consumeAuthNonce,
  createAuthNonce,
  createId,
  createTemporaryPassword,
  createUniqueReferralCode,
  createUserFromExternalIdentity,
  findUserByAuthProvider,
  findUserByEmail,
  hashPassword,
  hashSensitiveToken,
  linkUserAuthProvider,
  listUserAuthProviders,
  methodGuard,
  normalizeAvatarUrl,
  normalizeDisplayName,
  normalizePath,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  requireAuthenticatedUser,
  revokeRefreshSession,
  rotateRefreshSession,
  sendJson,
  sendTemporaryPasswordEmail,
  syncMembershipGrantBySource,
  updateStore,
  updateUserFromAuthProviderLogin,
  validateEmail,
  validatePassword,
  verifyPassword,
  writeAuthAuditLog,
}
