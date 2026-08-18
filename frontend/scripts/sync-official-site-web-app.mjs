/**
 * Publish the StrawMB web test SPA to StrawMoneyBookWeb `public/app/`
 * so https://www.strawmb.com/app/ talks to the live ops API (api.strawmb.com).
 *
 * GitHub Pages nested SPA uses hash routing (`VITE_WEB_HASH_ROUTER=true`, base `/app/`).
 *
 * Usage:
 *   node scripts/sync-official-site-web-app.mjs
 *   node scripts/sync-official-site-web-app.mjs --build
 *   node scripts/sync-official-site-web-app.mjs --build --commit-push
 */

import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')
const HOSTED_WEB_PUBLIC_PATH = 'app'
const HOSTED_WEB_PUBLIC_URL = 'https://www.strawmb.com/app/'
const HOSTED_WEB_API_BASE = 'https://api.strawmb.com'
const HOSTED_WEB_DIST_DIRNAME = 'dist-hosted-web'

const args = new Set(process.argv.slice(2))
const commitPush = args.has('--commit-push')
const shouldBuild = args.has('--build')
const dryRun = args.has('--dry-run')

function resolveWebRepoRoot() {
  const fromEnv = String(process.env.STRAWMB_WEB_REPO || '').trim()
  if (fromEnv) return resolve(fromEnv)
  return resolve(REPO_ROOT, '..', 'StrawMoneyBookWeb')
}

function run(command, commandArgs, { cwd, allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })
  if (allowFailure) return result
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(detail || `${command} ${commandArgs.join(' ')} failed`)
  }
  return result
}

export function getHostedWebAppPublicUrl() {
  return HOSTED_WEB_PUBLIC_URL
}

export function getHostedWebApiBase() {
  return HOSTED_WEB_API_BASE
}

export function getHostedWebDistRoot(frontendRoot = FRONTEND_ROOT) {
  return resolve(frontendRoot, HOSTED_WEB_DIST_DIRNAME)
}

export function assertHostedWebDist(distRoot) {
  const indexPath = resolve(distRoot, 'index.html')
  if (!existsSync(indexPath)) {
    throw new Error(`hosted web dist missing index.html at ${indexPath}; run with --build`)
  }
  const indexHtml = readFileSync(indexPath, 'utf8')
  if (!indexHtml.includes('/app/assets/') && !indexHtml.includes('src="/app/')) {
    throw new Error('hosted web dist index.html is not built with base /app/')
  }
  if (!indexHtml.includes(HOSTED_WEB_API_BASE.replace('https://', ''))) {
    throw new Error(`hosted web dist CSP/connect-src must allow ${HOSTED_WEB_API_BASE}`)
  }
  if (!indexHtml.includes('accounts.google.com')) {
    throw new Error('hosted web dist CSP must allow Google Identity script/frame origins')
  }
  return indexPath
}

export function syncOfficialSiteWebAppFiles({
  frontendRoot = FRONTEND_ROOT,
  webRoot = resolveWebRepoRoot(),
  distRoot = getHostedWebDistRoot(frontendRoot),
} = {}) {
  const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
  const latestVersion = String(packageJson?.version ?? '').trim()
  if (!latestVersion) throw new Error('frontend package.json version is required')
  if (!existsSync(webRoot)) {
    throw new Error(`StrawMoneyBookWeb repo not found at ${webRoot}`)
  }

  assertHostedWebDist(distRoot)

  const targetRoot = resolve(webRoot, 'public', HOSTED_WEB_PUBLIC_PATH)
  rmSync(targetRoot, { recursive: true, force: true })
  mkdirSync(targetRoot, { recursive: true })
  cpSync(distRoot, targetRoot, { recursive: true })
  writeFileSync(resolve(targetRoot, '.nojekyll'), '')
  writeFileSync(
    resolve(targetRoot, 'web-test.json'),
    `${JSON.stringify({
      version: latestVersion,
      apiBase: HOSTED_WEB_API_BASE,
      publicUrl: HOSTED_WEB_PUBLIC_URL,
      hashRouter: true,
      generatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  )

  return {
    webRoot,
    latestVersion,
    targetRoot,
    publicUrl: HOSTED_WEB_PUBLIC_URL,
    apiBase: HOSTED_WEB_API_BASE,
  }
}

function buildHostedWebDist() {
  process.env.VITE_WEB_HASH_ROUTER = 'true'
  const distRoot = getHostedWebDistRoot()
  const result = run('npx', [
    'vite',
    'build',
    '--base',
    '/app/',
    '--outDir',
    distRoot,
    '--emptyOutDir',
  ], {
    cwd: FRONTEND_ROOT,
    allowFailure: true,
  })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(detail || 'vite build --base /app/ --outDir dist-hosted-web failed')
  }
}

function main() {
  if (dryRun) {
    console.log('[sync-official-site-web-app] dry-run', {
      publicUrl: HOSTED_WEB_PUBLIC_URL,
      webRoot: resolveWebRepoRoot(),
    })
    return
  }

  if (shouldBuild) {
    process.env.VITE_WEB_HASH_ROUTER = 'true'
    console.log('[sync-official-site-web-app] building hosted web dist (hash router, base /app/)')
    buildHostedWebDist()
  }

  const result = syncOfficialSiteWebAppFiles()
  console.log(
    `[sync-official-site-web-app] copied v${result.latestVersion} → ${result.targetRoot} (${result.publicUrl})`,
  )

  if (!commitPush) return

  const webRoot = result.webRoot
  run('git', ['checkout', 'main'], { cwd: webRoot, allowFailure: true })
  run('git', ['add', `public/${HOSTED_WEB_PUBLIC_PATH}`], { cwd: webRoot })
  const status = run('git', ['status', '--porcelain', '--', `public/${HOSTED_WEB_PUBLIC_PATH}`], { cwd: webRoot })
  if (!String(status.stdout || '').trim()) {
    console.log('[sync-official-site-web-app] web repo already up to date; skip commit')
    return
  }

  const message = `chore: publish StrawMB web test v${result.latestVersion} to /app (ops API)`
  run('git', ['commit', '-m', message], { cwd: webRoot })
  run('git', ['push', 'origin', 'HEAD:main'], { cwd: webRoot })
  console.log('[sync-official-site-web-app] pushed StrawMoneyBookWeb main (Pages → Web-Page)')
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(`[sync-official-site-web-app] ${error?.message || error}`)
    process.exitCode = 1
  }
}
