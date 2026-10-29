import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDailyPoolStatsListForDay,
  resolveHomeDailyBudgetMetricsForDay,
} from '../src/core/services/budget-daily-stats.js'

const period = {
  key: 'pay:2026-10-27',
  monthKey: '2026-10',
  startDate: '2026-10-27',
  endDate: '2026-10-31',
}

const containers = [{
  id: 'pool-main',
  amount_minor: 620000,
  period_mode: 'monthly',
  surplus_mode: 'roll',
}]

const items = [{
  id: 'pool-child',
  category_id: 'cat_pool',
  amount_mode: 'fixed',
  amount_minor: 0,
  budget_container_id: 'pool-main',
}]

const spentByCategoryDayRows = [
  { category_id: 'cat_pool', occurred_day: '2026-10-28', spent_minor: 445900 },
  { category_id: 'cat_pool', occurred_day: '2026-10-29', spent_minor: 10000 },
]

test('daily quota: spentBefore uses full period rows before selectedDay', () => {
  const [stats] = resolveDailyPoolStatsListForDay({
    dayKey: '2026-10-29',
    period,
    items,
    containers,
    spentByCategoryDayRows,
  })
  assert.equal(stats.spentBeforeMinor, 445900)
  assert.equal(stats.spentOnDayMinor, 10000)
  assert.equal(stats.remainingDays, 3)
  assert.equal(stats.periodBudgetMinor, 620000)
  assert.equal(stats.todayAllowanceMinor, 58033)
})

test('daily quota: home metrics planned/spent/remain for 2026-10-29', () => {
  const metrics = resolveHomeDailyBudgetMetricsForDay({
    dayKey: '2026-10-29',
    period,
    items,
    containers,
    spentByCategoryDayRows,
  })
  assert.equal(metrics.plannedMinor, 58033)
  assert.equal(metrics.spentOnDayMinor, 10000)
  assert.equal(metrics.remainMinor, 48033)
})

test('regression: single-day row only must not yield floor(periodBudget/remainingDays) when prior spend exists in rows', () => {
  const [stats] = resolveDailyPoolStatsListForDay({
    dayKey: '2026-10-29',
    period,
    items,
    containers,
    spentByCategoryDayRows,
  })
  assert.notEqual(stats.todayAllowanceMinor, 206666)
  assert.equal(stats.todayAllowanceMinor, 58033)
})

test('regression: floor(periodBudget/3) only when no pool spend before selectedDay', () => {
  const [stats] = resolveDailyPoolStatsListForDay({
    dayKey: '2026-10-29',
    period,
    items,
    containers,
    spentByCategoryDayRows: [
      { category_id: 'cat_pool', occurred_day: '2026-10-29', spent_minor: 10000 },
    ],
  })
  assert.equal(stats.spentBeforeMinor, 0)
  assert.equal(stats.todayAllowanceMinor, 206666)
})
