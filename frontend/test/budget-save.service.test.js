import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetBudgetSaveDependenciesForTest,
  runBudgetSaveIfDue,
  setBudgetSaveDependenciesForTest,
} from '../src/core/services/budget-save.service.js'

afterEach(() => {
  resetBudgetSaveDependenciesForTest()
})

function createBaseDependencies(overrides = {}) {
  const settlements = new Map()
  return {
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async listAccounts() {
      return [
        { id: 'acc_main', currency_code: 'TWD', allow_negative: 0, savings_jar_goal_type: '' },
        { id: 'jar_trip', currency_code: 'TWD', allow_negative: 0, savings_jar_goal_type: 'target' },
      ]
    },
    async getAccountBalances() {
      return [
        { id: 'acc_main', balance_minor: 500000 },
        { id: 'jar_trip', balance_minor: 200000 },
      ]
    },
    async findTransactionByIdempotencyKey() {
      return null
    },
    async getBudgetSavePreferences() {
      return { retroactiveMode: 'manual' }
    },
    async listBudgetContainers() {
      return []
    },
    async getBudgetSaveSettlement(_ledgerId, scopeType, scopeRefId, periodKey) {
      return settlements.get(`${scopeType}:${scopeRefId}:${periodKey}`) ?? null
    },
    async upsertBudgetSaveSettlement(_ledgerId, payload) {
      const key = `${payload.scopeType}:${payload.scopeRefId}:${payload.periodKey}`
      const row = {
        scope_type: payload.scopeType,
        scope_ref_id: payload.scopeRefId,
        period_key: payload.periodKey,
        settled_amount_minor: payload.settledAmountMinor,
        status: payload.status,
        transfer_group_id: payload.transferGroupId,
        last_error: payload.lastError,
      }
      settlements.set(key, row)
      return row
    },
    settlements,
    ...overrides,
  }
}

test('budget save creates daily catch-up transfers and skips non-surplus days', async () => {
  const transferCalls = []
  const deps = createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{ id: 'budget_march', month_key: '2026-03' }]
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        category_id: 'cat_food',
        category_name: '餐費',
        amount_minor: 10000,
        amount_mode: 'daily_average',
        day_rule_unit: 'monthday',
        day_rule_values_json: '[1,2]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async computeBudgetSpentByCategory(_ledgerId, startUtc, endUtc) {
      if (startUtc === '2026-02-28T16:00:00.000Z' && endUtc === '2026-03-01T16:00:00.000Z') {
        return [{ category_id: 'cat_food', spent_minor: 3000 }]
      }
      if (startUtc === '2026-03-01T16:00:00.000Z' && endUtc === '2026-03-02T16:00:00.000Z') {
        return [{ category_id: 'cat_food', spent_minor: 12000 }]
      }
      return []
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: `tf_${transferCalls.length}` }
    },
  })
  setBudgetSaveDependenciesForTest(deps)

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-03T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 1)
  assert.equal(result.failedCount, 0)
  assert.equal(transferCalls.length, 1)
  assert.match(transferCalls[0].note, /^預算存款：餐費 2026-03-01$/)
  assert.equal(transferCalls[0].amountMinor, 7000)
  assert.equal(deps.settlements.get('budget_item_day:bi_food:2026-03-01')?.status, 'settled')
  assert.equal(deps.settlements.get('budget_item_day:bi_food:2026-03-02')?.status, 'skipped_no_surplus')
})

test('budget save monthly total excludes categories handled by item rules', async () => {
  const transferCalls = []
  setBudgetSaveDependenciesForTest(createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{
        id: 'budget_feb',
        month_key: '2026-02',
        budget_save_total_enabled: 1,
        budget_save_total_target_account_id: 'jar_trip',
        budget_save_total_source_account_id: 'acc_main',
      }]
    },
    async listBudgetItems() {
      return [
        {
          id: 'bi_food',
          category_id: 'cat_food',
          category_name: '餐費',
          amount_minor: 100000,
          amount_mode: 'fixed',
          day_rule_unit: 'none',
          day_rule_values_json: '[]',
          budget_save_enabled: 1,
          budget_save_target_account_id: 'jar_trip',
          budget_save_source_account_id: 'acc_main',
        },
        {
          id: 'bi_misc',
          category_id: 'cat_misc',
          category_name: '雜支',
          amount_minor: 50000,
          amount_mode: 'fixed',
          day_rule_unit: 'none',
          day_rule_values_json: '[]',
          budget_save_enabled: 0,
        },
      ]
    },
    async computeBudgetSpentByCategory() {
      return [
        { category_id: 'cat_food', spent_minor: 20000 },
        { category_id: 'cat_misc', spent_minor: 10000 },
      ]
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_total' }
    },
  }))

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 2)
  assert.equal(transferCalls[1].amountMinor, 40000)
  assert.match(transferCalls[1].note, /^預算存款：2026-02 總預算$/)
})

test('manual retroactive mode locks settled periods', async () => {
  const transferCalls = []
  const deps = createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{ id: 'budget_feb', month_key: '2026-02' }]
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        category_id: 'cat_food',
        category_name: '餐費',
        amount_minor: 100000,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async computeBudgetSpentByCategory() {
      return [{ category_id: 'cat_food', spent_minor: 20000 }]
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_locked' }
    },
  })
  deps.settlements.set('budget_item_month:bi_food:2026-02', {
    scope_type: 'budget_item_month',
    scope_ref_id: 'bi_food',
    period_key: '2026-02',
    settled_amount_minor: 90000,
    status: 'settled',
  })
  setBudgetSaveDependenciesForTest(deps)

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 0)
  assert.equal(result.skippedCount, 1)
  assert.equal(transferCalls.length, 0)
})

