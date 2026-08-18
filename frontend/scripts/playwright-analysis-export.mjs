import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(fileURLToPath(new URL('../playwright-cli.json', import.meta.url)))
const previewPort = Number(process.env.ANALYSIS_EXPORT_PLAYWRIGHT_PORT || 4182)
const baseUrl = `http://127.0.0.1:${previewPort}`
const playwrightCliDir = resolve(frontendDir, '.playwright-cli')

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
    if (state.hasBottomNav) {
      const ready = await evalPage(`async () => {
        const app = document.querySelector('#app')?.__vue_app__
        const pinia = app?.config?.globalProperties?.$pinia
        if (!pinia) return { ok: false }
        const stores = [...pinia._s.values()]
        const ledgerStore = stores.find((store) => store.$id === 'ledger')
        const accountStore = stores.find((store) => store.$id === 'account')
        const categoryStore = stores.find((store) => store.$id === 'category')
        if (typeof ledgerStore?.load === 'function') await ledgerStore.load()
        if (typeof accountStore?.load === 'function') await accountStore.load()
        if (typeof categoryStore?.load === 'function') await categoryStore.load()
        return {
          ok: Boolean(ledgerStore?.activeLedgerId && accountStore?.accounts?.length && categoryStore?.categories?.length),
        }
      }`)
      if (ready.ok) return { ok: true, skipped: true }
    }
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
    if (state.hasBottomNav) {
      // Ensure ledger bootstrap finished before seed.
      const ready = await evalPage(`async () => {
        const app = document.querySelector('#app')?.__vue_app__
        const pinia = app?.config?.globalProperties?.$pinia
        if (!pinia) return { ok: false }
        const stores = [...pinia._s.values()]
        const ledgerStore = stores.find((store) => store.$id === 'ledger')
        const accountStore = stores.find((store) => store.$id === 'account')
        const categoryStore = stores.find((store) => store.$id === 'category')
        if (typeof ledgerStore?.load === 'function') await ledgerStore.load()
        if (typeof accountStore?.load === 'function') await accountStore.load()
        if (typeof categoryStore?.load === 'function') await categoryStore.load()
        return {
          ok: Boolean(ledgerStore?.activeLedgerId && accountStore?.accounts?.length && categoryStore?.categories?.length),
          ledgerId: ledgerStore?.activeLedgerId || null,
          accounts: accountStore?.accounts?.length || 0,
          categories: categoryStore?.categories?.length || 0,
        }
      }`)
      if (ready.ok) return { ok: true, skipped: false, ...ready }
    }
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evalPage(`async () => {
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

      if (typeof ledgerStore.load === 'function') await ledgerStore.load()
      if (typeof categoryStore.load === 'function') await categoryStore.load()
      if (typeof accountStore.load === 'function') await accountStore.load()

      const ledgerId = ledgerStore.activeLedgerId
      const accountId = accountStore.accounts?.[0]?.id
      const expenseCategory = (categoryStore.categories || []).find((item) => item.kind === 'expense')
        || categoryStore.categories?.[0]
      const incomeCategory = (categoryStore.categories || []).find((item) => item.kind === 'income')
        || categoryStore.categories?.[0]
      if (!ledgerId || !accountId || !expenseCategory?.id) {
        return {
          ok: false,
          reason: 'missing ledger/account/category',
          ledgerId: ledgerId || null,
          accountCount: accountStore.accounts?.length || 0,
          categoryCount: categoryStore.categories?.length || 0,
        }
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
    if (state.ok) return state
    if (state.reason !== 'missing ledger/account/category' && state.reason !== 'missing stores' && state.reason !== 'missing vue app' && state.reason !== 'missing pinia') {
      return state
    }
    await delay(500)
  }
  return { ok: false, reason: 'missing ledger/account/category after retries' }
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
      hasDirectExport: Boolean(document.querySelector('[data-testid=analysis-export-direct-btn]')),
      hasPrintLink: Boolean(document.querySelector('[data-testid=analysis-print-link]')),
    }
  }`)
  assert.equal(state.path, '/analysis', JSON.stringify(state))
  assert.equal(state.hasBottomNav, true, JSON.stringify(state))
  assert.equal(state.hasBigNumbers, true, JSON.stringify(state))
  assert.equal(state.hasIncomeOrExpense, true, JSON.stringify(state))
  assert.equal(state.hasDirectExport, true, `main export must be direct button: ${JSON.stringify(state)}`)
  assert.equal(state.hasPrintLink, true, `report page entry must remain reachable: ${JSON.stringify(state)}`)
  assert.ok(state.iconCount > 0 || state.hasPieLegend || state.hasBarList, JSON.stringify(state))
  return state
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

