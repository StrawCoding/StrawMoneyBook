import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertSellQuantityAllowed,
  buildSecurityPosition,
  summarizeSecurityTransactions,
  sumIncludedSecuritiesMarketValue,
} from '../src/core/utils/securities-position.js'
import { calculateAssetSummary } from '../src/core/utils/assets-summary.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('securities buy/sell summarize quantity and net invested', () => {
  const summary = summarizeSecurityTransactions([
    { type: 'buy', quantity: 10, price_minor: 10000, fee_minor: 50 },
    { type: 'buy', quantity: 5, price_minor: 11000, fee_minor: 20 },
    { type: 'sell', quantity: 4, price_minor: 12000, fee_minor: 30 },
  ])
  assert.equal(summary.quantity, 11)
  // invested: (10*10000+50) + (5*11000+20) - (4*12000-30) = 100050 + 55020 - 47970 = 107100
  assert.equal(summary.investedMinor, 107100)
})

test('securities sell cannot exceed holdings', () => {
  assert.throws(() => assertSellQuantityAllowed(3, 4), /不可超過/)
  assert.doesNotThrow(() => assertSellQuantityAllowed(3, 3))
})

test('security position market value uses manual price', () => {
  const position = buildSecurityPosition(
    { id: 's1', include_in_assets: 1, manual_price_minor: 50000, price_source: 'manual' },
    [{ type: 'buy', quantity: 2, price_minor: 48000, fee_minor: 0 }],
  )
  assert.equal(position.quantity, 2)
  assert.equal(position.marketValueMinor, 100000)
  assert.equal(position.investedMinor, 96000)
  assert.equal(position.deltaMinor, 4000)
})

test('included securities market value feeds asset total', () => {
  const securitiesMinor = sumIncludedSecuritiesMarketValue([
    { includeInAssets: true, marketValueMinor: 1000 },
    { includeInAssets: false, marketValueMinor: 9999 },
  ])
  assert.equal(securitiesMinor, 1000)
  const summary = calculateAssetSummary({
    balances: [{ id: 'a1', account_type: 'asset', balance_minor: 5000, include_in_assets: 1 }],
    securitiesMarketValueMinor: securitiesMinor,
  })
  assert.equal(summary.disposableMinor, 5000)
  assert.equal(summary.securitiesMarketValueMinor, 1000)
  assert.equal(summary.totalAssetMinor, 6000)
})

test('securities migration and routes are wired', () => {
  const root = resolve(import.meta.dirname, '..')
  const migrate = readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8')
  const router = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
  const exportService = readFileSync(resolve(root, 'src/core/services/export.service.js'), 'utf8')
  const deleteOrder = readFileSync(resolve(root, 'src/core/utils/sqlite-delete-order.js'), 'utf8')
  const snapshot = readFileSync(resolve(root, 'src/ui/services/shared-ledger/snapshot-merge.js'), 'utf8')
  const schema = readFileSync(resolve(root, 'src/core/services/backup-json-import-schema.js'), 'utf8')
  assert.match(migrate, /041_securities/)
  assert.match(migrate, /version: 41/)
  assert.match(router, /path: '\/assets\/securities'/)
  assert.match(router, /path: '\/assets\/securities\/:id'/)
  assert.match(exportService, /'securities'/)
  assert.match(exportService, /'security_transactions'/)
  assert.match(deleteOrder, /'security_transactions'/)
  assert.match(deleteOrder, /'securities'/)
  assert.match(snapshot, /'securities'/)
  assert.match(schema, /securities:/)
  assert.match(schema, /security_transactions:/)
  const i18n = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
  assert.match(i18n, /'securities_page\.title':/)
  assert.match(i18n, /'assets_page\.securities':/)
  assert.match(i18n, /'analysis_page\.securities_title':/)
  assert.equal((i18n.match(/'securities_page\.title':/g) || []).length, 3)
})
