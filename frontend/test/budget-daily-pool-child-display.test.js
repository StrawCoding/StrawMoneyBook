import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  isDailyPoolChildItem,
  itemDisplayBudgetMinor,
  itemDisplayRemainMinor,
  itemDisplaySpentMinor,
  itemDisplayUsedPercentLabel,
  itemDisplayUsedRatio,
} from '../src/core/services/budget.service.js'

const containers = [{
  id: 'pool-food',
  period_mode: 'daily',
  amount_minor: 20000,
  periodBudgetMinor: 620000,
}]
const child = {
  id: 'item-breakfast',
  category_id: 'cat-breakfast',
  budget_container_id: 'pool-food',
  amount_minor: 0,
  resolved_amount_minor: 0,
}
const standalone = {
  id: 'item-rent',
  category_id: 'cat-rent',
  amount_minor: 100000,
  resolved_amount_minor: 100000,
}
const spentMap = {
  'cat-breakfast': 440000,
  'cat-rent': 25000,
}

test('daily pool child shows period spent but stays out of budget math', () => {
  assert.equal(isDailyPoolChildItem(child, containers), true)
  assert.equal(itemDisplaySpentMinor(child, spentMap), 440000)
  assert.equal(itemDisplayBudgetMinor(child, containers), 0)
  assert.equal(itemDisplayRemainMinor(child, spentMap, containers), 0)
})

test('daily pool child used% is share of parent pool, not own zero budget', () => {
  assert.equal(itemDisplayUsedRatio(child, spentMap, containers), 440000 / 620000)
  assert.equal(itemDisplayUsedPercentLabel(child, spentMap, containers), '71%')
})

test('standalone item still uses own budget, spent, and remaining', () => {
  assert.equal(isDailyPoolChildItem(standalone, containers), false)
  assert.equal(itemDisplaySpentMinor(standalone, spentMap), 25000)
  assert.equal(itemDisplayBudgetMinor(standalone, containers), 100000)
  assert.equal(itemDisplayRemainMinor(standalone, spentMap, containers), 75000)
})

test('budget list surfaces use period spent for daily-pool children, not today spent', () => {
  const files = [
    '../src/ui/components/budget/BudgetCategoryTable.vue',
    '../src/ui/views/BudgetDisplayPage.vue',
    '../src/ui/views/budgeting.vue',
  ]
  for (const rel of files) {
    const source = readFileSync(resolve(import.meta.dirname, rel), 'utf8')
    assert.match(source, /itemDisplaySpentMinor/)
    assert.match(source, /itemDisplayBudgetMinor/)
    assert.match(source, /itemDisplayRemainMinor/)
    if (!rel.endsWith('BudgetDisplayPage.vue')) {
      assert.match(source, /itemDisplayUsedRatio/)
      assert.match(source, /budgeting\.display\.pool_share/)
      assert.doesNotMatch(source, /<BudgetProgressBar[\s\S]{0,80}v-if="!isDailyPoolChild\(item\)"/)
    }
    assert.doesNotMatch(source, /todaySpentMap\[item/)
    assert.doesNotMatch(source, /itemTodaySpentMinor/)
  }
})
