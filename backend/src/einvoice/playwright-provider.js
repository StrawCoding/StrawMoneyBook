import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { normalizeInvoiceList } from './normalize.js'
import {
  createSessionRecord,
  deleteSessionRecord,
  getSessionRecord,
  updateSessionRecord,
} from './session-store.js'
import {
  MAX_PAGES,
  normalizeCarrierPhone,
  toRocDate,
} from './validation.js'

const PLAYWRIGHT_SESSION_TTL_MS = 5 * 60 * 1000
const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 60_000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))
const PLAYWRIGHT_BROWSERS_PATH = normalizeText(process.env.PLAYWRIGHT_BROWSERS_PATH) || '.server-data/playwright-browsers'

const DEFAULT_LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login'
const DEFAULT_QUERY_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search'
const DEFAULT_SELECTORS = {
  phone: '#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="phoneNo"], input[type="tel"], input[inputmode="tel"]',
  password: '#loginPass, #passwd, #password, input[type="password"]',
  captchaInput: '#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"], input[maxlength="4"]',
  captchaImage: '#imgVerify, img[id*="captcha"], img[src*="captcha"], img[src*="verify"], img[alt*="驗證碼"]',
  loginButton: 'button[type="submit"], input[type="submit"], #btnLogin, .btn-login',
  startDate: 'input[name="startDate"], #startDate, input[id="startDate"], input[name*="start"]',
  endDate: 'input[name="endDate"], #endDate, input[id="endDate"], input[name*="end"]',
  submitButton: 'input[type="submit"], button[type="submit"], #btnQuery, a.btn-query',
  invoiceRows: 'table tbody tr, .invoice-row, [data-invoice-number]',
  nextPage: 'a.next, .pagination a:has-text("下一頁"), a[title="下一頁"]',
  authError: '.error, .alert-danger, .msg-error, [class*="error"]',
}

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

function getLoginUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_LOGIN_URL) || DEFAULT_LOGIN_URL
}

function getQueryUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_QUERY_URL) || DEFAULT_QUERY_URL
}

function getSelectors() {
  const fromEnv = parseJsonMap(process.env.EINVOICE_SCRAPE_SELECTORS_JSON)
  return { ...DEFAULT_SELECTORS, ...fromEnv }
}

function createSessionId() {
  return `pw_einv_${randomUUID().replace(/-/g, '')}`
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        env: process.env,
        maxBuffer: PLAYWRIGHT_MAX_BUFFER_BYTES,
        timeout: PLAYWRIGHT_DEFAULT_TIMEOUT_MS,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout
          error.stderr = stderr
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
}

function getPlaywrightExecEnv() {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH,
  }
}

async function runPlaywrightCli(args = []) {
  const safeArgs = Array.isArray(args) ? args.filter((item) => String(item ?? '').length > 0) : []
  return execFileAsync('npx', ['playwright-cli', '--config', PLAYWRIGHT_CLI_CONFIG_PATH, ...safeArgs], {
    env: getPlaywrightExecEnv(),
  })
}

function extractLastJsonObject(rawOutput) {
  const lines = String(rawOutput ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    try {
      return JSON.parse(line)
    } catch {
      // continue
    }
  }
  return null
}

function normalizeRunCode(code) {
  const text = String(code ?? '').trim()
  if (!text) return 'async (page) => null'
  if (
    text.startsWith('async (')
    || text.startsWith('async(')
    || text.startsWith('(page')
    || text.startsWith('page =>')
  ) {
    return text
  }
  return `async (page) => {\n${text}\n}`
}

async function runPlaywrightJson(sessionId, code) {
  const result = await runPlaywrightCli(['--session', sessionId, 'run-code', normalizeRunCode(code)])
  return extractLastJsonObject(result.stdout)
}

async function closePlaywrightSession(sessionId) {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) return
  try {
    await runPlaywrightCli(['--session', safeSessionId, 'close'])
  } catch {
    // ignore close errors
  }
}

