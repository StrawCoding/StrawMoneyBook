import test from 'node:test'
import assert from 'node:assert/strict'
import { computeReservedMinor } from '../src/core/services/budget-reserve.service.js'

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
