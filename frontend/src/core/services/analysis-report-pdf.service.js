import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { buildAnalysisReportPdfFilename } from '@/core/utils/analysis-report'

const PAGE_WIDTH_PX = 794
const PAGE_HEIGHT_PX = 1123

async function waitForLayout() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function clampPositive(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function sanitizeCloneForHtml2Canvas(clonedDoc) {
  const style = clonedDoc.createElement('style')
  style.textContent = `
    :root, html, body {
      --card: #ffffff !important;
      --bg: #ffffff !important;
      --bg-soft: #f8fafc !important;
      --muted: #64748b !important;
      --field-border: #dbe3f0 !important;
      --surface-soft-accent: #eef4ff !important;
      --chart-track: #e2e8f0 !important;
      --income-dark: #059669 !important;
      --expense-dark: #dc2626 !important;
      --income-light: #34d399 !important;
      --expense-light: #f87171 !important;
      --text: #0f172a !important;
      --primary: #2563eb !important;
      --border: #dbe3f0 !important;
      color-scheme: light !important;
    }
  `
  clonedDoc.head?.appendChild(style)

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
    },
  })
}

export function sliceCanvasToPdfPages(canvas, pdf, {
  pageWidthPt,
  pageHeightPt,
  drawPageNumber,
  pageLabel = (page, total) => `${page} / ${total}`,
} = {}) {
  const pageCount = Math.max(1, Math.ceil(canvas.height / (canvas.width * (pageHeightPt / pageWidthPt))))
  const sliceHeightPx = canvas.height / pageCount

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const sourceY = Math.floor(pageIndex * sliceHeightPx)
    const sourceHeight = Math.min(Math.ceil(sliceHeightPx), canvas.height - sourceY)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = Math.max(1, sourceHeight)
    const context = pageCanvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      sourceHeight,
    )

    if (pageIndex > 0) {
      pdf.addPage()
    }
    const imageData = pageCanvas.toDataURL('image/png')
    pdf.addImage(imageData, 'PNG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST')

    if (drawPageNumber !== false) {
      pdf.setFontSize(9)
      pdf.setTextColor(100)
      pdf.text(pageLabel(pageIndex + 1, pageCount), pageWidthPt / 2, pageHeightPt - 18, { align: 'center' })
    }
  }

  return pageCount
}

export async function buildAnalysisReportPdfFromElement(element, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('目前環境不支援 PDF 匯出')
  }
  if (!element) {
    throw new Error('找不到報表預覽元素')
  }

  const canvas = await renderElementToCanvas(element, {
    scale: options.scale ?? 2,
    width: options.width ?? PAGE_WIDTH_PX,
    height: element.scrollHeight,
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
  }
}

export const ANALYSIS_REPORT_PDF_PAGE = {
  WIDTH_PX: PAGE_WIDTH_PX,
  HEIGHT_PX: PAGE_HEIGHT_PX,
}
