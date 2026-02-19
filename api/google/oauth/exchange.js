const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

function decodeJwtPayload(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return {}
  const parts = raw.split('.')
  if (parts.length < 2) return {}
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

function normalizeTokenPayload(data = {}) {
  const idToken = String(data.id_token ?? '').trim()
  const claims = decodeJwtPayload(idToken)
  return {
    accessToken: String(data.access_token ?? '').trim(),
    refreshToken: String(data.refresh_token ?? '').trim(),
    expiresIn: Number(data.expires_in ?? 0) || 0,
    tokenType: String(data.token_type ?? '').trim(),
    scope: String(data.scope ?? '').trim(),
    idToken,
    profile: {
      email: String(claims.email ?? '').trim(),
      name: String(claims.name ?? '').trim(),
      imageUrl: String(claims.picture ?? '').trim(),
    },
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }

  const body = parseBody(req)
  const serverAuthCode = String(body.serverAuthCode ?? body.code ?? '').trim()
  if (!serverAuthCode) {
    sendJson(res, 400, { error: 'missing_server_auth_code', message: 'serverAuthCode is required' })
    return
  }

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '').trim()
  if (!clientId || !clientSecret) {
    sendJson(res, 500, {
      error: 'missing_google_oauth_env',
      message: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required',
    })
    return
  }

  const params = new URLSearchParams()
  params.set('code', serverAuthCode)
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'authorization_code')
  if (redirectUri) {
    params.set('redirect_uri', redirectUri)
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const rawText = await response.text()
    let json = {}
    if (rawText) {
      try {
        json = JSON.parse(rawText)
      } catch {
        json = { raw: rawText }
      }
    }

    if (!response.ok) {
      sendJson(res, response.status, {
        error: 'google_token_exchange_failed',
        message: String(json.error_description ?? json.error ?? rawText ?? 'Google token exchange failed'),
      })
      return
    }

    const payload = normalizeTokenPayload(json)
    if (!payload.accessToken) {
      sendJson(res, 502, { error: 'missing_access_token', message: 'Google did not return access_token' })
      return
    }

    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 500, {
      error: 'google_exchange_request_failed',
      message: String(error?.message ?? error ?? 'Unknown error'),
    })
  }
}
