import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildThemePalette } from '../src/core/utils/analysis-breakdown.js'
import {
  ANALYSIS_REPORT_LIGHT_THEME,
  applyAnalysisReportLightThemeInline,
  buildAnalysisReportLightThemeCssText,
  isDarkRgbColor,
  isLightRgbColor,
} from '../src/core/utils/analysis-report-light-theme.js'

test('analysis report light theme tokens stay solid and print-friendly', () => {
  assert.equal(ANALYSIS_REPORT_LIGHT_THEME.colorScheme, 'light')
  assert.equal(ANALYSIS_REPORT_LIGHT_THEME.background, '#ffffff')
  assert.equal(ANALYSIS_REPORT_LIGHT_THEME.text, '#0f172a')
  assert.equal(ANALYSIS_REPORT_LIGHT_THEME.vars['--card'], '#ffffff')
  assert.equal(ANALYSIS_REPORT_LIGHT_THEME.vars['--chart-track'], '#e2e8f0')
  assert.ok(isLightRgbColor(ANALYSIS_REPORT_LIGHT_THEME.background))
  assert.ok(isDarkRgbColor(ANALYSIS_REPORT_LIGHT_THEME.text))

  const css = buildAnalysisReportLightThemeCssText('.analysis-report-light-scope')
  assert.match(css, /color-scheme:\s*light !important/)
  assert.match(css, /--bg:\s*#ffffff !important/)
  assert.match(css, /--text:\s*#0f172a !important/)
})

test('buildThemePalette fallback uses solid hsl without dark-mode var(--card)', () => {
  const palette = buildThemePalette(14, ['#ff6b6b'])
  assert.equal(palette[0], '#ff6b6b')
  assert.match(palette[1], /^hsl\(\d+\.\d+deg 72% 58%\)$/)
  assert.equal(palette.every((color) => !String(color).includes('color-mix')), true)
  assert.equal(palette.every((color) => !String(color).includes('var(--card)')), true)
})

test('applyAnalysisReportLightThemeInline overrides dark theme inline vars', () => {
  const el = {
    style: {
      props: new Map(),
      setProperty(name, value, priority) {
        this.props.set(name, { value, priority })
      },
    },
    dataset: {},
  }
  applyAnalysisReportLightThemeInline(el, { important: true })
  assert.equal(el.style.props.get('color-scheme').value, 'light')
  assert.equal(el.style.props.get('background').value, '#ffffff')
  assert.equal(el.style.props.get('--text').value, '#0f172a')
  assert.equal(el.style.props.get('--card').priority, 'important')
  assert.equal(el.dataset.exportColorScheme, 'light')
})

test('analysis light-theme source wiring covers print preview and pdf clone path', () => {
  const lightTheme = readFileSync(resolve(import.meta.dirname, '../src/core/utils/analysis-report-light-theme.js'), 'utf8')
  const pdfService = readFileSync(resolve(import.meta.dirname, '../src/core/services/analysis-report-pdf.service.js'), 'utf8')
  const reportDocument = readFileSync(resolve(import.meta.dirname, '../src/ui/components/analysis/AnalysisReportDocument.vue'), 'utf8')
  const printPage = readFileSync(resolve(import.meta.dirname, '../src/ui/views/AnalysisPrintPage.vue'), 'utf8')
  const playwright = readFileSync(resolve(import.meta.dirname, '../scripts/playwright-analysis-export.mjs'), 'utf8')

  assert.match(lightTheme, /ANALYSIS_REPORT_LIGHT_THEME/)
  assert.match(pdfService, /sanitizeCloneForHtml2Canvas/)
  assert.match(pdfService, /applyAnalysisReportLightThemeInline/)
  assert.match(pdfService, /buildAnalysisReportLightThemeCssText/)
  assert.match(reportDocument, /data-export-color-scheme="light"/)
  assert.match(reportDocument, /analysis-report-light-scope/)
  assert.match(printPage, /color-scheme:\s*light/)
  assert.match(playwright, /forceDarkTheme/)
  assert.match(playwright, /assertPrintPreviewLightTheme/)
  assert.match(playwright, /data-theme-mode|themeMode/)
})
