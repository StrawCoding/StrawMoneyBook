import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.CLAIM_ACCEPT_PORT || 4194)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, evalPage, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'claim-accept',
  port: previewPort,
})

async function completeOnboarding() {
  await runPlaywrightCli(['eval', `() => {
    try { localStorage.setItem('strawmoneybook.ui.layout', 'modern') } catch {}
    return true
  }`], { raw: true })

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evalPage(`() => ({
      hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
      welcome: Boolean(document.querySelector('.welcome-root')),
    })`)
    if (state.hasBottomNav) return
    if (state.welcome) break
    await delay(400)
  }

  if (await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)) {
    await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Acceptance ${Date.now()}`])
    await runPlaywrightCli(['click', "button:has-text('建立帳本'), button:has-text('Create Ledger')"])
    await delay(2500)
    await runPlaywrightCli(['fill', '.welcome-root input.input >> nth=0', 'Cash'])
    await runPlaywrightCli(['fill', '.welcome-root input.input >> nth=1', 'Wallet'])
    await runPlaywrightCli(['click', "button:has-text('建立帳戶'), button:has-text('Create Account')"])
    await delay(3000)
  }

  const intro = await evalPage(`() => Boolean(document.querySelector('.intro-root'))`)
  if (intro) {
    await runPlaywrightCli(['click', "button:has-text('先開始使用'), button:has-text('Start now'), button:has-text('Skip')"])
    await delay(1500)
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await evalPage(`() => Boolean(document.querySelector('[data-testid=bottom-nav]'))`))) return
    await delay(500)
  }
  throw new Error('onboarding failed')
}

async function waitForPreviewReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/`)).ok) return
    } catch {}
    await delay(500)
  }
  throw new Error('preview not ready')
}

console.log('--- Claim sheet full acceptance ---')

if (!process.env.SMB_SKIP_WEB_BUILD) {
  await execFileAsync('npm', ['run', 'build:web'], { cwd: frontendDir, timeout: 600000 })
}

