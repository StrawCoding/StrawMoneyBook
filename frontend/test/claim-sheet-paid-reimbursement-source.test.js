import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

test('reimbursement transaction list counts paid claim sheet items as reimbursed amount', () => {
  assert.match(transactionRepoSource, /function paidClaimItemMinorSql\(sourceAlias = 't'\)/)
  assert.match(transactionRepoSource, /INNER JOIN reimbursements r[\s\S]*r\.id = ri\.reimbursement_id/)
  assert.match(transactionRepoSource, /ri\.transaction_id = \$\{sourceAlias\}\.id/)
  assert.match(transactionRepoSource, /r\.status = 'paid'/)
  assert.match(transactionRepoSource, /\$\{paidClaimItemMinorSql\('t'\)\} AS claim_reimbursed_minor/)
  assert.match(transactionRepoSource, /\+\s+\$\{paidClaimItemMinorSql\('t'\)\} AS reimbursed_minor/)
})

test('reimbursable expense state sync keeps paid claim sheet items reimbursed', () => {
  assert.match(transactionRepoSource, /export async function getPaidClaimItemMinorByTransactionId\(ledgerId, expenseTxId\)/)
  assert.match(reimbursementServiceSource, /getPaidClaimItemMinorByTransactionId/)
  assert.match(
    reimbursementServiceSource,
    /const hasSettlement = Boolean\(cashTx\?\.id\) \|\| usages\.length > 0 \|\| claimPaidMinor > 0/,
  )
})

test('soft-deleted reimbursement transactions release idempotency keys for claim re-completion', () => {
  assert.match(
    transactionRepoSource,
    /export async function softDeleteTransactionById[\s\S]*SET deleted_at = \?,\s+idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END,/,
  )
  assert.match(
    transactionRepoSource,
    /export async function softDeleteTransferGroup[\s\S]*SET deleted_at = \?,\s+idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END,/,
  )
  assert.match(
    transactionRepoSource,
    /export async function softDeleteTransactionsByOriginRef[\s\S]*SET deleted_at = \?,\s+idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END,/,
  )
})
