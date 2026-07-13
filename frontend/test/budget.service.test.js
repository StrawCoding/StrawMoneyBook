import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  copyPreviousMonthBudget,
  dateRangeUtc,
  listInclusiveMonthKeys,
  loadBudgetSnapshotForPeriod,
  monthRangeUtc,
  resetBudgetServiceDependenciesForTest,
  resolveBudgetPeriodForLedger,
  resolveContainerMonthlyAmountMinor,
  resolveContainerPeriodAmountMinor,
  saveBudgetContainer,
  saveBudgetContainerRange,
  saveBudgetItem,
  saveBudgetItemRange,
  setBudgetServiceDependenciesForTest,
} from '../src/core/services/budget.service.js'

afterEach(() => {
  resetBudgetServiceDependenciesForTest()
})

test('listInclusiveMonthKeys returns deterministic inclusive ranges without Date timezone conversion', () => {
  assert.deepEqual(listInclusiveMonthKeys('2026-01', '2026-01'), ['2026-01'])
  assert.deepEqual(listInclusiveMonthKeys('2026-01', '2026-03'), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(listInclusiveMonthKeys('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01'])
})

test('listInclusiveMonthKeys rejects invalid or reversed month ranges', () => {
  assert.throws(
    () => listInclusiveMonthKeys('2026-1', '2026-03'),
    { code: 'budgeting.container.error.invalid_month_range' },
  )
  assert.throws(
    () => listInclusiveMonthKeys('2026-04', '2026-03'),
    { code: 'budgeting.container.error.invalid_month_range' },
  )
})

test('resolveBudgetPeriodForLedger handles pay-cycle short months leap years and cross-year ranges', () => {
  assert.deepEqual(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, '2026-03-01'),
    {
      mode: 'pay_cycle',
      key: 'pay:2026-02-25:2026-03-24',
      monthKey: 'pay:2026-02-25',
      startDate: '2026-02-25',
      endDate: '2026-03-24',
      label: '2026-02-25~2026-03-24',
      nextPayDate: '2026-03-25',
    },
  )
  assert.equal(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 31 }, '2026-03-01').startDate,
    '2026-02-28',
  )
  assert.equal(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 31 }, '2024-03-01').startDate,
    '2024-02-29',
  )
  assert.deepEqual(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 30 }, '2027-01-05'),
    {
      mode: 'pay_cycle',
      key: 'pay:2026-12-30:2027-01-29',
      monthKey: 'pay:2026-12-30',
      startDate: '2026-12-30',
      endDate: '2027-01-29',
      label: '2026-12-30~2027-01-29',
      nextPayDate: '2027-01-30',
    },
  )
})

test('resolveBudgetPeriodForLedger treats pay day as the first inclusive day and the previous day as the prior period end', () => {
  assert.deepEqual(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, '2026-03-25'),
    {
      mode: 'pay_cycle',
      key: 'pay:2026-03-25:2026-04-24',
      monthKey: 'pay:2026-03-25',
      startDate: '2026-03-25',
      endDate: '2026-04-24',
      label: '2026-03-25~2026-04-24',
      nextPayDate: '2026-04-25',
    },
  )
  assert.equal(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, '2026-03-24').key,
    'pay:2026-02-25:2026-03-24',
  )
})

test('resolveBudgetPeriodForLedger preserves persisted pay-cycle month keys on startup reload', () => {
  assert.deepEqual(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, 'pay:2026-06-25'),
    {
      mode: 'pay_cycle',
      key: 'pay:2026-06-25:2026-07-24',
      monthKey: 'pay:2026-06-25',
      startDate: '2026-06-25',
      endDate: '2026-07-24',
      label: '2026-06-25~2026-07-24',
      nextPayDate: '2026-07-25',
    },
  )
  assert.equal(
    resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 31 }, 'pay:2026-02-28:2026-03-30').key,
    'pay:2026-02-28:2026-03-30',
  )
})

