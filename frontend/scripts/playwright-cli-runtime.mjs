import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(frontendDir, '..')
export const defaultPlaywrightBrowsersPath = resolve(repoRoot, 'backend/.server-data/playwright-browsers')
export const defaultPlaywrightConfigPath = resolve(frontendDir, 'playwright-cli.json')

export function resolvePlaywrightBrowsersPath() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || defaultPlaywrightBrowsersPath
}

export function resolvePlaywrightSession(label, port) {
  return process.env.PLAYWRIGHT_CLI_SESSION
    || `smb-${String(label || 'e2e').trim()}-${Number(port) || 0}-${process.pid}`
}

export function hasInstalledChromiumHeadlessShell(root = resolvePlaywrightBrowsersPath()) {
  try {
    return readdirSync(root).some((name) => {
      if (!name.startsWith('chromium_headless_shell-')) return false
      return existsSync(join(root, name, 'chrome-headless-shell-linux64', 'chrome-headless-shell'))
    })
  } catch {
    return false
  }
}

export async function ensurePlaywrightChromium(root = resolvePlaywrightBrowsersPath()) {
  if (hasInstalledChromiumHeadlessShell(root)) return
  console.log(`Playwright chromium missing under ${root}; installing...`)
  await execFileAsync(
    'npx',
    ['--yes', '--package', '@playwright/cli', 'playwright-cli', 'install-browser', 'chromium'],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: root,
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 600000,
    },
  )
  assert.equal(
    hasInstalledChromiumHeadlessShell(root),
    true,
    `chromium headless shell still missing after install under ${root}`,
  )
}

export function createPlaywrightCliRunner({
  label,
  port,
  configPath = process.env.PLAYWRIGHT_MCP_CONFIG || defaultPlaywrightConfigPath,
  extraEnv = {},
  maxBuffer = 4 * 1024 * 1024,
} = {}) {
  const browsersPath = resolvePlaywrightBrowsersPath()
  const session = resolvePlaywrightSession(label, port)

  async function runPlaywrightCli(args, { raw = false, timeout = 180000 } = {}) {
    const cliArgs = [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      '--session',
      session,
      ...(raw ? ['--raw'] : []),
      ...args,
    ]
    return execFileAsync('npx', cliArgs, {
      cwd: frontendDir,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        PLAYWRIGHT_MCP_CONFIG: configPath,
        PLAYWRIGHT_CLI_SESSION: session,
        ...extraEnv,
      },
      maxBuffer,
      timeout,
    })
  }

  return {
    browsersPath,
    session,
    runPlaywrightCli,
    ensurePlaywrightChromium: () => ensurePlaywrightChromium(browsersPath),
  }
}
