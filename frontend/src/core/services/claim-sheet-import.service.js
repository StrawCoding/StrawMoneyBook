import { listBorrowLoanImportTransactions } from '@/core/repositories/loan.repo'

function parsePresetInterestMinor(rawRule) {
  if (!rawRule) return 0
  try {
    const parsed = JSON.parse(String(rawRule))
    return Math.max(0, Math.round(Number(parsed?.presetInterestMinor ?? 0)))
  } catch {
    return 0
  }
}

function computeLoanRemainingMinor(tx) {
  const principalMinor = Math.max(0, Number(tx?.loan_principal_minor ?? 0))
  const paidMinor = Math.max(0, Number(tx?.loan_paid_minor ?? 0))
  const presetInterestMinor = parsePresetInterestMinor(tx?.loan_interest_rule_json)
  const targetTotalMinor = principalMinor + presetInterestMinor
  return Math.max(0, targetTotalMinor - paidMinor)
}

function annotateReimbursementImportTx(tx) {
  return {
    ...tx,
    claimImportKind: 'reimbursement',
    note_plain: String(tx?.note ?? '').trim(),
  }
}

function annotateBorrowLoanImportTx(tx) {
  return {
    ...tx,
    claimImportKind: 'borrow_loan',
    loan_id: tx?.loan_id ?? null,
    loan_direction: tx?.loan_direction ?? null,
    loan_note: String(tx?.loan_note ?? '').trim(),
    loan_start_date: String(tx?.loan_start_date ?? '').trim(),
    loan_principal_minor: Number.isFinite(Number(tx?.loan_principal_minor))
      ? Number(tx?.loan_principal_minor)
      : null,
    loan_paid_minor: Math.max(0, Number(tx?.loan_paid_minor ?? 0)),
    loan_remaining_minor: computeLoanRemainingMinor(tx),
    counterparty_name: String(tx?.counterparty_name ?? '').trim(),
    note_plain: String(tx?.note ?? '').trim(),
  }
}

function compareImportableTx(a, b) {
  const aTime = new Date(String(a?.occurred_at ?? 0)).getTime()
  const bTime = new Date(String(b?.occurred_at ?? 0)).getTime()
  if (aTime !== bTime) return bTime - aTime
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''))
}

export function listClaimSheetImportableReimbursements({ reimbursementTransactions = [] } = {}) {
  return reimbursementTransactions
    .map(annotateReimbursementImportTx)
    .filter((tx) => String(tx?.id ?? '').trim())
    .sort(compareImportableTx)
}

export async function listClaimSheetImportableBorrowLoans(ledgerId) {
  const borrowLoanTransactions = ledgerId ? await listBorrowLoanImportTransactions(ledgerId) : []
  return borrowLoanTransactions
    .map(annotateBorrowLoanImportTx)
    .filter((tx) => String(tx?.id ?? '').trim())
    .sort(compareImportableTx)
}

export async function listClaimSheetImportableTransactions(ledgerId, { reimbursementTransactions = [] } = {}) {
  const [reimbursementImportable, borrowLoanImportable] = await Promise.all([
    Promise.resolve(listClaimSheetImportableReimbursements({ reimbursementTransactions })),
    listClaimSheetImportableBorrowLoans(ledgerId),
  ])
  return [...reimbursementImportable, ...borrowLoanImportable]
    .filter((tx) => String(tx?.id ?? '').trim())
    .sort(compareImportableTx)
}
