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

test('pdf slice plan keeps equal scale and does not stretch residual last page', async () => {
  const {
    computePdfSlicePlan,
    prepareAnalysisReportElementForPdfCapture,
    ANALYSIS_REPORT_PDF_PAGE,
  } = await import('../src/core/utils/analysis-report-pdf-layout.js')

  const a4WidthPt = 595.28
  const a4HeightPt = 841.89
  const canvasWidth = 794 * 2
  const contentWidthPt = a4WidthPt - ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT * 2
  const usablePagePx = canvasWidth * (
    (a4HeightPt - ANALYSIS_REPORT_PDF_PAGE.FOOTER_MARGIN_PT - ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT)
    / contentWidthPt
  )
  const fullPagePx = canvasWidth * (a4HeightPt / contentWidthPt)
  const canvasHeight = Math.round(usablePagePx * 1.4)

  const plan = computePdfSlicePlan(canvasWidth, canvasHeight, a4WidthPt, a4HeightPt)
  assert.equal(plan.pageCount, 2)
  assert.ok(Math.abs(plan.pages[0].drawHeightPt - (a4HeightPt - ANALYSIS_REPORT_PDF_PAGE.FOOTER_MARGIN_PT - ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT)) < 1.5)
  assert.ok(plan.pages[0].drawHeightPt < a4HeightPt - 10)
  assert.ok(plan.pages[1].drawHeightPt < a4HeightPt - 1)
  assert.ok(plan.pages[1].drawHeightPt > a4HeightPt * 0.2)
  assert.equal(plan.pages[0].sourceY, 0)
  assert.equal(plan.pages[1].sourceY + plan.pages[1].sourceHeight, canvasHeight)
  assert.ok(plan.footerMarginPt >= 24)
  assert.ok(plan.pageMarginPt >= 10)
  assert.ok(plan.usablePageHeightPx < fullPagePx)

  const el = {
    style: {},
    attrs: new Map(),
    getAttribute(name) {
      return this.attrs.has(name) ? this.attrs.get(name) : null
    },
    setAttribute(name, value) {
      this.attrs.set(name, value)
    },
    removeAttribute(name) {
      this.attrs.delete(name)
    },
  }
  const prepared = prepareAnalysisReportElementForPdfCapture(el, { widthPx: ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX })
  assert.equal(el.style.width, '794px')
  assert.equal(el.style.overflow, 'visible')
  assert.equal(el.getAttribute(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR), ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_VALUE)
  prepared.restore()
  assert.equal(el.getAttribute(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR), null)
})

test('pdf slice plan avoids cutting through protected content ranges', async () => {
  const {
    computePdfSlicePlan,
    resolvePdfPageBreak,
    scaleAvoidRangesToCanvas,
    ANALYSIS_REPORT_PDF_PAGE,
  } = await import('../src/core/utils/analysis-report-pdf-layout.js')

  const a4WidthPt = 595.28
  const a4HeightPt = 841.89
  const canvasWidth = 794 * 2
  const contentWidthPt = a4WidthPt - ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT * 2
  const usablePagePx = canvasWidth * (
    (a4HeightPt - ANALYSIS_REPORT_PDF_PAGE.FOOTER_MARGIN_PT - ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT)
    / contentWidthPt
  )
  // Place a protected block that straddles the naive first-page cut.
  const blockTop = usablePagePx - 120
  const blockBottom = usablePagePx + 220
  const canvasHeight = Math.round(usablePagePx + 500)
  const avoid = scaleAvoidRangesToCanvas([{ top: blockTop / 2, bottom: blockBottom / 2 }], 2)

  const breakAt = resolvePdfPageBreak(0, usablePagePx, canvasHeight, avoid)
  assert.ok(breakAt <= blockTop + 1, `break should move before protected block: ${breakAt} vs ${blockTop}`)
  assert.ok(breakAt < usablePagePx, 'break should be earlier than naive page end')

  const plan = computePdfSlicePlan(canvasWidth, canvasHeight, a4WidthPt, a4HeightPt, {
    footerMarginPt: ANALYSIS_REPORT_PDF_PAGE.FOOTER_MARGIN_PT,
    pageMarginPt: ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT,
    avoidRangesCanvasPx: avoid,
  })
  assert.ok(plan.pageCount >= 2)
  for (const page of plan.pages) {
    const end = page.sourceY + page.sourceHeight
    const cutsThrough = page.sourceY < blockTop - 0.5
      && end > blockTop + 0.5
      && end < blockBottom - 0.5
    assert.equal(
      cutsThrough,
      false,
      `page must not cut mid-block: ${JSON.stringify({ page, blockTop, blockBottom })}`,
    )
  }
  assert.ok(
    plan.pages.some((page) => Math.abs(page.sourceY - blockTop) <= 2 || (page.sourceY <= blockTop && page.sourceY + page.sourceHeight >= blockBottom)),
    `protected block should land wholly on a page: ${JSON.stringify(plan.pages)}`,
  )
})

