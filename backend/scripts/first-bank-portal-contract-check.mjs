#!/usr/bin/env node
import {
  getFirstBankAnchors,
  getFirstBankBaseUrl,
  getFirstBankCaptchaUrl,
  getFirstBankLoginAreaUrl,
  getFirstBankLoginUrl,
} from '../src/bank/portal-config.js'

const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

function hasAnchor(html, ids = []) {
  return ids.some((id) => new RegExp(`id=["']${id}["']`, 'i').test(html))
}

async function fetchText(url, referer) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      Referer: referer ?? getFirstBankLoginUrl(),
    },
    signal: AbortSignal.timeout(Number(process.env.FIRST_BANK_CONTRACT_FETCH_TIMEOUT_MS) > 0
      ? Number(process.env.FIRST_BANK_CONTRACT_FETCH_TIMEOUT_MS)
      : 45_000),
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, text }
}

export async function runFirstBankPortalContractCheck() {
  const loginUrl = getFirstBankLoginUrl()
  const captchaUrl = getFirstBankCaptchaUrl()
  const loginAreaUrl = getFirstBankLoginAreaUrl()
  const anchorsConfig = getFirstBankAnchors()

  const checks = {
    loginUrl,
    captchaUrl,
    loginAreaUrl,
    baseUrl: getFirstBankBaseUrl(),
  }

  try {
    const loginPage = await fetchText(loginUrl)
    const loginHtml = loginPage.text ?? ''
    const anchors = {
      loginForm: hasAnchor(loginHtml, anchorsConfig.loginForm),
      codeVerify: hasAnchor(loginHtml, anchorsConfig.codeVerify)
        || /code_verify/i.test(loginHtml),
      captchaLoginArea: hasAnchor(loginHtml, anchorsConfig.captchaLoginArea),
      vrfyCode: hasAnchor(loginHtml, anchorsConfig.vrfyCode),
    }
    const mobileHint = /手機版|行動版|行動銀行|mobile\s*bank/i.test(loginHtml)

    let captchaFetch = null
    try {
      const captchaResponse = await fetch(captchaUrl, {
        method: 'GET',
        headers: {
          ...DEFAULT_HEADERS,
          Referer: loginUrl,
        },
        signal: AbortSignal.timeout(20_000),
      })
      const contentType = String(captchaResponse.headers.get('content-type') ?? '')
      captchaFetch = {
        ok: captchaResponse.ok && /image/i.test(contentType),
        status: captchaResponse.status,
        contentType,
      }
    } catch (error) {
      captchaFetch = {
        ok: false,
        error: String(error?.message ?? error),
      }
    }

    const ok = Boolean(
      loginPage.ok
      && anchors.loginForm
      && anchors.codeVerify
      && anchors.captchaLoginArea
      && anchors.vrfyCode
      && captchaFetch?.ok,
    )

    return {
      ok,
      checkedAt: new Date().toISOString(),
      checks,
      status: loginPage.status,
      anchors,
      mobileHint,
      captchaFetch,
    }
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      checks,
      error: String(error?.message ?? error),
    }
  }
}

async function main() {
  const payload = await runFirstBankPortalContractCheck()
  console.log(JSON.stringify(payload, null, 2))
  process.exitCode = payload.ok ? 0 : 1
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main()
}