async function assertAnalysisPageDarkTheme() {
  const state = await evalPage(`() => {
    const page = document.querySelector('[data-testid=analysis-page]')
    const panel = document.querySelector('[data-testid=analysis-page] .card.panel, [data-testid=analysis-big-numbers]')
    const heading = document.querySelector('[data-testid=analysis-page] h2')
    const piePanel = document.querySelector('[data-testid=analysis-income-charts] .pie-panel, [data-testid=analysis-expense-charts] .pie-panel')
    const pieHole = document.querySelector('[data-testid=analysis-income-charts] .pie-hole, [data-testid=analysis-expense-charts] .pie-hole')
    const track = document.querySelector('[data-testid=analysis-income-charts] .bar-chart-track, [data-testid=analysis-expense-charts] .bar-chart-track, .budget-track, .time-bar-track')
    const muted = document.querySelector('[data-testid=analysis-income-charts] .muted, [data-testid=analysis-expense-charts] .muted, [data-testid=analysis-page] .count-chip')
    return {
      path: window.location.pathname,
      themeMode: document.documentElement.dataset.themeMode || '',
      appBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      card: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(),
      text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
      pageBg: page ? getComputedStyle(page).backgroundColor : '',
      panelBg: panel ? getComputedStyle(panel).backgroundColor : '',
      headingColor: heading ? getComputedStyle(heading).color : '',
      piePanelBg: piePanel ? getComputedStyle(piePanel).backgroundColor : '',
      pieHoleBg: pieHole ? getComputedStyle(pieHole).backgroundColor : '',
      trackBg: track ? getComputedStyle(track).backgroundColor : '',
      mutedColor: muted ? getComputedStyle(muted).color : '',
    }
  }`)

  assert.equal(state.path, '/analysis', JSON.stringify(state))
  assert.equal(state.themeMode, 'dark', JSON.stringify(state))

  const panelLum = relativeLuminance(parseRgbChannels(state.panelBg))
  const headingLum = relativeLuminance(parseRgbChannels(state.headingColor))
  const piePanelLum = relativeLuminance(parseRgbChannels(state.piePanelBg))
  const pieHoleLum = relativeLuminance(parseRgbChannels(state.pieHoleBg))
  const mutedLum = relativeLuminance(parseRgbChannels(state.mutedColor))

  assert.ok(panelLum != null && panelLum <= 0.45, `analysis panel must be dark: ${JSON.stringify(state)} lum=${panelLum}`)
  assert.ok(headingLum != null && headingLum >= 0.55, `analysis heading must be light-on-dark: ${JSON.stringify(state)} lum=${headingLum}`)
  if (piePanelLum != null) {
    assert.ok(piePanelLum <= 0.55, `chart panel must follow dark theme: ${JSON.stringify(state)} lum=${piePanelLum}`)
  }
  if (pieHoleLum != null) {
    assert.ok(pieHoleLum <= 0.55, `pie hole must not stay hard-coded white: ${JSON.stringify(state)} lum=${pieHoleLum}`)
  }
  if (mutedLum != null) {
    assert.ok(mutedLum >= 0.25, `muted text must remain readable on dark: ${JSON.stringify(state)} lum=${mutedLum}`)
  }
  return state
}

