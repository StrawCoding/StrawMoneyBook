import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const frontendDir = '/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend'
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(fileURLToPath(new URL('../playwright-cli.json', import.meta.url)))
const previewPort = Number(process.env.BUDGET_PAY_CYCLE_PLAYWRIGHT_PORT || 4177)
const baseUrl = `http://127.0.0.1:${previewPort}`

async function runPlaywrightCli(args, { raw = false, timeout = 60000 } = {}) {
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
      BUDGET_PAY_CYCLE_BASE_URL: baseUrl,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
      PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
    },
    maxBuffer: 8 * 1024 * 1024,
    timeout,
  })
}

async function snapshotText() {
  const result = await runPlaywrightCli(['snapshot'], { timeout: 60000 })
  return String(result.stdout ?? '')
}

async function evalPage(script) {
  const result = await runPlaywrightCli(['eval', script], { raw: true, timeout: 60000 })
  const stdout = String(result.stdout ?? '').trim()
  if (!stdout) {
    throw new Error('playwright eval returned empty payload')
  }
  return JSON.parse(stdout)
}

async function waitForPreviewReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    try {
      const response = await fetch(`${baseUrl}/`, { signal: controller.signal })
      if (response.ok) return
    } catch {
      // retry
    } finally {
      clearTimeout(timeout)
    }
    await delay(500)
  }
  throw new Error(`preview server not ready at ${baseUrl}`)
}

