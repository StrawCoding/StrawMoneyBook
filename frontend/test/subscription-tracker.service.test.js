import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  addSubscriptionInterval,
  isSubscriptionChargeDue,
  listSubscriptionChargeDatesThrough,
  resolveSubscriptionNextChargeDate,
} from '../src/core/utils/subscription-schedule.js'

const subscriptionTrackerSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/subscription-tracker.service.js'),
  'utf8',
)

test('subscription schedule keeps the first start date as the recurrence anchor', () => {
  assert.equal(addSubscriptionInterval('2026-04-05', 1, 'month'), '2026-05-05')
  assert.equal(
    resolveSubscriptionNextChargeDate(
      {
        startDate: '2026-01-05',
        intervalValue: 1,
        intervalUnit: 'month',
      },
      new Date('2026-03-20T09:00:00+08:00'),
    ),
    '2026-04-05',
  )
})

test('subscription schedule supports custom monthly charge day with month-end fallback', () => {
  assert.equal(
    addSubscriptionInterval('2026-01-31', 1, 'month', { chargeDay: 31 }),
    '2026-02-28',
  )
  assert.equal(
    resolveSubscriptionNextChargeDate(
      {
        startDate: '2026-01-31',
        intervalValue: 1,
        intervalUnit: 'month',
        chargeDay: 31,
      },
      new Date('2026-02-28T09:00:00+08:00'),
    ),
    '2026-02-28',
  )
  assert.equal(
    resolveSubscriptionNextChargeDate(
      {
        startDate: '2026-01-31',
        intervalValue: 1,
        intervalUnit: 'month',
        chargeDay: 31,
      },
      new Date('2026-03-01T09:00:00+08:00'),
    ),
    '2026-03-31',
  )
})

test('yearly subscription schedule stays on the same month with leap-safe fallback', () => {
  assert.equal(addSubscriptionInterval('2024-02-29', 1, 'year'), '2025-02-28')
})

test('subscription schedule marks only the matching day as due and respects pause state', () => {
  const item = {
    startDate: '2026-04-05',
    intervalValue: 1,
    intervalUnit: 'month',
    paused: false,
  }
  assert.equal(isSubscriptionChargeDue(item, new Date('2026-04-05T12:00:00+08:00')), true)
  assert.equal(isSubscriptionChargeDue(item, new Date('2026-04-06T12:00:00+08:00')), false)
  assert.equal(isSubscriptionChargeDue({ ...item, paused: true }, new Date('2026-04-05T12:00:00+08:00')), false)
})

test('subscription schedule lists all due dates through today for catch-up runs', () => {
  assert.deepEqual(
    listSubscriptionChargeDatesThrough(
      {
        startDate: '2026-01-31',
        intervalValue: 1,
        intervalUnit: 'month',
        chargeDay: 31,
      },
      new Date('2026-04-15T09:00:00+08:00'),
    ),
    ['2026-01-31', '2026-02-28', '2026-03-31'],
  )
})

test('subscription schedule skips due-date catch-up when paused', () => {
  assert.deepEqual(
    listSubscriptionChargeDatesThrough(
      {
        startDate: '2026-01-05',
        intervalValue: 1,
        intervalUnit: 'month',
        paused: true,
      },
      new Date('2026-04-15T09:00:00+08:00'),
    ),
    [],
  )
})

test('subscription tracker normalizes new fields and removes manual paid progression', () => {
  assert.match(subscriptionTrackerSource, /const startDate = normalizeSubscriptionDateInput\(/)
  assert.match(subscriptionTrackerSource, /raw\.startDate\s*\?\?\s*raw\.lastPaidAt\s*\?\?\s*raw\.nextDueAt/)
  assert.match(subscriptionTrackerSource, /const chargeDay = normalizeChargeDay\(raw\.chargeDay, startDate\)/)
  assert.match(subscriptionTrackerSource, /const paused = normalizePaused\(raw\.paused\)/)
  assert.match(subscriptionTrackerSource, /const note = normalizeNote\(raw\.note\)/)
  assert.match(subscriptionTrackerSource, /note,\s*\n\s*}\s*\n}/)
  assert.match(subscriptionTrackerSource, /return isSubscriptionChargeDue\(item, now\)/)
  assert.doesNotMatch(subscriptionTrackerSource, /export async function markSubscriptionPaid/)
})
