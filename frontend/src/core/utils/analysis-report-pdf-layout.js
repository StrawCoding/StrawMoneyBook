/**
 * Pure PDF layout helpers for analysis report export (no DOM / canvas deps).
 */

export const ANALYSIS_REPORT_PDF_PAGE = Object.freeze({
  WIDTH_PX: 794,
  HEIGHT_PX: 1123,
  PRINT_LAYOUT_ATTR: 'data-print-layout',
  PRINT_LAYOUT_VALUE: 'a4',
})

function clampPositive(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

/**
 * Compute equal-scale canvas → A4 page slices without vertical stretch.
 * Last page keeps residual height (letterboxed with white below), never stretched.
 */
export function computePdfSlicePlan(canvasWidth, canvasHeight, pageWidthPt, pageHeightPt) {
  const width = clampPositive(canvasWidth, ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX)
  const height = clampPositive(canvasHeight, 1)
  const pageW = clampPositive(pageWidthPt, 595.28)
  const pageH = clampPositive(pageHeightPt, 841.89)
  const pxPerPt = width / pageW
  const pageHeightPx = pageH * pxPerPt
  const pageCount = Math.max(1, Math.ceil(height / pageHeightPx))
  const pages = []
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const sourceY = Math.floor(pageIndex * pageHeightPx)
    const sourceHeight = Math.min(Math.ceil(pageHeightPx), Math.max(1, height - sourceY))
    const drawHeightPt = sourceHeight / pxPerPt
    pages.push({
      pageIndex,
      sourceY,
      sourceHeight,
      drawWidthPt: pageW,
      drawHeightPt,
      isLast: pageIndex === pageCount - 1,
    })
  }
  return {
    pageCount,
    pxPerPt,
    pageHeightPx,
    pages,
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
    printLayout: element.getAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR) ?? null,
  }

  const resolvedWidth = clampPositive(widthPx, ANALYSIS_REPORT_PDF_PAGE.WIDTH_PX)
  element.style.boxSizing = 'border-box'
  element.style.width = `${resolvedWidth}px`
  element.style.maxWidth = `${resolvedWidth}px`
  element.style.minWidth = `${resolvedWidth}px`
  element.style.margin = '0 auto'
  element.setAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR, ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_VALUE)

  return {
    widthPx: resolvedWidth,
    restore() {
      element.style.width = previous.width
      element.style.maxWidth = previous.maxWidth
      element.style.minWidth = previous.minWidth
      element.style.margin = previous.margin
      element.style.boxSizing = previous.boxSizing
      if (previous.printLayout == null) {
        element.removeAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR)
      } else {
        element.setAttribute?.(ANALYSIS_REPORT_PDF_PAGE.PRINT_LAYOUT_ATTR, previous.printLayout)
      }
    },
  }
}
