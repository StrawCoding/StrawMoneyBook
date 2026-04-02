import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetSavingsJarAutoSaveDependenciesForTest,
  runSavingsJarAutoSaveIfDue,
  setSavingsJarAutoSaveDependenciesForTest,
} from '../src/core/services/savings-jar-auto-save.service.js'

afterEach(() => {
  resetSavingsJarAutoSaveDependenciesForTest()
})

function buildAccounts() {
  return [
    {
      id: 'acc_source',
      name: '主帳戶',
      currency_code: 'TWD',
      savings_jar_goal_type: '',
    },
    {
      id: 'jar_trip',
      name: '旅遊基金',
      currency_code: 'TWD',
      savings_jar_goal_type: 'target',
      savings_jar_auto_save_source_account_id: 'acc_source',
      savings_jar_auto_save_amount_minor: 25000,
      savings_jar_auto_save_interval_value: 1,
      savings_jar_auto_save_interval_unit: 'month',
      savings_jar_auto_save_start_date: '2026-01-31',
      savings_jar_auto_save_charge_day: 31,
      savings_jar_auto_save_paused: 0,
    },
  ]
}

function buildTestDependencies(overrides = {}) {
  return {
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    ...overrides,
  }
}

test('savings jar auto save creates catch-up transfers in chronological order', async () => {
  const transferCalls = []

  setSavingsJarAutoSaveDependenciesForTest(buildTestDependencies({
    async listAccounts() {
      return buildAccounts()
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: `tf_${transferCalls.length}` }
    },
  }))

  const result = await runSavingsJarAutoSaveIfDue('ledger_1', {
    now: new Date('2026-04-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 3)
  assert.equal(result.failedCount, 0)
  assert.equal(result.skippedCount, 0)
  assert.deepEqual(
    transferCalls.map((item) => item.idempotencyKey),
    ['sjar_auto:jar_trip:2026-01-31', 'sjar_auto:jar_trip:2026-02-28', 'sjar_auto:jar_trip:2026-03-31'],
  )
  assert.deepEqual(
    transferCalls.map((item) => item.occurredAt),
    ['2026-01-31T04:00:00.000Z', '2026-02-28T04:00:00.000Z', '2026-03-31T04:00:00.000Z'],
  )
  assert.ok(transferCalls.every((item) => item.originType === 'recurring'))
  assert.ok(transferCalls.every((item) => item.externalRefId === 'sjar_auto:jar_trip'))
})

test('savings jar auto save skips paused schedules and invalid source accounts', async () => {
  const transferCalls = []

  setSavingsJarAutoSaveDependenciesForTest(buildTestDependencies({
    async listAccounts() {
      return [
        {
          id: 'acc_source',
          name: '主帳戶',
          currency_code: 'USD',
          savings_jar_goal_type: '',
        },
        {
          id: 'jar_trip',
          name: '旅遊基金',
          currency_code: 'TWD',
          savings_jar_goal_type: 'target',
          savings_jar_auto_save_source_account_id: 'acc_source',
          savings_jar_auto_save_amount_minor: 10000,
          savings_jar_auto_save_interval_value: 1,
          savings_jar_auto_save_interval_unit: 'month',
          savings_jar_auto_save_start_date: '2026-03-05',
          savings_jar_auto_save_charge_day: 5,
          savings_jar_auto_save_paused: 0,
        },
        {
          id: 'jar_house',
          name: '房屋基金',
          currency_code: 'TWD',
          savings_jar_goal_type: 'target',
          savings_jar_auto_save_source_account_id: 'acc_source',
          savings_jar_auto_save_amount_minor: 20000,
          savings_jar_auto_save_interval_value: 1,
          savings_jar_auto_save_interval_unit: 'month',
          savings_jar_auto_save_start_date: '2026-03-05',
          savings_jar_auto_save_charge_day: 5,
          savings_jar_auto_save_paused: 1,
        },
      ]
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_1' }
    },
  }))

  const result = await runSavingsJarAutoSaveIfDue('ledger_1', {
    now: new Date('2026-04-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 0)
  assert.equal(result.skippedCount, 1)
  assert.equal(transferCalls.length, 0)
})

test('savings jar auto save is idempotent when transfer already exists', async () => {
  setSavingsJarAutoSaveDependenciesForTest(buildTestDependencies({
    async listAccounts() {
      return buildAccounts()
    },
    async findTransactionByIdempotencyKey(_ledgerId, key) {
      if (key === 'sjar_auto:jar_trip:2026-01-31:out') {
        return { id: 'tx_existing' }
      }
      return null
    },
    async createTransfer() {
      throw new Error('should not create duplicate transfer')
    },
  }))

  const result = await runSavingsJarAutoSaveIfDue('ledger_1', {
    now: new Date('2026-01-31T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 0)
  assert.equal(result.failedCount, 0)
})

test('savings jar auto save records failed transfers and continues', async () => {
  let callCount = 0

  setSavingsJarAutoSaveDependenciesForTest(buildTestDependencies({
    async listAccounts() {
      return [
        ...buildAccounts(),
        {
          id: 'jar_emergency',
          name: '緊急預備金',
          currency_code: 'TWD',
          savings_jar_goal_type: 'target',
          savings_jar_auto_save_source_account_id: 'acc_source',
          savings_jar_auto_save_amount_minor: 5000,
          savings_jar_auto_save_interval_value: 1,
          savings_jar_auto_save_interval_unit: 'month',
          savings_jar_auto_save_start_date: '2026-03-10',
          savings_jar_auto_save_charge_day: 10,
          savings_jar_auto_save_paused: 0,
        },
      ]
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createTransfer() {
      callCount += 1
      if (callCount === 1) {
        throw new Error('insufficient balance')
      }
      return { transferGroupId: `tf_${callCount}` }
    },
  }))

  const result = await runSavingsJarAutoSaveIfDue('ledger_1', {
    now: new Date('2026-03-31T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 3)
  assert.equal(result.failedCount, 1)
  assert.deepEqual(result.createdTransferGroupIds, ['tf_2', 'tf_3', 'tf_4'])
})

test('savings jar auto save uses ledger timezone instead of runtime timezone', async () => {
  const transferCalls = []

  setSavingsJarAutoSaveDependenciesForTest(buildTestDependencies({
    async getLedger() {
      return { id: 'ledger_1', timezone: 'UTC' }
    },
    async listAccounts() {
      return buildAccounts()
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_1' }
    },
  }))

  await runSavingsJarAutoSaveIfDue('ledger_1', {
    now: new Date('2026-01-31T09:00:00+08:00'),
  })

  assert.deepEqual(
    transferCalls.map((item) => item.occurredAt),
    ['2026-01-31T12:00:00.000Z'],
  )
})
