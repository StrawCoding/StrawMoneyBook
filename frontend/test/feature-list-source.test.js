import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const featureListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/FeatureListPage.vue'),
  'utf8',
)
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)
const featuresMapSource = readFileSync(
  resolve(import.meta.dirname, '../StrawMoneyBook_Features_Map.md'),
  'utf8',
)
const detailedDocSource = readFileSync(
  resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'),
  'utf8',
)

test('feature list exposes budget items with an icon', () => {
  assert.match(featureListSource, /to: '\/budget'/)
  assert.match(featureListSource, /feature_list\.budget_items/)
  assert.match(featureListSource, /fa-solid fa-chart-pie/)
  assert.match(i18nSource, /'feature_list\.budget_items': '預算項目'/)
})

test('feature list docs include the budget items entry', () => {
  assert.match(featuresMapSource, /功能列表導覽[\s\S]*預算項目：`\/budget`/)
  assert.match(detailedDocSource, /功能列表已加入預算項目入口/)
})
