import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAnalysisDetailRows,
  buildAnalysisReportPdfFilename,
  buildBudgetAchievementCards,
  formatTagsLabel,
  parseTagsJson,
  resolveReportMonthKey,
} from '../src/core/utils/analysis-report.js'

test('analysis report filename uses 交易報表_YYYY-MM.pdf', () => {
  assert.equal(
    buildAnalysisReportPdfFilename({ mode: 'month', monthKey: '2026-07' }),
    '交易報表_2026-07.pdf',
  )
  assert.equal(resolveReportMonthKey({ mode: 'day', dayKey: '2026-03-15' }), '2026-03')
  assert.equal(resolveReportMonthKey({ mode: 'year', yearKey: '2025' }), '2025-01')
})

test('analysis report parses tags_json and builds iconized detail rows', () => {
  assert.deepEqual(parseTagsJson('["午餐","外送"]'), ['午餐', '外送'])
  assert.equal(formatTagsLabel('["午餐","外送"]'), '午餐、外送')

  const rows = buildAnalysisDetailRows([
    {
      id: 'tx-1',
      occurred_at: '2026-07-01T10:00:00.000Z',
      type: 'expense',
      category_name: '餐飲',
      category_icon: 'fa-solid fa-utensils',
      account_name: '現金',
      account_icon: 'fa-solid fa-wallet',
      amount_minor: -12000,
      note: '便當',
      tags_json: '["午餐"]',
    },
  ], {
    typeLabel: (type) => (type === 'expense' ? '支出' : type),
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].categoryIcon, 'fa-solid fa-utensils')
  assert.equal(rows[0].accountIcon, 'fa-solid fa-wallet')
  assert.equal(rows[0].tagsText, '午餐')
  assert.equal(rows[0].amountText, '-120')
})

test('budget achievement cards list every budget without collapsing into other', () => {
  const cards = buildBudgetAchievementCards({
    containers: [{ id: 'c1', name: '生活池', budgetMinor: 10000, spentMinor: 2500 }],
    items: [
      { id: 'i1', category_id: 'food', resolved_amount_minor: 5000 },
      { id: 'i2', category_id: 'transport', amount_minor: 2000, budget_container_id: 'c1' },
    ],
    spentMap: { food: 1000, transport: 500 },
    categoryNameMap: new Map([['food', '餐飲'], ['transport', '交通']]),
    categoryIconMap: new Map([['food', 'fa-solid fa-utensils']]),
  })

  assert.equal(cards.length, 2)
  assert.equal(cards[0].name, '生活池')
  assert.equal(cards[1].name, '餐飲')
  assert.equal(cards[1].percent, 20)
})

test('analysis export/pdf wiring keeps html2canvas+jsPDF and shared iconized charts', () => {
  const pdfService = readFileSync(resolve(import.meta.dirname, '../src/core/services/analysis-report-pdf.service.js'), 'utf8')
  const printPage = readFileSync(resolve(import.meta.dirname, '../src/ui/views/AnalysisPrintPage.vue'), 'utf8')
  const analysisPage = readFileSync(resolve(import.meta.dirname, '../src/ui/views/analysis.vue'), 'utf8')
  const reportDocument = readFileSync(resolve(import.meta.dirname, '../src/ui/components/analysis/AnalysisReportDocument.vue'), 'utf8')
  const breakdown = readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-breakdown.js'), 'utf8')
  const exportService = readFileSync(resolve(import.meta.dirname, '../src/core/services/export.service.js'), 'utf8')
  const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))

  assert.match(pdfService, /import html2canvas from 'html2canvas'/)
  assert.match(pdfService, /import \{ jsPDF \} from 'jspdf'/)
  assert.match(pdfService, /buildAnalysisReportPdfFromElement/)
  assert.match(pdfService, /sliceCanvasToPdfPages/)
  assert.match(pdfService, /sanitizeCloneForHtml2Canvas/)
  assert.match(pdfService, /applyAnalysisReportLightThemeInline/)
  assert.match(pdfService, /color-scheme:\s*light|ANALYSIS_REPORT_LIGHT_THEME|buildAnalysisReportLightThemeCssText/)
  assert.match(pdfService, /onclone:/)
  assert.match(printPage, /AnalysisReportDocument/)
  assert.match(printPage, /buildAnalysisReportPdfFromElement/)
  assert.match(printPage, /交易報表_|buildAnalysisReportPdfFilename/)
  assert.match(printPage, /data-testid="analysis-export-pdf-btn"/)
  assert.match(printPage, /color-scheme:\s*light/)
  assert.match(reportDocument, /analysis-report-light-scope/)
  assert.match(reportDocument, /data-export-color-scheme="light"/)
  assert.match(reportDocument, /color-scheme:\s*light/)
  assert.match(reportDocument, /applyAnalysisReportLightThemeInline/)
  assert.match(breakdown, /hsl\(\$\{hue\.toFixed\(2\)\}deg 72% 58%\)/)
  assert.doesNotMatch(breakdown, /color-mix\(in srgb, hsl\(\$\{hue\.toFixed\(2\)\}deg[\s\S]*var\(--card\)/)
  assert.match(analysisPage, /AnalysisIconizedChartPair/)
  assert.match(analysisPage, /data-testid="analysis-income-charts"|test-id="analysis-income-charts"/)
  assert.match(exportService, /a\.icon AS account_icon/)
  assert.match(exportService, /t\.tags_json/)
  assert.equal(packageJson.scripts['playwright:analysis-export'], 'node scripts/playwright-analysis-export.mjs')
})