test('dateRangeUtc uses the ledger timezone instead of the CI runner timezone', () => {
  assert.deepEqual(
    dateRangeUtc('2026-02-25', '2026-03-24', 'Asia/Taipei'),
    {
      startUtc: '2026-02-24T16:00:00.000Z',
      endUtc: '2026-03-24T16:00:00.000Z',
    },
  )
  assert.deepEqual(
    dateRangeUtc('2026-02-25', '2026-03-24', 'UTC'),
    {
      startUtc: '2026-02-25T00:00:00.000Z',
      endUtc: '2026-03-25T00:00:00.000Z',
    },
  )
})

test('monthRangeUtc does not throw Invalid time value for stale pay-cycle keys', () => {
  assert.doesNotThrow(() => monthRangeUtc('pay:2026-06-25', 'Asia/Taipei'))
  const range = monthRangeUtc('pay:2026-06-25', 'Asia/Taipei')
  assert.deepEqual(range, {
    startUtc: '2026-05-31T16:00:00.000Z',
    endUtc: '2026-06-30T16:00:00.000Z',
  })
})

test('resolveContainerPeriodAmountMinor multiplies daily pools by actual pay-cycle days', () => {
  const period = resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, '2026-03-01')
  assert.equal(resolveContainerPeriodAmountMinor({ amount_minor: 1000, period_mode: 'daily' }, period), 28000)
  assert.equal(resolveContainerPeriodAmountMinor({ amount_minor: 1000, period_mode: 'monthly' }, period), 1000)
})

test('loadBudgetSnapshotForPeriod uses pay-cycle date range and counts daily rules inside range', async () => {
  const calls = []
  const period = resolveBudgetPeriodForLedger({ budget_period_mode: 'pay_cycle', budget_pay_day: 25 }, '2026-03-01')
  setBudgetServiceDependenciesForTest({
    async getBudgetByPeriod(_ledgerId, periodKey) {
      assert.equal(periodKey, 'pay:2026-02-25:2026-03-24')
      return { id: 'budget_pay', period_key: periodKey, month_key: 'pay:2026-02-25' }
    },
    async listBudgetItems() {
      return [
        {
          id: 'bi_food',
          category_id: 'cat_food',
          amount_minor: 1000,
          amount_mode: 'daily_average',
          day_rule_unit: 'monthday',
          day_rule_values_json: '[24,25,31]',
        },
        {
          id: 'bi_commute',
          category_id: 'cat_commute',
          amount_minor: 700,
          amount_mode: 'daily_average',
          day_rule_unit: 'weekday',
          day_rule_values_json: '[1]',
        },
      ]
    },
    async listBudgetContainers() {
      return [{
        id: 'bc_daily',
        name: '日池',
        amount_minor: 500,
        period_mode: 'daily',
      }]
    },
    async computeBudgetSpentByCategory(_ledgerId, startUtc, endUtc) {
      calls.push({ startUtc, endUtc })
      return []
    },
    async listBudgetUsageDaysByCategory(_ledgerId, startUtc, endUtc) {
      calls.push({ usageStartUtc: startUtc, usageEndUtc: endUtc })
      return []
    },
    async getSetting() {
      return null
    },
    async getLedger() {
      return { id: 'ledger_1', timezone: 'Asia/Taipei' }
    },
    async createBudget() {
      throw new Error('should not create budget')
    },
  })

  const snapshot = await loadBudgetSnapshotForPeriod('ledger_1', period)

  assert.equal(snapshot.items[0].occurrence_count, 2)
  assert.equal(snapshot.items[0].resolved_amount_minor, 2000)
  assert.equal(snapshot.items[1].occurrence_count, 4)
  assert.equal(snapshot.items[1].resolved_amount_minor, 2800)
  assert.equal(resolveContainerPeriodAmountMinor(snapshot.containers[0], snapshot.period), 14000)
  assert.equal(calls[0].startUtc.slice(0, 10), '2026-02-24')
  assert.equal(calls[0].endUtc.slice(0, 10), '2026-03-24')
  assert.equal(calls[2].usageStartUtc.slice(0, 10), '2026-02-24')
  assert.equal(calls[2].usageEndUtc.slice(0, 10), '2026-03-24')
})

