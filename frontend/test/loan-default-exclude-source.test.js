import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

test('loan setup transaction defaults includeInBudget and includeInAnalysis to false', () => {
  assert.match(loanServiceSource, /originType: 'loan_payment',\s*externalRefId: loan\.id,\s*includeInBudget: false,\s*includeInAnalysis: false,/s)
})

test('loan principal repayment transaction defaults includeInBudget and includeInAnalysis to false', () => {
  const createRepaymentBlock = loanServiceSource.match(/let txId = null[\s\S]*?let interestTxId = null/)
  assert.ok(createRepaymentBlock, '應找到建立還款交易區塊')
  assert.match(createRepaymentBlock[0], /includeInBudget: false,\s*includeInAnalysis: false,/s)
})

test('loan interest repayment transaction defaults includeInBudget and includeInAnalysis to false', () => {
  const interestBlock = loanServiceSource.match(/let interestTxId = null[\s\S]*?const paymentId = await createLoanPayment/)
  assert.ok(interestBlock, '應找到建立利息交易區塊')
  assert.match(interestBlock[0], /includeInBudget: false,\s*includeInAnalysis: false,/s)
})

test('updateLoanRepayment does not set includeInBudget or includeInAnalysis to true', () => {
  assert.doesNotMatch(loanServiceSource, /includeInBudget: true/)
  assert.doesNotMatch(loanServiceSource, /includeInAnalysis: true/)
})
