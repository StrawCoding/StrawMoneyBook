import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  INVOICE_CARRIER_PROVIDER_ID,
  createInvoiceCarrierError,
  formatInvoiceDateRangeLabel,
  normalizeCarrierOptions,
  normalizeText,
  parseInvoiceDateText,
} from '../../src/services/invoice-carrier/shared.js'
import { simpleHash } from '../bank/_utils.js'

const PLAYWRIGHT_SESSION_TTL_MS = 5 * 60 * 1000
const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 90 * 1000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))

const EINVOICE_LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login'
const EINVOICE_SEARCH_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search'
const EINVOICE_DETAIL_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail'

const invoiceCarrierSessions = globalThis.__invoiceCarrierPlaywrightSessions
  ?? new Map()
globalThis.__invoiceCarrierPlaywrightSessions = invoiceCarrierSessions

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
      // continue scanning upward
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
  try {
    const result = await runPlaywrightCli(['--session', sessionId, 'run-code', normalizeRunCode(code)])
    return extractLastJsonObject(result.stdout)
  } catch (error) {
    if (String(error?.stderr ?? '').includes('No browser session')) {
      throw createInvoiceCarrierError('invoice_carrier_session_expired', '電子發票驗證視窗已失效，請重新啟動')
    }
    throw error
  }
}

function cleanupExpiredSessions() {
  const now = Date.now()
  for (const [sessionId, meta] of invoiceCarrierSessions.entries()) {
    if (Number(meta?.expiresAtMs ?? 0) > now) continue
    invoiceCarrierSessions.delete(sessionId)
    void closePlaywrightSession(sessionId)
  }
}

function registerSession(sessionId, patch = {}) {
  const now = Date.now()
  const next = {
    sessionId,
    createdAtMs: now,
    updatedAtMs: now,
    expiresAtMs: now + PLAYWRIGHT_SESSION_TTL_MS,
    ...patch,
  }
  invoiceCarrierSessions.set(sessionId, next)
  return next
}

function touchSession(sessionId, patch = {}) {
  const current = invoiceCarrierSessions.get(sessionId)
  return registerSession(sessionId, {
    ...(current ?? {}),
    updatedAtMs: Date.now(),
    ...patch,
  })
}

function requireSession(sessionId) {
  cleanupExpiredSessions()
  const normalizedSessionId = normalizeText(sessionId)
  const meta = invoiceCarrierSessions.get(normalizedSessionId)
  if (!normalizedSessionId || !meta) {
    throw createInvoiceCarrierError('invoice_carrier_session_expired', '電子發票驗證視窗已失效，請重新啟動')
  }
  touchSession(normalizedSessionId)
  return normalizedSessionId
}

function createSessionId() {
  return `pw_einv_${randomUUID().replace(/-/g, '')}`
}

function createProviderConnectionId(mobilePhone) {
  return `einv_provider_${simpleHash(`${INVOICE_CARRIER_PROVIDER_ID}:${normalizeText(mobilePhone)}`)}`
}

async function closePlaywrightSession(sessionId) {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) return
  invoiceCarrierSessions.delete(safeSessionId)
  try {
    await runPlaywrightCli(['--session', safeSessionId, 'close'])
  } catch {
    // Ignore close errors to avoid masking the primary flow result.
  }
}

async function openPlaywrightPage(sessionId, url, { headed = false } = {}) {
  const args = ['--session', sessionId, 'open', url]
  if (headed) {
    args.push('--headed')
  }
  await runPlaywrightCli(args)
}

