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

const initSchemaSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/migrations/001_init.sql'),
  'utf8',
)

const advanceSourceMigration = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/migrations/023_reimbursement_item_advance_source.sql'),
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
  assert.match(reimbursementServiceSource, /const reimbursementCashMinor = Math\.max\(\s*0,\s*advanceResult\.cashAmountMinor\s*\)/)
  assert.match(reimbursementServiceSource, /const createdAdvance = await createReimbursementAdvanceEntry\(ledgerId, \{/)
  assert.match(reimbursementServiceSource, /createdAdvanceIds,/)
})

test('reimbursement repo exposes claim update and item replacement helpers', () => {
  assert.match(reimbursementRepoSource, /export async function updateReimbursement\(ledgerId, reimbursementId, input\)/)
  assert.match(reimbursementRepoSource, /export async function deleteReimbursementItemsByReimbursementId\(ledgerId, reimbursementId\)/)
})

test('reimbursement item schema allows advance source type for claim sheet advances', () => {
  assert.match(initSchemaSource, /source_type TEXT NOT NULL CHECK \(source_type IN \('transaction','manual','advance'\)\)/)
  assert.match(advanceSourceMigration, /ALTER TABLE reimbursement_items RENAME TO reimbursement_items__old_source_type;/)
  assert.match(advanceSourceMigration, /source_type TEXT NOT NULL CHECK \(source_type IN \('transaction','manual','advance'\)\)/)
  assert.match(advanceSourceMigration, /INSERT INTO reimbursement_items \(/)
})
