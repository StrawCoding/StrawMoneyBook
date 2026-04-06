import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)
const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)
const loanDetailPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanDetailPage.vue'),
  'utf8',
)
const loanStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/loan.store.js'),
  'utf8',
)

test('deleteLoan allows any status and direction', () => {
  assert.match(loanServiceSource, /export async function deleteLoan/)
  assert.doesNotMatch(loanServiceSource, /canDelete.*void.*settled.*lend/)
  assert.match(loanServiceSource, /export async function deleteLoanByExternalRefId/)
})

test('canDeleteLoan in LoanDetailPage allows all loans', () => {
  assert.match(loanDetailPageSource, /function canDeleteLoan\(item\)/)
  assert.doesNotMatch(loanDetailPageSource, /direction === 'lend' \|\| \['void', 'settled'\]/)
})

test('transaction service deletes loan when loan_payment transaction is deleted', () => {
  assert.match(transactionServiceSource, /deleteLoanByExternalRefId/)
  assert.match(transactionServiceSource, /external_ref_id/)
  assert.doesNotMatch(transactionServiceSource, /deleteLoanRepaymentByTransactionId/)
})

test('loan store uses deleteLoan', () => {
  assert.match(loanStoreSource, /deleteLoan/)
  assert.doesNotMatch(loanStoreSource, /deleteVoidedLoan/)
})