async function captureCaptcha(sessionId, refreshCaptcha = false) {
  const payload = {
    selector: '.code_num img, .input-group-text.code_num img, img[alt="圖形驗證碼"]',
    refreshSelector: 'button[title="更新圖形驗證碼"], button[aria-label="更新圖形驗證碼"]',
    refreshCaptcha,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded').catch(() => null);
if (payload.refreshCaptcha) {
  const refreshButton = document.querySelector(payload.refreshSelector);
  if (refreshButton) {
    refreshButton.click();
    await page.waitForTimeout(800);
  }
}
const image = await page.$(payload.selector);
if (!image) {
  return { ok: false, reason: 'captcha_image_not_found' };
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
return {
  ok: true,
  dataUrl: 'data:image/png;base64,' + screenshot,
};
`

  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    return {
      dataUrl: '',
      error: response?.reason || 'captcha_capture_failed',
    }
  }

  return {
    dataUrl: normalizeText(response.dataUrl),
    error: null,
  }
}

async function recognizeCaptcha(captchaImageBase64) {
  if (!String(captchaImageBase64 ?? '').length) return null

  try {
    const Tesseract = (await import('tesseract.js')).default

    const worker = await Tesseract.createWorker('eng')
    const result = await worker.recognize(Buffer.from(captchaImageBase64, 'base64'))
    await worker.terminate()

    const recognized = result.data.text.trim().replace(/\D/g, '')
    const confidence = result.data.confidence || 0

    if (confidence >= 70 && recognized.length > 0) {
      return {
        code: recognized,
        confidence,
      }
    }
    return null
  } catch {
    return null
  }
}

async function inspectSession(sessionId, { includeCaptcha = false, refreshCaptcha = false } = {}) {
  const payload = {
    loginUrl: EINVOICE_LOGIN_URL,
    searchUrl: EINVOICE_SEARCH_URL,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded').catch(() => null);
await page.waitForTimeout(400);
const title = await page.title().catch(() => '');
const bodyText = String(document.body?.innerText ?? '').replace(/\\s+/g, ' ').trim();
const cloudflareBlocked =
  title.includes('Just a moment')
  || bodyText.includes('Performing security verification')
  || bodyText.includes('security service')
  || Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"], [data-ray], [name="cf-turnstile-response"]'));
const loginFormReady = Boolean(document.querySelector('#mobile_phone') && document.querySelector('#password') && document.querySelector('#captcha'));
const searchFormReady = Boolean(document.querySelector('#carrier') && (document.querySelector('button[title="查詢"]') || document.querySelector('button[aria-label="查詢"]')));
const availableCarriers = Array.from(document.querySelectorAll('#carrier option'))
  .map((option) => ({
    value: String(option.value ?? '').trim(),
    label: String(option.textContent ?? '').trim(),
  }))
  .filter((option) => option.value && option.label);
const errorMessage = Array.from(document.querySelectorAll('.error, .invalid-feedback, .alert, [role="alert"], .text-danger'))
  .map((node) => String(node.textContent ?? '').replace(/\\s+/g, ' ').trim())
  .find(Boolean) || '';
return {
  ok: true,
  url: page.url(),
  title,
  bodyText,
  cloudflare_blocked: cloudflareBlocked,
  login_form_ready: loginFormReady,
  search_form_ready: searchFormReady,
  available_carriers: availableCarriers,
  error_message: errorMessage,
};
`

  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    throw createInvoiceCarrierError('invoice_carrier_session_inspect_failed', '無法讀取電子發票頁面狀態')
  }

  const status = {
    session_id: sessionId,
    url: normalizeText(response.url),
    title: normalizeText(response.title),
    cloudflare_blocked: Boolean(response.cloudflare_blocked),
    login_form_ready: Boolean(response.login_form_ready),
    search_form_ready: Boolean(response.search_form_ready),
    logged_in: Boolean(response.search_form_ready),
    available_carriers: normalizeCarrierOptions(response.available_carriers),
    error_message: normalizeText(response.error_message),
  }

  if (includeCaptcha && status.login_form_ready) {
    const captchaResult = await captureCaptcha(sessionId, refreshCaptcha)
    const ocrResult = captchaResult.error
      ? null
      : await recognizeCaptcha(captchaResult.dataUrl?.replace(/^data:image\/png;base64,/, '') || '')
    status.captcha_image = captchaResult.dataUrl
    status.captcha_auto_filled = ocrResult?.code || null
    status.captcha_confidence = ocrResult?.confidence || 0
  }

  return status
}

async function extractStorageState(sessionId) {
  const response = await runPlaywrightJson(sessionId, `
const state = await page.context().storageState();
return {
  ok: true,
  state,
};
`)
  if (!response || response.ok !== true || !response.state || typeof response.state !== 'object') {
    throw createInvoiceCarrierError('invoice_carrier_storage_state_missing', '電子發票登入成功但無法保存瀏覽器狀態')
  }
  return response.state
}

async function restoreStorageState(sessionId, storageState, targetUrl) {
  const payload = {
    storageState: storageState && typeof storageState === 'object' ? storageState : {},
    targetUrl,
  }
  const response = await runPlaywrightJson(sessionId, `
const payload = ${JSON.stringify(payload)};
const cookies = Array.isArray(payload.storageState.cookies) ? payload.storageState.cookies : [];
if (cookies.length) {
  await page.context().addCookies(cookies);
}
const origins = Array.isArray(payload.storageState.origins) ? payload.storageState.origins : [];
for (const entry of origins) {
  if (!entry?.origin) continue;
  await page.goto(entry.origin, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await page.evaluate((items) => {
    try {
      for (const item of Array.isArray(items) ? items : []) {
        if (!item?.name) continue;
        localStorage.setItem(String(item.name), String(item.value ?? ''));
      }
    } catch (_error) {}
  }, entry.localStorage);
}
await page.goto(payload.targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => null);
await page.waitForTimeout(800);
return {
  ok: true,
  url: page.url(),
};
`)
  if (!response || response.ok !== true) {
    throw createInvoiceCarrierError('invoice_carrier_storage_restore_failed', '無法恢復電子發票登入狀態')
  }
  return response
}

async function submitLoginForm(sessionId, { mobilePhone, password, captchaCode }) {
  const payload = {
    mobilePhone: normalizeText(mobilePhone),
    password: String(password ?? ''),
    captchaCode: normalizeText(captchaCode),
  }
  if (!payload.mobilePhone || !payload.password || !payload.captchaCode) {
    throw createInvoiceCarrierError('invoice_carrier_credentials_required', '登入電子發票需要手機號碼、密碼與驗證碼')
  }

  await runPlaywrightJson(sessionId, `
const payload = ${JSON.stringify(payload)};
await page.waitForSelector('#mobile_phone', { timeout: 10000 });
await page.fill('#mobile_phone', payload.mobilePhone);
await page.fill('#password', payload.password);
await page.fill('#captcha', payload.captchaCode);
await Promise.allSettled([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
  page.click('#submitBtn'),
]);
await page.waitForTimeout(1200);
return { ok: true };
`)
}

async function performAutoRelogin(sessionId, credentials = {}) {
  const mobilePhone = normalizeText(credentials.mobile_phone || credentials.mobilePhone)
  const password = String(credentials.password ?? '')
  if (!mobilePhone || !password) {
    throw createInvoiceCarrierError('invoice_carrier_reauth_required', '載具登入已失效，且本地未保存完整憑證')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const status = await inspectSession(sessionId, {
      includeCaptcha: true,
      refreshCaptcha: attempt > 0,
    })
    if (status.cloudflare_blocked) {
      throw createInvoiceCarrierError('invoice_carrier_cloudflare_verification_required', '電子發票網站要求重新完成 Cloudflare 安全驗證')
    }
    if (!status.login_form_ready) {
      throw createInvoiceCarrierError('invoice_carrier_login_required', '電子發票登入頁不可用，請重新驗證')
    }
    if (!status.captcha_auto_filled) {
      continue
    }

    await submitLoginForm(sessionId, {
      mobilePhone,
      password,
      captchaCode: status.captcha_auto_filled,
    })

    const postLoginStatus = await inspectSession(sessionId)
    if (postLoginStatus.search_form_ready) {
      return postLoginStatus
    }
  }

  throw createInvoiceCarrierError('invoice_carrier_reauth_required', '電子發票自動重登入失敗，請重新驗證一次')
}

function defaultDateRange() {
  const today = new Date()
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate())
  return {
    startDate: twoMonthsAgo.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
  }
}

