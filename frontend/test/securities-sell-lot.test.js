import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  allocateSellPrincipalFromBuy,
  assertBuyCanBeMutated,
  deriveFundsSellFromBuyLot,
  derivePositionSellFromBuyLot,
  findBuyLotOrThrow,
  listOpenBuyLots,
  remainingBuyLot,
  soldQuantityAgainstBuy,
} from '../src/core/utils/securities-sell-lot.js'

const buyA = {
  id: 'buy_a',
  security_id: 'sec1',
  type: 'buy',
  record_mode: 'position',
  quantity: 1000,
  principal_minor: 50000000,
  occurred_at: '2026-01-10T01:00:00.000Z',
  settlement_status: 'scheduled',
}
const buyB = {
  id: 'buy_b',
  security_id: 'sec1',
  type: 'buy',
  record_mode: 'position',
  quantity: 500,
  principal_minor: 30000000,
  occurred_at: '2026-01-13T01:00:00.000Z',
  settlement_status: 'confirmed',
}

test('partial then remaining sell eats leftover principal (plan example)', () => {
  const first = derivePositionSellFromBuyLot({
    buy: buyA,
    transactions: [buyA, buyB],
    sellQty: 400,
    proceedsGrossMinor: 24800000,
  })
  assert.equal(first.principalMinor, 20000000)
  assert.equal(first.proceedsMinor, 24800000)
  assert.equal(first.pnlMinor, 4800000)
  assert.equal(first.sourceBuyTxId, 'buy_a')

  const afterFirst = {
    id: 'sell_1',
    type: 'sell',
    source_buy_tx_id: 'buy_a',
    quantity: 400,
    principal_minor: first.principalMinor,
    settlement_status: 'scheduled',
  }
  const remain = remainingBuyLot(buyA, [buyA, buyB, afterFirst])
  assert.equal(remain.remainingQty, 600)
  assert.equal(remain.remainingPrincipalMinor, 30000000)

  const second = derivePositionSellFromBuyLot({
    buy: buyA,
    transactions: [buyA, buyB, afterFirst],
    sellQty: 600,
    proceedsGrossMinor: 27000000,
  })
  assert.equal(second.principalMinor, 30000000)
  assert.equal(second.pnlMinor, -3000000)

  const lots = listOpenBuyLots([buyA, buyB, afterFirst, {
    id: 'sell_2',
    type: 'sell',
    source_buy_tx_id: 'buy_a',
    quantity: 600,
    principal_minor: 30000000,
  }])
  assert.deepEqual(lots.map((lot) => lot.buyId), ['buy_b'])
  assert.equal(lots[0].remainingQty, 500)
})

test('cancelled sell does not consume remaining; newest buy listed first', () => {
  const cancelled = {
    id: 'sell_x',
    type: 'sell',
    source_buy_tx_id: 'buy_a',
    quantity: 400,
    principal_minor: 20000000,
    settlement_status: 'cancelled',
  }
  assert.equal(soldQuantityAgainstBuy([buyA, cancelled], 'buy_a'), 0)
  const lots = listOpenBuyLots([buyA, buyB, cancelled])
  assert.deepEqual(lots.map((lot) => lot.buyId), ['buy_b', 'buy_a'])
})

test('position sell rejects empty buy, oversell, and zero proceeds', () => {
  assert.throws(
    () => derivePositionSellFromBuyLot({ buy: buyA, transactions: [buyA], sellQty: 1001, proceedsGrossMinor: 1 }),
    /該筆買入剩餘/,
  )
  assert.throws(
    () => derivePositionSellFromBuyLot({ buy: buyA, transactions: [buyA], sellQty: 10, proceedsGrossMinor: 0 }),
    /成交金額/,
  )
  assert.throws(
    () => allocateSellPrincipalFromBuy({ remainingQty: 10, remainingPrincipalMinor: 100, sellQty: 0 }),
    /大於 0/,
  )
})

test('buy mutation blocked while linked sells exist', () => {
  const sell = {
    id: 'sell_1',
    type: 'sell',
    source_buy_tx_id: 'buy_a',
    quantity: 400,
    principal_minor: 20000000,
  }
  assert.throws(() => assertBuyCanBeMutated(buyA, [buyA, sell]), /先處理賣出/)
  assert.throws(() => assertBuyCanBeMutated(buyA, [buyA, sell], { nextQuantity: 399 }), /不可小於已賣出/)
  assert.doesNotThrow(() => assertBuyCanBeMutated(buyA, [buyA, sell], { nextQuantity: 400 }))
})

test('fee from proceeds reduces booked proceeds; unit price derived from gross', () => {
  const derived = derivePositionSellFromBuyLot({
    buy: buyA,
    transactions: [buyA],
    sellQty: 100,
    proceedsGrossMinor: 6000000,
    feeMinor: 20000,
    feeMode: 'from_proceeds',
  })
  assert.equal(derived.proceedsMinor, 5980000)
  assert.equal(derived.priceMinor, 60000)
  assert.equal(derived.principalMinor, 5000000)
})

