import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

const reimbursementRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/reimbursement.repo.js'),
  'utf8',
)

const claimDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
  'utf8',
)

const claimListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

test('claim sheet restore reverts paid state and related advance records', () => {
  assert.match(reimbursementServiceSource, /paid: \['draft'\]/)
  assert.match(reimbursementServiceSource, /if \(String\(claim\.status \?\? ''\) === 'paid' && nextStatus === 'draft'\) \{/)
  assert.match(reimbursementServiceSource, /await revertPaidClaimEffects\(ledgerId, claim, claimItems\)/)
  assert.match(reimbursementServiceSource, /originType: 'reimbursement',[\s\S]*externalRefId: claim\.id,[\s\S]*idempotencyKey: `\$\{idempotencyKey\}:advance:\$\{index \+ 1\}`/)
  assert.match(reimbursementServiceSource, /await softDeleteTransactionsByOriginRef\(ledgerId, 'reimbursement', claim\.id\)/)
  assert.match(reimbursementServiceSource, /const generatedAdvances = await listReimbursementAdvancesByReimbursementId\(ledgerId, claim\.id\)/)
  assert.match(reimbursementServiceSource, /const usages = await listReimbursementAdvanceUsagesByAdvanceId\(ledgerId, advance\.id\)/)
})

test('reimbursement repo can look up claim-generated advances and reset paid metadata on draft restore', () => {
  assert.match(reimbursementRepoSource, /export async function listReimbursementAdvanceUsagesByAdvanceId\(ledgerId, advanceId\)/)
  assert.match(reimbursementRepoSource, /export async function listReimbursementAdvancesByReimbursementId\(ledgerId, reimbursementId\)/)
  assert.match(reimbursementRepoSource, /t\.origin_type = 'reimbursement'/)
  assert.match(reimbursementRepoSource, /t\.external_ref_id = \?/)
  assert.match(reimbursementRepoSource, /if \(nextStatus === 'draft'\) \{/)
  assert.match(reimbursementRepoSource, /paid_tx_id = NULL,/)
  assert.match(reimbursementRepoSource, /idempotency_key = NULL,/)
})

test('claim sheet detail page exposes restore action for completed claims', () => {
  assert.match(claimDetailSource, /v-if="isClaimRestorable\(claim\)"/)
  assert.match(claimDetailSource, /t\('claim_sheet\.restore'\)/)
  assert.match(claimDetailSource, /transitionReimbursementStatus\(ledgerStore\.activeLedgerId, claim\.value\.id, 'draft'\)/)
  assert.match(claimDetailSource, /t\('claim_sheet\.toast\.restored'\)/)
})

test('claim sheet completion account selector matches the shared account options used elsewhere', () => {
  assert.match(claimListSource, /<CustomSelect v-model="completeForm\.accountId" :options="accountStore\.accounts" \/>/)
  assert.match(claimListSource, /return accountStore\.accounts\.some\(\(item\) => item\.id === String\(completeForm\.accountId \?\? ''\)\.trim\(\)\)/)
  assert.match(claimListSource, /completeForm\.accountId = String\(accountStore\.accounts\[0\]\?\.id \?\? ''\)/)
  assert.doesNotMatch(claimListSource, /claimAccountOptions/)
})
