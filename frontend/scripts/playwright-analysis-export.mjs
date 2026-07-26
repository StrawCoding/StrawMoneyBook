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

async function forceDarkTheme() {
  return evalPage(`() => {
    const preference = {
      schemeId: 'charcoal',
      primaryOverride: null,
      fontScale: 1,
    }
    try {
      localStorage.setItem('strawmoneybook.theme.preference', JSON.stringify(preference))
    } catch {
      // ignore
    }

    const root = document.documentElement
    root.dataset.themeMode = 'dark'
    root.style.colorScheme = 'dark'
    root.style.setProperty('--bg', '#0d0d10')
    root.style.setProperty('--bg-soft', '#131318')
    root.style.setProperty('--card', '#1c1c22')
    root.style.setProperty('--text', '#f0f0f5')
    root.style.setProperty('--muted', '#9999b4')
    root.style.setProperty('--border', 'rgba(255, 255, 255, 0.10)')
    root.style.setProperty('--field-border', 'rgba(255, 255, 255, 0.16)')
    root.style.setProperty('--btn-bg', '#26262f')
    root.style.setProperty('--input-bg', '#16161d')
    root.style.setProperty('--chart-track', '#2a2a33')
    document.body?.style?.setProperty('background', '#0d0d10')
    document.body?.style?.setProperty('color', '#f0f0f5')

    return {
      themeMode: root.dataset.themeMode || '',
      colorScheme: root.style.colorScheme || '',
      bg: getComputedStyle(root).getPropertyValue('--bg').trim(),
      text: getComputedStyle(root).getPropertyValue('--text').trim(),
    }
  }`)
}

function parseRgbChannels(color) {
  const match = String(color ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) return null
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  }
}

