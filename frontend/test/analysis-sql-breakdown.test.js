import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBreakdownRows,
  mergeAddonSplitsIntoCategoryExpense,
} from '../src/core/utils/analysis-breakdown.js'

test('mergeAddonSplitsIntoCategoryExpense moves addon amount off the parent category', () => {
  const transactions = [
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
      note: '晚餐',
    },
  ]
  const expected = buildBreakdownRows({
    transactions,
    type: 'expense',
    categoryNameMap: new Map([['food', '餐飲']]),
    swatches: ['#f00', '#0f0'],
  })
  const merged = mergeAddonSplitsIntoCategoryExpense(
    [{ id: 'food', amountMinor: 20500, count: 2 }],
    transactions.filter((tx) => String(tx.note ?? '').includes('【附加項目】')),
  )
  assert.equal(merged.find((row) => row.id === 'food')?.amountMinor, 19000)
  assert.equal(merged.find((row) => row.id.startsWith('__addon__:'))?.amountMinor, 1500)
  assert.equal(
    merged.reduce((sum, row) => sum + row.amountMinor, 0),
    expected.reduce((sum, row) => sum + row.amountMinor, 0),
  )
})