async function submitSearchForm(sessionId, { startDate, endDate, carrierCode }) {
  const normalizedStart = parseInvoiceDateText(startDate) || defaultDateRange().startDate
  const normalizedEnd = parseInvoiceDateText(endDate) || defaultDateRange().endDate
  const normalizedCarrierCode = normalizeText(carrierCode, 'all') || 'all'
  const payload = {
    dateLabel: formatInvoiceDateRangeLabel(normalizedStart, normalizedEnd),
    carrierCode: normalizedCarrierCode,
  }
  const response = await runPlaywrightJson(sessionId, `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded').catch(() => null);
const dateInput = document.querySelector('#dp-input-searchInvoiceDate');
if (dateInput) {
  dateInput.removeAttribute('readonly');
  dateInput.value = payload.dateLabel;
  for (const eventName of ['input', 'change', 'blur']) {
    dateInput.dispatchEvent(new Event(eventName, { bubbles: true }));
  }
}
const carrierSelect = document.querySelector('#carrier');
if (carrierSelect && payload.carrierCode) {
  carrierSelect.value = payload.carrierCode;
  carrierSelect.dispatchEvent(new Event('change', { bubbles: true }));
}
const statusSelect = document.querySelector('#status');
if (statusSelect && !statusSelect.value) {
  statusSelect.value = 'all';
  statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
}
const searchButton = document.querySelector('button[title="查詢"], button[aria-label="查詢"]');
if (!searchButton) {
  return { ok: false, reason: 'invoice_carrier_search_button_not_found' };
}
await Promise.allSettled([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
  searchButton.click(),
]);
await page.waitForTimeout(1800);
return {
  ok: true,
  url: page.url(),
};
`)
  if (!response || response.ok !== true) {
    throw createInvoiceCarrierError(response?.reason || 'invoice_carrier_search_failed', '電子發票查詢失敗')
  }
  return response
}

