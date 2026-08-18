import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { getHostedWebApiBase, getHostedWebDistRoot } from './sync-official-site-web-app.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(frontendDir, '..')
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(frontendDir, 'playwright-cli.json')
const previewPort = Number(process.env.HOSTED_WEB_PLAYWRIGHT_PORT || 4188)
const hostedOrigin = `http://127.0.0.1:${previewPort}`
const hostedAppUrl = `${hostedOrigin}/app/`
const opsApiBase = getHostedWebApiBase()
const distRoot = getHostedWebDistRoot(frontendDir)
const playwrightCliSession = process.env.PLAYWRIGHT_CLI_SESSION
  || `smb-hosted-web-${previewPort}-${process.pid}`

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

async function waitForPreviewReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(hostedAppUrl)
      if (response.ok) return
    } catch {
      // retry
    }
    await delay(500)
  }
  throw new Error(`hosted web preview not ready at ${hostedAppUrl}`)
}

function startPreview() {
  const child = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(previewPort),
      '--strictPort',
      '--base',
      '/app/',
      '--outDir',
      distRoot,
    ],
    {
      cwd: frontendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  return child
}

async function stopPreview(child) {
  if (!child || child.killed) return
  child.kill('SIGTERM')
  await delay(400)
  if (!child.killed) child.kill('SIGKILL')
}

async function main() {
  if (!existsSync(resolve(distRoot, 'index.html'))) {
    throw new Error(`missing ${distRoot}/index.html; run npm run sync:official-site-web-app:build first`)
  }

  const indexHtml = readFileSync(resolve(distRoot, 'index.html'), 'utf8')
  assert.match(indexHtml, /\/app\/assets\//)
  assert.match(indexHtml, /api\.strawmb\.com/)

  const preview = startPreview()
  try {
    await waitForPreviewReady()
    await runPlaywrightCli(['open', hostedAppUrl])
    await delay(2500)

    const boot = await evalPage(`() => ({
      href: location.href,
      pathname: location.pathname,
      hash: location.hash,
      title: document.title,
      scriptSrcs: [...document.querySelectorAll('script[src]')].map((node) => node.getAttribute('src') || node.src),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '',
      bodyText: (document.body?.innerText || '').slice(0, 240),
    })`)

    assert.match(String(boot.title || ''), /StrawMoneyBook/i)
    assert.equal(boot.pathname, '/app/')
    assert.match(String(boot.csp), /https:\/\/api\.strawmb\.com/)
    assert.ok(
      (boot.scriptSrcs || []).some((src) => String(src).includes('/app/assets/')),
      `hosted web scripts must load from /app/assets/; got ${JSON.stringify(boot.scriptSrcs)}`,
    )

    const health = await evalPage(`() => fetch(${JSON.stringify(`${opsApiBase}/health`)})
      .then(async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
      }))
      .catch((error) => ({ error: String(error?.message || error) }))`)

    assert.equal(health.error, undefined, `ops API health fetch from hosted web origin failed: ${health.error}`)
    assert.equal(health.status, 200)
    assert.equal(health.body?.ok, true)
    assert.equal(health.body?.service, 'strawmoneybook-backend')

    const relativeProbe = await evalPage(`() => fetch('/api/health')
      .then((response) => ({ status: response.status, url: response.url }))
      .catch((error) => ({ error: String(error?.message || error) }))`)
    assert.notEqual(
      relativeProbe.status,
      200,
      'hosted web must not treat same-origin /api/health as the ops backend',
    )

    console.log(JSON.stringify({
      ok: true,
      hostedAppUrl,
      opsHealth: `${opsApiBase}/health`,
      href: boot.href,
      hash: boot.hash,
    }))
  } finally {
    await stopPreview(preview)
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[playwright-hosted-web-ops-api] ${error?.message || error}`)
    process.exitCode = 1
  })
}
