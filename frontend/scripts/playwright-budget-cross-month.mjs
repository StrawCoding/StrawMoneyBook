import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const defaultBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
const playwrightConfigPath = resolve(fileURLToPath(new URL('../playwright-cli.json', import.meta.url)))
const previewPort = Number(process.env.BUDGET_CROSS_MONTH_PLAYWRIGHT_PORT || 4176)
const baseUrl = `http://127.0.0.1:${previewPort}`

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
  const result = await execFileAsync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      'delete-data',
    ],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        BUDGET_CROSS_MONTH_BASE_URL: baseUrl,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
        PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120000,
    },
  )
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  await execFileAsync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      'open',
      baseUrl,
    ],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        BUDGET_CROSS_MONTH_BASE_URL: baseUrl,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
        PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120000,
    },
  )

  const flow = await execFileAsync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      'run-code',
      '--filename',
      'scripts/playwright-budget-cross-month.spec.mjs',
    ],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        BUDGET_CROSS_MONTH_BASE_URL: baseUrl,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
        PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 300000,
    },
  )
  if (flow.stdout) process.stdout.write(flow.stdout)
  if (flow.stderr) process.stderr.write(flow.stderr)
  if (/### Error/u.test(String(flow.stdout ?? '')) || /### Error/u.test(String(flow.stderr ?? ''))) {
    throw new Error('playwright budget cross-month flow reported an error')
  }
  console.log('Budget cross-month Playwright flow passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
