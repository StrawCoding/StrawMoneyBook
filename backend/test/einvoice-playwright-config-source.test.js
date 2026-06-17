import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const playwrightConfig = JSON.parse(readFileSync(resolve(repoRoot, 'playwright-cli.json'), 'utf8'))
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const providerSource = readFileSync(resolve(repoRoot, 'src/einvoice/playwright-provider.js'), 'utf8')
const ensureBrowsersSource = readFileSync(resolve(repoRoot, 'scripts/ensure-playwright-browsers.mjs'), 'utf8')

test('SMB-245: playwright-cli.json uses bundled chromium instead of system chrome', () => {
  assert.equal(playwrightConfig.browser?.browserName, 'chromium')
  assert.equal(playwrightConfig.browser?.launchOptions?.chromiumSandbox, false)
  assert.equal(playwrightConfig.browser?.launchOptions?.headless, true)
  assert.equal(playwrightConfig.browser?.launchOptions?.channel, undefined)
})

test('SMB-245: backend pins @playwright/cli and installs chromium on deploy', () => {
  assert.ok(packageJson.dependencies?.['@playwright/cli'])
  assert.match(packageJson.scripts['deploy:copy'], /PLAYWRIGHT_INSTALL_BROWSERS=1/)
  assert.match(packageJson.scripts['deploy:copy'], /PLAYWRIGHT_BROWSERS_PATH=\.server-data\/playwright-browsers/)
  assert.match(packageJson.scripts['deploy:copy'], /npm install/)
  assert.equal(packageJson.scripts['playwright:install-browsers'], 'PLAYWRIGHT_INSTALL_BROWSERS=1 node scripts/ensure-playwright-browsers.mjs')
})

test('SMB-245: playwright provider uses local cli and persistent browser path', () => {
  assert.doesNotMatch(providerSource, /--package', '@playwright\/cli'/)
  assert.match(providerSource, /npx', \['playwright-cli'/)
  assert.match(providerSource, /PLAYWRIGHT_BROWSERS_PATH/)
  assert.match(providerSource, /\.server-data\/playwright-browsers/)
})

test('SMB-245: ensure-playwright-browsers only installs when production or explicitly enabled', () => {
  assert.match(ensureBrowsersSource, /EINVOICE_SCRAPE_USE_PLAYWRIGHT/)
  assert.match(ensureBrowsersSource, /PLAYWRIGHT_INSTALL_BROWSERS/)
  assert.match(ensureBrowsersSource, /npx playwright install chromium/)
  assert.match(ensureBrowsersSource, /PLAYWRIGHT_BROWSERS_PATH/)
})

test('SMB-245: ensure-playwright-browsers installs system deps as root only', () => {
  assert.match(ensureBrowsersSource, /process\.getuid\?\.\(\) === 0/)
  assert.match(ensureBrowsersSource, /npx playwright install-deps chromium/)
})