test('copyPreviousMonthBudget preserves budget save settings on items and total config', async () => {
  const upsertCalls = []
  const totalConfigCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      if (monthKey === '2026-03') return { id: 'budget_current', month_key: monthKey }
      if (monthKey === '2026-02') {
        return {
          id: 'budget_prev',
          month_key: monthKey,
          budget_save_total_enabled: 1,
          budget_save_total_target_account_id: 'jar_trip',
          budget_save_total_source_account_id: 'acc_main',
        }
      }
      return null
    },
    async listBudgetItems() {
      return [{
        id: 'bi_food',
        scope_type: 'category',
        category_id: 'cat_food',
        category_group_id: null,
        budget_container_id: 'bc_life',
        amount_minor: 120000,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async listBudgetContainers() {
      return [{
        id: 'bc_life',
        name: '生活費',
        amount_minor: 200000,
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async upsertBudgetContainer() {},
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
    async updateBudgetSaveTotalConfig(_ledgerId, budgetId, payload) {
      totalConfigCalls.push({ budgetId, payload })
    },
    async deleteBudgetItemsByBudget() {},
    async deleteBudgetContainersByBudget() {},
    async createBudget() {
      throw new Error('should not create current budget')
    },
  })

  const result = await copyPreviousMonthBudget('ledger_1', '2026-03', { replaceExisting: true })

  assert.deepEqual(result, { copied: 2, fromMonth: '2026-02' })
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].budgetSaveEnabled, true)
  assert.equal(upsertCalls[0].budgetSaveTargetAccountId, 'jar_trip')
  assert.equal(upsertCalls[0].budgetSaveSourceAccountId, 'acc_main')
  assert.equal(typeof upsertCalls[0].budgetContainerId, 'string')
  assert.deepEqual(totalConfigCalls, [{
    budgetId: 'budget_current',
    payload: {
      enabled: true,
      targetAccountId: 'jar_trip',
      sourceAccountId: 'acc_main',
    },
  }])
})

test('saveBudgetItem rejects child auto save when parent container auto save is enabled', async () => {
  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: 'budget_current', month_key: monthKey }
    },
    async listBudgetItems() {
      return []
    },
    async listBudgetContainers() {
      return [{ id: 'bc_life', budget_save_enabled: 1 }]
    },
    async findAccountById(_ledgerId, accountId) {
      return { id: accountId, currency_code: 'TWD' }
    },
    async isSavingsJarAccount(_ledgerId, accountId) {
      return accountId === 'jar_trip'
    },
    async upsertBudgetItem() {
      throw new Error('should not save')
    },
  })

  await assert.rejects(
    saveBudgetItem('ledger_1', '2026-03', {
      categoryId: 'cat_food',
      budgetContainerId: 'bc_life',
      amountMinor: 10000,
      budgetSaveEnabled: true,
      budgetSaveTargetAccountId: 'jar_trip',
      budgetSaveSourceAccountId: 'acc_main',
    }),
    { code: 'budgeting.budget_save.error.parent_conflict' },
  )
})

test('saveBudgetItem persists budgetContainerId when container exists', async () => {
  const upsertCalls = []
  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: 'budget_current', month_key: monthKey }
    },
    async listBudgetItems() {
      return []
    },
    async listBudgetContainers() {
      return [{ id: 'bc_life', name: '生活費' }]
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return 'bi_food'
    },
  })

  const id = await saveBudgetItem('ledger_1', '2026-03', {
    categoryId: 'cat_food',
    budgetContainerId: 'bc_life',
    amountMinor: 10000,
  })

  assert.equal(id, 'bi_food')
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].budgetContainerId, 'bc_life')
})