async function openReportPageFromAnalysis() {
  const hasLink = await evalPage(`() => Boolean(document.querySelector('[data-testid="analysis-print-link"]'))`)
  assert.equal(hasLink, true, 'analysis-print-link must exist on /analysis')
  try {
    await runPlaywrightCli(['click', '[data-testid="analysis-print-link"]'])
  } catch {
    await evalPage(`() => {
      const app = document.querySelector('#app')?.__vue_app__
      const router = app?.config?.globalProperties?.$router
      const link = document.querySelector('[data-testid="analysis-print-link"]')
      const href = link?.getAttribute('href') || '/analysis/print'
      if (router?.push) {
        router.push(href)
        return { via: 'router', href }
      }
      window.history.pushState({}, '', href)
      window.dispatchEvent(new PopStateEvent('popstate'))
      return { via: 'history', href }
    }`)
  }
  await delay(1500)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evalPage(`() => ({
      path: window.location.pathname,
      hasPreview: Boolean(document.querySelector('[data-testid=analysis-report-document]')),
      hasPdfBtn: Boolean(document.querySelector('[data-testid=analysis-export-pdf-btn]')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasModeTabs: Boolean(document.querySelector('[data-testid=analysis-export-mode-tabs]')),
      hasBackToAnalysis: Boolean(document.querySelector('a.back-btn[href="/analysis"], a.back-btn[href*="/analysis"]')),
      hasOpenFileBtn: Boolean(document.querySelector('[data-testid=analysis-export-open-file-btn]')),
    })`)
    if (state.path.startsWith('/analysis/print') && state.hasPreview && state.hasPdfBtn && state.hasModeTabs) {
      return state
    }
    await delay(400)
  }
  throw new Error('failed to open /analysis/print from analysis entry')
}

async function customizeReportRangeAndAssert() {
  const before = await evalPage(`() => ({
    path: window.location.pathname,
    period: document.querySelector('[data-testid=analysis-report-document] [data-testid=analysis-report-header]')?.textContent?.trim() || '',
    modeMonth: Boolean(document.querySelector('[data-testid=analysis-export-mode-month].primary')),
  })`)
  assert.ok(before.path.startsWith('/analysis/print'), JSON.stringify(before))

  await evalPage(`() => {
    const customBtn = document.querySelector('[data-testid="analysis-export-mode-custom"]')
    if (!customBtn) throw new Error('missing custom mode button')
    customBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }`)
  await delay(1200)

  const customState = await evalPage(`() => ({
    path: window.location.pathname,
    modeCustom: Boolean(document.querySelector('[data-testid=analysis-export-mode-custom].primary')),
    hasCustomPickers: Boolean(document.querySelector('.custom-grid')),
    period: document.querySelector('[data-testid=analysis-report-header]')?.textContent?.trim() || '',
    hasOpenFileBtn: Boolean(document.querySelector('[data-testid=analysis-export-open-file-btn]')),
  })`)
  assert.equal(customState.modeCustom, true, JSON.stringify(customState))
  assert.equal(customState.hasCustomPickers, true, JSON.stringify(customState))
  assert.equal(customState.hasOpenFileBtn, false, `open file must not show before successful export: ${JSON.stringify(customState)}`)

  await evalPage(`() => {
    const yearBtn = document.querySelector('[data-testid="analysis-export-mode-year"]')
    if (!yearBtn) throw new Error('missing year mode button')
    yearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }`)
  await delay(1200)

  const yearState = await evalPage(`() => ({
    modeYear: Boolean(document.querySelector('[data-testid=analysis-export-mode-year].primary')),
    period: document.querySelector('[data-testid=analysis-report-header]')?.textContent?.trim() || '',
    hasPreview: Boolean(document.querySelector('[data-testid=analysis-report-document]')),
  })`)
  assert.equal(yearState.modeYear, true, JSON.stringify(yearState))
  assert.equal(yearState.hasPreview, true, JSON.stringify(yearState))
  assert.ok(yearState.period.length > 0, JSON.stringify(yearState))

  await evalPage(`() => {
    const monthBtn = document.querySelector('[data-testid="analysis-export-mode-month"]')
    if (!monthBtn) throw new Error('missing month mode button')
    monthBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }`)
  await delay(1200)

  return { before, customState, yearState }
}

