const CBC_DATA_API_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get'
const DEFAULT_FILE_NAME = 'BP01D01'
const REQUEST_TIMEOUT_MS = 15 * 1000
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
      throw new Error('央行匯率來源逾時')
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

  try {
    const upstream = await fetchWithTimeout(target.toString(), REQUEST_TIMEOUT_MS)
    const bodyText = await upstream.text()
    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: 'cbc_upstream_http_error',
        message: `央行匯率 API 錯誤：HTTP ${upstream.status}`,
      })
      return
    }

    let payload = null
    try {
      payload = JSON.parse(bodyText)
    } catch {
      payload = null
    }
    if (!payload || typeof payload !== 'object') {
      sendJson(res, 502, {
        error: 'cbc_upstream_invalid_payload',
        message: '央行匯率 API 回應格式錯誤',
      })
      return
    }

    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 500, {
      error: 'cbc_proxy_fetch_failed',
      message: String(error?.message ?? error ?? 'Unknown error'),
    })
  }
}
