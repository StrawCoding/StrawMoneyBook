import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertSellQuantityAllowed,
  buildSecurityPosition,
  summarizeSecurityTransactions,
  sumIncludedSecuritiesMarketValue,
} from '../src/core/utils/securities-position.js'
import {
  addTradingDays,
  defaultSettleAt,
  deriveSettlementCashLegs,
  describeSettlementPosting,
  isSettlementDue,
  isWeekend,
} from '../src/core/utils/securities-settlement.js'

const root = resolve(import.meta.dirname, '..')

test('T+2 settle_at skips weekends and lands at 10:00', () => {
  // Friday 2026-08-07 -> Mon+Tue = Tue 2026-08-11 10:00
  const friday = new Date(2026, 7, 7, 14, 30, 0)
  const settle = defaultSettleAt(friday)
  assert.equal(settle.getFullYear(), 2026)
  assert.equal(settle.getMonth(), 7)
  assert.equal(settle.getDate(), 11)
  assert.equal(settle.getHours(), 10)
  assert.equal(settle.getMinutes(), 0)
  assert.equal(isWeekend(settle), false)

  // Thursday -> Mon
  const thu = new Date(2026, 7, 6, 9, 0, 0)
  const settleThu = defaultSettleAt(thu)
  assert.equal(settleThu.getDate(), 10)
  assert.equal(settleThu.getDay(), 1)

  const one = addTradingDays(new Date(2026, 7, 7, 12, 0, 0), 1)
  assert.equal(one.getDate(), 10) // Fri +1 trading = Mon
})

test('authority cash legs 300→320 / 300→280', () => {
  const buy = deriveSettlementCashLegs({
    type: 'buy',
    recordMode: 'funds',
    principalMinor: 30000,
  })
  assert.equal(buy.principalMinor, 30000)
  assert.equal(buy.cashOutMinor, 30000)
  const buyPost = describeSettlementPosting(buy)
  assert.equal(buyPost.principalAdjustmentMinor, -30000)
  assert.equal(buyPost.pnlAmountMinor, 0)

  const profit = deriveSettlementCashLegs({
    type: 'sell',
    recordMode: 'funds',
    principalMinor: 30000,
    proceedsMinor: 32000,
  })
  assert.equal(profit.pnlMinor, 2000)
  const profitPost = describeSettlementPosting(profit)
  assert.equal(profitPost.principalAdjustmentMinor, 30000)
  assert.equal(profitPost.pnlType, 'income')
  assert.equal(profitPost.pnlAmountMinor, 2000)
  assert.equal(profitPost.netCashInMinor, 32000)

  const loss = deriveSettlementCashLegs({
    type: 'sell',
    recordMode: 'funds',
    principalMinor: 30000,
    proceedsMinor: 28000,
  })
  assert.equal(loss.pnlMinor, -2000)
  const lossPost = describeSettlementPosting(loss)
  assert.equal(lossPost.principalAdjustmentMinor, 30000)
  assert.equal(lossPost.pnlType, 'expense')
  assert.equal(lossPost.pnlAmountMinor, 2000)
  assert.equal(lossPost.netCashInMinor, 28000)
})

test('portfolio isolation: same symbol different settlement accounts stay separate', () => {
  const txsA = [
    { type: 'buy', quantity: 10, price_minor: 10000, fee_minor: 0, principal_minor: 100000, settlement_status: 'confirmed', record_mode: 'position' },
  ]
  const txsB = [
    { type: 'buy', quantity: 3, price_minor: 20000, fee_minor: 0, principal_minor: 60000, settlement_status: 'confirmed', record_mode: 'position' },
  ]
  const posA = buildSecurityPosition(
    { id: 'sA', settlement_account_id: 'acc1', include_in_assets: 1, manual_price_minor: 11000 },
    txsA,
  )
  const posB = buildSecurityPosition(
    { id: 'sB', settlement_account_id: 'acc2', include_in_assets: 1, manual_price_minor: 21000 },
    txsB,
  )
  assert.equal(posA.quantity, 10)
  assert.equal(posA.investedMinor, 100000)
  assert.equal(posB.quantity, 3)
  assert.equal(posB.investedMinor, 60000)
  assert.notEqual(posA.settlementAccountId, posB.settlementAccountId)
})

