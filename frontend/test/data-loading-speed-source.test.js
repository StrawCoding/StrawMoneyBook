import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getEffectiveTransactionAmountMinor,
  isCountableForIncomeExpense,
} from '../src/ui/utils/refund-transaction.js'

const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)
const transactionQueryServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction-query.service.js'),
  'utf8',
)
const ledgerRuntimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/ledger-runtime.service.js'),
  'utf8',
)
const transactionStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/transaction.store.js'),
  'utf8',
)

function summarizeLikeJs(transactions) {
  let incomeMinor = 0
  let expenseMinor = 0
  for (const tx of transactions) {
    if (!isCountableForIncomeExpense(tx)) continue
    if (String(tx?.origin_type ?? '') === 'loan_payment') continue
    const amount = getEffectiveTransactionAmountMinor(tx)
    if (tx.type === 'income') incomeMinor += amount
    else if (tx.type === 'expense') expenseMinor += Math.abs(amount)
  }
  return { incomeMinor, expenseMinor }
}

test('smb287 SQL home asset totals keep refund / analysis / loan_payment semantics', () => {
  const sample = [
    { type: 'income', amount_minor: 1000, include_in_analysis: 1, origin_type: null, has_refund_link: 0, refund_deducted_minor: 0 },
    { type: 'expense', amount_minor: -800, include_in_analysis: 1, origin_type: null, has_refund_link: 1, refund_deducted_minor: 200 },
    { type: 'expense', amount_minor: -500, include_in_analysis: 0, origin_type: null, has_refund_link: 0, refund_deducted_minor: 0 },
    { type: 'expense', amount_minor: -300, include_in_analysis: 1, origin_type: 'loan_payment', has_refund_link: 0, refund_deducted_minor: 0 },
    { type: 'income', amount_minor: 150, include_in_analysis: 1, origin_type: 'refund', external_ref_id: 'tx1', category_name: '退款', has_refund_link: 0, refund_deducted_minor: 0 },
  ]
  const totals = summarizeLikeJs(sample)
  assert.equal(totals.incomeMinor, 1000)
  assert.equal(totals.expenseMinor, 600)
})

test('smb287 data-loading hot paths use SQL summarize, staged bootstrap, detail related fetch', () => {
  assert.match(transactionRepoSource, /export async function summarizeHomeAssetTotalsByScope/)
  assert.match(transactionRepoSource, /export async function listAllTransactionsChunked/)
  assert.match(transactionRepoSource, /export async function listRelatedTransactionsForDetail/)
  assert.match(transactionRepoSource, /await yieldToMainThread\(\)/)

  assert.match(transactionQueryServiceSource, /summarizeHomeAssetTotalsByScope/)
  assert.match(transactionQueryServiceSource, /loadAnalysisStats/)
  assert.match(transactionRepoSource, /export async function summarizeAnalysisBreakdown/)
  assert.match(transactionQueryServiceSource, /listAllTransactionsChunked/)
  assert.match(transactionQueryServiceSource, /listRelatedTransactionsForDetail/)
  assert.doesNotMatch(transactionQueryServiceSource, /listAllTransactions\(ledgerId, \{ mode: 'all' \}\)/)
  assert.doesNotMatch(transactionQueryServiceSource, /while \(true\)/)

  assert.match(ledgerRuntimeSource, /scheduleDeferredLedgerHydration/)
  assert.match(ledgerRuntimeSource, /Critical path/)
  assert.match(ledgerRuntimeSource, /budgetStore\.loadCurrentMonth\(\)/)
  assert.doesNotMatch(ledgerRuntimeSource, /await Promise\.all\(\[\s*accountStore\.load\(\),\s*categoryStore\.load\(\),\s*transactionStore\.loadRecent\(\)/s)

  assert.match(transactionStoreSource, /homeLoadToken/)
  assert.match(transactionStoreSource, /if \(this\.homeLoadToken !== loadToken\) return/)
})
