const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000

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
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }

  const body = parseBody(req)
  const refreshToken = String(body.refreshToken ?? body.refresh_token ?? '').trim()
  if (!refreshToken) {
    sendJson(res, 400, { error: 'missing_refresh_token', message: 'refreshToken is required' })
    return
  }

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) {
    sendJson(res, 500, {
      error: 'missing_google_oauth_env',
      message: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required',
    })
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
      sendJson(res, response.status, {
        error: 'google_token_refresh_failed',
        message: String(json.error_description ?? json.error ?? rawText ?? 'Google token refresh failed'),
      })
      return
    }

    const accessToken = String(json.access_token ?? '').trim()
    if (!accessToken) {
      sendJson(res, 502, { error: 'missing_access_token', message: 'Google did not return access_token' })
      return
    }

    sendJson(res, 200, {
      accessToken,
      refreshToken: String(json.refresh_token ?? refreshToken).trim(),
      expiresIn: Number(json.expires_in ?? 0) || 0,
      tokenType: String(json.token_type ?? '').trim(),
      scope: String(json.scope ?? '').trim(),
      idToken: String(json.id_token ?? '').trim(),
    })
  } catch (error) {
    sendJson(res, 500, {
      error: 'google_refresh_request_failed',
      message: String(error?.message ?? error ?? 'Unknown error'),
    })
  }
}
