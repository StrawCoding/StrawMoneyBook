import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.BUDGET_SAVE_PLAYWRIGHT_PORT || 4175)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'budget-save',
  port: previewPort,
})

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
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      path: window.location.pathname,
    })`)
    if (state.hasBottomNav) return { ok: true, skipped: false }
    if (state.intro) {
      await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
    }
    await delay(500)
  }

  throw new Error('onboarding failed: bottom-nav missing')
}

async function installErrorCapture() {
  await runPlaywrightCli(['eval', `() => {
    window.__playwrightErrors = []
    window.addEventListener('error', (event) => {
      window.__playwrightErrors.push(String(event?.error?.message ?? event?.message ?? 'unknown error'))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__playwrightErrors.push(String(event?.reason?.message ?? event?.reason ?? 'unknown rejection'))
    })
    return true
  }`], { raw: true })
}

async function readCapturedErrors() {
  return evalPage(`() => window.__playwrightErrors ?? []`)
}

async function readToastTexts() {
  return evalPage(`() => [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)`)
}

async function assertBudgetPageReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasBudgetTitle: Boolean(document.querySelector('.page-title')),
      hasBudgetSavePanel: Boolean(document.querySelector('.budget-save-panel')),
      hasAddContainer: [...document.querySelectorAll('button')].some((button) => /Add Shared Budget Pool|新增共同預算池|共同予算プール/u.test(button.textContent ?? '')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      booting: Boolean(document.querySelector('.boot-layer')),
    })`)
    if (!state.booting && state.path === '/budget' && state.hasBudgetTitle && state.hasBudgetSavePanel) {
      return state
    }
    await delay(400)
  }

  const finalState = await evalPage(`() => ({
    path: window.location.pathname,
    hasBudgetTitle: Boolean(document.querySelector('.page-title')),
    hasBudgetSavePanel: Boolean(document.querySelector('.budget-save-panel')),
    title: document.title,
    bodyText: document.body?.innerText?.slice(0, 500) ?? '',
  })`)
  assert.equal(finalState.path, '/budget', JSON.stringify(finalState, null, 2))
  assert.equal(finalState.hasBudgetTitle, true, JSON.stringify(finalState, null, 2))
  assert.equal(finalState.hasBudgetSavePanel, true, JSON.stringify(finalState, null, 2))
  return finalState
}

async function navigateToBudget() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-features"]'])
  await delay(800)
  await runPlaywrightCli(['click', 'a.feature-link[href="/budget"]'])
  await delay(1000)
}

async function assertNoBudgetSaveCrash() {
  const errors = await readCapturedErrors()
  const crash = errors.filter((message) => /normalizeBudgetSaveEnabled is not defined/i.test(message))
  assert.equal(crash.length, 0, `unexpected runtime errors: ${JSON.stringify(errors, null, 2)}`)

  const toasts = await readToastTexts()
  const crashToast = toasts.filter((text) => /normalizeBudgetSaveEnabled is not defined/i.test(text))
  assert.equal(crashToast.length, 0, `unexpected toast errors: ${JSON.stringify(toasts, null, 2)}`)
}

async function saveBudgetContainerWithToggle() {
  await runPlaywrightCli(['click', "button:has-text('Add Shared Budget Pool'), button:has-text('新增共同預算池'), button:has-text('共同予算プールを追加')"])
  await delay(800)

  await runPlaywrightCli(['fill', '.form-wrap input.input[type="text"]', 'Playwright Pool'])
  await runPlaywrightCli(['fill', '.form-wrap input.input[type="number"]', '1000'])
  await runPlaywrightCli(['click', '[data-testid="budget-container-surplus-save"]'])
  await delay(300)
  await runPlaywrightCli(['click', '.form-wrap .switch-row'])
  await delay(300)
  await runPlaywrightCli(['click', '.form-wrap .switch-row'])
  await delay(300)
  await runPlaywrightCli(['click', '[data-testid="budget-container-surplus-roll"]'])
  await delay(300)
  await runPlaywrightCli(['click', ".app-overlay-sheet-card .footer button.btn.primary:has-text('Save'), .app-overlay-sheet-card .footer button.btn.primary:has-text('儲存'), .app-overlay-sheet-card .footer button.btn.primary:has-text('保存')"])
  await delay(1200)
}

async function saveTotalBudgetSaveToggle() {
  await runPlaywrightCli(['click', '.budget-save-panel .summary-entry-btn'])
  await delay(600)
  await runPlaywrightCli(['click', "button:has-text('Edit'), button:has-text('編輯'), button:has-text('編集')"])
  await delay(600)
  await runPlaywrightCli(['click', '.form-wrap .switch-row'])
  await delay(300)
  await runPlaywrightCli(['click', '.form-wrap .switch-row'])
  await delay(300)
  await runPlaywrightCli(['click', ".app-overlay-sheet-card .footer button.btn.primary:has-text('Save'), .app-overlay-sheet-card .footer button.btn.primary:has-text('儲存'), .app-overlay-sheet-card .footer button.btn.primary:has-text('保存')"])
  await delay(1200)
}

console.log('--- Playwright: budget save toggle + save ---')

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

  await installErrorCapture()

  await navigateToBudget()
  await assertBudgetPageReady()

  await saveBudgetContainerWithToggle()
  await assertNoBudgetSaveCrash()

  await saveTotalBudgetSaveToggle()
  await assertNoBudgetSaveCrash()

  console.log('Budget save Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