async function runLogged(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? frontendDir,
    env: options.env ?? process.env,
    stdio: 'inherit',
  })
  const timeoutMs = Number(options.timeout ?? 300000)
  let timeoutId
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ timedOut: true })
    }, timeoutMs)
  })
  const exit = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  const result = await Promise.race([exit, timeout])
  clearTimeout(timeoutId)
  if (result.timedOut) {
    throw new Error(`${command} ${args.join(' ')} timed out`)
  }
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.code ?? result.signal}`)
  }
}

async function assertSourceContract() {
  const [
    budgetingVue,
    settingsLedgerVue,
    budgetItemSheetVue,
    budgetContainerSheetVue,
    homeBudgetCardVue,
    budgetStore,
    budgetService,
    homePeriodFilter,
    transactionRepo,
    errorLogService,
    appRuntimeService,
    migrationSql,
  ] = await Promise.all([
    readFile(resolve(frontendDir, 'src/ui/views/budgeting.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/views/settings/SettingsLedgerDetailPage.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/components/budget/BudgetItemSheet.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/components/budget/BudgetContainerSheet.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/components/home/HomeBudgetSummaryCard.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/stores/budget.store.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/core/services/budget.service.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/composables/useHomePeriodFilter.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/core/repositories/transaction.repo.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/services/error-log.service.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/services/app-runtime.service.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/core/db/migrations/039_budget_pay_cycle.sql'), 'utf8'),
  ])

  assert.match(budgetingVue, /pay_cycle_budget/)
  assert.match(budgetingVue, /goPreviousPeriod/)
  assert.match(budgetingVue, /next_pay_day/)
  assert.match(settingsLedgerVue, /budgetPeriodMode/)
  assert.match(settingsLedgerVue, /budgetPayDay/)
  assert.match(budgetItemSheetVue, /budget-item-period-pay-cycle/)
  assert.match(budgetItemSheetVue, /ledgerBudgetPeriodSettings/)
  assert.match(budgetContainerSheetVue, /budget-container-period-pay-cycle/)
  assert.match(budgetContainerSheetVue, /ledgerBudgetPeriodSettings/)
  assert.match(budgetingVue, /updateBudgetPeriodSettings/)
  assert.match(budgetingVue, /shouldApplyBudgetPeriodSettings/)
  assert.match(homeBudgetCardVue, /budgeting\.period\.next_pay_day/)
  assert.match(budgetStore, /resolveBudgetPeriodForLedger/)
  assert.match(budgetStore, /loadCurrentPeriod/)
  assert.match(budgetStore, /dateKeyForTimeZone/)
  assert.match(budgetStore, /normalizeBudgetMonthInput/)
  assert.match(budgetService, /resolvePayCycleBudgetPeriod/)
  assert.match(budgetService, /parsePayCycleMonthKey/)
  assert.match(homePeriodFilter, /normalizeMonthKey\(budgetStore\.monthKey\) \|\| monthKeyFromDate/)
  assert.match(transactionRepo, /function parseMonthKey/)
  assert.match(transactionRepo, /if \(!range\) return \[\]/)
  assert.match(transactionRepo, /if \(!range\) return null/)
  assert.match(errorLogService, /window\.__SMB_ERROR_LOG__/)
  assert.match(errorLogService, /stack: String/)
  assert.match(appRuntimeService, /reloadCurrentBudgetPeriodInBackground/)
  assert.match(appRuntimeService, /loadCurrentPeriod\(\)/)
  assert.match(appRuntimeService, /appStateChange/)
  assert.match(appRuntimeService, /visibilitychange/)
  assert.match(budgetService, /pay:/)
  assert.match(migrationSql, /period_key/)
  assert.match(migrationSql, /budget_period_mode/)
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

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      bodyText: document.body?.innerText ?? '',
    })`)
    if (state.hasBottomNav && !state.welcome && !state.intro) return
    if (state.intro) {
      await clickText('button', ['Start now', '先開始使用', 'Skip', '今すぐ始める'])
      await delay(1200)
      continue
    }
    if (!state.welcome) {
      await delay(500)
      continue
    }
    if (/Step 1|1\s*\/\s*3|第\s*1/u.test(state.bodyText)) {
      await clickText('button', ['Next', '下一步', '次へ'])
      await delay(900)
      continue
    }
    if (/Step 2|2\s*\/\s*3|第\s*2/u.test(state.bodyText)) {
      await fillInput('.welcome-root input.input', `Pay Cycle Ledger ${Date.now()}`)
      await clickText('button', ['Create Ledger', '建立帳本', '帳簿を作成'])
      await delay(2500)
      continue
    }
    if (/Step 3|3\s*\/\s*3|第\s*3/u.test(state.bodyText)) {
      await fillInput('.welcome-root input.input', 'Cash', 0)
      await fillInput('.welcome-root input.input', 'Wallet', 1)
      await clickText('button', ['Create Account', '建立帳戶', '口座を作成'])
      await delay(3000)
      continue
    }
    await delay(500)
  }

  if (await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)) {
    await clickText('button', ['Next', '下一步', '次へ'])
    await delay(900)
    await fillInput('.welcome-root input.input', `Pay Cycle Ledger ${Date.now()}`)
    await clickText('button', ['Create Ledger', '建立帳本', '帳簿を作成'])
    await delay(2500)
    await fillInput('.welcome-root input.input', 'Cash', 0)
    await fillInput('.welcome-root input.input', 'Wallet', 1)
    await clickText('button', ['Create Account', '建立帳戶', '口座を作成'])
    await delay(3000)
  }

  let readyTicks = 0
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    })`)
    if (state.hasBottomNav && !state.welcome && !state.intro) {
      readyTicks += 1
      if (readyTicks >= 4) return
    } else {
      readyTicks = 0
    }
    if (!state.booting && (state.welcome || state.intro)) break
    await delay(500)
  }

  if (await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)) {
    await clickText('button', ['Next', '下一步', '次へ'])
    await delay(900)
    await fillInput('.welcome-root input.input', `Pay Cycle Ledger ${Date.now()}`)
    await clickText('button', ['Create Ledger', '建立帳本', '帳簿を作成'])
    await delay(2500)
    await fillInput('.welcome-root input.input', 'Cash', 0)
    await fillInput('.welcome-root input.input', 'Wallet', 1)
    await clickText('button', ['Create Account', '建立帳戶', '口座を作成'])
    await delay(3000)
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    })`)
    if (state.hasBottomNav && !state.welcome && !state.intro) return
    if (state.intro) {
      await clickText('button', ['Start now', '先開始使用', 'Skip', '今すぐ始める'])
    }
    await delay(500)
  }
  throw new Error('onboarding failed: bottom-nav missing')
}