test('analysis export/pdf wiring keeps html2canvas+jsPDF and shared iconized charts', () => {
  const pdfService = readFileSync(resolve(import.meta.dirname, '../src/core/services/analysis-report-pdf.service.js'), 'utf8')
  const printPage = readFileSync(resolve(import.meta.dirname, '../src/ui/views/AnalysisPrintPage.vue'), 'utf8')
  const analysisPage = readFileSync(resolve(import.meta.dirname, '../src/ui/views/analysis.vue'), 'utf8')
  const reportDocument = readFileSync(resolve(import.meta.dirname, '../src/ui/components/analysis/AnalysisReportDocument.vue'), 'utf8')
  const chartPair = readFileSync(resolve(import.meta.dirname, '../src/ui/components/analysis/AnalysisIconizedChartPair.vue'), 'utf8')
  const breakdown = readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-breakdown.js'), 'utf8')
  const exportService = readFileSync(resolve(import.meta.dirname, '../src/core/services/export.service.js'), 'utf8')
  const appleUi = readFileSync(resolve(import.meta.dirname, '../src/ui/assets/css/apple-ui.css'), 'utf8')
  const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))

  assert.match(pdfService, /import html2canvas from 'html2canvas'/)
  assert.match(pdfService, /import \{ jsPDF \} from 'jspdf'/)
  assert.match(pdfService, /buildAnalysisReportPdfFromElement/)
  assert.match(pdfService, /sliceCanvasToPdfPages/)
  assert.match(pdfService, /computePdfSlicePlan/)
  assert.match(pdfService, /prepareAnalysisReportElementForPdfCapture/)
  assert.match(pdfService, /collectAnalysisReportPdfAvoidRanges/)
  assert.match(pdfService, /scaleAvoidRangesToCanvas/)
  assert.match(pdfService, /FOOTER_MARGIN_PT|footerMarginPt/)
  assert.match(pdfService, /PAGE_MARGIN_PT|pageMarginPt/)
  assert.match(pdfService, /sanitizeCloneForHtml2Canvas/)
  assert.match(pdfService, /applyAnalysisReportLightThemeInline/)
  assert.match(pdfService, /color-scheme:\s*light|ANALYSIS_REPORT_LIGHT_THEME|buildAnalysisReportLightThemeCssText/)
  assert.match(pdfService, /onclone:/)
  assert.match(pdfService, /PRINT_LAYOUT_ATTR|data-print-layout/)
  assert.match(pdfService, /break-inside:\s*avoid|page-break-inside:\s*avoid/)
  assert.match(
    readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-report-pdf-layout.js'), 'utf8'),
    /PRINT_LAYOUT_ATTR:\s*'data-print-layout'/,
  )
  assert.match(
    readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-report-pdf-layout.js'), 'utf8'),
    /export function computePdfSlicePlan/,
  )
  assert.match(
    readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-report-pdf-layout.js'), 'utf8'),
    /export function collectAnalysisReportPdfAvoidRanges/,
  )
  assert.match(
    readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-report-pdf-layout.js'), 'utf8'),
    /FOOTER_MARGIN_PT/,
  )
  assert.match(printPage, /AnalysisReportDocument/)
  assert.match(printPage, /buildAnalysisReportPdfFromElement/)
  assert.match(printPage, /交易報表_|buildAnalysisReportPdfFilename/)
  assert.match(printPage, /data-testid="analysis-export-pdf-btn"/)
  assert.match(printPage, /data-testid="analysis-export-controls"/)
  assert.match(printPage, /data-testid="analysis-export-preview-chrome"/)
  assert.match(printPage, /report-preview-frame/)
  assert.match(printPage, /background:\s*var\(--card\)/)
  assert.doesNotMatch(printPage, /\.preview-panel\s*\{[^}]*color-scheme:\s*light/)
  assert.doesNotMatch(printPage, /\.preview-panel\s*\{[^}]*background:\s*#f8fafc/)
  assert.match(reportDocument, /analysis-report-light-scope/)
  assert.match(reportDocument, /data-export-color-scheme="light"/)
  assert.match(reportDocument, /color-scheme:\s*light/)
  assert.match(reportDocument, /applyAnalysisReportLightThemeInline/)
  assert.match(reportDocument, /data-print-layout='a4'/)
  assert.match(chartPair, /data-print-layout='a4'/)
  assert.match(breakdown, /hsl\(\$\{hue\.toFixed\(2\)\}deg 72% 58%\)/)
  assert.doesNotMatch(breakdown, /color-mix\(in srgb, hsl\(\$\{hue\.toFixed\(2\)\}deg[\s\S]*var\(--card\)/)
  assert.match(analysisPage, /AnalysisIconizedChartPair/)
  assert.match(analysisPage, /data-testid="analysis-income-charts"|test-id="analysis-income-charts"/)
  assert.match(analysisPage, /data-testid="analysis-export-direct-btn"/)
  assert.match(analysisPage, /exportPdfDirect|buildAnalysisReportPdfFromElement/)
  assert.match(analysisPage, /analysis-export-capture-host/)
  assert.match(analysisPage, /data-light-pdf/)
  assert.match(analysisPage, /data-testid="analysis-print-link"/)
  assert.match(analysisPage, /analysis_page\.open_report|t\('analysis_page\.open_report'\)/)
  assert.match(analysisPage, /openFileUrl/)
  assert.match(printPage, /data-testid="analysis-export-open-file-btn"/)
  assert.match(printPage, /data-testid="analysis-export-mode-tabs"/)
  assert.match(printPage, /data-testid="analysis-export-mode-custom"/)
  assert.match(printPage, /analysis_print\.open_link|exportedActionLabel/)
  assert.match(printPage, /openFileUrl/)
  assert.match(chartPair, /background:\s*var\(--card\)/)
  assert.match(chartPair, /background:\s*var\(--chart-track\)/)
  assert.match(chartPair, /color:\s*var\(--muted\)/)
  assert.doesNotMatch(chartPair, /background:\s*#ffffff/)
  assert.doesNotMatch(chartPair, /background:\s*#f8fafc/)
  assert.match(appleUi, /\.export-page \.mode-tabs/)
  assert.match(exportService, /a\.icon AS account_icon/)
  assert.match(exportService, /t\.tags_json/)
  assert.equal(packageJson.scripts['playwright:analysis-export'], 'node scripts/playwright-analysis-export.mjs')
})
