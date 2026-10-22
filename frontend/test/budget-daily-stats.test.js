import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBudgetDailyStatsRows,
  isBudgetItemActiveOnDate,
  listPeriodDayKeys,
} from '../src/core/services/budget-daily-stats.js'

const julyPeriod = {
  mode: 'calendar_month',
  key: '2026-07',
  monthKey: '2026-07',
  startDate: '2026-07-01',
  endDate: '2026-07-03',
}

test('listPeriodDayKeys returns inclusive calendar days', () => {
  assert.deepEqual(listPeriodDayKeys(julyPeriod), ['2026-07-01', '2026-07-02', '2026-07-03'])
})

test('isBudgetItemActiveOnDate respects monthday daily-average rules', () => {
  const item = {
    amount_mode: 'daily_average',
    day_rule_unit: 'monthday',
    day_rule_values_json: '[1,15]',
  }
  assert.equal(isBudgetItemActiveOnDate(item, new Date(2026, 6, 1)), true)
  assert.equal(isBudgetItemActiveOnDate(item, new Date(2026, 6, 2)), false)
})

test('buildBudgetDailyStatsRows sums daily budget, spent, diff and cumulative', () => {
  const items = [
    {
      id: 'bi1',
      category_id: 'cat_food',
      amount_mode: 'daily_average',
      day_rule_unit: 'monthday',
      day_rule_values_json: '[1,2,3]',
      amount_minor: 1000,
      budget_container_id: null,
    },
    {
      id: 'bi2',
      category_id: 'cat_fixed',
      amount_mode: 'fixed',
      amount_minor: 9000,
      budget_container_id: null,
    },
  ]
  const spentByCategoryDayRows = [
    { category_id: 'cat_food', occurred_day: '2026-07-01', spent_minor: 500 },
    { category_id: 'cat_fixed', occurred_day: '2026-07-02', spent_minor: 2000 },
  ]
  const rows = buildBudgetDailyStatsRows({
    period: julyPeriod,
    items,
    containers: [],
    spentByCategoryDayRows,
  })
  assert.equal(rows.length, 3)
  assert.equal(rows[0].plannedMinor, 1000)
  assert.equal(rows[0].spentMinor, 500)
  assert.equal(rows[0].diffMinor, 500)
  assert.equal(rows[0].cumulativeSpentMinor, 500)
  assert.equal(rows[1].plannedMinor, 1000)
  assert.equal(rows[1].spentMinor, 2000)
  assert.equal(rows[1].cumulativeSpentMinor, 2500)
  assert.equal(rows[2].plannedMinor, 1000)
  assert.equal(rows[2].spentMinor, 0)
})

test('buildBudgetDailyStatsRows applies rolling pool allowance on second day after overspend', () => {
  const items = [
    {
      id: 'bi_pool',
      category_id: 'cat_pool',
      amount_mode: 'fixed',
      amount_minor: 0,
      budget_container_id: 'bc1',
    },
  ]
  const containers = [{
    id: 'bc1',
    amount_minor: 3000,
    period_mode: 'monthly',
    surplus_mode: 'roll',
  }]
  const spentByCategoryDayRows = [
    { category_id: 'cat_pool', occurred_day: '2026-07-01', spent_minor: 2000 },
    { category_id: 'cat_pool', occurred_day: '2026-07-02', spent_minor: 0 },
  ]
  const rows = buildBudgetDailyStatsRows({
    period: julyPeriod,
    items,
    containers,
    spentByCategoryDayRows,
  })
  assert.equal(rows[0].plannedMinor, 1000)
  assert.equal(rows[1].plannedMinor, 500)
})
