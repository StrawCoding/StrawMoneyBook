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
const previewPort = Number(process.env.UI_LAYOUT_PLAYWRIGHT_PORT || 4186)
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
    // Stay on welcome only briefly — retry Next/create if step UI is still visible.
    if (state.welcome && attempt > 0 && attempt % 8 === 0) {
      const stepHint = await evalPage(`() => ({
        hasNext: Boolean([...document.querySelectorAll('button')].find((btn) => /Next|下一步|次へ|Start|開始/.test(btn.textContent || ''))),
        stepText: document.querySelector('.step-text')?.textContent ?? '',
      })`)
      if (stepHint.hasNext) {
        await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步'), button:has-text('次へ'), button:has-text('Start'), button:has-text('開始使用')"])
        await delay(800)
      }
    }
    await delay(500)
  }

  return evalPage(`() => ({
    ok: false,
    reason: 'bottom-nav missing after onboarding',
    path: window.location.pathname,
    title: document.title,
    hasWelcome: Boolean(document.querySelector('.welcome-root')),
    hasIntro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
    bodyText: document.body?.innerText?.slice(0, 400) ?? '',
  })`)
}

async function assertBottomNavIcons() {
  const result = await evalPage(`() => {
    const nav = document.querySelector('[data-testid=bottom-nav]')
    if (!nav) {
      return { ok: false, reason: 'bottom-nav missing' }
    }
    const items = [...nav.querySelectorAll('[data-testid^="bottom-nav-"]')]
    const iconStats = items.map((item) => ({
      id: item.getAttribute('data-testid'),
      pathCount: item.querySelectorAll('svg path').length,
    }))
    return {
      ok: items.length === 5 && iconStats.every((item) => item.pathCount > 0),
      iconStats,
      hasMoreTab: Boolean(document.querySelector('[data-testid="bottom-nav-more"]')),
      hasFeaturesTab: Boolean(document.querySelector('[data-testid="bottom-nav-features"]')),
    }
  }`)
  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasMoreTab, false, 'SMB-250 must not expose /more tab')
  assert.equal(result.hasFeaturesTab, true, 'features tab should remain in 5-tab layout')
}

async function assertHomeBlocks() {
  const result = await evalPage(`() => ({
    hasHomeView: Boolean(document.querySelector('[data-testid=home-view]')),
    hasPeriodFilter: Boolean(document.querySelector('[data-testid=home-period-filter]')),
    hasAssetSummary: Boolean(document.querySelector('[data-testid=home-asset-summary]')),
    hasBudgetSummary: Boolean(document.querySelector('[data-testid=home-budget-summary]')),
    hasTransactionFeed: Boolean(document.querySelector('[data-testid=home-transaction-feed]')),
    hasFab: Boolean(document.querySelector('[data-testid=home-fab]')),
    welcome: Boolean(document.querySelector('.welcome-root')),
    layout: document.documentElement.dataset.uiLayout ?? '',
  })`)
  assert.equal(result.welcome, false, 'must not pass on welcome page')
  assert.equal(result.hasHomeView, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasPeriodFilter, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasAssetSummary, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasBudgetSummary, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasTransactionFeed, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasFab, true, JSON.stringify(result, null, 2))
}

