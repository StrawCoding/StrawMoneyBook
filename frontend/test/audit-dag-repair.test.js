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

test('bank client guard fails closed in production and ledger purge uses a transaction', () => {
  const bankUtils = readFileSync(resolve(import.meta.dirname, '../api/bank/_utils.js'), 'utf8')
  assert.match(bankUtils, /missing_bank_sync_client_shared_key/)
  assert.match(bankUtils, /if \(isProductionRuntime\(\)\) return true/)
  assert.doesNotMatch(bankUtils, /Access-Control-Allow-Origin', '\*'/)

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

  const uiLayout = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-ui-layout.mjs'),
    'utf8',
  )
  assert.match(uiLayout, /fileURLToPath\(new URL\('\.\.', import\.meta\.url\)\)/)
  assert.doesNotMatch(uiLayout, /frontendDir = '\/mnt\/data/)
})
