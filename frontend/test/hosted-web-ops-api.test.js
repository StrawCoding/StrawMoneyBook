import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertHostedWebDist,
  getHostedWebApiBase,
  getHostedWebAppPublicUrl,
  getHostedWebDistRoot,
} from '../scripts/sync-official-site-web-app.mjs'

const frontendRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
const routerSource = readFileSync(resolve(frontendRoot, 'src/ui/router/index.js'), 'utf8')
const googleAuthSource = readFileSync(resolve(frontendRoot, 'src/services/einvoice/auth.js'), 'utf8')
const einvoiceApiSource = readFileSync(resolve(frontendRoot, 'src/services/einvoice/scrape-api.js'), 'utf8')
const sharedLedgerSource = readFileSync(resolve(frontendRoot, 'src/services/shared-ledger/backend.js'), 'utf8')
const bankSyncSource = readFileSync(resolve(frontendRoot, 'src/services/bank-sync/backend.js'), 'utf8')
const indexHtml = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8')
const syncScript = readFileSync(resolve(frontendRoot, 'scripts/sync-official-site-web-app.mjs'), 'utf8')

test('hosted web test SPA public URL talks to live ops API', () => {
  assert.equal(getHostedWebAppPublicUrl(), 'https://www.strawmb.com/app/')
  assert.equal(getHostedWebApiBase(), 'https://api.strawmb.com')
  assert.equal(getHostedWebDistRoot(frontendRoot), resolve(frontendRoot, 'dist-hosted-web'))
})

test('hosted web uses hash router so GitHub Pages nested SPA does not fall through to marketing 404', () => {
  assert.match(routerSource, /createWebHashHistory/)
  assert.match(routerSource, /VITE_WEB_HASH_ROUTER/)
  assert.match(routerSource, /www\.strawmb\.com\/app\//)
  assert.match(syncScript, /VITE_WEB_HASH_ROUTER = 'true'/)
  assert.match(syncScript, /--outDir/)
  assert.match(syncScript, /dist-hosted-web/)
})

test('production web prefixes Google OAuth to api.strawmb.com instead of GitHub Pages', () => {
  assert.match(googleAuthSource, /function shouldPrefixGoogleOAuthApiOrigin/)
  assert.match(googleAuthSource, /import\.meta\.env\.PROD === true/)
  assert.match(googleAuthSource, /localhost/)
  assert.match(googleAuthSource, /SMB-192/)
  assert.match(googleAuthSource, /www\.strawmb\.com\/app\//)
})

test('production web API bases default to api.strawmb.com', () => {
  assert.match(einvoiceApiSource, /PROD_DEFAULT_API_BASE = 'https:\/\/api\.strawmb\.com'/)
  assert.match(einvoiceApiSource, /if \(import\.meta\.env\.PROD\) return PROD_DEFAULT_API_BASE/)
  assert.match(sharedLedgerSource, /PROD_DEFAULT_SHARED_LEDGER_API_BASE = 'https:\/\/api\.strawmb\.com'/)
  assert.match(sharedLedgerSource, /if \(import\.meta\.env\.PROD\) return PROD_DEFAULT_SHARED_LEDGER_API_BASE/)
  assert.match(bankSyncSource, /PROD_DEFAULT_BANK_API_BASE = 'https:\/\/api\.strawmb\.com'/)
  assert.match(bankSyncSource, /function getBankApiBase\(/)
  assert.match(bankSyncSource, /if \(IMPORT_META_ENV\.PROD\) return PROD_DEFAULT_BANK_API_BASE/)
})

test('index.html CSP allows ops API and Google Identity for hosted web', () => {
  assert.match(indexHtml, /connect-src[^;]*https:\/\/api\.strawmb\.com/)
  assert.match(indexHtml, /script-src[^;]*https:\/\/accounts\.google\.com/)
  assert.match(indexHtml, /frame-src https:\/\/accounts\.google\.com/)
})

test('gpr publishes hosted web test SPA after app-update sync', () => {
  assert.equal(
    packageJson.scripts['sync:official-site-web-app'],
    'node scripts/sync-official-site-web-app.mjs',
  )
  assert.equal(
    packageJson.scripts['sync:official-site-web-app:push'],
    'node scripts/sync-official-site-web-app.mjs --build --commit-push',
  )
  assert.match(
    packageJson.scripts.gpr,
    /sync:official-site-app-update:push && npm run sync:official-site-web-app:push && npm run release:git/,
  )
  assert.match(
    packageJson.scripts['gpr:minor'],
    /sync:official-site-app-update:push && npm run sync:official-site-web-app:push && npm run release:git/,
  )
})

test('assertHostedWebDist requires nested /app/ assets, ops API CSP, and Google origins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smb-hosted-web-'))
  try {
    writeFileSync(join(dir, 'index.html'), '<html><script src="/assets/x.js"></script></html>')
    assert.throws(() => assertHostedWebDist(dir), /base \/app\//)

    writeFileSync(
      join(dir, 'index.html'),
      '<html><script src="/app/assets/x.js"></script></html>',
    )
    assert.throws(() => assertHostedWebDist(dir), /api\.strawmb\.com/)

    writeFileSync(
      join(dir, 'index.html'),
      '<html><meta http-equiv="Content-Security-Policy" content="connect-src https://api.strawmb.com"><script src="/app/assets/x.js"></script></html>',
    )
    assert.throws(() => assertHostedWebDist(dir), /Google Identity/)

    const indexPath = join(dir, 'index.html')
    writeFileSync(
      indexPath,
      '<html><meta http-equiv="Content-Security-Policy" content="script-src https://accounts.google.com; connect-src https://api.strawmb.com; frame-src https://accounts.google.com"><script src="/app/assets/x.js"></script></html>',
    )
    assert.equal(assertHostedWebDist(dir), indexPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