test('saveBudgetItemRange creates independent category budget items across years', async () => {
  const upsertCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetItems() {
      return []
    },
    async listBudgetContainers() {
      return []
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
  })

  const result = await saveBudgetItemRange('ledger_1', '2026-11', '2027-01', {
    categoryId: 'cat_food',
    amountMinor: 120000,
    amountMode: 'daily_average',
    dayRuleUnit: 'weekday',
    dayRuleValues: [1, 3, 5],
  })

  assert.deepEqual(result.monthKeys, ['2026-11', '2026-12', '2027-01'])
  assert.equal(result.itemIds.length, 3)
  assert.equal(new Set(result.itemIds).size, 3)
  assert.deepEqual(
    upsertCalls.map((call) => ({
      budgetId: call.budgetId,
      categoryId: call.categoryId,
      amountMinor: call.amountMinor,
      amountMode: call.amountMode,
      dayRuleUnit: call.dayRuleUnit,
      dayRuleValuesJson: call.dayRuleValuesJson,
    })),
    [
      { budgetId: 'budget_2026-11', categoryId: 'cat_food', amountMinor: 120000, amountMode: 'daily_average', dayRuleUnit: 'weekday', dayRuleValuesJson: '[1,3,5]' },
      { budgetId: 'budget_2026-12', categoryId: 'cat_food', amountMinor: 120000, amountMode: 'daily_average', dayRuleUnit: 'weekday', dayRuleValuesJson: '[1,3,5]' },
      { budgetId: 'budget_2027-01', categoryId: 'cat_food', amountMinor: 120000, amountMode: 'daily_average', dayRuleUnit: 'weekday', dayRuleValuesJson: '[1,3,5]' },
    ],
  )
})

test('saveBudgetItemRange rejects invalid ranges before writing any item', async () => {
  const upsertCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth() {
      throw new Error('should not read months')
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
  })

  await assert.rejects(
    saveBudgetItemRange('ledger_1', '2026-04', '2026-03', {
      categoryId: 'cat_food',
      amountMinor: 10000,
    }),
    { code: 'budgeting.container.error.invalid_month_range' },
  )

  assert.deepEqual(upsertCalls, [])
})

test('saveBudgetItemRange rejects existing same-category item before writing any target month', async () => {
  const upsertCalls = []
  const createBudgetCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetItems(_ledgerId, budgetId) {
      if (budgetId === 'budget_2026-12') {
        return [{ id: 'bi_existing', category_id: 'cat_food' }]
      }
      return []
    },
    async listBudgetContainers() {
      return []
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
    async createBudget(_ledgerId, payload) {
      createBudgetCalls.push(payload)
      return { id: `budget_${payload.monthKey}`, month_key: payload.monthKey }
    },
  })

  await assert.rejects(
    saveBudgetItemRange('ledger_1', '2026-11', '2027-01', {
      categoryId: 'cat_food',
      amountMinor: 10000,
    }),
    (error) => {
      assert.equal(error.code, 'budgeting.budget_item.error.conflict_range')
      assert.deepEqual(error.monthKeys, ['2026-12'])
      return true
    },
  )

  assert.deepEqual(upsertCalls, [])
  assert.deepEqual(createBudgetCalls, [])
})

test('saveBudgetItemRange edits only the current month when payload has id', async () => {
  const upsertCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      assert.equal(monthKey, '2026-11')
      return { id: 'budget_2026-11', month_key: monthKey }
    },
    async listBudgetItems() {
      return [{ id: 'bi_food', category_id: 'cat_food' }]
    },
    async listBudgetContainers() {
      return []
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
  })

  const result = await saveBudgetItemRange('ledger_1', '2026-11', '2027-01', {
    id: 'bi_food',
    categoryId: 'cat_food',
    amountMinor: 220000,
  })

  assert.deepEqual(result, { monthKeys: ['2026-11'], itemIds: ['bi_food'] })
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].budgetId, 'budget_2026-11')
  assert.equal(upsertCalls[0].amountMinor, 220000)
})

