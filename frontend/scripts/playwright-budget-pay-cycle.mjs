import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

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
  const child = spawn('npx', cliArgs, {
    cwd: frontendDir,
    detached: true,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
      PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  let timeoutId
  const result = await new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
      resolve({ timedOut: true })
    }, timeout)
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timeoutId)

  if (result.timedOut) {
    throw new Error(`playwright-cli ${args.join(' ')} timed out after ${timeout}ms\n${stderr}`.trim())
  }
  if (result.code !== 0) {
    throw new Error(`playwright-cli ${args.join(' ')} exited with ${result.code ?? result.signal}\n${stderr}`.trim())
  }
  return { stdout, stderr }
}

async function snapshotText() {
  const result = await runPlaywrightCli(['snapshot'], { timeout: 60000 })
  return String(result.stdout ?? '')
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
    homeBudgetCardVue,
    budgetStore,
    budgetService,
    migrationSql,
  ] = await Promise.all([
    readFile(resolve(frontendDir, 'src/ui/views/budgeting.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/views/settings/SettingsLedgerDetailPage.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/components/home/HomeBudgetSummaryCard.vue'), 'utf8'),
    readFile(resolve(frontendDir, 'src/ui/stores/budget.store.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/core/services/budget.service.js'), 'utf8'),
    readFile(resolve(frontendDir, 'src/core/db/migrations/039_budget_pay_cycle.sql'), 'utf8'),
  ])

  assert.match(budgetingVue, /pay_cycle_budget/)
  assert.match(budgetingVue, /goPreviousPeriod/)
  assert.match(budgetingVue, /next_pay_day/)
  assert.match(settingsLedgerVue, /budgetPeriodMode/)
  assert.match(settingsLedgerVue, /budgetPayDay/)
  assert.match(homeBudgetCardVue, /budgeting\.period\.next_pay_day/)
  assert.match(budgetStore, /resolveBudgetPeriodForLedger/)
  assert.match(budgetStore, /loadCurrentPeriod/)
  assert.match(budgetService, /resolvePayCycleBudgetPeriod/)
  assert.match(budgetService, /pay:/)
  assert.match(migrationSql, /period_key/)
  assert.match(migrationSql, /budget_period_mode/)
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
  console.log('Opening app shell...')
  await runPlaywrightCli(['open', baseUrl])
  await delay(1500)
  const shellText = await snapshotText()
  assert.match(shellText, /StrawMoneyBook|Welcome|歡迎|ようこそ/)

  console.log('Verifying pay-cycle budget source contract...')
  await assertSourceContract()
  console.log('Budget pay-cycle Playwright smoke passed')
} finally {
  preview.kill('SIGTERM')
  await delay(300)
}
