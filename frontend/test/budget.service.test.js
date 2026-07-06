import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  copyPreviousMonthBudget,
  resetBudgetServiceDependenciesForTest,
  saveBudgetContainer,
  saveBudgetItem,
  setBudgetServiceDependenciesForTest,
} from '../src/core/services/budget.service.js'

afterEach(() => {
  resetBudgetServiceDependenciesForTest()
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