async function openPortalPage(sessionId, portalUrl) {
  await runPlaywrightCli(['--session', sessionId, 'open', portalUrl])
}

async function captureCaptcha(sessionId, selectors) {
  const payload = { selector: selectors.captchaImage }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
const image = await page.$(payload.selector);
if (!image) {
  return { ok: false, reason: 'captcha_not_found' };
}
await page.waitForFunction((selector) => {
  const img = document.querySelector(selector);
  return Boolean(img && img.complete && Number(img.naturalWidth) > 0);
}, payload.selector, { timeout: 10000 }).catch(() => null);
const screenshotBytes = await image.screenshot({ type: 'png' });
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let screenshot = '';
for (let index = 0; index < screenshotBytes.length; index += 3) {
  const byte1 = screenshotBytes[index];
  const byte2 = index + 1 < screenshotBytes.length ? screenshotBytes[index + 1] : 0;
  const byte3 = index + 2 < screenshotBytes.length ? screenshotBytes[index + 2] : 0;
  const chunk = (byte1 << 16) | (byte2 << 8) | byte3;
  screenshot += base64Chars[(chunk >> 18) & 63];
  screenshot += base64Chars[(chunk >> 12) & 63];
  screenshot += index + 1 < screenshotBytes.length ? base64Chars[(chunk >> 6) & 63] : '=';
  screenshot += index + 2 < screenshotBytes.length ? base64Chars[chunk & 63] : '=';
}
return { ok: true, base64: screenshot };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    return { base64: '' }
  }
  return { base64: normalizeText(response.base64) }
}

async function detectCaptchaRequired(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
const image = await page.$(selectors.captchaImage);
const input = await page.$(selectors.captchaInput);
return { needsCaptcha: Boolean(image && input) };
`
  const response = await runPlaywrightJson(sessionId, code)
  return Boolean(response?.needsCaptcha)
}

async function prepareLoginPage(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
await page.waitForLoadState('domcontentloaded');
const carrierSelectors = [
  '[data-target*="phone"]',
  '[data-carrier-type*="phone"]',
  'a[href*="mobile"]',
  'button:has-text("手機條碼")',
  'label:has-text("手機條碼")',
];
for (const selector of carrierSelectors) {
  const el = await page.$(selector);
  if (!el) continue;
  await el.click().catch(() => null);
  await page.waitForTimeout(400);
  break;
}
const phone = await page.$(selectors.phone);
const password = await page.$(selectors.password);
return { ok: Boolean(phone && password) };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response?.ok) {
    const error = new Error('官方網站版面可能已更新，請稍後再試')
    error.code = 'einvoice_portal_changed'
    throw error
  }
}

async function fillLoginForm(sessionId, selectors, values) {
  const payload = { selectors, values }
  const code = `
const payload = ${JSON.stringify(payload)};
function setValue(el, value) {
  if (!el) return;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const phoneEl = await page.$(payload.selectors.phone);
const passEl = await page.$(payload.selectors.password);
if (!phoneEl || !passEl) {
  return { ok: false, reason: 'portal_changed', missing: !phoneEl ? 'phone' : 'password' };
}
setValue(phoneEl, payload.values.phone);
setValue(passEl, payload.values.password);
if (payload.values.captchaCode && payload.selectors.captchaInput) {
  const captchaInput = await page.$(payload.selectors.captchaInput);
  if (captchaInput) setValue(captchaInput, payload.values.captchaCode);
}
return { ok: true };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = new Error('官方網站版面可能已更新，請稍後再試')
    error.code = response?.reason === 'portal_changed' ? 'einvoice_portal_changed' : 'einvoice_scrape_failed'
    throw error
  }
}