function relativeLuminance(channels) {
  if (!channels) return null
  const toLinear = (channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return (0.2126 * toLinear(channels.r)) + (0.7152 * toLinear(channels.g)) + (0.0722 * toLinear(channels.b))
}

async function assertExportChromeDarkTheme() {
  const state = await evalPage(`() => {
    const page = document.querySelector('[data-testid=analysis-export-page]')
    const controls = document.querySelector('[data-testid=analysis-export-controls]')
    const previewChrome = document.querySelector('[data-testid=analysis-export-preview-chrome]')
    const frame = document.querySelector('[data-testid=analysis-export-report-frame]')
    const heading = controls?.querySelector('h2')
    const chip = previewChrome?.querySelector('.count-chip')
    const pdfBtn = document.querySelector('[data-testid=analysis-export-pdf-btn]')
    const report = document.querySelector('[data-testid=analysis-report-document]')
    return {
      path: window.location.pathname,
      themeMode: document.documentElement.dataset.themeMode || '',
      appBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      pageBg: page ? getComputedStyle(page).backgroundColor : '',
      controlsBg: controls ? getComputedStyle(controls).backgroundColor : '',
      controlsColor: controls ? getComputedStyle(controls).color : '',
      headingColor: heading ? getComputedStyle(heading).color : '',
      previewChromeBg: previewChrome ? getComputedStyle(previewChrome).backgroundColor : '',
      previewChromeColor: previewChrome ? getComputedStyle(previewChrome).color : '',
      frameBg: frame ? getComputedStyle(frame).backgroundColor : '',
      chipColor: chip ? getComputedStyle(chip).color : '',
      btnBg: pdfBtn ? getComputedStyle(pdfBtn).backgroundColor : '',
      btnColor: pdfBtn ? getComputedStyle(pdfBtn).color : '',
      reportBg: report ? getComputedStyle(report).backgroundColor : '',
      reportColor: report ? getComputedStyle(report).color : '',
      exportColorScheme: report?.getAttribute('data-export-color-scheme') || '',
    }
  }`)

  assert.ok(state.path.startsWith('/analysis/print'), JSON.stringify(state))
  assert.equal(state.themeMode, 'dark', JSON.stringify(state))
  assert.equal(state.exportColorScheme, 'light', JSON.stringify(state))

  const controlsBgLum = relativeLuminance(parseRgbChannels(state.controlsBg))
  const previewBgLum = relativeLuminance(parseRgbChannels(state.previewChromeBg))
  const headingLum = relativeLuminance(parseRgbChannels(state.headingColor))
  const chromeTextLum = relativeLuminance(parseRgbChannels(state.controlsColor))
  const reportBgLum = relativeLuminance(parseRgbChannels(state.reportBg))
  const reportTextLum = relativeLuminance(parseRgbChannels(state.reportColor))

  assert.ok(controlsBgLum != null && controlsBgLum <= 0.45, `export chrome controls must be dark: ${JSON.stringify(state)} lum=${controlsBgLum}`)
  assert.ok(previewBgLum != null && previewBgLum <= 0.45, `preview chrome must be dark: ${JSON.stringify(state)} lum=${previewBgLum}`)
  assert.ok(headingLum != null && headingLum >= 0.55, `chrome heading must be light-on-dark: ${JSON.stringify(state)} lum=${headingLum}`)
  assert.ok(chromeTextLum != null && chromeTextLum >= 0.55, `chrome text must be light-on-dark: ${JSON.stringify(state)} lum=${chromeTextLum}`)
  assert.ok(reportBgLum != null && reportBgLum >= 0.72, `report body must stay light: ${JSON.stringify(state)} lum=${reportBgLum}`)
  assert.ok(reportTextLum != null && reportTextLum <= 0.45, `report body text must stay dark: ${JSON.stringify(state)} lum=${reportTextLum}`)
  return state
}

async function assertPrintPreviewLightTheme() {
  const state = await evalPage(`() => {
    const root = document.querySelector('[data-testid=analysis-report-document]')
    const heading = root?.querySelector('h2')
    const track = root?.querySelector('.bar-chart-track, .budget-track')
    const appBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    return {
      path: window.location.pathname,
      themeMode: document.documentElement.dataset.themeMode || '',
      appBg,
      exportColorScheme: root?.getAttribute('data-export-color-scheme') || '',
      reportBg: root ? getComputedStyle(root).backgroundColor : '',
      reportColor: root ? getComputedStyle(root).color : '',
      headingColor: heading ? getComputedStyle(heading).color : '',
      trackBg: track ? getComputedStyle(track).backgroundColor : '',
      hasLightScope: Boolean(root?.classList?.contains('analysis-report-light-scope')),
    }
  }`)

  assert.ok(state.path.startsWith('/analysis/print'), JSON.stringify(state))
  assert.equal(state.themeMode, 'dark', `app must stay dark while export is light: ${JSON.stringify(state)}`)
  assert.equal(state.exportColorScheme, 'light', JSON.stringify(state))
  assert.equal(state.hasLightScope, true, JSON.stringify(state))

  const reportBgLum = relativeLuminance(parseRgbChannels(state.reportBg))
  const reportTextLum = relativeLuminance(parseRgbChannels(state.reportColor))
  const headingLum = relativeLuminance(parseRgbChannels(state.headingColor))
  assert.ok(reportBgLum != null && reportBgLum >= 0.72, `report bg must be light: ${JSON.stringify(state)} lum=${reportBgLum}`)
  assert.ok(reportTextLum != null && reportTextLum <= 0.45, `report text must be dark: ${JSON.stringify(state)} lum=${reportTextLum}`)
  assert.ok(headingLum != null && headingLum <= 0.45, `heading text must be dark: ${JSON.stringify(state)} lum=${headingLum}`)
  if (state.trackBg) {
    const trackLum = relativeLuminance(parseRgbChannels(state.trackBg))
    assert.ok(trackLum != null && trackLum >= 0.55, `chart track must stay light: ${JSON.stringify(state)} lum=${trackLum}`)
  }
  return state
}

async function assertPdfLayoutIntegrity() {
  const state = await evalPage(`() => {
    const root = document.querySelector('[data-testid=analysis-report-document]')
    if (!root) return { ok: false, reason: 'missing report' }

    const previous = {
      width: root.style.width,
      maxWidth: root.style.maxWidth,
      minWidth: root.style.minWidth,
      printLayout: root.getAttribute('data-print-layout'),
    }
    root.style.boxSizing = 'border-box'
    root.style.width = '794px'
    root.style.maxWidth = '794px'
    root.style.minWidth = '794px'
    root.setAttribute('data-print-layout', 'a4')

    const pair = root.querySelector('.pair-layout')
    const big = root.querySelector('.big-numbers')
    const table = root.querySelector('.report-table')
    const pairStyle = pair ? getComputedStyle(pair) : null
    const bigStyle = big ? getComputedStyle(big) : null
    const rect = root.getBoundingClientRect()

    const result = {
      ok: true,
      printLayout: root.getAttribute('data-print-layout') || '',
      width: Math.round(rect.width),
      pairColumns: pairStyle?.gridTemplateColumns || '',
      bigColumns: bigStyle?.gridTemplateColumns || '',
      hasDetailTable: Boolean(table),
      tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasIncomeCharts: Boolean(document.querySelector('[data-testid=analysis-report-income-charts]')),
      hasExpenseCharts: Boolean(document.querySelector('[data-testid=analysis-report-expense-charts]')),
      hasAccountCharts: Boolean(document.querySelector('[data-testid=analysis-report-account-charts]')),
      hasBigNumbers: Boolean(document.querySelector('[data-testid=analysis-report-big-numbers]')),
    }

    root.style.width = previous.width
    root.style.maxWidth = previous.maxWidth
    root.style.minWidth = previous.minWidth
    if (previous.printLayout == null) root.removeAttribute('data-print-layout')
    else root.setAttribute('data-print-layout', previous.printLayout)

    return result
  }`)

  assert.equal(state.ok, true, JSON.stringify(state))
  assert.equal(state.printLayout, 'a4', JSON.stringify(state))
  assert.ok(state.width >= 780 && state.width <= 810, `A4 capture width expected ~794: ${JSON.stringify(state)}`)
  assert.ok(state.hasBigNumbers, JSON.stringify(state))
  assert.ok(state.hasIncomeCharts || state.hasExpenseCharts, JSON.stringify(state))
  assert.equal(state.hasAccountCharts, true, JSON.stringify(state))
  assert.equal(state.hasDetailTable, true, JSON.stringify(state))
  // Desktop A4 layout must keep multi-column grids (not stacked 1fr-only mobile).
  assert.ok((state.pairColumns.match(/px|fr/g) || []).length >= 2, `pair layout must stay multi-column: ${JSON.stringify(state)}`)
  assert.ok((state.bigColumns.match(/px|fr/g) || []).length >= 3, `big numbers must stay 3 columns: ${JSON.stringify(state)}`)
  assert.ok(state.tableWidth > 500, `detail table must have usable width: ${JSON.stringify(state)}`)
  assert.ok(state.scrollWidth <= state.clientWidth + 2, `report must not horizontally overflow under A4 width: ${JSON.stringify(state)}`)
  return state
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
      lightBg: root ? getComputedStyle(root).backgroundColor : '',
      exportColorScheme: root?.getAttribute('data-export-color-scheme') || '',
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
  assert.equal(state.exportColorScheme, 'light', JSON.stringify(state))
  const bgLum = relativeLuminance(parseRgbChannels(state.lightBg))
  assert.ok(bgLum != null && bgLum >= 0.72, `preview must stay light: ${JSON.stringify(state)} lum=${bgLum}`)
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

console.log('--- Playwright: analysis export dark-mode light report ---')

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

  const darkTheme = await forceDarkTheme()
  assert.equal(darkTheme.themeMode, 'dark', JSON.stringify(darkTheme))

  const seed = await seedAnalysisTransactions()
  assert.equal(seed.ok, true, JSON.stringify(seed))

  await navigateToAnalysis()
  await assertAnalysisIconsVisible()

  await openPrintPreview()
  await assertPrintPreviewCoverage()
  const chromeDark = await assertExportChromeDarkTheme()
  const lightPreview = await assertPrintPreviewLightTheme()
  const layout = await assertPdfLayoutIntegrity()
  const pdf = await downloadPdfAndAssert()

  console.log(JSON.stringify({
    ok: true,
    darkTheme,
    chromeDark,
    lightPreview,
    layout,
    seed,
    pdf,
  }, null, 2))
} finally {
  preview.kill('SIGTERM')
}
