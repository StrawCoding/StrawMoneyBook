import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
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

export function isBrowserNotOpenError(error) {
  const blob = [
    error?.message,
    error?.stdout,
    error?.stderr,
  ].map((part) => String(part ?? '')).join('\n')
  return /browser ['"]?default['"]? is not open|is not open, please run open first|run open first|Target page, context or browser has been closed/i.test(blob)
}

export function createPlaywrightCliRunner({
  label,
  port,
  configPath = process.env.PLAYWRIGHT_MCP_CONFIG || defaultPlaywrightConfigPath,
  extraEnv = {},
  maxBuffer = 4 * 1024 * 1024,
  defaultUrl = '',
} = {}) {
  const browsersPath = resolvePlaywrightBrowsersPath()
  const session = resolvePlaywrightSession(label, port)
  let lastOpenedUrl = defaultUrl

  async function runPlaywrightCliOnce(args, { raw = false, timeout = 180000 } = {}) {
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

  async function reopenLastUrl({ timeout = 180000 } = {}) {
    const reopenUrl = lastOpenedUrl || defaultUrl
    assert.ok(reopenUrl, 'playwright session closed but no lastOpenedUrl/defaultUrl to reopen')
    await runPlaywrightCliOnce(['open', reopenUrl], { raw: true, timeout })
    await delay(800)
  }

  async function runPlaywrightCli(args, { raw = false, timeout = 180000 } = {}) {
    if ((args[0] === 'goto' || args[0] === 'open') && args[1]) {
      lastOpenedUrl = String(args[1])
    }
    try {
      return await runPlaywrightCliOnce(args, { raw, timeout })
    } catch (error) {
      if (args[0] === 'open' || !isBrowserNotOpenError(error)) throw error
      await reopenLastUrl({ timeout })
      return await runPlaywrightCliOnce(args, { raw, timeout })
    }
  }

  async function gotoOrReopen(url, { timeout = 180000 } = {}) {
    lastOpenedUrl = url
    try {
      await runPlaywrightCliOnce(['goto', url], { timeout })
    } catch (error) {
      if (!isBrowserNotOpenError(error)) throw error
      await runPlaywrightCliOnce(['open', url], { raw: true, timeout })
      await delay(800)
    }
  }

  async function evalPage(script, { timeout = 180000 } = {}) {
    const runEval = () => runPlaywrightCli(['eval', script], { raw: true, timeout })
    let result
    try {
      result = await runEval()
    } catch (error) {
      if (!isBrowserNotOpenError(error)) throw error
      await reopenLastUrl({ timeout })
      result = await runEval()
    }
    const stdout = String(result.stdout ?? '').trim()
    if (!stdout) {
      throw new Error('playwright eval returned empty payload')
    }
    return JSON.parse(stdout)
  }

  return {
    browsersPath,
    session,
    lastOpenedUrl: () => lastOpenedUrl,
    setLastOpenedUrl: (url) => {
      lastOpenedUrl = String(url || '')
    },
    runPlaywrightCliOnce,
    runPlaywrightCli,
    gotoOrReopen,
    evalPage,
    ensurePlaywrightChromium: () => ensurePlaywrightChromium(browsersPath),
  }
}