async function submitLoginForm(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
const button = await page.$(selectors.loginButton);
if (!button) {
  return { ok: false, reason: 'portal_changed' };
}
await button.click();
await page.waitForTimeout(2200);
const authError = await page.$(selectors.authError);
const authText = authError ? (await authError.innerText()).trim() : '';
return { ok: true, authText, url: page.url() };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = new Error('官方網站版面可能已更新，請稍後再試')
    error.code = 'einvoice_portal_changed'
    throw error
  }
  const authText = normalizeText(response.authText)
  const currentUrl = normalizeText(response.url)
  if (/驗證碼|图形|圖形|captcha/i.test(authText)) {
    const error = new Error('驗證碼錯誤')
    error.code = 'einvoice_captcha_invalid'
    throw error
  }
  if (/驗證失敗|密碼|登入失敗|auth/i.test(authText) || /accounts\/login/i.test(currentUrl)) {
    const error = new Error('驗證失敗，請確認手機號碼與密碼是否正確')
    error.code = 'einvoice_auth_failed'
    throw error
  }
}

async function fillQueryForm(sessionId, selectors, values) {
  const payload = { selectors, values }
  const code = `
const payload = ${JSON.stringify(payload)};
function setValue(el, value) {
  if (!el) return;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const startEl = await page.$(payload.selectors.startDate);
const endEl = await page.$(payload.selectors.endDate);
if (!startEl || !endEl) {
  return { ok: false, reason: 'portal_changed', missing: !startEl ? 'startDate' : 'endDate' };
}
setValue(startEl, payload.values.startDate);
setValue(endEl, payload.values.endDate);
return { ok: true };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = new Error('官方網站版面可能已更新，請稍後再試')
    error.code = response?.reason === 'portal_changed' ? 'einvoice_portal_changed' : 'einvoice_scrape_failed'
    throw error
  }
}

async function submitQueryForm(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
const button = await page.$(selectors.submitButton);
if (!button) {
  return { ok: false, reason: 'portal_changed' };
}
await button.click();
await page.waitForTimeout(1800);
return { ok: true, url: page.url() };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = new Error('官方網站版面可能已更新，請稍後再試')
    error.code = 'einvoice_portal_changed'
    throw error
  }
}

async function extractInvoicesFromPage(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
const rows = await page.$$(selectors.invoiceRows);
const invoices = [];
for (const row of rows) {
  const text = (await row.innerText()).replace(/\\s+/g, ' ').trim();
  if (!text) continue;
  const numberMatch = text.match(/[A-Z]{2}[0-9]{8}/);
  const amountMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\\s*元?/);
  const dateMatch = text.match(/(20\\d{2})[\\/-](\\d{1,2})[\\/-](\\d{1,2})/);
  if (!numberMatch) continue;
  invoices.push({
    invoiceNumber: numberMatch[0],
    amount: amountMatch ? amountMatch[1].replace(/,/g, '') : '0',
    invDate: dateMatch ? dateMatch[1] + '/' + dateMatch[2].padStart(2, '0') + '/' + dateMatch[3].padStart(2, '0') : '',
    sellerName: text.split(' ').slice(0, 2).join(' ').trim(),
    carrierName: '手機條碼',
  });
}
const next = await page.$(selectors.nextPage);
return { invoices, hasNext: Boolean(next) };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || !Array.isArray(response.invoices)) {
    const error = new Error('無法解析發票列表，官方網站版面可能已更新')
    error.code = 'einvoice_portal_changed'
    throw error
  }
  return {
    invoices: response.invoices,
    hasNext: Boolean(response.hasNext),
  }
}

async function clickNextPage(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
const next = await page.$(selectors.nextPage);
if (!next) return { ok: false };
await next.click();
await page.waitForTimeout(1200);
return { ok: true };
`
  const response = await runPlaywrightJson(sessionId, code)
  return Boolean(response?.ok)
}

