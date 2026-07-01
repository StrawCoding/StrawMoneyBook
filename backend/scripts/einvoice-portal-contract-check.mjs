#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  getCaptchaApiUrl,
  getLoginUrl,
  getSelectors,
} from '../src/einvoice/portal-config.js'
import { buildWaitForLoginSelectorsRunCode } from '../src/einvoice/portal-cloudflare.js'

const execFileAsync = promisify(execFile)
const backendRoot = fileURLToPath(new URL('..', import.meta.url))
const PLAYWRIGHT_CLI_CONFIG_PATH = fileURLToPath(new URL('../playwright-cli.json', import.meta.url))
const PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '.server-data/playwright-browsers'
const SELECTOR_WAIT_MS = Number(process.env.EINVOICE_CONTRACT_SELECTOR_WAIT_MS) > 0
  ? Number(process.env.EINVOICE_CONTRACT_SELECTOR_WAIT_MS)
  : 45_000
const SESSION_ID = `contract_${Date.now()}`

function getPlaywrightExecEnv() {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH,
    PLAYWRIGHT_MCP_CONFIG: PLAYWRIGHT_CLI_CONFIG_PATH,
    PLAYWRIGHT_MCP_HEADLESS: process.env.PLAYWRIGHT_MCP_HEADLESS ?? 'true',
  }
}

async function runPlaywrightCli(args = []) {
  return execFileAsync('npx', ['playwright-cli', `-s=${SESSION_ID}`, ...args], {
    env: getPlaywrightExecEnv(),
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180_000,
    cwd: backendRoot,
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
    try {
      return JSON.parse(lines[index])
    } catch {
      // continue
    }
  }
  return null
}

async function runCode(code) {
  const result = await runPlaywrightCli(['run-code', code])
  return extractLastJsonObject(result.stdout)
}

async function fetchCaptchaContract(captchaApiUrl) {
  const response = await fetch(captchaApiUrl, { method: 'GET' })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  const data = await response.json()
  const token = String(data?.token ?? '').trim()
  const image = String(data?.image ?? '').trim()
  return {
    ok: Boolean(token && image),
    hasToken: Boolean(token),
    hasImage: Boolean(image),
    tokenPrefix: token.slice(0, 12),
    status: response.status,
  }
}

async function checkLoginSelectors(loginUrl, selectors) {
  await runPlaywrightCli(['open', loginUrl])
  const code = `async (page) => {\n${buildWaitForLoginSelectorsRunCode(selectors, SELECTOR_WAIT_MS)}\n}`
  return runCode(code)
}

export async function runEinvoicePortalContractCheck() {
  const loginUrl = getLoginUrl()
  const captchaApiUrl = getCaptchaApiUrl()
  const selectors = getSelectors()
  const checks = {
    loginUrl,
    captchaApiUrl,
    selectors: {
      phone: selectors.phone,
      password: selectors.password,
      captchaInput: selectors.captchaInput,
      loginButton: selectors.loginButton,
    },
  }

  try {
    const captchaCheck = await fetchCaptchaContract(captchaApiUrl)
    let selectorCheck = null
    try {
      selectorCheck = await checkLoginSelectors(loginUrl, selectors)
    } catch (error) {
      selectorCheck = {
        ok: false,
        error: String(error?.message ?? error),
      }
    }

    const ok = Boolean(captchaCheck?.ok && selectorCheck?.ok)
    return {
      ok,
      checkedAt: new Date().toISOString(),
      checks,
      captchaCheck,
      selectorCheck,
    }
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      checks,
      error: String(error?.message ?? error),
      stderr: String(error?.stderr ?? '').slice(0, 500),
    }
  } finally {
    try {
      await runPlaywrightCli(['close'])
    } catch {
      // ignore
    }
  }
}

async function main() {
  const payload = await runEinvoicePortalContractCheck()
  console.log(JSON.stringify(payload, null, 2))
  process.exitCode = payload.ok ? 0 : 1
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main()
}
