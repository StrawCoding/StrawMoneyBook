import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appUpdateServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-update.service.js'),
  'utf8',
)
const appUpdateApiSource = readFileSync(
  resolve(import.meta.dirname, '../api/app-update/play.js'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
const appUpdateManifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/app-update.json'), 'utf8'))

test('SMB-270 app update manifest stays aligned with frontend package version', () => {
  assert.equal(appUpdateManifest.latestVersion, packageJson.version)
  assert.equal(
    appUpdateManifest.playUrl,
    'https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook',
  )
})

test('SMB-270 Android update check uses official primary and fallback endpoints', () => {
  assert.match(
    appUpdateServiceSource,
    /const DEFAULT_UPDATE_MANIFEST_URL = 'https:\/\/www\.strawmb\.com\/app-update\.json'/,
  )
  assert.match(
    appUpdateServiceSource,
    /const SECONDARY_UPDATE_MANIFEST_URL = 'https:\/\/cdn\.jsdelivr\.net\/gh\/StrawCoding\/StrawMoneyBookWeb@Web-Page\/app-update\.json'/,
  )
  assert.match(
    appUpdateServiceSource,
    /const DEFAULT_PLAY_VERSION_API_URL = 'https:\/\/www\.strawmb\.com\/api\/app-update\/play'/,
  )
  assert.match(
    appUpdateServiceSource,
    /const SECONDARY_PLAY_VERSION_API_URL = 'https:\/\/cdn\.jsdelivr\.net\/gh\/StrawCoding\/StrawMoneyBookWeb@Web-Page\/api\/app-update\/play'/,
  )
})

test('SMB-270 update fetch rejects HTML fallback pages instead of treating them as JSON', () => {
  assert.match(appUpdateServiceSource, /function isLikelyHtmlResponse\(text\)/)
  assert.match(appUpdateServiceSource, /api_not_deployed_html: 回應為 HTML/)
  assert.match(appUpdateServiceSource, /Play 版本 API 未部署或 URL 指到前端頁面/)
})

test('SMB-270 Play version API normalizes Google Play version payloads', () => {
  assert.match(appUpdateApiSource, /import gplay from 'google-play-scraper'/)
  assert.match(appUpdateApiSource, /const latestVersion = String\(appInfo\?\.version/)
  assert.match(appUpdateApiSource, /source: 'play_api'/)
  assert.match(appUpdateApiSource, /sendJson\(res, 200, payload\)/)
})
