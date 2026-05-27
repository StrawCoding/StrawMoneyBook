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
