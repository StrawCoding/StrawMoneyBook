import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.CARRIER_SYNC_PLAYWRIGHT_PORT || 4175)
const baseUrl = `http://127.0.0.1:${previewPort}`
const PW_PHONE = '0912345678'
const PW_PASSWORD = 'playwright1'
const PW_CAPTCHA = 'PWOK1'
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'carrier-sync',
  port: previewPort,
})

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
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Carrier Sync Ledger ${Date.now()}`])
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

async function openCarrierSyncPage() {
  await runPlaywrightCli(['goto', `${baseUrl}/features`])
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasCarrierLink: Boolean(document.querySelector('[data-testid=feature-link-carrier-sync]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if (ready.path === '/features' && ready.hasCarrierLink && ready.hasBottomNav) break
    await delay(400)
  }

  const scrolled = await evalPage(`() => {
    const el = document.querySelector('[data-testid=feature-link-carrier-sync]')
    if (!el) return { ok: false, reason: 'missing' }
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const rect = el.getBoundingClientRect()
    const nav = document.querySelector('[data-testid=bottom-nav]')
    const navTop = nav ? nav.getBoundingClientRect().top : Number.POSITIVE_INFINITY
    return {
      ok: true,
      clearOfNav: rect.bottom < navTop - 4,
    }
  }`)
  if (!scrolled.ok) throw new Error('missing carrier-sync feature link')

  await runPlaywrightCli(['click', '[data-testid=feature-link-carrier-sync]'])
  await delay(900)
  let pageState = await evalPage(`() => ({
    path: window.location.pathname,
    hasAvailability: Boolean(document.querySelector('[data-testid=carrier-sync-availability]')),
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    welcome: Boolean(document.querySelector('.welcome-root')),
  })`)
  if (pageState.path !== '/settings/carrier-sync') {
    await runPlaywrightCli(['goto', `${baseUrl}/features`])
    await delay(500)
    await evalPage(`() => {
      const el = document.querySelector('[data-testid=feature-link-carrier-sync]')
      if (!el) throw new Error('missing carrier-sync feature link')
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      el.click()
      return true
    }`)
    await delay(900)
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasAvailability: Boolean(document.querySelector('[data-testid=carrier-sync-availability]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
    })`)
    if (ready.path === '/settings/carrier-sync' && ready.hasAvailability && ready.hasBottomNav && !ready.welcome) {
      return
    }
    await delay(400)
  }
  throw new Error('carrier-sync page not ready')
}

async function seedMembershipAndPendingReview() {
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
    window.location.href = ${JSON.stringify(`${baseUrl}/settings/carrier-sync`)}
    return true
  }`], { raw: true })
  await delay(2500)

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasReview: Boolean(document.querySelector('[data-testid=carrier-sync-review]')),
      hasHook: Boolean(window.__SMB_PLAYWRIGHT_CARRIER_SYNC__),
    })`)
    if (ready.path === '/settings/carrier-sync' && ready.hasReview && ready.hasHook) break
    await delay(400)
  }

  const seeded = await evalPage(`() => {
    const hook = window.__SMB_PLAYWRIGHT_CARRIER_SYNC__
    if (!hook?.setPendingRows) return { ok: false, reason: 'missing playwright carrier hook' }
    const count = hook.setPendingRows([{
      id: 'pw_einv_pending_1',
      invoiceNumber: 'AB12345678',
      amount: 128,
      invoiceDate: Date.now(),
      merchantName: 'Playwright Seed Shop',
      carrierName: '手機條碼',
      status: 'pending',
      scrapedAt: Date.now(),
      sourceSyncRunId: 'pw_seed_run',
    }])
    const availability = hook.getAvailability?.() || null
    return {
      ok: count >= 1,
      count,
      reviewCode: availability?.stages?.find((stage) => stage.id === 'review')?.code || null,
      recoveryCta: availability?.recoveryCta || null,
    }
  }`)
  if (!seeded.ok) throw new Error(`failed to seed carrier review list: ${JSON.stringify(seeded)}`)

  let visible = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(200)
    visible = await evalPage(`() => {
      const panel = document.querySelector('[data-testid=carrier-sync-review]')
      const text = panel?.innerText || ''
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      return {
        ok: items >= 1 && /AB12345678|Playwright Seed Shop/u.test(text),
        items,
        text: text.slice(0, 300),
      }
    }`)
    if (visible.ok) break
  }
  if (!visible?.ok) throw new Error(`seeded review list not visible: ${JSON.stringify(visible)}`)
  return { ...seeded, ...visible }
}

