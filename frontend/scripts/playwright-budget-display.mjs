import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.BUDGET_DISPLAY_PLAYWRIGHT_PORT || 4178)
const baseUrl = `http://127.0.0.1:${previewPort}`
const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'budget-display',
  port: previewPort,
})

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

async function runLogged(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: frontendDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
  await new Promise((resolveChild, rejectChild) => {
    child.on('exit', (code) => {
      if (code === 0) resolveChild()
      else rejectChild(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
    child.on('error', rejectChild)
  })
}

console.log('--- Playwright: budget display / settings split ---')
console.log('Building web preview bundle...')
await runLogged('npm', ['run', 'build:web'], { timeout: 300000 })

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: frontendDir,
  stdio: 'ignore',
  env: process.env,
})

try {
  await waitForPreviewReady()
  await ensurePlaywrightChromium()
  await runPlaywrightCli(['delete-data'], { timeout: 120000 })
  await runPlaywrightCli(['open', `${baseUrl}/budget`])
  const flow = await runPlaywrightCli([
    'run-code',
    '--filename',
    'scripts/playwright-budget-display.spec.mjs',
  ], { timeout: 300000 })
  if (flow.stdout) process.stdout.write(flow.stdout)
  if (flow.stderr) process.stderr.write(flow.stderr)
  if (/### Error/u.test(String(flow.stdout ?? '')) || /### Error/u.test(String(flow.stderr ?? ''))) {
    throw new Error('playwright budget display flow reported an error')
  }
  console.log('Budget display Playwright workflow passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
