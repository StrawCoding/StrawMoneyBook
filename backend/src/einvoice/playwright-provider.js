import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { normalizeInvoiceList } from './normalize.js'
import {
  getCaptchaApiUrl,
  getCaptchaTokenField,
  getLoginUrl,
  getQueryApiPattern,
  getQueryUrl,
  getSelectors,
} from './portal-config.js'
import { buildWaitForLoginSelectorsRunCode, getPortalSelectorWaitMs } from './portal-cloudflare.js'
import { extractInvoicesFromJsonPayloads, mergeQueryWindows } from './portal-json.js'
import {
  createSessionRecord,
  getSessionRecord,
  releaseSessionRecord,
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
const LOGIN_WAIT_MS = Number(process.env.EINVOICE_PORTAL_LOGIN_WAIT_MS) > 0
  ? Number(process.env.EINVOICE_PORTAL_LOGIN_WAIT_MS)
  : 5000

function normalizeText(value) {
  return String(value ?? '').trim()
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
        timeout: getPlaywrightCliTimeoutMs(),
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

export function getPlaywrightCliTimeoutMs() {
  const configured = Number(process.env.EINVOICE_PLAYWRIGHT_CLI_TIMEOUT_MS)
  const selectorWaitMs = getPortalSelectorWaitMs()
  const minimumTimeoutMs = selectorWaitMs + 15_000
  if (configured > 0) return Math.max(configured, minimumTimeoutMs)
  return Math.max(PLAYWRIGHT_DEFAULT_TIMEOUT_MS, minimumTimeoutMs)
}

function getPlaywrightExecEnv() {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH,
    PLAYWRIGHT_MCP_CONFIG: PLAYWRIGHT_CLI_CONFIG_PATH,
    PLAYWRIGHT_MCP_HEADLESS: process.env.PLAYWRIGHT_MCP_HEADLESS ?? 'true',
  }
}

async function runPlaywrightCli(sessionId, args = []) {
  const safeSessionId = normalizeText(sessionId)
  const safeArgs = Array.isArray(args) ? args.filter((item) => String(item ?? '').length > 0) : []
  if (!safeSessionId) {
    throw new Error('playwright session id is required')
  }
  return execFileAsync('npx', ['playwright-cli', `-s=${safeSessionId}`, ...safeArgs], {
    env: getPlaywrightExecEnv(),
  })
}

function extractLastJsonObject(rawOutput) {
  const text = String(rawOutput ?? '')
  const resultMatch = text.match(/### Result\s*\n(\{[\s\S]*?\}|\[[\s\S]*?\])(?:\n|$)/m)
  if (resultMatch) {
    try {
      return JSON.parse(resultMatch[1])
    } catch {
      // continue
    }
  }

  const lines = text
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
  const result = await runPlaywrightCli(sessionId, ['run-code', normalizeRunCode(code)])
  return extractLastJsonObject(result.stdout)
}

async function closePlaywrightSession(sessionId) {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) return
  try {
    await runPlaywrightCli(safeSessionId, ['close'])
  } catch {
    // ignore close errors
  }
}

async function openPortalPage(sessionId, portalUrl) {
  await runPlaywrightCli(sessionId, ['open', portalUrl])
}

function portalChangedError(message = '官方網站版面可能已更新，請稍後再試') {
  const error = new Error(message)
  error.code = 'einvoice_portal_changed'
  return error
}

function cloudflareTimeoutError() {
  const error = new Error('官方網站安全驗證逾時，請稍後再試')
  error.code = 'einvoice_cloudflare_timeout'
  return error
}

async function prepareLoginPage(sessionId, selectors) {
  const response = await runPlaywrightJson(sessionId, buildWaitForLoginSelectorsRunCode(selectors))
  if (response?.cloudflareChallenge) {
    throw cloudflareTimeoutError()
  }
  if (!response?.ok) {
    throw portalChangedError()
  }
}

async function fetchCaptchaFromApi(sessionId, captchaApiUrl, captchaTokenField) {
  const payload = { captchaApiUrl, captchaTokenField }
  const code = `
const payload = ${JSON.stringify(payload)};
const response = await page.evaluate(async (config) => {
  const res = await fetch(config.captchaApiUrl, { credentials: 'include', method: 'GET' });
  if (!res.ok) {
    return { ok: false, reason: 'captcha_http_' + res.status };
  }
  const data = await res.json();
  const token = data?.[config.captchaTokenField] ?? data?.token ?? '';
  const image = data?.image ?? data?.img ?? '';
  if (!token || !image) {
    return { ok: false, reason: 'captcha_shape_invalid' };
  }
  return { ok: true, token: String(token), base64: String(image) };
}, payload);
return response;
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    throw portalChangedError('無法取得圖形驗證碼，官方網站可能已更新')
  }
  return {
    token: normalizeText(response.token),
    base64: normalizeText(response.base64),
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
if (payload.values.captchaToken) {
  await page.evaluate((token) => {
    window.__SMB_EINVOICE_CAPTCHA_TOKEN__ = token;
  }, payload.values.captchaToken);
}
return { ok: true };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    const error = portalChangedError()
    if (response?.reason === 'portal_changed') error.code = 'einvoice_portal_changed'
    else error.code = 'einvoice_scrape_failed'
    throw error
  }
}

async function submitLoginForm(sessionId, selectors, captchaToken, captchaTokenField) {
  const payload = {
    selectors,
    captchaToken,
    captchaTokenField,
    loginWaitMs: LOGIN_WAIT_MS,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.route('**/*', async (route) => {
  const request = route.request();
  const url = request.url();
  if (!url.includes('/act/login/api/') || request.method() !== 'POST') {
    await route.continue();
    return;
  }
  const headers = { ...request.headers() };
  let postData = request.postData() || '';
  try {
    const body = postData ? JSON.parse(postData) : {};
    if (payload.captchaToken) {
      body[payload.captchaTokenField] = payload.captchaToken;
      body.captchaToken = payload.captchaToken;
      body.token = payload.captchaToken;
      postData = JSON.stringify(body);
    }
    await route.continue({ headers, postData });
  } catch {
    await route.continue();
  }
});
const button = await page.$(payload.selectors.loginButton);
if (!button) {
  return { ok: false, reason: 'portal_changed' };
}
await button.click();
await page.waitForTimeout(payload.loginWaitMs);
const authError = await page.$(payload.selectors.authError);
const authText = authError ? (await authError.innerText()).catch(() => '') : '';
const currentUrl = page.url();
return { ok: true, authText: String(authText || '').trim(), url: currentUrl };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    throw portalChangedError()
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

async function navigateToQueryPage(sessionId, selectors, queryUrl) {
  const payload = { selectors, queryUrl }
  const code = `
const payload = ${JSON.stringify(payload)};
if (payload.queryUrl && payload.queryUrl !== page.url()) {
  await page.goto(payload.queryUrl, { waitUntil: 'domcontentloaded' }).catch(() => null);
}
const nav = await page.$(payload.selectors.queryNavLink);
if (nav) {
  await nav.click().catch(() => null);
  await page.waitForTimeout(1200);
}
await page.waitForLoadState('domcontentloaded');
return { ok: true, url: page.url() };
`
  await runPlaywrightJson(sessionId, code)
}

async function queryInvoicesForWindow(sessionId, selectors, queryApiPatternSource, values) {
  const payload = {
    selectors,
    values,
    queryApiPatternSource,
    timeoutMs: 30_000,
  }
  const code = `
const payload = ${JSON.stringify(payload)};
const pattern = new RegExp(payload.queryApiPatternSource, 'i');
const captured = [];
page.on('response', async (response) => {
  const url = response.url();
  const contentType = response.headers()['content-type'] || '';
  if (!pattern.test(url) || !contentType.includes('json')) return;
  try {
    captured.push(await response.json());
  } catch {
    // ignore malformed JSON
  }
});
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
const button = await page.$(payload.selectors.submitButton);
if (!button) {
  return { ok: false, reason: 'portal_changed', missing: 'submitButton' };
}
const waitForQuery = page.waitForResponse(
  (response) => pattern.test(response.url()) && (response.headers()['content-type'] || '').includes('json'),
  { timeout: payload.timeoutMs },
).catch(() => null);
await button.click();
await waitForQuery;
await page.waitForTimeout(1200);
return { ok: true, captured };
`
  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    throw portalChangedError('找不到發票查詢表單，官方網站版面可能已更新')
  }
  return Array.isArray(response.captured) ? response.captured : []
}

async function extractInvoicesFromDom(sessionId, selectors) {
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
return { invoices };
`
  const response = await runPlaywrightJson(sessionId, code)
  return Array.isArray(response?.invoices) ? response.invoices : []
}

export async function startScrapeSession(payload = {}) {
  const sessionId = normalizeText(payload.session_id) || createSessionId()
  const loginUrl = getLoginUrl()
  const selectors = getSelectors()
  const captchaApiUrl = getCaptchaApiUrl()
  const captchaTokenField = getCaptchaTokenField()
  const refreshCaptcha = Boolean(payload.refresh_captcha)

  if (!refreshCaptcha || !normalizeText(payload.session_id)) {
    await openPortalPage(sessionId, loginUrl)
    await prepareLoginPage(sessionId, selectors)
  }

  const captcha = await fetchCaptchaFromApi(sessionId, captchaApiUrl, captchaTokenField)

  createSessionRecord(sessionId, {
    needsCaptcha: true,
    captchaToken: captcha.token,
    cardNo: normalizeCarrierPhone(payload.cardNo ?? ''),
    cardEncrypt: payload.cardEncrypt ?? '',
    metadata: { provider: 'playwright', loginUrl, captchaApiUrl },
    cleanup: async () => {
      await closePlaywrightSession(sessionId)
    },
  })

  return {
    session_id: sessionId,
    needs_captcha: true,
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
    throw portalChangedError('驗證碼欄位不存在，官方網站版面可能已更新')
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
  const startDate = String(payload.startDate ?? '').trim()
  const endDate = String(payload.endDate ?? '').trim()
  const queryUrl = getQueryUrl()
  const queryApiPattern = getQueryApiPattern()
  const captchaToken = normalizeText(record.captchaToken)
  const captchaTokenField = getCaptchaTokenField()
  const windows = mergeQueryWindows(startDate, endDate)

  try {
    await fillLoginForm(sessionId, selectors, {
      phone,
      password,
      captchaCode: String(payload.captcha_code ?? ''),
      captchaToken,
    })
    await submitLoginForm(sessionId, selectors, captchaToken, captchaTokenField)

    await navigateToQueryPage(sessionId, selectors, queryUrl)

    const allInvoices = []
    const seen = new Set()

    for (const window of windows) {
      const rocStart = toRocDate(window.startDate)
      const rocEnd = toRocDate(window.endDate)
      const captured = await queryInvoicesForWindow(sessionId, selectors, queryApiPattern.source, {
        startDate: rocStart,
        endDate: rocEnd,
      })

      let invoices = extractInvoicesFromJsonPayloads(captured)
      if (invoices.length === 0) {
        invoices = await extractInvoicesFromDom(sessionId, selectors)
      }

      for (const invoice of invoices) {
        const number = String(invoice.invoiceNumber ?? '').trim()
        if (!number || seen.has(number)) continue
        seen.add(number)
        allInvoices.push(invoice)
      }

      if (allInvoices.length >= MAX_PAGES * 20) {
        const error = new Error('查詢結果過多，請縮小日期範圍後再試')
        error.code = 'einvoice_result_too_large'
        error.totalPages = Math.ceil(allInvoices.length / 20)
        error.maxPages = MAX_PAGES
        throw error
      }
    }

    updateSessionRecord(sessionId, { cardNo: phone, cardEncrypt: password })
    return { invoices: normalizeInvoiceList(allInvoices) }
  } finally {
    await releaseSessionRecord(sessionId, 'completed')
  }
}

export async function cancelScrapeSession(payload = {}) {
  const sessionId = String(payload.session_id ?? '').trim()
  if (sessionId) {
    await releaseSessionRecord(sessionId, 'cancelled')
  }
  return { ok: true }
}