async function exportPdfFromReportPageAndAssertOpenFile() {
  await runPlaywrightCli(['eval', `() => {
    window.__playwrightOpenCalls = []
    window.__playwrightAnchorOpens = []
    const originalOpen = window.open.bind(window)
    window.open = (...args) => {
      window.__playwrightOpenCalls.push(String(args[0] ?? ''))
      try { return originalOpen(...args) } catch { return null }
    }
    const originalCreate = document.createElement.bind(document)
    document.createElement = (tagName, options) => {
      const el = originalCreate(tagName, options)
      if (String(tagName).toLowerCase() === 'a') {
        const originalClick = el.click.bind(el)
        el.click = (...clickArgs) => {
          window.__playwrightAnchorOpens.push(String(el.href || ''))
          return originalClick(...clickArgs)
        }
      }
      return el
    }
    return true
  }`], { raw: true })

  const clickState = await evalPage(`() => {
    const button = document.querySelector('[data-testid="analysis-export-pdf-btn"]')
    if (!button) return { ok: false, reason: 'missing pdf btn' }
    button.scrollIntoView({ block: 'center', inline: 'nearest' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return { ok: true, path: window.location.pathname }
  }`)
  assert.equal(clickState.ok, true, JSON.stringify(clickState))
  assert.ok(clickState.path.startsWith('/analysis/print'), JSON.stringify(clickState))

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => {
      const result = document.querySelector('[data-testid="analysis-export-result"]')
      const openBtn = document.querySelector('[data-testid="analysis-export-open-file-btn"]')
      return {
        path: window.location.pathname,
        filename: result?.getAttribute('data-filename') || '',
        pageCount: Number(result?.getAttribute('data-page-count') || 0),
        hasOpenFileBtn: Boolean(openBtn),
        openBtnText: openBtn?.textContent?.trim() || '',
        exportError: document.querySelector('[data-testid="analysis-export-error"]')?.textContent?.trim() || '',
        buttonDisabled: Boolean(document.querySelector('[data-testid="analysis-export-pdf-btn"]')?.disabled),
      }
    }`)
    if (state.exportError) {
      throw new Error(`report page PDF export error: ${JSON.stringify(state)}`)
    }
    if (state.filename && state.hasOpenFileBtn) {
      assert.match(state.filename, /^交易報表_\d{4}-\d{2}\.pdf$/)
      assert.ok(state.pageCount >= 1, JSON.stringify(state))
      assert.match(state.openBtnText, /開啟檔案|Open File|ファイルを開く/)

      const openClick = await evalPage(`() => {
        const openBtn = document.querySelector('[data-testid="analysis-export-open-file-btn"]')
        if (!openBtn) return { ok: false, reason: 'missing open btn' }
        openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        return {
          ok: true,
          openCalls: window.__playwrightOpenCalls ?? [],
          anchorOpens: window.__playwrightAnchorOpens ?? [],
        }
      }`)
      assert.equal(openClick.ok, true, JSON.stringify(openClick))
      assert.ok(
        (openClick.openCalls || []).length > 0 || (openClick.anchorOpens || []).length > 0,
        `open file must trigger open/download: ${JSON.stringify(openClick)}`,
      )
      return { ...state, openClick }
    }
    await delay(1000)
  }
  throw new Error('report page PDF export did not show open-file button')
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

async function assertExportChromeDarkTheme() {
  const state = await evalPage(`() => {
    const page = document.querySelector('[data-testid=analysis-export-page]')
    const controls = document.querySelector('[data-testid=analysis-export-controls]')
    const captureHost = document.querySelector('[data-testid=analysis-export-capture-host]')
    const heading = controls?.querySelector('h2')
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
      hasCaptureHost: Boolean(captureHost),
      hasPreviewChrome: Boolean(document.querySelector('[data-testid=analysis-export-preview-chrome]')),
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
  assert.equal(state.hasCaptureHost, true, JSON.stringify(state))
  assert.equal(state.hasPreviewChrome, false, JSON.stringify(state))

  const controlsBgLum = relativeLuminance(parseRgbChannels(state.controlsBg))
  const headingLum = relativeLuminance(parseRgbChannels(state.headingColor))
  const chromeTextLum = relativeLuminance(parseRgbChannels(state.controlsColor))
  const reportBgLum = relativeLuminance(parseRgbChannels(state.reportBg))
  const reportTextLum = relativeLuminance(parseRgbChannels(state.reportColor))

  assert.ok(controlsBgLum != null && controlsBgLum <= 0.45, `export chrome controls must be dark: ${JSON.stringify(state)} lum=${controlsBgLum}`)
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

async function exportPdfDirectAndAssert() {
  await runPlaywrightCli(['eval', `() => {
    window.__playwrightErrors = window.__playwrightErrors || []
    window.__playwrightPaths = window.__playwrightPaths || []
    window.addEventListener('error', (event) => {
      window.__playwrightErrors.push(String(event?.error?.message ?? event?.message ?? 'unknown error'))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__playwrightErrors.push(String(event?.reason?.message ?? event?.reason ?? 'unknown rejection'))
    })
    const pushPath = () => {
      window.__playwrightPaths.push(window.location.pathname)
    }
    pushPath()
    window.addEventListener('popstate', pushPath)
    const _pushState = history.pushState.bind(history)
    history.pushState = (...args) => {
      const result = _pushState(...args)
      pushPath()
      return result
    }
    return true
  }`], { raw: true })

  const clickState = await evalPage(`() => {
    const button = document.querySelector('[data-testid="analysis-export-direct-btn"]')
    if (!button) return { ok: false, reason: 'missing direct export button' }
    button.scrollIntoView({ block: 'center', inline: 'nearest' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return {
      ok: true,
      disabled: Boolean(button.disabled),
      path: window.location.pathname,
    }
  }`)
  assert.equal(clickState.ok, true, JSON.stringify(clickState))
  assert.equal(clickState.path, '/analysis', JSON.stringify(clickState))

  let sawLightCapture = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => {
      const result = document.querySelector('[data-testid="analysis-export-result"]')
      const button = document.querySelector('[data-testid="analysis-export-direct-btn"]')
      const capture = document.querySelector('[data-testid="analysis-export-capture-host"]')
      const report = capture?.querySelector('[data-testid="analysis-report-document"]')
        || document.querySelector('[data-testid="analysis-report-document"]')
      const toasts = [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')]
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean)
      return {
        path: window.location.pathname,
        paths: window.__playwrightPaths ?? [],
        filename: result?.getAttribute('data-filename') || '',
        pageCount: Number(result?.getAttribute('data-page-count') || 0),
        hasCaptureHost: Boolean(capture),
        exportColorScheme: report?.getAttribute('data-export-color-scheme') || '',
        reportBg: report ? getComputedStyle(report).backgroundColor : '',
        captureIconCount: report
          ? report.querySelectorAll('svg, .swatch-icon').length
          : 0,
        buttonDisabled: Boolean(button?.disabled),
        exportError: document.querySelector('[data-testid="analysis-export-error"]')?.textContent?.trim() || '',
        toasts,
        errors: window.__playwrightErrors ?? [],
      }
    }`)

    assert.equal(state.path, '/analysis', `direct export must stay on /analysis: ${JSON.stringify(state)}`)
    assert.ok(
      !(state.paths || []).some((path) => String(path).startsWith('/analysis/print')),
      `preview route must not be required: ${JSON.stringify(state)}`,
    )

    if (state.exportColorScheme === 'light' && state.reportBg) {
      const reportBgLum = relativeLuminance(parseRgbChannels(state.reportBg))
      if (reportBgLum != null && reportBgLum >= 0.72) sawLightCapture = true
    }
    if (state.captureIconCount > 0 && state.exportColorScheme === 'light') {
      sawLightCapture = true
    }

    if (state.exportError) {
      throw new Error(`PDF export error panel: ${JSON.stringify(state)}`)
    }
    if (state.filename) {
      assert.match(state.filename, /^交易報表_\d{4}-\d{2}\.pdf$/)
      assert.ok(state.pageCount >= 1, JSON.stringify(state))
      const lightPdf = await evalPage(`() => document.querySelector('[data-testid="analysis-export-result"]')?.getAttribute('data-light-pdf') || ''`)
      assert.equal(lightPdf, '1', `direct PDF must use light report capture: ${JSON.stringify({ ...state, lightPdf })}`)
      return { ...state, sawLightCapture: true, lightPdf }
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
    path: window.location.pathname,
    filename: document.querySelector('[data-testid="analysis-export-result"]')?.getAttribute('data-filename') || '',
    buttonText: document.querySelector('[data-testid="analysis-export-direct-btn"]')?.textContent?.trim() || '',
    toasts: [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')].map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    errors: window.__playwrightErrors ?? [],
    bodyText: document.body?.innerText?.slice(0, 2000) || '',
  })`)
  throw new Error(`PDF export did not produce filename result: ${JSON.stringify(finalState)}`)
}

async function findLatestExportedPdf(filename) {
  const candidates = []
  if (filename) {
    candidates.push(resolve(playwrightCliDir, filename))
    // Playwright download paths may normalize "_" to "-".
    candidates.push(resolve(playwrightCliDir, String(filename).replaceAll('_', '-')))
  }
  for (const preferred of candidates) {
    try {
      await fs.access(preferred)
      return preferred
    } catch {
      // try next
    }
  }
  let entries = []
  try {
    entries = await fs.readdir(playwrightCliDir)
  } catch {
    return null
  }
  const pdfs = entries.filter((name) => /^交易報表[_-]\d{4}-\d{2}\.pdf$/i.test(name))
  if (!pdfs.length) return null
  const ranked = await Promise.all(pdfs.map(async (name) => {
    const full = resolve(playwrightCliDir, name)
    const stat = await fs.stat(full)
    return { full, mtime: stat.mtimeMs }
  }))
  ranked.sort((a, b) => b.mtime - a.mtime)
  return ranked[0]?.full || null
}

/**
 * Render exported PDF pages and assert:
 * - footer band on page 1 is mostly white (page number only; content not overlapping)
 * - page 2+ top edge is not a mid-block fragment
 */
async function assertExportedPdfNoClip(filename) {
  const pdfPath = await findLatestExportedPdf(filename)
  assert.ok(pdfPath, `exported PDF not found for ${filename}`)

  const outDir = resolve(frontendDir, '.playwright-cli/pdf-clip-check')
  await fs.mkdir(outDir, { recursive: true })
  for (const name of await fs.readdir(outDir)) {
    if (name.endsWith('.png')) await fs.unlink(join(outDir, name))
  }

  try {
    await execFileAsync('pdftoppm', ['-png', '-r', '110', pdfPath, join(outDir, 'page')], {
      timeout: 60000,
    })
  } catch (error) {
    throw new Error(`pdftoppm failed while checking PDF clip: ${error?.message || error}`)
  }

  const pages = (await fs.readdir(outDir))
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
  assert.ok(pages.length >= 1, `no rendered PDF pages in ${outDir}`)

  const py = await execFileAsync('python3', ['-c', `
from pathlib import Path
try:
    from PIL import Image
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pillow', '-q'])
    from PIL import Image
import json

out = []
root = Path(${JSON.stringify(outDir)})
for path in sorted(root.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[1])):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    footer = img.crop((0, h - 55, w, h))
    top = img.crop((0, 0, w, 18))
    def nw(region, thr=245):
        return sum(1 for px in region.getdata() if not (px[0] > thr and px[1] > thr and px[2] > thr))
    out.append({
        'name': path.name,
        'w': w,
        'h': h,
        'footer_nw': nw(footer),
        'footer_pixels': footer.size[0] * footer.size[1],
        'top_nw': nw(top),
        'top_pixels': top.size[0] * top.size[1],
    })
print(json.dumps(out))
`], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 })

  const metrics = JSON.parse(String(py.stdout || '[]'))
  assert.ok(metrics.length >= 1, 'pdf clip metrics empty')

  const page1 = metrics[0]
  const footerRatio = page1.footer_nw / Math.max(1, page1.footer_pixels)
  assert.ok(
    footerRatio < 0.08,
    `page 1 footer must stay mostly white (no content under page number): ${JSON.stringify(page1)} ratio=${footerRatio}`,
  )

  for (let i = 1; i < metrics.length; i += 1) {
    const page = metrics[i]
    const topRatio = page.top_nw / Math.max(1, page.top_pixels)
    assert.ok(
      topRatio < 0.35,
      `page ${i + 1} top edge must not be a mid-block cut fragment: ${JSON.stringify(page)} ratio=${topRatio}`,
    )
  }

  return {
    pdfPath,
    pageCount: metrics.length,
    metrics,
  }
}

