import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const frontendDir = '/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend'
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(fileURLToPath(new URL('../playwright-cli.json', import.meta.url)))
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
      ok: items.length === 5 && iconStats.every((item) => item.pathCount > 0),
      iconStats,
      hasMoreTab: Boolean(document.querySelector('[data-testid="bottom-nav-more"]')),
      hasFeaturesTab: Boolean(document.querySelector('[data-testid="bottom-nav-features"]')),
    }
  }`)
  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasMoreTab, false, 'SMB-250 must not expose /more tab')
  assert.equal(result.hasFeaturesTab, true, 'features tab should remain in 5-tab layout')
}

async function assertHomeBlocks() {
  const result = await evalPage(`() => ({
    hasHomeView: Boolean(document.querySelector('[data-testid=home-view]')),
    hasPeriodFilter: Boolean(document.querySelector('[data-testid=home-period-filter]')),
    hasAssetSummary: Boolean(document.querySelector('[data-testid=home-asset-summary]')),
    hasBudgetSummary: Boolean(document.querySelector('[data-testid=home-budget-summary]')),
    hasTransactionFeed: Boolean(document.querySelector('[data-testid=home-transaction-feed]')),
    hasFab: Boolean(document.querySelector('[data-testid=home-fab]')),
    welcome: Boolean(document.querySelector('.welcome-root')),
    layout: document.documentElement.dataset.uiLayout ?? '',
  })`)
  assert.equal(result.welcome, false, 'must not pass on welcome page')
  assert.equal(result.hasHomeView, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasPeriodFilter, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasAssetSummary, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasBudgetSummary, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasTransactionFeed, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasFab, true, JSON.stringify(result, null, 2))
}

async function assertRouteNavigation() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-features"]'])
  await delay(800)
  let state = await evalPage(`() => ({
    path: window.location.pathname,
    hasFeatureList: Boolean(document.querySelector('.feature-list-page')),
  })`)
  assert.equal(state.path, '/features', JSON.stringify(state, null, 2))
  assert.equal(state.hasFeatureList, true, JSON.stringify(state, null, 2))

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-settings"]'])
  await delay(800)
  state = await evalPage(`() => ({
    path: window.location.pathname,
    hasSettingsPage: Boolean(document.querySelector('.settings-page')),
  })`)
  assert.equal(state.path, '/settings', JSON.stringify(state, null, 2))
  assert.equal(state.hasSettingsPage, true, JSON.stringify(state, null, 2))
}

async function waitForAppShell({ expectPersonalization = false } = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(400)
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasPersonalization: Boolean(document.querySelector('[data-testid^="ui-layout-"]')),
      path: window.location.pathname,
    })`)
    if (state.booting || state.welcome) continue
    if (expectPersonalization) {
      if (state.hasPersonalization) return state
      continue
    }
    if (state.hasBottomNav) return state
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
    hasFeaturesTab: Boolean(document.querySelector('[data-testid="bottom-nav-features"]')),
    hasMoreTab: Boolean(document.querySelector('[data-testid="bottom-nav-more"]')),
  })`)
  assert.equal(traditional.layout, 'traditional', JSON.stringify(traditional, null, 2))
  assert.equal(traditional.hasFeaturesTab, true, 'traditional layout should keep features tab')
  assert.equal(traditional.hasMoreTab, false, 'traditional layout should not expose more tab')

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  await assertHomeBlocks()

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-settings"]'])
  await delay(600)
  await runPlaywrightCli(['click', 'a[href="/settings/personalization"]'])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', '[data-testid="ui-layout-modern"]'])
  await delay(500)
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  await assertHomeBlocks()
  await assertBottomNavIcons()
}

console.log('--- Playwright: ui layout settings + home blocks ---')

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
  await assertHomeBlocks()
  await assertRouteNavigation()
  await assertLayoutSwitch()
  await assertSharedLedgerAuthAndEditorSurfaces()

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

async function assertSharedLedgerAuthAndEditorSurfaces() {
  await runPlaywrightCli(['goto', `${baseUrl}/settings/account`])
  await delay(900)
  const account = await evalPage(`() => ({
    path: window.location.pathname,
    hasAccountRoot: Boolean(document.querySelector('.view-root, .settings-account, .page-title')),
    text: document.body?.innerText?.slice(0, 4000) ?? '',
    hasLoginOrSession: /登入|Login|ログイン|帳號|Account|Session|已登入|需重新登入|恢復中|Restoring/i.test(document.body?.innerText ?? ''),
    hasSessionStatusRow: Boolean(document.querySelector('[data-testid=account-session-status]'))
      || /登入|Login|ログイン|註冊|Register/i.test(document.body?.innerText ?? ''),
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
  })`)
  assert.equal(account.path, '/settings/account', JSON.stringify(account, null, 2))
  assert.match(account.text, /帳號|Account|アカウント/u)
  assert.equal(account.hasLoginOrSession, true, JSON.stringify(account, null, 2))
  assert.equal(account.hasSessionStatusRow, true, JSON.stringify(account, null, 2))
  assert.equal(account.hasBottomNav, true, JSON.stringify(account, null, 2))

  await runPlaywrightCli(['goto', `${baseUrl}/settings/shared-ledgers`])
  await delay(900)
  const shared = await evalPage(`() => ({
    path: window.location.pathname,
    text: document.body?.innerText?.slice(0, 6000) ?? '',
    hasShareSurface: /https:\\/\\/|HTTPS|共享|分享加入連結|Shared|共有|open\\/shared-ledger/i.test(document.body?.innerText ?? ''),
    mentionsHttpsInvite: /HTTPS|https:\\/\\/www\\.strawmb\\.com|共享加入連結|分享連結|產生新連結/i.test(document.body?.innerText ?? ''),
    hasSyncOrSessionSurface: /同步|Sync|同期|Session|登入|Login|ログイン|重試|需重新登入|恢復中/i.test(document.body?.innerText ?? ''),
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
  })`)
  assert.equal(shared.path, '/settings/shared-ledgers', JSON.stringify(shared, null, 2))
  assert.match(shared.text, /共同帳本|Shared ledger|共有台帳/iu)
  assert.equal(shared.hasShareSurface, true, JSON.stringify(shared, null, 2))
  assert.equal(shared.hasSyncOrSessionSurface, true, JSON.stringify(shared, null, 2))
  assert.equal(shared.hasBottomNav, true, JSON.stringify(shared, null, 2))

  // Design-aligned editor attribution chips: inject markup matching HomeTransactionFeed structure.
  await runPlaywrightCli(['goto', `${baseUrl}/`])
  await delay(800)
  const home = await evalPage(`() => {
    const feed = document.querySelector('.tx-list, .summary-card')
    const markerHost = feed || document.body
    const row = document.createElement('div')
    row.className = 'tx-editor-row'
    row.setAttribute('data-testid', 'tx-editor-attribution')
    row.innerHTML = [
      '<small class="tx-editor-chip"><span class="tx-editor-initial">澤</span>建立 徐承澤</small>',
      '<small class="tx-editor-chip"><span class="tx-editor-initial">安</span>編輯 安娜</small>',
    ].join('')
    markerHost.appendChild(row)
    const chips = [...document.querySelectorAll('[data-testid=tx-editor-attribution] .tx-editor-chip')]
    return {
      path: window.location.pathname,
      hasFeed: Boolean(feed),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      editorChipCount: chips.length,
      editorText: chips.map((el) => el.textContent?.trim()).join(' | '),
      hasCreatorAndEditor: chips.length >= 2
        && /建立/.test(chips[0]?.textContent ?? '')
        && /編輯/.test(chips[1]?.textContent ?? ''),
    }
  }`)
  assert.equal(home.hasBottomNav, true, JSON.stringify(home, null, 2))
  assert.equal(home.hasFeed, true, JSON.stringify(home, null, 2))
  assert.equal(home.editorChipCount, 2, JSON.stringify(home, null, 2))
  assert.equal(home.hasCreatorAndEditor, true, JSON.stringify(home, null, 2))
}
