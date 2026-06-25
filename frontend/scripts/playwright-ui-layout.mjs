import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execFileAsync = promisify(execFile)
const frontendDir = '/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend'
const previewPort = Number(process.env.UI_LAYOUT_PLAYWRIGHT_PORT || 4174)
const baseUrl = `http://127.0.0.1:${previewPort}`

async function runPlaywrightCli(args) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    ...args,
  ], {
    cwd: frontendDir,
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120000,
  })
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

console.log('--- Playwright: ui layout settings + modern home ---')

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

  await runPlaywrightCli(['open', `${baseUrl}/settings/personalization`])
  const personalizationSnapshot = await runPlaywrightCli(['snapshot'])
  const personalizationText = String(personalizationSnapshot.stdout ?? '')
  assert.match(personalizationText, /Interface style|介面風格|画面スタイル/u)
  assert.match(personalizationText, /Traditional|傳統|クラシック/u)
  assert.match(personalizationText, /Modern|現代|モダン/u)

  await runPlaywrightCli(['open', `${baseUrl}/`])
  const homeSnapshot = await runPlaywrightCli(['snapshot'])
  const homeText = String(homeSnapshot.stdout ?? '')
  assert.match(homeText, /StrawMoneyBook/u)
  assert.match(
    homeText,
    /Disposable balance this month|本月可支配餘額|Welcome to StrawMoneyBook|Step 1/u,
  )

  console.log('UI layout Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
