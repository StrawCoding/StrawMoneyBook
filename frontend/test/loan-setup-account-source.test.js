import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/loan.repo.js'),
  'utf8',
)

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

const loanStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/loan.store.js'),
  'utf8',
)

const loanDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanDetailPage.vue'),
  'utf8',
)

test('loan repo exposes the setup account id and ignores repayment-generated transactions', () => {
  assert.match(loanRepoSource, /AS setup_account_id/)
  assert.match(loanRepoSource, /export async function getLoanSetupTransaction\(ledgerId, loanId\)/)
  assert.match(loanRepoSource, /NOT EXISTS \(\s*SELECT 1\s*FROM loan_payments lp_ref/s)
  assert.match(loanRepoSource, /lp_ref\.generated_tx_id = t\.id OR lp_ref\.generated_interest_tx_id = t\.id/)
})

test('loan service can update the setup transaction account safely', () => {
  assert.match(loanServiceSource, /export async function updateLoanSetupAccount\(ledgerId, payload\)/)
  assert.match(loanServiceSource, /await assertLoanTransactionAccount\(ledgerId, accountId\)/)
  assert.match(loanServiceSource, /const setupTx = await getLoanSetupTransaction\(ledgerId, loanId\)/)
  assert.match(loanServiceSource, /await updateTransactionById\(ledgerId, setupTx\.id, \{/)
})

test('loan store refreshes dashboard and detail after changing the setup account', () => {
  assert.match(loanStoreSource, /async updateSetupAccount\(payload\)/)
  assert.match(loanStoreSource, /await updateLoanSetupAccount\(ledgerStore\.activeLedgerId, payload\)/)
  assert.match(loanStoreSource, /await this\.loadDetail\(payload\.loanId\)/)
})

test('loan detail page exposes a setup-account editor', () => {
  assert.match(loanDetailSource, /t\('loans\.setup_account'\)/)
  assert.match(loanDetailSource, /t\('loans\.change_setup_account'\)/)
  assert.match(loanDetailSource, /loanStore\.updateSetupAccount\(\{/)
  assert.match(
    loanDetailSource,
    /<CustomSelect v-model="setupAccountForm\.accountId" :groups="accountStore\.groupedRegularAccounts" \/>/,
  )
})
