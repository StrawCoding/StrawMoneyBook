/**
 * Pure PDF layout helpers for analysis report export (no DOM / canvas deps).
 */

export const ANALYSIS_REPORT_PDF_PAGE = Object.freeze({
  WIDTH_PX: 794,
  HEIGHT_PX: 1123,
  PRINT_LAYOUT_ATTR: 'data-print-layout',
  PRINT_LAYOUT_VALUE: 'a4',
  /** Reserved bottom band for page numbers so content is never covered. */
  FOOTER_MARGIN_PT: 32,
  /** Outer page inset so borders/text are not flush-cut by printers. */
  PAGE_MARGIN_PT: 14,
  /** Minimum forward progress per page when a block is taller than a page. */
  MIN_PAGE_PROGRESS_PX: 48,
})

const AVOID_BREAK_SELECTORS = [
  '.report-header',
  '.big-numbers',
  '.big-card',
  '.iconized-chart-pair',
  '.pie-panel',
  '.bar-panel',
  '.budget-section',
  '.budget-card',
  '.table-section',
  '.section-head',
  '.report-table thead',
  '.report-table tbody tr',
]

function clampPositive(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

/**
 * Collect CSS-pixel ranges (relative to report root top) that should not be
 * sliced across PDF page boundaries when possible.
 */
export function collectAnalysisReportPdfAvoidRanges(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return []
  const rootRect = element.getBoundingClientRect()
  const scrollTop = Number(element.scrollTop) || 0
  const ranges = []

  for (const selector of AVOID_BREAK_SELECTORS) {
    let nodes = []
    try {
      nodes = [...element.querySelectorAll(selector)]
    } catch {
      nodes = []
    }
    for (const node of nodes) {
      if (!node || typeof node.getBoundingClientRect !== 'function') continue
      const rect = node.getBoundingClientRect()
      const top = rect.top - rootRect.top + scrollTop
      const bottom = rect.bottom - rootRect.top + scrollTop
      if (!(Number.isFinite(top) && Number.isFinite(bottom)) || bottom <= top) continue
      ranges.push({ top, bottom })
    }
  }

  ranges.sort((a, b) => a.top - b.top || a.bottom - b.bottom)
  return ranges
}

export function scaleAvoidRangesToCanvas(ranges, scale = 1) {
  const factor = clampPositive(scale, 1)
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      top: Number(range?.top) * factor,
      bottom: Number(range?.bottom) * factor,
    }))
    .filter((range) => Number.isFinite(range.top) && Number.isFinite(range.bottom) && range.bottom > range.top)
}

/**
 * Choose a page break at or before idealEnd that does not cut through avoid ranges.
 * Falls back to idealEnd when a single block is taller than the usable page.
 */
export function resolvePdfPageBreak(cursor, idealEnd, canvasHeight, avoidRangesCanvasPx = [], {
  minProgressPx = ANALYSIS_REPORT_PDF_PAGE.MIN_PAGE_PROGRESS_PX,
} = {}) {
  const height = clampPositive(canvasHeight, 1)
  const start = Math.max(0, Number(cursor) || 0)
  const ideal = Math.min(height, Math.max(start, Number(idealEnd) || start))
  if (ideal >= height) return height

  const minProgress = clampPositive(minProgressPx, ANALYSIS_REPORT_PDF_PAGE.MIN_PAGE_PROGRESS_PX)
  const ranges = Array.isArray(avoidRangesCanvasPx) ? avoidRangesCanvasPx : []

  // Prefer breaking just before the outermost block that would otherwise be split.
  let breakBefore = null
  for (const range of ranges) {
    const top = Number(range.top)
    const bottom = Number(range.bottom)
    if (!(Number.isFinite(top) && Number.isFinite(bottom))) continue
    if (top <= start + minProgress) continue
    if (top >= ideal) continue
    if (bottom <= ideal) continue
    // Range starts on this page and extends past idealEnd → break before it.
    // Use the earliest top so nested children don't leave the parent header stranded.
    if (breakBefore == null || top < breakBefore) {
      breakBefore = top
    }
  }
  if (breakBefore != null && breakBefore > start + minProgress) {
    return Math.min(height, breakBefore)
  }

  // If idealEnd sits inside a block that started before this page, try ending
  // after that block when the remainder still fits the next page start.
  for (const range of ranges) {
    const top = Number(range.top)
    const bottom = Number(range.bottom)
    if (!(Number.isFinite(top) && Number.isFinite(bottom))) continue
    if (top < ideal && bottom > ideal && top <= start) {
      // Block already started on a previous slice; allow the cut (unavoidable)
      // but prefer cutting at the block end if it is only slightly past ideal.
      if (bottom <= start + (ideal - start) * 1.15 && bottom - start > minProgress) {
        return Math.min(height, bottom)
      }
    }
  }

  return ideal
}