async function extractInvoices(sessionId) {
  const response = await runPlaywrightJson(sessionId, `
await page.waitForLoadState('domcontentloaded').catch(() => null);
await page.waitForTimeout(1000);
const rows = Array.from(document.querySelectorAll('table tbody tr'));
const invoices = [];
let currentInvoice = null;

for (const row of rows) {
  const cells = Array.from(row.querySelectorAll('td'));
  if (!cells.length) continue;
  const invoiceLink = row.querySelector('a[title], td[data-title="發票號碼"] a');
  const checkbox = row.querySelector('input[type="checkbox"][aria-label="選擇"], input[id^="all_"]');
  const invoiceNumber = String(invoiceLink?.getAttribute('title') || invoiceLink?.textContent || '').trim();
  if (invoiceNumber && checkbox) {
    currentInvoice = {
      invoice_number: invoiceNumber,
      carrier_label: String(cells[1]?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      amount: String(cells[3]?.textContent ?? '').replace(/[^0-9-]/g, ''),
      invoice_date: String(cells[4]?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      seller_name: '',
    };
    invoices.push(currentInvoice);
    continue;
  }

  if (!currentInvoice) continue;
  const sellerText = cells
    .map((cell) => String(cell.textContent ?? '').replace(/\\s+/g, ' ').trim())
    .find(Boolean);
  if (sellerText) {
    currentInvoice.seller_name = sellerText;
    currentInvoice = null;
  }
}

return {
  ok: true,
  invoices,
};
`)
  if (!response || response.ok !== true) {
    throw createInvoiceCarrierError('invoice_carrier_extract_failed', '無法解析電子發票清單')
  }

  return (Array.isArray(response.invoices) ? response.invoices : [])
    .map((invoice) => ({
      invoice_number: normalizeText(invoice.invoice_number),
      invoice_date: parseInvoiceDateText(invoice.invoice_date),
      seller_name: normalizeText(invoice.seller_name),
      amount: Math.max(0, Math.round(Number(invoice.amount) || 0)),
      carrier_label: normalizeText(invoice.carrier_label),
    }))
    .filter((invoice) => invoice.invoice_number && invoice.invoice_date)
}

export async function createInvoiceCarrierLinkSession() {
  cleanupExpiredSessions()
  const sessionId = createSessionId()
  await openPlaywrightPage(sessionId, EINVOICE_LOGIN_URL, { headed: true })
  registerSession(sessionId, {
    mode: 'link',
  })
  const status = await inspectSession(sessionId, {
    includeCaptcha: true,
  })

  return {
    provider: INVOICE_CARRIER_PROVIDER_ID,
    session_id: sessionId,
    link_url: EINVOICE_LOGIN_URL,
    requires_manual_verification: true,
    expires_at: new Date(Date.now() + PLAYWRIGHT_SESSION_TTL_MS).toISOString(),
    ...status,
  }
}

export async function getInvoiceCarrierSessionStatus(body = {}) {
  const sessionId = requireSession(body.session_id)
  const status = await inspectSession(sessionId, {
    includeCaptcha: true,
    refreshCaptcha: Boolean(body.refresh_captcha),
  })
  return {
    provider: INVOICE_CARRIER_PROVIDER_ID,
    session_id: sessionId,
    expires_at: new Date(invoiceCarrierSessions.get(sessionId)?.expiresAtMs ?? Date.now()).toISOString(),
    ...status,
  }
}