test('saveBudgetItemRange maps pooled items to same-name containers in each target month', async () => {
  const upsertCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetItems() {
      return []
    },
    async listBudgetContainers(_ledgerId, budgetId) {
      const monthKey = String(budgetId).replace('budget_', '')
      return [{ id: `bc_life_${monthKey}`, name: '生活費' }]
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
  })

  await saveBudgetItemRange('ledger_1', '2026-11', '2027-01', {
    categoryId: 'cat_food',
    budgetContainerId: 'bc_life_2026-11',
    amountMinor: 120000,
  })

  assert.deepEqual(
    upsertCalls.map((call) => ({
      budgetId: call.budgetId,
      budgetContainerId: call.budgetContainerId,
      categoryId: call.categoryId,
    })),
    [
      { budgetId: 'budget_2026-11', budgetContainerId: 'bc_life_2026-11', categoryId: 'cat_food' },
      { budgetId: 'budget_2026-12', budgetContainerId: 'bc_life_2026-12', categoryId: 'cat_food' },
      { budgetId: 'budget_2027-01', budgetContainerId: 'bc_life_2027-01', categoryId: 'cat_food' },
    ],
  )
})

test('saveBudgetItemRange rejects missing same-name container before writing pooled items', async () => {
  const upsertCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetItems() {
      return []
    },
    async listBudgetContainers(_ledgerId, budgetId) {
      const monthKey = String(budgetId).replace('budget_', '')
      if (monthKey === '2026-12') return []
      return [{ id: `bc_life_${monthKey}`, name: '生活費' }]
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
  })

  await assert.rejects(
    saveBudgetItemRange('ledger_1', '2026-11', '2027-01', {
      categoryId: 'cat_food',
      budgetContainerId: 'bc_life_2026-11',
      amountMinor: 120000,
    }),
    (error) => {
      assert.equal(error.code, 'budgeting.container.error.not_found_range')
      assert.deepEqual(error.monthKeys, ['2026-12'])
      return true
    },
  )

  assert.deepEqual(upsertCalls, [])
})

test('saveBudgetContainer rejects auto save when a child item already saves', async () => {
  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: 'budget_current', month_key: monthKey }
    },
    async listBudgetContainers() {
      return [{ id: 'bc_life', name: '生活費' }]
    },
    async listBudgetItems() {
      return [{ id: 'bi_food', budget_container_id: 'bc_life', budget_save_enabled: 1 }]
    },
    async findAccountById(_ledgerId, accountId) {
      return { id: accountId, currency_code: 'TWD' }
    },
    async isSavingsJarAccount(_ledgerId, accountId) {
      return accountId === 'jar_trip'
    },
    async upsertBudgetContainer() {
      throw new Error('should not save')
    },
  })

  await assert.rejects(
    saveBudgetContainer('ledger_1', '2026-03', {
      id: 'bc_life',
      name: '生活費',
      amountMinor: 100000,
      budgetSaveEnabled: true,
      budgetSaveTargetAccountId: 'jar_trip',
      budgetSaveSourceAccountId: 'acc_main',
    }),
    { code: 'budgeting.budget_save.error.group_conflict' },
  )
})

test('resolveContainerMonthlyAmountMinor multiplies daily pool amount by days in month', () => {
  assert.equal(
    resolveContainerMonthlyAmountMinor({ amount_minor: 10000, period_mode: 'daily' }, '2026-03'),
    310000,
  )
  assert.equal(
    resolveContainerMonthlyAmountMinor({ amount_minor: 10000, period_mode: 'monthly' }, '2026-03'),
    10000,
  )
})

test('saveBudgetContainerRange creates independent fixed monthly pools across months', async () => {
  const createdBudgets = []
  const upsertContainerCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers() {
      return []
    },
    async listBudgetItems() {
      return []
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      upsertContainerCalls.push(payload)
      return payload.id
    },
    async createBudget(_ledgerId, payload) {
      createdBudgets.push(payload)
      return { id: `budget_${payload.monthKey}`, month_key: payload.monthKey }
    },
  })

  const result = await saveBudgetContainerRange('ledger_1', '2026-01', '2026-03', {
    name: '生活費',
    amountMinor: 100000,
    periodMode: 'monthly',
  })

  assert.deepEqual(result.monthKeys, ['2026-01', '2026-02', '2026-03'])
  assert.equal(result.containerIds.length, 3)
  assert.equal(new Set(result.containerIds).size, 3)
  assert.deepEqual(createdBudgets, [])
  assert.deepEqual(
    upsertContainerCalls.map((call) => ({
      budgetId: call.budgetId,
      name: call.name,
      amountMinor: call.amountMinor,
      periodMode: call.periodMode,
    })),
    [
      { budgetId: 'budget_2026-01', name: '生活費', amountMinor: 100000, periodMode: 'monthly' },
      { budgetId: 'budget_2026-02', name: '生活費', amountMinor: 100000, periodMode: 'monthly' },
      { budgetId: 'budget_2026-03', name: '生活費', amountMinor: 100000, periodMode: 'monthly' },
    ],
  )
})

