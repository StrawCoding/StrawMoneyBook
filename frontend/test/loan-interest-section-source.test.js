import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

const loanStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/loan.store.js'),
  'utf8',
)

const loanDetailPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanDetailPage.vue'),
  'utf8',
)

const loanInterestListPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanInterestListPage.vue'),
  'utf8',
)

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)

const loanListPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanListPage.vue'),
  'utf8',
)

test('service exports listLoanInterestPayments to surface loan interest records separately from advance/reimbursement modules', () => {
  assert.match(loanServiceSource, /export\s+async\s+function\s+listLoanInterestPayments\s*\(/)
})

test('listLoanInterestPayments filters only payments with positive interest component', () => {
  assert.match(loanServiceSource, /Number\(payment\.interest_component_minor \?\? 0\)\s*>\s*0/)
})

test('listLoanInterestPayments supports optional direction filter (lend | borrow)', () => {
  assert.match(loanServiceSource, /direction\s*===\s*'lend'\s*\|\|\s*direction\s*===\s*'borrow'/)
})

test('loan store exposes loadLoanInterestPayments action backed by listLoanInterestPayments', () => {
  assert.match(loanStoreSource, /listLoanInterestPayments/)
  assert.match(loanStoreSource, /async\s+loadInterestPayments\s*\(/)
  assert.match(loanStoreSource, /interestPayments:\s*\[\]/)
})

test('LoanDetailPage renders an independent loan interest section (not mixed with repayment list / reimbursement panel)', () => {
  assert.match(loanDetailPageSource, /利息紀錄/)
  assert.match(loanDetailPageSource, /interestPayments/)
})

test('LoanInterestListPage exists as a dedicated page for cross-loan interest overview', () => {
  assert.match(loanInterestListPageSource, /<h2>借貸利息明細<\/h2>/)
  assert.match(loanInterestListPageSource, /loadInterestPayments/)
})

test('router registers loan-interest route at /loans/interest mounting LoanInterestListPage', () => {
  assert.match(routerSource, /name:\s*'loan-interest'/)
  assert.match(routerSource, /path:\s*'\/loans\/interest'/)
  assert.match(routerSource, /LoanInterestListPage\.vue/)
})

test('LoanListPage exposes entry link to LoanInterestListPage (loan-interest route)', () => {
  assert.match(loanListPageSource, /name:\s*'loan-interest'/)
})
