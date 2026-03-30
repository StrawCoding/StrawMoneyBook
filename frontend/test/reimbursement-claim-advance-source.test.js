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

test('reimbursement service supports updating draft claim sheets', () => {
  assert.match(reimbursementServiceSource, /export async function updateReimbursementDraft\(ledgerId, reimbursementId, payload\)/)
  assert.match(reimbursementServiceSource, /if \(String\(claim\.status \?\? 'draft'\) !== 'draft'\) \{\s+throw new Error\('只有草稿請款單可編輯'\)/)
  assert.match(reimbursementServiceSource, /await updateReimbursement\(ledgerId, normalizedReimbursementId, \{/)
  assert.match(reimbursementServiceSource, /await replaceReimbursementItems\(ledgerId, normalizedReimbursementId, payload\.items\)/)
})

test('claim payment creates reimbursement advances for advance items', () => {
  assert.match(reimbursementServiceSource, /function listClaimAdvanceItems\(claimItems = \[\]\) \{/)
  assert.match(reimbursementServiceSource, /String\(item\?\.source_type \?\? ''\)\.trim\(\) === 'advance'/)
  assert.match(reimbursementServiceSource, /const reimbursementCashMinor = Math\.max\(0, advanceResult\.cashAmountMinor - claimAdvanceMinor\)/)
  assert.match(reimbursementServiceSource, /const createdAdvance = await createReimbursementAdvanceEntry\(ledgerId, \{/)
  assert.match(reimbursementServiceSource, /createdAdvanceIds,/)
})

test('reimbursement repo exposes claim update and item replacement helpers', () => {
  assert.match(reimbursementRepoSource, /export async function updateReimbursement\(ledgerId, reimbursementId, input\)/)
  assert.match(reimbursementRepoSource, /export async function deleteReimbursementItemsByReimbursementId\(ledgerId, reimbursementId\)/)
})
