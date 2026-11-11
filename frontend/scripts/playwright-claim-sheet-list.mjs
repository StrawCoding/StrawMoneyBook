import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.CLAIM_LIST_PLAYWRIGHT_PORT || 4193)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, evalPage, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'claim-sheet-list',
  port: previewPort,
})

async function completeOnboarding() {
  await runPlaywrightCli(['eval', `() => {
    try {
      localStorage.setItem('strawmoneybook.ui.layout', 'modern')
    } catch {}
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

  const welcome = await evalPage(`() => Boolean(document.querySelector('.welcome-root'))`)
  if (welcome) {
    await runPlaywrightCli(['click', "button:has-text('Next'), button:has-text('下一步'), button:has-text('次へ')"])
    await delay(900)
    await runPlaywrightCli(['fill', '.welcome-root input.input', `Playwright Claim List ${Date.now()}`])
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
    if (state.hasBottomNav) return
    await delay(500)
  }
  throw new Error('onboarding failed: bottom-nav missing')
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

console.log('--- Playwright: claim sheet list visibility ---')

if (!process.env.SMB_SKIP_WEB_BUILD) {
  console.log('Building web preview bundle...')
  await execFileAsync('npm', ['run', 'build:web'], {
    cwd: frontendDir,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 600000,
  })
}

const preview = spawn(
  resolve(frontendDir, 'node_modules/.bin/vite'),
  ['preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
  { cwd: frontendDir, stdio: 'ignore' },
)
await waitForPreviewReady()
await ensurePlaywrightChromium()

try {
  await runPlaywrightCli(['open', `${baseUrl}/`], { raw: true })
  await completeOnboarding()
  await runPlaywrightCli(['goto', `${baseUrl}/claim-sheets`])
  await delay(1200)

  const state = await evalPage(`() => {
    const root = document.querySelector('[data-testid=claim-sheet-list-view]')
    const stack = root?.querySelector('.habitat-stack')
  const sections = stack
      ? [...stack.children].map((el) => ({
          opacity: getComputedStyle(el).opacity,
          height: el.getBoundingClientRect().height,
        }))
      : []
    return {
      path: location.pathname + location.hash,
      hasRoot: Boolean(root),
      hasCreate: Boolean(document.querySelector('[data-testid=claim-create-open]')),
      hasList: Boolean(document.querySelector('[data-testid=claim-sheet-list]')),
      rootOpacity: root ? getComputedStyle(root).opacity : null,
      sections,
      title: document.querySelector('.habitat-page-title')?.textContent?.trim() ?? '',
    }
  }`)

  assert.equal(state.hasRoot, true, JSON.stringify(state))
  assert.equal(state.hasCreate, true, JSON.stringify(state))
  assert.equal(state.hasList, true, JSON.stringify(state))
  assert.ok(Number(state.rootOpacity) >= 0.99, JSON.stringify(state))
  assert.ok(
    state.sections.every((section) => Number(section.opacity) >= 0.99 && Number(section.height) > 0),
    JSON.stringify(state),
  )
  console.log('PASS: claim sheet list page visible', state.title)
} finally {
  preview.kill('SIGTERM')
  await runPlaywrightCli(['close']).catch(() => {})
}
