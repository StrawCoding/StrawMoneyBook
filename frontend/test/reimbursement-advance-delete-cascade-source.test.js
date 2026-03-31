import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const reimbursementRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/reimbursement.repo.js'),
  'utf8',
)

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)

test('reimbursement repo can look up advances by their source transaction id', () => {
  assert.match(reimbursementRepoSource, /export async function listReimbursementAdvancesBySourceTxId\(ledgerId, sourceTxId\)/)
  assert.match(reimbursementRepoSource, /AND ra\.deleted_at IS NULL[\s\S]*AND ra\.source_tx_id = \?/)
})

test('reimbursement service removes advance records and usages when their source transaction is deleted', () => {
  assert.match(reimbursementServiceSource, /export async function removeReimbursementAdvanceEffectsBySourceTransaction\(ledgerId, sourceTxId\)/)
  assert.match(reimbursementServiceSource, /const advances = await listReimbursementAdvancesBySourceTxId\(ledgerId, normalizedSourceTxId\)/)
  assert.match(reimbursementServiceSource, /const usages = await listReimbursementAdvanceUsagesByAdvanceId\(ledgerId, advance\.id\)/)
  assert.match(reimbursementServiceSource, /await deleteAdvanceUsageRecords\(ledgerId, usages, \{ syncExpenseState: true \}\)/)
  assert.match(reimbursementServiceSource, /await softDeleteReimbursementAdvanceById\(ledgerId, advance\.id\)/)
})

test('transaction deletion cascades into reimbursement advance cleanup before soft deleting transactions', () => {
  assert.match(transactionServiceSource, /removeReimbursementAdvanceEffectsBySourceTransaction/)
  assert.match(transactionServiceSource, /await removeAdvanceUsagesForExpenseTransaction\(ledgerId, relatedTxId\)\s+await removeReimbursementAdvanceEffectsBySourceTransaction\(ledgerId, relatedTxId\)\s+await softDeleteTransactionById\(ledgerId, relatedTxId\)/)
})
