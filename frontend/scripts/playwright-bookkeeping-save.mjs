import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.BOOKKEEPING_PLAYWRIGHT_PORT || 4179)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'bookkeeping-save',
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
    window.__pwErrors = []
    window.addEventListener('error', (event) => {
      window.__pwErrors.push(String(event?.message ?? event))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__pwErrors.push(String(event?.reason?.message ?? event?.reason ?? 'unhandledrejection'))
    })
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

function dumpStateScript() {
  return `() => {
    const vueRoot = document.querySelector('.quick-add-page, .ai-page')
    let model = null
    let current = vueRoot?.__vueParentComponent
    while (current && !model) {
      model = current.setupState?.model ?? current.ctx?.model ?? null
      current = current.parent
    }
    return {
      path: window.location.pathname,
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      errors: window.__pwErrors ?? [],
      amountLabel: document.querySelector('.quick-add-page .calc-trigger-expr')?.textContent?.trim() ?? '',
      amountInput: document.querySelector('.ai-page input.input')?.value ?? '',
      hasDraft: Boolean(document.querySelector('.ai-page .result-panel')),
      txItems: [...document.querySelectorAll('.tx-item')].map((node) => node.textContent?.replace(/\\s+/g, ' ').trim()),
      txCountBadge: document.querySelector('.tx-count-badge')?.textContent?.trim() ?? '',
      model: model ? {
        type: model.type,
        amountMajor: model.amountMajor,
        amountInput: model.amountInput,
        accountId: model.accountId,
        categoryId: model.categoryId,
        occurredDate: model.occurredDate,
        occurredHour: model.occurredHour,
        occurredMinute: model.occurredMinute,
      } : null,
    }
  }`
}

async function dump(label) {
  const state = await evalPage(dumpStateScript())
  console.log(`[dump ${label}]`, JSON.stringify(state, null, 2))
  return state
}

async function enterAmountViaCalculator(major) {
  await runPlaywrightCli(['click', '.quick-add-page .calc-trigger'])
  await delay(500)
  await runPlaywrightCli(['click', '.calc-sheet .clear-btn'])
  for (const digit of String(major)) {
    await runPlaywrightCli(['click', `.calc-sheet button.digit-btn:has-text("${digit}")`])
  }
  await runPlaywrightCli(['click', '.calc-sheet .confirm-btn'])
  await delay(400)
}

async function waitForHomeFeed(expectedSnippet, timeoutMs = 8000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    last = await evalPage(`() => ({
      path: window.location.pathname,
      txItems: [...document.querySelectorAll('.tx-item')].map((node) => node.textContent?.replace(/\\s+/g, ' ').trim()),
      txCountBadge: document.querySelector('.tx-count-badge')?.textContent?.trim() ?? '',
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      body: document.body.innerText.slice(0, 1800),
    })`)
    if (
      (last.path === '/' || last.path === '/home')
      && last.txItems.some((text) => String(text).includes(String(expectedSnippet)))
    ) {
      return last
    }
    await delay(250)
  }
  return last
}

console.log('--- Playwright: AI + manual bookkeeping save ---')
if (process.env.SKIP_WEB_BUILD === '1') {
  console.log('Skipping web build (SKIP_WEB_BUILD=1)')
} else {
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

  await runPlaywrightCli(['click', '[data-testid=home-fab]'])
  await delay(1400)
  let state = await dump('manual-open')
  assert.match(state.path, /quick-add|qna|ai-auto-bookkeeping/, state.path)
  if (!/quick-add/.test(state.path)) {
    await runPlaywrightCli(['click', '[data-testid=bookkeeping-mode-manual]'])
    await delay(600)
    await runPlaywrightCli(['click', '[data-testid=bookkeeping-manual-quick]'])
    await delay(800)
    state = await dump('manual-open-forced')
  }
  assert.match(state.path, /quick-add/)

  await enterAmountViaCalculator(88)
  state = await dump('manual-after-amount')
  assert.match(String(state.amountLabel || state.model?.amountMajor || ''), /88/, `manual amount not applied: ${JSON.stringify(state)}`)

  await runPlaywrightCli(['click', '[data-testid=quick-add-create]'])
  const manualHome = await waitForHomeFeed('88')
  await dump('manual-after-save')
  assert.ok(
    (manualHome?.txItems ?? []).some((text) => text.includes('88')),
    `manual save did not appear on home: ${JSON.stringify(manualHome, null, 2)}`,
  )

  await runPlaywrightCli(['click', '[data-testid=home-fab]'])
  await delay(1200)
  await runPlaywrightCli(['click', '[data-testid=bookkeeping-mode-ai]'])
  await delay(1000)
  await dump('ai-open')
  await runPlaywrightCli(['fill', '.ai-page textarea.textarea', '午餐 77'])
  await delay(300)
  await runPlaywrightCli(['click', '[data-testid=ai-bookkeeping-parse]'])

  const aiStarted = Date.now()
  let aiState = null
  while (Date.now() - aiStarted < 15000) {
    aiState = await evalPage(dumpStateScript())
    if (
      aiState.toasts.some((text) => /已儲存|儲存交易|交易已新增|失敗|沒有|請/u.test(text))
      || aiState.path.includes('transaction')
      || (aiState.txItems ?? []).some((text) => text.includes('77'))
    ) {
      break
    }
    await delay(300)
  }
  console.log('[dump ai-after-parse-submit]', JSON.stringify(aiState, null, 2))

  if (aiState.path.includes('quick-add') || aiState.path.includes('ai-auto')) {
    const saveBtn = await evalPage(`() => Boolean(document.querySelector('[data-testid=ai-bookkeeping-save]'))`)
    if (saveBtn) {
      await runPlaywrightCli(['click', '[data-testid=ai-bookkeeping-save]'])
      await delay(1500)
      aiState = await dump('ai-after-manual-save')
    }
  }

  const savedToEdit = /\/transactions\/[^/]+\/edit/.test(String(aiState.path ?? ''))
  if (!(aiState.txItems ?? []).some((text) => text.includes('77')) && !savedToEdit) {
    await runPlaywrightCli(['eval', `() => { window.location.href = '${baseUrl}/'; return true }`], { raw: true })
  }
  if (!(aiState.txItems ?? []).some((text) => text.includes('77'))) {
    await runPlaywrightCli(['eval', `() => { window.location.href = '${baseUrl}/'; return true }`], { raw: true })
    const aiHome = await waitForHomeFeed('77', 10000)
    await dump('ai-home')
    assert.ok(
      (aiHome?.txItems ?? []).some((text) => text.includes('77')),
      `AI save did not appear on home: ${JSON.stringify({ aiState, aiHome }, null, 2)}`,
    )
  }

  console.log('AI + manual bookkeeping save Playwright passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
