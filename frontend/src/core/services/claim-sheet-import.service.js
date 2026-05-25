import { listBorrowLoanImportTransactions } from '@/core/repositories/loan.repo'

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

export async function listClaimSheetImportableTransactions(ledgerId, { reimbursementTransactions = [] } = {}) {
  const borrowLoanTransactions = ledgerId ? await listBorrowLoanImportTransactions(ledgerId) : []
  return [...reimbursementTransactions.map(annotateReimbursementImportTx), ...borrowLoanTransactions.map(annotateBorrowLoanImportTx)]
    .filter((tx) => String(tx?.id ?? '').trim())
    .sort(compareImportableTx)
}
