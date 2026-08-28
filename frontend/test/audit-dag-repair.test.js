import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  refundDeductedMinorSql,
  refundMatchPredicateSql,
  refundRelationExistsSql,
  refundedSourceExclusionSql,
} from '../src/core/domain/refund-match-sql.js'

test('refund SQL fragments share a single match predicate', () => {
  const predicate = refundMatchPredicateSql('rt', 'rc')
  assert.match(predicate, /rt\.origin_type = 'refund'/)
  assert.match(predicate, /rc\.name = '退款'/)
  assert.match(refundRelationExistsSql('t'), /external_ref_id = t\.id/)
  assert.match(refundDeductedMinorSql('t'), /SUM\(ABS\(rt\.amount_minor\)\)/)
  assert.equal(refundedSourceExclusionSql('transactions'), `NOT ${refundRelationExistsSql('transactions')}`)
})

test('oauth client guard fails closed in production and ledger purge uses a transaction', () => {
  const googleExchange = readFileSync(
    resolve(import.meta.dirname, '../api/google/oauth/exchange.js'),
    'utf8',
  )
  assert.match(googleExchange, /missing_google_oauth_client_shared_key/)
  assert.match(googleExchange, /if \(isProductionRuntime\(\)\) return true/)

  const googleRefresh = readFileSync(
    resolve(import.meta.dirname, '../api/google/oauth/refresh.js'),
    'utf8',
  )
  assert.match(googleRefresh, /missing_google_oauth_client_shared_key/)
  assert.doesNotMatch(googleRefresh, /Access-Control-Allow-Origin', '\*'/)

  const ledgerRepo = readFileSync(
    resolve(import.meta.dirname, '../src/core/repositories/ledger.repo.js'),
    'utf8',
  )
  assert.match(ledgerRepo, /await withTransaction\(async \(\) => \{[\s\S]*DELETE FROM \$\{table\} WHERE ledger_id/)

  const creditRepo = readFileSync(
    resolve(import.meta.dirname, '../src/core/repositories/credit.repo.js'),
    'utf8',
  )
  assert.match(creditRepo, /INNER JOIN transactions t/)
  assert.match(creditRepo, /t\.deleted_at IS NULL/)

  const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')
  assert.match(ci, /playwright-ui-layout:/)
  assert.match(ci, /npm run playwright:ui-layout/)
  assert.match(ci, /playwright-budget-save:/)
  assert.match(ci, /npm run playwright:budget-save/)
  assert.match(ci, /playwright-analysis-export:/)
  assert.match(ci, /npm run playwright:analysis-export/)
  assert.match(ci, /poppler-utils/)
  assert.match(ci, /python3-pil/)
  assert.match(ci, /playwright-carrier-sync:/)
  assert.match(ci, /npm run playwright:carrier-sync/)
  assert.match(ci, /playwright-budget-cross-month:/)
  assert.match(ci, /npm run playwright:budget-cross-month/)
  assert.match(ci, /playwright-budget-pay-cycle:/)
  assert.match(ci, /npm run playwright:budget-pay-cycle/)
  const prepareIdx = ci.indexOf('npm run prepare:android:release')
  const gradleIdx = ci.indexOf(':app:testDebugUnitTest')
  assert.ok(prepareIdx >= 0 && gradleIdx > prepareIdx, 'cap sync must run before Gradle unit tests')

  const executor = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migration-executor.js'),
    'utf8',
  )
  assert.match(executor, /function isPluginConnection/)
  assert.match(executor, /async function executePluginStatements/)
  assert.match(executor, /async function executeSqlJsStatements/)
  const pluginFn = executor.slice(
    executor.indexOf('async function executePluginStatements'),
    executor.indexOf('async function executeSqlJsStatements'),
  )
  assert.match(pluginFn, /await db\.executeSet\(\[item\]\)/)
  assert.doesNotMatch(pluginFn, /executeRaw\(/)
  assert.doesNotMatch(pluginFn, /SAVEPOINT \$\{/)

  const uiLayout = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-ui-layout.mjs'),
    'utf8',
  )
  assert.match(uiLayout, /fileURLToPath\(new URL\('\.\.', import\.meta\.url\)\)/)
  assert.doesNotMatch(uiLayout, /frontendDir = '\/mnt\/data/)

  const playwrightRuntime = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-cli-runtime.mjs'),
    'utf8',
  )
  assert.match(playwrightRuntime, /export async function ensurePlaywrightChromium/)
  assert.match(playwrightRuntime, /install-browser', 'chromium'/)
  assert.match(playwrightRuntime, /--session/)
  for (const script of [
    'playwright-budget-save.mjs',
    'playwright-analysis-export.mjs',
    'playwright-carrier-sync-settings.mjs',
    'playwright-budget-cross-month.mjs',
    'playwright-budget-pay-cycle.mjs',
  ]) {
    const source = readFileSync(resolve(import.meta.dirname, '../scripts', script), 'utf8')
    assert.match(source, /playwright-cli-runtime\.mjs/)
    assert.match(source, /ensurePlaywrightChromium/)
  }
  const budgetSave = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-budget-save.mjs'),
    'utf8',
  )
  assert.match(budgetSave, /button:has-text\('Next'\), button:has-text\('下一步'\), button:has-text\('次へ'\)/)
  assert.match(budgetSave, /\.footer button\.btn\.primary:has-text\('儲存'\)/)
  const carrierSync = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-carrier-sync-settings.mjs'),
    'utf8',
  )
  assert.match(carrierSync, /feature-link-carrier-sync/)
  assert.doesNotMatch(carrierSync, /missing carrier-sync settings link/)
})

test('audit DAG identity, serverless, busy_timeout and PII guards stay in source', () => {
  const sqlite = readFileSync(resolve(import.meta.dirname, '../src/core/db/sqlite.js'), 'utf8')
  assert.match(sqlite, /applyConnectionPragmas/)
  assert.match(sqlite, /db\.query\('PRAGMA foreign_keys = ON;'/)
  assert.match(sqlite, /db\.query\('PRAGMA busy_timeout = 5000;'/)
  assert.doesNotMatch(sqlite, /db\.execute\('PRAGMA busy_timeout/)

  const androidDb = readFileSync(
    resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/wear/AndroidDbRepository.java'),
    'utf8',
  )
  assert.match(androidDb, /applyConnectionPragma/)
  assert.match(androidDb, /PRAGMA busy_timeout = 5000/)
  assert.doesNotMatch(androidDb, /execSQL\("PRAGMA busy_timeout/)

  const guard = readFileSync(resolve(import.meta.dirname, '../api/_production-guard.js'), 'utf8')
  assert.match(guard, /export function rejectProductionServerless/)
  assert.match(guard, /use api\.strawmb\.com/)

  for (const relative of ['auth/[...path].js', 'shared-ledgers/[...path].js', 'referrals/[...path].js']) {
    const source = readFileSync(resolve(import.meta.dirname, '../api', relative), 'utf8')
    assert.match(source, /rejectProductionServerless/)
  }

  const errorLog = readFileSync(resolve(import.meta.dirname, '../src/ui/services/error-log.service.js'), 'utf8')
  assert.match(errorLog, /smb\.error_log\.upload_queue/)
  assert.match(errorLog, /longtask/)
  assert.match(errorLog, /\[redacted-email\]/)

  const transactionStore = readFileSync(resolve(import.meta.dirname, '../src/ui/stores/transaction.store.js'), 'utf8')
  assert.match(transactionStore, /transaction\.refresh_timeout/)
  assert.match(transactionStore, /transaction\.refresh_failed/)
})
