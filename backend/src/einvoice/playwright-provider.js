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
import { formatPortalDate, MAX_PAGES } from './validation.js'

const PLAYWRIGHT_SESSION_TTL_MS = 5 * 60 * 1000
const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 60_000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))

const DEFAULT_PORTAL_URL = 'https://www.einvoice.nat.gov.tw/APMEMBERVAN/GeneralCarrier/generalCarrier!queryInvoice'
const DEFAULT_SELECTORS = {
  cardNo: '#barcode, input[name="barcode"], input[id="barcode"]',
  cardEncrypt: '#verifyCode, input[name="verifyCode"], input[id="verifyCode"]',
  captchaInput: '#captcha, input[name="captcha"], input[id="captcha"]',
  captchaImage: '#imgVerify, img[id*="verify"], img[id*="captcha"], img[src*="verify"]',
  startDate: 'input[name="startDate"], #startDate, input[id="startDate"]',
  endDate: 'input[name="endDate"], #endDate, input[id="endDate"]',
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

function getPortalUrl() {
  return normalizeText(process.env.EINVOICE_PORTAL_LOGIN_URL) || DEFAULT_PORTAL_URL
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

async function runPlaywrightCli(args = []) {
  const safeArgs = Array.isArray(args) ? args.filter((item) => String(item ?? '').length > 0) : []
  return execFileAsync('npx', ['--yes', '--package', '@playwright/cli', 'playwright-cli', '--config', PLAYWRIGHT_CLI_CONFIG_PATH, ...safeArgs])
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

async function captureCaptcha(sessionId, selectors, refreshCaptcha = false) {
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

async function fillQueryForm(sessionId, selectors, values) {
  const payload = { selectors, values }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
const required = [
  ['cardNo', payload.selectors.cardNo],
  ['cardEncrypt', payload.selectors.cardEncrypt],
  ['startDate', payload.selectors.startDate],
  ['endDate', payload.selectors.endDate],
];
for (const [key, selector] of required) {
  const el = await page.$(selector);
  if (!el) {
    return { ok: false, reason: 'portal_changed', missing: key };
  }
}
await page.fill(payload.selectors.cardNo, payload.values.cardNo);
await page.fill(payload.selectors.cardEncrypt, payload.values.cardEncrypt);
if (payload.values.captchaCode && payload.selectors.captchaInput) {
  const captchaInput = await page.$(payload.selectors.captchaInput);
  if (captchaInput) await page.fill(payload.selectors.captchaInput, payload.values.captchaCode);
}
await page.fill(payload.selectors.startDate, payload.values.startDate);
await page.fill(payload.selectors.endDate, payload.values.endDate);
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
  if (/驗證碼|图形|圖形|captcha/i.test(authText)) {
    const error = new Error('驗證碼錯誤')
    error.code = 'einvoice_captcha_invalid'
    throw error
  }
  if (/驗證失敗|密碼|查詢碼|條碼|登入失敗|auth/i.test(authText)) {
    const error = new Error('驗證失敗，請確認手機條碼與查詢碼是否正確')
    error.code = 'einvoice_auth_failed'
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
  const portalUrl = getPortalUrl()
  const selectors = getSelectors()
  const refreshCaptcha = Boolean(payload.refresh_captcha)

  if (!refreshCaptcha || !normalizeText(payload.session_id)) {
    await openPortalPage(sessionId, portalUrl)
  }

  const needsCaptcha = await detectCaptchaRequired(sessionId, selectors)
  const captcha = needsCaptcha ? await captureCaptcha(sessionId, selectors, refreshCaptcha) : { base64: '' }

  createSessionRecord(sessionId, {
    needsCaptcha,
    cardNo: payload.cardNo ?? '',
    cardEncrypt: payload.cardEncrypt ?? '',
    metadata: { provider: 'playwright', portalUrl },
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
await page.fill(payload.selector, payload.value);
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
  const cardNo = String(payload.cardNo ?? record.cardNo ?? '').trim()
  const cardEncrypt = String(payload.cardEncrypt ?? record.cardEncrypt ?? '').trim()
  const startDate = formatPortalDate(payload.startDate)
  const endDate = formatPortalDate(payload.endDate)

  try {
    await fillQueryForm(sessionId, selectors, {
      cardNo,
      cardEncrypt,
      captchaCode: String(payload.captcha_code ?? ''),
      startDate,
      endDate,
    })
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

    updateSessionRecord(sessionId, { cardNo, cardEncrypt })
    return { invoices: normalizeInvoiceList(allInvoices) }
  } finally {
    await closePlaywrightSession(sessionId)
    deleteSessionRecord(sessionId)
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
