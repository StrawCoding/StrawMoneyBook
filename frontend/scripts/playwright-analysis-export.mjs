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
const previewPort = Number(process.env.ANALYSIS_EXPORT_PLAYWRIGHT_PORT || 4182)
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

  throw new Error('onboarding failed: bottom-nav missing')
}

async function seedAnalysisTransactions() {
  return evalPage(`async () => {
    const app = document.querySelector('#app')?.__vue_app__
    if (!app) return { ok: false, reason: 'missing vue app' }

    let pinia = app.config?.globalProperties?.$pinia || null
    const provides = app._context?.provides || {}
    if (!pinia) {
      for (const key of Reflect.ownKeys(provides)) {
        const value = provides[key]
        if (value && typeof value === 'object' && value.state && value._s) {
          pinia = value
          break
        }
      }
    }
    if (!pinia) return { ok: false, reason: 'missing pinia' }

    const stores = [...pinia._s.values()]
    const ledgerStore = stores.find((store) => store.$id === 'ledger')
    const categoryStore = stores.find((store) => store.$id === 'category')
    const accountStore = stores.find((store) => store.$id === 'account')
    const transactionStore = stores.find((store) => store.$id === 'transaction')
    if (!ledgerStore || !categoryStore || !accountStore || !transactionStore) {
      return { ok: false, reason: 'missing stores', ids: stores.map((store) => store.$id) }
    }

    if (typeof categoryStore.load === 'function') await categoryStore.load()
    if (typeof accountStore.load === 'function') await accountStore.load()

    const ledgerId = ledgerStore.activeLedgerId
    const accountId = accountStore.accounts?.[0]?.id
    const expenseCategory = (categoryStore.categories || []).find((item) => item.kind === 'expense')
      || categoryStore.categories?.[0]
    const incomeCategory = (categoryStore.categories || []).find((item) => item.kind === 'income')
      || categoryStore.categories?.[0]
    if (!ledgerId || !accountId || !expenseCategory?.id) {
      return { ok: false, reason: 'missing ledger/account/category' }
    }

    const now = new Date()
    const monthKey = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`
    const day = String(Math.min(28, now.getDate())).padStart(2, '0')
    const occurredAt = \`\${monthKey}-\${day}T12:00:00.000Z\`

    await transactionStore.addExpense({
      accountId,
      categoryId: expenseCategory.id,
      amountMinor: 8800,
      occurredAt,
      note: 'Playwright analysis expense',
      tagsJson: JSON.stringify(['pw-expense']),
      includeInAnalysis: true,
      includeInBudget: true,
    })
    if (incomeCategory?.id) {
      await transactionStore.addIncome({
        accountId,
        categoryId: incomeCategory.id,
        amountMinor: 15000,
        occurredAt: \`\${monthKey}-\${day}T11:00:00.000Z\`,
        note: 'Playwright analysis income',
        tagsJson: JSON.stringify(['pw-income']),
        includeInAnalysis: true,
        includeInBudget: false,
      })
    }

    return {
      ok: true,
      monthKey,
      expenseIcon: String(expenseCategory.icon ?? ''),
      accountIcon: String(accountStore.accounts?.[0]?.icon ?? ''),
    }
  }`)
}

