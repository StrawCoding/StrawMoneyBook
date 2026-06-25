import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execFileAsync = promisify(execFile)
const frontendDir = '/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend'
const previewPort = Number(process.env.UI_LAYOUT_PLAYWRIGHT_PORT || 4174)
const baseUrl = `http://127.0.0.1:${previewPort}`

async function runPlaywrightCli(args, { raw = false } = {}) {
  const cliArgs = [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    ...(raw ? ['--raw'] : []),
    ...args,
  ]
  return execFileAsync('npx', cliArgs, {
    cwd: frontendDir,
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180000,
  })
}

async function evalPage(script) {
  const result = await runPlaywrightCli(['eval', script], { raw: true })
  const stdout = String(result.stdout ?? '').trim()
  if (!stdout) {
    throw new Error('playwright eval returned empty payload')
  }
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
    })`)
    if (state.hasBottomNav) return { ok: true, skipped: true }
    if (!state.booting && (state.welcome || state.intro)) break
    await delay(500)
  }
  return { ok: false, skipped: false }
}

async function completeOnboarding() {
  await runPlaywrightCli(['eval', `() => {
    try {
      localStorage.setItem('strawmoneybook.ui.layout', 'modern')
    } catch {
      // ignore
    }
    return true
  }`], { raw: true })

  const bootState = await waitForBootAndMaybeSkipOnboarding()
  if (bootState.ok) return bootState

  const welcome = await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)
  if (welcome) {
    await runPlaywrightCli(['click', "button:has-text('Next')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Playwright Ledger ${Date.now()}`])
    await runPlaywrightCli(['click', "button:has-text('Create Ledger'), button:has-text('建立帳本'), button:has-text('帳簿を作成')"])
    await delay(2500)

    const accountInputs = '.welcome-root input.input'
    await runPlaywrightCli(['fill', `${accountInputs} >> nth=0`, 'Cash'])
    await runPlaywrightCli(['fill', `${accountInputs} >> nth=1`, 'Wallet'])
    await runPlaywrightCli(['click', "button:has-text('Create Account'), button:has-text('建立帳戶'), button:has-text('口座を作成')"])
    await delay(3000)
  }

  const intro = await evalPage(`() => window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root'))`)
  if (intro) {
    await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
    await delay(1500)
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      path: window.location.pathname,
    })`)
    if (state.hasBottomNav) return { ok: true, skipped: false }
    if (state.intro) {
      await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
    }
    if (state.welcome) {
      return { ok: false, reason: 'still on welcome', path: state.path }
    }
    await delay(500)
  }

  return evalPage(`() => ({
    ok: false,
    reason: 'bottom-nav missing after onboarding',
    path: window.location.pathname,
    title: document.title,
    hasWelcome: Boolean(document.querySelector('.welcome-root')),
    hasIntro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    bodyText: document.body?.innerText?.slice(0, 400) ?? '',
  })`)
}

async function assertBottomNavIcons() {
  const result = await evalPage(`() => {
    const nav = document.querySelector('[data-testid=bottom-nav]')
    if (!nav) {
      return { ok: false, reason: 'bottom-nav missing' }
    }
    const items = [...nav.querySelectorAll('[data-testid^="bottom-nav-"]')]
    const iconStats = items.map((item) => ({
      id: item.getAttribute('data-testid'),
      pathCount: item.querySelectorAll('svg path').length,
    }))
    return {
      ok: iconStats.length >= 5 && iconStats.every((item) => item.pathCount > 0),
      iconStats,
      hasHomeModern: Boolean(document.querySelector('[data-testid=home-modern-view]')),
      hasHero: Boolean(document.querySelector('[data-testid=home-modern-hero]')),
    }
  }`)
  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasHomeModern, true, 'home-modern-view should render after onboarding')
  assert.equal(result.hasHero, true, 'home-modern-hero should render')
}

async function assertMorePageModuleIcons() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-more"]'])
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(300)
    const state = await evalPage(`() => ({
      hasMorePage: Boolean(document.querySelector('[data-testid=more-page]')),
      path: window.location.pathname,
    })`)
    if (state.hasMorePage) break
    if (attempt === 39) {
      throw new Error(`more-page missing at ${state.path}`)
    }
  }

  const result = await evalPage(`() => {
    const page = document.querySelector('[data-testid=more-page]')
    if (!page) return { ok: false, reason: 'more-page missing' }
    const moduleIcons = [...page.querySelectorAll('.module-icon-wrap svg path')]
    return {
      ok: moduleIcons.length > 0 && moduleIcons.every((pathEl) => pathEl.getAttribute('d')),
      pathCount: moduleIcons.length,
      hasGoogleDriveModule: [...page.querySelectorAll('a.module-link')].some((link) => link.getAttribute('href')?.includes('google-drive-ledger-sync')),
    }
  }`)
  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasGoogleDriveModule, true, 'more page should include google-drive-ledger-sync module tile')
}

async function waitForAppShell({ requireHomeModern = null, expectPersonalization = false } = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(400)
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasHomeModern: Boolean(document.querySelector('[data-testid=home-modern-view]')),
      hasPersonalization: Boolean(document.querySelector('[data-testid^="ui-layout-"]')),
      path: window.location.pathname,
    })`)
    if (state.booting || state.welcome) continue
    if (expectPersonalization) {
      if (state.hasPersonalization) return state
      continue
    }
    if (!state.hasBottomNav) continue
    if (requireHomeModern === true && !state.hasHomeModern) continue
    if (requireHomeModern === false && state.hasHomeModern) continue
    return state
  }
  throw new Error('app shell not ready')
}

