const CBC_DATA_API_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get'
const TAIFEX_DAILY_FX_API_URL = 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates'
const FRANKFURTER_USD_API_URL = 'https://api.frankfurter.app/latest?from=USD'
const OPEN_ER_USD_API_URL = 'https://open.er-api.com/v6/latest/USD'
const DEFAULT_FILE_NAME = 'BP01D01'
const REQUEST_TIMEOUT_MS = 22 * 1000
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

  try {
    const cbcPayload = await fetchJsonPayloadWithRetry(target.toString(), '央行')
    if (isLikelyCbcPayload(cbcPayload)) {
      sendJson(res, 200, cbcPayload)
      return
    }
    errors.push('央行匯率 API 回應格式錯誤')
  } catch (error) {
    errors.push(String(error?.message ?? error ?? '央行匯率來源無回應'))
  }

  try {
    const taifexPayload = await fetchJsonPayloadWithRetry(TAIFEX_DAILY_FX_API_URL, 'TAIFEX')
    if (isLikelyTaifexPayload(taifexPayload)) {
      sendJson(res, 200, taifexPayload)
      return
    }
    errors.push('TAIFEX 匯率 API 回應格式錯誤')
  } catch (error) {
    errors.push(String(error?.message ?? error ?? 'TAIFEX 匯率來源無回應'))
  }

  try {
    const frankfurterPayload = await fetchJsonPayloadWithRetry(FRANKFURTER_USD_API_URL, 'Frankfurter')
    if (isLikelyFrankfurterPayload(frankfurterPayload)) {
      sendJson(res, 200, frankfurterPayload)
      return
    }
    errors.push('Frankfurter 匯率 API 回應格式錯誤')
  } catch (error) {
    errors.push(String(error?.message ?? error ?? 'Frankfurter 匯率來源無回應'))
  }

  try {
    const openErPayload = await fetchJsonPayloadWithRetry(OPEN_ER_USD_API_URL, 'OpenER')
    if (isLikelyOpenErPayload(openErPayload)) {
      sendJson(res, 200, openErPayload)
      return
    }
    errors.push('OpenER 匯率 API 回應格式錯誤')
  } catch (error) {
    errors.push(String(error?.message ?? error ?? 'OpenER 匯率來源無回應'))
  }

  sendJson(res, 502, {
    error: 'exchange_rate_upstream_unavailable',
    message: `央行、TAIFEX 與第三方匯率來源皆無法使用：${errors.join(' | ') || '未知錯誤'}`,
  })
}