async function assertBudgetPageReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasTitle: Boolean(document.querySelector('.page-title')),
      hasAddItem: [...document.querySelectorAll('button')].some((button) => /Add Item|新增項目|項目を追加/u.test(button.textContent ?? '')),
      bodyText: document.body?.innerText?.slice(0, 800) ?? '',
    })`)
    if (state.path === '/budget' && state.hasTitle && state.hasAddItem) return
    await delay(500)
  }
  const state = await evalPage(`() => ({
    path: window.location.pathname,
    bodyText: document.body?.innerText?.slice(0, 1200) ?? '',
  })`)
  throw new Error(`budget page not ready: ${JSON.stringify(state, null, 2)}`)
}

async function assertBodyMatches(pattern, label) {
  const body = await evalPage(`() => document.body?.innerText ?? ''`)
  assert.match(body, pattern, `${label}\n${body.slice(0, 1200)}`)
}

async function assertBodyDoesNotMatch(pattern, label) {
  const body = await evalPage(`() => document.body?.innerText ?? ''`)
  assert.doesNotMatch(body, pattern, `${label}\n${body.slice(0, 1200)}`)
}

async function clickText(selector, labels) {
  await runPlaywrightCli(['eval', `() => {
    const selector = ${JSON.stringify(selector)}
    const labels = ${JSON.stringify(labels)}
    const target = [...document.querySelectorAll(selector)].find((node) => {
      const text = node.textContent ?? ''
      return labels.some((label) => text.includes(label))
    })
    if (!target) throw new Error(\`missing clickable text in \${selector}: \${labels.join(', ')}\`)
    target.click()
    return true
  }`], { raw: true })
}

async function clickSelector(selector) {
  await runPlaywrightCli(['eval', `() => {
    const selector = ${JSON.stringify(selector)}
    const target = document.querySelector(selector)
    if (!target) throw new Error(\`missing selector: \${selector}\`)
    target.click()
    return true
  }`], { raw: true })
}

async function fillInput(selector, value, index = 0) {
  await runPlaywrightCli(['eval', `() => {
    const selector = ${JSON.stringify(selector)}
    const value = ${JSON.stringify(String(value))}
    const index = ${JSON.stringify(String(index))}
    const target = [...document.querySelectorAll(selector)][Number(index)]
    if (!target) throw new Error(\`missing input: \${selector}[\${index}]\`)
    target.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) {
      setter.call(target, value)
    } else {
      target.value = value
    }
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }`], { raw: true })
}

async function clickFirstMatching(selector, text) {
  await runPlaywrightCli(['eval', `() => {
    const selector = ${JSON.stringify(selector)}
    const text = ${JSON.stringify(text)}
    const target = [...document.querySelectorAll(selector)].find((node) => (node.textContent ?? '').includes(text))
    if (!target) throw new Error(\`missing clickable text: \${text}\`)
    target.click()
    return true
  }`], { raw: true })
}

async function createBudgetItemWithPayCycle(payDay) {
  await clickText('button', ['Add Item', '新增項目', '項目を追加'])
  await delay(800)
  await clickSelector('[data-testid="budget-item-period-pay-cycle"]')
  await fillInput('[data-testid="budget-item-pay-day"]', String(payDay))
  const categoryName = await evalPage(`() => String(document.querySelector('.form-wrap .custom-select .text')?.textContent ?? '').trim()`)
  assert.ok(categoryName, 'budget item category should be preselected')
  await fillInput('.form-wrap input.input[type="number"]', '1200', 1)
  await clickText('.form-wrap button.btn.primary', ['Save', '儲存', '保存'])
  await delay(1800)
  return categoryName
}

async function waitForBodyText(pattern, label, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const body = await evalPage(`() => document.body?.innerText ?? ''`)
    if (pattern.test(body)) return body
    await delay(500)
  }
  const body = await evalPage(`() => document.body?.innerText ?? ''`)
  throw new Error(`${label} not reached\n${body.slice(0, 1200)}`)
}

async function waitForSelectorCount(selector, count, label, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await evalPage(`() => document.querySelectorAll(${JSON.stringify(selector)}).length`)
    if (current >= count) return
    await delay(250)
  }
  const body = await evalPage(`() => document.body?.innerText ?? ''`)
  throw new Error(`${label} not reached\n${body.slice(0, 1200)}`)
}

