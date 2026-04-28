import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBarRows,
  buildBreakdownRows,
  buildPieStyle,
  buildTimeBarRows,
  resolveTimeBarSearchRange,
} from '../src/core/utils/analysis-breakdown.js'

test('category breakdown aggregates by category and assigns palette metadata', () => {
  const rows = buildBreakdownRows({
    transactions: [
      { type: 'expense', amount_minor: -1200, category_id: 'food' },
      { type: 'expense', amount_minor: -300, category_id: 'food' },
      { type: 'expense', amount_minor: -800, category_id: 'traffic' },
      { type: 'income', amount_minor: 5000, category_id: 'salary' },
    ],
    type: 'expense',
    categoryNameMap: new Map([
      ['food', '餐飲'],
      ['traffic', '交通'],
    ]),
    categoryIconMap: new Map([
      ['food', 'fa-solid fa-burger'],
      ['traffic', 'fa-solid fa-bus'],
    ]),
    swatches: ['#f00', '#0f0'],
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((item) => item.name), ['餐飲', '交通'])
  assert.equal(rows[0].amountMinor, 1500)
  assert.equal(rows[0].color, '#f00')
  assert.equal(rows[0].percent, 65)
})

test('expense category breakdown splits positive addon items without changing total expense', () => {
  const rows = buildBreakdownRows({
    transactions: [
      {
        type: 'expense',
        amount_minor: -11500,
        category_id: 'food',
        note: '午餐\n【附加項目】服務費+15',
      },
      {
        type: 'expense',
        amount_minor: -9000,
        category_id: 'food',
        note: '晚餐\n【附加項目】優惠-10',
      },
    ],
    type: 'expense',
    categoryNameMap: new Map([['food', '餐飲']]),
    swatches: ['#f00', '#0f0'],
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((item) => item.name), ['餐飲', '附加項目：服務費'])
  assert.equal(rows[0].amountMinor, 19000)
  assert.equal(rows[1].amountMinor, 1500)
  assert.equal(rows.reduce((sum, item) => sum + item.amountMinor, 0), 20500)
})

test('time bar rows seed missing months and resolve linked search ranges', () => {
  const rows = buildTimeBarRows({
    transactions: [
      { type: 'expense', amount_minor: -1200, occurred_at: '2026-04-08T08:00:00.000Z' },
      { type: 'expense', amount_minor: -600, occurred_at: '2026-04-15T08:00:00.000Z' },
      { type: 'expense', amount_minor: -300, occurred_at: '2026-05-02T08:00:00.000Z' },
    ],
    type: 'expense',
    mode: 'year',
    year: 2026,
  })

  assert.equal(rows.length, 12)
  assert.equal(rows[3].id, '04')
  assert.equal(rows[3].amountMinor, 1800)
  assert.equal(rows[4].amountMinor, 300)
  assert.equal(rows[0].amountMinor, 0)
  assert.deepEqual(
    resolveTimeBarSearchRange({ mode: 'year', bucketId: '04', year: 2026 }),
    { startDay: '2026-04-01', endDay: '2026-04-30' },
  )
})

test('bar and pie helpers produce bounded presentation values', () => {
  const items = buildBarRows([
    { id: 'a', amountMinor: 1000, color: '#f00' },
    { id: 'b', amountMinor: 250, color: '#0f0' },
  ])

  assert.equal(items[0].barWidthPercent, 100)
  assert.equal(items[1].barWidthPercent, 25)

  const pieStyle = buildPieStyle(items)
  assert.match(String(pieStyle.background), /conic-gradient/)
  assert.match(String(pieStyle.background), /#f00/)
})
