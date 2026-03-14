import { OAuth2Client } from 'google-auth-library'

const GOOGLE_OAUTH_CLIENT_ID = String(process.env.GOOGLE_AUTH_WEB_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
const GOOGLE_ALLOWED_AUDIENCES = String(process.env.GOOGLE_AUTH_ALLOWED_AUDIENCES ?? GOOGLE_OAUTH_CLIENT_ID)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const GOOGLE_ALLOWED_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
])

const oauthClient = new OAuth2Client()

function createGoogleAuthError(message, code = 'google_auth_invalid', status = 401, extras = {}) {
  const error = new Error(String(message ?? '').trim() || 'google auth invalid')
  error.code = code
  error.status = status
  Object.assign(error, extras)
  return error
}

function normalizeGooglePicture(value) {
  const source = String(value ?? '').trim()
  if (!source) return ''
  if (/^https?:\/\//i.test(source)) return source
  return ''
}

function getAllowedAudiences() {
  if (!GOOGLE_ALLOWED_AUDIENCES.length) {
    throw createGoogleAuthError(
      '缺少 GOOGLE_AUTH_WEB_CLIENT_ID 或 GOOGLE_AUTH_ALLOWED_AUDIENCES',
      'google_auth_not_configured',
      500,
    )
  }
  return GOOGLE_ALLOWED_AUDIENCES
}

function mapVerifyError(error) {
  const message = String(error?.message ?? error ?? '').trim()
  const normalized = message.toLowerCase()

  if (normalized.includes('wrong recipient') || normalized.includes('audience')) {
    return createGoogleAuthError('Google token audience 不符', 'google_audience_mismatch', 401)
  }
  if (normalized.includes('expired') || normalized.includes('used too late')) {
    return createGoogleAuthError('Google token 已過期', 'google_token_expired', 401)
  }
  if (normalized.includes('signature') || normalized.includes('invalid token')) {
    return createGoogleAuthError('Google token 簽章無效', 'google_invalid_signature', 401)
  }
  return createGoogleAuthError(message || 'Google token 驗證失敗', 'google_token_invalid', 401)
}

export async function verifyGoogleIdToken({
  idToken,
  expectedNonce = '',
  verifier = null,
} = {}) {
  const token = String(idToken ?? '').trim()
  if (!token) {
    throw createGoogleAuthError('缺少 Google ID token', 'google_token_required', 400)
  }

  const allowedAudiences = getAllowedAudiences()
  const verifyIdToken = typeof verifier === 'function'
    ? verifier
    : (options) => oauthClient.verifyIdToken(options)

  let payload = null
  try {
    const ticket = await verifyIdToken({
      idToken: token,
      audience: allowedAudiences,
    })
    payload = typeof ticket?.getPayload === 'function' ? ticket.getPayload() : ticket?.payload ?? null
  } catch (error) {
    throw mapVerifyError(error)
  }

  if (!payload || typeof payload !== 'object') {
    throw createGoogleAuthError('Google token payload 無效', 'google_token_payload_invalid', 401)
  }

  const issuer = String(payload.iss ?? '').trim()
  if (!GOOGLE_ALLOWED_ISSUERS.has(issuer)) {
    throw createGoogleAuthError('Google token issuer 不符', 'google_issuer_mismatch', 401)
  }

  const audience = String(payload.aud ?? '').trim()
  if (!allowedAudiences.includes(audience)) {
    throw createGoogleAuthError('Google token audience 不符', 'google_audience_mismatch', 401)
  }

  const expiresAtSec = Number(payload.exp ?? 0)
  if (!Number.isFinite(expiresAtSec) || expiresAtSec * 1000 <= Date.now()) {
    throw createGoogleAuthError('Google token 已過期', 'google_token_expired', 401)
  }

  const nonce = String(payload.nonce ?? '').trim()
  if (expectedNonce && nonce !== String(expectedNonce).trim()) {
    throw createGoogleAuthError('Google token nonce 不符', 'google_nonce_mismatch', 401)
  }

  const sub = String(payload.sub ?? '').trim()
  if (!sub) {
    throw createGoogleAuthError('Google token 缺少 sub', 'google_sub_missing', 401)
  }

  return {
    sub,
    email: String(payload.email ?? '').trim().toLowerCase(),
    email_verified: Boolean(payload.email_verified),
    name: String(payload.name ?? payload.given_name ?? '').trim(),
    picture: normalizeGooglePicture(payload.picture),
    issuer,
    audience,
    nonce,
    hosted_domain: String(payload.hd ?? '').trim(),
    issued_at: Number(payload.iat ?? 0) || 0,
    expires_at: expiresAtSec,
  }
}
