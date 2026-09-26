import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeContainerSurplusMode,
  resolvePoolTodayAllowanceMinor,
  resolvePoolStatsForDate,
  resolvePoolReservedMinor,
} from '../src/core/services/budget-pool-daily.js'

const julyPeriod = {
  mode: 'calendar_month',
  key: '2026-07',
  monthKey: '2026-07',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
}

test('normalizeContainerSurplusMode defaults to roll and maps legacy save-enabled pools to save', () => {
  assert.equal(normalizeContainerSurplusMode('roll'), 'roll')
  assert.equal(normalizeContainerSurplusMode('save'), 'save')
  assert.equal(normalizeContainerSurplusMode('', { budgetSaveEnabled: 1 }), 'save')
  assert.equal(normalizeContainerSurplusMode(undefined, { budgetSaveEnabled: 0 }), 'roll')
})

test('resolvePoolTodayAllowanceMinor divides remaining pot across remaining days', () => {
  assert.equal(resolvePoolTodayAllowanceMinor({
    periodBudgetMinor: 31000,
    spentBeforeMinor: 0,
    remainingDays: 31,
  }), 1000)
  assert.equal(resolvePoolTodayAllowanceMinor({
    periodBudgetMinor: 31000,
    spentBeforeMinor: 5000,
    remainingDays: 26,
  }), 1000)
  assert.equal(resolvePoolTodayAllowanceMinor({
    periodBudgetMinor: 31000,
    spentBeforeMinor: 8000,
    remainingDays: 20,
  }), 1150)
})

test('overspend shrinks the next day allowance and surplus grows it', () => {
  const monthlyPool = {
    amount_minor: 31000,
    period_mode: 'monthly',
    surplus_mode: 'roll',
  }

  const day1 = resolvePoolStatsForDate({
    container: monthlyPool,
    period: julyPeriod,
    spentPeriodMinor: 2500,
    spentOnDayMinor: 2500,
    dayKey: '2026-07-01',
  })
  assert.equal(day1.todayAllowanceMinor, 1000)
  assert.equal(day1.todayRemainMinor, -1500)
  assert.equal(day1.isOver, true)

  const day2 = resolvePoolStatsForDate({
    container: monthlyPool,
    period: julyPeriod,
    spentPeriodMinor: 2500,
    spentOnDayMinor: 0,
    dayKey: '2026-07-02',
  })
  assert.equal(day2.spentBeforeMinor, 2500)
  assert.equal(day2.remainingDays, 30)
  assert.equal(day2.todayAllowanceMinor, Math.floor((31000 - 2500) / 30))

  const surplusDay = resolvePoolStatsForDate({
    container: monthlyPool,
    period: julyPeriod,
    spentPeriodMinor: 200,
    spentOnDayMinor: 0,
    dayKey: '2026-07-02',
  })
  assert.equal(surplusDay.todayAllowanceMinor, Math.floor((31000 - 200) / 30))
  assert.ok(surplusDay.todayAllowanceMinor > day2.todayAllowanceMinor)
})

test('daily pool period budget multiplies daily rate by period days', () => {
  const dailyPool = {
    amount_minor: 1000,
    period_mode: 'daily',
    surplus_mode: 'roll',
  }
  const stats = resolvePoolStatsForDate({
    container: dailyPool,
    period: julyPeriod,
    spentPeriodMinor: 0,
    spentOnDayMinor: 0,
    dayKey: '2026-07-01',
  })
  assert.equal(stats.periodBudgetMinor, 31000)
  assert.equal(stats.todayAllowanceMinor, 1000)
})

test('pay-cycle short month uses actual period day count', () => {
  const period = {
    mode: 'pay_cycle',
    key: 'pay:2026-02-28:2026-03-30',
    monthKey: 'pay:2026-02-28',
    startDate: '2026-02-28',
    endDate: '2026-03-30',
  }
  const stats = resolvePoolStatsForDate({
    container: { amount_minor: 1000, period_mode: 'daily', surplus_mode: 'roll' },
    period,
    spentPeriodMinor: 0,
    spentOnDayMinor: 0,
    dayKey: '2026-02-28',
  })
  assert.equal(stats.periodBudgetMinor, 31000)
  assert.equal(stats.remainingDays, 31)
  assert.equal(stats.todayAllowanceMinor, 1000)
})

test('resolvePoolReservedMinor uses fixed daily rate for save-mode daily pools', () => {
  assert.equal(resolvePoolReservedMinor({
    container: { amount_minor: 1000, period_mode: 'daily', surplus_mode: 'save' },
    period: julyPeriod,
    remainingDaysInclusive: 22,
    includeReferenceDay: true,
  }), 22000)
})

test('resolvePoolReservedMinor uses rolling pot for roll-mode pools', () => {
  assert.equal(resolvePoolReservedMinor({
    container: { amount_minor: 31000, period_mode: 'monthly', surplus_mode: 'roll' },
    period: julyPeriod,
    spentPeriodMinor: 5000,
    spentOnDayMinor: 0,
    remainingDaysInclusive: 22,
    includeReferenceDay: true,
  }), 26000)

  assert.equal(resolvePoolReservedMinor({
    container: { amount_minor: 31000, period_mode: 'monthly', surplus_mode: 'roll' },
    period: julyPeriod,
    spentPeriodMinor: 5000,
    spentOnDayMinor: 0,
    remainingDaysInclusive: 22,
    includeReferenceDay: false,
  }), 26000 - Math.floor(26000 / 22))
})
