import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const analysisPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/analysis.vue'), 'utf8')
const detailPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/AnalysisCategoryDetailPage.vue'), 'utf8')
const printPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/AnalysisPrintPage.vue'), 'utf8')

test('analysis addon breakdown rows can navigate to detail pages', () => {
  assert.match(analysisPageSource, /isAddonBreakdownId/)
  assert.match(analysisPageSource, /categoryId: isAddon \? '__addon__' : String\(item\.id\)/)
  assert.match(analysisPageSource, /query\.addonId = String\(item\.id\)/)
  assert.match(detailPageSource, /const addonId = computed/)
  assert.match(detailPageSource, /projectAnalysisCategoryTransactions/)
  assert.match(detailPageSource, /loadAnalysisCategoryDetail/)
  assert.match(detailPageSource, /analysis_part_label/)
  assert.doesNotMatch(detailPageSource, /listTransactionsForAnalysis/)
})

test('analysis print report uses shared breakdown rows so addon items are included', () => {
  assert.match(printPageSource, /buildBreakdownRows/)
  assert.match(printPageSource, /from '@\/core\/utils\/analysis-breakdown'/)
  assert.match(printPageSource, /return buildBreakdownRows\(\{/)
  assert.match(printPageSource, /getAddonLabel: \(label\) => t\('analysis_page\.addon_item', \{ label \}\)/)
  assert.match(printPageSource, /AnalysisReportDocument/)
  assert.match(printPageSource, /buildAnalysisReportPdfFromElement/)
})
