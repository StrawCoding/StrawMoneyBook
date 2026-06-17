import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function shouldInstallBrowsers() {
  const explicit = String(process.env.PLAYWRIGHT_INSTALL_BROWSERS ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(explicit)) return true
  if (['0', 'false', 'no', 'off'].includes(explicit)) return false

  const usePlaywright = String(process.env.EINVOICE_SCRAPE_USE_PLAYWRIGHT ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(usePlaywright)) return true

  return String(process.env.NODE_ENV ?? '').trim() === 'production'
}

function getBrowsersPath() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || '.server-data/playwright-browsers'
}

if (!shouldInstallBrowsers()) {
  process.exit(0)
}

const browsersPath = resolve(getBrowsersPath())
if (!existsSync(browsersPath)) {
  execSync(`mkdir -p ${JSON.stringify(browsersPath)}`, { stdio: 'inherit' })
}

execSync('npx playwright install chromium', {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
})

// Docker StrawMB runs as root; headless Chromium needs system libs (e.g. libnspr4.so).
// install-deps is safe here and only runs once per image build / container recreate.
if (process.getuid?.() === 0) {
  execSync('npx playwright install-deps chromium', {
    stdio: 'inherit',
    env: process.env,
  })
}
