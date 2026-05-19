import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { methodGuard, normalizePath, parseBody, sendJson } from '../collab/http.js'

const EINVOICE_APP_ID = String(process.env.EINVOICE_APP_ID ?? '').trim()
const EINVOICE_API_KEY = String(process.env.EINVOICE_API_KEY ?? '').trim()
const EINVOICE_CLIENT_SHARED_KEY = String(process.env.EINVOICE_CLIENT_SHARED_KEY ?? '').trim()
const EINVOICE_API_URL = 'https://api.einvoice.nat.gov.tw/PB2CAPIVAN/invServ/InvServ'
const EINVOICE_API_TIMEOUT_MS = 30_000
const MAX_PAGES = 20
const MAX_QUERY_DAYS = 62

function buildSerial() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${rand}`
}

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function isClientAuthorized(req) {
  if (!EINVOICE_CLIENT_SHARED_KEY) return false
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return secureEquals(provided, EINVOICE_CLIENT_SHARED_KEY)
}

function signRequest(appID, apiKey, timeStamp, uuid) {
  const content = `${appID}&${timeStamp}&${uuid}`
  return createHmac('sha1', apiKey).update(content).digest('base64')
}

function formatApiDate(dateStr) {
  return String(dateStr ?? '').replace(/-/g, '/')
}

function parseInputDate(dateStr) {
  const raw = String(dateStr ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (!Number.isFinite(date.getTime())) return null
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function parseInvoiceDate(dateStr) {
  const parts = String(dateStr ?? '').split('/')
  if (parts.length !== 3) return 0
  const d = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T00:00:00+08:00`)
  return Number.isFinite(d.getTime()) ? d.getTime() : 0
}

function validateQueryInput({ cardNo, cardEncrypt, startDate, endDate }) {
  if (!cardNo || !cardEncrypt || !startDate || !endDate) {
    return { error: 'missing_params', message: '缺少必要參數（cardNo、cardEncrypt、startDate、endDate）' }
  }

  if (!/^\/[A-Za-z0-9+.\-]{7}$/.test(cardNo)) {
    return { error: 'invalid_card_no', message: '手機條碼格式錯誤，應為 / 開頭接 7 位英數字或 + . - 符號（如 /ABC1234）' }
  }

  if (!/^[A-Za-z0-9!#$%&()*+,.\-/:;<=>?@[\]^_`{|}~]{4,32}$/.test(cardEncrypt)) {
    return { error: 'invalid_card_encrypt', message: '手機條碼驗證碼格式錯誤，請確認長度與內容後再試' }
  }

  const from = parseInputDate(startDate)
  const to = parseInputDate(endDate)
  if (!from || !to) {
    return { error: 'invalid_date', message: '日期格式錯誤，請使用 YYYY-MM-DD' }
  }
  if (to.getTime() < from.getTime()) {
    return { error: 'invalid_date_range', message: '結束日期不可早於開始日期' }
  }
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (days > MAX_QUERY_DAYS) {
    return { error: 'date_range_too_large', message: `單次查詢最多 ${MAX_QUERY_DAYS} 天，請縮小日期範圍` }
  }

  return null
}

function normalizeInvoice(item) {
  return {
    invoiceNumber: String(item.invNum ?? '').trim(),
    amount: Math.round(Number(String(item.amount ?? '0').replace(/,/g, '')) || 0),
    invoiceDate: parseInvoiceDate(String(item.invDate ?? '')),
    merchantName: String(item.sellerName ?? '').trim() || null,
    carrierName: '手機條碼',
    invStatus: String(item.invStatus ?? '').trim(),
  }
}

async function fetchInvoicesPage(appID, apiKey, { cardNo, cardEncrypt, startDate, endDate, onlyWinningInv, page }) {
  const timeStamp = Math.floor(Date.now() / 1000)
  const uuid = randomUUID()
  const serial = buildSerial()
  const generate = signRequest(appID, apiKey, String(timeStamp), uuid)

  const params = new URLSearchParams({
    action: 'carrierInvChk',
    version: '0.5',
    serial,
    appID,
    APIKey: apiKey,
    timeStamp: String(timeStamp),
    uuid,
    cardType: '3J0002',
    cardNo,
    cardEncrypt,
    startDate: formatApiDate(startDate),
    endDate: formatApiDate(endDate),
    onlyWinningInv,
    Generate: generate,
    p: String(page),
    numPerPage: '20',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EINVOICE_API_TIMEOUT_MS)
  try {
    const response = await fetch(EINVOICE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export default async function einvoiceHandler(req, res) {
  if (methodGuard(req, res, ['POST'])) return

  const pathname = normalizePath(req, '/api/einvoice')
  if (pathname !== '/query-invoices') {
    sendJson(res, 404, { error: 'not_found', message: 'route not found' })
    return
  }

  if (!EINVOICE_APP_ID || !EINVOICE_API_KEY || !EINVOICE_CLIENT_SHARED_KEY) {
    sendJson(res, 503, {
      error: 'einvoice_not_configured',
      message: '電子發票 API 尚未設定（缺少 EINVOICE_APP_ID / EINVOICE_API_KEY / EINVOICE_CLIENT_SHARED_KEY）',
    })
    return
  }

  if (!isClientAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized_client', message: 'missing or invalid x-straw-client-key' })
    return
  }

  try {
    const body = parseBody(req)
    const cardNo = String(body.cardNo ?? '').trim()
    const cardEncrypt = String(body.cardEncrypt ?? '').trim()
    const startDate = String(body.startDate ?? '').trim()
    const endDate = String(body.endDate ?? '').trim()
    const onlyWinningInv = body.onlyWinningInv === 'Y' ? 'Y' : 'N'

    const validationError = validateQueryInput({ cardNo, cardEncrypt, startDate, endDate })
    if (validationError) {
      sendJson(res, 400, validationError)
      return
    }

    const invoices = []
    let page = 1

    while (page <= MAX_PAGES) {
      const data = await fetchInvoicesPage(EINVOICE_APP_ID, EINVOICE_API_KEY, {
        cardNo, cardEncrypt, startDate, endDate, onlyWinningInv, page,
      })

      const code = String(data?.code ?? '').trim()
      if (code !== '200') {
        const knownAuthCodes = new Set(['C001', '401', 'C004'])
        if (knownAuthCodes.has(code)) {
          sendJson(res, 401, {
            error: 'einvoice_auth_failed',
            message: '驗證失敗，請確認手機條碼與查詢碼是否正確',
          })
          return
        }
        sendJson(res, 400, {
          error: 'einvoice_api_error',
          message: `電子發票 API 回傳錯誤（code=${code}）：${String(data?.msg ?? '')}`.trim(),
        })
        return
      }

      const details = Array.isArray(data.details) ? data.details : []
      for (const item of details) {
        invoices.push(normalizeInvoice(item))
      }

      const totalPages = Math.max(1, Number(data.v2InvPageCnt ?? 1) || 1)
      if (totalPages > MAX_PAGES) {
        sendJson(res, 413, {
          error: 'einvoice_result_too_large',
          message: '查詢結果過多，請縮小日期範圍後再試',
          totalPages,
          maxPages: MAX_PAGES,
        })
        return
      }
      if (page >= totalPages) break
      page++
    }

    sendJson(res, 200, { invoices })
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 504, {
        error: 'einvoice_api_timeout',
        message: '電子發票 API 查詢逾時（30 秒），請稍後再試',
      })
      return
    }
    sendJson(res, 500, {
      error: 'einvoice_query_failed',
      message: `發票查詢失敗：${String(error?.message ?? error) || '未知錯誤'}`,
    })
  }
}