async function reloadCarrierSyncWithMembership() {
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
    window.location.href = ${JSON.stringify(`${baseUrl}/settings/carrier-sync`)}
    return true
  }`], { raw: true })
  await delay(2500)

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evalPage(`() => ({
      path: window.location.pathname,
      hasHook: Boolean(window.__SMB_PLAYWRIGHT_CARRIER_SYNC__),
      hasPhone: Boolean(document.querySelector('[data-testid=carrier-sync-field-phone]')),
      hasSync: Boolean(document.querySelector('[data-testid=carrier-sync-sync-now]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if (
      ready.path === '/settings/carrier-sync'
      && ready.hasHook
      && ready.hasPhone
      && ready.hasSync
      && ready.hasBottomNav
    ) {
      return ready
    }
    await delay(400)
  }
  throw new Error('carrier-sync membership page not ready for formal flow')
}

async function runFormalCarrierSyncFlow() {
  await reloadCarrierSyncWithMembership()

  await runPlaywrightCli(['fill', '[data-testid=carrier-sync-field-phone]', PW_PHONE])
  await runPlaywrightCli(['fill', '[data-testid=carrier-sync-field-password]', PW_PASSWORD])

  let syncReady = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    syncReady = await evalPage(`() => {
      const btn = document.querySelector('[data-testid=carrier-sync-sync-now]')
      return {
        ok: Boolean(btn) && !btn.disabled,
        disabled: Boolean(btn?.disabled),
      }
    }`)
    if (syncReady.ok) break
    await delay(400)
  }
  assert.equal(syncReady.ok, true, `sync button must enable after credentials: ${JSON.stringify(syncReady)}`)

  await runPlaywrightCli(['click', '[data-testid=carrier-sync-sync-now]'])
  await delay(800)

  let captchaReady = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    captchaReady = await evalPage(`() => ({
      hasDialog: Boolean(document.querySelector('.dialog-mask, .dialog-sheet, .dialog-popup')),
      hasCaptchaInput: Boolean(document.querySelector('[data-testid=carrier-sync-captcha-input]')),
      hasCaptchaImage: Boolean(document.querySelector('.captcha-image')),
      bodySnippet: document.body?.innerText?.slice(0, 500) ?? '',
    })`)
    if (captchaReady.hasDialog && captchaReady.hasCaptchaInput) break
    await delay(400)
  }
  assert.equal(captchaReady.hasDialog, true, `captcha dialog required after sync: ${JSON.stringify(captchaReady)}`)
  assert.equal(captchaReady.hasCaptchaInput, true, `captcha input required: ${JSON.stringify(captchaReady)}`)

  await runPlaywrightCli(['fill', '[data-testid=carrier-sync-captcha-input]', PW_CAPTCHA])
  await delay(200)

  const confirmClicked = await evalPage(`() => {
    const dialog = document.querySelector('.dialog-mask .dialog, .dialog-sheet, .dialog-popup')
    const buttons = [...(dialog?.querySelectorAll('button') || document.querySelectorAll('.dialog-actions button, .dialog-mask button'))]
    const confirm = buttons.find((btn) => /確認|Confirm|確定|Submit/u.test(btn.textContent || '') && !btn.disabled)
      || buttons.find((btn) => btn.classList.contains('primary') && !btn.disabled)
    if (!confirm) return { ok: false, reason: 'confirm_button_missing', count: buttons.length }
    confirm.click()
    return { ok: true }
  }`)
  assert.equal(confirmClicked.ok, true, JSON.stringify(confirmClicked))

  let reviewReady = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    reviewReady = await evalPage(`() => {
      const panel = document.querySelector('[data-testid=carrier-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      const text = panel?.innerText || ''
      return {
        ok: items >= 1 && /PW98765432|Playwright Carrier Shop/u.test(text),
        items,
        hasSelectAll: Boolean(document.querySelector('[data-testid=carrier-sync-review-select-all]')),
        hasImport: Boolean(document.querySelector('[data-testid=carrier-sync-review-import]')),
        text: text.slice(0, 400),
      }
    }`)
    if (reviewReady.ok) break
    await delay(500)
  }
  assert.equal(reviewReady.ok, true, `formal sync must populate review rows: ${JSON.stringify(reviewReady)}`)

  await runPlaywrightCli(['click', '[data-testid=carrier-sync-review-select-all]'])
  await delay(300)

  const selectedState = await evalPage(`() => {
    const hook = window.__SMB_PLAYWRIGHT_CARRIER_SYNC__
    const checked = [...document.querySelectorAll('[data-testid=carrier-sync-review] input[type=checkbox]:checked')].length
    return {
      selected: hook?.getSelectedReviewCount?.() ?? checked,
      checked,
      importDisabled: Boolean(document.querySelector('[data-testid=carrier-sync-review-import]')?.disabled),
    }
  }`)
  assert.ok(selectedState.selected >= 1, `must select review rows via UI: ${JSON.stringify(selectedState)}`)
  assert.equal(selectedState.importDisabled, false, 'import button must enable after selection')

  const importTargets = await evalPage(`() => window.__SMB_PLAYWRIGHT_CARRIER_SYNC__?.getImportTargetState?.() ?? null`)
  assert.ok(importTargets?.ledgerId, `ledger required for import: ${JSON.stringify(importTargets)}`)
  assert.ok(importTargets?.accountId && importTargets.accountId !== '__none__', `account required: ${JSON.stringify(importTargets)}`)
  assert.ok(importTargets?.categoryId && importTargets.categoryId !== '__none__', `category required: ${JSON.stringify(importTargets)}`)

  await runPlaywrightCli(['click', '[data-testid=carrier-sync-review-import]'])
  await delay(1500)

  let importResult = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    importResult = await evalPage(`async () => {
      const hook = window.__SMB_PLAYWRIGHT_CARRIER_SYNC__
      const panel = document.querySelector('[data-testid=carrier-sync-review]')
      const items = panel?.querySelectorAll('.review-item')?.length || 0
      const body = document.body?.innerText || ''
      const hasSeed = /Playwright Carrier Shop/u.test(body)
      if (hook?.verifyLedgerAfterImport) {
        const verified = await hook.verifyLedgerAfterImport()
        return {
          ...verified,
          items,
          hasSeed,
          via: 'hook',
        }
      }
      return {
        ok: items === 0 && hasSeed,
        remainingReview: items,
        ledgerHit: hasSeed ? 1 : 0,
        hasSeed,
        via: 'dom',
      }
    }`)
    if (importResult.ok) break
    await delay(500)
  }
  assert.equal(importResult.ok, true, JSON.stringify({
    ...importResult,
    importTargets: await evalPage(`() => window.__SMB_PLAYWRIGHT_CARRIER_SYNC__?.getImportTargetState?.() ?? null`),
  }))
  assert.ok(importResult.remainingReview === 0, `pending review must clear after import: ${JSON.stringify(importResult)}`)
  assert.ok(
    importResult.ledgerHit >= 1 || importResult.hasFixtureImport,
    `ledger must contain imported carrier invoice: ${JSON.stringify(importResult)}`,
  )
  assert.ok(importResult.hasFixtureImport !== false, `fixture invoice must be recorded in imports: ${JSON.stringify(importResult)}`)

  return importResult
}

