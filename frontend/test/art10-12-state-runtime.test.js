/**
 * ART-10/11/12 — mutation refresh contract, ledger reset credit, runtime job scheduler.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRuntimeJobScheduler } from '../src/ui/services/runtime-job-scheduler.js'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(resolve(root, rel), 'utf8')

const transactionStore = read('src/ui/stores/transaction.store.js')
const creditStore = read('src/ui/stores/credit.store.js')
const loanStore = read('src/ui/stores/loan.store.js')
const securityStore = read('src/ui/stores/security.store.js')
const mutationRefresh = read('src/ui/services/transaction-mutation-refresh.js')
const ledgerRuntime = read('src/ui/services/ledger-runtime.service.js')
const appRuntime = read('src/ui/services/app-runtime.service.js')

test('ART-10 transaction store write exits call refreshAfterWriteSafe', () => {
  for (const action of [
    'addExpense',
    'addIncome',
    'addAdjustment',
    'addRefund',
    'addTransfer',
    'updateTransaction',
    'deleteTransaction',
    'deleteTransactionsBatch',
  ]) {
    assert.match(transactionStore, new RegExp(`async ${action}\\(`))
  }
  assert.match(transactionStore, /await this\.refreshAfterWriteSafe\(/)
  assert.match(transactionStore, /async afterTransactionMutation\(/)
  assert.match(mutationRefresh, /export async function afterTransactionMutation/)
  assert.match(mutationRefresh, /refreshAfterWriteSafe/)
})

test('ART-10 credit / loan / security cash-writing exits call afterTransactionMutation', () => {
  assert.match(creditStore, /afterTransactionMutation/)
  assert.match(creditStore, /async purchase\([\s\S]*?afterTransactionMutation\(\)/)
  assert.match(creditStore, /async repay\([\s\S]*?afterTransactionMutation\(\)/)

  assert.match(loanStore, /afterTransactionMutation/)
  for (const action of ['create', 'repay', 'repayBatchByCounterparty', 'repayBatchByLoanIds', 'updateRepayment', 'deleteRepayment', 'deleteVoided']) {
    assert.match(loanStore, new RegExp(`async ${action}\\([\\s\\S]*?afterTransactionMutation\\(\\)`))
  }

  assert.match(securityStore, /afterTransactionMutation/)
  assert.match(securityStore, /async confirmSettlement\([\s\S]*?afterTransactionMutation\(\)/)
  assert.match(securityStore, /async cancelSettlement\([\s\S]*?afterTransactionMutation\(\)/)
  assert.match(securityStore, /async removeTransaction\([\s\S]*?afterTransactionMutation\(\)/)
})

test('ART-11 ledger-runtime reset / clear / hydrate include credit.store', () => {
  assert.match(ledgerRuntime, /useCreditStore/)
  assert.match(ledgerRuntime, /useCreditStore\(pinia\)\.\$reset\(\)/)
  assert.match(ledgerRuntime, /useCreditStore\(pinia\)\.load\(\)/)
  assert.equal(
    (ledgerRuntime.match(/useCreditStore\(pinia\)\.\$reset\(\)/g) || []).length >= 2,
    true,
    'credit reset in resetLedgerScopedStores and clearSecondaryLedgerStores',
  )
})

test('ART-12 RuntimeJobScheduler coalesces same-name jobs', async () => {
  const scheduler = createRuntimeJobScheduler()
  let runs = 0
  const slow = () => new Promise((resolve) => {
    runs += 1
    setTimeout(resolve, 30)
  })
  const a = scheduler.run('drive-ledger-sync', slow)
  const b = scheduler.run('drive-ledger-sync', slow)
  assert.equal(scheduler.isRunning('drive-ledger-sync'), true)
  await Promise.all([a, b])
  assert.equal(runs, 1)
  assert.equal(scheduler.isRunning('drive-ledger-sync'), false)

  await scheduler.run('drive-ledger-sync', slow)
  assert.equal(runs, 2)
})

test('ART-12 app-runtime wires runtime job scheduler for resume sync jobs', () => {
  assert.match(appRuntime, /createRuntimeJobScheduler/)
  assert.match(appRuntime, /runSharedLedgerSyncJob/)
  assert.match(appRuntime, /runGoogleDriveLedgerSyncJob/)
  assert.match(appRuntime, /credit-rollover:\$\{ledgerId\}/)
})
