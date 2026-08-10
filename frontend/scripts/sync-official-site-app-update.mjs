/**
 * smb298: After gpr bumps local app-update.json, also sync StrawMoneyBookWeb
 * public manifests so www.strawmb.com / Web-Page cannot lag behind (was stuck at 1.3.59).
 *
 * Usage:
 *   node scripts/sync-official-site-app-update.mjs
 *   node scripts/sync-official-site-app-update.mjs --commit-push
 *   STRAWMB_WEB_REPO=/path node scripts/sync-official-site-app-update.mjs --commit-push
 *
 * --commit-push: commit + push web repo main (triggers GH Actions → Web-Page Pages).
 * Without it, only writes files (contract tests / dry runs).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')

const args = new Set(process.argv.slice(2))
const commitPush = args.has('--commit-push')
const dryRun = args.has('--dry-run')

function resolveWebRepoRoot() {
  const fromEnv = String(process.env.STRAWMB_WEB_REPO || '').trim()
  if (fromEnv) return resolve(fromEnv)
  return resolve(REPO_ROOT, '..', 'StrawMoneyBookWeb')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function runGit(webRoot, gitArgs, { allowFailure = false } = {}) {
  const result = spawnSync('git', gitArgs, {
    cwd: webRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (allowFailure) return result
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(detail || `git ${gitArgs.join(' ')} failed`)
  }
  return result
}

export function buildOfficialSiteAppUpdatePayloads(latestVersion, existingManifest = {}, existingPlay = {}) {
  const version = String(latestVersion ?? '').trim()
  if (!version) throw new Error('latestVersion is required')

  const playUrl = String(existingManifest?.playUrl ?? existingPlay?.playUrl ?? '').trim()
    || 'https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook'
  const message = String(existingManifest?.message ?? existingPlay?.message ?? '').trim()
  const appId = String(existingPlay?.appId ?? 'com.strawcoding.strawmoneybook').trim()
    || 'com.strawcoding.strawmoneybook'

  const manifest = {
    latestVersion: version,
    playUrl,
    message,
  }
  const playApi = {
    appId,
    latestVersion: version,
    version,
    playUrl,
    source: String(existingPlay?.source ?? 'official_site_static').trim() || 'official_site_static',
    message,
  }
  return { manifest, playApi }
}

export function syncOfficialSiteAppUpdateFiles({
  frontendRoot = FRONTEND_ROOT,
  webRoot = resolveWebRepoRoot(),
  write = writeJson,
  read = readJson,
  exists = existsSync,
  mkdir = mkdirSync,
} = {}) {
  const packageJson = read(resolve(frontendRoot, 'package.json'))
  const latestVersion = String(packageJson?.version ?? '').trim()
  if (!latestVersion) throw new Error('frontend package.json version is required')

  const localManifestPath = resolve(frontendRoot, 'public/app-update.json')
  const localManifest = exists(localManifestPath) ? read(localManifestPath) : { latestVersion }
  if (String(localManifest.latestVersion ?? '').trim() !== latestVersion) {
    throw new Error(
      `local public/app-update.json latestVersion (${localManifest.latestVersion}) != package.json (${latestVersion}); run sync:app-update-manifest first`,
    )
  }

  if (!exists(webRoot)) {
    throw new Error(`StrawMoneyBookWeb repo not found at ${webRoot}`)
  }

  const webManifestPath = resolve(webRoot, 'public/app-update.json')
  const webPlayDir = resolve(webRoot, 'public/api/app-update')
  const webPlayPath = resolve(webPlayDir, 'play')

  const existingManifest = exists(webManifestPath) ? read(webManifestPath) : {}
  const existingPlay = exists(webPlayPath) ? read(webPlayPath) : {}
  const { manifest, playApi } = buildOfficialSiteAppUpdatePayloads(latestVersion, {
    ...existingManifest,
    ...localManifest,
  }, existingPlay)

  mkdir(webPlayDir, { recursive: true })
  write(webManifestPath, manifest)
  write(webPlayPath, playApi)

  return {
    webRoot,
    latestVersion,
    webManifestPath,
    webPlayPath,
    manifest,
    playApi,
  }
}

function main() {
  if (dryRun) {
    const packageJson = readJson(resolve(FRONTEND_ROOT, 'package.json'))
    const payloads = buildOfficialSiteAppUpdatePayloads(packageJson.version)
    console.log('[sync-official-site-app-update] dry-run', payloads)
    return
  }

  const result = syncOfficialSiteAppUpdateFiles()
  console.log(
    `[sync-official-site-app-update] wrote ${result.latestVersion} → ${result.webManifestPath} + ${result.webPlayPath}`,
  )

  if (!commitPush) return

  const webRoot = result.webRoot
  runGit(webRoot, ['checkout', 'main'], { allowFailure: true })
  runGit(webRoot, ['add', 'public/app-update.json', 'public/api/app-update/play'])
  const status = runGit(webRoot, ['status', '--porcelain', '--', 'public/app-update.json', 'public/api/app-update/play'])
  if (!String(status.stdout || '').trim()) {
    console.log('[sync-official-site-app-update] web repo already up to date; skip commit')
    return
  }

  const message = `chore: sync app-update manifest to v${result.latestVersion}`
  runGit(webRoot, ['commit', '-m', message])
  runGit(webRoot, ['push', 'origin', 'HEAD:main'])
  console.log('[sync-official-site-app-update] pushed StrawMoneyBookWeb main (Pages → Web-Page)')
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(`[sync-official-site-app-update] ${error?.message || error}`)
    process.exitCode = 1
  }
}