async function assertLayoutSwitch() {
  await runPlaywrightCli(['click', 'a[href="/settings/personalization"]'])
  await waitForAppShell({ expectPersonalization: true })

  await runPlaywrightCli(['click', '[data-testid="ui-layout-traditional"]'])
  await delay(500)

  let traditional = await evalPage(`() => ({
    layout: document.documentElement.dataset.uiLayout ?? '',
    hasHomeModern: Boolean(document.querySelector('[data-testid=home-modern-view]')),
    hasFeaturesTab: Boolean(document.querySelector('[data-testid="bottom-nav-features"]')),
    hasMoreTab: Boolean(document.querySelector('[data-testid="bottom-nav-more"]')),
  })`)
  assert.equal(traditional.layout, 'traditional', JSON.stringify(traditional, null, 2))
  assert.equal(traditional.hasFeaturesTab, true, 'traditional layout should expose features tab')
  assert.equal(traditional.hasMoreTab, false, 'traditional layout should hide more tab')

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  traditional = await evalPage(`() => ({
    hasHomeModern: Boolean(document.querySelector('[data-testid=home-modern-view]')),
    hasFab: Boolean(document.querySelector('.fab.btn.primary')),
  })`)
  assert.equal(traditional.hasHomeModern, false, 'traditional home should not render home-modern-view')
  assert.equal(traditional.hasFab, true, 'traditional home should keep FAB quick add')

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-settings"]'])
  await delay(600)
  await runPlaywrightCli(['click', 'a[href="/settings/personalization"]'])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', '[data-testid="ui-layout-modern"]'])
  await delay(500)
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  await assertBottomNavIcons()
}

console.log('--- Playwright: ui layout settings + modern home ---')

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

  await assertBottomNavIcons()
  await assertMorePageModuleIcons()
  await assertLayoutSwitch()

  await runPlaywrightCli(['goto', `${baseUrl}/settings/personalization`])
  const personalizationSnapshot = await runPlaywrightCli(['snapshot'])
  const personalizationText = String(personalizationSnapshot.stdout ?? '')
  assert.match(personalizationText, /Interface style|介面風格|画面スタイル/u)
  assert.match(personalizationText, /Traditional|傳統|クラシック/u)
  assert.match(personalizationText, /Modern|現代|モダン/u)

  console.log('UI layout Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
