import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PAGE_WIDTH_PX = 794
const PAGE_HEIGHT_PX = 1123

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function sanitizeFilenameSegment(value, fallback = 'claim-sheet') {
  const normalized = String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function formatDate(value, locale = 'zh-TW') {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value, locale = 'zh-TW') {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatAmountMinor(value, locale = 'zh-TW') {
  const amount = Math.max(0, Math.round(Number(value ?? 0))) / 100
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function claimItemTypeLabel(item, labels) {
  if (String(item?.source_type ?? '').trim() === 'advance') return labels.advanceType
  return String(item?.entry_type ?? '').trim() === 'income' ? labels.incomeType : labels.expenseType
}

function claimItemSourceLabel(item, labels) {
  const sourceType = String(item?.source_type ?? '').trim()
  if (sourceType === 'advance') return labels.advanceSource
  if (String(item?.transaction_id ?? '').trim()) return labels.importedSource
  return labels.manualSource
}

function buildLabels(options = {}) {
  return {
    title: options.title || '請款單',
    detailTitle: options.detailTitle || '請款單明細',
    totalLabel: options.totalLabel || '請款淨額',
    statusLabel: options.statusLabel || '狀態',
    counterpartyLabel: options.counterpartyLabel || '請款對象',
    noteLabel: options.noteLabel || '備註',
    updatedAtLabel: options.updatedAtLabel || '更新時間',
    itemCountLabel: options.itemCountLabel || '項目數',
    categoryLabel: options.categoryLabel || '分類',
    descriptionLabel: options.descriptionLabel || '說明',
    amountLabel: options.amountLabel || '金額',
    dateLabel: options.dateLabel || '日期',
    sourceLabel: options.sourceLabel || '來源',
    importedNoteLabel: options.importedNoteLabel || '報銷備註',
    statusValue: options.statusValue || '',
    incomeType: options.incomeType || '收入',
    expenseType: options.expenseType || '支出',
    advanceType: options.advanceType || '代收',
    manualSource: options.manualSource || '手動項目',
    importedSource: options.importedSource || '導入報銷',
    advanceSource: options.advanceSource || '代收項目',
    emptyDescription: options.emptyDescription || '未命名項目',
    uncategorized: options.uncategorized || '未分類',
    summaryHint: options.summaryHint || '匯入報銷備註與手動代收項目均已納入此 PDF。',
  }
}

function createPdfStyles() {
  return `
    <style>
      .claim-pdf-page {
        width: ${PAGE_WIDTH_PX}px;
        height: ${PAGE_HEIGHT_PX}px;
        box-sizing: border-box;
        padding: 34px;
        color: #0f172a;
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 24%),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        font-family: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
        overflow: hidden;
      }
      .claim-pdf {
        height: 100%;
        display: grid;
        align-content: start;
        gap: 14px;
      }
      .hero,
      .continuation-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding: 18px 20px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.26);
      }
      .hero {
        background: linear-gradient(135deg, #eff6ff 0%, #ffffff 62%);
      }
      .eyebrow {
        margin-bottom: 8px;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #2563eb;
      }
      .hero h1,
      .continuation-head h2,
      .items-panel-head h3 {
        margin: 0;
        line-height: 1.2;
      }
      .hero h1 {
        font-size: 28px;
      }
      .continuation-head h2 {
        font-size: 22px;
      }
      .hero-note,
      .continuation-note {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: #475569;
      }
      .total-box,
      .continuation-total {
        min-width: 160px;
        padding: 14px 16px;
        border-radius: 20px;
        background: #0f172a;
        color: #f8fafc;
        display: grid;
        gap: 6px;
      }
      .total-box span,
      .continuation-total span {
        font-size: 11px;
        color: rgba(248, 250, 252, 0.72);
      }
      .total-box strong,
      .continuation-total strong {
        font-size: 24px;
        line-height: 1.1;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .summary-card,
      .claim-note,
      .items-panel,
      .item-row {
        break-inside: avoid;
      }
      .summary-card {
        padding: 12px 14px;
        border-radius: 18px;
        background: #ffffff;
        border: 1px solid rgba(148, 163, 184, 0.20);
        display: grid;
        gap: 6px;
      }
      .meta-label {
        font-size: 11px;
        color: #64748b;
      }
      .summary-card strong,
      .claim-note p,
      .cell,
      .item-note-row p {
        font-size: 13px;
      }
      .claim-note {
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.20);
      }
      .claim-note p,
      .item-note-row p {
        margin: 6px 0 0;
        white-space: pre-wrap;
        line-height: 1.55;
      }
      .items-panel {
        padding: 14px 16px 16px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.22);
        display: grid;
        gap: 10px;
      }
      .items-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-end;
      }
      .items-panel-head h3 {
        font-size: 18px;
      }
      .items-count {
        font-size: 12px;
        color: #1e293b;
        white-space: nowrap;
      }
      .items-table {
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        overflow: hidden;
      }
      .items-table-head,
      .item-main-grid {
        display: grid;
        grid-template-columns: 46px minmax(0, 2.25fr) minmax(0, 1.15fr) minmax(0, 1.3fr) 98px 94px;
        gap: 12px;
        align-items: start;
      }
      .items-table-head {
        padding: 10px 14px;
        background: #e2e8f0;
        font-size: 11px;
        font-weight: 700;
        color: #334155;
      }
      .items-table-body {
        display: grid;
      }
      .item-row {
        padding: 10px 14px;
        background: #ffffff;
        border-top: 1px solid rgba(226, 232, 240, 0.9);
      }
      .item-row:first-child {
        border-top: 0;
      }
      .item-index,
      .cell-date,
      .cell-amount {
        white-space: nowrap;
      }
      .item-index {
        font-size: 12px;
        color: #2563eb;
        font-weight: 700;
      }
      .cell {
        line-height: 1.5;
        color: #0f172a;
      }
      .cell-description strong {
        display: block;
        font-size: 13px;
        line-height: 1.45;
      }
      .cell-description small {
        display: block;
        margin-top: 4px;
        font-size: 11px;
        color: #64748b;
      }
      .cell-amount {
        text-align: right;
        font-size: 14px;
      }
      .item-note-row {
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 12px;
        background: #eff6ff;
      }
      .empty-note {
        margin: 0;
        padding: 14px;
        color: #64748b;
        font-size: 13px;
      }
    </style>
  `
}

function createPdfContainer() {
  const container = document.createElement('div')
  container.setAttribute('data-claim-sheet-pdf', 'true')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.width = `${PAGE_WIDTH_PX}px`
  container.style.padding = '0'
  container.style.background = '#ffffff'
  container.style.zIndex = '-1'
  container.innerHTML = createPdfStyles()
  return container
}

function createFirstPageMarkup(claim, items, labels, locale) {
  return `
    <div class="claim-pdf">
      <header class="hero">
        <div>
          <div class="eyebrow">${escapeHtml(labels.title)}</div>
          <h1>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h1>
          <p class="hero-note">${escapeHtml(labels.summaryHint)}</p>
        </div>
        <div class="total-box">
          <span>${escapeHtml(labels.totalLabel)}</span>
          <strong>${escapeHtml(formatAmountMinor(claim?.total_minor, locale))}</strong>
        </div>
      </header>

      <section class="summary-grid">
        <article class="summary-card">
          <span class="meta-label">${escapeHtml(labels.statusLabel)}</span>
          <strong>${escapeHtml(labels.statusValue)}</strong>
        </article>
        <article class="summary-card">
          <span class="meta-label">${escapeHtml(labels.counterpartyLabel)}</span>
          <strong>${escapeHtml(String(claim?.counterparty_name ?? '').trim() || '-')}</strong>
        </article>
        <article class="summary-card">
          <span class="meta-label">${escapeHtml(labels.updatedAtLabel)}</span>
          <strong>${escapeHtml(formatDate(claim?.updated_at, locale))}</strong>
        </article>
        <article class="summary-card">
          <span class="meta-label">${escapeHtml(labels.itemCountLabel)}</span>
          <strong>${escapeHtml(String(items.length))}</strong>
        </article>
      </section>

      ${String(claim?.note ?? '').trim()
        ? `<section class="claim-note"><span class="meta-label">${escapeHtml(labels.noteLabel)}</span><p>${escapeHtml(claim.note)}</p></section>`
        : ''}

      ${createItemsPanelMarkup(claim, items, labels, locale)}
    </div>
  `
}

function createContinuationPageMarkup(claim, items, labels, locale) {
  return `
    <div class="claim-pdf">
      <header class="continuation-head">
        <div>
          <div class="eyebrow">${escapeHtml(labels.detailTitle)}</div>
          <h2>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h2>
          <p class="continuation-note">${escapeHtml(labels.summaryHint)}</p>
        </div>
        <div class="continuation-total">
          <span>${escapeHtml(labels.totalLabel)}</span>
          <strong>${escapeHtml(formatAmountMinor(claim?.total_minor, locale))}</strong>
        </div>
      </header>

      ${createItemsPanelMarkup(claim, items, labels, locale)}
    </div>
  `
}

function createItemsPanelMarkup(claim, items, labels, locale) {
  return `
    <section class="items-panel">
      <div class="items-panel-head">
        <div>
          <div class="meta-label">${escapeHtml(labels.detailTitle)}</div>
          <h3>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h3>
        </div>
        <strong class="items-count">${escapeHtml(`${labels.itemCountLabel}：${items.length}`)}</strong>
      </div>
      <div class="items-table">
        <div class="items-table-head">
          <span>#</span>
          <span>${escapeHtml(labels.descriptionLabel)}</span>
          <span>${escapeHtml(labels.categoryLabel)}</span>
          <span>${escapeHtml(labels.sourceLabel)}</span>
          <span>${escapeHtml(labels.dateLabel)}</span>
          <span>${escapeHtml(labels.amountLabel)}</span>
        </div>
        <div class="items-table-body" data-role="items-body"></div>
      </div>
    </section>
  `
}

function createPageElement(claim, items, labels, locale, firstPage) {
  const page = document.createElement('section')
  page.className = 'claim-pdf-page'
  page.innerHTML = firstPage
    ? createFirstPageMarkup(claim, items, labels, locale)
    : createContinuationPageMarkup(claim, items, labels, locale)
  return {
    page,
    body: page.querySelector('[data-role="items-body"]'),
  }
}

function createItemRowElement(item, index, labels, locale, categoryName) {
  const row = document.createElement('article')
  row.className = 'item-row'
  const description = String(item?.description ?? '').trim() || labels.emptyDescription
  const importedNote = String(item?.transaction_note ?? '').trim()
  const itemSourceText = `${claimItemTypeLabel(item, labels)} / ${claimItemSourceLabel(item, labels)}`
  row.innerHTML = `
    <div class="item-main-grid">
      <span class="item-index">${escapeHtml(String(index + 1).padStart(2, '0'))}</span>
      <div class="cell cell-description">
        <strong>${escapeHtml(description)}</strong>
        <small>${escapeHtml(itemSourceText)}</small>
      </div>
      <span class="cell">${escapeHtml(categoryName)}</span>
      <span class="cell">${escapeHtml(itemSourceText)}</span>
      <span class="cell cell-date">${escapeHtml(formatDateOnly(item?.occurred_at, locale))}</span>
      <strong class="cell cell-amount">${escapeHtml(formatAmountMinor(item?.amount_minor, locale))}</strong>
    </div>
    ${importedNote
      ? `<div class="item-note-row"><span class="meta-label">${escapeHtml(labels.importedNoteLabel)}</span><p>${escapeHtml(importedNote)}</p></div>`
      : ''}
  `
  return row
}

function createEmptyStateElement(labels) {
  const empty = document.createElement('p')
  empty.className = 'empty-note'
  empty.textContent = labels.detailTitle
  return empty
}

async function waitForLayout() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function renderPageToCanvas(page) {
  await waitForLayout()
  const width = page.scrollWidth
  const height = page.scrollHeight
  return html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
  })
}

function buildPagedContainer(detail, options = {}) {
  const claim = detail?.claim ?? {}
  const items = Array.isArray(detail?.items) ? detail.items : []
  const locale = options.locale || 'zh-TW'
  const labels = buildLabels(options)
  const container = createPdfContainer()
  const pages = []

  function appendPage(firstPage) {
    const pageState = createPageElement(claim, items, labels, locale, firstPage)
    container.appendChild(pageState.page)
    pages.push(pageState)
    return pageState
  }

  let currentPage = appendPage(true)
  items.forEach((item, index) => {
    const categoryName = options.categoryName?.(item?.category_id) || labels.uncategorized
    const row = createItemRowElement(item, index, labels, locale, categoryName)
    currentPage.body.appendChild(row)

    if (currentPage.page.scrollHeight > currentPage.page.clientHeight) {
      currentPage.body.removeChild(row)
      currentPage = appendPage(false)
      currentPage.body.appendChild(row)
    }
  })

  pages.forEach(({ body }) => {
    if (!body.childElementCount) {
      body.appendChild(createEmptyStateElement(labels))
    }
  })

  return {
    container,
    pages,
  }
}

export async function buildClaimSheetPdfFile(detail, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('目前環境不支援 PDF 匯出')
  }

  const { container, pages } = buildPagedContainer(detail, options)
  document.body.appendChild(container)

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    for (const [index, { page }] of pages.entries()) {
      const canvas = await renderPageToCanvas(page)
      const imageData = canvas.toDataURL('image/png')
      if (index > 0) {
        pdf.addPage()
      }
      pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    }

    const filenameTitle = sanitizeFilenameSegment(detail?.claim?.title ?? options.title ?? 'claim-sheet')
    const filenameId = sanitizeFilenameSegment(detail?.claim?.id ?? 'claim')
    return {
      filename: `${filenameTitle}_${filenameId}.pdf`,
      blob: pdf.output('blob'),
    }
  } finally {
    container.remove()
  }
}
