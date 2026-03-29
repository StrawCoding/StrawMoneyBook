import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const claimSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

test('claim sheet create form includes a counterparty field and passes it to the service', () => {
  assert.match(claimSheetSource, /v-model="createForm\.counterpartyName"/)
  assert.match(claimSheetSource, /createForm = reactive\(\{[\s\S]*counterpartyName: ''/)
  assert.match(claimSheetSource, /createForm\.counterpartyName = ''/)
  assert.match(claimSheetSource, /createReimbursementDraft\(ledgerStore\.activeLedgerId, \{[\s\S]*counterpartyName: createForm\.counterpartyName/)
})

test('claim sheet surfaces the counterparty in list and detail flows', () => {
  assert.match(claimSheetSource, /v-if="claim\.counterparty_name"/)
  assert.match(claimSheetSource, /v-if="detailClaim\.counterparty_name"/)
  assert.match(claimSheetSource, /v-if="completeTarget\.counterparty_name"/)
})
