import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  claimPaidMinorOf,
  claimRemainingMinor,
  claimTotalMinorOf,
  itemAmountMinorOf,
  itemRemainingMinor,
  itemSettledMinorOf,
} from '../utils/claim-sheet-payment.js'

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
    paidLabel: options.paidLabel || '已入帳',
    remainingLabel: options.remainingLabel || '剩餘未收',
    itemClaimAmountLabel: options.itemClaimAmountLabel || '請款金額',
    itemSettledLabel: options.itemSettledLabel || '已請款',
    itemRemainingLabel: options.itemRemainingLabel || '剩餘',
    paymentsTitle: options.paymentsTitle || '入帳紀錄',
    paymentsEmpty: options.paymentsEmpty || '尚無入帳紀錄',
    paymentDateLabel: options.paymentDateLabel || '入帳時間',
    paymentAmountLabel: options.paymentAmountLabel || '入帳金額',
    paymentAccountLabel: options.paymentAccountLabel || '帳戶',
    unknownAccount: options.unknownAccount || '未指定帳戶',
  }
}

export function detailHasPartialSettlement(claim, items = []) {
  const paidMinor = claimPaidMinorOf(claim)
  const totalMinor = claimTotalMinorOf(claim)
  if (paidMinor > 0 && claimRemainingMinor(claim) > 0) return true
  if (paidMinor > 0 && totalMinor > 0 && paidMinor < totalMinor) return true
  return items.some((item) => itemSettledMinorOf(item) > 0)
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
      .payment-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .payment-metric {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(255, 255, 255, 0.94);
        display: grid;
        gap: 6px;
      }
      .payment-metric--total {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f8fafc;
        border-color: transparent;
      }
      .payment-metric--paid {
        background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 88%);
        border-color: rgba(16, 185, 129, 0.28);
      }
      .payment-metric--remaining {
        background: linear-gradient(135deg, #fffbeb 0%, #ffffff 88%);
        border-color: rgba(245, 158, 11, 0.28);
      }
      .payment-metric span {
        font-size: 11px;
        color: #64748b;
      }
      .payment-metric--total span {
        color: rgba(248, 250, 252, 0.72);
      }
      .payment-metric strong {
        font-size: 22px;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }
      .continuation-total {
        min-width: 160px;
        padding: 14px 16px;
        border-radius: 20px;
        background: #0f172a;
        color: #f8fafc;
        display: grid;
        gap: 6px;
      }
      .continuation-total span {
        font-size: 11px;
        color: rgba(248, 250, 252, 0.72);
      }
      .continuation-total strong {
        font-size: 24px;
        line-height: 1.1;
      }
      .continuation-metrics {
        display: grid;
        gap: 6px;
        min-width: 180px;
        text-align: right;
        font-size: 12px;
        color: #475569;
      }
      .continuation-metrics strong {
        color: #0f172a;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .payments-panel {
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.20);
        display: grid;
        gap: 8px;
      }
      .payments-panel h4 {
        margin: 0;
        font-size: 14px;
      }
      .payments-table {
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        overflow: hidden;
      }
      .payments-table-head,
      .payments-table-row {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr);
        gap: 10px;
        padding: 8px 12px;
        align-items: center;
      }
      .payments-table-head {
        background: #f1f5f9;
        font-size: 11px;
        font-weight: 700;
        color: #334155;
      }
      .payments-table-row {
        background: #ffffff;
        border-top: 1px solid rgba(226, 232, 240, 0.9);
        font-size: 12px;
      }
      .payments-table-row .amount {
        text-align: right;
        font-weight: 700;
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
      .items-table--partial .items-table-head,
      .items-table--partial .item-main-grid {
        grid-template-columns: 36px minmax(0, 2fr) minmax(0, 1fr) 78px 72px 72px 72px;
      }
      .items-table--partial .cell-amount-settled {
        text-align: right;
        font-size: 12px;
        color: #047857;
      }
      .items-table--partial .cell-amount-remaining {
        text-align: right;
        font-size: 12px;
        color: #b45309;
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
      .item-row-note-continuation {
        background: #f8fbff;
      }
      .item-note-continuation-head {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .item-note-continuation-head .cell-description {
        min-width: 0;
      }
      .item-note-row-continued {
        background: #eef2ff;
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

function createPaymentSummaryMarkup(claim, labels, locale) {
  const totalMinor = claimTotalMinorOf(claim)
  const paidMinor = claimPaidMinorOf(claim)
  const remainingMinor = claimRemainingMinor(claim)
  return `
    <section class="payment-summary">
      <article class="payment-metric payment-metric--total">
        <span>${escapeHtml(labels.totalLabel)}</span>
        <strong>${escapeHtml(formatAmountMinor(totalMinor, locale))}</strong>
      </article>
      <article class="payment-metric payment-metric--paid">
        <span>${escapeHtml(labels.paidLabel)}</span>
        <strong>${escapeHtml(formatAmountMinor(paidMinor, locale))}</strong>
      </article>
      <article class="payment-metric payment-metric--remaining">
        <span>${escapeHtml(labels.remainingLabel)}</span>
        <strong>${escapeHtml(formatAmountMinor(remainingMinor, locale))}</strong>
      </article>
    </section>
  `
}

function createPaymentsHistoryMarkup(payments, labels, locale) {
  const rows = Array.isArray(payments) ? payments : []
  if (!rows.length) {
    return `
      <section class="payments-panel">
        <h4>${escapeHtml(labels.paymentsTitle)}</h4>
        <p class="empty-note">${escapeHtml(labels.paymentsEmpty)}</p>
      </section>
    `
  }
  return `
    <section class="payments-panel">
      <h4>${escapeHtml(labels.paymentsTitle)}</h4>
      <div class="payments-table">
        <div class="payments-table-head">
          <span>${escapeHtml(labels.paymentDateLabel)}</span>
          <span>${escapeHtml(labels.paymentAccountLabel)}</span>
          <span>${escapeHtml(labels.paymentAmountLabel)}</span>
        </div>
        ${rows.map((payment) => `
          <div class="payments-table-row">
            <span>${escapeHtml(formatDate(payment?.paid_at, locale))}</span>
            <span>${escapeHtml(String(payment?.account_name ?? '').trim() || labels.unknownAccount)}</span>
            <span class="amount">${escapeHtml(formatAmountMinor(payment?.amount_minor, locale))}</span>
          </div>
        `).join('')}
      </div>
    </section>
  `
}

function createFirstPageMarkup(claim, items, labels, locale, payments = []) {
  const showPaymentsPanel = claimPaidMinorOf(claim) > 0 || (Array.isArray(payments) && payments.length > 0)
  return `
    <div class="claim-pdf">
      <header class="hero">
        <div>
          <div class="eyebrow">${escapeHtml(labels.title)}</div>
          <h1>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h1>
          <p class="hero-note">${escapeHtml(labels.summaryHint)}</p>
        </div>
      </header>

      ${createPaymentSummaryMarkup(claim, labels, locale)}

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

      ${showPaymentsPanel ? createPaymentsHistoryMarkup(payments, labels, locale) : ''}

      ${createItemsPanelMarkup(claim, items, labels, locale)}
    </div>
  `
}

function createContinuationPageMarkup(claim, items, labels, locale) {
  const paidMinor = claimPaidMinorOf(claim)
  const remainingMinor = claimRemainingMinor(claim)
  return `
    <div class="claim-pdf">
      <header class="continuation-head">
        <div>
          <div class="eyebrow">${escapeHtml(labels.detailTitle)}</div>
          <h2>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h2>
          <p class="continuation-note">${escapeHtml(labels.summaryHint)}</p>
        </div>
        <div class="continuation-metrics">
          <div>${escapeHtml(labels.totalLabel)} <strong>${escapeHtml(formatAmountMinor(claim?.total_minor, locale))}</strong></div>
          <div>${escapeHtml(labels.paidLabel)} <strong>${escapeHtml(formatAmountMinor(paidMinor, locale))}</strong></div>
          <div>${escapeHtml(labels.remainingLabel)} <strong>${escapeHtml(formatAmountMinor(remainingMinor, locale))}</strong></div>
        </div>
      </header>

      ${createItemsPanelMarkup(claim, items, labels, locale)}
    </div>
  `
}

function createItemsPanelMarkup(claim, items, labels, locale) {
  const partial = detailHasPartialSettlement(claim, items)
  const tableClass = partial ? 'items-table items-table--partial' : 'items-table'
  const tableHead = partial
    ? `
          <span>#</span>
          <span>${escapeHtml(labels.descriptionLabel)}</span>
          <span>${escapeHtml(labels.categoryLabel)}</span>
          <span>${escapeHtml(labels.dateLabel)}</span>
          <span>${escapeHtml(labels.itemClaimAmountLabel)}</span>
          <span>${escapeHtml(labels.itemSettledLabel)}</span>
          <span>${escapeHtml(labels.itemRemainingLabel)}</span>
        `
    : `
          <span>#</span>
          <span>${escapeHtml(labels.descriptionLabel)}</span>
          <span>${escapeHtml(labels.categoryLabel)}</span>
          <span>${escapeHtml(labels.sourceLabel)}</span>
          <span>${escapeHtml(labels.dateLabel)}</span>
          <span>${escapeHtml(labels.amountLabel)}</span>
        `
  return `
    <section class="items-panel">
      <div class="items-panel-head">
        <div>
          <div class="meta-label">${escapeHtml(labels.detailTitle)}</div>
          <h3>${escapeHtml(String(claim?.title ?? '').trim() || labels.detailTitle)}</h3>
        </div>
        <strong class="items-count">${escapeHtml(`${labels.itemCountLabel}：${items.length}`)}</strong>
      </div>
      <div class="${tableClass}" data-partial="${partial ? '1' : '0'}">
        <div class="items-table-head">
          ${tableHead}
        </div>
        <div class="items-table-body" data-role="items-body"></div>
      </div>
    </section>
  `
}

function createContinuationLabel(label) {
  return `${label}（續）`
}

function buildItemViewModel(item, index, labels, locale, categoryName, partialColumns = false) {
  const description = String(item?.description ?? '').trim() || labels.emptyDescription
  const importedNote = String(item?.transaction_note ?? '').trim()
  const itemSourceText = `${claimItemTypeLabel(item, labels)} / ${claimItemSourceLabel(item, labels)}`
  const claimAmountMinor = itemAmountMinorOf(item)
  const settledMinor = itemSettledMinorOf(item)
  const remainingMinor = itemRemainingMinor(item)
  return {
    amountText: formatAmountMinor(claimAmountMinor, locale),
    settledText: formatAmountMinor(settledMinor, locale),
    remainingText: formatAmountMinor(remainingMinor, locale),
    partialColumns,
    categoryName,
    dateText: formatDateOnly(item?.occurred_at, locale),
    description,
    importedNote,
    indexLabel: String(index + 1).padStart(2, '0'),
    itemSourceText,
  }
}

function createItemMainGridMarkup(viewModel) {
  if (viewModel.partialColumns) {
    return `
    <div class="item-main-grid">
      <span class="item-index">${escapeHtml(viewModel.indexLabel)}</span>
      <div class="cell cell-description">
        <strong>${escapeHtml(viewModel.description)}</strong>
        <small>${escapeHtml(viewModel.itemSourceText)}</small>
      </div>
      <span class="cell">${escapeHtml(viewModel.categoryName)}</span>
      <span class="cell cell-date">${escapeHtml(viewModel.dateText)}</span>
      <strong class="cell cell-amount">${escapeHtml(viewModel.amountText)}</strong>
      <strong class="cell cell-amount-settled">${escapeHtml(viewModel.settledText)}</strong>
      <strong class="cell cell-amount-remaining">${escapeHtml(viewModel.remainingText)}</strong>
    </div>
  `
  }
  return `
    <div class="item-main-grid">
      <span class="item-index">${escapeHtml(viewModel.indexLabel)}</span>
      <div class="cell cell-description">
        <strong>${escapeHtml(viewModel.description)}</strong>
        <small>${escapeHtml(viewModel.itemSourceText)}</small>
      </div>
      <span class="cell">${escapeHtml(viewModel.categoryName)}</span>
      <span class="cell">${escapeHtml(viewModel.itemSourceText)}</span>
      <span class="cell cell-date">${escapeHtml(viewModel.dateText)}</span>
      <strong class="cell cell-amount">${escapeHtml(viewModel.amountText)}</strong>
    </div>
  `
}

function createPageElement(claim, items, labels, locale, firstPage, payments = []) {
  const page = document.createElement('section')
  page.className = 'claim-pdf-page'
  page.innerHTML = firstPage
    ? createFirstPageMarkup(claim, items, labels, locale, payments)
    : createContinuationPageMarkup(claim, items, labels, locale)
  return {
    page,
    body: page.querySelector('[data-role="items-body"]'),
  }
}

function createItemRowElement(viewModel, labels, options = {}) {
  const noteText = String(options.noteText ?? viewModel.importedNote ?? '').trim()
  const row = document.createElement('article')
  row.className = 'item-row'
  row.innerHTML = `
    ${createItemMainGridMarkup(viewModel)}
    ${noteText
      ? `<div class="item-note-row"><span class="meta-label">${escapeHtml(labels.importedNoteLabel)}</span><p>${escapeHtml(noteText)}</p></div>`
      : ''}
  `
  return row
}

function createItemContinuationRowElement(viewModel, labels, noteText) {
  const row = document.createElement('article')
  row.className = 'item-row item-row-note-continuation'
  row.innerHTML = `
    <div class="item-note-continuation-head">
      <span class="item-index">${escapeHtml(viewModel.indexLabel)}</span>
      <div class="cell cell-description">
        <strong>${escapeHtml(viewModel.description)}</strong>
        <small>${escapeHtml(createContinuationLabel(labels.importedNoteLabel))}</small>
      </div>
    </div>
    <div class="item-note-row item-note-row-continued">
      <span class="meta-label">${escapeHtml(createContinuationLabel(labels.importedNoteLabel))}</span>
      <p>${escapeHtml(noteText)}</p>
    </div>
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
  return html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: PAGE_WIDTH_PX,
    height: PAGE_HEIGHT_PX,
    windowWidth: PAGE_WIDTH_PX,
    windowHeight: PAGE_HEIGHT_PX,
  })
}

function pageOverflows(page) {
  return page.scrollHeight > page.clientHeight
}

function tryAppendRow(pageState, row) {
  pageState.body.appendChild(row)
  if (!pageOverflows(pageState.page)) {
    return true
  }
  pageState.body.removeChild(row)
  return false
}

function resolveNoteSegmentBoundary(text, requestedLength) {
  const normalizedRequestedLength = Math.max(1, Math.min(text.length, Math.floor(requestedLength)))
  if (normalizedRequestedLength >= text.length) {
    return text.length
  }
  const candidate = text.slice(0, normalizedRequestedLength)
  const lastLineBreak = candidate.lastIndexOf('\n')
  const lastSpace = candidate.lastIndexOf(' ')
  const softBoundary = Math.max(lastLineBreak, lastSpace)
  const minimumPreferredBoundary = Math.max(1, Math.floor(normalizedRequestedLength * 0.6))
  if (softBoundary >= minimumPreferredBoundary) {
    return softBoundary + 1
  }
  return normalizedRequestedLength
}

function findLargestFittingNoteSegment(pageState, noteText, createRow) {
  const normalizedNote = String(noteText ?? '')
  if (!normalizedNote) return null

  let low = 1
  let high = normalizedNote.length
  let bestSegment = null

  while (low <= high) {
    const requestedLength = Math.floor((low + high) / 2)
    const boundary = resolveNoteSegmentBoundary(normalizedNote, requestedLength)
    const segmentText = normalizedNote.slice(0, boundary)
    const row = createRow(segmentText)
    pageState.body.appendChild(row)
    const fits = !pageOverflows(pageState.page)
    pageState.body.removeChild(row)

    if (fits) {
      bestSegment = {
        consumedLength: boundary,
        text: segmentText,
      }
      low = requestedLength + 1
      continue
    }

    high = requestedLength - 1
  }

  return bestSegment
}

function trimRemainingNoteText(text, consumedLength) {
  return String(text ?? '').slice(consumedLength).replace(/^\s+/, '')
}

function appendSplitItemRows(viewModel, labels, currentPage, appendPage) {
  const mainRow = createItemRowElement(viewModel, labels, { noteText: '' })
  if (!tryAppendRow(currentPage, mainRow)) {
    if (currentPage.body.childElementCount) {
      currentPage = appendPage(false)
    }
    if (!tryAppendRow(currentPage, mainRow)) {
      currentPage.body.appendChild(mainRow)
    }
  }

  let remainingNote = viewModel.importedNote
  while (remainingNote) {
    const segment = findLargestFittingNoteSegment(
      currentPage,
      remainingNote,
      (noteText) => createItemContinuationRowElement(viewModel, labels, noteText),
    )

    if (!segment) {
      if (!currentPage.body.childElementCount) {
        currentPage.body.appendChild(createItemContinuationRowElement(viewModel, labels, remainingNote))
        break
      }
      currentPage = appendPage(false)
      continue
    }

    currentPage.body.appendChild(createItemContinuationRowElement(viewModel, labels, segment.text))
    remainingNote = trimRemainingNoteText(remainingNote, segment.consumedLength)
    if (remainingNote) {
      currentPage = appendPage(false)
    }
  }

  return currentPage
}

function buildPagedContainer(detail, options = {}, container) {
  const claim = detail?.claim ?? {}
  const items = Array.isArray(detail?.items) ? detail.items : []
  const payments = Array.isArray(detail?.payments) ? detail.payments : []
  const locale = options.locale || 'zh-TW'
  const labels = buildLabels(options)
  const partialColumns = detailHasPartialSettlement(claim, items)
  const pages = []

  function appendPage(firstPage) {
    const pageState = createPageElement(claim, items, labels, locale, firstPage, payments)
    container.appendChild(pageState.page)
    pages.push(pageState)
    return pageState
  }

  let currentPage = appendPage(true)
  items.forEach((item, index) => {
    const categoryName = options.categoryName?.(item?.category_id) || labels.uncategorized
    const viewModel = buildItemViewModel(item, index, labels, locale, categoryName, partialColumns)
    const fullRow = createItemRowElement(viewModel, labels)

    if (!tryAppendRow(currentPage, fullRow)) {
      if (currentPage.body.childElementCount) {
        currentPage = appendPage(false)
      }
      if (!tryAppendRow(currentPage, fullRow)) {
        currentPage = appendSplitItemRows(viewModel, labels, currentPage, appendPage)
      }
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

  const container = createPdfContainer()
  document.body.appendChild(container)
  const { pages } = buildPagedContainer(detail, options, container)

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
