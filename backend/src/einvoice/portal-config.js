function normalizeText(value) {
  return String(value ?? '').trim()
}

function parseJsonMap(raw) {
  const text = normalizeText(raw)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const DEFAULT_LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login/mw'
export const DEFAULT_QUERY_URL = 'https://www.einvoice.nat.gov.tw/'
export const DEFAULT_CAPTCHA_API_URL = 'https://service-mc.einvoice.nat.gov.tw/act/login/api/act002i/captcha'
export const DEFAULT_QUERY_API_PATTERN = '(service-m[c]?\\.einvoice\\.nat\\.gov\\.tw/.*/api/|/ptl/portal/api/).*(query|list|invoice|btc)'
export const DEFAULT_SELECTORS = {
  phone: '#mobile_phone',
  password: '#password',
  captchaInput: '#captcha',
  loginButton: '#submitBtn',
  carrierTab: 'button:has-text("手機條碼"), [role="tab"]:has-text("手機條碼"), label:has-text("手機條碼")',
  startDate: 'input[name="startDate"], #startDate, input[id="startDate"], input[placeholder*="起"], input[name*="start"]',
  endDate: 'input[name="endDate"], #endDate, input[id="endDate"], input[placeholder*="迄"], input[name*="end"]',
  submitButton: 'button[type="submit"]:has-text("查詢"), #btnQuery, button:has-text("查詢"), input[type="submit"]',
  queryNavLink: 'a:has-text("手機條碼發票查詢"), button:has-text("手機條碼發票查詢"), [href*="btc"]',
  invoiceRows: 'table tbody tr, .invoice-row, [data-invoice-number]',
  nextPage: 'a.next, .pagination a:has-text("下一頁"), button:has-text("下一頁"), a[title="下一頁"]',
  authError: '.error, .alert-danger, .msg-error, [class*="error"], [role="alert"]',
}

export function getLoginUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_LOGIN_URL) || DEFAULT_LOGIN_URL
}

export function getQueryUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_QUERY_URL) || DEFAULT_QUERY_URL
}

export function getCaptchaApiUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_CAPTCHA_API_URL) || DEFAULT_CAPTCHA_API_URL
}

export function getQueryApiPattern() {
  const raw = normalizeText(process.env.EINVOICE_PORTAL_QUERY_API_PATTERN) || DEFAULT_QUERY_API_PATTERN
  return new RegExp(raw, 'i')
}

export function getCaptchaTokenField() {
  return normalizeText(process.env.EINVOICE_PORTAL_CAPTCHA_TOKEN_FIELD) || 'token'
}

export function getSelectors() {
  const fromEnv = parseJsonMap(process.env.EINVOICE_SCRAPE_SELECTORS_JSON)
  return { ...DEFAULT_SELECTORS, ...fromEnv }
}
