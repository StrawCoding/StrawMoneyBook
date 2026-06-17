import * as mockProvider from './mock-provider.js'
import * as playwrightProvider from './playwright-provider.js'

function useMockProvider() {
  const flag = String(process.env.EINVOICE_SCRAPE_MOCK ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true
  const playwrightFlag = String(process.env.EINVOICE_SCRAPE_USE_PLAYWRIGHT ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(playwrightFlag)) return false
  if (process.env.NODE_ENV === 'test') return true
  return false
}

function getProvider() {
  return useMockProvider() ? mockProvider : playwrightProvider
}

export function startScrapeSession(payload = {}) {
  return getProvider().startScrapeSession(payload)
}

export function submitScrapeCaptcha(payload = {}) {
  return getProvider().submitScrapeCaptcha(payload)
}

export function queryScrapeInvoices(payload = {}) {
  return getProvider().queryScrapeInvoices(payload)
}

export function cancelScrapeSession(payload = {}) {
  return getProvider().cancelScrapeSession(payload)
}

export async function queryInvoicesWithScrapeFlow(payload = {}) {
  const start = await startScrapeSession({
    cardNo: payload.cardNo,
    cardEncrypt: payload.cardEncrypt,
    force_captcha: payload.force_captcha,
  })

  if (start.needs_captcha) {
    const error = new Error('請先輸入圖形驗證碼')
    error.code = 'einvoice_captcha_required'
    error.sessionId = start.session_id
    error.captchaImageBase64 = start.captcha_image_base64
    throw error
  }

  const result = await queryScrapeInvoices({
    session_id: start.session_id,
    cardNo: payload.cardNo,
    cardEncrypt: payload.cardEncrypt,
    startDate: payload.startDate,
    endDate: payload.endDate,
  })
  return result.invoices
}