export async function exchangeInvoiceCarrierAuth(body = {}) {
  const sessionId = requireSession(body.session_id)
  const mobilePhone = normalizeText(body.mobile_phone)
  const password = String(body.password ?? '')
  const captchaCode = normalizeText(body.captcha_code)

  if (!mobilePhone || !password) {
    throw createInvoiceCarrierError('invoice_carrier_credentials_required', '缺少手機號碼或密碼')
  }

  const beforeStatus = await inspectSession(sessionId)
  if (beforeStatus.cloudflare_blocked) {
    throw createInvoiceCarrierError('invoice_carrier_cloudflare_verification_required', '請先在瀏覽器完成 Cloudflare 安全驗證')
  }
  if (!beforeStatus.login_form_ready) {
    if (beforeStatus.search_form_ready) {
      const storageState = await extractStorageState(sessionId)
      return {
        provider: INVOICE_CARRIER_PROVIDER_ID,
        mobile_phone: mobilePhone,
        provider_connection_id: createProviderConnectionId(mobilePhone),
        storage_state: storageState,
        available_carriers: beforeStatus.available_carriers,
      }
    }
    throw createInvoiceCarrierError('invoice_carrier_login_required', '電子發票登入頁尚未就緒，請先完成安全驗證')
  }
  if (!captchaCode) {
    throw createInvoiceCarrierError('invoice_carrier_credentials_required', '缺少圖形驗證碼')
  }

  await submitLoginForm(sessionId, { mobilePhone, password, captchaCode })
  const afterStatus = await inspectSession(sessionId)
  if (afterStatus.cloudflare_blocked) {
    throw createInvoiceCarrierError('invoice_carrier_cloudflare_verification_required', '電子發票網站要求重新完成 Cloudflare 安全驗證')
  }
  if (!afterStatus.search_form_ready) {
    throw createInvoiceCarrierError(
      'invoice_carrier_login_failed',
      afterStatus.error_message || '電子發票登入失敗，請確認手機號碼、密碼與驗證碼',
    )
  }

  const storageState = await extractStorageState(sessionId)
  return {
    provider: INVOICE_CARRIER_PROVIDER_ID,
    mobile_phone: mobilePhone,
    provider_connection_id: createProviderConnectionId(mobilePhone),
    storage_state: storageState,
    available_carriers: afterStatus.available_carriers,
    authenticated_at: new Date().toISOString(),
  }
}

export async function syncInvoiceCarrierData(body = {}) {
  const connectionRef = normalizeText(body.connection_id)
  const storageState = body.storage_state && typeof body.storage_state === 'object' ? body.storage_state : null
  const credentials = body.credentials && typeof body.credentials === 'object' ? body.credentials : {}
  const { startDate, endDate } = defaultDateRange()
  const normalizedStartDate = parseInvoiceDateText(body.start_date) || startDate
  const normalizedEndDate = parseInvoiceDateText(body.end_date) || endDate
  const normalizedCarrierCode = normalizeText(body.carrier_code, 'all') || 'all'

  if (!connectionRef) {
    throw createInvoiceCarrierError('invoice_carrier_connection_required', '缺少電子發票連線識別')
  }

  const sessionId = createSessionId()
  try {
    await openPlaywrightPage(sessionId, 'about:blank')
    registerSession(sessionId, {
      mode: 'sync',
      connectionRef,
    })

    if (storageState) {
      await restoreStorageState(sessionId, storageState, EINVOICE_SEARCH_URL)
    } else {
      await openPlaywrightPage(sessionId, EINVOICE_LOGIN_URL)
    }

    let status = await inspectSession(sessionId)
    if (status.cloudflare_blocked) {
      throw createInvoiceCarrierError('invoice_carrier_cloudflare_verification_required', '電子發票網站要求重新完成 Cloudflare 安全驗證')
    }

    if (!status.search_form_ready) {
      if (!status.login_form_ready) {
        await openPlaywrightPage(sessionId, EINVOICE_LOGIN_URL)
        status = await inspectSession(sessionId)
      }
      if (status.cloudflare_blocked) {
        throw createInvoiceCarrierError('invoice_carrier_cloudflare_verification_required', '電子發票網站要求重新完成 Cloudflare 安全驗證')
      }
      if (status.login_form_ready) {
        status = await performAutoRelogin(sessionId, credentials)
      }
    }

    if (!status.search_form_ready) {
      throw createInvoiceCarrierError('invoice_carrier_reauth_required', '電子發票登入狀態已失效，請重新驗證載具')
    }

    const availableCarriers = normalizeCarrierOptions(status.available_carriers)
    await submitSearchForm(sessionId, {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      carrierCode: normalizedCarrierCode,
    })

    const invoices = await extractInvoices(sessionId)
    const nextStorageState = await extractStorageState(sessionId)

    return {
      provider: INVOICE_CARRIER_PROVIDER_ID,
      connection_id: connectionRef,
      invoices,
      available_carriers: availableCarriers,
      storage_state: nextStorageState,
      sync_time: new Date().toISOString(),
      result_page_url: EINVOICE_DETAIL_URL,
    }
  } finally {
    await closePlaywrightSession(sessionId)
  }
}

export async function closeInvoiceCarrierSession(sessionId) {
  await closePlaywrightSession(sessionId)
}
