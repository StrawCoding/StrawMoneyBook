import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildOfficialSiteAppUpdatePayloads,
  syncOfficialSiteAppUpdateFiles,
} from '../scripts/sync-official-site-app-update.mjs'
import { detectEmptyLedgerRestoreHint } from '../src/core/services/empty-ledger-restore-hint.service.js'

const frontendRoot = resolve(import.meta.dirname, '..')
const sqliteSource = readFileSync(resolve(frontendRoot, 'src/core/db/sqlite.js'), 'utf8')
const savingsJarSource = readFileSync(
  resolve(frontendRoot, 'src/ui/views/savings-jars/SavingsJarListPage.vue'),
  'utf8',
)
const welcomeSource = readFileSync(resolve(frontendRoot, 'src/ui/views/WelcomePage.vue'), 'utf8')
const bootstrapSource = readFileSync(
  resolve(frontendRoot, 'src/ui/services/app-bootstrap.service.js'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
const routerSource = readFileSync(resolve(frontendRoot, 'src/ui/router/index.js'), 'utf8')

test('smb298: plugin-null must not open empty recovery DB as live store', () => {
  assert.match(sqliteSource, /empty recovery fallback disabled|recovery empty-db fallback disabled/)
  assert.match(sqliteSource, /retrying primary/)
  assert.doesNotMatch(sqliteSource, /switching to recovery database/)
  assert.doesNotMatch(sqliteSource, /openRecoveryDatabase\(/)
  assert.match(sqliteSource, /PRIMARY_DB_NAME/)
  assert.match(sqliteSource, /getActiveDatabaseName/)
  assert.match(sqliteSource, /resetDatabase[\s\S]*PRIMARY_DB_NAME/)
})

test('smb298: SavingsJarListPage autoSaveAccountOptions watch is after declaration (no TDZ)', () => {
  const optionsDecl = savingsJarSource.indexOf('const autoSaveAccountOptions = computed')
  const watchOnOptions = savingsJarSource.indexOf('() => autoSaveAccountOptions.value')
  assert.ok(optionsDecl > 0, 'autoSaveAccountOptions must be declared')
  assert.ok(watchOnOptions > 0, 'watch getter on autoSaveAccountOptions must exist')
  assert.ok(
    watchOnOptions > optionsDecl,
    'watch on autoSaveAccountOptions must be after const declaration (TDZ fix)',
  )
  assert.match(savingsJarSource, /smb298:[\s\S]*TDZ|Cannot access 'autoSaveAccountOptions'/)
})

test('smb298: empty ledger restore hint prompts only when empty + recovery exists', async () => {
  const prompted = await detectEmptyLedgerRestoreHint({
    hasLedgers: false,
    hasAccounts: false,
    listRecovery: async () => [{ backupId: 'a', byteLength: 10 }],
  })
  assert.equal(prompted.shouldPrompt, true)
  assert.equal(prompted.recoveryCount, 1)

  const quiet = await detectEmptyLedgerRestoreHint({
    hasLedgers: true,
    hasAccounts: true,
    listRecovery: async () => [{ backupId: 'a', byteLength: 10 }],
  })
  assert.equal(quiet.shouldPrompt, false)

  const noBackup = await detectEmptyLedgerRestoreHint({
    hasLedgers: false,
    hasAccounts: false,
    listRecovery: async () => [],
  })
  assert.equal(noBackup.shouldPrompt, false)
})

test('smb298: bootstrap emits empty-ledger restore hint; Welcome exposes local recovery CTA', () => {
  assert.match(bootstrapSource, /detectEmptyLedgerRestoreHint/)
  assert.match(bootstrapSource, /emitEmptyLedgerRestoreHint/)
  assert.match(welcomeSource, /welcome-empty-restore-hint/)
  assert.match(welcomeSource, /welcome\.local_recovery_action/)
  assert.match(welcomeSource, /to="\/settings\/data-management"/)
})

test('smb298: data-management allowWithoutSetup for local recovery from Welcome', () => {
  const dataMgmtBlock = routerSource.match(/name: 'settings-data-management'[\s\S]*?\},/)?.[0]
  assert.ok(dataMgmtBlock)
  assert.match(dataMgmtBlock, /allowWithoutSetup:\s*true/)
})

test('smb298: gpr chain syncs official site app-update after local manifest', () => {
  assert.equal(
    packageJson.scripts['sync:official-site-app-update'],
    'node scripts/sync-official-site-app-update.mjs',
  )
  assert.equal(
    packageJson.scripts['sync:official-site-app-update:push'],
    'node scripts/sync-official-site-app-update.mjs --commit-push',
  )
  assert.match(
    packageJson.scripts.gpr,
    /sync:app-update-manifest && npm run sync:official-site-app-update:push && npm run release:git/,
  )
  assert.match(
    packageJson.scripts['gpr:minor'],
    /sync:app-update-manifest && npm run sync:official-site-app-update:push && npm run release:git/,
  )
})

test('smb298: official site app-update payload keeps manifest + play API aligned', () => {
  const { manifest, playApi } = buildOfficialSiteAppUpdatePayloads('1.3.99', {
    playUrl: 'https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook',
    message: '',
  }, {
    appId: 'com.strawcoding.strawmoneybook',
    source: 'official_site_static',
  })
  assert.equal(manifest.latestVersion, '1.3.99')
  assert.equal(playApi.latestVersion, '1.3.99')
  assert.equal(playApi.version, '1.3.99')
  assert.equal(playApi.appId, 'com.strawcoding.strawmoneybook')
  assert.equal(playApi.source, 'official_site_static')
})

test('smb298: playwright ui-layout guards parallel preview races and waits for home', () => {
  const playwrightSource = readFileSync(
    resolve(frontendRoot, 'scripts/playwright-ui-layout.mjs'),
    'utf8',
  )
  assert.match(playwrightSource, /acquireUiLayoutMutex/)
  assert.match(playwrightSource, /assertPreviewPortFree/)
  assert.match(playwrightSource, /waitForHomeBlocks/)
  assert.match(playwrightSource, /playwrightCliSession|PLAYWRIGHT_CLI_SESSION|smb-ui-layout-/)
  assert.match(playwrightSource, /gotoOrReopen/)
  assert.match(playwrightSource, /Refusing parallel runs|refusing to attach to a foreign/)
  assert.match(playwrightSource, /strictPort race|leftover process/)
  // assertDelete must wait for home shell, not only fixed delay.
  assert.match(
    playwrightSource,
    /async function assertDeleteTransactionReturnsHomeWithScroll\(\)[\s\S]*?await assertHomeBlocks\(\)/,
  )
})

test('smb298: syncOfficialSiteAppUpdateFiles writes web public manifests', () => {
  const writes = new Map()
  const files = new Map([
    [
      resolve(frontendRoot, 'package.json'),
      JSON.stringify({ version: '9.9.9' }),
    ],
    [
      resolve(frontendRoot, 'public/app-update.json'),
      JSON.stringify({
        latestVersion: '9.9.9',
        playUrl: 'https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook',
        message: '',
      }),
    ],
  ])

  const result = syncOfficialSiteAppUpdateFiles({
    frontendRoot,
    webRoot: '/tmp/smb298-web-fake',
    exists: (path) => files.has(path) || path === '/tmp/smb298-web-fake',
    read: (path) => JSON.parse(files.get(path)),
    mkdir: () => {},
    write: (path, value) => {
      writes.set(path, value)
      files.set(path, JSON.stringify(value))
    },
  })

  assert.equal(result.latestVersion, '9.9.9')
  assert.equal(writes.get('/tmp/smb298-web-fake/public/app-update.json').latestVersion, '9.9.9')
  assert.equal(writes.get('/tmp/smb298-web-fake/public/api/app-update/play').version, '9.9.9')
  assert.equal(writes.get('/tmp/smb298-web-fake/public/api/app-update/play').latestVersion, '9.9.9')
})