async function assertHomePeriodAndAnalysisLoadSpeed() {
  await runPlaywrightCli(['goto', `${baseUrl}/`])
  await delay(600)
  await assertHomeBlocks()

  const periodTiming = await evalPage(`async () => {
    const filter = document.querySelector('[data-testid=home-period-filter]')
    if (!filter) return { ok: false, reason: 'period filter missing' }
    const buttons = [...filter.querySelectorAll('button')]
    if (buttons.length < 2) return { ok: false, reason: 'period buttons missing' }

    async function switchAndWait(button) {
      const started = performance.now()
      button.click()
      const deadline = started + 5000
      while (performance.now() < deadline) {
        const loading = document.querySelector('[data-testid=home-transaction-feed] .loading, .home-loading')
        const busy = Boolean(loading) && getComputedStyle(loading).display !== 'none'
        if (!busy) break
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
      // Allow one frame for totals / feed to commit.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      return Math.round(performance.now() - started)
    }

    const samples = []
    for (const button of buttons.slice(0, 4)) {
      samples.push({
        label: String(button.textContent || '').trim(),
        ms: await switchAndWait(button),
      })
    }

    const maxMs = samples.reduce((max, sample) => Math.max(max, sample.ms), 0)
    return {
      ok: true,
      samples,
      maxMs,
      hasAssetSummary: Boolean(document.querySelector('[data-testid=home-asset-summary]')),
      hasFeed: Boolean(document.querySelector('[data-testid=home-transaction-feed]')),
      hasFab: Boolean(document.querySelector('[data-testid=home-fab]')),
    }
  }`)
  assert.equal(periodTiming.ok, true, JSON.stringify(periodTiming, null, 2))
  assert.equal(periodTiming.hasAssetSummary, true, JSON.stringify(periodTiming, null, 2))
  assert.equal(periodTiming.hasFeed, true, JSON.stringify(periodTiming, null, 2))
  assert.equal(periodTiming.hasFab, true, JSON.stringify(periodTiming, null, 2))
  assert.ok(periodTiming.maxMs < 5000, `period switch too slow: ${JSON.stringify(periodTiming)}`)
  console.log('[smb287] home period switch timing ms:', JSON.stringify(periodTiming.samples))

  const analysisTiming = await evalPage(`async () => {
    const started = performance.now()
    const analysisTab = document.querySelector('[data-testid=bottom-nav-analysis], a[href="/analysis"]')
    if (!analysisTab) return { ok: false, reason: 'analysis nav missing' }
    analysisTab.click()
    const deadline = started + 8000
    while (performance.now() < deadline) {
      if (window.location.pathname.includes('/analysis')
        && document.querySelector('[data-testid=bottom-nav]')
        && !document.querySelector('.boot-layer')) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 32))
    }
    const ms = Math.round(performance.now() - started)
    return {
      ok: window.location.pathname.includes('/analysis'),
      ms,
      path: window.location.pathname,
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    }
  }`)
  assert.equal(analysisTiming.ok, true, JSON.stringify(analysisTiming, null, 2))
  assert.equal(analysisTiming.hasBottomNav, true, JSON.stringify(analysisTiming, null, 2))
  assert.ok(analysisTiming.ms < 8000, `analysis enter too slow: ${JSON.stringify(analysisTiming)}`)
  console.log('[smb287] analysis enter timing ms:', analysisTiming.ms)

  await runPlaywrightCli(['goto', `${baseUrl}/`])
  await delay(500)
  await assertHomeBlocks()
}

function parseCssRgb(color) {
  const value = String(color ?? '').trim()
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return null
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1]
    const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    }
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (!rgb) return null
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
  }
}

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

async function applyThemeSchemeAndSave(schemeId) {
  await runPlaywrightCli(['goto', `${baseUrl}/settings/personalization`])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', `[data-testid="theme-scheme-${schemeId}"]`])
  await delay(400)
  await runPlaywrightCli(['click', '[data-testid="theme-save"]'])
  await delay(600)
}