console.log('--- Playwright: analysis direct export + report page customize/open-file ---')

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
  await delay(800)
  // Fresh app-shell for deterministic onboarding + seed.
  await runPlaywrightCli(['eval', `async () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // ignore
    }
    if (window.indexedDB?.databases) {
      const dbs = await window.indexedDB.databases()
      await Promise.all((dbs || []).map((db) => new Promise((resolve) => {
        const req = window.indexedDB.deleteDatabase(db.name)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })))
    }
    location.reload()
    return true
  }`], { raw: true })
  await delay(2000)
  await completeOnboarding()

  const darkTheme = await forceDarkTheme()
  assert.equal(darkTheme.themeMode, 'dark', JSON.stringify(darkTheme))

  const seed = await seedAnalysisTransactions()
  assert.equal(seed.ok, true, JSON.stringify(seed))

  await navigateToAnalysis()
  await assertAnalysisIconsVisible()
  const analysisDark = await assertAnalysisPageDarkTheme()
  const pdf = await exportPdfDirectAndAssert()
  const pdfNoClip = await assertExportedPdfNoClip(pdf.filename)

  // Report page remains a first-class route: enter from analysis, customize, export, open file.
  const reportEntry = await openReportPageFromAnalysis()
  assert.equal(reportEntry.hasBottomNav, true, JSON.stringify(reportEntry))
  assert.equal(reportEntry.hasModeTabs, true, JSON.stringify(reportEntry))
  const customize = await customizeReportRangeAndAssert()
  const reportExport = await exportPdfFromReportPageAndAssertOpenFile()
  await assertPrintPreviewCoverage()
  const chromeDark = await assertExportChromeDarkTheme()
  const lightPreview = await assertPrintPreviewLightTheme()
  const layout = await assertPdfLayoutIntegrity()

  console.log(JSON.stringify({
    ok: true,
    darkTheme,
    analysisDark,
    chromeDark,
    lightPreview,
    layout,
    seed,
    pdf,
    pdfNoClip,
    reportEntry,
    customize,
    reportExport,
  }, null, 2))
} finally {
  preview.kill('SIGTERM')
}
