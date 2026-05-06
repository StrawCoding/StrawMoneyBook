import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifestSource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/AndroidManifest.xml'),
  'utf8',
)
const stringsSource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/res/values/strings.xml'),
  'utf8',
)
const pluginSource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/HomeWidgetPlugin.java'),
  'utf8',
)

test('Android manifest registers all five widget provider types', () => {
  assert.match(manifestSource, /StrawMoneyWidgetProvider/)
  assert.match(manifestSource, /StrawMoneyPieChartWidgetProvider/)
  assert.match(manifestSource, /StrawMoneyBarChartWidgetProvider/)
  assert.match(manifestSource, /StrawMoneyQuickAddWidgetProvider/)
  assert.match(manifestSource, /StrawMoneyAiBookkeepingWidgetProvider/)
})

test('Android widget string resources cover all catalog labels', () => {
  assert.match(stringsSource, /widget_catalog_summary_label/)
  assert.match(stringsSource, /widget_catalog_pie_label/)
  assert.match(stringsSource, /widget_catalog_bar_label/)
  assert.match(stringsSource, /widget_catalog_quick_add_label/)
  assert.match(stringsSource, /widget_catalog_ai_label/)
})

test('HomeWidgetPlugin declares all five WidgetKind values', () => {
  assert.match(pluginSource, /SUMMARY/)
  assert.match(pluginSource, /PIE_CHART/)
  assert.match(pluginSource, /BAR_CHART/)
  assert.match(pluginSource, /QUICK_ADD/)
  assert.match(pluginSource, /AI_BOOKKEEPING/)
})

test('chart widgets deep-link to analysis and quick-action widgets to their respective routes', () => {
  assert.match(pluginSource, /"analysis"/)
  assert.match(pluginSource, /"transactions\/quick-add"/)
  assert.match(pluginSource, /"ai-auto-bookkeeping"/)
})

test('HomeWidgetPlugin draws pie chart and bar chart bitmaps natively', () => {
  assert.match(pluginSource, /drawPieChart/)
  assert.match(pluginSource, /drawBarChart/)
})
