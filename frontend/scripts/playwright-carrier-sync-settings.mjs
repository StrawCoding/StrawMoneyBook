import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const backendRoot = resolve(repoRoot, 'backend')
const defaultBrowsersPath = resolve(backendRoot, '.server-data/playwright-browsers')
const playwrightConfigPath = resolve(backendRoot, 'playwright-cli.json')

async function runPlaywrightCli(args) {
  return execFileAsync('npx', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    ...args,
  ], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersPath,
      PLAYWRIGHT_MCP_CONFIG: process.env.PLAYWRIGHT_MCP_CONFIG || playwrightConfigPath,
    },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120000,
  })
}

const baseUrl = process.env.CARRIER_SYNC_PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173/settings/carrier-sync'

console.log('--- Playwright: carrier sync settings page ---')
await runPlaywrightCli(['open', baseUrl])
const snapshot = await runPlaywrightCli(['snapshot'])
const snapshotText = String(snapshot.stdout ?? '')
assert.ok(snapshotText.length > 0, 'expected playwright snapshot output')
assert.match(snapshotText, /StrawMoneyBook|載具|Carrier|settings|設定/u)
console.log('Carrier sync Playwright smoke passed')
