import { constants, createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto'

import { simpleHash } from './_utils.js'

const FIRST_BANK_PROVIDER = 'first_bank_tw'
const FIRST_BANK_BASE_URL = 'https://ibank.firstbank.com.tw'
const FIRST_BANK_LOGIN_PAGE = '/NetBank/frame.html'
const FIRST_BANK_LOGIN_ACTION = '/NetBank/login.html'
const FIRST_BANK_CAPTCHA_PATH = '/NetBank/code_verify1.jpg'
const FIRST_BANK_LOGIN_AREA_PATH = '/NetBank/loadloginArea.html'
const FIRST_BANK_PAYSECURE_PATH = '/NetBank/common/getPaySecure.jsp'
const FIRST_BANK_QRY_BHO_PATH = '/NetBank/qryBHOset.html'
const FIRST_BANK_DUP_LOGIN_PATH = '/NetBank/popup/ajax_isUsrLogin.html'
const FIRST_BANK_TXN_PATH = '/NetBank/2/010103.html'
const FIRST_BANK_TIME_ZONE = 'Asia/Taipei'
const FIRST_BANK_PRELOGIN_SESSION_TTL_MS = 10 * 60 * 1000
const FIRST_BANK_DEFAULT_REPEAT_SEQ = '0'
const FIRST_BANK_MAX_WINDOW_DAYS = 30
const FIRST_BANK_AES_KEY = 'SYSTEX.6214@FCB@'
const FIRST_BANK_AES_IV = '1234567890abcdef'
const FIRST_BANK_LOGIN_HIT_X = '160'
const FIRST_BANK_LOGIN_HIT_Y = '27'
const FIRST_BANK_DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeDigits(value) {
  return normalizeText(value).replace(/\D+/g, '')
}

function createIsoTimestamp() {
  return new Date().toISOString()
}

function createFirstBankConnectionId(loginId, accountNumber) {
  return `first_bank_conn_${simpleHash(`${normalizeText(loginId)}:${normalizeText(accountNumber)}`)}`
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function encodeSessionState(state) {
  return Buffer.from(JSON.stringify(state ?? {}), 'utf8').toString('base64url')
}

function decodeSessionState(token) {
  const normalized = normalizeText(token)
  if (!normalized) {
    return {
      provider: FIRST_BANK_PROVIDER,
      cookies: {},
      createdAt: createIsoTimestamp(),
      updatedAt: createIsoTimestamp(),
    }
  }

  try {
    const decoded = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf8'))
    if (!decoded || typeof decoded !== 'object') throw new Error('invalid')
    const cookies = decoded.cookies && typeof decoded.cookies === 'object' ? decoded.cookies : {}
    return {
      provider: FIRST_BANK_PROVIDER,
      cookies,
      createdAt: normalizeText(decoded.createdAt) || createIsoTimestamp(),
      updatedAt: createIsoTimestamp(),
    }
  } catch {
    throw new Error('first_bank session_id is invalid or expired')
  }
}

function extractSetCookieHeaders(headers) {
  if (typeof headers?.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const single = headers?.get?.('set-cookie')
  return single ? [single] : []
}

function mergeSetCookies(state, setCookieHeaders = []) {
  if (!Array.isArray(setCookieHeaders) || !setCookieHeaders.length) return state
  const next = {
    ...state,
    cookies: {
      ...(state?.cookies ?? {}),
    },
    updatedAt: createIsoTimestamp(),
  }

  for (const rawCookie of setCookieHeaders) {
    const firstPair = String(rawCookie ?? '').split(';')[0]
    const splitIndex = firstPair.indexOf('=')
    if (splitIndex <= 0) continue
    const key = firstPair.slice(0, splitIndex).trim()
    const value = firstPair.slice(splitIndex + 1).trim()
    if (!key) continue
    const isExpired = /max-age\s*=\s*0/i.test(rawCookie) || /expires\s*=\s*thu,\s*01 jan 1970/i.test(rawCookie)
    if (isExpired || /^deleted$/i.test(value)) {
      delete next.cookies[key]
      continue
    }
    next.cookies[key] = value
  }
  return next
}

function buildCookieHeader(state) {
  const cookies = state?.cookies && typeof state.cookies === 'object'
    ? Object.entries(state.cookies)
        .filter(([key, value]) => normalizeText(key) && normalizeText(value))
        .map(([key, value]) => `${key}=${value}`)
    : []
  return cookies.join('; ')
}

function buildAbsoluteUrl(pathOrUrl, baseUrl = FIRST_BANK_BASE_URL) {
  const value = normalizeText(pathOrUrl)
  if (!value) throw new Error('missing First Bank URL')
  if (/^https?:\/\//i.test(value)) return value
  return new URL(value, baseUrl || FIRST_BANK_BASE_URL).toString()
}

async function requestWithSession(pathOrUrl, options = {}, state) {
  const method = normalizeText(options.method || 'GET').toUpperCase() || 'GET'
  let url = buildAbsoluteUrl(pathOrUrl)
  let body = options.body
  let headers = {
    ...FIRST_BANK_DEFAULT_HEADERS,
    ...(options.headers ?? {}),
  }
  let nextMethod = method
  let redirectCount = 0
  let sessionState = state

  while (redirectCount <= 5) {
    const cookieHeader = buildCookieHeader(sessionState)
    const requestHeaders = {
      ...headers,
    }
    if (cookieHeader) requestHeaders.Cookie = cookieHeader

    const response = await fetch(url, {
      method: nextMethod,
      headers: requestHeaders,
      body,
      redirect: 'manual',
    })

    sessionState = mergeSetCookies(sessionState, extractSetCookieHeaders(response.headers))

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = normalizeText(response.headers.get('location'))
      if (!location) {
        return { response, sessionState, url }
      }
      url = new URL(location, url).toString()
      redirectCount += 1
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && nextMethod !== 'GET' && nextMethod !== 'HEAD')) {
        nextMethod = 'GET'
        body = undefined
        headers = {
          ...headers,
        }
        delete headers['Content-Type']
      }
      continue
    }

    return {
      response,
      sessionState,
      url,
    }
  }

  throw new Error('First Bank request exceeded redirect limit')
}

async function getHtmlWithSession(pathOrUrl, options, state) {
  const { response, sessionState, url } = await requestWithSession(pathOrUrl, options, state)
  const html = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    url,
    html,
    sessionState,
  }
}

