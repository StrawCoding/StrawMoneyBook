import { reimbursementPendingMinor } from '@/ui/utils/reimbursement-item'

const DEFAULT_BORROW_ICON = 'fa-solid fa-arrow-down'

function absMinor(value) {
  return Math.max(0, Math.round(Math.abs(Number(value ?? 0))))
}

export function claimSheetImportKindFromTx(tx) {
  const explicitKind = String(tx?.claimImportKind ?? '').trim()
  if (explicitKind) return explicitKind

  const originType = String(tx?.origin_type ?? '').trim()
  if (originType === 'loan_payment') {
    return 'borrow_loan'
  }

  return 'reimbursement'
}

export function claimSheetImportKindFromClaimItem(item) {
  const sourceType = String(item?.source_type ?? '').trim()
  const entryType = String(item?.entry_type ?? '').trim()
  if (sourceType === 'transaction' && entryType === 'income') {
    return 'borrow_loan'
  }
  return 'reimbursement'
}

function joinTitleParts(parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

export function claimSheetImportedTitle(tx, t) {
  const kind = claimSheetImportKindFromTx(tx)
  if (kind === 'borrow_loan') {
    // For lent loans the human-readable identifier is the counterparty name
    // (e.g. "張三") plus the loan note (if the user typed one) — never the
    // underlying transaction UUID. Falling back to tx.id leaks an internal
    // system id into the UI (SMB-222 Restart).
    const counterpartyName = String(tx?.counterparty_name ?? '').trim()
    const loanNote = String(tx?.loan_note ?? '').trim()
    const txNote = String(tx?.note_plain ?? tx?.note ?? '').trim()
    const startDate = String(tx?.loan_start_date ?? '').trim()
    const composed = joinTitleParts([counterpartyName, loanNote])
    if (composed) return composed
    if (txNote) return txNote
    if (startDate) {
      return joinTitleParts([t('claim_sheet.form.imported_borrow_loan_item'), startDate])
    }
    return t('claim_sheet.form.imported_borrow_loan_item')
  }

  return String(tx?.category_name ?? '').trim()
    || String(tx?.note_plain ?? '').trim()
    || t('claim_sheet.form.imported_reimbursement_item')
}

export function claimSheetImportedIcon(tx) {
  return claimSheetImportKindFromTx(tx) === 'borrow_loan' ? DEFAULT_BORROW_ICON : ''
}

export function claimSheetImportedSourceLabel(tx, t) {
  return claimSheetImportKindFromTx(tx) === 'borrow_loan'
    ? t('claim_sheet.item_source.borrow_loan')
    : String(tx?.transaction_id ?? '').trim()
      ? t('claim_sheet.item_source.imported')
      : t('claim_sheet.item_source.manual')
}

export function claimSheetImportedEntryLabel(tx, t) {
  return claimSheetImportKindFromTx(tx) === 'borrow_loan'
    ? t('claim_sheet.entry_type.income')
    : t('claim_sheet.entry_type.expense')
}

export function claimSheetImportedAmountMinor(tx) {
  if (claimSheetImportKindFromTx(tx) === 'borrow_loan') {
    if (Number.isFinite(Number(tx?.loan_remaining_minor))) {
      return absMinor(tx.loan_remaining_minor)
    }
    return absMinor(tx?.amount_minor)
  }
  return reimbursementPendingMinor(tx)
}

export function claimSheetImportedEntryType(tx) {
  return claimSheetImportKindFromTx(tx) === 'borrow_loan' ? 'income' : 'expense'
}

export function buildClaimSheetImportedDraftTx(item) {
  const kind = claimSheetImportKindFromClaimItem(item)
  const amountMinor = absMinor(item?.amount_minor)
  return {
    id: String(item?.transaction_id ?? '').trim(),
    transaction_id: String(item?.transaction_id ?? '').trim(),
    category_id: item?.category_id ?? null,
    account_id: item?.account_id ?? null,
    category_name: '',
    note_plain: String(item?.transaction_note ?? '').trim(),
    note: String(item?.transaction_note ?? item?.description ?? '').trim(),
    occurred_at: item?.occurred_at,
    amount_minor: amountMinor,
    reimbursed_minor: 0,
    entry_type: String(item?.entry_type ?? '').trim() || (kind === 'borrow_loan' ? 'income' : 'expense'),
    source_type: String(item?.source_type ?? '').trim() || 'transaction',
    claimImportKind: kind,
  }
}

export function buildClaimSheetImportedClaimItem(tx, t) {
  const kind = claimSheetImportKindFromTx(tx)
  return {
    entryType: claimSheetImportedEntryType(tx),
    sourceType: 'transaction',
    transactionId: String(tx?.id ?? '').trim(),
    categoryId: tx?.category_id ?? null,
    accountId: tx?.account_id ?? null,
    description: claimSheetImportedTitle(tx, t),
    amountMinor: claimSheetImportedAmountMinor(tx),
    occurredAt: tx?.occurred_at,
    claimImportKind: kind,
  }
}
