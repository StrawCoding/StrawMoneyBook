import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const claimSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

const claimDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
  'utf8',
)

test('claim sheet create form includes a counterparty field and passes it to the service', () => {
  assert.match(claimSheetSource, /v-model="createForm\.counterpartyName"/)
  assert.match(claimSheetSource, /createForm = reactive\(\{[\s\S]*editingClaimId: '',[\s\S]*counterpartyName: ''/)
  assert.match(claimSheetSource, /createForm\.counterpartyName = ''/)
  assert.match(claimSheetSource, /const payload = \{[\s\S]*counterpartyName: createForm\.counterpartyName/)
  assert.match(claimSheetSource, /await createReimbursementDraft\(ledgerStore\.activeLedgerId, payload\)/)
})

test('claim sheet surfaces the counterparty in list and detail flows', () => {
  assert.match(claimSheetSource, /v-if="claim\.counterparty_name"/)
  assert.match(claimDetailSource, /v-if="claim\.counterparty_name"/)
  assert.match(claimSheetSource, /v-if="completeTarget\.counterparty_name"/)
})