/**
 * Compute equal-scale canvas → A4 page slices without vertical stretch.
 * Last page keeps residual height (letterboxed with white below), never stretched.
 * Optional avoidRanges prevent mid-block cuts; footerMargin reserves page-number band.
 */
export function computePdfSlicePlan(canvasWidth, canvasHeight, pageWidthPt, pageHeightPt, {
  footerMarginPt = ANALYSIS_REPORT_PDF_PAGE.FOOTER_MARGIN_PT,
  pageMarginPt = ANALYSIS_REPORT_PDF_PAGE.PAGE_MARGIN_PT,
  avoidRangesCanvasPx = [],
  minProgressPx = ANALYSIS_REPORT_PDF_PAGE.MIN_PAGE_PROGRESS_PX,
} = {}) {
  const width = clampPositive(canvasWidth, ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX)
  const height = clampPositive(canvasHeight, 1)
  const pageW = clampPositive(pageWidthPt, 595.28)
  const pageH = clampPositive(pageHeightPt, 841.89)
  const margin = Math.max(0, Math.min(Number(pageMarginPt) || 0, pageW * 0.08))
  const footer = Math.max(0, Math.min(Number(footerMarginPt) || 0, pageH * 0.2))
  const contentWidthPt = Math.max(pageW - margin * 2, pageW * 0.84)
  const usablePageHeightPt = Math.max(pageH - footer - margin, pageH * 0.75)
  const pxPerPt = width / contentWidthPt
  const usablePageHeightPx = usablePageHeightPt * pxPerPt
  const fullPageHeightPx = pageH * pxPerPt

  const pages = []
  let cursor = 0
  let pageIndex = 0
  const safetyLimit = Math.max(20, Math.ceil(height / Math.max(minProgressPx, 1)) + 5)

  while (cursor < height - 0.5 && pageIndex < safetyLimit) {
    const idealEnd = Math.min(height, cursor + usablePageHeightPx)
    const breakAt = resolvePdfPageBreak(cursor, idealEnd, height, avoidRangesCanvasPx, { minProgressPx })
    const sourceY = Math.floor(cursor)
    const rawHeight = Math.max(1, breakAt - cursor)
    const sourceHeight = Math.min(Math.ceil(rawHeight), Math.max(1, height - sourceY))
    const drawHeightPt = sourceHeight / pxPerPt

    pages.push({
      pageIndex,
      sourceY,
      sourceHeight,
      drawWidthPt: contentWidthPt,
      drawHeightPt,
      contentBottomPt: drawHeightPt,
      isLast: sourceY + sourceHeight >= height - 0.5,
    })

    cursor = sourceY + sourceHeight
    pageIndex += 1
    if (sourceHeight < 1) break
  }

  return {
    pageCount: Math.max(1, pages.length),
    pxPerPt,
    pageHeightPx: fullPageHeightPx,
    usablePageHeightPx,
    usablePageHeightPt,
    footerMarginPt: footer,
    pageMarginPt: margin,
    contentWidthPt,
    pages: pages.length
      ? pages
      : [{
        pageIndex: 0,
        sourceY: 0,
        sourceHeight: Math.max(1, height),
        drawWidthPt: contentWidthPt,
        drawHeightPt: Math.max(1, height) / pxPerPt,
        contentBottomPt: Math.max(1, height) / pxPerPt,
        isLast: true,
      }],
  }
}

export function prepareAnalysisReportElementForPdfCapture(element, {
  widthPx = ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX,
} = {}) {
  if (!element?.style) {
    return {
      widthPx: clampPositive(widthPx, ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX),
      restore() {},
    }
  }

  const previous = {
    width: element.style.width,
    maxWidth: element.style.maxWidth,
    minWidth: element.style.minWidth,
    margin: element.style.margin,
    boxSizing: element.style.boxSizing,
    overflow: element.style.overflow,
    printLayout: element.getAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR) ?? null,
  }

  const resolvedWidth = clampPositive(widthPx, ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX)
  element.style.boxSizing = 'border-box'
  element.style.width = `${resolvedWidth}px`
  element.style.maxWidth = `${resolvedWidth}px`
  element.style.minWidth = `${resolvedWidth}px`
  element.style.margin = '0 auto'
  element.style.overflow = 'visible'
  element.setAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR, ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_VALUE)

  return {
    widthPx: resolvedWidth,
    restore() {
      element.style.width = previous.width
      element.style.maxWidth = previous.maxWidth
      element.style.minWidth = previous.minWidth
      element.style.margin = previous.margin
      element.style.boxSizing = previous.boxSizing
      element.style.overflow = previous.overflow
      if (previous.printLayout == null) {
        element.removeAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR)
      } else {
        element.setAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR, previous.printLayout)
      }
    },
  }
}
