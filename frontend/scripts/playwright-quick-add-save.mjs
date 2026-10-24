import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.QUICK_ADD_PLAYWRIGHT_PORT || 4177)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'quick-add-save',
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
      localStorage.setItem('straw.bookkeeping.last_path', '/transactions/quick-add')
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

async function readToastTexts() {
  return evalPage(`() => [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)`)
}

async function openQuickAddFromFab() {
  await runPlaywrightCli(['click', '[data-testid=home-fab]'])
  await delay(1400)
  const path = await evalPage(`() => window.location.pathname`)
  assert.match(path, /quick-add|qna|ai-auto-bookkeeping/, path)
}

async function enterAmountViaCalculator(major) {
  const mode = await evalPage(`() => document.querySelector('.amount-calc-inline') ? 'inline' : 'overlay'`)
  const root = mode === 'inline' ? '.amount-calc-inline' : '.calc-sheet'
  if (mode === 'overlay') {
    await runPlaywrightCli(['click', '.quick-add-page .calc-trigger'])
    await delay(500)
    await runPlaywrightCli(['click', `${root} .clear-btn`])
  } else {
    for (let i = 0; i < 8; i += 1) {
      await runPlaywrightCli(['click', `${root} .back-btn`])
    }
  }
  for (const digit of String(major)) {
    if (digit === '.') {
      await runPlaywrightCli(['click', `${root} button:has-text(".")`])
    } else {
      await runPlaywrightCli(['click', `${root} button.digit-btn:has-text("${digit}")`])
    }
  }
  if (mode === 'overlay') {
    await runPlaywrightCli(['click', `${root} .confirm-btn`])
  }
  await delay(400)
}

console.log('--- Playwright: quick-add save ---')

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

  await openQuickAddFromFab()

  await runPlaywrightCli(['click', '[data-testid=quick-add-create]'])
  await delay(800)
  let toasts = await readToastTexts()
  assert.ok(
    toasts.some((text) => /有效金額|greater than 0|0 より大きい/u.test(text)),
    `expected zero-amount toast, got: ${JSON.stringify(toasts)}`,
  )

  await enterAmountViaCalculator(88)
  const amountLabel = await evalPage(`() => document.querySelector('.quick-add-page .calc-trigger-expr')?.textContent?.trim() ?? ''`)
  assert.match(amountLabel, /88/, `calculator did not apply amount, label=${amountLabel}`)

  await runPlaywrightCli(['click', '[data-testid=quick-add-save-and-add]'])
  let stayOnQuickAdd = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      hasCreate: Boolean(document.querySelector('[data-testid=quick-add-create]')),
    })`)
    if (state.toasts.some((text) => /新增失敗|失敗|failed|錯誤|required|有效金額/u.test(text))) {
      assert.fail(`save-and-add failed: ${JSON.stringify(state)}`)
    }
    if (state.path.includes('quick-add') && state.hasCreate) {
      stayOnQuickAdd = true
      break
    }
    await delay(150)
  }
  assert.ok(stayOnQuickAdd, '再記 must stay on quick-add')

  await enterAmountViaCalculator(66)
  await runPlaywrightCli(['click', '[data-testid=quick-add-create]'])
  let saveSucceeded = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      path: window.location.pathname,
    })`)
    toasts = state.toasts
    if (toasts.some((text) => /交易已新增|已建立|created|作成/u.test(text))) {
      saveSucceeded = true
      break
    }
    if (toasts.some((text) => /新增失敗|失敗|failed|錯誤|required|有效金額/u.test(text))) {
      assert.fail(`save failed: ${JSON.stringify(toasts)}`)
    }
    if (state.path === '/' || state.path === '/home') {
      saveSucceeded = true
      break
    }
    await delay(150)
  }
  assert.ok(saveSucceeded, `expected success toast or home navigation, got toasts=${JSON.stringify(toasts)}`)

  console.log('Quick-add save Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