console.log('--- Playwright: carrier sync settings (app-shell + formal flow) ---')
await assertPreviewPortFree(previewPort)
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
  await ensurePlaywrightChromium()
  await runPlaywrightCli(['delete-data'])
  await runPlaywrightCli(['open', `${baseUrl}/`])
  const onboarding = await completeOnboarding()
  assert.equal(onboarding.ok, true, JSON.stringify(onboarding, null, 2))

  await openCarrierSyncPage()

  const freeState = await evalPage(`() => {
    const stages = [...document.querySelectorAll('[data-testid=carrier-sync-availability] [data-stage]')].map((el) => ({
      id: el.getAttribute('data-stage'),
      ok: el.getAttribute('data-ok') === '1',
      code: el.querySelector('.error-code')?.textContent?.trim() || null,
    }))
    return {
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasAvailability: Boolean(document.querySelector('[data-testid=carrier-sync-availability]')),
      hasRecoveryCta: Boolean(document.querySelector('[data-testid=carrier-sync-recovery-cta]')),
      stages,
      bodyText: document.body?.innerText?.slice(0, 900) ?? '',
      welcome: Boolean(document.querySelector('.welcome-root')),
    }
  }`)

  assert.equal(freeState.welcome, false, 'must bypass onboarding / welcome')
  assert.equal(freeState.path, '/settings/carrier-sync', JSON.stringify(freeState, null, 2))
  assert.equal(freeState.hasBottomNav, true, 'must stay in app-shell with BottomNav')
  assert.equal(freeState.hasAvailability, true, 'availability panel required')
  assert.equal(freeState.hasRecoveryCta, true, 'single recovery CTA required')
  assert.match(freeState.bodyText, /載具|Carrier|可用性|Availability|会員|會員/u)
  assert.doesNotMatch(
    freeState.bodyText,
    /\beinvoice_network_failed\b/,
    'credentialed health probe must not false-report einvoice_network_failed on local preview',
  )
  const membershipStage = freeState.stages.find((stage) => stage.id === 'membership')
  assert.ok(membershipStage, 'membership stage required')
  assert.equal(membershipStage.ok, false, 'free user must block on membership')
  assert.equal(membershipStage.code, 'carrier_sync_membership_required')

  const seeded = await seedMembershipAndPendingReview()
  assert.equal(seeded.ok, true, JSON.stringify(seeded))

  const memberState = await evalPage(`() => {
    const review = document.querySelector('[data-testid=carrier-sync-review]')
    const items = [...(review?.querySelectorAll('.review-item') || [])]
    const stages = [...document.querySelectorAll('[data-testid=carrier-sync-availability] [data-stage]')].map((el) => ({
      id: el.getAttribute('data-stage'),
      ok: el.getAttribute('data-ok') === '1',
      code: el.querySelector('.error-code')?.textContent?.trim() || null,
    }))
    return {
      hasReview: Boolean(review),
      reviewCount: items.length,
      reviewText: review?.innerText?.slice(0, 400) ?? '',
      stages,
      hasRecoveryCta: Boolean(document.querySelector('[data-testid=carrier-sync-recovery-cta]')),
      bodyText: document.body?.innerText?.slice(0, 900) ?? '',
    }
  }`)

  assert.equal(memberState.hasReview, true, 'seeded membership must reveal review panel')
  assert.ok(memberState.reviewCount >= 1, `seeded review list required: ${JSON.stringify(memberState)}`)
  assert.match(memberState.reviewText, /AB12345678|Playwright Seed Shop/u)
  const reviewStage = memberState.stages.find((stage) => stage.id === 'review')
  assert.ok(reviewStage)
  assert.equal(reviewStage.code, 'carrier_sync_pending_review')
  assert.equal(memberState.hasRecoveryCta, true, 'recovery CTA must remain after seeded review')

  const formal = await runFormalCarrierSyncFlow()
  assert.equal(formal.ok, true, JSON.stringify(formal))

  console.log('Carrier sync Playwright app-shell + seeded review + formal credentials→captcha→import flow passed')
} finally {
  try {
    await runPlaywrightCli(['close'])
  } catch {
    // ignore session close failures
  }
  stopPreviewProcess(preview)
}
