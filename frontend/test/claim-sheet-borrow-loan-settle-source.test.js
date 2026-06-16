import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

const claimSheetListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

test('claim completion subtracts borrow_loan amounts from reimbursement cash income', () => {
  assert.match(
    reimbursementServiceSource,
    /const reimbursementCashMinor = Math\.max\(\s*0,\s*advanceResult\.cashAmountMinor - claimAdvanceMinor - borrowLoanMinor,/,
  )
  assert.match(reimbursementServiceSource, /function sumClaimBorrowLoanMinor/)
})

test('claim completion settles borrow_loan items through loan repayment with idempotency keys', () => {
  assert.match(reimbursementServiceSource, /idempotencyKey: `\$\{idempotencyBase\}:loan_repay:\$\{loanId\}`/)
  assert.match(reimbursementServiceSource, /await addLoanRepayment\(ledgerId, \{/)
  assert.doesNotMatch(reimbursementServiceSource, /softDeleteLoanById/)
  assert.doesNotMatch(reimbursementServiceSource, /deleteLoanPaymentsByLoanId/)
})

test('claim revert removes loan repayments created during completion instead of restoring deleted loans', () => {
  assert.match(
    reimbursementServiceSource,
    /await deleteLoanRepaymentByTransactionId\(ledgerId, existingTx\.id\)/,
  )
  assert.match(reimbursementServiceSource, /revertedLoanIds/)
})

test('loan repayment supports idempotent claim settlement keys', () => {
  assert.match(loanServiceSource, /findTransactionByIdempotencyKey/)
  assert.match(loanServiceSource, /idempotencyKey: idempotencyKey \|\| undefined/)
})

test('claim completion dialog excludes borrow_loan amounts from cash preview', () => {
  assert.match(claimSheetListSource, /completeBorrowLoanMinor/)
  assert.match(claimSheetListSource, /- completeBorrowLoanMinor\.value/)
  assert.match(claimSheetListSource, /\|\| completeBorrowLoanMinor\.value > 0/)
})