async function navigateToAnalysis() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-analysis"]'])
  await delay(1200)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasBigNumbers: Boolean(document.querySelector('[data-testid=analysis-big-numbers]')),
    })`)
    if (state.path === '/analysis' && state.hasBottomNav) return state
    if (state.path !== '/analysis') {
      await runPlaywrightCli(['eval', `() => { window.location.hash = ''; history.pushState({}, '', '/analysis'); window.dispatchEvent(new PopStateEvent('popstate')); return true }`], { raw: true })
    }
    await delay(400)
  }
  throw new Error('failed to reach /analysis with bottom-nav')
}

async function assertAnalysisIconsVisible() {
  const state = await evalPage(`() => {
    const icons = [...document.querySelectorAll('[data-testid=analysis-income-charts] svg, [data-testid=analysis-expense-charts] svg, [data-testid=analysis-income-charts] .swatch-icon, [data-testid=analysis-expense-charts] .swatch-icon, .icon-swatch svg')]
    const pieLegend = document.querySelector('[data-testid=analysis-pie-legend], [data-testid=analysis-expense-charts] .pie-legend, [data-testid=analysis-income-charts] .pie-legend')
    const barList = document.querySelector('[data-testid=analysis-bar-list], [data-testid=analysis-expense-charts] .bar-chart-list, [data-testid=analysis-income-charts] .bar-chart-list')
    return {
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasBigNumbers: Boolean(document.querySelector('[data-testid=analysis-big-numbers]')),
      iconCount: icons.length,
      hasPieLegend: Boolean(pieLegend),
      hasBarList: Boolean(barList),
      hasIncomeOrExpense: Boolean(document.querySelector('[data-testid=analysis-income-section], [data-testid=analysis-expense-section]')),
    }
  }`)
  assert.equal(state.path, '/analysis', JSON.stringify(state))
  assert.equal(state.hasBottomNav, true, JSON.stringify(state))
  assert.equal(state.hasBigNumbers, true, JSON.stringify(state))
  assert.equal(state.hasIncomeOrExpense, true, JSON.stringify(state))
  assert.ok(state.iconCount > 0 || state.hasPieLegend || state.hasBarList, JSON.stringify(state))
  return state
}

async function openPrintPreview() {
  await runPlaywrightCli(['click', '[data-testid=analysis-print-link]'])
  await delay(1500)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasPreview: Boolean(document.querySelector('[data-testid=analysis-report-document]')),
      hasPdfBtn: Boolean(document.querySelector('[data-testid=analysis-export-pdf-btn]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    if (state.path.startsWith('/analysis/print') && state.hasPreview && state.hasPdfBtn) return state
    await delay(400)
  }
  throw new Error('failed to open /analysis/print preview')
}

async function assertPrintPreviewCoverage() {
  const state = await evalPage(`() => {
    const root = document.querySelector('[data-testid=analysis-report-document]')
    const icons = [...(root?.querySelectorAll('svg, .swatch-icon') ?? [])]
    return {
      path: window.location.pathname,
      hasHeader: Boolean(document.querySelector('[data-testid=analysis-report-header]')),
      hasBigNumbers: Boolean(document.querySelector('[data-testid=analysis-report-big-numbers]')),
      hasIncomeCharts: Boolean(document.querySelector('[data-testid=analysis-report-income-charts]')),
      hasExpenseCharts: Boolean(document.querySelector('[data-testid=analysis-report-expense-charts]')),
      hasAccountCharts: Boolean(document.querySelector('[data-testid=analysis-report-account-charts]')),
      hasBudgetCards: Boolean(document.querySelector('[data-testid=analysis-report-budget-cards]')),
      hasDetailTable: Boolean(document.querySelector('[data-testid=analysis-report-detail-table]')),
      detailHeaders: [...(document.querySelectorAll('[data-testid=analysis-report-detail-table] th') ?? [])].map((node) => node.textContent?.trim() ?? ''),
      iconCount: icons.length,
      lightBg: getComputedStyle(root).backgroundColor,
    }
  }`)
  assert.ok(state.path.startsWith('/analysis/print'), JSON.stringify(state))
  assert.equal(state.hasHeader, true, JSON.stringify(state))
  assert.equal(state.hasBigNumbers, true, JSON.stringify(state))
  assert.ok(state.hasIncomeCharts || state.hasExpenseCharts, JSON.stringify(state))
  assert.equal(state.hasAccountCharts, true, JSON.stringify(state))
  assert.equal(state.hasDetailTable, true, JSON.stringify(state))
  assert.ok(state.iconCount > 0, JSON.stringify(state))
  assert.ok(state.detailHeaders.length >= 7, JSON.stringify(state))
  return state
}

async function downloadPdfAndAssert() {
  await runPlaywrightCli(['eval', `() => {
    window.__playwrightErrors = window.__playwrightErrors || []
    window.addEventListener('error', (event) => {
      window.__playwrightErrors.push(String(event?.error?.message ?? event?.message ?? 'unknown error'))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__playwrightErrors.push(String(event?.reason?.message ?? event?.reason ?? 'unknown rejection'))
    })
    return true
  }`], { raw: true })

  const clickState = await evalPage(`() => {
    const button = document.querySelector('[data-testid="analysis-export-pdf-btn"]')
    if (!button) return { ok: false, reason: 'missing button' }
    button.scrollIntoView({ block: 'center', inline: 'nearest' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return {
      ok: true,
      disabled: Boolean(button.disabled),
      text: button.textContent?.trim() || '',
    }
  }`)
  assert.equal(clickState.ok, true, JSON.stringify(clickState))

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => {
      const result = document.querySelector('[data-testid="analysis-export-result"]')
      const button = document.querySelector('[data-testid="analysis-export-pdf-btn"]')
      const toasts = [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')]
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean)
      return {
        filename: result?.getAttribute('data-filename') || '',
        pageCount: Number(result?.getAttribute('data-page-count') || 0),
        previewIconCount: document.querySelectorAll('[data-testid="analysis-report-document"] svg, [data-testid="analysis-report-document"] .swatch-icon').length,
        buttonDisabled: Boolean(button?.disabled),
        buttonText: button?.textContent?.trim() || '',
        exportError: document.querySelector('[data-testid="analysis-export-error"]')?.textContent?.trim() || '',
        toasts,
        errors: window.__playwrightErrors ?? [],
      }
    }`)
    if (state.exportError) {
      throw new Error(`PDF export error panel: ${JSON.stringify(state)}`)
    }
    if (state.filename) {
      assert.match(state.filename, /^交易報表_\d{4}-\d{2}\.pdf$/)
      assert.ok(state.pageCount >= 1, JSON.stringify(state))
      assert.ok(state.previewIconCount > 0, JSON.stringify(state))
      return state
    }
    if (state.toasts.some((text) => /失敗|failed|missing|找不到/i.test(text))) {
      throw new Error(`PDF export failed via toast: ${JSON.stringify(state)}`)
    }
    if (state.errors.length) {
      throw new Error(`PDF export runtime errors: ${JSON.stringify(state)}`)
    }
    await delay(1000)
  }
  const finalState = await evalPage(`() => ({
    filename: document.querySelector('[data-testid="analysis-export-result"]')?.getAttribute('data-filename') || '',
    buttonText: document.querySelector('[data-testid="analysis-export-pdf-btn"]')?.textContent?.trim() || '',
    toasts: [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    errors: window.__playwrightErrors ?? [],
    bodyText: document.body?.innerText?.slice(0, 2000) || '',
  })`)
  throw new Error(`PDF export did not produce filename result: ${JSON.stringify(finalState)}`)
}

console.log('--- Playwright: analysis export chart redesign ---')

if (process.env.ANALYSIS_EXPORT_SKIP_BUILD === '1') {
  console.log('Skipping web build (ANALYSIS_EXPORT_SKIP_BUILD=1)')
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
  await runPlaywrightCli(['open', baseUrl])
  await delay(1500)
  await completeOnboarding()

  const seed = await seedAnalysisTransactions()
  assert.equal(seed.ok, true, JSON.stringify(seed))

  await navigateToAnalysis()
  await assertAnalysisIconsVisible()

  await openPrintPreview()
  await assertPrintPreviewCoverage()
  const pdf = await downloadPdfAndAssert()

  console.log(JSON.stringify({
    ok: true,
    seed,
    pdf,
  }, null, 2))
} finally {
  preview.kill('SIGTERM')
}
