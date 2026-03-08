import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { normalizeText, simpleHash } from './_utils.js'

const PLAYWRIGHT_SESSION_TTL_MS = 5 * 60 * 1000
const PLAYWRIGHT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 60 * 1000
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../../playwright-cli.json', import.meta.url))
const DEFAULT_PROVIDER_PROFILES = {
  first_bank_tw: {
    loginUrl: 'https://ibank.firstbank.com.tw/NetBank/index103.html',
    automation: {
      loginTriggerSelector: 'captchaLoginArea',
      loginTriggerAction: 'javascript:clickArea();',
    },
  },
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

function parseJsonMap(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getProviderProfile(provider) {
  const normalizedProvider = normalizeText(provider).toLowerCase()
  if (!normalizedProvider) return null
  return DEFAULT_PROVIDER_PROFILES[normalizedProvider] ?? null
}

function getProviderLoginUrl(provider) {
  const normalizedProvider = normalizeText(provider).toLowerCase()
  const map = parseJsonMap(process.env.BANK_SYNC_PLAYWRIGHT_LOGIN_URLS_JSON)
  const mappedUrl = normalizeText(map?.[normalizedProvider])
  if (mappedUrl) return mappedUrl
  const profileUrl = normalizeText(getProviderProfile(normalizedProvider)?.loginUrl)
  if (profileUrl) return profileUrl
  return normalizeText(process.env.BANK_SYNC_PLAYWRIGHT_LOGIN_URL)
}

function createSessionId() {
  return `pw_bank_${randomUUID().replace(/-/g, '')}`
}

function normalizeCredentialPayload(payload = {}) {
  const source = payload?.credentials && typeof payload.credentials === 'object'
    ? payload.credentials
    : payload

  return {
    loginCustIdFake: normalizeText(source?.loginCustIdFake ?? source?.nationalId),
    usrIdInput: normalizeText(source?.usrIdInput ?? source?.code),
    pwd: String(source?.pwd ?? source?.password ?? ''),
    vrfyCode: normalizeText(source?.vrfyCode ?? source?.captchaCode),
  }
}

function normalizeAutomationPayload(payload = {}) {
  const source = payload?.automation && typeof payload.automation === 'object'
    ? payload.automation
    : payload
  const provider = normalizeText(payload?.provider).toLowerCase()
  const providerProfile = getProviderProfile(provider)
  const providerAutomation = providerProfile?.automation && typeof providerProfile.automation === 'object'
    ? providerProfile.automation
    : {}
  const sourceFields = source?.fields && typeof source.fields === 'object' ? source.fields : {}
  const providerFields = providerAutomation?.fields && typeof providerAutomation.fields === 'object'
    ? providerAutomation.fields
    : {}
  const fields = {
    ...providerFields,
    ...sourceFields,
  }
  const refreshText = normalizeText(
    source?.refreshCaptchaAction
      ?? providerAutomation?.refreshCaptchaAction
      ?? 'javascript:chgImg();',
  )
  const refreshScript = refreshText.toLowerCase().startsWith('javascript:')
    ? refreshText.slice('javascript:'.length).trim()
    : refreshText
  const loginTriggerText = normalizeText(
    source?.loginTriggerAction
      ?? providerAutomation?.loginTriggerAction,
  )
  const loginTriggerScript = loginTriggerText.toLowerCase().startsWith('javascript:')
    ? loginTriggerText.slice('javascript:'.length).trim()
    : loginTriggerText

  return {
    selectors: {
      loginCustIdFake: `#${normalizeText(fields.loginCustIdFake || 'loginCustIdFake')}`,
      usrIdInput: `#${normalizeText(fields.usrIdInput || 'usrIdInput')}`,
      pwd: `#${normalizeText(fields.pwd || 'pwd')}`,
      vrfyCode: `#${normalizeText(fields.vrfyCode || 'vrfyCode')}`,
      codeVerify: `#${normalizeText(source?.captchaImageId || providerAutomation?.captchaImageId || 'code_verify')}`,
      loginTrigger: `#${normalizeText(source?.loginTriggerSelector || providerAutomation?.loginTriggerSelector || '')}`,
    },
    loginTriggerScript,
    loginTriggerAction: loginTriggerText,
    refreshScript,
    refreshAction: refreshText || 'javascript:chgImg();',
  }
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

async function openLoginPage(sessionId, loginUrl) {
  await runPlaywrightCli(['--session', sessionId, 'open', loginUrl])
}

async function captureCaptcha(sessionId, automation, refreshCaptcha = false) {
  const payload = {
    selector: automation.selectors.codeVerify,
    refreshScript: refreshCaptcha ? automation.refreshScript : '',
  }
  const code = `
const payload = ${JSON.stringify(payload)};
await page.waitForLoadState('domcontentloaded');
if (payload.refreshScript) {
  try {
    await page.evaluate((script) => { (0, eval)(script); }, payload.refreshScript);
    await page.waitForTimeout(600);
  } catch (_error) {}
}
await page.waitForSelector(payload.selector, { state: 'visible', timeout: 10000 }).catch(() => null);
const image = await page.$(payload.selector);
if (!image) {
  return { ok: false, reason: 'captcha_not_found' };
} else {
  await page.waitForFunction((selector) => {
    const img = document.querySelector(selector);
    return Boolean(img && img.complete && Number(img.naturalWidth) > 0);
  }, payload.selector, { timeout: 10000 }).catch(() => null);
  const src = await image.getAttribute('src');
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
  let resolved = '';
  if (src) {
    try {
      resolved = new URL(src, page.url()).toString();
    } catch (_error) {
      resolved = src;
    }
  }
  return {
    ok: true,
    src: resolved,
    dataUrl: 'data:image/png;base64,' + screenshot,
  };
}
`

  const response = await runPlaywrightJson(sessionId, code)
  if (!response || response.ok !== true) {
    return {
      src: '',
      dataUrl: '',
    }
  }
  return {
    src: normalizeText(response.src),
    dataUrl: normalizeText(response.dataUrl),
  }
}

function createPlaywrightConnectionId(provider, sessionId, userCode) {
  return `pw_conn_${simpleHash(`${provider}:${sessionId}:${userCode}:${Date.now()}`)}`
}

function createPlaywrightAccounts(connectionId, userCode, titleText = '') {
  const maskedCode = normalizeText(userCode).slice(-4) || '0000'
  const label = normalizeText(titleText) || 'Playwright Bank'
  return [
    {
      account_id: `${connectionId}_primary`,
      name: `${label} 主帳戶`,
      mask: maskedCode,
      type: 'depository',
      currency: 'TWD',
    },
  ]
}

export async function createPlaywrightBankLinkSession(payload = {}) {
  const provider = normalizeText(payload.provider).toLowerCase()
  if (!provider) {
    throw new Error('provider is required')
  }

  const loginUrl = getProviderLoginUrl(provider)
  if (!loginUrl) {
    throw new Error(`provider "${provider}" is not configured yet`)
  }

  const sessionId = normalizeText(payload.session_id) || createSessionId()
  const refreshCaptcha = Boolean(payload.refresh_captcha)
  const automation = normalizeAutomationPayload(payload)

  if (!refreshCaptcha || !normalizeText(payload.session_id)) {
    await openLoginPage(sessionId, loginUrl)
  }

  const captcha = await captureCaptcha(sessionId, automation, refreshCaptcha)
  const expiresAtMs = Date.now() + PLAYWRIGHT_SESSION_TTL_MS

  return {
    provider,
    session_id: sessionId,
    link_url: loginUrl,
    expires_at: new Date(expiresAtMs).toISOString(),
    captcha_image_src: captcha.src,
    captcha_image_data_url: captcha.dataUrl,
    refresh_captcha_action: automation.refreshAction,
  }
}

export async function exchangePlaywrightBankAuth(payload = {}) {
  const provider = normalizeText(payload.provider).toLowerCase()
  const credentials = normalizeCredentialPayload(payload)
  const automation = normalizeAutomationPayload(payload)
  let sessionId = normalizeText(payload.session_id)

  if (!provider) throw new Error('provider is required')
  if (!credentials.loginCustIdFake) throw new Error('身分證字號不可為空')
  if (!credentials.usrIdInput) throw new Error('代碼不可為空')
  if (!credentials.pwd) throw new Error('密碼不可為空')
  if (!credentials.vrfyCode) throw new Error('驗證碼不可為空')

  if (!sessionId) {
    const session = await createPlaywrightBankLinkSession(payload)
    sessionId = normalizeText(session.session_id)
  }

const submitPayload = {
  selectors: automation.selectors,
  loginTriggerScript: automation.loginTriggerScript,
  values: credentials,
}
  const code = `
const payload = ${JSON.stringify(submitPayload)};
await page.waitForLoadState('domcontentloaded');
const requiredEntries = Object.entries(payload.selectors);
for (const [key, selector] of requiredEntries) {
  if (key === 'codeVerify') continue;
  const el = await page.$(selector);
  if (!el) {
    throw new Error('missing_input:' + selector);
  }
}
await page.fill(payload.selectors.loginCustIdFake, payload.values.loginCustIdFake);
await page.fill(payload.selectors.usrIdInput, payload.values.usrIdInput);
await page.fill(payload.selectors.pwd, payload.values.pwd);
await page.fill(payload.selectors.vrfyCode, payload.values.vrfyCode);
if (payload.loginTriggerScript) {
  await page.evaluate((script) => { (0, eval)(script); }, payload.loginTriggerScript);
} else if (payload.selectors.loginTrigger) {
  await page.click(payload.selectors.loginTrigger);
} else {
  await page.evaluate((selectors) => {
    const input = document.querySelector(selectors.vrfyCode);
    const form = input?.form || document.querySelector('form');
    if (!form) {
      throw new Error('login_form_not_found');
    }
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return;
    }
    form.submit();
  }, payload.selectors);
}
await page.waitForTimeout(1800);
const stillVisible =
  Boolean(await page.$(payload.selectors.loginCustIdFake))
  || Boolean(await page.$(payload.selectors.usrIdInput))
  || Boolean(await page.$(payload.selectors.pwd));
const title = await page.title();
return {
  ok: !stillVisible,
  loginFormVisible: stillVisible,
  title,
  url: page.url(),
};
`

  try {
    const result = await runPlaywrightJson(sessionId, code)
    if (!result || result.ok !== true) {
      throw new Error('銀行登入未完成，請確認身分證字號、代碼、密碼與驗證碼')
    }

    const connectionId = createPlaywrightConnectionId(provider, sessionId, credentials.usrIdInput)
    const title = normalizeText(result.title)
    return {
      provider,
      institution_name: title || provider,
      connection_id: connectionId,
      connection_name: title || provider,
      accounts: createPlaywrightAccounts(connectionId, credentials.usrIdInput, title),
      access_token_ref: `playwright:${sessionId}`,
      created_at: new Date().toISOString(),
    }
  } finally {
    await closePlaywrightSession(sessionId)
  }
}
