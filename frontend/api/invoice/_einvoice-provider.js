import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { normalizeText, simpleHash } from '../bank/_utils.js'

const PLAYWRIGHT_SESSION_TTL_MS = 5 * 60 * 1000
const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 60 * 1000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))

const EINVOICE_LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login'
const EINVOICE_SEARCH_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search'
const EINVOICE_DETAIL_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail'

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
  const result = await runPlaywrightCli(['--session', sessionId, 'run-code', normalizeRunCode(code)])
  return extractLastJsonObject(result.stdout)
}

async function closePlaywrightSession(sessionId) {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) return
  try {
    await runPlaywrightCli(['--session', safeSessionId, 'close'])
  } catch {
    // Ignore close errors to avoid masking the primary flow result.
  }
}

async function openLoginPage(sessionId) {
  await runPlaywrightCli(['--session', sessionId, 'open', EINVOICE_LOGIN_URL])
}

async function captureCaptcha(sessionId, refreshCaptcha = false) {
  const payload = {
    selector: 'img',
    containerSelector: '.code_num',
    refreshScript: refreshCaptcha ? "const btn = document.querySelector('.code_num button:nth-child(2)'); if (btn) btn.click();" : '',
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
if (payload.refreshScript) {
  try {
    await page.evaluate((script) => { (0, eval)(script); }, payload.refreshScript);
    await page.waitForTimeout(800);
  } catch (_error) {}
}
const container = await page.$(payload.containerSelector);
if (!container) {
  return { ok: false, reason: 'captcha_container_not_found' };
}
const image = await container.$(payload.selector);
if (!image) {
  return { ok: false, reason: 'captcha_image_not_found' };
}
await page.waitForFunction((selector) => {
  const img = document.querySelector(selector);
  return Boolean(img && img.complete && Number(img.naturalWidth) > 0);
}, 'img', { timeout: 10000 }).catch(() => null);
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
    // 動態載入 tesseract.js（Node.js 環境）
    const Tesseract = (await import('tesseract.js')).default

    const worker = await Tesseract.createWorker()
    const result = await worker.recognize(Buffer.from(captchaImageBase64, 'base64'))
    await worker.terminate()

    // 清理 OCR 結果：只保留數字
    const recognized = result.data.text.trim().replace(/\D/g, '')
    const confidence = result.data.confidence || 0

    // 信心度需 >= 70% 才視為有效識別
    if (confidence >= 70 && recognized.length > 0) {
      return {
        code: recognized,
        confidence,
      }
    }

    return null
  } catch {
    // OCR 失敗或庫未安裝，回傳 null 讓呼叫者改用手動輸入
    return null
  }
}

function createSessionId() {
  return `pw_einv_${randomUUID().replace(/-/g, '')}`
}

export async function createInvoiceCarrierLinkSession(body = {}) {
  const sessionId = createSessionId()
  const expiresAtMs = Date.now() + PLAYWRIGHT_SESSION_TTL_MS

  try {
    // 開啟登入頁
    await openLoginPage(sessionId)

    // 截取驗證碼圖片
    const captchaResult = await captureCaptcha(sessionId, false)
    if (captchaResult.error) {
      await closePlaywrightSession(sessionId)
      throw new Error(`Failed to capture CAPTCHA: ${captchaResult.error}`)
    }

    // 嘗試自動識別驗證碼
    const ocrResult = await recognizeCaptcha(
      captchaResult.dataUrl?.replace(/^data:image\/png;base64,/, '') || ''
    )

    return {
      provider: 'einvoice_tw',
      session_id: sessionId,
      captcha_image: captchaResult.dataUrl,
      captcha_auto_filled: ocrResult?.code || null,
      captcha_confidence: ocrResult?.confidence || 0,
      expires_at: new Date(expiresAtMs).toISOString(),
    }
  } catch (error) {
    await closePlaywrightSession(sessionId)
    throw error
  }
}

