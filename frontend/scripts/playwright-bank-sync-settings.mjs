import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { ensurePlaywrightChromium } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(frontendDir, '..')
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(frontendDir, 'playwright-cli.json')
// Dedicated port — must NOT share 4176 with playwright-budget-cross-month (stale preview flake).
const previewPort = Number(process.env.BANK_SYNC_PLAYWRIGHT_PORT || 4226)
const baseUrl = `http://127.0.0.1:${previewPort}`
const playwrightCliSession = process.env.PLAYWRIGHT_CLI_SESSION
  || `smb-bank-sync-${previewPort}-${process.pid}`

async function runPlaywrightCli(args, { raw = false } = {}) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    '--session',
    playwrightCliSession,
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

async function assertPreviewPortFree(port) {
  await new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.once('error', (error) => {
      reject(new Error(
        `preview port ${port} already in use — refusing to attach to a foreign vite preview `
        + `(strictPort race / leftover process). ${error.message}`,
      ))
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolvePort())
    })
  })
}

function stopPreviewProcess(child) {
  if (!child?.pid) return
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
  try {
    spawn('fuser', ['-k', `${previewPort}/tcp`], { stdio: 'ignore' })
  } catch {
    // ignore
  }
}

async function waitForPreviewReady(previewChild) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (previewChild && previewChild.exitCode != null) {
      throw new Error(
        `preview process exited early (code=${previewChild.exitCode}) before ready at ${baseUrl}`,
      )
    }
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
await assertPreviewPortFree(previewPort)
console.log(`Building web preview bundle (port ${previewPort})...`)
await execFileAsync('npm', ['run', 'build:web'], {
  cwd: frontendDir,
  env: process.env,
  maxBuffer: 8 * 1024 * 1024,
  timeout: 300000,
})