async function setupCleanOnboarding() {
  await waitForBodyText(/Step\s*1\s*\/\s*3|Welcome to StrawMoneyBook|歡迎|ようこそ/u, 'welcome step 1')
  await clickSelector('.welcome-root .wizard-actions button.btn.primary')
  await waitForBodyText(/Step\s*2\s*\/\s*3|Create Ledger|建立帳本|帳簿を作成/u, 'welcome step 2')
  await waitForSelectorCount('.welcome-root input.input', 1, 'ledger name input')
  await fillInput('.welcome-root input.input', `Pay Cycle Ledger ${Date.now()}`, 0)
  await clickSelector('.welcome-root button.create-btn')
  await waitForBodyText(/Step\s*3\s*\/\s*3|Create Account|建立帳戶|口座を作成/u, 'welcome step 3')
  await waitForSelectorCount('.welcome-root input.input', 2, 'account inputs')
  await fillInput('.welcome-root input.input', 'Cash', 0)
  await fillInput('.welcome-root input.input', 'Wallet', 1)
  await clickSelector('.welcome-root button.create-btn')
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      welcome: Boolean(document.querySelector('.welcome-root')),
      intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      shell: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      body: document.body?.innerText ?? '',
    })`)
    if (state.intro || state.shell || !state.welcome) break
    if (/建立帳戶失敗|Failed to create account|口座の作成に失敗/u.test(state.body)) {
      throw new Error(`account creation failed during onboarding\n${state.body.slice(0, 1200)}`)
    }
    await delay(500)
  }
  const intro = await evalPage(`() => window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root'))`)
  if (intro) {
    await clickText('button', ['Start now', '先開始使用', 'Skip', '今すぐ始める', '完成'])
    await delay(1200)
  }
  const finalState = await evalPage(`() => ({
    path: window.location.pathname,
    welcome: Boolean(document.querySelector('.welcome-root')),
    shell: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    body: document.body?.innerText ?? '',
  })`)
  if (finalState.welcome || !finalState.shell) {
    throw new Error(`onboarding did not finish\n${JSON.stringify(finalState, null, 2)}`)
  }
}

async function editBudgetItemBackToCalendar(categoryName) {
  await clickFirstMatching('.item-card-btn', categoryName)
  await delay(700)
  await clickText('button.btn.primary', ['Edit', '編輯', '編集'])
  await delay(800)
  await clickSelector('[data-testid="budget-item-period-calendar"]')
  await fillInput('.form-wrap input.input[type="number"]', '1300', 0)
  await clickText('.form-wrap button.btn.primary', ['Save', '儲存', '保存'])
  await delay(1800)
}

async function createContainerWithPayCycle(payDay) {
  await clickText('button', ['Add Shared Budget Pool', '新增共同預算池', '共同予算プールを追加'])
  await delay(800)
  await clickSelector('[data-testid="budget-container-period-pay-cycle"]')
  await fillInput('[data-testid="budget-container-pay-day"]', String(payDay))
  await fillInput('.form-wrap input.input[type="text"]', 'Pay Cycle Pool')
  await fillInput('.form-wrap input.input[type="number"]', '2500', 1)
  await clickText('.form-wrap button.btn.primary', ['Save', '儲存', '保存'])
  await delay(1800)
}

async function runBudgetPayCycleWorkflow() {
  await runPlaywrightCli(['delete-data'], { timeout: 120000 })
  await runPlaywrightCli(['open', baseUrl], { timeout: 120000 })
  const flow = await runPlaywrightCli([
    'run-code',
    '--filename',
    'scripts/playwright-budget-pay-cycle.spec.mjs',
  ], { timeout: 300000 })
  if (flow.stdout) process.stdout.write(flow.stdout)
  if (flow.stderr) process.stderr.write(flow.stderr)
  if (/### Error/u.test(String(flow.stdout ?? '')) || /### Error/u.test(String(flow.stderr ?? ''))) {
    throw new Error('playwright budget pay-cycle flow reported an error')
  }
}

console.log('--- Playwright: budget pay-cycle period UI ---')
console.log('Building web preview bundle...')
await runLogged('npm', ['run', 'build:web'], { timeout: 300000 })

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: frontendDir,
  stdio: 'ignore',
  env: process.env,
})

try {
  await waitForPreviewReady()
  console.log('Preview ready; resetting browser data...')
  await runPlaywrightCli(['delete-data'])
  console.log('Opening budgeting app shell...')
  await runPlaywrightCli(['open', `${baseUrl}/budget`])
  await delay(1500)
  const shellText = await snapshotText()
  assert.match(shellText, /StrawMoneyBook|Budget|預算|Welcome|歡迎|ようこそ/)

  console.log('Verifying pay-cycle budget source contract...')
  await assertSourceContract()
  console.log('Running budget item and pool pay-cycle workflow...')
  await runBudgetPayCycleWorkflow()
  console.log('Budget pay-cycle Playwright workflow passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
