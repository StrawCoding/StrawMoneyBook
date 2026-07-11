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
const previewPort = Number(process.env.BUDGET_CROSS_MONTH_PLAYWRIGHT_PORT || 4176)
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
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
    return true
  }`], { raw: true })

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    })`)
    if (state.hasBottomNav) return
    if (!state.booting && (state.welcome || state.intro)) break
    await delay(500)
  }

  const welcome = await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)
  if (welcome) {
    await runPlaywrightCli(['click', "button:has-text('Next')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Cross Month Ledger ${Date.now()}`])
    await runPlaywrightCli(['click', "button:has-text('Create Ledger'), button:has-text('建立帳本'), button:has-text('帳簿を作成')"])
    await delay(2500)
    await runPlaywrightCli(['fill', '.welcome-root input.input >> nth=0', 'Cash'])
    await runPlaywrightCli(['fill', '.welcome-root input.input >> nth=1', 'Wallet'])
    await runPlaywrightCli(['click', "button:has-text('Create Account'), button:has-text('建立帳戶'), button:has-text('口座を作成')"])
    await delay(3000)
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    })`)
    if (state.hasBottomNav) return
    if (state.intro) {
      await runPlaywrightCli(['click', "button:has-text('Start now'), button:has-text('先開始使用'), button:has-text('Skip'), button:has-text('今すぐ始める')"])
    }
    await delay(500)
  }
  throw new Error('onboarding failed: bottom-nav missing')
}

async function waitForBudgetPageReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasBudgetTitle: Boolean(document.querySelector('.page-title')),
      hasAddContainer: [...document.querySelectorAll('button')].some((button) => /Add Shared Budget Pool|新增共同預算池|共同予算プール/u.test(button.textContent ?? '')),
      booting: Boolean(document.querySelector('.boot-layer')),
    })`)
    if (!state.booting && state.path === '/budget' && state.hasBottomNav && state.hasBudgetTitle && state.hasAddContainer) return
    await delay(400)
  }
  const bodyText = await evalPage(`() => document.body?.innerText?.slice(0, 800) ?? ''`)
  throw new Error(`budget page not ready: ${bodyText}`)
}

async function navigateToBudget() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-features"]'])
  await delay(800)
  await runPlaywrightCli(['click', 'a.feature-link[href="/budget"]'])
  await delay(1000)
  await waitForBudgetPageReady()
}

async function pickBudgetMonth(monthKey) {
  const [yearText, monthText] = monthKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  await runPlaywrightCli(['click', '.range-picker .trigger'])
  await delay(300)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentYear = await evalPage(`() => {
      const text = document.querySelector('.panel-head strong')?.textContent ?? ''
      const matched = text.match(/\\d{4}/)
      return matched ? Number(matched[0]) : null
    }`)
    if (currentYear === year) break
    await runPlaywrightCli(['click', currentYear < year ? '.panel-head .nav-btn >> nth=1' : '.panel-head .nav-btn >> nth=0'])
    await delay(200)
  }
  await runPlaywrightCli(['click', `.month-grid .cell-btn >> nth=${month - 1}`])
  await delay(900)
  const state = await evalPage(`() => ({
    label: document.querySelector('.range-picker .trigger')?.textContent ?? '',
    body: document.body?.innerText ?? '',
  })`)
  assert.match(state.label, new RegExp(`${year}|${month}`), JSON.stringify(state, null, 2))
}

async function createPool({ name, amount, applyThroughMonth = '', periodMode = 'monthly', selectFirstCategory = false }) {
  await closeOpenOverlayIfAny()
  await runPlaywrightCli(['click', "button:has-text('Add Shared Budget Pool'), button:has-text('新增共同預算池'), button:has-text('共同予算プールを追加')"])
  await delay(700)
  await runPlaywrightCli(['fill', '.form-wrap input.input[type="text"]', name])
  if (periodMode === 'daily') {
    await runPlaywrightCli(['click', "button:has-text('Daily Pool'), button:has-text('日池'), button:has-text('日プール')"])
    await delay(300)
    if (selectFirstCategory) {
      await runPlaywrightCli(['click', '.category-chip-grid .category-chip >> nth=0'])
      await delay(200)
    }
  }
  if (applyThroughMonth) {
    await runPlaywrightCli(['fill', '.form-wrap input.input[type="month"]', applyThroughMonth])
  }
  await runPlaywrightCli(['fill', '.form-wrap input.input[type="number"]', String(amount)])
  await runPlaywrightCli(['click', "button.btn.primary:has-text('Save'), button.btn.primary:has-text('儲存'), button.btn.primary:has-text('保存')"])
  await delay(1200)
}

async function readBudgetBody() {
  return evalPage(`() => document.body?.innerText ?? ''`)
}

async function closeOpenOverlayIfAny() {
  const hasOverlay = await evalPage(`() => Boolean(document.querySelector('.app-overlay-sheet-mask'))`)
  if (!hasOverlay) return
  await runPlaywrightCli(['eval', `() => {
    window.dispatchEvent(new Event('app:request-close-overlay'))
    return true
  }`], { raw: true })
  await delay(500)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function assertBudgetBodyContains(monthKey, text) {
  await pickBudgetMonth(monthKey)
  const body = await readBudgetBody()
  assert.match(body, new RegExp(escapeRegex(text), 'u'), `${monthKey} body did not contain ${text}`)
}

async function assertBudgetBodyDoesNotContain(monthKey, text) {
  await pickBudgetMonth(monthKey)
  const body = await readBudgetBody()
  assert.doesNotMatch(body, new RegExp(escapeRegex(text), 'u'), `${monthKey} body unexpectedly contained ${text}`)
}

async function assertToastContains(pattern) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const toasts = await evalPage(`() => [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean)`)
    if (toasts.some((text) => pattern.test(text))) return
    await delay(300)
  }
  const body = await readBudgetBody()
  assert.match(body, pattern)
}

console.log('--- Playwright: budget cross-month creation ---')

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
  await completeOnboarding()
  await navigateToBudget()

  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Cross Monthly Pool', amount: 1000, applyThroughMonth: '2027-01' })
  await assertBudgetBodyContains('2026-11', 'Cross Monthly Pool')
  await assertBudgetBodyContains('2026-12', 'Cross Monthly Pool')
  await assertBudgetBodyContains('2027-01', 'Cross Monthly Pool')

  await pickBudgetMonth('2026-02')
  await createPool({
    name: 'Cross Daily Pool',
    amount: 100,
    applyThroughMonth: '2026-03',
    periodMode: 'daily',
    selectFirstCategory: true,
  })
  await assertBudgetBodyContains('2026-02', 'Cross Daily Pool')
  await assertBudgetBodyContains('2026-03', 'Cross Daily Pool')

  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Reverse Range Pool', amount: 100, applyThroughMonth: '2026-10' })
  await assertToastContains(/套用月份格式不正確|invalid|開始月より前/u)
  await closeOpenOverlayIfAny()
  await assertBudgetBodyDoesNotContain('2026-11', 'Reverse Range Pool')

  await pickBudgetMonth('2026-12')
  await createPool({ name: 'Collision Pool', amount: 300 })
  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Collision Pool', amount: 300, applyThroughMonth: '2027-01' })
  await assertToastContains(/2026-12/u)
  await closeOpenOverlayIfAny()
  await assertBudgetBodyDoesNotContain('2027-01', 'Collision Pool')

  console.log('Budget cross-month Playwright flow passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
