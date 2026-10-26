import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.CLAIM_PAYMENT_PLAYWRIGHT_PORT || 4191)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'claim-sheet-payment',
  port: previewPort,
})

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

async function completeOnboarding() {
  await runPlaywrightCli(['eval', `() => {
    try {
      localStorage.setItem('strawmoneybook.ui.layout', 'modern')
    } catch {}
    return true
  }`], { raw: true })

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
    })`)
    if (state.hasBottomNav) return { ok: true, skipped: true }
    if (state.welcome) break
    await delay(400)
  }

  const welcome = await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)
  if (welcome) {
    await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步'), button:has-text('次へ')"])
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
    })`)
    if (state.hasBottomNav) return { ok: true, skipped: false }
    await delay(500)
  }
  throw new Error('onboarding failed: bottom-nav missing')
}

async function clickByTestId(testId) {
  const clicked = await evalPage(`() => {
    const target = document.querySelector('[data-testid="${testId}"]')
    if (!target) return { ok: false, reason: 'missing' }
    target.click()
    return { ok: true, text: target.textContent?.trim() ?? '' }
  }`)
  assert.equal(clicked.ok, true, JSON.stringify({ testId, clicked }))
}

async function waitForClaimSheets() {
  let lastState = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    lastState = await evalPage(`() => ({
      path: window.location.pathname,
      booting: Boolean(document.querySelector('.boot-root, .app-boot, [data-testid=app-boot]')),
      hasCreate: Boolean(document.querySelector('[data-testid=claim-create-open]')),
      heading: document.querySelector('h2')?.textContent?.trim() ?? '',
      body: (document.body?.innerText ?? '').slice(0, 240),
    })`)
    if (lastState.path.includes('/claim-sheets') && lastState.hasCreate && !lastState.booting) {
      return lastState
    }
    await delay(400)
  }
  throw new Error(`claim sheets page did not load: ${JSON.stringify(lastState)}`)
}

console.log('--- Playwright: claim sheet installment payment ---')

if (!process.env.SMB_SKIP_WEB_BUILD) {
  console.log('Building web preview bundle...')
  await execFileAsync('npm', ['run', 'build:web'], {
    cwd: frontendDir,
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 300000,
  })
}

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

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const home = await evalPage(`() => ({
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      booting: Boolean(document.querySelector('.boot-root, .app-boot, [data-testid=app-boot]')),
    })`)
    if (home.hasBottomNav && !home.booting && (home.path === '/' || home.path === '/home')) break
    await delay(250)
  }

  await runPlaywrightCli(['goto', `${baseUrl}/claim-sheets`])
  await waitForClaimSheets()

  await runPlaywrightCli(['click', '[data-testid=claim-create-open]'])
  await delay(800)
  await runPlaywrightCli(['fill', '[data-testid=claim-create-title]', '分次入帳測試'])
  await clickByTestId('claim-draft-add-manual')
  await delay(400)
  await runPlaywrightCli(['fill', '[data-testid=claim-manual-amount]', '200'])
  await clickByTestId('claim-manual-save')
  await delay(400)
  await delay(300)
  const createReady = await evalPage(`() => {
    const submit = document.querySelector('[data-testid=claim-create-submit]')
    return {
      disabled: Boolean(submit?.disabled),
      title: document.querySelector('[data-testid=claim-create-title]')?.value ?? '',
      amount: document.querySelector('[data-testid=claim-manual-amount]')?.value ?? '',
    }
  }`)
  assert.equal(createReady.disabled, false, JSON.stringify(createReady))

  await clickByTestId('claim-create-submit')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      hasPay: Boolean(document.querySelector('[data-testid=claim-record-payment]')),
      createOpen: Boolean(document.querySelector('[data-testid=claim-create-title]')),
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    })`)
    if (state.hasPay && !state.createOpen) break
    if (state.toasts.some((text) => /失敗|failed|錯誤/u.test(text))) {
      assert.fail(`create claim failed: ${JSON.stringify(state)}`)
    }
    if (attempt === 39) assert.fail(`claim not created: ${JSON.stringify(state)}`)
    await delay(250)
  }

  await clickByTestId('claim-record-payment')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const amount = await evalPage(`() => document.querySelector('[data-testid=claim-payment-amount]')?.value ?? ''`)
    if (amount) {
      assert.equal(Number(amount), 200, `expected remaining 200, got ${amount}`)
      break
    }
    if (attempt === 39) assert.fail('payment amount field missing')
    await delay(250)
  }

  await runPlaywrightCli(['fill', '[data-testid=claim-payment-amount]', '80'])
  await delay(300)
  await clickByTestId('claim-payment-submit')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      remaining: [...document.querySelectorAll('.claim-item')].map((node) => node.textContent || '').join(' '),
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      hasPay: Boolean(document.querySelector('[data-testid=claim-record-payment]')),
    })`)
    if (state.toasts.some((text) => /剩餘|remaining|残高/u.test(text)) || /120/.test(state.remaining)) {
      assert.ok(state.hasPay, JSON.stringify(state))
      assert.ok(state.path.includes('/claim-sheets'), JSON.stringify(state))
      break
    }
    if (state.toasts.some((text) => /失敗|failed|錯誤/u.test(text))) {
      assert.fail(`partial payment failed: ${JSON.stringify(state)}`)
    }
    if (attempt === 39) assert.fail(`partial payment not recorded: ${JSON.stringify(state)}`)
    await delay(250)
  }

  await clickByTestId('claim-record-payment')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const amount = await evalPage(`() => document.querySelector('[data-testid=claim-payment-amount]')?.value ?? ''`)
    if (amount) {
      assert.equal(Number(amount), 120, `expected remaining 120, got ${amount}`)
      break
    }
    if (attempt === 39) assert.fail('second payment amount field missing')
    await delay(250)
  }

  await clickByTestId('claim-payment-submit')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    })`)
    if (state.path === '/' || state.path === '/home' || state.toasts.some((text) => /已完成|completed|完了/u.test(text))) {
      break
    }
    if (state.toasts.some((text) => /失敗|failed|錯誤/u.test(text))) {
      assert.fail(`final payment failed: ${JSON.stringify(state)}`)
    }
    if (attempt === 39) assert.fail(`final payment not completed: ${JSON.stringify(state)}`)
    await delay(250)
  }

  console.log('Claim sheet installment Playwright passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