test('saveBudgetContainerRange copies daily pool bindings and keeps per-month day counts independent', async () => {
  const upsertItemCalls = []
  const upsertContainerCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers() {
      return []
    },
    async listBudgetItems() {
      return []
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      upsertContainerCalls.push(payload)
      return payload.id
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertItemCalls.push(payload)
      return payload.id ?? `bi_${upsertItemCalls.length}`
    },
    async deleteBudgetItem() {},
  })

  const result = await saveBudgetContainerRange('ledger_1', '2026-02', '2026-03', {
    name: '日用',
    amountMinor: 10000,
    periodMode: 'daily',
    categoryIds: ['cat_food'],
  })

  assert.deepEqual(result.monthKeys, ['2026-02', '2026-03'])
  assert.equal(upsertContainerCalls.length, 2)
  assert.equal(upsertItemCalls.length, 2)
  assert.deepEqual(
    upsertItemCalls.map((call) => ({ budgetId: call.budgetId, categoryId: call.categoryId, amountMinor: call.amountMinor })),
    [
      { budgetId: 'budget_2026-02', categoryId: 'cat_food', amountMinor: 0 },
      { budgetId: 'budget_2026-03', categoryId: 'cat_food', amountMinor: 0 },
    ],
  )
  assert.equal(resolveContainerMonthlyAmountMinor({ amount_minor: 10000, period_mode: 'daily' }, '2026-02'), 280000)
  assert.equal(resolveContainerMonthlyAmountMinor({ amount_minor: 10000, period_mode: 'daily' }, '2026-03'), 310000)
})

test('saveBudgetContainerRange copies budget save configuration to every generated month', async () => {
  const upsertContainerCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers() {
      return []
    },
    async listBudgetItems() {
      return []
    },
    async findAccountById(_ledgerId, accountId) {
      return { id: accountId, currency_code: 'TWD' }
    },
    async isSavingsJarAccount(_ledgerId, accountId) {
      return accountId === 'jar_trip'
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      upsertContainerCalls.push(payload)
      return payload.id
    },
  })

  await saveBudgetContainerRange('ledger_1', '2026-11', '2027-01', {
    name: '旅費',
    amountMinor: 200000,
    budgetSaveEnabled: true,
    budgetSaveTargetAccountId: 'jar_trip',
    budgetSaveSourceAccountId: 'acc_main',
  })

  assert.equal(upsertContainerCalls.length, 3)
  assert.deepEqual(
    upsertContainerCalls.map((call) => ({
      budgetId: call.budgetId,
      budgetSaveEnabled: call.budgetSaveEnabled,
      target: call.budgetSaveTargetAccountId,
      source: call.budgetSaveSourceAccountId,
    })),
    [
      { budgetId: 'budget_2026-11', budgetSaveEnabled: true, target: 'jar_trip', source: 'acc_main' },
      { budgetId: 'budget_2026-12', budgetSaveEnabled: true, target: 'jar_trip', source: 'acc_main' },
      { budgetId: 'budget_2027-01', budgetSaveEnabled: true, target: 'jar_trip', source: 'acc_main' },
    ],
  )
})

