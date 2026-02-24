const CBC_DATA_API_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get'
const TAIFEX_DAILY_FX_API_URL = 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates'
const FRANKFURTER_USD_API_URL = 'https://api.frankfurter.app/latest?from=USD'
const OPEN_ER_USD_API_URL = 'https://open.er-api.com/v6/latest/USD'
const CURRENCY_API_PAGES_USD_API_URL = 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
const CURRENCY_API_JSDELIVR_USD_API_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
const DEFAULT_FILE_NAME = 'BP01D01'
const REQUEST_TIMEOUT_MS = 12 * 1000
const UPSTREAM_RETRY_COUNT = 2
const SUPPORTED_FILE_NAMES = new Set([DEFAULT_FILE_NAME])

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

function normalizeFileName(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return DEFAULT_FILE_NAME
  if (!/^[A-Z0-9]{3,20}$/.test(raw)) return ''
  return raw
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
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw new Error('匯率來源逾時')
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
  throw lastError ?? new Error('匯率來源無回應')
}

function safeParseJson(text) {
  try {
    return JSON.parse(String(text ?? ''))
  } catch {
    return null
  }
}

function isLikelyCbcPayload(payload) {
  return Array.isArray(payload?.data?.dataSets) && Array.isArray(payload?.data?.structure?.Table1)
}

function isLikelyTaifexPayload(payload) {
  return Array.isArray(payload) && payload.some((item) => item && typeof item === 'object' && 'Date' in item)
}

function isLikelyFrankfurterPayload(payload) {
  return (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && String(payload.base ?? '').toUpperCase() === 'USD'
    && typeof payload.rates === 'object'
  )
}

function isLikelyOpenErPayload(payload) {
  return (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && String(payload.result ?? '').toLowerCase() === 'success'
    && String(payload.base_code ?? '').toUpperCase() === 'USD'
    && typeof payload.rates === 'object'
  )
}

function isLikelyCurrencyApiPayload(payload) {
  return (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.usd
    && typeof payload.usd === 'object'
    && !Array.isArray(payload.usd)
  )
}

async function fetchJsonPayloadWithRetry(url, sourceLabel) {
  const response = await fetchWithRetry(url)
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`${sourceLabel} HTTP ${response.status}`)
  }
  const payload = safeParseJson(bodyText)
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${sourceLabel} 回應格式錯誤`)
  }
  return payload
}

async function tryRespondWithPayload(res, source, errors) {
  try {
    const payload = await fetchJsonPayloadWithRetry(source.url, source.label)
    if (source.validator(payload)) {
      sendJson(res, 200, payload)
      return true
    }
    errors.push(source.invalidMessage)
  } catch (error) {
    errors.push(String(error?.message ?? error ?? source.failedMessage))
  }
  return false
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

  const fileName = normalizeFileName(req.query?.FileName ?? req.query?.fileName ?? req.query?.file)
  if (!fileName) {
    sendJson(res, 400, { error: 'invalid_file_name', message: 'FileName 格式錯誤' })
    return
  }
  if (!SUPPORTED_FILE_NAMES.has(fileName)) {
    sendJson(res, 400, { error: 'unsupported_file_name', message: `目前僅支援 ${DEFAULT_FILE_NAME}` })
    return
  }

  const target = new URL(CBC_DATA_API_URL)
  target.searchParams.set('FileName', fileName)
  const errors = []
  const sources = [
    {
      label: 'OpenER',
      url: OPEN_ER_USD_API_URL,
      validator: isLikelyOpenErPayload,
      invalidMessage: 'OpenER 匯率 API 回應格式錯誤',
      failedMessage: 'OpenER 匯率來源無回應',
    },
    {
      label: 'Currency API',
      url: CURRENCY_API_PAGES_USD_API_URL,
      validator: isLikelyCurrencyApiPayload,
      invalidMessage: 'Currency API 匯率回應格式錯誤',
      failedMessage: 'Currency API 匯率來源無回應',
    },
    {
      label: 'Currency API CDN',
      url: CURRENCY_API_JSDELIVR_USD_API_URL,
      validator: isLikelyCurrencyApiPayload,
      invalidMessage: 'Currency API CDN 匯率回應格式錯誤',
      failedMessage: 'Currency API CDN 匯率來源無回應',
    },
    {
      label: 'TAIFEX',
      url: TAIFEX_DAILY_FX_API_URL,
      validator: isLikelyTaifexPayload,
      invalidMessage: 'TAIFEX 匯率 API 回應格式錯誤',
      failedMessage: 'TAIFEX 匯率來源無回應',
    },
    {
      label: '央行',
      url: target.toString(),
      validator: isLikelyCbcPayload,
      invalidMessage: '央行匯率 API 回應格式錯誤',
      failedMessage: '央行匯率來源無回應',
    },
    {
      label: 'Frankfurter',
      url: FRANKFURTER_USD_API_URL,
      validator: isLikelyFrankfurterPayload,
      invalidMessage: 'Frankfurter 匯率 API 回應格式錯誤',
      failedMessage: 'Frankfurter 匯率來源無回應',
    },
  ]

  for (const source of sources) {
    const resolved = await tryRespondWithPayload(res, source, errors)
    if (resolved) return
  }

  sendJson(res, 502, {
    error: 'exchange_rate_upstream_unavailable',
    message: `匯率來源皆無法使用：${errors.join(' | ') || '未知錯誤'}`,
  })
}