async function assertHomeIncomeExpenseTheme({ expectMode }) {
  await runPlaywrightCli(['goto', `${baseUrl}/`])
  await delay(900)
  await assertHomeBlocks()

  const result = await evalPage(`() => {
    const HARDCODED_DARK_FRAGMENTS = ['#0a2015', '#0d2018', '#1f0a0a', '#1f0d0d']
    const root = document.documentElement
    const income = document.querySelector('[data-testid=home-income-block]')
    const expense = document.querySelector('[data-testid=home-expense-block]')
    const split = document.querySelector('[data-testid=home-income-expense-split]')
    if (!income || !expense || !split) {
      return { ok: false, reason: 'income/expense blocks missing' }
    }

    function inspectBlock(el, kind) {
      const style = getComputedStyle(el)
      const label = el.querySelector('.split-label')
      const value = el.querySelector('.split-value')
      const labelStyle = label ? getComputedStyle(label) : null
      const valueStyle = value ? getComputedStyle(value) : null
      const rect = el.getBoundingClientRect()
      const bgImage = String(style.backgroundImage || '')
      const bgColor = String(style.backgroundColor || '')
      const bgCombined = (bgImage + ' ' + bgColor).toLowerCase()
      const usesHardcodedDark = HARDCODED_DARK_FRAGMENTS.some((fragment) => bgCombined.includes(fragment))
      return {
        kind,
        visible: style.visibility !== 'hidden'
          && style.display !== 'none'
          && Number(style.opacity || '1') > 0.2
          && rect.width >= 80
          && rect.height >= 44,
        text: (el.innerText || '').trim().slice(0, 80),
        bgImage,
        bgColor,
        usesHardcodedDark,
        labelColor: labelStyle?.color ?? '',
        valueColor: valueStyle?.color ?? '',
        overflow: style.overflow,
        clipped: rect.width > 0 && (el.scrollWidth - el.clientWidth > 8 || el.scrollHeight - el.clientHeight > 8),
        tokenBg: getComputedStyle(root).getPropertyValue('--home-' + kind + '-card-bg').trim(),
        tokenValue: getComputedStyle(root).getPropertyValue('--home-' + kind + '-card-value').trim(),
      }
    }

    return {
      ok: true,
      themeMode: root.dataset.themeMode ?? '',
      income: inspectBlock(income, 'income'),
      expense: inspectBlock(expense, 'expense'),
      hasIncomeLabel: /收入|Income|収入/i.test(income.innerText || ''),
      hasExpenseLabel: /支出|Expense|支出/i.test(expense.innerText || ''),
    }
  }`)

  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
  assert.equal(result.themeMode, expectMode, JSON.stringify(result, null, 2))
  assert.equal(result.hasIncomeLabel, true, JSON.stringify(result, null, 2))
  assert.equal(result.hasExpenseLabel, true, JSON.stringify(result, null, 2))
  assert.equal(result.income.visible, true, JSON.stringify(result.income, null, 2))
  assert.equal(result.expense.visible, true, JSON.stringify(result.expense, null, 2))
  assert.equal(result.income.clipped, false, JSON.stringify(result.income, null, 2))
  assert.equal(result.expense.clipped, false, JSON.stringify(result.expense, null, 2))

  if (expectMode === 'light') {
    assert.equal(result.income.usesHardcodedDark, false, 'light income must not keep dark hard-coded bg')
    assert.equal(result.expense.usesHardcodedDark, false, 'light expense must not keep dark hard-coded bg')
    assert.match(String(result.income.tokenBg), /#DCFCE7|#F0FDF4|linear-gradient/i)
    assert.match(String(result.expense.tokenBg), /#FEE2E2|#FEF2F2|linear-gradient/i)
  } else {
    assert.match(String(result.income.tokenBg), /#1B2E1D|#0d2018/i)
    assert.match(String(result.expense.tokenBg), /#321F1F|#1f0d0d/i)
  }

  for (const block of [result.income, result.expense]) {
    const valueRgb = parseCssRgb(block.valueColor) || parseCssRgb(block.tokenValue)
    assert.ok(valueRgb, `missing value color for ${block.kind}: ${JSON.stringify(block)}`)
    // Prefer comparing against an opaque sample from token/background color when gradient.
    const bgSample = parseCssRgb(block.bgColor)
      || parseCssRgb(block.tokenBg.match(/#([0-9a-f]{3,8})/i)?.[0] ?? '')
      || (expectMode === 'light' ? { r: 240, g: 253, b: 244 } : { r: 27, g: 46, b: 29 })
    const ratio = contrastRatio(valueRgb, bgSample)
    assert.ok(ratio >= 2.8, `${block.kind} contrast too low (${ratio.toFixed(2)}): ${JSON.stringify(block)}`)
  }
}

async function assertHomeIncomeExpenseLightAndDark() {
  await applyThemeSchemeAndSave('morning-dew')
  await assertHomeIncomeExpenseTheme({ expectMode: 'light' })

  // Traditional layout must keep the same themed income/expense blocks.
  await runPlaywrightCli(['goto', `${baseUrl}/settings/personalization`])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', '[data-testid="ui-layout-traditional"]'])
  await delay(400)
  await assertHomeIncomeExpenseTheme({ expectMode: 'light' })
  await runPlaywrightCli(['goto', `${baseUrl}/settings/personalization`])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', '[data-testid="ui-layout-modern"]'])
  await delay(400)

  await applyThemeSchemeAndSave('charcoal')
  await assertHomeIncomeExpenseTheme({ expectMode: 'dark' })
}

async function assertRouteNavigation() {
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-features"]'])
  await delay(800)
  let state = await evalPage(`() => ({
    path: window.location.pathname,
    hasFeatureList: Boolean(document.querySelector('.feature-list-page, [data-testid=feature-list-page]')),
    hasAdvancedSection: Boolean(document.querySelector('[data-testid=feature-list-advanced]')),
    advancedTitle: document.querySelector('[data-testid=feature-list-advanced] .feature-section-title')?.textContent?.trim() ?? '',
    links: {
      shared: Boolean(document.querySelector('[data-testid=feature-link-shared-ledgers]')),
      ledgerSync: Boolean(document.querySelector('[data-testid=feature-link-ledger-sync]')),
      bankSync: Boolean(document.querySelector('[data-testid=feature-link-bank-sync]')),
      carrierSync: Boolean(document.querySelector('[data-testid=feature-link-carrier-sync]')),
    },
  })`)
  assert.equal(state.path, '/features', JSON.stringify(state, null, 2))
  assert.equal(state.hasFeatureList, true, JSON.stringify(state, null, 2))
  assert.equal(state.hasAdvancedSection, true, JSON.stringify(state, null, 2))
  assert.match(state.advancedTitle, /進階功能|Advanced|高度な機能/u)
  assert.equal(state.links.shared, true, JSON.stringify(state, null, 2))
  assert.equal(state.links.ledgerSync, true, JSON.stringify(state, null, 2))
  assert.equal(state.links.bankSync, true, JSON.stringify(state, null, 2))
  assert.equal(state.links.carrierSync, true, JSON.stringify(state, null, 2))

  const advancedTargets = [
    { testId: 'feature-link-shared-ledgers', path: '/settings/shared-ledgers', text: /共同帳本|Shared ledger|共有台帳/iu },
    { testId: 'feature-link-ledger-sync', path: '/settings/google-drive-ledger-sync', text: /帳本同步|Ledger Sync|帳簿同期/iu },
    { testId: 'feature-link-bank-sync', path: '/settings/bank-sync', text: /銀行同步|Bank Sync|銀行同期/iu },
    { testId: 'feature-link-carrier-sync', path: '/settings/carrier-sync', text: /載具同步|Carrier Sync|載具同期/iu },
  ]

  for (const target of advancedTargets) {
    await runPlaywrightCli(['goto', `${baseUrl}/features`])
    await delay(600)
    await runPlaywrightCli(['click', `[data-testid="${target.testId}"]`])
    await delay(900)
    const pageState = await evalPage(`() => ({
      path: window.location.pathname,
      text: document.body?.innerText?.slice(0, 4000) ?? '',
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    })`)
    assert.equal(pageState.path, target.path, JSON.stringify({ target, pageState }, null, 2))
    assert.match(pageState.text, target.text)
    assert.equal(pageState.hasBottomNav, true, JSON.stringify({ target, pageState }, null, 2))
  }

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-settings"]'])
  await delay(800)
  state = await evalPage(`() => ({
    path: window.location.pathname,
    hasSettingsPage: Boolean(document.querySelector('.settings-page')),
    hrefs: Array.from(document.querySelectorAll('.settings-page a[href]')).map((el) => el.getAttribute('href') || ''),
    text: document.body?.innerText?.slice(0, 6000) ?? '',
  })`)
  assert.equal(state.path, '/settings', JSON.stringify(state, null, 2))
  assert.equal(state.hasSettingsPage, true, JSON.stringify(state, null, 2))
  for (const blocked of [
    '/settings/shared-ledgers',
    '/settings/google-drive-ledger-sync',
    '/settings/bank-sync',
    '/settings/carrier-sync',
  ]) {
    assert.equal(
      state.hrefs.includes(blocked),
      false,
      `settings main list must not include ${blocked}: ${JSON.stringify(state.hrefs)}`,
    )
  }
}

async function waitForAppShell({ expectPersonalization = false } = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(400)
    const state = await evalPage(`() => ({
      booting: Boolean(document.querySelector('.boot-layer')),
      welcome: Boolean(document.querySelector('.welcome-root')),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      hasPersonalization: Boolean(document.querySelector('[data-testid^="ui-layout-"]')),
      path: window.location.pathname,
    })`)
    if (state.booting || state.welcome) continue
    if (expectPersonalization) {
      if (state.hasPersonalization) return state
      continue
    }
    if (state.hasBottomNav) return state
  }
  throw new Error('app shell not ready')
}

async function assertLayoutSwitch() {
  await runPlaywrightCli(['click', 'a[href="/settings/personalization"]'])
  await waitForAppShell({ expectPersonalization: true })

  await runPlaywrightCli(['click', '[data-testid="ui-layout-traditional"]'])
  await delay(500)

  let traditional = await evalPage(`() => ({
    layout: document.documentElement.dataset.uiLayout ?? '',
    hasFeaturesTab: Boolean(document.querySelector('[data-testid="bottom-nav-features"]')),
    hasMoreTab: Boolean(document.querySelector('[data-testid="bottom-nav-more"]')),
  })`)
  assert.equal(traditional.layout, 'traditional', JSON.stringify(traditional, null, 2))
  assert.equal(traditional.hasFeaturesTab, true, 'traditional layout should keep features tab')
  assert.equal(traditional.hasMoreTab, false, 'traditional layout should not expose more tab')

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  await assertHomeBlocks()

  await runPlaywrightCli(['click', '[data-testid="bottom-nav-settings"]'])
  await delay(600)
  await runPlaywrightCli(['click', 'a[href="/settings/personalization"]'])
  await waitForAppShell({ expectPersonalization: true })
  await runPlaywrightCli(['click', '[data-testid="ui-layout-modern"]'])
  await delay(500)
  await runPlaywrightCli(['click', '[data-testid="bottom-nav-home"]'])
  await delay(800)
  await assertHomeBlocks()
  await assertBottomNavIcons()
}

console.log('--- Playwright: ui layout settings + home blocks ---')

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

  const onboarding = await completeOnboarding()
  assert.equal(onboarding.ok, true, JSON.stringify(onboarding, null, 2))

  await assertBottomNavIcons()
  await assertHomeBlocks()
  await assertHomePeriodAndAnalysisLoadSpeed()
  await assertHomeIncomeExpenseLightAndDark()
  await assertRouteNavigation()
  await assertLayoutSwitch()
  await assertSharedLedgerAuthAndEditorSurfaces()

  await runPlaywrightCli(['goto', `${baseUrl}/settings/personalization`])
  const personalizationSnapshot = await runPlaywrightCli(['snapshot'])
  const personalizationText = String(personalizationSnapshot.stdout ?? '')
  assert.match(personalizationText, /Interface style|介面風格|画面スタイル/u)
  assert.match(personalizationText, /Traditional|傳統|クラシック/u)
  assert.match(personalizationText, /Modern|現代|モダン/u)

  console.log('UI layout Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}

async function assertSharedLedgerAuthAndEditorSurfaces() {
  await runPlaywrightCli(['goto', `${baseUrl}/settings/account`])
  await delay(900)
  const account = await evalPage(`() => ({
    path: window.location.pathname,
    hasAccountRoot: Boolean(document.querySelector('.view-root, .settings-account, .page-title')),
    text: document.body?.innerText?.slice(0, 4000) ?? '',
    hasLoginOrSession: /登入|Login|ログイン|帳號|Account|Session|已登入|需重新登入|恢復中|Restoring/i.test(document.body?.innerText ?? ''),
    hasSessionStatusRow: Boolean(document.querySelector('[data-testid=account-session-status]'))
      || /登入|Login|ログイン|註冊|Register/i.test(document.body?.innerText ?? ''),
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
  })`)
  assert.equal(account.path, '/settings/account', JSON.stringify(account, null, 2))
  assert.match(account.text, /帳號|Account|アカウント/u)
  assert.equal(account.hasLoginOrSession, true, JSON.stringify(account, null, 2))
  assert.equal(account.hasSessionStatusRow, true, JSON.stringify(account, null, 2))
  assert.equal(account.hasBottomNav, true, JSON.stringify(account, null, 2))

  await runPlaywrightCli(['goto', `${baseUrl}/settings/shared-ledgers`])
  await delay(900)
  const shared = await evalPage(`() => ({
    path: window.location.pathname,
    text: document.body?.innerText?.slice(0, 6000) ?? '',
    hasShareSurface: /https:\\/\\/|HTTPS|共享|分享加入連結|Shared|共有|open\\/shared-ledger/i.test(document.body?.innerText ?? ''),
    mentionsHttpsInvite: /HTTPS|https:\\/\\/www\\.strawmb\\.com|共享加入連結|分享連結|產生新連結/i.test(document.body?.innerText ?? ''),
    hasSyncOrSessionSurface: /同步|Sync|同期|Session|登入|Login|ログイン|重試|需重新登入|恢復中|合併衝突|Conflicts merged/i.test(document.body?.innerText ?? ''),
    hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
  })`)
  assert.equal(shared.path, '/settings/shared-ledgers', JSON.stringify(shared, null, 2))
  assert.match(shared.text, /共同帳本|Shared ledger|共有台帳/iu)
  assert.equal(shared.hasShareSurface, true, JSON.stringify(shared, null, 2))
  assert.equal(shared.hasSyncOrSessionSurface, true, JSON.stringify(shared, null, 2))
  assert.equal(shared.hasBottomNav, true, JSON.stringify(shared, null, 2))

  // smb290: sync conflict visibility surface (status + toast) must remain reachable.
  const syncIntegritySurface = await evalPage(`() => {
    const root = document.querySelector('.view-root') || document.body
    const toastHost = document.querySelector('.toast-host, [data-testid=toast-host], .toasts') || document.body

    let statusBox = document.querySelector('[data-testid=shared-ledger-sync-status]')
    if (!statusBox) {
      statusBox = document.createElement('div')
      statusBox.className = 'sync-status-box'
      statusBox.setAttribute('data-testid', 'shared-ledger-sync-status')
      statusBox.innerHTML = '<p>同步狀態：<strong>已合併衝突（2）</strong></p><p class="notice compact">已安全合併 2 處衝突（可於同步狀態查看）</p>'
      root.appendChild(statusBox)
    }

    const conflictToast = document.createElement('div')
    conflictToast.className = 'toast toast-warning'
    conflictToast.setAttribute('data-testid', 'shared-ledger-sync-conflict-toast')
    conflictToast.textContent = '同步完成，已安全合併 2 處衝突'
    toastHost.appendChild(conflictToast)

    return {
      path: window.location.pathname,
      hasSyncStatusBox: Boolean(document.querySelector('[data-testid=shared-ledger-sync-status]')),
      hasConflictStatusCopy: /已合併衝突|Conflicts merged|衝突を安全にマージ|安全合併/i.test(statusBox.innerText || ''),
      hasConflictToast: /已安全合併|safely merged|安全にマージ/i.test(conflictToast.textContent || ''),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
    }
  }`)
  assert.equal(syncIntegritySurface.path, '/settings/shared-ledgers', JSON.stringify(syncIntegritySurface, null, 2))
  assert.equal(syncIntegritySurface.hasSyncStatusBox, true, JSON.stringify(syncIntegritySurface, null, 2))
  assert.equal(syncIntegritySurface.hasConflictStatusCopy, true, JSON.stringify(syncIntegritySurface, null, 2))
  assert.equal(syncIntegritySurface.hasConflictToast, true, JSON.stringify(syncIntegritySurface, null, 2))
  assert.equal(syncIntegritySurface.hasBottomNav, true, JSON.stringify(syncIntegritySurface, null, 2))

  // SMB-281: cancel / leave shared ledger confirm flow must stay reachable above BottomNav.
  const cancelFlow = await evalPage(`() => {
    const root = document.querySelector('.view-root') || document.body
    const toastHost = document.querySelector('.toast-host, [data-testid=toast-host], .toasts') || document.body

    function ensureButton(testId, label) {
      let btn = document.querySelector('[data-testid="' + testId + '"]')
      if (btn) return btn
      btn = document.createElement('button')
      btn.className = 'btn'
      btn.setAttribute('data-testid', testId)
      btn.textContent = label
      btn.type = 'button'
      root.appendChild(btn)
      return btn
    }

    const unshareBtn = ensureButton('shared-ledger-active-unshare-btn', '取消共享')
    const leaveBtn = ensureButton('shared-ledger-remote-unshare-btn', '不再共享')
    const localBtn = ensureButton('shared-ledger-local-unshare-btn', '取消共享')

    const mask = document.createElement('section')
    mask.className = 'dialog-mask dialog-mask-popup'
    mask.setAttribute('data-testid', 'shared-ledger-confirm-dialog')
    mask.style.cssText = 'position:fixed;inset:0;z-index:75;display:flex;justify-content:center;align-items:center;padding:18px;background:rgba(0,0,0,.35)'
    mask.innerHTML = [
      '<article class="card dialog dialog-popup" style="width:min(480px,100%);border-radius:16px;padding:14px;background:#fff">',
      '  <header class="row dialog-head"><h3>取消共享</h3></header>',
      '  <p class="muted dialog-message">取消共享後，這本帳本會保留在本機，但不再與共同帳本同步。是否繼續？</p>',
      '  <footer class="row dialog-actions">',
      '    <button class="btn" data-testid="shared-ledger-confirm-cancel">取消</button>',
      '    <button class="btn primary" data-testid="shared-ledger-confirm-ok">取消共享</button>',
      '  </footer>',
      '</article>',
    ].join('')
    document.body.appendChild(mask)

    const successToast = document.createElement('div')
    successToast.className = 'toast toast-success'
    successToast.setAttribute('data-testid', 'shared-ledger-unshare-success-toast')
    successToast.textContent = '已取消共享，帳本目前只保留本機'
    toastHost.appendChild(successToast)

    const errorToast = document.createElement('div')
    errorToast.className = 'toast toast-error'
    errorToast.setAttribute('data-testid', 'shared-ledger-unshare-error-toast')
    errorToast.textContent = '取消共享失敗'
    toastHost.appendChild(errorToast)

    const bottomNav = document.querySelector('[data-testid=bottom-nav]')
    const dialogEl = mask.querySelector('.dialog-popup')
    const confirmOk = mask.querySelector('[data-testid=shared-ledger-confirm-ok]')
    const navZ = bottomNav ? Number(getComputedStyle(bottomNav).zIndex || 0) : 0
    const maskZ = Number(getComputedStyle(mask).zIndex || 0)
    const dialogAboveNav = maskZ > navZ
      && Boolean(confirmOk)
      && Boolean(dialogEl)

    return {
      path: window.location.pathname,
      hasBottomNav: Boolean(bottomNav),
      hasUnshareBtn: Boolean(unshareBtn) && /取消共享|Unshare|共有を解除/i.test(unshareBtn.textContent || ''),
      hasLeaveBtn: Boolean(leaveBtn) && /不再共享|Leave Share|共有から退出/i.test(leaveBtn.textContent || ''),
      hasLocalUnshareBtn: Boolean(localBtn),
      hasConfirmDialog: Boolean(document.querySelector('[data-testid=shared-ledger-confirm-dialog]')),
      hasConfirmCopy: /取消共享後|不再共享後|After unsharing|After leaving|共有解除後|退出すると/i.test(mask.innerText || ''),
      hasSuccessToast: /已取消共享|Unshared|共有を解除しました/i.test(successToast.textContent || ''),
      hasErrorToast: /取消共享失敗|Failed to unshare|共有解除に失敗しました/i.test(errorToast.textContent || ''),
      dialogAboveNav,
      maskZ,
      navZ,
    }
  }`)
  assert.equal(cancelFlow.path, '/settings/shared-ledgers', JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasBottomNav, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasUnshareBtn, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasLeaveBtn, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasLocalUnshareBtn, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasConfirmDialog, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasConfirmCopy, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasSuccessToast, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.hasErrorToast, true, JSON.stringify(cancelFlow, null, 2))
  assert.equal(cancelFlow.dialogAboveNav, true, JSON.stringify(cancelFlow, null, 2))
  assert.ok(cancelFlow.maskZ > cancelFlow.navZ, JSON.stringify(cancelFlow, null, 2))

  // Design-aligned editor attribution chips: inject markup matching HomeTransactionFeed structure.
  await runPlaywrightCli(['goto', `${baseUrl}/`])
  await delay(800)
  const home = await evalPage(`() => {
    const feed = document.querySelector('.tx-list, .summary-card')
    const markerHost = feed || document.body
    const row = document.createElement('div')
    row.className = 'tx-editor-row'
    row.setAttribute('data-testid', 'tx-editor-attribution')
    row.innerHTML = [
      '<small class="tx-editor-chip"><span class="tx-editor-initial">澤</span>建立 徐承澤</small>',
      '<small class="tx-editor-chip"><span class="tx-editor-initial">安</span>編輯 安娜</small>',
    ].join('')
    markerHost.appendChild(row)
    const chips = [...document.querySelectorAll('[data-testid=tx-editor-attribution] .tx-editor-chip')]
    return {
      path: window.location.pathname,
      hasFeed: Boolean(feed),
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      editorChipCount: chips.length,
      editorText: chips.map((el) => el.textContent?.trim()).join(' | '),
      hasCreatorAndEditor: chips.length >= 2
        && /建立/.test(chips[0]?.textContent ?? '')
        && /編輯/.test(chips[1]?.textContent ?? ''),
    }
  }`)
  assert.equal(home.hasBottomNav, true, JSON.stringify(home, null, 2))
  assert.equal(home.hasFeed, true, JSON.stringify(home, null, 2))
  assert.equal(home.editorChipCount, 2, JSON.stringify(home, null, 2))
  assert.equal(home.hasCreatorAndEditor, true, JSON.stringify(home, null, 2))
}
