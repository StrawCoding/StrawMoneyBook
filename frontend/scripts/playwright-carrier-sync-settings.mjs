import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(frontendDir, '..')
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(frontendDir, 'playwright-cli.json')
const previewPort = Number(process.env.CARRIER_SYNC_PLAYWRIGHT_PORT || 4175)
const baseUrl = `http://127.0.0.1:${previewPort}`

async function runPlaywrightCli(args, { raw = false } = {}) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    ...(raw ? ['--raw'] : []),
    ...args,
  ], {
    cwd: frontendDir,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
      PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
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
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) return
    } catch {
      // retry
    }
    await delay(500)
  }
  throw new Error(`preview server not ready at ${baseUrl}`)
}

async function waitForBootAndMaybeSkipOnboarding() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      path: window.location.pathname,
    })`)
    if (state.hasBottomNav && !state.welcome && !state.intro && state.path === '/') {
      return { ok: true, skipped: true }
    }
    if (!state.booting && (state.welcome || state.intro)) break
    await delay(500)
  }
  return { ok: false, skipped: false }
}

async function completeOnboarding() {
  await runPlaywrightCli(['eval', `() => {
    try { localStorage.setItem('strawmoneybook.ui.layout', 'modern') } catch {}
    return true
  }`], { raw: true })

  const bootState = await waitForBootAndMaybeSkipOnboarding()
  if (bootState.ok) return bootState

  const welcome = await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)
  if (welcome) {
    await runPlaywrightCli(['click', "button:has-text('Next')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Carrier Sync Ledger ${Date.now()}`])
    await runPlaywrightCli(['click', "button:has-text('Create Ledger'), button:has-text('建立帳本'), button:has-text('帳簿を作成')"])
    await delay(2500)
    const accountInputs = '.welcome-root input.input'
    await runPlaywrightCli(['fill', `${accountInputs} >> nth=0`, 'Cash'])
    await runPlaywrightCli(['fill', `${accountInputs} >> nth=1`, 'Wallet'])
    await runPlaywrightCli(['click', "button:has-text('Create Account'), button:has-text('建立帳戶'), button:has-text('口座を作成')"])
    await delay(3000)
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      path: window.location.pathname,
    })`)
    if (state.intro) {
      await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
      await delay(1000)
      continue
    }
    // Membership toast redirect can land here; force home before continuing.
    if (state.hasBottomNav && !state.welcome && !state.intro) {
      if (state.path === '/' || state.path === '/home') return { ok: true, skipped: false }
      await runPlaywrightCli(['goto', `${baseUrl}/`])
      await delay(800)
      const home = await evalPage(`() => ({
        path: window.location.pathname,
        hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
        welcome: Boolean(document.querySelector('.welcome-root')),
      })`)
      if (home.hasBottomNav && !home.welcome && (home.path === '/' || home.path === '/home')) {
        return { ok: true, skipped: false }
      }
    }
    await delay(500)
  }
  throw new Error('failed to reach home app-shell with BottomNav')
}

console.log('--- Playwright: carrier sync settings (app-shell) ---')
console.log('Building web preview bundle...')
await execFileAsync('npm', ['run', 'build:web'], {
  cwd: frontendDir,
  env: process.env,
  maxBuffer: 8 * 1024 * 1024,
  timeout: 300000,
})

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: frontendDir,
  stdio: 'ignore',
  env: process.env,
})

try {
  await waitForPreviewReady()
  await runPlaywrightCli(['delete-data'])
  await runPlaywrightCli(['open', `${baseUrl}/`])
  const onboarding = await completeOnboarding()
  assert.equal(onboarding.ok, true, JSON.stringify(onboarding, null, 2))

  await runPlaywrightCli(['goto', `${baseUrl}/settings`])
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasCarrierLink: Boolean(document.querySelector('a[href="/settings/carrier-sync"]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if (ready.path === '/settings' && ready.hasCarrierLink && ready.hasBottomNav) break
    await delay(400)
  }

  await runPlaywrightCli(['eval', `() => {
    const link = document.querySelector('a[href="/settings/carrier-sync"]')
    if (!link) throw new Error('missing carrier-sync settings link')
    link.click()
    return true
  }`], { raw: true })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasAvailability: Boolean(document.querySelector('[data-testid=carrier-sync-availability]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
    })`)
    if (ready.path === '/settings/carrier-sync' && ready.hasAvailability && ready.hasBottomNav && !ready.welcome) {
      break
    }
    await delay(400)
  }

  const state = await evalPage(`() => ({
    path: window.location.pathname,
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    hasAvailability: Boolean(document.querySelector('[data-testid=carrier-sync-availability]')),
    hasRecoveryCta: Boolean(document.querySelector('[data-testid=carrier-sync-recovery-cta]')),
    bodyText: document.body?.innerText?.slice(0, 800) ?? '',
    welcome: Boolean(document.querySelector('.welcome-root')),
  })`)

  assert.equal(state.welcome, false, 'must bypass onboarding / welcome')
  assert.equal(state.path, '/settings/carrier-sync', JSON.stringify(state, null, 2))
  assert.equal(state.hasBottomNav, true, 'must stay in app-shell with BottomNav')
  assert.equal(state.hasAvailability, true, 'availability panel required')
  assert.equal(state.hasRecoveryCta, true, 'single recovery CTA required')
  assert.match(state.bodyText, /載具|Carrier|可用性|Availability|会員|會員/u)

  console.log('Carrier sync Playwright app-shell route check passed')
} finally {
  preview.kill('SIGTERM')
}
