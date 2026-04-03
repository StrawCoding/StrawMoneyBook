import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  copyPreviousMonthBudget,
  resetBudgetServiceDependenciesForTest,
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
        amount_minor: 120000,
        amount_mode: 'fixed',
        day_rule_unit: 'none',
        day_rule_values_json: '[]',
        budget_save_enabled: 1,
        budget_save_target_account_id: 'jar_trip',
        budget_save_source_account_id: 'acc_main',
      }]
    },
    async upsertBudgetItem(_ledgerId, payload) {
      upsertCalls.push(payload)
      return payload.id
    },
    async updateBudgetSaveTotalConfig(_ledgerId, budgetId, payload) {
      totalConfigCalls.push({ budgetId, payload })
    },
    async deleteBudgetItemsByBudget() {},
    async createBudget() {
      throw new Error('should not create current budget')
    },
  })

  const result = await copyPreviousMonthBudget('ledger_1', '2026-03', { replaceExisting: true })

  assert.deepEqual(result, { copied: 1, fromMonth: '2026-02' })
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].budgetSaveEnabled, true)
  assert.equal(upsertCalls[0].budgetSaveTargetAccountId, 'jar_trip')
  assert.equal(upsertCalls[0].budgetSaveSourceAccountId, 'acc_main')
  assert.deepEqual(totalConfigCalls, [{
    budgetId: 'budget_current',
    payload: {
      enabled: true,
      targetAccountId: 'jar_trip',
      sourceAccountId: 'acc_main',
    },
  }])
})