test('saveBudgetContainerRange rejects middle-month name collision before writing any container', async () => {
  const upsertContainerCalls = []
  const createBudgetCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers(_ledgerId, budgetId) {
      if (budgetId === 'budget_2026-02') return [{ id: 'bc_existing', name: '生活費' }]
      return []
    },
    async listBudgetItems() {
      return []
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      upsertContainerCalls.push(payload)
      return payload.id
    },
    async createBudget(_ledgerId, payload) {
      createBudgetCalls.push(payload)
      return { id: `budget_${payload.monthKey}`, month_key: payload.monthKey }
    },
  })

  await assert.rejects(
    saveBudgetContainerRange('ledger_1', '2026-01', '2026-03', {
      name: '生活費',
      amountMinor: 100000,
    }),
    (error) => {
      assert.equal(error.code, 'budgeting.container.error.name_conflict_range')
      assert.deepEqual(error.monthKeys, ['2026-02'])
      return true
    },
  )

  assert.deepEqual(upsertContainerCalls, [])
  assert.deepEqual(createBudgetCalls, [])
})

test('saveBudgetContainerRange rejects daily pool savings conflict before writing any target month', async () => {
  const upsertContainerCalls = []
  const upsertItemCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers() {
      return []
    },
    async listBudgetItems(_ledgerId, budgetId) {
      if (budgetId === 'budget_2026-03') {
        return [{ id: 'bi_food', category_id: 'cat_food', budget_save_enabled: 1 }]
      }
      return []
    },
    async findAccountById(_ledgerId, accountId) {
      return { id: accountId, currency_code: 'TWD' }
    },
    async isSavingsJarAccount(_ledgerId, accountId) {
      return accountId === 'jar_trip'
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      upsertContainerCalls.push(payload)
      return payload.id
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertItemCalls.push(payload)
      return payload.id
    },
  })

  await assert.rejects(
    saveBudgetContainerRange('ledger_1', '2026-02', '2026-03', {
      name: '日用',
      amountMinor: 10000,
      periodMode: 'daily',
      categoryIds: ['cat_food'],
      budgetSaveEnabled: true,
      budgetSaveTargetAccountId: 'jar_trip',
      budgetSaveSourceAccountId: 'acc_main',
    }),
    { code: 'budgeting.budget_save.error.group_conflict' },
  )

  assert.deepEqual(upsertContainerCalls, [])
  assert.deepEqual(upsertItemCalls, [])
})

test('saveBudgetContainerRange rolls back daily pool child item mutations when later month write fails', async () => {
  const itemsByBudgetId = new Map([
    ['budget_2026-01', [{
      id: 'bi_rent_existing',
      budget_id: 'budget_2026-01',
      scope_type: 'category',
      category_id: 'cat_rent',
      category_group_id: null,
      budget_container_id: null,
      amount_minor: 50000,
      amount_mode: 'fixed',
      day_rule_unit: 'none',
      day_rule_values_json: '[]',
      budget_save_enabled: 0,
      budget_save_target_account_id: null,
      budget_save_source_account_id: null,
      sort_order: 7,
    }]],
    ['budget_2026-02', []],
  ])
  const deletedItemIds = []
  const deletedContainerIds = []
  const restoredItemCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: `budget_${monthKey}`, month_key: monthKey }
    },
    async listBudgetContainers() {
      return []
    },
    async listBudgetItems(_ledgerId, budgetId) {
      return (itemsByBudgetId.get(budgetId) ?? []).map((item) => ({ ...item }))
    },
    async upsertBudgetContainer(_ledgerId, payload) {
      return payload.id
    },
    async upsertBudgetItem(_ledgerId, payload) {
      if (payload.budgetId === 'budget_2026-02') {
        throw new Error('simulated child item failure')
      }

      const id = payload.id ?? 'bi_food_created'
      const next = {
        id,
        budget_id: payload.budgetId,
        scope_type: payload.scopeType,
        category_id: payload.categoryId,
        category_group_id: payload.categoryGroupId,
        budget_container_id: payload.budgetContainerId,
        amount_minor: payload.amountMinor,
        amount_mode: payload.amountMode,
        day_rule_unit: payload.dayRuleUnit,
        day_rule_values_json: payload.dayRuleValuesJson,
        budget_save_enabled: payload.budgetSaveEnabled ? 1 : 0,
        budget_save_target_account_id: payload.budgetSaveTargetAccountId,
        budget_save_source_account_id: payload.budgetSaveSourceAccountId,
        sort_order: payload.sortOrder,
      }
      const rows = itemsByBudgetId.get(payload.budgetId) ?? []
      const index = rows.findIndex((item) => item.id === id)
      if (index >= 0) rows[index] = next
      else rows.push(next)
      itemsByBudgetId.set(payload.budgetId, rows)

      if (id === 'bi_rent_existing' && payload.amountMinor === 50000) {
        restoredItemCalls.push(payload)
      }
      return id
    },
    async deleteBudgetItem(_ledgerId, itemId) {
      deletedItemIds.push(itemId)
      for (const [budgetId, rows] of itemsByBudgetId.entries()) {
        itemsByBudgetId.set(budgetId, rows.filter((item) => item.id !== itemId))
      }
    },
    async deleteBudgetContainer(_ledgerId, containerId) {
      deletedContainerIds.push(containerId)
      for (const [budgetId, rows] of itemsByBudgetId.entries()) {
        itemsByBudgetId.set(
          budgetId,
          rows.map((item) => (
            String(item.budget_container_id ?? '') === String(containerId)
              ? { ...item, budget_container_id: null }
              : item
          )),
        )
      }
    },
  })

  await assert.rejects(
    saveBudgetContainerRange('ledger_1', '2026-01', '2026-02', {
      name: '日用',
      amountMinor: 10000,
      periodMode: 'daily',
      categoryIds: ['cat_food', 'cat_rent'],
    }),
    /simulated child item failure/,
  )

  assert.deepEqual(deletedItemIds, ['bi_food_created'])
  assert.equal(deletedContainerIds.length, 2)
  assert.equal(restoredItemCalls.length, 1)
  assert.deepEqual(itemsByBudgetId.get('budget_2026-01'), [{
    id: 'bi_rent_existing',
    budget_id: 'budget_2026-01',
    scope_type: 'category',
    category_id: 'cat_rent',
    category_group_id: null,
    budget_container_id: null,
    amount_minor: 50000,
    amount_mode: 'fixed',
    day_rule_unit: 'none',
    day_rule_values_json: '[]',
    budget_save_enabled: 0,
    budget_save_target_account_id: null,
    budget_save_source_account_id: null,
    sort_order: 7,
  }])
})