test('scheduled rows do not affect holdings until confirmed', () => {
  const summary = summarizeSecurityTransactions([
    { type: 'buy', quantity: 5, price_minor: 1000, fee_minor: 0, principal_minor: 5000, settlement_status: 'scheduled', record_mode: 'position' },
    { type: 'buy', quantity: 2, price_minor: 1000, fee_minor: 0, principal_minor: 2000, settlement_status: 'confirmed', record_mode: 'position' },
  ])
  assert.equal(summary.quantity, 2)
  assert.equal(summary.investedMinor, 2000)
})

test('unrealized cost mode uses invested for included assets', () => {
  const positions = [
    { includeInAssets: true, marketValueMinor: 9000, investedMinor: 5000, displayValueMinor: 5000 },
  ]
  assert.equal(sumIncludedSecuritiesMarketValue(positions, { unrealizedMode: 'cost' }), 5000)
  assert.equal(sumIncludedSecuritiesMarketValue(positions, { unrealizedMode: 'market' }), 9000)
})

test('funds mode sell skips quantity assert; position mode still enforces', () => {
  assert.doesNotThrow(() => assertSellQuantityAllowed(0, 0, { recordMode: 'funds' }))
  assert.throws(() => assertSellQuantityAllowed(1, 2, { recordMode: 'position' }), /不可超過/)
})

test('isSettlementDue compares settle_at with now', () => {
  const past = new Date(2020, 0, 1, 10, 0, 0)
  const future = new Date(2099, 0, 1, 10, 0, 0)
  assert.equal(isSettlementDue(past, new Date(2026, 7, 12)), true)
  assert.equal(isSettlementDue(future, new Date(2026, 7, 12)), false)
})

test('migration 042 and wiring present', () => {
  const migrate = readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8')
  const sql = readFileSync(resolve(root, 'src/core/db/migrations/042_securities_settlement_v2.sql'), 'utf8')
  const service = readFileSync(resolve(root, 'src/core/services/security.service.js'), 'utf8')
  const settlement = readFileSync(resolve(root, 'src/core/utils/securities-settlement.js'), 'utf8')
  const schema = readFileSync(resolve(root, 'src/core/services/backup-json-import-schema.js'), 'utf8')
  const runtime = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
  const listPage = readFileSync(resolve(root, 'src/ui/views/securities/SecuritiesListPage.vue'), 'utf8')
  const detailPage = readFileSync(resolve(root, 'src/ui/views/securities/SecurityDetailPage.vue'), 'utf8')
  const i18n = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')

  assert.match(migrate, /042_securities_settlement_v2/)
  assert.match(migrate, /version: 42/)
  assert.match(sql, /settlement_account_id/)
  assert.match(sql, /settlement_status/)
  assert.match(sql, /is_settlement/)
  assert.match(sql, /system_key/)
  assert.match(sql, /Legacy MVP|legacy MVP|MVP never wrote cash|cash_\*_tx_id NULL/i)
  assert.match(service, /runDueSecuritySettlements/)
  assert.match(service, /confirmSecuritySettlement/)
  assert.match(service, /ensureInvestmentPnlCategory/)
  assert.match(settlement, /defaultSettleAt/)
  assert.match(schema, /settlement_status/)
  assert.match(schema, /is_settlement/)
  assert.match(schema, /system_key/)
  assert.match(runtime, /runSecuritySettlementsInBackground/)
  assert.match(listPage, /securities-unrealized-mode/)
  assert.match(listPage, /safe-area-inset-bottom/)
  assert.match(detailPage, /confirm_early/)
  assert.match(detailPage, /record_mode/)
  assert.match(detailPage, /securities-edit-symbol/)
  assert.match(detailPage, /securities-edit-name/)
  assert.match(detailPage, /profileForm\.assetClass|assetClass:/)
  assert.match(i18n, /'securities_page.settle_at':/)
  assert.equal((i18n.match(/'securities_page.settle_at':/g) || []).length, 3)
  assert.equal((i18n.match(/'account.is_settlement_label':/g) || []).length, 3)

  const sqlite = readFileSync(resolve(root, 'src/core/db/sqlite.js'), 'utf8')
  assert.match(sqlite, /beginTransaction/)
  assert.match(sqlite, /rollbackTransaction/)
  assert.match(service, /buildConfirmSettlementPlan/)
})
