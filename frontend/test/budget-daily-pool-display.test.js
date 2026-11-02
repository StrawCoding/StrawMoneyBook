import test from 'node:test'
import assert from 'node:assert/strict'
import {
  containerDailyPoolRateMinor,
  containerDisplayBudgetAmountMinor,
  resolveContainerPeriodAmountMinor,
} from '../src/core/services/budget-period.js'

test('daily pool UI 池日額 shows daily rate not period total', () => {
  const container = { period_mode: 'daily', amount_minor: 207_000 }
  const period = { startDate: '2026-11-01', endDate: '2026-11-30' }
  const periodTotal = resolveContainerPeriodAmountMinor(container, period)
  assert.ok(periodTotal > container.amount_minor)
  assert.equal(containerDailyPoolRateMinor(container), 207_000)
  assert.equal(
    containerDisplayBudgetAmountMinor(container, periodTotal),
    207_000,
  )
})

test('monthly pool display amount uses period budget', () => {
  const container = { period_mode: 'monthly', amount_minor: 50_000 }
  assert.equal(containerDisplayBudgetAmountMinor(container, 50_000), 50_000)
})