test('saveBudgetContainer syncs daily pool categories without child budget amounts', async () => {
  const upsertItemCalls = []
  const deleteItemCalls = []

  setBudgetServiceDependenciesForTest({
    async getBudgetByMonth(_ledgerId, monthKey) {
      return { id: 'budget_current', month_key: monthKey }
    },
    async listBudgetContainers() {
      return [{ id: 'bc_daily', name: '日用' }]
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
        sort_order: 0,
      }, {
        id: 'bi_transport',
        category_id: 'cat_transport',
        budget_container_id: 'bc_daily',
        amount_minor: 0,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 0,
        sort_order: 1,
      }]
    },
    async upsertBudgetContainer() {
      return 'bc_daily'
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertItemCalls.push(payload)
      return payload.id ?? `bi_${upsertItemCalls.length}`
    },
    async deleteBudgetItem(_ledgerId, itemId) {
      deleteItemCalls.push(itemId)
    },
  })

  await saveBudgetContainer('ledger_1', '2026-03', {
    id: 'bc_daily',
    name: '日用',
    amountMinor: 50000,
    periodMode: 'daily',
    categoryIds: ['cat_food', 'cat_fun'],
    budgetSaveEnabled: false,
  })

  assert.equal(deleteItemCalls.length, 1)
  assert.equal(deleteItemCalls[0], 'bi_transport')
  assert.equal(upsertItemCalls.length, 2)
  assert.deepEqual(
    upsertItemCalls.map((call) => ({
      categoryId: call.categoryId,
      budgetContainerId: call.budgetContainerId,
      amountMinor: call.amountMinor,
      amountMode: call.amountMode,
    })),
    [
      { categoryId: 'cat_food', budgetContainerId: 'bc_daily', amountMinor: 0, amountMode: 'fixed' },
      { categoryId: 'cat_fun', budgetContainerId: 'bc_daily', amountMinor: 0, amountMode: 'fixed' },
    ],
  )
})
