import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

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

function createPdfMarkup(detail, options = {}) {
  const claim = detail?.claim ?? {}
  const items = Array.isArray(detail?.items) ? detail.items : []
  const locale = options.locale || 'zh-TW'
  const labels = {
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

  const itemMarkup = items.map((item, index) => {
    const description = String(item?.description ?? '').trim() || labels.emptyDescription
    const importedNote = String(item?.transaction_note ?? '').trim()
    const categoryName = options.categoryName?.(item?.category_id) || labels.uncategorized
    return `
      <article class="item-card">
        <div class="item-head">
          <div>
            <div class="item-index">#${index + 1}</div>
            <h3>${escapeHtml(description)}</h3>
          </div>
          <div class="item-amount">${escapeHtml(formatAmountMinor(item?.amount_minor, locale))}</div>
        </div>
        <div class="item-grid">
          <div class="meta-block">
            <span class="meta-label">${escapeHtml(labels.categoryLabel)}</span>
            <strong>${escapeHtml(categoryName)}</strong>
          </div>
          <div class="meta-block">
            <span class="meta-label">${escapeHtml(labels.sourceLabel)}</span>
            <strong>${escapeHtml(`${claimItemTypeLabel(item, labels)} / ${claimItemSourceLabel(item, labels)}`)}</strong>
          </div>
          <div class="meta-block">
            <span class="meta-label">${escapeHtml(labels.dateLabel)}</span>
            <strong>${escapeHtml(formatDateOnly(item?.occurred_at, locale))}</strong>
          </div>
        </div>
        ${importedNote
          ? `<div class="note-box"><span class="meta-label">${escapeHtml(labels.importedNoteLabel)}</span><p>${escapeHtml(importedNote)}</p></div>`
          : ''}
      </article>
    `
  }).join('')

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

      <section class="items-wrap">
        ${itemMarkup || `<p class="empty-note">${escapeHtml(labels.detailTitle)}</p>`}
      </section>
    </div>
  `
}

function createPdfContainer(detail, options = {}) {
  const container = document.createElement('div')
  container.setAttribute('data-claim-sheet-pdf', 'true')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.width = '794px'
  container.style.padding = '0'
  container.style.background = '#ffffff'
  container.style.zIndex = '-1'
  container.innerHTML = `
    <style>
      .claim-pdf {
        width: 794px;
        box-sizing: border-box;
        padding: 36px 34px 40px;
        color: #111827;
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 26%),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        font-family: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        padding: 24px;
        border-radius: 24px;
        background: linear-gradient(135deg, #eff6ff 0%, #ffffff 62%);
        border: 1px solid rgba(148, 163, 184, 0.26);
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #2563eb;
        margin-bottom: 10px;
      }
      .hero h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.2;
      }
      .hero-note {
        margin: 12px 0 0;
        max-width: 420px;
        font-size: 13px;
        line-height: 1.6;
        color: #475569;
      }
      .total-box {
        min-width: 176px;
        padding: 18px 20px;
        border-radius: 20px;
        background: #0f172a;
        color: #f8fafc;
        display: grid;
        gap: 8px;
      }
      .total-box span {
        font-size: 12px;
        color: rgba(248, 250, 252, 0.74);
      }
      .total-box strong {
        font-size: 28px;
        line-height: 1.1;
      }
      .summary-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .summary-card,
      .claim-note,
      .item-card {
        break-inside: avoid;
      }
      .summary-card {
        padding: 16px 18px;
        border-radius: 18px;
        background: #ffffff;
        border: 1px solid rgba(148, 163, 184, 0.2);
        display: grid;
        gap: 8px;
      }
      .meta-label {
        font-size: 12px;
        color: #64748b;
      }
      .claim-note {
        margin-top: 14px;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      .claim-note p,
      .note-box p {
        margin: 8px 0 0;
        white-space: pre-wrap;
        line-height: 1.7;
      }
      .items-wrap {
        margin-top: 18px;
        display: grid;
        gap: 14px;
      }
      .item-card {
        padding: 18px 18px 16px;
        border-radius: 20px;
        background: #ffffff;
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
      }
      .item-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }
      .item-index {
        font-size: 12px;
        color: #2563eb;
        margin-bottom: 6px;
      }
      .item-head h3 {
        margin: 0;
        font-size: 20px;
        line-height: 1.35;
      }
      .item-amount {
        font-size: 22px;
        font-weight: 700;
        color: #0f172a;
        white-space: nowrap;
      }
      .item-grid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .meta-block {
        padding: 12px 14px;
        border-radius: 16px;
        background: #f8fafc;
        display: grid;
        gap: 6px;
      }
      .note-box {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        background: #eff6ff;
      }
      .empty-note {
        margin: 0;
        color: #64748b;
      }
    </style>
    ${createPdfMarkup(detail, options)}
  `
  return container
}

async function waitForLayout() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function canvasSliceToPng(canvas, startY, sliceHeight) {
  const pageCanvas = document.createElement('canvas')
  pageCanvas.width = canvas.width
  pageCanvas.height = sliceHeight
  const context = pageCanvas.getContext('2d')
  context.drawImage(
    canvas,
    0,
    startY,
    canvas.width,
    sliceHeight,
    0,
    0,
    canvas.width,
    sliceHeight,
  )
  return pageCanvas.toDataURL('image/png')
}

export async function buildClaimSheetPdfFile(detail, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('目前環境不支援 PDF 匯出')
  }

  const container = createPdfContainer(detail, options)
  document.body.appendChild(container)

  try {
    await waitForLayout()
    const width = container.scrollWidth
    const height = container.scrollHeight
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const pageHeightPx = Math.floor((pageHeight / pageWidth) * canvas.width)
    let startY = 0
    let pageIndex = 0

    while (startY < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - startY)
      const imageData = canvasSliceToPng(canvas, startY, sliceHeight)
      const renderHeight = (sliceHeight * pageWidth) / canvas.width
      if (pageIndex > 0) {
        pdf.addPage()
      }
      pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, renderHeight, undefined, 'FAST')
      startY += sliceHeight
      pageIndex += 1
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