let preview = null
try {
  preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: frontendDir,
    stdio: 'ignore',
    env: process.env,
  })
  await waitForPreviewReady(preview)
  await ensurePlaywrightChromium()
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

  // Hard reload into create wizard so debug + membership + hooks remount cleanly
  // (SPA click against a stale/foreign preview previously flaked as missing Hua Nan).
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
    window.location.href = ${JSON.stringify(`${baseUrl}/settings/bank-sync/new`)}
    return true
  }`], { raw: true })
  await delay(2500)

  let wizardProviders = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    wizardProviders = await evalPage(`() => {
      const options = [...document.querySelectorAll('[data-testid^=bank-sync-provider-]')].map((el) => ({
        value: el.getAttribute('data-testid')?.replace('bank-sync-provider-', '') || '',
        label: el.textContent?.trim() || '',
      }))
      const body = document.body?.innerText || ''
      return {
        path: window.location.pathname,
        options,
        hasFirstBank: options.some((item) => /first_bank|第一/u.test(String(item.value || item.label || '')))
          || /第一銀行|first_bank_tw/u.test(body),
        hasHuaNan: options.some((item) => String(item.value || '').includes('hua_nan'))
          || /華南|Hua Nan/u.test(body),
        hasWizard: Boolean(document.querySelector('.wizard-head')),
        hasNext: Boolean(document.querySelector('[data-testid=bank-sync-wizard-next]')),
        bodySnippet: body.slice(0, 500),
      }
    }`)
    if (wizardProviders.path === '/settings/bank-sync/new' && wizardProviders.hasHuaNan && wizardProviders.hasWizard) break
    await delay(400)
  }
  assert.equal(wizardProviders.path, '/settings/bank-sync/new', JSON.stringify(wizardProviders))
  assert.equal(wizardProviders.hasFirstBank, false, `first bank must not appear in provider list: ${JSON.stringify(wizardProviders)}`)
  assert.equal(wizardProviders.hasHuaNan, true, `hua nan provider required: ${JSON.stringify(wizardProviders)}`)
  assert.equal(wizardProviders.hasWizard, true, `create wizard head required: ${JSON.stringify(wizardProviders)}`)

  // Step 1: select Hua Nan provider card + Next
  await runPlaywrightCli(['click', '[data-testid=bank-sync-provider-hua_nan_bank_tw]'])
  await delay(300)
  await runPlaywrightCli(['click', '[data-testid=bank-sync-wizard-next]'])
  await delay(800)

  // Step 2: fill credential form via real inputs
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const step2 = await evalPage(`() => ({
      hasNationalId: Boolean(document.querySelector('[data-testid=bank-sync-field-nationalId]')),
      hasUserCode: Boolean(document.querySelector('[data-testid=bank-sync-field-userCode]')),
      hasPassword: Boolean(document.querySelector('[data-testid=bank-sync-field-password]')),
      hasSubmit: Boolean(document.querySelector('[data-testid=bank-sync-wizard-submit-login]')),
    })`)
    if (step2.hasNationalId && step2.hasUserCode && step2.hasPassword && step2.hasSubmit) break
    if (attempt === 19) throw new Error(`wizard step2 credentials not ready: ${JSON.stringify(step2)}`)
    await delay(400)
  }

  await runPlaywrightCli(['fill', '[data-testid=bank-sync-field-nationalId]', 'A123456789'])
  await runPlaywrightCli(['fill', '[data-testid=bank-sync-field-userCode]', 'nickname1'])
  await runPlaywrightCli(['fill', '[data-testid=bank-sync-field-password]', 'password12'])
  await runPlaywrightCli(['click', '[data-testid=bank-sync-wizard-submit-login]'])
  await delay(600)

  // Confirm dialog — click primary confirm in dialog footer
  const confirmClicked = await evalPage(`() => {
    const dialog = document.querySelector('.dialog-mask .dialog, .dialog-sheet, .dialog-popup')
    const buttons = [...(dialog?.querySelectorAll('button') || document.querySelectorAll('.dialog-actions button, .dialog-mask button'))]
    const confirm = buttons.find((btn) => /建立|新增|Create|確認|Confirm/u.test(btn.textContent || '') && !btn.disabled)
      || buttons.find((btn) => btn.classList.contains('primary') && !btn.disabled)
    if (!confirm) return { ok: false, reason: 'confirm_button_missing', count: buttons.length }
    confirm.click()
    return { ok: true }
  }`)
  assert.equal(confirmClicked.ok, true, JSON.stringify(confirmClicked))

  // Wait for account mapping step (step 3)
  let mappingReady = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    mappingReady = await evalPage(`() => {
      const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CREATE__
      return {
        step: hook?.getCurrentStep?.() ?? null,
        connectionId: hook?.getCreatedConnectionId?.() ?? null,
        accountCount: hook?.getAccountDraftCount?.() ?? 0,
        hasMapping: Boolean(document.querySelector('[data-testid=bank-sync-account-mapping]')),
        hasEnable: Boolean(document.querySelector('[data-testid=bank-sync-account-enable]')),
        hasSave: Boolean(document.querySelector('[data-testid=bank-sync-save-accounts]')),
        bodySnippet: document.body?.innerText?.slice(0, 400) ?? '',
      }
    }`)
    if (mappingReady.hasMapping && mappingReady.hasEnable && mappingReady.accountCount >= 1) break
    await delay(500)
  }
  assert.equal(mappingReady.hasMapping, true, `account mapping UI required: ${JSON.stringify(mappingReady)}`)
  assert.ok(mappingReady.accountCount >= 1, `formal connect must discover accounts: ${JSON.stringify(mappingReady)}`)
  assert.ok(mappingReady.connectionId, 'formal connect must return connectionId')

  // Enable account + pick ledger target via CustomSelect UI
  await runPlaywrightCli(['eval', `() => {
    const checkbox = document.querySelector('[data-testid=bank-sync-account-enable]')
    if (checkbox && !checkbox.checked) {
      checkbox.click()
      checkbox.dispatchEvent(new Event('change', { bubbles: true }))
      checkbox.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return { checked: Boolean(checkbox?.checked) }
  }`], { raw: true })
  await delay(300)

  let mapReady = null
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await evalPage(`() => {
      const mapField = document.querySelector('[data-testid=bank-sync-account-map]')
      const trigger = mapField?.querySelector('button.select, .custom-select .trigger, button.trigger')
      if (trigger) trigger.click()
      return Boolean(trigger)
    }`)
    await delay(700)

    // Prefer Playwright locator click on the first real ledger option (skip __none__).
    try {
      await runPlaywrightCli(['click', '.menu-item:not(.disabled) >> nth=1'])
      mapReady = { ok: true, via: 'playwright-nth1' }
      break
    } catch {
      mapReady = await evalPage(`() => {
        const items = [...document.querySelectorAll('.menu-item, button.menu-item')]
        const option = items.find((el) => {
          if (el.disabled) return false
          const text = String(el.textContent || '').trim()
          if (!text) return false
          return !/不對應|無對應|none|__none__|No target|選擇帳戶|Choose account/iu.test(text)
        }) || items[1] || null
        if (!option) {
          return {
            ok: false,
            reason: 'ledger_option_missing',
            count: items.length,
            labels: items.map((el) => el.textContent?.trim()).slice(0, 12),
            openSheet: Boolean(document.querySelector('.menu-sheet, .menu-sheet-body, [class*=sheet]')),
          }
        }
        option.click()
        return { ok: true, via: 'dom-click', label: option.textContent?.trim() || '', count: items.length }
      }`)
      if (mapReady.ok) break
    }
    await delay(400)
  }
  assert.equal(mapReady.ok, true, JSON.stringify(mapReady))
  await delay(500)

  let saveEnabled = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    saveEnabled = await evalPage(`() => {
      const btn = document.querySelector('[data-testid=bank-sync-save-accounts]')
      const triggerText = document.querySelector('[data-testid=bank-sync-account-map] .text, [data-testid=bank-sync-account-map] .select')?.textContent?.trim() || ''
      const checked = Boolean(document.querySelector('[data-testid=bank-sync-account-enable]')?.checked)
      return {
        ok: Boolean(btn) && !btn.disabled,
        disabled: Boolean(btn?.disabled),
        checked,
        triggerText,
        btnText: btn?.textContent?.trim() || '',
      }
    }`)
    if (saveEnabled.ok) break
    // Re-open and pick again if still disabled
    if (attempt > 0 && attempt % 3 === 0) {
      await evalPage(`() => {
        const checkbox = document.querySelector('[data-testid=bank-sync-account-enable]')
        if (checkbox && !checkbox.checked) checkbox.click()
        const trigger = document.querySelector('[data-testid=bank-sync-account-map] button.select, [data-testid=bank-sync-account-map] .trigger')
        trigger?.click()
        return true
      }`)
      await delay(500)
      await evalPage(`() => {
        const items = [...document.querySelectorAll('.menu-item, button.menu-item')]
        const option = items.find((el) => {
          if (el.disabled) return false
          const text = String(el.textContent || '').trim()
          return text && !/不對應|無對應|none|__none__|No target|選擇帳戶|Choose/iu.test(text)
        })
        option?.click()
        return Boolean(option)
      }`)
    }
    await delay(400)
  }
  assert.equal(saveEnabled.ok, true, `save accounts must enable after mapping UI: ${JSON.stringify(saveEnabled)}`)

  // Save mapping + first sync via UI Next button (force click only after enabled)
  await runPlaywrightCli(['click', '[data-testid=bank-sync-save-accounts]'])

  let connectionPageReady = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    connectionPageReady = await evalPage(`() => {
      const path = window.location.pathname
      const match = path.match(/\\/settings\\/bank-sync\\/([^/]+)$/)
      const connectionId = match && match[1] !== 'new' ? match[1] : null
      const panel = document.querySelector('[data-testid=bank-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      const syncBtn = document.querySelector('[data-testid=bank-sync-sync-now]')
      return {
        path,
        connectionId,
        items,
        hasPanel: Boolean(panel),
        hasSync: Boolean(syncBtn),
        syncDisabled: Boolean(syncBtn?.disabled),
        bodySnippet: panel?.innerText?.slice(0, 400) ?? document.body?.innerText?.slice(0, 400) ?? '',
      }
    }`)
    if (connectionPageReady.connectionId && connectionPageReady.hasPanel) break
    await delay(500)
  }
  assert.ok(connectionPageReady.connectionId, `must land on connection page: ${JSON.stringify(connectionPageReady)}`)

  // If review empty, click manual sync button then wait for rows
  if ((connectionPageReady.items || 0) < 1 && connectionPageReady.hasSync && !connectionPageReady.syncDisabled) {
    await runPlaywrightCli(['click', '[data-testid=bank-sync-sync-now]'])
    await delay(1500)
  }

  let reviewReady = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    reviewReady = await evalPage(`() => {
      const panel = document.querySelector('[data-testid=bank-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      return {
        ok: items >= 1,
        items,
        hasPanel: Boolean(panel),
        hasSelectAll: Boolean(document.querySelector('[data-testid=bank-sync-review-select-all]')),
        hasImport: Boolean(document.querySelector('[data-testid=bank-sync-review-import]')),
        bodySnippet: panel?.innerText?.slice(0, 400) ?? '',
      }
    }`)
    if (reviewReady.ok) break
    await delay(400)
  }
  assert.equal(reviewReady.ok, true, `review panel must show synced rows: ${JSON.stringify(reviewReady)}`)
  assert.match(String(reviewReady.bodySnippet || ''), /Playwright Seed Txn/u)

  // Select all pending rows + confirm import via UI
  await runPlaywrightCli(['click', '[data-testid=bank-sync-review-select-all]'])
  await delay(300)
  const selectedState = await evalPage(`() => {
    const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CONNECTION__
    const checked = [...document.querySelectorAll('[data-testid=bank-sync-review] input[type=checkbox]:checked')].length
    return {
      selected: hook?.getSelectedReviewCount?.() ?? checked,
      checked,
      importDisabled: Boolean(document.querySelector('[data-testid=bank-sync-review-import]')?.disabled),
    }
  }`)
  assert.ok(selectedState.selected >= 1, `must select review rows via UI: ${JSON.stringify(selectedState)}`)
  assert.equal(selectedState.importDisabled, false, 'import button must enable after selection')

  await runPlaywrightCli(['click', '[data-testid=bank-sync-review-import]'])
  await delay(1500)

  let importResult = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    importResult = await evalPage(`async () => {
      const path = window.location.pathname || ''
      const body = document.body?.innerText || ''
      const onSearch = path.includes('/transactions') || path.includes('transaction-search') || path.includes('/search')
      const hasSeed = /Playwright Seed Txn/u.test(body)
      const panel = document.querySelector('[data-testid=bank-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      const hook = window.__SMB_PLAYWRIGHT_BANK_SYNC_CONNECTION__
      if (hook?.verifyLedgerAfterImport) {
        const verified = await hook.verifyLedgerAfterImport()
        return {
          ...verified,
          path,
          onSearch,
          hasSeed,
          items,
          via: 'hook',
        }
      }
      // Successful import navigates to transaction-search; prove ledger by visible seed txn.
      if (onSearch && hasSeed) {
        return { ok: true, remainingReview: 0, ledgerHit: 1, path, onSearch, hasSeed, items, via: 'search-page' }
      }
      if (!panel && hasSeed) {
        return { ok: true, remainingReview: 0, ledgerHit: 1, path, onSearch, hasSeed, items, via: 'body-seed' }
      }
      return {
        ok: false,
        remainingReview: items,
        ledgerHit: hasSeed ? 1 : 0,
        path,
        onSearch,
        hasSeed,
        items,
        bodySnippet: body.slice(0, 500),
        via: 'pending',
      }
    }`)
    if (importResult.ok) break
    await delay(500)
  }
  assert.equal(importResult.ok, true, JSON.stringify(importResult))
  assert.ok(
    importResult.remainingReview === 0 || importResult.onSearch || importResult.via === 'search-page',
    `pending review must clear after import: ${JSON.stringify(importResult)}`,
  )
  assert.ok(importResult.ledgerHit >= 1 || importResult.hasSeed, `ledger must contain imported bank txn: ${JSON.stringify(importResult)}`)

  console.log('Bank sync Playwright formal connect→map→sync→import UI flow passed')
} finally {
  try {
    await runPlaywrightCli(['close'])
  } catch {
    // ignore session close failures
  }
  stopPreviewProcess(preview)
}
