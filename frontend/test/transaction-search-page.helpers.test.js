import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterTransactionsForSearch,
  summarizeSelectedBatchTransactions,
} from '../src/ui/composables/transaction-search-page.helpers.js'

test('transaction search helper filters by date window and keyword text', () => {
  const transactions = [
    {
      id: 'tx-1',
      type: 'expense',
      account_id: 'cash',
      amount_minor: -1200,
      occurred_at: '2026-04-08T08:30:00.000Z',
      note: '午餐',
    },
    {
      id: 'tx-2',
      type: 'income',
      account_id: 'bank',
      amount_minor: 5000,
      occurred_at: '2026-04-09T08:30:00.000Z',
      note: '薪水',
    },
  ]

  const filtered = filterTransactionsForSearch({
    transactions,
    keyword: 'cash 12',
    startDay: '2026-04-08',
    endDay: '2026-04-08',
    labelOfTransaction: (tx) => (tx.type === 'expense' ? '支出' : '收入'),
    accountName: (accountId) => accountId,
    formatTime: (value) => value.slice(0, 10),
    noteText: (value) => value,
  })

  assert.deepEqual(filtered.map((item) => item.id), ['tx-1'])
})

test('transaction search helper summarizes selected batch transaction types', () => {
  assert.deepEqual(
    summarizeSelectedBatchTransactions([
      { type: 'expense' },
      { type: 'income' },
      { type: 'expense' },
      { type: 'transfer' },
      { type: 'adjustment' },
    ]),
    {
      expenseCount: 2,
      incomeCount: 1,
      transferCount: 1,
      adjustmentCount: 1,
    },
  )
})
