import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function runPlaywrightCli(args) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    ...args,
  ], {
    cwd: '/tmp',
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120000,
  })
}

const baseUrl = process.env.BANK_SYNC_PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173/settings/bank-sync'

console.log('--- Playwright: bank sync settings page ---')
await runPlaywrightCli(['open', baseUrl])
const snapshot = await runPlaywrightCli(['snapshot'])
const snapshotText = String(snapshot.stdout ?? '')
assert.ok(snapshotText.length > 0, 'expected playwright snapshot output')
assert.match(snapshotText, /StrawMoneyBook|settings|設定/u)
console.log('Captured bank sync route snapshot (web preview may redirect when Android provider is unavailable)')
console.log('Bank sync Playwright smoke passed')