export async function startScrapeSession(payload = {}) {
  const sessionId = normalizeText(payload.session_id) || createSessionId()
  const loginUrl = getLoginUrl()
  const selectors = getSelectors()
  const refreshCaptcha = Boolean(payload.refresh_captcha)

  if (!refreshCaptcha || !normalizeText(payload.session_id)) {
    await openPortalPage(sessionId, loginUrl)
    await prepareLoginPage(sessionId, selectors)
  }

  const needsCaptcha = await detectCaptchaRequired(sessionId, selectors)
  const captcha = needsCaptcha ? await captureCaptcha(sessionId, selectors) : { base64: '' }

  createSessionRecord(sessionId, {
    needsCaptcha,
    cardNo: normalizeCarrierPhone(payload.cardNo ?? ''),
    cardEncrypt: payload.cardEncrypt ?? '',
    metadata: { provider: 'playwright', loginUrl },
  })

  return {
    session_id: sessionId,
    needs_captcha: needsCaptcha,
    captcha_image_base64: captcha.base64,
    expires_at: new Date(Date.now() + PLAYWRIGHT_SESSION_TTL_MS).toISOString(),
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

  const selectors = getSelectors()
  const code = `
const payload = ${JSON.stringify({ selector: selectors.captchaInput, value: captchaCode })};
const input = await page.$(payload.selector);
if (!input) return { ok: false, reason: 'portal_changed' };
input.focus();
input.value = payload.value;
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
return { ok: true };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = new Error('驗證碼欄位不存在，官方網站版面可能已更新')
    error.code = 'einvoice_portal_changed'
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

  const selectors = getSelectors()
  const phone = normalizeCarrierPhone(payload.cardNo ?? record.cardNo ?? '')
  const password = String(payload.cardEncrypt ?? record.cardEncrypt ?? '').trim()
  const startDate = toRocDate(payload.startDate)
  const endDate = toRocDate(payload.endDate)
  const queryUrl = getQueryUrl()

  try {
    await fillLoginForm(sessionId, selectors, {
      phone,
      password,
      captchaCode: String(payload.captcha_code ?? ''),
    })
    await submitLoginForm(sessionId, selectors)

    await runPlaywrightCli(['--session', sessionId, 'open', queryUrl])
    await pageWaitForQueryForm(sessionId, selectors)
    await fillQueryForm(sessionId, selectors, { startDate, endDate })
    await submitQueryForm(sessionId, selectors)

    const allInvoices = []
    let page = 1
    while (page <= MAX_PAGES) {
      const { invoices, hasNext } = await extractInvoicesFromPage(sessionId, selectors)
      allInvoices.push(...invoices)
      if (!hasNext || page >= MAX_PAGES) break
      const moved = await clickNextPage(sessionId, selectors)
      if (!moved) break
      page += 1
    }

    if (page >= MAX_PAGES) {
      const error = new Error('查詢結果過多，請縮小日期範圍後再試')
      error.code = 'einvoice_result_too_large'
      error.totalPages = page
      error.maxPages = MAX_PAGES
      throw error
    }

    updateSessionRecord(sessionId, { cardNo: phone, cardEncrypt: password })
    return { invoices: normalizeInvoiceList(allInvoices) }
  } finally {
    await closePlaywrightSession(sessionId)
    deleteSessionRecord(sessionId)
  }
}

async function pageWaitForQueryForm(sessionId, selectors) {
  const code = `
const selectors = ${JSON.stringify(selectors)};
await page.waitForLoadState('domcontentloaded');
const startEl = await page.$(selectors.startDate);
const endEl = await page.$(selectors.endDate);
return { ok: Boolean(startEl && endEl) };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response?.ok) {
    const error = new Error('找不到發票查詢表單，官方網站版面可能已更新')
    error.code = 'einvoice_portal_changed'
    throw error
  }
}

export async function cancelScrapeSession(payload = {}) {
  const sessionId = String(payload.session_id ?? '').trim()
  if (sessionId) {
    await closePlaywrightSession(sessionId)
    deleteSessionRecord(sessionId)
  }
  return { ok: true }
}