test('funds sell can match buy principal with partial then leftover', () => {
  const fundsBuy = {
    id: 'funds_buy',
    security_id: 'sec1',
    type: 'buy',
    record_mode: 'funds',
    quantity: 0,
    principal_minor: 10000000,
    occurred_at: '2026-02-01T01:00:00.000Z',
    settlement_status: 'confirmed',
  }
  const first = deriveFundsSellFromBuyLot({
    buy: fundsBuy,
    transactions: [fundsBuy],
    sellPrincipalMinor: 4000000,
    proceedsGrossMinor: 4500000,
  })
  assert.equal(first.principalMinor, 4000000)
  assert.equal(first.proceedsMinor, 4500000)
  assert.equal(first.pnlMinor, 500000)
  assert.equal(first.sourceBuyTxId, 'funds_buy')
  assert.equal(first.quantity, 0)

  const afterFirst = {
    id: 'funds_sell_1',
    type: 'sell',
    record_mode: 'funds',
    source_buy_tx_id: 'funds_buy',
    quantity: 0,
    principal_minor: 4000000,
    settlement_status: 'scheduled',
  }
  const remain = remainingBuyLot(fundsBuy, [fundsBuy, afterFirst])
  assert.equal(remain.remainingPrincipalMinor, 6000000)

  const second = deriveFundsSellFromBuyLot({
    buy: fundsBuy,
    transactions: [fundsBuy, afterFirst],
    sellPrincipalMinor: 6000000,
    proceedsGrossMinor: 5800000,
  })
  assert.equal(second.principalMinor, 6000000)
  assert.equal(second.pnlMinor, -200000)

  const lots = listOpenBuyLots([fundsBuy, afterFirst, {
    id: 'funds_sell_2',
    type: 'sell',
    record_mode: 'funds',
    source_buy_tx_id: 'funds_buy',
    quantity: 0,
    principal_minor: 6000000,
  }], { recordMode: 'funds' })
  assert.deepEqual(lots.map((lot) => lot.buyId), [])

  assert.throws(
    () => deriveFundsSellFromBuyLot({
      buy: fundsBuy,
      transactions: [fundsBuy],
      sellPrincipalMinor: 10000001,
      proceedsGrossMinor: 1,
    }),
    /剩餘/,
  )
  assert.throws(
    () => findBuyLotOrThrow([fundsBuy], 'funds_buy', { recordMode: 'position' }),
    /完整持倉/,
  )
  assert.equal(findBuyLotOrThrow([fundsBuy], 'funds_buy', { recordMode: 'funds' }).id, 'funds_buy')
})

test('funds buy mutation blocked while linked sells exist', () => {
  const fundsBuy = {
    id: 'funds_buy',
    type: 'buy',
    record_mode: 'funds',
    principal_minor: 10000000,
  }
  const sell = {
    id: 'funds_sell',
    type: 'sell',
    record_mode: 'funds',
    source_buy_tx_id: 'funds_buy',
    principal_minor: 4000000,
  }
  assert.throws(() => assertBuyCanBeMutated(fundsBuy, [fundsBuy, sell]), /先處理賣出/)
  assert.throws(
    () => assertBuyCanBeMutated(fundsBuy, [fundsBuy, sell], { nextPrincipalMinor: 3999999 }),
    /不可小於已對應/,
  )
  assert.doesNotThrow(() => assertBuyCanBeMutated(fundsBuy, [fundsBuy, sell], { nextPrincipalMinor: 4000000 }))
})

test('migration 044 and wiring mention source_buy_tx_id', () => {
  const root = resolve(import.meta.dirname, '..')
  const migrate = readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8')
  const sql = readFileSync(resolve(root, 'src/core/db/migrations/044_security_sell_source_buy.sql'), 'utf8')
  const schema = readFileSync(resolve(root, 'src/core/services/backup-json-import-schema.js'), 'utf8')
  const repo = readFileSync(resolve(root, 'src/core/repositories/security.repo.js'), 'utf8')
  const service = readFileSync(resolve(root, 'src/core/services/security.service.js'), 'utf8')
  const page = readFileSync(resolve(root, 'src/ui/views/securities/SecurityDetailPage.vue'), 'utf8')
  assert.match(sql, /source_buy_tx_id/)
  assert.match(migrate, /044_security_sell_source_buy/)
  assert.match(migrate, /version: 44/)
  assert.match(schema, /source_buy_tx_id/)
  assert.match(repo, /source_buy_tx_id/)
  assert.match(service, /sourceBuyTxId|source_buy_tx_id/)
  assert.match(service, /scheduled buys are sellable/)
  assert.match(page, /sourceBuyTxId|source_buy_tx_id/)
  assert.match(page, /securities-sell-source-buy/)
  assert.match(page, /securities-sell-proceeds/)
  assert.match(page, /securities-open-sell/)
  assert.match(page, /deriveFundsSellFromBuyLot|recordMode === 'funds'/)
  assert.match(page, /sell_source_buy_funds_hint|sell_funds_lot_option/)
  const playwright = readFileSync(resolve(root, 'scripts/playwright-ui-layout.mjs'), 'utf8')
  assert.match(playwright, /securities-sell-source-buy/)
  assert.match(playwright, /specific-lot sell/)
  assert.match(playwright, /funds-matched sell|funds only match buy/)
  const i18n = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
  assert.equal((i18n.match(/'securities_page.sell_source_buy':/g) || []).length, 3)
  assert.equal((i18n.match(/'securities_page.sell_proceeds':/g) || []).length, 3)
  assert.equal((i18n.match(/'securities_page.sell_funds_lot_option':/g) || []).length, 3)
  assert.equal((i18n.match(/'securities_page.sell_source_buy_optional':/g) || []).length, 3)
  assert.match(migrate, /security_transactions:[\s\S]*source_buy_tx_id/)
})
