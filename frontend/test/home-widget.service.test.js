import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHomeWidgetSummaryPayload } from '../src/ui/services/home-widget-summary.js'

test('builds home widget summary payload from analysis transactions', () => {
  const payload = buildHomeWidgetSummaryPayload(
    [
      { type: 'income', amount_minor: 1200, include_in_analysis: 1 },
      { type: 'income', amount_minor: -300, include_in_analysis: 1 },
      { type: 'expense', amount_minor: -450, include_in_analysis: 1 },
      { type: 'expense', amount_minor: 200, include_in_analysis: 1 },
      { type: 'expense', amount_minor: -100, include_in_analysis: 0 },
    ],
    {
      currencyCode: ' usd ',
      ledgerName: ' Travel ',
    },
  )

  assert.deepEqual(payload, {
    incomeMinor: 1200,
    expenseMinor: 450,
    currencyCode: 'USD',
    ledgerName: 'Travel',
  })
})

test('normalizes empty widget summary metadata safely', () => {
  const payload = buildHomeWidgetSummaryPayload([], {
    currencyCode: '',
    ledgerName: '   ',
  })

  assert.deepEqual(payload, {
    incomeMinor: 0,
    expenseMinor: 0,
    currencyCode: 'TWD',
    ledgerName: '',
  })
})
