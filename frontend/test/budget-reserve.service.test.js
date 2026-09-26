import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDailyPoolReservedMinor,
  computeMonthlyReservedMinor,
  computePeriodReservedMinor,
  computeReservedMinor,
} from '../src/core/services/budget-reserve.service.js'

const DAILY_ITEM = {
  amount_mode: 'daily_average',
  amount_minor: 500,
  day_rule_unit: 'monthday',
  day_rule_values: [10, 20, 30],
}

test('computeReservedMinor counts current-month daily average rules that have not passed yet', () => {
  const reservedMinor = computeReservedMinor(
    [DAILY_ITEM],
    '2026-04',
    new Date('2026-04-20T04:00:00.000Z'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 1000)
})

test('computeReservedMinor excludes the reference day when requested for home daily mode', () => {
  const reservedMinor = computeReservedMinor(
    [DAILY_ITEM],
    '2026-04',
    new Date('2026-04-20T04:00:00.000Z'),
    'Asia/Taipei',
    { includeReferenceDay: false },
  )

  assert.equal(reservedMinor, 500)
})

test('computeReservedMinor counts the full future month for daily average rules', () => {
  const reservedMinor = computeReservedMinor(
    [DAILY_ITEM],
    '2026-05',
    new Date('2026-04-20T04:00:00.000Z'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 1500)
})

test('computeReservedMinor returns zero for past months and ignores fixed budget items', () => {
  const reservedMinor = computeReservedMinor(
    [
      DAILY_ITEM,
      {
        amount_mode: 'fixed',
        amount_minor: 8800,
        day_rule_unit: 'monthday',
        day_rule_values: [1, 15, 31],
      },
    ],
    '2026-03',
    new Date('2026-04-20T04:00:00.000Z'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 0)
})

test('computeDailyPoolReservedMinor counts remaining calendar days for save-mode daily pools', () => {
  const reservedMinor = computeDailyPoolReservedMinor(
    [{ period_mode: 'daily', amount_minor: 1000, surplus_mode: 'save' }],
    '2026-07',
    new Date('2026-07-10T12:00:00+08:00'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 22000)
})

test('computeMonthlyReservedMinor combines daily average items and save-mode daily pools', () => {
  const reservedMinor = computeMonthlyReservedMinor(
    [DAILY_ITEM],
    [{ period_mode: 'daily', amount_minor: 1000, surplus_mode: 'save' }],
    '2026-07',
    new Date('2026-07-10T12:00:00+08:00'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 23500)
})

test('computePeriodReservedMinor counts pay-cycle item rules and save-mode daily pools through the inclusive period end', () => {
  const reservedMinor = computePeriodReservedMinor(
    [DAILY_ITEM],
    [{ period_mode: 'daily', amount_minor: 1000, surplus_mode: 'save' }],
    {
      mode: 'pay_cycle',
      key: 'pay:2026-02-25:2026-03-24',
      monthKey: 'pay:2026-02-25',
      startDate: '2026-02-25',
      endDate: '2026-03-24',
    },
    new Date('2026-03-20T12:00:00+08:00'),
    'Asia/Taipei',
    { includeReferenceDay: true },
  )

  assert.equal(reservedMinor, 5500)
})

test('computeDailyPoolReservedMinor subtracts spent for roll-mode monthly pools when container id matches', () => {
  const reservedMinor = computeDailyPoolReservedMinor(
    [{ id: 'bc1', period_mode: 'monthly', amount_minor: 31000, surplus_mode: 'roll' }],
    '2026-07',
    new Date('2026-07-10T12:00:00+08:00'),
    'Asia/Taipei',
    {
      includeReferenceDay: true,
      items: [{ budget_container_id: 'bc1', category_id: 'cat1' }],
      spentMap: { cat1: 5000 },
      todaySpentMap: { cat1: 0 },
    },
  )
  assert.equal(reservedMinor, 26000)
})
