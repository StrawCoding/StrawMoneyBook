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
const previewPort = Number(process.env.BANK_SYNC_PLAYWRIGHT_PORT || 4176)
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
    await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步'), button:has-text('次へ')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Bank Sync Ledger ${Date.now()}`])
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
      bodyText: document.body?.innerText?.slice(0, 240) ?? '',
    })`)
    if (state.intro) {
      await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
      await delay(1000)
      continue
    }
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
    if (state.welcome && attempt > 0 && attempt % 8 === 0) {
      await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步'), button:has-text('次へ'), button:has-text('Start'), button:has-text('開始使用')"])
      await delay(800)
    }
    await delay(500)
  }

  const diagnostic = await evalPage(`() => ({
    ok: false,
    reason: 'bottom-nav missing after onboarding',
    path: window.location.pathname,
    hasWelcome: Boolean(document.querySelector('.welcome-root')),
    hasIntro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    bodyText: document.body?.innerText?.slice(0, 400) ?? '',
  })`)
  throw new Error(`failed to reach home app-shell with BottomNav: ${JSON.stringify(diagnostic)}`)
}

async function openBankSyncPage() {
  await runPlaywrightCli(['goto', `${baseUrl}/features`])
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasBankLink: Boolean(document.querySelector('[data-testid=feature-link-bank-sync], a[href="/settings/bank-sync"]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if ((ready.path === '/features' || ready.path === '/settings') && ready.hasBankLink && ready.hasBottomNav) break
    await delay(400)
  }

  await runPlaywrightCli(['eval', `() => {
    const link = document.querySelector('[data-testid=feature-link-bank-sync], a[href="/settings/bank-sync"]')
    if (!link) throw new Error('missing bank-sync feature link')
    link.click()
    return true
  }`], { raw: true })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasAvailability: Boolean(document.querySelector('[data-testid=bank-sync-availability]')),
      hasSupportMatrix: Boolean(document.querySelector('[data-testid=bank-sync-support-matrix]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
    })`)
    if (
      ready.path === '/settings/bank-sync'
      && ready.hasAvailability
      && ready.hasSupportMatrix
      && ready.hasBottomNav
      && !ready.welcome
    ) {
      return
    }
    await delay(400)
  }
  throw new Error('bank-sync page not ready')
}