const preview = spawn(
  resolve(frontendDir, 'node_modules/.bin/vite'),
  ['preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
  { cwd: frontendDir, stdio: 'ignore' },
)
await waitForPreviewReady()
await ensurePlaywrightChromium()

const report = { steps: [] }

try {
  await runPlaywrightCli(['open', `${baseUrl}/`], { raw: true })
  await runPlaywrightCli(['eval', `() => {
    window.__capture = { errors: [], rejections: [] }
    window.addEventListener('error', (e) => {
      window.__capture.errors.push(String(e.message || e.error || 'error'))
    })
    window.addEventListener('unhandledrejection', (e) => {
      window.__capture.rejections.push(String(e.reason?.message || e.reason || 'rejection'))
    })
  window.addEventListener('error', (e) => {
    try { sessionStorage.setItem('smbLastError', String(e.message || e.error || 'error')) } catch {}
  })
  window.addEventListener('unhandledrejection', (e) => {
    try { sessionStorage.setItem('smbLastRejection', String(e.reason?.message || e.reason || 'rejection')) } catch {}
  })
    return true
  }`], { raw: true })
  await completeOnboarding()
  report.steps.push('onboarding:ok')

  await runPlaywrightCli(['goto', `${baseUrl}/claim-sheets`])
  await delay(1500)

  const shell = await evalPage(`() => {
    const root = document.querySelector('[data-testid=claim-sheet-list-view]')
    const items = [...document.querySelectorAll('[data-testid=claim-sheet-list] .claim-item')]
    return {
      path: location.pathname,
      hasRoot: Boolean(root),
      create: Boolean(document.querySelector('[data-testid=claim-create-open]')),
      title: document.querySelector('.habitat-page-title')?.textContent?.trim() ?? '',
      tabActive: document.querySelector('.tab-btn.active')?.textContent?.trim() ?? '',
      summaryCount: document.querySelector('.summary-item strong')?.textContent?.trim() ?? '',
      itemCount: items.length,
      itemHeights: items.map((el) => el.getBoundingClientRect().height),
      itemOpacity: items.map((el) => getComputedStyle(el).opacity),
      listVisible: items.some((el) => el.getBoundingClientRect().height > 8 && Number(getComputedStyle(el).opacity) >= 0.99),
    }
  }`)
  report.steps.push({ emptyList: shell })
  assert.equal(shell.hasRoot, true, JSON.stringify(shell))
  assert.equal(shell.create, true, JSON.stringify(shell))

  await runPlaywrightCli(['click', '[data-testid=claim-create-open]'])
  await delay(600)
  await runPlaywrightCli(['fill', '[data-testid=claim-create-title]', '驗收請款單'])
  await runPlaywrightCli(['click', '[data-testid=claim-draft-add-manual]'])
  await delay(400)
  await runPlaywrightCli(['fill', '[data-testid=claim-manual-amount]', '150'])
  await runPlaywrightCli(['click', '[data-testid=claim-manual-save]'])
  await delay(500)

  const beforeSubmit = await evalPage(`() => ({
    submitDisabled: document.querySelector('[data-testid=claim-create-submit]')?.disabled ?? true,
    hint: document.querySelector('.claim-create-footer-hint')?.textContent?.trim() ?? '',
    manualRows: document.querySelectorAll('.claim-draft-item-row').length,
    errors: window.__errs || [],
  })`)
  report.steps.push({ beforeSubmit })
  assert.equal(beforeSubmit.submitDisabled, false, JSON.stringify(beforeSubmit))

  await runPlaywrightCli(['click', '[data-testid=claim-create-submit]'])
  await delay(2000)

  const afterCreate = await evalPage(`() => {
    const items = [...document.querySelectorAll('[data-testid=claim-sheet-list] .claim-item')]
    const root = document.querySelector('[data-testid=claim-sheet-list-view]')
    const routeChild = document.querySelector('.route-stage')?.firstElementChild
    return {
      path: location.pathname + location.search,
      hash: location.hash,
      hasRoot: Boolean(root),
      rootHeight: root?.getBoundingClientRect().height ?? 0,
      rootOpacity: root ? getComputedStyle(root).opacity : null,
      routeOpacity: routeChild ? getComputedStyle(routeChild).opacity : null,
      pageTitle: document.querySelector('.habitat-page-title')?.textContent?.trim() ?? '',
      sheetOpen: Boolean(document.querySelector('[data-testid=claim-create-title]')),
      toasts: [...document.querySelectorAll('.toast')].map((n) => n.textContent?.trim()).filter(Boolean),
      tabActive: document.querySelector('.tab-btn.active')?.textContent?.trim() ?? '',
      summaryCount: document.querySelector('.summary-item strong')?.textContent?.trim() ?? '',
      itemCount: items.length,
      itemText: items[0]?.innerText?.slice(0, 120) ?? '',
      itemHeight: items[0]?.getBoundingClientRect().height ?? 0,
      itemOpacity: items[0] ? getComputedStyle(items[0]).opacity : null,
      hasPay: Boolean(document.querySelector('[data-testid=claim-record-payment]')),
      body: (document.body?.innerText ?? '').slice(0, 400),
      routeHtmlLen: document.querySelector('.route-stage')?.innerHTML?.length ?? 0,
      capture: window.__capture || null,
      storedErr: (() => { try { return sessionStorage.getItem('smbLastError') } catch { return null } })(),
      storedRej: (() => { try { return sessionStorage.getItem('smbLastRejection') } catch { return null } })(),
      smbErrors: (window.__SMB_ERROR_LOG__ || []).slice(0, 5),
      bootLayer: Boolean(document.querySelector('.boot-layer')),
      welcomeRoot: Boolean(document.querySelector('.welcome-root')),
      mainText: (document.querySelector('main.page-container')?.innerText ?? '').slice(0, 120),
    }
  }`)
  report.steps.push({ afterCreate })

  assert.equal(afterCreate.sheetOpen, false, `sheet should close: ${JSON.stringify(afterCreate)}`)
  assert.ok(afterCreate.itemCount >= 1, `list empty after create: ${JSON.stringify(afterCreate)}`)
  assert.ok(Number(afterCreate.itemHeight) > 20, `row height: ${JSON.stringify(afterCreate)}`)
  assert.ok(Number(afterCreate.itemOpacity) >= 0.99, `row opacity: ${JSON.stringify(afterCreate)}`)
  assert.match(afterCreate.itemText, /驗收請款單/u, JSON.stringify(afterCreate))
  assert.equal(afterCreate.hasPay, true, JSON.stringify(afterCreate))

  console.log('PASS claim sheet acceptance')
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error('FAIL', error.message)
  console.error(JSON.stringify(report, null, 2))
  throw error
} finally {
  preview.kill('SIGTERM')
  await runPlaywrightCli(['close']).catch(() => {})
}
