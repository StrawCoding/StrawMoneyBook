import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBudgetDailyStatsRows,
  buildBudgetMonthCalendarCells,
  isBudgetItemActiveOnDate,
  listPeriodDayKeys,
  spentByCategoryOnDay,
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

test('spentByCategoryOnDay groups budget expenses for one day', () => {
  const rows = spentByCategoryOnDay([
    { category_id: 'cat_food', occurred_day: '2026-07-02', spent_minor: 1200 },
    { category_id: 'cat_food', occurred_day: '2026-07-02', spent_minor: 300 },
    { category_id: 'cat_fixed', occurred_day: '2026-07-01', spent_minor: 900 },
    { category_id: 'cat_empty', occurred_day: '2026-07-02', spent_minor: 0 },
  ], '2026-07-02')
  assert.deepEqual(rows, [{ categoryId: 'cat_food', spentMinor: 1500 }])
})

test('buildBudgetMonthCalendarCells fades days outside pay-cycle and only counts in-period spent', () => {
  const cells = buildBudgetMonthCalendarCells({
    monthKey: '2026-07',
    periodStartDate: '2026-06-25',
    periodEndDate: '2026-07-24',
    todayKey: '2026-07-13',
    dailyStatsRows: [
      { dayKey: '2026-07-13', plannedMinor: 1000, spentMinor: 1500, diffMinor: -500 },
      { dayKey: '2026-07-24', plannedMinor: 1000, spentMinor: 200, diffMinor: 800 },
    ],
  })
  const faded = cells.find((cell) => cell.dateKey === '2026-07-25')
  const over = cells.find((cell) => cell.dateKey === '2026-07-13')
  const inPeriod = cells.find((cell) => cell.dateKey === '2026-07-24')
  assert.equal(faded.inPeriod, false)
  assert.equal(faded.selectable, false)
  assert.equal(faded.spentMinor, 0)
  assert.equal(over.inPeriod, true)
  assert.equal(over.selectable, true)
  assert.equal(over.isToday, true)
  assert.equal(over.isOver, true)
  assert.equal(over.spentMinor, 1500)
  assert.equal(inPeriod.isOver, false)
  assert.equal(inPeriod.spentMinor, 200)
})
