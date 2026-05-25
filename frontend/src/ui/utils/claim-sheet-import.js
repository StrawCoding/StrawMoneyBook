import { reimbursementPendingMinor } from '@/ui/utils/reimbursement-item'

const DEFAULT_BORROW_ICON = 'fa-solid fa-arrow-down'

function absMinor(value) {
  return Math.max(0, Math.round(Math.abs(Number(value ?? 0))))
}

export function claimSheetImportKindFromTx(tx) {
  const explicitKind = String(tx?.claimImportKind ?? '').trim()
  if (explicitKind) return explicitKind

  const originType = String(tx?.origin_type ?? '').trim()
  const txType = String(tx?.type ?? '').trim()
  if (originType === 'loan_payment' && txType === 'income') {
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

export function claimSheetImportedTitle(tx, t) {
  const kind = claimSheetImportKindFromTx(tx)
  if (kind === 'borrow_loan') {
    return String(tx?.note_plain ?? '').trim()
      || String(tx?.note ?? '').trim()
      || t('claim_sheet.form.imported_borrow_loan_item', { id: tx?.id })
  }

  return String(tx?.category_name ?? '').trim()
    || String(tx?.note_plain ?? '').trim()
    || t('claim_sheet.form.imported_reimbursement_item', { id: tx?.id })
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
  return claimSheetImportKindFromTx(tx) === 'borrow_loan'
    ? absMinor(tx?.amount_minor)
    : reimbursementPendingMinor(tx)
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
