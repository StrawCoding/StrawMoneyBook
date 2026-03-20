import { createHmac, timingSafeEqual } from 'node:crypto'

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input) {
  const normalized = String(input ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4
  const padded = normalized + '='.repeat(paddingLength)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function secureEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8')
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function signToken(payload, tokenSecret) {
  return createHmac('sha256', String(tokenSecret ?? '')).update(payload).digest('hex')
}

export function getAccessTokenExpiresInSeconds(accessTokenTtlMs) {
  return Math.max(60, Math.floor((Number(accessTokenTtlMs) || 0) / 1000))
}

export function issueAccessToken(user, {
  tokenSecret,
  accessTokenTtlMs,
  createId,
  nowMs = Date.now(),
} = {}) {
  const payload = {
    sub: user.id,
    email: String(user?.email ?? user?.account ?? '').trim().toLowerCase(),
    jti: createId('atk'),
    sid: String(user?.session_family_id ?? '').trim(),
    exp: nowMs + (Number(accessTokenTtlMs) || 0),
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signToken(encodedPayload, tokenSecret)
  return `${encodedPayload}.${signature}`
}

export function verifyAccessToken(token, {
  tokenSecret,
  nowMs = Date.now(),
} = {}) {
  const source = String(token ?? '').trim()
  if (!source) return null
  const [encodedPayload, signature] = source.split('.')
  if (!encodedPayload || !signature) return null
  if (!secureEquals(signToken(encodedPayload, tokenSecret), signature)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload))
    const expiresAt = Number(payload?.exp ?? 0)
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null
    return payload
  } catch {
    return null
  }
}
