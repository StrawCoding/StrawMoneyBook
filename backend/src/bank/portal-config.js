function normalizeText(value) {
  return String(value ?? '').trim()
}

export const DEFAULT_FIRST_BANK_BASE_URL = 'https://ibank.firstbank.com.tw'
export const DEFAULT_FIRST_BANK_LOGIN_PAGE = '/NetBank/index103.html'
export const DEFAULT_FIRST_BANK_FRAME_PAGE = '/NetBank/frame.html'
export const DEFAULT_FIRST_BANK_CAPTCHA_PATH = '/NetBank/code_verify1.jpg'
export const DEFAULT_FIRST_BANK_LOGIN_AREA_PATH = '/NetBank/loadloginArea.html'

export const DEFAULT_FIRST_BANK_ANCHORS = {
  loginForm: ['loginCustIdFake', 'usrIdInput', 'pwd'],
  codeVerify: ['code_verify'],
  captchaLoginArea: ['captchaLoginArea'],
  vrfyCode: ['vrfyCode'],
}

export function getFirstBankBaseUrl() {
  return normalizeText(process.env.FIRST_BANK_PORTAL_BASE_URL) || DEFAULT_FIRST_BANK_BASE_URL
}

export function getFirstBankLoginUrl() {
  const override = normalizeText(process.env.FIRST_BANK_PORTAL_LOGIN_URL)
  if (override) return override
  return new URL(DEFAULT_FIRST_BANK_LOGIN_PAGE, getFirstBankBaseUrl()).toString()
}

export function getFirstBankCaptchaUrl() {
  const override = normalizeText(process.env.FIRST_BANK_PORTAL_CAPTCHA_URL)
  if (override) return override
  return new URL(`${DEFAULT_FIRST_BANK_CAPTCHA_PATH}?v=${Date.now()}`, getFirstBankBaseUrl()).toString()
}

export function getFirstBankLoginAreaUrl() {
  const override = normalizeText(process.env.FIRST_BANK_PORTAL_LOGIN_AREA_URL)
  if (override) return override
  return new URL(`${DEFAULT_FIRST_BANK_LOGIN_AREA_PATH}?v=${Date.now()}`, getFirstBankBaseUrl()).toString()
}

export function getFirstBankFrameUrl() {
  const override = normalizeText(process.env.FIRST_BANK_PORTAL_FRAME_URL)
  if (override) return override
  return new URL(DEFAULT_FIRST_BANK_FRAME_PAGE, getFirstBankBaseUrl()).toString()
}

export function getFirstBankAnchors() {
  return DEFAULT_FIRST_BANK_ANCHORS
}
