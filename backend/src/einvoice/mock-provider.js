import { randomUUID } from 'node:crypto'
import { normalizeInvoiceList } from './normalize.js'
import {
  createSessionRecord,
  deleteSessionRecord,
  getSessionRecord,
  updateSessionRecord,
} from './session-store.js'
import { formatPortalDate } from './validation.js'

function createSessionId() {
  return `pw_einv_${randomUUID().replace(/-/g, '')}`
}

function buildMockInvoices({ cardNo, startDate, endDate }) {
  const suffix = String(cardNo ?? '').slice(-4).replace(/[^A-Z0-9]/gi, '0') || '1234'
  const start = formatPortalDate(startDate)
  const end = formatPortalDate(endDate)
  return normalizeInvoiceList([
    {
      invoiceNumber: `MOCK${suffix}001`,
      amount: 120,
      invDate: end || start || '2026/06/01',
      sellerName: 'Mock 超商',
      carrierName: '手機條碼',
      invStatus: '已開立',
    },
    {
      invoiceNumber: `MOCK${suffix}002`,
      amount: 350,
      invDate: end || start || '2026/06/02',
      sellerName: 'Mock 餐廳',
      carrierName: '手機條碼',
      invStatus: '已開立',
    },
  ])
}

export async function startScrapeSession(payload = {}) {
  const sessionId = createSessionId()
  const needsCaptcha = payload.force_captcha !== false
  createSessionRecord(sessionId, {
    needsCaptcha,
    captchaToken: 'mock_captcha_token',
    cardNo: payload.cardNo ?? '',
    cardEncrypt: payload.cardEncrypt ?? '',
    metadata: { provider: 'mock' },
  })

  return {
    session_id: sessionId,
    needs_captcha: needsCaptcha,
    captcha_image_base64: needsCaptcha
      ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      : '',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }
}

export async function submitScrapeCaptcha(payload = {}) {
  const sessionId = String(payload.session_id ?? '').trim()
  const captchaCode = String(payload.captcha_code ?? '').trim()
  const record = getSessionRecord(sessionId)
  if (!record) {
    const error = new Error('session expired or not found')
    error.code = 'einvoice_session_expired'
    throw error
  }
  if (!captchaCode) {
    const error = new Error('驗證碼不可為空')
    error.code = 'einvoice_captcha_invalid'
    throw error
  }
  if (captchaCode.toLowerCase() === 'fail') {
    const error = new Error('驗證碼錯誤')
    error.code = 'einvoice_captcha_invalid'
    throw error
  }
  updateSessionRecord(sessionId, { captchaSubmitted: true, needsCaptcha: false })
  return { ok: true, session_id: sessionId }
}

export async function queryScrapeInvoices(payload = {}) {
  const sessionId = String(payload.session_id ?? '').trim()
  const record = getSessionRecord(sessionId)
  if (!record) {
    const error = new Error('session expired or not found')
    error.code = 'einvoice_session_expired'
    throw error
  }
  if (record.needsCaptcha && !record.captchaSubmitted) {
    const error = new Error('請先輸入圖形驗證碼')
    error.code = 'einvoice_captcha_required'
    throw error
  }

  try {
    const cardNo = String(payload.cardNo ?? record.cardNo ?? '').trim()
    const cardEncrypt = String(payload.cardEncrypt ?? record.cardEncrypt ?? '').trim()
    if (cardEncrypt.toLowerCase() === 'badauth') {
      const error = new Error('驗證失敗，請確認手機號碼與密碼是否正確')
      error.code = 'einvoice_auth_failed'
      throw error
    }

    updateSessionRecord(sessionId, { cardNo, cardEncrypt })
    const invoices = buildMockInvoices({
      cardNo,
      startDate: payload.startDate,
      endDate: payload.endDate,
    })

    return { invoices }
  } finally {
    deleteSessionRecord(sessionId)
  }
}

export async function cancelScrapeSession(payload = {}) {
  const sessionId = String(payload.session_id ?? '').trim()
  if (sessionId) deleteSessionRecord(sessionId)
  return { ok: true }
}
