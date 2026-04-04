import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHomeWidgetSummaryPayload } from '../src/ui/services/home-widget-summary.js'
import { isCountableForBudget, isCountableForIncomeExpense, isRefundTransaction } from '../src/ui/utils/refund-transaction.js'

test('refund helper recognizes refund transactions from origin type and legacy note/category fallback', () => {
  assert.equal(isRefundTransaction({ origin_type: 'refund' }), true)
  assert.equal(isRefundTransaction({ external_ref_id: 'tx_1', category_name: '退款' }), true)
  assert.equal(isRefundTransaction({ external_ref_id: 'tx_1', note: '退款：午餐' }), true)
  assert.equal(isRefundTransaction({ external_ref_id: 'tx_1', note: '退款: lunch' }), true)
  assert.equal(isRefundTransaction({ external_ref_id: 'tx_1', note: '一般備註' }), false)
})

test('refund helper excludes refund records and refunded source transactions from income and expense summaries', () => {
  assert.equal(isCountableForIncomeExpense({ type: 'income', include_in_analysis: 1 }), true)
  assert.equal(isCountableForIncomeExpense({ type: 'income', include_in_analysis: 1, has_refund_link: 1 }), false)
  assert.equal(isCountableForIncomeExpense({ type: 'adjustment', include_in_analysis: 1, origin_type: 'refund' }), false)
})

test('refund helper excludes refunded expense records from budget usage', () => {
  assert.equal(isCountableForBudget({ type: 'expense', include_in_budget: 1 }), true)
  assert.equal(isCountableForBudget({ type: 'expense', include_in_budget: 1, has_refund_link: 1 }), false)
  assert.equal(isCountableForBudget({ type: 'adjustment', include_in_budget: 1, origin_type: 'refund' }), false)
})

test('home widget summary ignores refund entries and refunded source transactions', () => {
  const payload = buildHomeWidgetSummaryPayload(
    [
      { type: 'income', amount_minor: 1200, include_in_analysis: 1 },
      { type: 'expense', amount_minor: -450, include_in_analysis: 1, has_refund_link: 1 },
      { type: 'adjustment', amount_minor: 450, include_in_analysis: 1, origin_type: 'refund' },
    ],
    {
      currencyCode: 'twd',
      ledgerName: '主帳本',
    },
  )

  assert.deepEqual(payload, {
    incomeMinor: 1200,
    expenseMinor: 0,
    currencyCode: 'TWD',
    ledgerName: '主帳本',
  })
})
