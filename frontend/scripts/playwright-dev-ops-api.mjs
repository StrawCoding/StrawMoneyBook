import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(frontendDir, '..')
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(frontendDir, 'playwright-cli.json')
const devPort = Number(process.env.DEV_OPS_PLAYWRIGHT_PORT || 5179)
const devOrigin = `http://127.0.0.1:${devPort}`
const opsApiBase = 'https://api.strawmb.com'
const playwrightCliSession = process.env.PLAYWRIGHT_CLI_SESSION
  || `smb-dev-ops-${devPort}-${process.pid}`

async function runPlaywrightCli(args, { raw = false } = {}) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    '-s',
    playwrightCliSession,
    ...(raw ? ['--raw'] : []),
    ...args,
  ], {
    cwd: frontendDir,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
      PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
      PLAYWRIGHT_CLI_SESSION: playwrightCliSession,
    },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180000,
  })
}

async function evalPage(script) {
  const result = await runPlaywrightCli(['eval', script], { raw: true })
  const stdout = String(result.stdout ?? '').trim()
  if (!stdout) throw new Error('playwright eval returned empty payload')
  return JSON.parse(stdout)
}

async function waitForDevReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(devOrigin)
      if (response.ok) return
    } catch {
      // retry
    }
    await delay(500)
  }
  throw new Error(`npm run dev not ready at ${devOrigin}`)
}

function startDevServer() {
  return spawn(
    resolve(frontendDir, 'node_modules/.bin/vite'),
    [
      '--host',
      '127.0.0.1',
      '--port',
      String(devPort),
      '--strictPort',
    ],
    {
      cwd: frontendDir,
      stdio: 'ignore',
      env: process.env,
    },
  )
}

function stopDevServer(child) {
  if (child?.pid) {
    try {
      spawn('pkill', ['-P', String(child.pid)], { stdio: 'ignore' })
    } catch {
      // ignore
    }
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
  try {
    spawn('fuser', ['-k', `${devPort}/tcp`], { stdio: 'ignore' })
  } catch {
    // ignore
  }
}

async function main() {
  const preview = startDevServer()
  try {
    await waitForDevReady()
    await runPlaywrightCli(['open', devOrigin])
    await delay(2500)

    const boot = await evalPage(`() => ({
      href: location.href,
      origin: location.origin,
      title: document.title,
      bodyText: (document.body?.innerText || '').slice(0, 240),
    })`)
    assert.match(String(boot.title || ''), /StrawMoneyBook/i)
    assert.equal(boot.origin, devOrigin)

    const modules = await evalPage(`() => Promise.all([
      fetch('/src/services/shared-ledger/backend.js').then((response) => response.text()),
      fetch('/src/services/einvoice/scrape-api.js').then((response) => response.text()),
      fetch('/src/services/bank-sync/backend.js').then((response) => response.text()),
      fetch('/src/services/einvoice/auth.js').then((response) => response.text()),
    ]).then(([sharedLedger, einvoice, bankSync, googleAuth]) => ({
      sharedLedger,
      einvoice,
      bankSync,
      googleAuth,
    }))`)

    assert.match(modules.sharedLedger, /https:\/\/api\.strawmb\.com/)
    assert.match(modules.einvoice, /https:\/\/api\.strawmb\.com/)
    assert.match(modules.bankSync, /https:\/\/api\.strawmb\.com/)
    assert.match(modules.googleAuth, /https:\/\/api\.strawmb\.com/)

    const health = await evalPage(`() => fetch(${JSON.stringify(`${opsApiBase}/health`)})
      .then(async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
      }))
      .catch((error) => ({ error: String(error?.message || error) }))`)

    assert.equal(health.error, undefined, `ops API health fetch from npm run dev origin failed: ${health.error}`)
    assert.equal(health.status, 200)
    assert.equal(health.body?.ok, true)
    assert.equal(health.body?.service, 'strawmoneybook-backend')

    const resources = await evalPage(`() => performance.getEntriesByType('resource').map((entry) => entry.name)`)
    const opsHits = (resources || []).filter((name) => String(name).includes('api.strawmb.com'))
    const localApiHits = (resources || []).filter((name) => /127\.0\.0\.1:\d+\/api\//.test(String(name)))
    assert.equal(
      localApiHits.length,
      0,
      `npm run dev must not call Vite local /api middleware; got ${JSON.stringify(localApiHits)}`,
    )

    const requestsOut = String((await runPlaywrightCli(['requests'])).stdout || '')
    assert.doesNotMatch(
      requestsOut,
      /127\.0\.0\.1:\d+\/api\//,
      `npm run dev network log must not include Vite local /api; got ${requestsOut.slice(0, 1200)}`,
    )

    console.log(JSON.stringify({
      ok: true,
      devOrigin,
      opsHealth: `${opsApiBase}/health`,
      href: boot.href,
      opsResourceHits: opsHits.length,
    }))
  } finally {
    try {
      await runPlaywrightCli(['close'])
    } catch {
      // session may already be gone
    }
    stopDevServer(preview)
    await delay(400)
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[playwright-dev-ops-api] ${error?.message || error}`)
    process.exitCode = 1
  })
}