async function postFormWithSession(pathOrUrl, data, state, options = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(data ?? {})) {
    params.set(key, String(value ?? ''))
  }

  return getHtmlWithSession(
    pathOrUrl,
    {
      method: 'POST',
      body: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(options.headers ?? {}),
      },
    },
    state,
  )
}

function decodeHtmlEntities(input) {
  const text = String(input ?? '')
  const named = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&#x2F;/gi, '/')

  return named.replace(/&#(\d+);/g, (_, code) => {
    const number = Number(code)
    return Number.isFinite(number) ? String.fromCharCode(number) : ''
  })
}

function stripTags(input) {
  return decodeHtmlEntities(String(input ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractHiddenInputValue(html, name) {
  const normalized = normalizeText(name)
  if (!normalized) return ''
  const patterns = [
    new RegExp(`<input[^>]+name=["']${normalized}["'][^>]+value=["']([^"']*)["']`, 'i'),
    new RegExp(`<input[^>]+id=["']${normalized}["'][^>]+value=["']([^"']*)["']`, 'i'),
    new RegExp(`<input[^>]+value=["']([^"']*)["'][^>]+name=["']${normalized}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1] !== undefined) return decodeHtmlEntities(match[1])
  }

  return ''
}

function parseHtmlAttributes(html) {
  const attrs = {}
  const pattern = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match = pattern.exec(String(html ?? ''))
  while (match) {
    const key = normalizeText(match[1]).toLowerCase()
    if (!key) {
      match = pattern.exec(String(html ?? ''))
      continue
    }
    attrs[key] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '')
    match = pattern.exec(String(html ?? ''))
  }
  return attrs
}

function extractForms(html) {
  const forms = []
  const pattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi
  let match = pattern.exec(String(html ?? ''))
  while (match) {
    const attrs = parseHtmlAttributes(match[1])
    forms.push({
      html: match[0],
      action: normalizeText(attrs.action),
      method: normalizeText(attrs.method).toUpperCase() || 'GET',
    })
    match = pattern.exec(String(html ?? ''))
  }
  return forms
}

function extractFormInputs(formHtml) {
  const inputs = []
  const pattern = /<input\b([^>]*)>/gi
  let match = pattern.exec(String(formHtml ?? ''))
  while (match) {
    const attrs = parseHtmlAttributes(match[1])
    const name = normalizeText(attrs.name || attrs.id)
    const type = normalizeText(attrs.type).toLowerCase() || 'text'
    if (!name) {
      match = pattern.exec(String(formHtml ?? ''))
      continue
    }
    if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) {
      match = pattern.exec(String(formHtml ?? ''))
      continue
    }
    if ((type === 'checkbox' || type === 'radio') && !Object.hasOwn(attrs, 'checked')) {
      match = pattern.exec(String(formHtml ?? ''))
      continue
    }
    inputs.push({
      name,
      type,
      value: decodeHtmlEntities(attrs.value ?? ''),
    })
    match = pattern.exec(String(formHtml ?? ''))
  }
  return inputs
}

function findFirstBankLoginForm(html) {
  const forms = extractForms(html)
  return forms.find((form) => {
    const inputNames = new Set(
      extractFormInputs(form.html).map((item) => normalizeText(item.name).toLowerCase()),
    )
    return inputNames.has('logincustidfake') && inputNames.has('usrid') && inputNames.has('pwd') && inputNames.has('vrfycode')
  }) ?? null
}

function parseRectCenterFromCoords(coordsText) {
  const parts = String(coordsText ?? '')
    .split(',')
    .map((part) => Number(String(part ?? '').trim()))
    .filter((value) => Number.isFinite(value))

  if (parts.length < 4) return null
  const [left, top, right, bottom] = parts
  if (right < left || bottom < top) return null
  return {
    hitX: String(Math.round((left + right) / 2)),
    hitY: String(Math.round((top + bottom) / 2)),
  }
}

function extractFirstBankLoginAreaPoint(html) {
  const text = String(html ?? '')
  const patterns = [
    /<area\b[^>]+coords=["']([^"']+)["'][^>]+href=["']javascript:\s*clickArea\(\)\s*;?["']/i,
    /<area\b[^>]+href=["']javascript:\s*clickArea\(\)\s*;?["'][^>]+coords=["']([^"']+)["']/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const center = parseRectCenterFromCoords(match?.[1] ?? '')
    if (center) return center
  }
  return {
    hitX: '',
    hitY: '',
  }
}

function extractFirstBankLoginPageMeta(html) {
  const form = findFirstBankLoginForm(html)
  const formFields = Object.fromEntries(
    extractFormInputs(form?.html ?? String(html ?? '')).map((item) => [item.name, item.value]),
  )
  const loginAreaPoint = extractFirstBankLoginAreaPoint(form?.html ?? html)
  return {
    formFields,
    loginAreaPoint,
  }
}

function sha1Base64NoPadding(value) {
  return createHash('sha1').update(String(value ?? ''), 'utf8').digest('base64').replace(/=+$/g, '')
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')
}

function sha1Hex(value) {
  return createHash('sha1').update(String(value ?? ''), 'utf8').digest('hex')
}

function countMatchingCharacters(value, pattern) {
  return String(value ?? '')
    .split('')
    .filter((char) => pattern.test(char))
    .length
}

function createUsrIdEncryption(userCode) {
  const cipher = createCipheriv('aes-128-gcm', Buffer.from(FIRST_BANK_AES_KEY, 'utf8'), Buffer.from(FIRST_BANK_AES_IV, 'utf8'))
  const encrypted = Buffer.concat([
    cipher.update(String(userCode ?? ''), 'utf8'),
    cipher.final(),
  ])
  return {
    encData: encrypted.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

function createRsaPublicKey(modulusHex, exponentHex) {
  return createPublicKey({
    key: {
      kty: 'RSA',
      n: toBase64Url(Buffer.from(modulusHex, 'hex')),
      e: toBase64Url(Buffer.from(exponentHex, 'hex')),
    },
    format: 'jwk',
  })
}

function createFirstBankRsaBlock(plainText, paySecureConfig) {
  const rsaModulus = normalizeText(paySecureConfig?.RSAModule)
  const rsaExponent = normalizeText(paySecureConfig?.RSAExponent)
  if (rsaModulus.length !== 512 || !rsaExponent) {
    throw new Error('First Bank paysecure config is invalid')
  }

  const shapeHex = `${sha256Hex(plainText)}${sha1Hex(plainText)}`
  const tripleDesKeyHex = randomBytes(24).toString('hex')
  const tripleDesCipher = createCipheriv('des-ede3', Buffer.from(tripleDesKeyHex, 'hex'), null)
  tripleDesCipher.setAutoPadding(true)
  const encryptedPasswordHex = Buffer.concat([
    tripleDesCipher.update(Buffer.from(shapeHex, 'hex')),
    tripleDesCipher.final(),
  ]).toString('hex')

  const rsaCipherHex = publicEncrypt(
    {
      key: createRsaPublicKey(rsaModulus, rsaExponent),
      padding: constants.RSA_PKCS1_PADDING,
    },
    // First Bank encrypts the 24-byte TripleDES key bytes, not the 48-char hex text.
    Buffer.from(tripleDesKeyHex, 'hex'),
  ).toString('hex')

  return `${rsaCipherHex}${encryptedPasswordHex}`.toUpperCase()
}

async function fetchFirstBankPaySecureConfig(sessionState) {
  const response = await postFormWithSession(FIRST_BANK_PAYSECURE_PATH, {}, sessionState)
  try {
    return {
      sessionState: response.sessionState,
      config: JSON.parse(response.html),
    }
  } catch {
    throw new Error('First Bank paysecure config could not be parsed')
  }
}

async function initializeFirstBankLoginState(inputSessionId = '') {
  let sessionState
  try {
    sessionState = decodeSessionState(inputSessionId)
  } catch {
    sessionState = decodeSessionState('')
  }

  const pageRes = await getHtmlWithSession(FIRST_BANK_LOGIN_PAGE, { method: 'GET' }, sessionState)
  return {
    sessionState: pageRes.sessionState,
    loginPageHtml: pageRes.html,
    loginPageUrl: pageRes.url,
    loginPageMeta: extractFirstBankLoginPageMeta(pageRes.html),
  }
}

async function refreshFirstBankCaptcha(sessionState) {
  const timestamp = Date.now()
  const { response, sessionState: nextState } = await requestWithSession(
    `${FIRST_BANK_CAPTCHA_PATH}?v=${timestamp}`,
    {
      method: 'GET',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: buildAbsoluteUrl(FIRST_BANK_LOGIN_PAGE),
      },
    },
    sessionState,
  )
  const imageBuffer = Buffer.from(await response.arrayBuffer())
  return {
    sessionState: nextState,
    dataUrl: `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`,
  }
}

async function refreshFirstBankLoginArea(sessionState) {
  const timestamp = Date.now()
  const { response, sessionState: nextState } = await requestWithSession(
    `${FIRST_BANK_LOGIN_AREA_PATH}?v=${timestamp}`,
    {
      method: 'GET',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: buildAbsoluteUrl(FIRST_BANK_LOGIN_PAGE),
      },
    },
    sessionState,
  )
  const imageBuffer = Buffer.from(await response.arrayBuffer())
  return {
    sessionState: nextState,
    dataUrl: `data:${response.headers.get('content-type') || 'image/png'};base64,${imageBuffer.toString('base64')}`,
  }
}

async function fetchFirstBankLoginFlags(sessionState, loginId, repeatSeq = FIRST_BANK_DEFAULT_REPEAT_SEQ) {
  const loginTypeRes = await postFormWithSession(
    FIRST_BANK_QRY_BHO_PATH,
    {
      loginCustId: loginId,
      loginCustIdRptSeq: repeatSeq,
    },
    sessionState,
  )
  const loginSttsRes = await postFormWithSession(
    FIRST_BANK_DUP_LOGIN_PATH,
    {
      custId: `${loginId}${repeatSeq}`,
    },
    loginTypeRes.sessionState,
  )

  return {
    sessionState: loginSttsRes.sessionState,
    loginType: normalizeText(extractHiddenInputValue(loginTypeRes.html, 'loginType')) || '0',
    loginStts: normalizeText(extractHiddenInputValue(loginSttsRes.html, 'loginStts')) || '0',
  }
}

function createFirstBankLoginForm(credentials, paySecureConfig, flags, loginPageMeta = {}) {
  const loginId = normalizeText(credentials.loginCustIdFake).toUpperCase()
  const loginRepeatSeq = normalizeDigits(credentials.loginCustIdRptSeq || FIRST_BANK_DEFAULT_REPEAT_SEQ) || FIRST_BANK_DEFAULT_REPEAT_SEQ
  const userCode = normalizeText(credentials.usrIdInput)
  const password = String(credentials.pwd ?? '')
  const captchaCode = normalizeText(credentials.vrfyCode)
  const passwordPlain = `${loginId}${loginRepeatSeq}${password}`
  const encryptedUsrId = createUsrIdEncryption(userCode)
  const formFields = loginPageMeta?.formFields && typeof loginPageMeta.formFields === 'object'
    ? loginPageMeta.formFields
    : {}
  const loginAreaPoint = loginPageMeta?.loginAreaPoint && typeof loginPageMeta.loginAreaPoint === 'object'
    ? loginPageMeta.loginAreaPoint
    : {}
  const explicitHitX = normalizeDigits(credentials?.hitX)
  const explicitHitY = normalizeDigits(credentials?.hitY)
  const resolvedHitX = explicitHitX || normalizeDigits(loginAreaPoint.hitX)
  const resolvedHitY = explicitHitY || normalizeDigits(loginAreaPoint.hitY)
  if (!resolvedHitX || !resolvedHitY) {
    throw new Error('First Bank login position is required')
  }

  return {
    ...formFields,
    encData: encryptedUsrId.encData,
    tag: encryptedUsrId.tag,
    wmsFundCode: 'null',
    cm: 'null',
    chn: 'null',
    emp_id: 'null',
    dp: 'null',
    parameter: 'null',
    mgm: '',
    ccd: 'null',
    investCode: 'null',
    mgmCode: '',
    channel: '',
    fnctName: '',
    prdCode: '',
    custClass: '',
    loginCustId: loginId,
    loginCustIdFake: loginId,
    loginCustIdRptSeq: loginRepeatSeq,
    usrId: '',
    pwd: `${sha1Base64NoPadding(passwordPlain)}=`,
    vrfyCode: captchaCode,
    hitX: resolvedHitX,
    hitY: resolvedHitY,
    countInt: String(countMatchingCharacters(password, /\d/)),
    countLo: String(countMatchingCharacters(password, /[a-z]/)),
    countUp: String(countMatchingCharacters(password, /[A-Z]/)),
    browser: 'Chrome',
    osType: 'Linux',
    h1: '',
    noneLg: 'Y',
    macAddressFromCOM: '',
    macOS: '',
    show: 'null',
    showNotice: 'null',
    hashText2: sha1Base64NoPadding(password),
    rsaBlock: createFirstBankRsaBlock(passwordPlain, paySecureConfig),
    loginType: normalizeText(flags?.loginType) || '0',
    loginStts: normalizeText(flags?.loginStts) || '0',
  }
}

function isFirstBankLoginHtml(html, url = '') {
  const text = String(html ?? '')
  const normalizedUrl = normalizeText(url)
  return (
    /id=["']login-panel["']/i.test(text)
    || /id=["']code_verify["']/i.test(text)
    || normalizedUrl.includes('/NetBank/frame.html')
  )
}

function createFirstBankDateFormatter() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FIRST_BANK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const firstBankDateFormatter = createFirstBankDateFormatter()

function formatDateInTaipei(dateLike) {
  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) return ''
  return firstBankDateFormatter.format(date)
}

function normalizeBankDateInput(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const match = text.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return ''
  let year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return ''
  if (year < 1000) year += 1911
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatFirstBankDate(value) {
  const normalized = normalizeBankDateInput(value) || formatDateInTaipei(value)
  return normalized.replace(/-/g, '/')
}

function parseFirstBankCursor(cursor) {
  const text = normalizeText(cursor)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function buildFirstBankCursor(data = {}) {
  return JSON.stringify({
    initialStartDate: normalizeBankDateInput(data.initialStartDate),
  })
}

function shiftDateString(dateString, days) {
  const normalized = normalizeBankDateInput(dateString)
  if (!normalized) return ''
  const date = new Date(`${normalized}T00:00:00+08:00`)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return formatDateInTaipei(date)
}

function compareDateString(left, right) {
  const leftText = normalizeBankDateInput(left)
  const rightText = normalizeBankDateInput(right)
  if (!leftText && !rightText) return 0
  if (!leftText) return -1
  if (!rightText) return 1
  return leftText.localeCompare(rightText)
}

function resolveFirstBankSyncStartDate({ cursor, lastSyncAt, lookbackDays }) {
  const today = formatDateInTaipei(new Date())
  const cursorState = parseFirstBankCursor(cursor)
  const fromLastSync = normalizeText(lastSyncAt) ? formatDateInTaipei(lastSyncAt) : ''
  const fromCursor = normalizeBankDateInput(cursorState.initialStartDate)
  if (fromLastSync) return compareDateString(fromLastSync, today) > 0 ? today : fromLastSync
  if (fromCursor) return compareDateString(fromCursor, today) > 0 ? today : fromCursor
  const fallbackLookback = Math.max(0, Math.round(Number(lookbackDays ?? 3) || 3))
  return shiftDateString(today, fallbackLookback * -1) || today
}

function splitFirstBankDateRange(startDate, endDate, maxDays = FIRST_BANK_MAX_WINDOW_DAYS) {
  const normalizedStart = normalizeBankDateInput(startDate)
  const normalizedEnd = normalizeBankDateInput(endDate)
  if (!normalizedStart || !normalizedEnd) return []
  if (compareDateString(normalizedStart, normalizedEnd) > 0) return []

  const windows = []
  let cursor = normalizedStart
  while (compareDateString(cursor, normalizedEnd) <= 0) {
    const windowEnd = shiftDateString(cursor, Math.max(0, Math.round(Number(maxDays) || FIRST_BANK_MAX_WINDOW_DAYS)) - 1)
    const safeEnd = compareDateString(windowEnd, normalizedEnd) > 0 ? normalizedEnd : windowEnd
    windows.push({
      startDate: cursor,
      endDate: safeEnd,
      startDateBank: formatFirstBankDate(cursor),
      endDateBank: formatFirstBankDate(safeEnd),
    })
    cursor = shiftDateString(safeEnd, 1)
  }
  return windows
}

function extractTablesByClass(html, className) {
  const matches = []
  const pattern = new RegExp(`<table\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/table>`, 'gi')
  let match = pattern.exec(String(html ?? ''))
  while (match) {
    matches.push(match[0])
    match = pattern.exec(String(html ?? ''))
  }
  return matches
}

function extractTableRows(tableHtml) {
  const rows = []
  const pattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let match = pattern.exec(String(tableHtml ?? ''))
  while (match) {
    rows.push({
      html: match[0],
      cells: extractRowCells(match[0]),
    })
    match = pattern.exec(String(tableHtml ?? ''))
  }
  return rows
}

function extractRowCells(rowHtml) {
  const cells = []
  const pattern = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi
  let match = pattern.exec(String(rowHtml ?? ''))
  while (match) {
    cells.push(stripTags(match[1]))
    match = pattern.exec(String(rowHtml ?? ''))
  }
  return cells
}

function detectColumnKind(headerText, fallbackIndex) {
  const text = normalizeText(headerText).toLowerCase()
  if (!text) return fallbackIndex === 0 ? 'date' : `col_${fallbackIndex}`
  if (text.includes('日期') || text.includes('date') || text.includes('時間') || text.includes('txn')) return 'date'
  if (text.includes('摘要') || text.includes('說明') || text.includes('備註') || text.includes('交易內容') || text.includes('附言')) return 'description'
  if (text.includes('存入') || text.includes('貸方') || text.includes('credit')) return 'credit'
  if (text.includes('支出') || text.includes('提出') || text.includes('借方') || text.includes('debit') || text.includes('提款')) return 'debit'
  if (text.includes('金額') || text.includes('amount')) return 'amount'
  if (text.includes('餘額') || text.includes('balance')) return 'balance'
  return `col_${fallbackIndex}`
}

function isHeaderLikeCell(text) {
  const value = normalizeText(text).toLowerCase()
  if (!value) return false
  return (
    value.includes('日期')
    || value.includes('date')
    || value.includes('摘要')
    || value.includes('說明')
    || value.includes('存入')
    || value.includes('支出')
    || value.includes('金額')
    || value.includes('餘額')
    || value.includes('balance')
    || value.includes('amount')
  )
}

function buildFallbackColumnKinds(cellCount) {
  if (cellCount <= 0) return []
  if (cellCount === 1) return ['amount']
  if (cellCount === 2) return ['date', 'amount']
  if (cellCount === 3) return ['date', 'description', 'amount']
  if (cellCount === 4) return ['date', 'description', 'amount', 'balance']
  return ['date', 'description', 'credit', 'debit', 'balance', ...Array.from({ length: Math.max(0, cellCount - 5) }, (_, index) => `col_${index + 5}`)]
}

function looksLikeDateText(text) {
  return /(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})/.test(normalizeText(text))
}

function parseFirstBankPostedAt(text) {
  const match = normalizeText(text).match(/(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return ''
  let year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? 0)
  const minute = Number(match[5] ?? 0)
  const second = Number(match[6] ?? 0)
  if (year < 1000) year += 1911
  const iso = new Date(`${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`)
  return Number.isNaN(iso.getTime()) ? '' : iso.toISOString()
}

function parseAmountMinor(text) {
  const source = normalizeText(text)
  if (!source) return 0
  const negative = source.includes('(') || source.includes('-')
  const numeric = source.replace(/[^0-9.]/g, '')
  if (!numeric) return 0
  const amount = Math.round(Number(numeric) * 100)
  if (!Number.isFinite(amount) || amount === 0) return 0
  return negative ? amount * -1 : amount
}

function parseTransactionsFromTable(tableHtml, metadata = {}) {
  const rows = extractTableRows(tableHtml)
  if (!rows.length) return []
  const headerRowIndex = rows.findIndex((row) => row.cells.some((cell) => isHeaderLikeCell(cell)))
  const columnKinds = headerRowIndex >= 0
    ? rows[headerRowIndex].cells.map((cell, index) => detectColumnKind(cell, index))
    : buildFallbackColumnKinds(rows[0].cells.length)
  const dataRows = rows.slice(headerRowIndex >= 0 ? headerRowIndex + 1 : 0)
  const transactions = []

  for (const row of dataRows) {
    if (!row.cells.length) continue
    const cellMap = Object.fromEntries(row.cells.map((cell, index) => [columnKinds[index] || `col_${index}`, cell]))
    const dateCell = cellMap.date || row.cells.find((cell) => looksLikeDateText(cell)) || ''
    const creditMinor = parseAmountMinor(cellMap.credit)
    const debitMinor = parseAmountMinor(cellMap.debit)
    const signedAmountMinor = creditMinor || (debitMinor ? debitMinor * -1 : parseAmountMinor(cellMap.amount))
    if (!dateCell || !signedAmountMinor) continue

    const description = normalizeText(
      cellMap.description
      || row.cells
        .filter((cell) => !looksLikeDateText(cell) && !/^[\d,().\-]+$/.test(cell.replace(/\s+/g, '')))
        .join(' ')
    )
    const postedAt = parseFirstBankPostedAt(dateCell)
    const balanceText = normalizeText(cellMap.balance)
    const providerTransactionId = `fbtxn_${simpleHash(`${metadata.accountId || ''}|${row.html.replace(/\s+/g, ' ').trim()}`)}`

    transactions.push({
      providerTransactionId,
      providerAccountId: normalizeText(metadata.accountId),
      postedAt: postedAt || new Date().toISOString(),
      amountMinor: signedAmountMinor,
      currency: 'TWD',
      description: description || 'First Bank transaction',
      merchant: '',
      status: 'posted',
      rawJson: JSON.stringify({
        accountId: metadata.accountId,
        rangeStart: metadata.rangeStart,
        rangeEnd: metadata.rangeEnd,
        cells: row.cells,
        balance: balanceText,
      }),
    })
  }

  return transactions
}

function hasNoDataMarker(html) {
  const text = stripTags(html).toLowerCase()
  return text.includes('查無資料') || text.includes('沒有資料') || text.includes('no data')
}

function hasFirstBankTransactionQueryMarkup(html) {
  const inputs = extractFormInputs(html)
  const inputNames = new Set(inputs.map((item) => normalizeText(item.name).toLowerCase()))
  return (
    (inputNames.has('txnstart') && inputNames.has('txnend'))
    || /onclick=["'][^"']*\bcontract\s*\(\s*\)[^"']*["']/i.test(String(html ?? ''))
  )
}

function findFirstBankTransactionQueryForm(html) {
  const forms = extractForms(html)
  const matchedForm = forms.find((form) => hasFirstBankTransactionQueryMarkup(form.html))
  if (matchedForm) return matchedForm
  if (!forms.length && hasFirstBankTransactionQueryMarkup(html)) {
    return {
      html: String(html ?? ''),
      action: '',
      method: 'GET',
    }
  }
  return null
}

function createFirstBankTransactionQuerySubmission(html, pageUrl, accountId, rangeStart, rangeEnd) {
  if (extractTablesByClass(html, 'CnbTable').length || hasNoDataMarker(html)) return null
  const form = findFirstBankTransactionQueryForm(html)
  if (!form) return null

  const rawAction = normalizeText(form.action)
  const actionUrl = (!rawAction || rawAction === '#' || rawAction.toLowerCase().startsWith('javascript:'))
    ? buildAbsoluteUrl(pageUrl)
    : buildAbsoluteUrl(rawAction, pageUrl)
  const fields = Object.fromEntries(
    extractFormInputs(form.html).map((item) => [item.name, item.value]),
  )
  const normalizedAccountId = normalizeDigits(accountId)
  const txnStart = formatFirstBankDate(rangeStart)
  const txnEnd = formatFirstBankDate(rangeEnd)

  if (normalizedAccountId) fields.acnt = normalizedAccountId
  if (txnStart) fields.txnStart = txnStart
  if (txnEnd) fields.txnEnd = txnEnd

  return {
    method: normalizeText(form.method).toUpperCase() || 'GET',
    actionUrl,
    fields,
  }
}

async function submitFirstBankTransactionQuery(sessionState, submission, refererUrl) {
  if (!submission) return null
  const normalizedMethod = normalizeText(submission.method).toUpperCase() || 'GET'
  if (normalizedMethod === 'POST') {
    return postFormWithSession(
      submission.actionUrl,
      submission.fields,
      sessionState,
      {
        headers: {
          Referer: buildAbsoluteUrl(refererUrl),
        },
      },
    )
  }

  const url = new URL(buildAbsoluteUrl(submission.actionUrl))
  for (const [key, value] of Object.entries(submission.fields ?? {})) {
    url.searchParams.set(key, String(value ?? ''))
  }
  return getHtmlWithSession(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Referer: buildAbsoluteUrl(refererUrl),
      },
    },
    sessionState,
  )
}

function parseFirstBankTransactions(html, metadata = {}) {
  const tables = extractTablesByClass(html, 'CnbTable')
  if (!tables.length) {
    if (hasNoDataMarker(html)) return []
    throw new Error('First Bank transaction table "CnbTable" was not found')
  }

  const parsedCandidates = tables
    .map((tableHtml) => parseTransactionsFromTable(tableHtml, metadata))
    .sort((left, right) => right.length - left.length)

  return parsedCandidates[0] ?? []
}

async function fetchFirstBankTransactionPage(sessionState, accountId, rangeStart, rangeEnd) {
  const url = new URL(FIRST_BANK_TXN_PATH, FIRST_BANK_BASE_URL)
  url.searchParams.set('acnt', accountId)
  url.searchParams.set('txnStart', formatFirstBankDate(rangeStart))
  url.searchParams.set('txnEnd', formatFirstBankDate(rangeEnd))

  const page = await getHtmlWithSession(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Referer: buildAbsoluteUrl(FIRST_BANK_LOGIN_PAGE),
      },
    },
    sessionState,
  )

  if (isFirstBankLoginHtml(page.html, page.url)) {
    const error = new Error('First Bank session expired, please reconnect and complete CAPTCHA login again')
    error.code = 'first_bank_session_expired'
    throw error
  }

  const submission = createFirstBankTransactionQuerySubmission(
    page.html,
    page.url,
    accountId,
    rangeStart,
    rangeEnd,
  )
  if (!submission) return page

  const queriedPage = await submitFirstBankTransactionQuery(page.sessionState, submission, page.url)
  if (!queriedPage) return page
  if (isFirstBankLoginHtml(queriedPage.html, queriedPage.url)) {
    const error = new Error('First Bank session expired, please reconnect and complete CAPTCHA login again')
    error.code = 'first_bank_session_expired'
    throw error
  }

  return queriedPage
}

async function ensureFirstBankLoggedIn(sessionId, credentials) {
  const loginId = normalizeText(credentials?.loginCustIdFake).toUpperCase()
  const userCode = normalizeText(credentials?.usrIdInput)
  const password = String(credentials?.pwd ?? '')
  const captchaCode = normalizeText(credentials?.vrfyCode)
  if (!loginId || !userCode || !password || !captchaCode) {
    throw new Error('First Bank credentials and CAPTCHA are required')
  }

  const loginState = await initializeFirstBankLoginState(sessionId)
  let sessionState = loginState.sessionState
  const flags = await fetchFirstBankLoginFlags(sessionState, loginId, FIRST_BANK_DEFAULT_REPEAT_SEQ)
  sessionState = flags.sessionState
  const paySecureConfigRes = await fetchFirstBankPaySecureConfig(sessionState)
  sessionState = paySecureConfigRes.sessionState
  const paySecureConfig = paySecureConfigRes.config
  const loginForm = createFirstBankLoginForm(credentials, paySecureConfig, flags, loginState.loginPageMeta)
  const loginResult = await postFormWithSession(
    FIRST_BANK_LOGIN_ACTION,
    loginForm,
    sessionState,
    {
      headers: {
        Referer: buildAbsoluteUrl(FIRST_BANK_LOGIN_PAGE),
      },
    },
  )

  if (isFirstBankLoginHtml(loginResult.html, loginResult.url)) {
    throw new Error('First Bank login failed. Please verify your credentials, account number, and CAPTCHA')
  }

  return {
    sessionState: loginResult.sessionState,
  }
}

function createFirstBankAccount(accountNumber) {
  const normalizedAccount = normalizeDigits(accountNumber)
  return {
    account_id: normalizedAccount,
    name: `First Bank ${normalizedAccount.slice(-4) || normalizedAccount}`,
    mask: normalizedAccount.slice(-4),
    type: 'depository',
    currency: 'TWD',
  }
}

export async function createFirstBankLinkSession(payload = {}) {
  const initializedState = await initializeFirstBankLoginState(payload.session_id)
  const captcha = await refreshFirstBankCaptcha(initializedState.sessionState)
  const loginArea = await refreshFirstBankLoginArea(captcha.sessionState)
  return {
    provider: FIRST_BANK_PROVIDER,
    session_id: encodeSessionState(loginArea.sessionState),
    link_url: buildAbsoluteUrl(FIRST_BANK_LOGIN_PAGE),
    captcha_image_data_url: captcha.dataUrl,
    login_area_image_data_url: loginArea.dataUrl,
    expires_at: new Date(Date.now() + FIRST_BANK_PRELOGIN_SESSION_TTL_MS).toISOString(),
  }
}

export async function exchangeFirstBankAuth(payload = {}) {
  const credentials = payload?.credentials && typeof payload.credentials === 'object' ? payload.credentials : payload
  const loginId = normalizeText(credentials?.loginCustIdFake).toUpperCase()
  const accountNumber = normalizeDigits(payload.account_number || payload.accountId || payload.provider_account_id)
  const today = formatDateInTaipei(new Date())
  const requestedInitialStartDate = normalizeBankDateInput(payload.initial_sync_start_date || payload.initialSyncStartDate)
  const initialSyncStartDate = requestedInitialStartDate && compareDateString(requestedInitialStartDate, today) <= 0
    ? requestedInitialStartDate
    : today
  if (!loginId) throw new Error('First Bank national ID is required')
  if (!accountNumber) throw new Error('First Bank account number is required')
  if (!normalizeDigits(credentials?.hitX) || !normalizeDigits(credentials?.hitY)) {
    throw new Error('First Bank login position is required')
  }

  const { sessionState } = await ensureFirstBankLoggedIn(payload.session_id, credentials)

  // Validate the session with the direct transaction-detail page described in the bank flow.
  await fetchFirstBankTransactionPage(
    sessionState,
    accountNumber,
    initialSyncStartDate,
    today,
  )

  return {
    provider: FIRST_BANK_PROVIDER,
    institution_name: 'First Bank',
    connection_id: createFirstBankConnectionId(loginId, accountNumber),
    connection_name: `First Bank ${accountNumber.slice(-4)}`,
    accounts: [createFirstBankAccount(accountNumber)],
    access_token_ref: encodeSessionState(sessionState),
    session_token: encodeSessionState(sessionState),
    sync_cursor: buildFirstBankCursor({
      initialStartDate: initialSyncStartDate,
    }),
    created_at: createIsoTimestamp(),
  }
}

export async function syncFirstBankTransactions(payload = {}) {
  const sessionToken = normalizeText(payload.session_token || payload.access_token_ref)
  if (!sessionToken) {
    throw new Error('First Bank sync requires a valid session token. Please reconnect and complete CAPTCHA login again')
  }

  let sessionState = decodeSessionState(sessionToken)
  const accountIds = Array.isArray(payload.account_ids)
    ? payload.account_ids.map((item) => normalizeDigits(item)).filter(Boolean)
    : []
  if (!accountIds.length) {
    throw new Error('First Bank sync requires at least one account_id')
  }

  const endDate = formatDateInTaipei(new Date())
  const startDate = resolveFirstBankSyncStartDate({
    cursor: payload.cursor || payload.next_cursor,
    lastSyncAt: payload.last_sync_at,
    lookbackDays: payload.lookback_days,
  })
  const ranges = splitFirstBankDateRange(startDate, endDate, FIRST_BANK_MAX_WINDOW_DAYS)
  const aggregated = []

  for (const accountId of accountIds) {
    for (const range of ranges) {
      const page = await fetchFirstBankTransactionPage(sessionState, accountId, range.startDate, range.endDate)
      sessionState = page.sessionState
      const transactions = parseFirstBankTransactions(page.html, {
        accountId,
        rangeStart: range.startDateBank,
        rangeEnd: range.endDateBank,
      })
      aggregated.push(...transactions)
    }
  }

  const deduped = Array.from(
    aggregated.reduce((map, transaction) => {
      const key = `${transaction.providerAccountId}:${transaction.providerTransactionId}`
      if (!map.has(key)) map.set(key, transaction)
      return map
    }, new Map()).values(),
  )

  return {
    added: deduped,
    modified: [],
    next_cursor: payload.cursor || payload.next_cursor || buildFirstBankCursor({
      initialStartDate: startDate,
    }),
    session_token: encodeSessionState(sessionState),
    sync_time: createIsoTimestamp(),
  }
}

export async function disconnectFirstBankAuth() {
  return {
    ok: true,
    provider: FIRST_BANK_PROVIDER,
    disconnected_at: createIsoTimestamp(),
  }
}

export {
  FIRST_BANK_PROVIDER,
  buildFirstBankCursor,
  createFirstBankTransactionQuerySubmission,
  extractFirstBankLoginAreaPoint,
  extractFirstBankLoginPageMeta,
  parseFirstBankCursor,
  parseFirstBankTransactions,
  resolveFirstBankSyncStartDate,
  splitFirstBankDateRange,
}
