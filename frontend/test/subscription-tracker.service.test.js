import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  addSubscriptionInterval,
  isSubscriptionChargeDue,
  listSubscriptionChargeDatesThrough,
  resolveSubscriptionNextChargeDate,
  toSubscriptionDateInput,
} from '../src/core/utils/subscription-schedule.js'
import {
  resetSubscriptionChargeDependenciesForTest,
  runSubscriptionChargesIfDue,
  setSubscriptionChargeDependenciesForTest,
} from '../src/core/services/subscription-charge.service.js'

test.afterEach(() => {
  resetSubscriptionChargeDependenciesForTest()
})

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
    '2026-03-31',
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

test('subscription schedule treats charge dates as due from the start of the day', () => {
  const item = {
    startDate: '2026-04-05',
    intervalValue: 1,
    intervalUnit: 'month',
    paused: false,
  }

  assert.equal(
    resolveSubscriptionNextChargeDate(item, new Date('2026-04-05T00:00:00+08:00')),
    '2026-05-05',
  )
  assert.equal(isSubscriptionChargeDue(item, new Date('2026-04-05T00:00:00+08:00')), true)
})

test('subscription schedule normalizes date objects in the app timezone', () => {
  assert.equal(toSubscriptionDateInput(new Date('2026-04-05T00:00:00+08:00')), '2026-04-05')
})

test('subscription schedule accepts explicit timezone for due-day boundaries', () => {
  const item = {
    startDate: '2026-04-05',
    intervalValue: 1,
    intervalUnit: 'month',
    paused: false,
  }

  assert.equal(toSubscriptionDateInput(new Date('2026-04-05T00:30:00+08:00'), 'UTC'), '2026-04-04')
  assert.equal(isSubscriptionChargeDue(item, new Date('2026-04-05T00:30:00+08:00'), { timeZone: 'UTC' }), false)
  assert.equal(isSubscriptionChargeDue(item, new Date('2026-04-05T08:30:00+08:00'), { timeZone: 'UTC' }), true)
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

test('subscription charge runner creates today due expense when app opens', async () => {
  const createCalls = []

  setSubscriptionChargeDependenciesForTest({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async getSubscriptionItems() {
      return [
        {
          id: 'sub_music',
          name: 'Music',
          accountId: 'acc_card',
          categoryId: 'cat_entertainment',
          amountMinor: 19900,
          intervalValue: 1,
          intervalUnit: 'month',
          startDate: '2026-04-23',
          chargeDay: 23,
          paused: false,
          note: 'family plan',
        },
      ]
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createExpense(_ledgerId, payload) {
      createCalls.push(payload)
      return `tx_${createCalls.length}`
    },
  })

  const result = await runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 1)
  assert.equal(result.failedCount, 0)
  assert.deepEqual(result.createdTransactionIds, ['tx_1'])
  assert.deepEqual(createCalls, [
    {
      accountId: 'acc_card',
      categoryId: 'cat_entertainment',
      amountMinor: 19900,
      occurredAt: '2026-04-23T04:00:00.000Z',
      note: '訂閱扣款：Music\nfamily plan',
      originType: 'recurring',
      externalRefId: 'subscription:sub_music',
      idempotencyKey: 'subscription:sub_music:2026-04-23',
    },
  ])
})

test('subscription charge runner uses ledger timezone for due detection', async () => {
  const createCalls = []

  setSubscriptionChargeDependenciesForTest({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'UTC' }
    },
    async getSubscriptionItems() {
      return [
        {
          id: 'sub_utc',
          name: 'UTC service',
          accountId: 'acc_card',
          categoryId: 'cat_service',
          amountMinor: 12000,
          intervalValue: 1,
          intervalUnit: 'month',
          startDate: '2026-04-05',
          chargeDay: 5,
          paused: false,
        },
      ]
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createExpense(_ledgerId, payload) {
      createCalls.push(payload)
      return `tx_${createCalls.length}`
    },
  })

  const beforeUtcDueDay = await runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-05T00:30:00+08:00'),
  })
  assert.equal(beforeUtcDueDay.createdCount, 0)
  assert.equal(createCalls.length, 0)

  const onUtcDueDay = await runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-05T08:30:00+08:00'),
  })
  assert.equal(onUtcDueDay.createdCount, 1)
  assert.equal(createCalls[0].idempotencyKey, 'subscription:sub_utc:2026-04-05')
  assert.equal(createCalls[0].occurredAt, '2026-04-05T12:00:00.000Z')
})

test('subscription charge runner only charges today and is idempotent', async () => {
  const createCalls = []

  setSubscriptionChargeDependenciesForTest({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async getSubscriptionItems() {
      return [
        {
          id: 'sub_old',
          name: 'Old due',
          accountId: 'acc_card',
          categoryId: 'cat_service',
          amountMinor: 10000,
          intervalValue: 1,
          intervalUnit: 'month',
          startDate: '2026-03-22',
          chargeDay: 22,
          paused: false,
        },
        {
          id: 'sub_today',
          name: 'Today due',
          accountId: 'acc_card',
          categoryId: 'cat_service',
          amountMinor: 10000,
          intervalValue: 1,
          intervalUnit: 'month',
          startDate: '2026-04-23',
          chargeDay: 23,
          paused: false,
        },
      ]
    },
    async findTransactionByIdempotencyKey(_ledgerId, key) {
      if (key === 'subscription:sub_today:2026-04-23') {
        return { id: 'tx_existing' }
      }
      return null
    },
    async createExpense(_ledgerId, payload) {
      createCalls.push(payload)
      return `tx_${createCalls.length}`
    },
  })

  const result = await runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 0)
  assert.equal(result.failedCount, 0)
  assert.equal(createCalls.length, 0)
})

test('subscription charge runner serializes concurrent checks per ledger', async () => {
  let itemReadCount = 0
  let releaseFirstRead = null
  const firstReadPending = new Promise((resolvePromise) => {
    releaseFirstRead = resolvePromise
  })

  setSubscriptionChargeDependenciesForTest({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async getSubscriptionItems() {
      itemReadCount += 1
      if (itemReadCount === 1) {
        await firstReadPending
      }
      return []
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createExpense() {
      throw new Error('should not create expense')
    },
  })

  const firstRun = runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
  })
  const secondRun = runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
  })

  releaseFirstRead()
  await Promise.all([firstRun, secondRun])

  assert.equal(itemReadCount, 1)
})

test('subscription charge runner can rerun after an active saved-item check', async () => {
  let itemReadCount = 0
  let releaseFirstRead = null
  const firstReadPending = new Promise((resolvePromise) => {
    releaseFirstRead = resolvePromise
  })

  setSubscriptionChargeDependenciesForTest({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async getSubscriptionItems() {
      itemReadCount += 1
      if (itemReadCount === 1) {
        await firstReadPending
      }
      return []
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createExpense() {
      throw new Error('should not create expense')
    },
  })

  const firstRun = runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
  })
  const secondRun = runSubscriptionChargesIfDue('ledger_1', {
    now: new Date('2026-04-23T09:00:00+08:00'),
    rerunAfterCurrent: true,
  })

  releaseFirstRead()
  await Promise.all([firstRun, secondRun])

  assert.equal(itemReadCount, 2)
})
