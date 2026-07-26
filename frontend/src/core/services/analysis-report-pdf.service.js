import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { buildAnalysisReportPdfFilename } from '@/core/utils/analysis-report'
import {
  applyAnalysisReportLightThemeInline,
  buildAnalysisReportLightThemeCssText,
} from '@/core/utils/analysis-report-light-theme'
import {
  ANALYSIS_REPORT_PDF_PAGE,
  computePdfSlicePlan,
  prepareAnalysisReportElementForPdfCapture,
} from '@/core/utils/analysis-report-pdf-layout'

const PAGE_WIDTH_PX = ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX
const PAGE_HEIGHT_PX = ANALYSIS_REPORT_PDF_PAGE.HEIGHT_PX
const PRINT_LAYOUT_ATTR = ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR
const PRINT_LAYOUT_VALUE = ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_VALUE

export {
  ANALYSIS_REPORT_PDF_PAGE,
  computePdfSlicePlan,
  prepareAnalysisReportElementForPdfCapture,
}

async function waitForLayout() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function clampPositive(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

export function sanitizeCloneForHtml2Canvas(clonedDoc) {
  const root = clonedDoc.documentElement
  if (root) {
    root.dataset.themeMode = 'light'
    applyAnalysisReportLightThemeInline(root, { important: true })
  }
  if (clonedDoc.body) {
    applyAnalysisReportLightThemeInline(clonedDoc.body, { important: true })
  }

  const style = clonedDoc.createElement('style')
  style.setAttribute('data-analysis-report-light-theme', '1')
  style.textContent = [
    buildAnalysisReportLightThemeCssText(':root, html, body'),
    buildAnalysisReportLightThemeCssText('#analysis-report-document, .analysis-report-document, .analysis-report-light-scope'),
    // Force A4 print layout in the clone regardless of viewport media queries.
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .pair-layout { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .big-numbers { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; display: grid !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .budget-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .report-header { display: flex !important; align-items: flex-start !important; justify-content: space-between !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .meta-grid { min-width: 220px !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .table-wrap { overflow: visible !important; }`,
    `#analysis-report-document[${PRINT_LAYOUT_ATTR}="${PRINT_LAYOUT_VALUE}"] .report-table { table-layout: fixed !important; width: 100% !important; }`,
  ].join('\n')
  clonedDoc.head?.appendChild(style)

  const report = clonedDoc.getElementById('analysis-report-document')
    || clonedDoc.querySelector('.analysis-report-document')
  if (report) {
    applyAnalysisReportLightThemeInline(report, { important: true })
    report.setAttribute(PRINT_LAYOUT_ATTR, PRINT_LAYOUT_VALUE)
    report.style.setProperty('width', `${PAGE_WIDTH_PX}px`, 'important')
    report.style.setProperty('max-width', `${PAGE_WIDTH_PX}px`, 'important')
    report.style.setProperty('min-width', `${PAGE_WIDTH_PX}px`, 'important')
    report.style.setProperty('box-sizing', 'border-box', 'important')
  }

  const rewriteValue = (value) => {
    const text = String(value ?? '')
    if (!text.includes('color-mix') && !/\bcolor\s*\(/i.test(text)) return text
    if (/gradient/i.test(text)) return '#ffffff'
    return '#64748b'
  }

  for (const sheet of [...(clonedDoc.styleSheets || [])]) {
    let rules = []
    try {
      rules = [...sheet.cssRules]
    } catch {
      continue
    }
    for (const rule of rules) {
      if (!rule?.style) continue
      for (const prop of [...rule.style]) {
        const value = rule.style.getPropertyValue(prop)
        const next = rewriteValue(value)
        if (next !== value) {
          rule.style.setProperty(prop, next, 'important')
        }
      }
    }
  }

  for (const node of clonedDoc.querySelectorAll('*')) {
    if (!(node instanceof clonedDoc.defaultView.HTMLElement) && !(node instanceof clonedDoc.defaultView.SVGElement)) {
      continue
    }
    const inline = node.getAttribute('style')
    if (!inline) continue
    if (!inline.includes('color-mix') && !/\bcolor\s*\(/i.test(inline)) continue
    node.setAttribute(
      'style',
      inline
        .split(';')
        .map((part) => {
          const [rawProp, ...rest] = part.split(':')
          if (!rawProp || !rest.length) return part
          const prop = rawProp.trim()
          const value = rest.join(':').trim()
          return `${prop}: ${rewriteValue(value)}`
        })
        .join(';'),
    )
  }
}

export async function renderElementToCanvas(element, options = {}) {
  if (!element) {
    throw new Error('找不到報表預覽元素')
  }
  await waitForLayout()
  const width = clampPositive(options.width ?? element.scrollWidth ?? element.clientWidth, PAGE_WIDTH_PX)
  const height = clampPositive(options.height ?? element.scrollHeight ?? element.clientHeight, PAGE_HEIGHT_PX)
  return html2canvas(element, {
    scale: options.scale ?? 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    onclone: (clonedDoc) => {
      sanitizeCloneForHtml2Canvas(clonedDoc)
      if (typeof options.onclone === 'function') {
        options.onclone(clonedDoc)
      }
    },
  })
}

export function sliceCanvasToPdfPages(canvas, pdf, {
  pageWidthPt,
  pageHeightPt,
  drawPageNumber,
  pageLabel = (page, total) => `${page} / ${total}`,
} = {}) {
  const plan = computePdfSlicePlan(canvas.width, canvas.height, pageWidthPt, pageHeightPt)

  for (const page of plan.pages) {
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    // Full A4 page canvas height so content is never vertically stretched.
    pageCanvas.height = Math.max(1, Math.ceil(plan.pageHeightPx))
    const context = pageCanvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(
      canvas,
      0,
      page.sourceY,
      canvas.width,
      page.sourceHeight,
      0,
      0,
      canvas.width,
      page.sourceHeight,
    )

    if (page.pageIndex > 0) {
      pdf.addPage()
    }
    const imageData = pageCanvas.toDataURL('image/png')
    // Always draw onto full page height; residual area stays white (no stretch).
    pdf.addImage(imageData, 'PNG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST')

    if (drawPageNumber !== false) {
      pdf.setFontSize(9)
      pdf.setTextColor(100)
      pdf.text(pageLabel(page.pageIndex + 1, plan.pageCount), pageWidthPt / 2, pageHeightPt - 18, { align: 'center' })
    }
  }

  return plan.pageCount
}

export async function buildAnalysisReportPdfFromElement(element, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('目前環境不支援 PDF 匯出')
  }
  if (!element) {
    throw new Error('找不到報表預覽元素')
  }

  const prepared = prepareAnalysisReportElementForPdfCapture(element, {
    widthPx: options.width ?? PAGE_WIDTH_PX,
  })
  try {
    await waitForLayout()
    // Allow fonts/icons one more frame after forced A4 width reflow.
    await waitForLayout()

    const captureWidth = prepared.widthPx
    const captureHeight = clampPositive(element.scrollHeight, PAGE_HEIGHT_PX)
    const canvas = await renderElementToCanvas(element, {
      scale: options.scale ?? 2,
      width: captureWidth,
      height: captureHeight,
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    })
    const pageWidthPt = pdf.internal.pageSize.getWidth()
    const pageHeightPt = pdf.internal.pageSize.getHeight()
    const pageCount = sliceCanvasToPdfPages(canvas, pdf, {
      pageWidthPt,
      pageHeightPt,
      drawPageNumber: options.drawPageNumber !== false,
      pageLabel: options.pageLabel,
    })

    return {
      filename: options.filename || buildAnalysisReportPdfFilename(options),
      blob: pdf.output('blob'),
      pageCount,
      captureWidth,
      captureHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    }
  } finally {
    prepared.restore()
  }
}
