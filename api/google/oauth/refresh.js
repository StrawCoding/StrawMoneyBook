const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000
const GOOGLE_OAUTH_CLIENT_SHARED_KEY = String(process.env.GOOGLE_OAUTH_CLIENT_SHARED_KEY ?? '').trim()
const ERROR_NUMBER = {
  METHOD_NOT_ALLOWED: 'GOOGLE_REFRESH_001',
  UNAUTHORIZED_CLIENT: 'GOOGLE_REFRESH_002',
  MISSING_REFRESH_TOKEN: 'GOOGLE_REFRESH_003',
  MISSING_GOOGLE_OAUTH_ENV: 'GOOGLE_REFRESH_004',
  TOKEN_REFRESH_FAILED: 'GOOGLE_REFRESH_005',
  MISSING_ACCESS_TOKEN: 'GOOGLE_REFRESH_006',
  REFRESH_REQUEST_FAILED: 'GOOGLE_REFRESH_007',
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Straw-Client-Key')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

function sendError(res, statusCode, error, message, errorNumber) {
  sendJson(res, statusCode, {
    error,
    message,
    errorNumber,
  })
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

function isClientAuthorized(req) {
  if (!GOOGLE_OAUTH_CLIENT_SHARED_KEY) return true
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return Boolean(provided) && provided === GOOGLE_OAUTH_CLIENT_SHARED_KEY
}

function tokenPrefix(raw) {
  const token = String(raw ?? '').trim()
  if (!token) return '(empty)'
  const prefix = token.slice(0, 12)
  return `${prefix}${token.length > 12 ? '...' : ''} (len=${token.length})`
}

function inferTokenType(raw) {
  const token = String(raw ?? '').trim()
  if (!token) return 'empty'
  if (token.includes('.') && token.split('.').length === 3) return 'id_token_like'
  if (token.startsWith('1//')) return 'refresh_token_like'
  if (token.startsWith('ya29.')) return 'access_token_like'
  return 'unknown'
}

async function requestGoogleToken(params) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timeoutId = 0
  if (controller) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, GOOGLE_TOKEN_REQUEST_TIMEOUT_MS)
  }

  try {
    return await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw new Error('Google token endpoint timeout')
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed', ERROR_NUMBER.METHOD_NOT_ALLOWED)
    return
  }
  if (!isClientAuthorized(req)) {
    sendError(
      res,
      401,
      'unauthorized_client',
      'missing or invalid x-straw-client-key',
      ERROR_NUMBER.UNAUTHORIZED_CLIENT,
    )
    return
  }

  const body = parseBody(req)
  const refreshToken = String(body.refreshToken ?? body.refresh_token ?? '').trim()
  if (!refreshToken) {
    sendError(res, 400, 'missing_refresh_token', 'refreshToken is required', ERROR_NUMBER.MISSING_REFRESH_TOKEN)
    return
  }
  console.info('[google-oauth-refresh] incoming refresh token summary', {
    refreshToken: `${tokenPrefix(refreshToken)} [${inferTokenType(refreshToken)}]`,
  })

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) {
    sendError(
      res,
      500,
      'missing_google_oauth_env',
      'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required',
      ERROR_NUMBER.MISSING_GOOGLE_OAUTH_ENV,
    )
    return
  }

  const params = new URLSearchParams()
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', refreshToken)

  try {
    const response = await requestGoogleToken(params)

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
      sendError(
        res,
        response.status,
        'google_token_refresh_failed',
        String(json.error_description ?? json.error ?? rawText ?? 'Google token refresh failed'),
        ERROR_NUMBER.TOKEN_REFRESH_FAILED,
      )
      return
    }

    const accessToken = String(json.access_token ?? '').trim()
    if (!accessToken) {
      sendError(res, 502, 'missing_access_token', 'Google did not return access_token', ERROR_NUMBER.MISSING_ACCESS_TOKEN)
      return
    }

    console.info('[google-oauth-refresh] token response summary', {
      accessToken: `${tokenPrefix(accessToken)} [${inferTokenType(accessToken)}]`,
      refreshToken: `${tokenPrefix(json.refresh_token ?? refreshToken)} [${inferTokenType(json.refresh_token ?? refreshToken)}]`,
      idToken: `${tokenPrefix(json.id_token ?? '')} [${inferTokenType(json.id_token ?? '')}]`,
    })

    sendJson(res, 200, {
      accessToken,
      refreshToken: String(json.refresh_token ?? refreshToken).trim(),
      expiresIn: Number(json.expires_in ?? 0) || 0,
      tokenType: String(json.token_type ?? '').trim(),
      scope: String(json.scope ?? '').trim(),
      idToken: String(json.id_token ?? '').trim(),
    })
  } catch (error) {
    sendError(
      res,
      500,
      'google_refresh_request_failed',
      String(error?.message ?? error ?? 'Unknown error'),
      ERROR_NUMBER.REFRESH_REQUEST_FAILED,
    )
  }
}
