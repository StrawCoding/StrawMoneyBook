const TAIFEX_DAILY_FOREX_URL = 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates'
const REQUEST_TIMEOUT_MS = 22 * 1000
const UPSTREAM_RETRY_COUNT = 2

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timeoutId = 0
  if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
  }

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw new Error('Taifex 匯率來源逾時')
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function waitFor(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

async function fetchWithRetry(url) {
  let lastError = null
  for (let attempt = 1; attempt <= UPSTREAM_RETRY_COUNT; attempt += 1) {
    try {
      return await fetchWithTimeout(url, REQUEST_TIMEOUT_MS)
    } catch (error) {
      lastError = error
      if (attempt < UPSTREAM_RETRY_COUNT) {
        await waitFor(350 * attempt)
      }
    }
  }
  throw lastError ?? new Error('Taifex 匯率來源無回應')
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Method not allowed' })
    return
  }

  try {
    const upstream = await fetchWithRetry(TAIFEX_DAILY_FOREX_URL)
    const bodyText = await upstream.text()
    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: 'taifex_upstream_http_error',
        message: `Taifex 匯率 API 錯誤：HTTP ${upstream.status}`,
      })
      return
    }

    let payload = null
    try {
      payload = JSON.parse(bodyText)
    } catch {
      payload = null
    }

    if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
      sendJson(res, 502, {
        error: 'taifex_upstream_invalid_payload',
        message: 'Taifex 匯率 API 回應格式錯誤',
      })
      return
    }

    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 500, {
      error: 'taifex_proxy_fetch_failed',
      message: String(error?.message ?? error ?? 'Unknown error'),
    })
  }
}