export async function exchangeInvoiceCarrierAuth(body = {}) {
  const sessionId = normalizeText(body.session_id)
  const mobilePhone = normalizeText(body.mobile_phone)
  const password = normalizeText(body.password)
  const captchaCode = normalizeText(body.captcha_code)

  if (!sessionId || !mobilePhone || !password || !captchaCode) {
    throw new Error('Missing required fields: session_id, mobile_phone, password, captcha_code')
  }

  try {
    // 填入登入表單並送出
    const payload = {
      mobilePhoneInput: '#mobile_phone',
      passwordInput: '#password',
      captchaInput: '#captcha',
      submitBtn: '#submitBtn',
      mobilePhone: mobilePhone,
      password: password,
      captchaCode: captchaCode,
    }

    const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
await page.fill(payload.mobilePhoneInput, payload.mobilePhone);
await page.fill(payload.passwordInput, payload.password);
await page.fill(payload.captchaInput, payload.captchaCode);
await page.click(payload.submitBtn);

// 等待登入結果：通常會跳轉到查詢頁面或顯示錯誤訊息
await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
await page.waitForTimeout(1000);

// 檢查是否登入成功（URL 變更或找到查詢表單）
const currentUrl = page.url();
const hasSearchForm = await page.$('#carrier').catch(() => null);
const hasErrorMsg = await page.$('.error, [role="alert"]').catch(() => null);

return {
  ok: !hasErrorMsg,
  url: currentUrl,
  hasSearchForm: !!hasSearchForm,
};
`

    const response = await runPlaywrightJson(sessionId, code)
    if (!response || !response.ok) {
      throw new Error('Login failed: invalid credentials or server error')
    }

    // 建立連線記錄
    const connectionId = `einv_${simpleHash(`${mobilePhone}:${Date.now()}`)}`

    return {
      connection_id: connectionId,
      mobile_phone: mobilePhone,
      provider: 'einvoice_tw',
      session_id: sessionId,
    }
  } finally {
    // 保持 session 活著供後續 sync 使用，交給呼叫者決定何時關閉
  }
}

export async function syncInvoiceCarrierData(body = {}) {
  const sessionId = normalizeText(body.session_id)
  const connectionId = normalizeText(body.connection_id)
  const startDate = normalizeText(body.start_date) // ISO format YYYY-MM-DD
  const endDate = normalizeText(body.end_date)
  const carrierCode = normalizeText(body.carrier_code) // 'all', '0' for 手機條碼, etc.

  if (!sessionId || !connectionId) {
    throw new Error('Missing required fields: session_id, connection_id')
  }

  // 預設為最近 2 個月
  const today = new Date()
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate())
  const defaultStartDate = twoMonthsAgo.toISOString().split('T')[0]
  const defaultEndDate = today.toISOString().split('T')[0]

  try {
    // 設定查詢條件
    const payload = {
      startDate: startDate || defaultStartDate,
      endDate: endDate || defaultEndDate,
      carrierCode: carrierCode || 'all',
    }

    const searchCode = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');

// 設定日期與載具篩選（此處省略具體實作，需根據實際 HTML 結構調整）
// 範例：選擇日期範圍、選擇載具、點擊查詢

await page.click('[title="查詢"]');
await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
await page.waitForTimeout(2000);

return { ok: true, url: page.url() };
`

    await runPlaywrightJson(sessionId, searchCode)

    // 抓取發票清單（表格內容）
    const extractCode = `
const invoices = [];
const rows = document.querySelectorAll('table tbody tr');
let currentGroupIndex = -1;

rows.forEach((row) => {
  const cells = row.querySelectorAll('td');
  if (cells.length === 0) return;

  // 若有 checkbox，代表是發票列（不是分組列）
  const checkbox = row.querySelector('input[type="checkbox"]');
  if (checkbox) {
    currentGroupIndex = invoices.length;
    invoices.push({
      invoice_number: cells[2]?.textContent.trim() || '',
      amount: parseInt(cells[3]?.textContent.replace(/[^0-9]/g, '')) || 0,
      invoice_date: cells[4]?.textContent.trim() || '',
      seller_name: '',
    });
  } else if (currentGroupIndex >= 0 && cells.length > 1) {
    // 下一列若無 checkbox，則為賣方名稱列
    invoices[currentGroupIndex].seller_name = cells[1]?.textContent.trim() || '';
  }
});

return { ok: true, invoices };
`

    const extractResult = await runPlaywrightJson(sessionId, extractCode)
    if (!extractResult || !extractResult.ok) {
      throw new Error('Failed to extract invoice data')
    }

    return {
      invoices: extractResult.invoices || [],
      connection_id: connectionId,
      synced_at: new Date().toISOString(),
    }
  } finally {
    // 保持 session 活著
  }
}

export async function closeInvoiceCarrierSession(sessionId) {
  await closePlaywrightSession(sessionId)
}
