import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  buildDefaultEinvoiceSyncFilter,
  createEinvoiceInvoiceSourceKey,
  normalizeEinvoiceCarrierOptions,
  normalizeEinvoiceInvoiceRows,
  normalizeEinvoiceSyncFilter,
} from '../../src/services/einvoice-carrier/shared.js'
import { normalizeText, simpleHash } from './_utils.js'

const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 60 * 1000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))

const EINVOICE_PROVIDER = 'tw_einvoice_mobile_barcode'
const EINVOICE_AUTH_MODE = 'mobile_barcode'
const EINV_LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login'
const EINV_SEARCH_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search'
const DEFAULT_QUERY_STATUS = 'all'

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
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep scanning
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

async function openPlaywrightSession(sessionId, url) {
  await runPlaywrightCli(['--session', sessionId, 'open', url])
}

async function closePlaywrightSession(sessionId) {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) return
  try {
    await runPlaywrightCli(['--session', safeSessionId, 'close'])
  } catch {
    // Ignore close failures.
  }
}

function createSessionId() {
  return `pw_einvoice_${randomUUID().replace(/-/g, '')}`
}

function normalizeMobilePhone(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function maskMobilePhone(value) {
  const normalized = normalizeMobilePhone(value)
  if (!normalized) return '未設定'
  if (normalized.length <= 4) return normalized
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`
}

function formatDateRangeLabel(dateFrom, dateTo) {
  const buildLabel = (value) => {
    const [year, month, day] = String(value ?? '').split('-')
    if (!year || !month || !day) return ''
    return `${Number(year)}年${Number(month)}月${Number(day)}日`
  }
  return `${buildLabel(dateFrom)} ~ ${buildLabel(dateTo)}`
}

function createEinvoiceConnectionId(mobilePhone) {
  return `einv_conn_${simpleHash(`${EINVOICE_PROVIDER}:${normalizeMobilePhone(mobilePhone)}`)}`
}

export function encodeEinvoiceSessionToken(storageState = {}) {
  return Buffer.from(JSON.stringify(storageState ?? {}), 'utf8').toString('base64url')
}

export function decodeEinvoiceSessionToken(token) {
  const normalized = normalizeText(token)
  if (!normalized) {
    const error = new Error('電子發票登入 Session 已失效，請重新驗證')
    error.code = 'einvoice_session_expired'
    throw error
  }

  try {
    const parsed = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    const error = new Error('電子發票登入 Session 已失效，請重新驗證')
    error.code = 'einvoice_session_expired'
    throw error
  }
}

async function captureCaptcha(sessionId, refreshCaptcha = false) {
  const payload = {
    imageSelector: '.code_num img',
    refreshSelector: 'button[title="更新圖形驗證碼"]',
    refreshCaptcha,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
if (payload.refreshCaptcha) {
  const refreshButton = await page.$(payload.refreshSelector);
  if (refreshButton) {
    await refreshButton.click().catch(() => null);
    await page.waitForTimeout(800);
  }
}
await page.waitForSelector(payload.imageSelector, { state: 'visible', timeout: 10000 }).catch(() => null);
const image = await page.$(payload.imageSelector);
if (!image) {
  return { ok: false };
}
const screenshotBytes = await image.screenshot({ type: 'png' });
let screenshot = '';
for (const byte of screenshotBytes) {
  screenshot += String.fromCharCode(byte);
}
const src = await image.getAttribute('src');
return {
  ok: true,
  src: src || '',
  dataUrl: 'data:image/png;base64,' + btoa(screenshot),
};
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    return { src: '', dataUrl: '' }
  }
  return {
    src: normalizeText(response.src),
    dataUrl: normalizeText(response.dataUrl),
  }
}

export async function createEinvoiceLinkSession(payload = {}) {
  const sessionId = normalizeText(payload.session_id) || createSessionId()
  const refreshCaptcha = Boolean(payload.refresh_captcha)

  if (!refreshCaptcha || !normalizeText(payload.session_id)) {
    await openPlaywrightSession(sessionId, EINV_LOGIN_URL)
  }

  const captcha = await captureCaptcha(sessionId, refreshCaptcha)
  return {
    provider: EINVOICE_PROVIDER,
    auth_mode: EINVOICE_AUTH_MODE,
    session_id: sessionId,
    link_url: EINV_LOGIN_URL,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    captcha_image_src: captcha.src,
    captcha_image_data_url: captcha.dataUrl,
  }
}

function createSessionExpiredError() {
  const error = new Error('電子發票登入 Session 已失效，請重新驗證')
  error.code = 'einvoice_session_expired'
  return error
}

async function openSessionWithStorageState(sessionId, storageState) {
  await openPlaywrightSession(sessionId, 'about:blank')
  const payload = {
    storageState,
    searchUrl: EINV_SEARCH_URL,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
const cookies = Array.isArray(payload.storageState?.cookies) ? payload.storageState.cookies : [];
if (cookies.length) {
  await page.context().addCookies(cookies).catch(() => null);
}
const origins = Array.isArray(payload.storageState?.origins) ? payload.storageState.origins : [];
await page.addInitScript((savedOrigins) => {
  const safeOrigins = Array.isArray(savedOrigins) ? savedOrigins : [];
  const currentOrigin = window.location.origin;
  for (const item of safeOrigins) {
    try {
      const origin = new URL(item.origin).origin;
      if (origin !== currentOrigin) continue;
      for (const entry of item.localStorage || []) {
        if (!entry || typeof entry.name !== 'string') continue;
        window.localStorage.setItem(entry.name, String(entry.value ?? ''));
      }
    } catch (_error) {}
  }
}, origins);
await page.goto(payload.searchUrl, { waitUntil: 'domcontentloaded' });
if (page.url().includes('/accounts/login')) {
  return { ok: false, reauthRequired: true };
}
await page.waitForSelector('#carrier', { timeout: 10000 }).catch(() => null);
return {
  ok: Boolean(await page.$('#carrier')),
  reauthRequired: !(await page.$('#carrier')),
};
`
  const result = await runPlaywrightJson(sessionId, code)
  if (!result?.ok) {
    throw createSessionExpiredError()
  }
}

export async function exchangeEinvoiceAuth(payload = {}) {
  const mobilePhone = normalizeMobilePhone(payload.mobile_phone)
  const password = String(payload.password ?? '')
  const captchaCode = normalizeText(payload.captcha_code)
  let sessionId = normalizeText(payload.session_id)

  if (!mobilePhone) {
    const error = new Error('手機號碼不可為空')
    error.code = 'einvoice_mobile_phone_required'
    throw error
  }
  if (!password) {
    const error = new Error('驗證碼密碼不可為空')
    error.code = 'einvoice_password_required'
    throw error
  }
  if (!captchaCode) {
    const error = new Error('請先輸入圖形驗證碼')
    error.code = 'einvoice_captcha_required'
    throw error
  }

  if (!sessionId) {
    const session = await createEinvoiceLinkSession(payload)
    sessionId = normalizeText(session.session_id)
  }

  const submitPayload = {
    mobilePhone,
    password,
    captchaCode,
    searchUrl: EINV_SEARCH_URL,
  }
  const code = `
const payload = ${JSON.stringify(submitPayload)};
await page.waitForLoadState('domcontentloaded');
await page.fill('#mobile_phone', payload.mobilePhone);
await page.fill('#password', payload.password);
await page.fill('#captcha', payload.captchaCode);
const submitButton = await page.$('#submitBtn');
if (!submitButton) {
  throw new Error('login_submit_not_found');
}
await submitButton.click();
await page.waitForTimeout(1800);
if (page.url().includes('/accounts/login')) {
  const errorText = await page.evaluate(() => {
    const candidates = [
      '.alert',
      '.error',
      '.text-danger',
      '.text-danger p',
      '.red_text',
    ];
    for (const selector of candidates) {
      const node = document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) return text;
    }
    return '';
  });
  return { ok: false, errorText };
}
await page.goto(payload.searchUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#carrier', { timeout: 10000 }).catch(() => null);
if (!await page.$('#carrier')) {
  return { ok: false, errorText: 'invoice_search_page_not_found' };
}
const carrierOptions = await page.$$eval('#carrier option', (options) => options.map((option) => ({
  value: String(option.value || ''),
  label: String(option.textContent || '').trim(),
})));
const storageState = await page.context().storageState();
return {
  ok: true,
  carrierOptions,
  storageState,
};
`

  try {
    const result = await runPlaywrightJson(sessionId, code)
    if (!result?.ok) {
      const error = new Error(normalizeText(result?.errorText) || '電子發票登入失敗')
      error.code = 'einvoice_login_failed'
      throw error
    }

    return {
      provider: EINVOICE_PROVIDER,
      auth_mode: EINVOICE_AUTH_MODE,
      provider_connection_id: mobilePhone,
      connection_id: createEinvoiceConnectionId(mobilePhone),
      connection_name: `手機條碼 ${maskMobilePhone(mobilePhone)}`,
      session_token: encodeEinvoiceSessionToken(result.storageState),
      access_token_ref: encodeEinvoiceSessionToken(result.storageState),
      carrier_options: normalizeEinvoiceCarrierOptions(result.carrierOptions),
      created_at: new Date().toISOString(),
    }
  } finally {
    await closePlaywrightSession(sessionId)
  }
}

export async function syncEinvoiceInvoices(payload = {}) {
  const sessionToken = normalizeText(payload.session_token || payload.access_token_ref)
  const storageState = decodeEinvoiceSessionToken(sessionToken)
  const filter = normalizeEinvoiceSyncFilter(payload.filter)
  const sessionId = createSessionId()

  try {
    await openSessionWithStorageState(sessionId, storageState)
    const queryPayload = {
      filter,
      searchUrl: EINV_SEARCH_URL,
      dateRangeLabel: formatDateRangeLabel(filter.dateFrom, filter.dateTo),
    }
    const code = `
const payload = ${JSON.stringify(queryPayload)};
await page.goto(payload.searchUrl, { waitUntil: 'domcontentloaded' });
if (page.url().includes('/accounts/login')) {
  return { ok: false, reauthRequired: true };
}
await page.waitForSelector('#carrier', { timeout: 10000 }).catch(() => null);
if (!await page.$('#carrier')) {
  return { ok: false, reauthRequired: true };
}
await page.evaluate((query) => {
  const dateInput = document.querySelector('#dp-input-searchInvoiceDate');
  if (dateInput) {
    dateInput.removeAttribute('readonly');
    dateInput.value = query.dateRangeLabel;
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const carrier = document.querySelector('#carrier');
  if (carrier) {
    carrier.value = query.filter.carrier;
    carrier.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const status = document.querySelector('#status');
  if (status) {
    status.value = query.filter.status;
    status.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const buyerBan = document.querySelector('#buyerBan');
  if (buyerBan) {
    buyerBan.value = query.filter.buyerBan;
    buyerBan.dispatchEvent(new Event('input', { bubbles: true }));
    buyerBan.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const productName = document.querySelector('#productName');
  if (productName) {
    productName.value = query.filter.productName;
    productName.dispatchEvent(new Event('input', { bubbles: true }));
    productName.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, payload);
const queryButton = await page.$('button[title="查詢"]');
if (!queryButton) {
  return { ok: false, errorText: 'invoice_query_button_not_found' };
}
await queryButton.click();
await page.waitForTimeout(1800);
if (page.url().includes('/accounts/login')) {
  return { ok: false, reauthRequired: true };
}
await page.waitForSelector('table.have_checkbox tbody', { timeout: 15000 }).catch(() => null);
const carrierOptions = await page.$$eval('#carrier option', (options) => options.map((option) => ({
  value: String(option.value || ''),
  label: String(option.textContent || '').trim(),
}))).catch(() => []);
const invoices = await page.evaluate((selectedStatus) => {
  const table = document.querySelector('table.have_checkbox tbody');
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll('tr'));
  const invoices = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const invoiceLink = row.querySelector('a[title]');
    if (!invoiceLink) continue;
    const nextRow = rows[index + 1];
    const cells = row.querySelectorAll('td');
    const carrierLabel = cells[1]?.textContent?.trim() || row.querySelector('.d-md-none')?.textContent?.trim() || '';
    const amountText = cells[3]?.textContent?.trim() || '0';
    const invoiceDateText = cells[4]?.textContent?.trim() || '';
    const sellerName = nextRow?.querySelector('td[colspan]')?.textContent?.trim() || '';
    const buyerBan = cells[6]?.textContent?.trim() || '';
    const normalizedDate = invoiceDateText
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .replace(/\s+/g, '');
    invoices.push({
      invoiceNumber: invoiceLink.getAttribute('title') || invoiceLink.textContent?.trim() || '',
      invoiceDate: normalizedDate,
      amountMinor: Math.round(Number(amountText.replace(/[^\d.-]+/g, '')) * 100),
      sellerName,
      carrierLabel,
      buyerBan,
      invoiceStatus: String(selectedStatus || 'all'),
      raw: {
        invoiceNumber: invoiceLink.getAttribute('title') || invoiceLink.textContent?.trim() || '',
        invoiceDateText,
        amountText,
        sellerName,
        carrierLabel,
        buyerBan,
      },
    });
  }
  return invoices;
}, payload.filter.status);
const storageState = await page.context().storageState();
return {
  ok: true,
  carrierOptions,
  invoices,
  storageState,
};
`
    const result = await runPlaywrightJson(sessionId, code)
    if (result?.reauthRequired) {
      throw createSessionExpiredError()
    }
    if (!result?.ok) {
      const error = new Error(normalizeText(result?.errorText) || '電子發票查詢失敗')
      error.code = 'einvoice_query_failed'
      throw error
    }

    return {
      provider: EINVOICE_PROVIDER,
      auth_mode: EINVOICE_AUTH_MODE,
      sync_time: new Date().toISOString(),
      session_token: encodeEinvoiceSessionToken(result.storageState),
      carrier_options: normalizeEinvoiceCarrierOptions(result.carrierOptions),
      filters_applied: filter,
      invoices: normalizeEinvoiceInvoiceRows(result.invoices, filter.status),
    }
  } finally {
    await closePlaywrightSession(sessionId)
  }
}

export async function disconnectEinvoiceAuth() {
  return {
    ok: true,
    provider: EINVOICE_PROVIDER,
    disconnected_at: new Date().toISOString(),
  }
}
