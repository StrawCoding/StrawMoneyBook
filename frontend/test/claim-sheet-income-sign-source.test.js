import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const claimSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

const reimbursementRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/reimbursement.repo.js'),
  'utf8',
)

test('claim sheet preview no longer flips income items to negative values', () => {
  assert.match(claimSheetSource, /totalMinor \+= amountMinor/)
  assert.doesNotMatch(claimSheetSource, /item\.entryType === 'income' \? amountMinor \* -1 : amountMinor/)
  assert.match(claimSheetSource, /function signedMinorOfItem\(item\) \{\s+return Math\.max\(0, Math\.round\(Number\(item\?\.amount_minor \?\? 0\)\)\)\s+\}/)
})

test('reimbursement total recompute sums income items as collectible positive amounts', () => {
  assert.match(reimbursementRepoSource, /SET total_minor = \(\s+SELECT COALESCE\(SUM\(amount_minor\), 0\)/)
  assert.doesNotMatch(reimbursementRepoSource, /WHEN entry_type = 'income' THEN amount_minor \* -1/)
})
