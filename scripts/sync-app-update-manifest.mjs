import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workspaceRoot = process.cwd()
const packageJsonPath = resolve(workspaceRoot, 'package.json')
const capacitorConfigPath = resolve(workspaceRoot, 'capacitor.config.json')
const appUpdateManifestPath = resolve(workspaceRoot, 'public/app-update.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const capacitorConfig = JSON.parse(readFileSync(capacitorConfigPath, 'utf8'))

const latestVersion = String(packageJson?.version ?? '0.0.0').trim() || '0.0.0'
const appId = String(process.env.VITE_GOOGLE_PLAY_APP_ID ?? capacitorConfig?.appId ?? '').trim()
const computedPlayUrl = appId
  ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`
  : ''

let existingManifest = {}
try {
  existingManifest = JSON.parse(readFileSync(appUpdateManifestPath, 'utf8'))
} catch {
  existingManifest = {}
}

const payload = {
  latestVersion,
  playUrl: String(existingManifest?.playUrl ?? '').trim() || computedPlayUrl,
  message: String(existingManifest?.message ?? '').trim(),
}

writeFileSync(appUpdateManifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`[sync-app-update-manifest] latestVersion=${payload.latestVersion}`)