async function seedMembershipAndPendingConnection() {
  await runPlaywrightCli(['eval', `() => {
    localStorage.setItem('straw.playwright.hooks', '1')
    localStorage.setItem('straw.membership.entitlement.v2', JSON.stringify({
      lifetimeOwned: true,
      monthlyLastVerifiedAt: '',
      membershipCacheExpiresAt: 'forever',
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'ok',
      lastKnownPlan: 'lifetime',
    }))
    window.location.href = ${JSON.stringify(`${baseUrl}/settings/bank-sync`)}
    return true
  }`], { raw: true })
  await delay(2500)

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasAvailability: Boolean(document.querySelector('[data-testid=bank-sync-availability]')),
      hasHook: Boolean(window.__SMB_PLAYWRIGHT_BANK_SYNC__),
    })`)
    if (ready.path === '/settings/bank-sync' && ready.hasAvailability && ready.hasHook) break
    await delay(400)
  }

  let seeded = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    seeded = await evalPage(`() => {
      const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC__
      if (!hook?.setConnections) return { ok: false, reason: 'missing playwright bank hook' }
      const count = hook.setConnections([{
        id: 'pw_bank_conn_1',
        provider: 'hua_nan_bank_tw',
        provider_connection_id: 'hua_nan_identity_seed',
        status: 'active',
        user_label: 'Playwright Hua Nan Bank',
        pendingReviewCount: 2,
        last_sync_status: 'ok',
        last_sync_at: '',
        last_error: '',
        isDeprecatedMock: false,
        needsReconnect: false,
        accounts: [],
        enabledAccountCount: 0,
      }])
      const body = document.body?.innerText || ''
      const hasLabel = /Playwright Hua Nan Bank/u.test(body)
      const hasMemberLock = Boolean(document.querySelector('.member-only-lock'))
      return {
        ok: count >= 1 && hasLabel,
        count,
        hasLabel,
        hasMemberLock,
        hasPending: /待審核|pending|Pending|レビュー|2/u.test(body),
        bodySnippet: body.slice(0, 400),
      }
    }`)
    if (seeded.ok) return seeded
    await delay(400)
  }
  throw new Error(`failed to seed bank sync pending connection: ${JSON.stringify(seeded)}`)
}

console.log('--- Playwright: bank sync settings (app-shell + support matrix) ---')
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

  await openBankSyncPage()

  const state = await evalPage(`() => {
    const stages = [...document.querySelectorAll('[data-testid=bank-sync-availability] [data-stage]')].map((el) => ({
      id: el.getAttribute('data-stage'),
      ok: el.getAttribute('data-ok') === '1',
      code: el.querySelector('.error-code')?.textContent?.trim() || null,
    }))
    return {
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasAvailability: Boolean(document.querySelector('[data-testid=bank-sync-availability]')),
      hasSupportMatrix: Boolean(document.querySelector('[data-testid=bank-sync-support-matrix]')),
      hasRecoveryCta: Boolean(document.querySelector('[data-testid=bank-sync-recovery-cta]')),
      redirectedToSettingsOnly: window.location.pathname === '/settings',
      stages,
      bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
      welcome: Boolean(document.querySelector('.welcome-root')),
    }
  }`)

  assert.equal(state.welcome, false, 'must bypass onboarding / welcome')
  assert.equal(state.redirectedToSettingsOnly, false, 'must not silently redirect away from bank-sync')
  assert.equal(state.path, '/settings/bank-sync', JSON.stringify(state, null, 2))
  assert.equal(state.hasBottomNav, true, 'must stay in app-shell with BottomNav')
  assert.equal(state.hasAvailability, true, 'availability panel required')
  assert.equal(state.hasSupportMatrix, true, 'support matrix required on web')
  assert.equal(state.hasRecoveryCta, true, 'single recovery CTA required')
  assert.match(state.bodyText, /銀行|Bank|支援|Support|Android|可用性|Availability/u)
  assert.doesNotMatch(
    state.bodyText,
    /\bbank_sync_credentials_missing\b/,
    'web/non-Android must not show bank_sync_credentials_missing (android_only / support matrix instead)',
  )
  assert.match(state.bodyText, /Android|android_only|支援矩陣|Support/u)

  const membershipOrPlatform = state.stages.find((stage) => !stage.ok)
  assert.ok(membershipOrPlatform, 'web free/non-android must surface a clear blocker stage')
  assert.ok(
    ['bank_sync_membership_required', 'bank_sync_android_only'].includes(membershipOrPlatform.code),
    `unexpected blocker code: ${membershipOrPlatform.code}`,
  )

  const seeded = await seedMembershipAndPendingConnection()
  assert.equal(seeded.ok, true, JSON.stringify(seeded))

  const seededState = await evalPage(`() => ({
    bodyText: document.body?.innerText?.slice(0, 1200) ?? '',
    hasPendingBadge: /待審核|pending|Pending|レビュー/u.test(document.body?.innerText || ''),
    hasSeedLabel: /Playwright Hua Nan Bank/u.test(document.body?.innerText || ''),
    hasRecoveryCta: Boolean(document.querySelector('[data-testid=bank-sync-recovery-cta]')),
  })`)
  assert.equal(seededState.hasSeedLabel, true, `seeded connection label required: ${JSON.stringify(seededState)}`)
  assert.equal(seededState.hasPendingBadge, true, 'seeded pending review badge required')
  assert.equal(seededState.hasRecoveryCta, true, 'recovery CTA must remain after seeded review connection')

  await runPlaywrightCli(['goto', `${baseUrl}/settings/developer-debug`])
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const debugReady = await evalPage(`() => ({
      path: window.location.pathname,
      hasToggle: Boolean(document.querySelector('[data-testid=bank-sync-debug-toggle]')),
      hasConsole: Boolean(document.querySelector('[data-testid=bank-sync-console-log]'))
        || /尚未有 Console|No console records|まだ Console/u.test(document.body?.innerText || ''),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if (debugReady.path === '/settings/developer-debug' && debugReady.hasToggle && debugReady.hasBottomNav) {
      assert.equal(debugReady.hasToggle, true, 'debug page must expose bank sync console toggle on web')
      break
    }
    if (attempt === 39) {
      throw new Error(`developer-debug page not ready: ${JSON.stringify(debugReady)}`)
    }
    await delay(400)
  }

  console.log('Bank sync Playwright app-shell + support matrix + seeded review check passed')

  await runPlaywrightCli(['eval', `() => {
    localStorage.setItem('strawmoneybook.bankSync.debugEnabled', '1')
    localStorage.setItem('straw.playwright.hooks', '1')
    localStorage.setItem('straw.membership.entitlement.v2', JSON.stringify({
      lifetimeOwned: true,
      monthlyLastVerifiedAt: '',
      membershipCacheExpiresAt: 'forever',
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'ok',
      lastKnownPlan: 'lifetime',
    }))
    return true
  }`], { raw: true })

  await runPlaywrightCli(['goto', `${baseUrl}/settings/bank-sync/new`])
  await delay(2500)

  let wizardProviders = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    wizardProviders = await evalPage(`() => {
      const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CREATE__
      const options = hook?.getProviderOptions?.() || []
      const body = document.body?.innerText || ''
      return {
        path: window.location.pathname,
        options,
        hasHook: Boolean(hook),
        hasFirstBank: options.some((item) => /first_bank|第一/u.test(String(item.value || item.label || ''))),
        hasHuaNan: options.some((item) => String(item.value || '').includes('hua_nan')),
        hasWizard: Boolean(document.querySelector('.wizard-head')),
        bodySnippet: body.slice(0, 500),
      }
    }`)
    if (wizardProviders.path === '/settings/bank-sync/new' && wizardProviders.hasHook && wizardProviders.hasHuaNan) break
    await delay(400)
  }
  assert.equal(wizardProviders.path, '/settings/bank-sync/new', JSON.stringify(wizardProviders))
  assert.equal(wizardProviders.hasFirstBank, false, 'first bank must not appear in provider list')
  assert.equal(wizardProviders.hasHuaNan, true, 'hua nan provider required')
  assert.equal(wizardProviders.hasWizard, true, 'create wizard head required')

  const formalConnect = await evalPage(`async () => {
    const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CREATE__
    if (!hook?.runFormalConnect) return { ok: false, reason: 'missing runFormalConnect' }
    return hook.runFormalConnect({
      nationalId: 'A123456789',
      code: 'nickname1',
      password: 'password12',
      captchaCode: '1234',
    })
  }`)
  assert.equal(formalConnect.ok, true, JSON.stringify(formalConnect))
  assert.equal(formalConnect.step, 3, JSON.stringify(formalConnect))
  assert.ok(formalConnect.accountCount >= 1, `formal connect must discover accounts: ${JSON.stringify(formalConnect)}`)
  assert.ok(formalConnect.connectionId, 'formal connect must return connectionId')

  const formalSync = await evalPage(`async () => {
    const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CREATE__
    if (!hook?.runFormalSaveMappingAndSync) return { ok: false, reason: 'missing runFormalSaveMappingAndSync' }
    return hook.runFormalSaveMappingAndSync()
  }`)
  assert.equal(formalSync.ok, true, JSON.stringify(formalSync))
  assert.ok(formalSync.added >= 1, `manual sync must upsert pending review rows: ${JSON.stringify(formalSync)}`)

  await runPlaywrightCli(['goto', `${baseUrl}/settings/bank-sync/${formalSync.connectionId}`])
  await delay(2500)

  let reviewReady = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    reviewReady = await evalPage(`async () => {
      const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CONNECTION__
      if (!hook?.reloadReviewFromService) return { ok: false, reason: 'missing reloadReviewFromService' }
      const loaded = await hook.reloadReviewFromService()
      const panel = document.querySelector('[data-testid=bank-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      return {
        ...loaded,
        items,
        hasPanel: Boolean(panel),
        bodySnippet: panel?.innerText?.slice(0, 400) ?? '',
      }
    }`)
    if (reviewReady.ok && reviewReady.items >= 1) break
    await delay(400)
  }
  assert.equal(reviewReady.ok, true, JSON.stringify(reviewReady))
  assert.ok(reviewReady.items >= 1, `review panel must show synced rows: ${JSON.stringify(reviewReady)}`)
  assert.match(String(reviewReady.summaries?.join(' ') || reviewReady.bodySnippet || ''), /Playwright Seed Txn/u)

  const importResult = await evalPage(`async () => {
    const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CONNECTION__
    if (!hook?.runFormalImport) return { ok: false, reason: 'missing runFormalImport' }
    return hook.runFormalImport()
  }`)
  assert.equal(importResult.ok, true, JSON.stringify(importResult))
  assert.ok(importResult.importedCount >= 1, `import service must post ledger rows: ${JSON.stringify(importResult)}`)
  assert.equal(importResult.remainingReview, 0, `pending review must clear after import: ${JSON.stringify(importResult)}`)
  assert.ok(
    (importResult.importedTxnIds?.length || 0) >= 1 || importResult.ledgerHit >= 1,
    `ledger must contain imported bank txn ids: ${JSON.stringify(importResult)}`,
  )

  console.log('Bank sync Playwright formal connect→map→sync→import flow passed')
} finally {
  preview.kill('SIGTERM')
}