test('delta retroactive mode creates reverse adjustments', async () => {
  const transferCalls = []
  const deps = createBaseDependencies({
    async getBudgetSavePreferences() {
      return { retroactiveMode: 'delta' }
    },
    async listBudgetsWithSaveRules() {
      return [{ id: 'budget_feb', month_key: '2026-02' }]
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        category_id: 'cat_food',
        category_name: '餐費',
        amount_minor: 60000,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async computeBudgetSpentByCategory() {
      return [{ category_id: 'cat_food', spent_minor: 30000 }]
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_delta' }
    },
  })
  deps.settlements.set('budget_item_month:bi_food:2026-02', {
    scope_type: 'budget_item_month',
    scope_ref_id: 'bi_food',
    period_key: '2026-02',
    settled_amount_minor: 50000,
    status: 'settled',
  })
  setBudgetSaveDependenciesForTest(deps)

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 1)
  assert.equal(transferCalls[0].amountMinor, 20000)
  assert.equal(transferCalls[0].fromAccountId, 'jar_trip')
  assert.equal(transferCalls[0].toAccountId, 'acc_main')
  assert.equal(deps.settlements.get('budget_item_month:bi_food:2026-02')?.settled_amount_minor, 30000)
})

test('budget save records failed settlement when source balance is insufficient', async () => {
  const deps = createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{ id: 'budget_feb', month_key: '2026-02' }]
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        category_id: 'cat_food',
        category_name: '餐費',
        amount_minor: 100000,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async getAccountBalances() {
      return [
        { id: 'acc_main', balance_minor: 1000 },
        { id: 'jar_trip', balance_minor: 0 },
      ]
    },
    async computeBudgetSpentByCategory() {
      return []
    },
    async createTransfer() {
      throw new Error('should not create transfer when balance is insufficient')
    },
  })
  setBudgetSaveDependenciesForTest(deps)

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-15T09:00:00+08:00'),
  })

  assert.equal(result.failedCount, 1)
  assert.equal(deps.settlements.get('budget_item_month:bi_food:2026-02')?.status, 'failed')
  assert.equal(deps.settlements.get('budget_item_month:bi_food:2026-02')?.last_error, 'insufficient_balance')
})

test('budget save settles shared budget pool month surplus with budget_container_month scope', async () => {
  const transferCalls = []
  setBudgetSaveDependenciesForTest(createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{ id: 'budget_feb', month_key: '2026-02' }]
    },
    async listBudgetContainers() {
      return [{
        id: 'bc_life',
        name: '生活費',
        amount_minor: 300000,
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async listBudgetItems() {
      return [
        {
          id: 'bi_food',
          category_id: 'cat_food',
          budget_container_id: 'bc_life',
          amount_minor: 150000,
          amount_mode: 'fixed',
          day_rule_unit: 'none',
          day_rule_values_json: '[]',
          budget_save_enabled: 0,
        },
        {
          id: 'bi_transport',
          category_id: 'cat_transport',
          budget_container_id: 'bc_life',
          amount_minor: 80000,
          amount_mode: 'fixed',
          day_rule_unit: 'none',
          day_rule_values_json: '[]',
          budget_save_enabled: 0,
        },
      ]
    },
    async computeBudgetSpentByCategory() {
      return [
        { category_id: 'cat_food', spent_minor: 120000 },
        { category_id: 'cat_transport', spent_minor: 50000 },
      ]
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: 'tf_container' }
    },
  }))

  const result = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-15T09:00:00+08:00'),
  })

  assert.equal(result.createdCount, 1)
  assert.equal(transferCalls[0].amountMinor, 130000)
  assert.match(transferCalls[0].note, /^預算存款：生活費 2026-02$/)
})

test('budget save settles pay-cycle shared daily pools only after the inclusive period end', async () => {
  const transferCalls = []
  const spentRanges = []
  const deps = createBaseDependencies({
    async listBudgetsWithSaveRules() {
      return [{
        id: 'budget_pay',
        month_key: 'pay:2026-02-25',
        period_key: 'pay:2026-02-25:2026-03-24',
        period_start_date: '2026-02-25',
        period_end_date: '2026-03-24',
        period_mode: 'pay_cycle',
      }]
    },
    async listBudgetContainers() {
      return [{
        id: 'bc_daily',
        name: '日用池',
        amount_minor: 1000,
        period_mode: 'daily',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        category_id: 'cat_food',
        budget_container_id: 'bc_daily',
        amount_minor: 0,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 0,
      }]
    },
    async computeBudgetSpentByCategory(_ledgerId, startUtc, endUtc) {
      spentRanges.push({ startUtc, endUtc })
      return [{ category_id: 'cat_food', spent_minor: 3000 }]
    },
    async createTransfer(_ledgerId, payload) {
      transferCalls.push(payload)
      return { transferGroupId: `tf_${transferCalls.length}` }
    },
  })
  setBudgetSaveDependenciesForTest(deps)

  const beforeClose = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-24T12:00:00+08:00'),
  })

  assert.equal(beforeClose.createdCount, 0)
  assert.equal(transferCalls.length, 0)

  const afterClose = await runBudgetSaveIfDue('ledger_1', {
    now: new Date('2026-03-25T12:00:00+08:00'),
  })

  assert.equal(afterClose.createdCount, 1)
  assert.equal(transferCalls[0].amountMinor, 25000)
  assert.match(transferCalls[0].note, /^預算存款：日用池 2026-02-25~2026-03-24$/)
  assert.equal(deps.settlements.get('budget_container_month:bc_daily:pay:2026-02-25:2026-03-24')?.status, 'settled')
  assert.deepEqual(spentRanges.at(-1), {
    startUtc: '2026-02-24T16:00:00.000Z',
    endUtc: '2026-03-24T16:00:00.000Z',
  })
})
