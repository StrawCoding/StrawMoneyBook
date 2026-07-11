import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  copyPreviousMonthBudget,
  listInclusiveMonthKeys,
  resetBudgetServiceDependenciesForTest,
  resolveContainerMonthlyAmountMinor,
  saveBudgetContainer,
  saveBudgetContainerRange,
  saveBudgetItem,
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
