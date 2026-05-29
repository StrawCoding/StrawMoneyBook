import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanDetailPage.vue'),
  'utf8',
)

test('SMB-225 v1.2.49: loan detail page exposes "新增同對象借出 / 借入" quick actions', () => {
  // Two distinct quick-action buttons must exist, each calling
  // openCreateForSameCounterparty(direction) with the right argument.
  assert.match(loanDetailSource, /openCreateForSameCounterparty\('lend'\)/)
  assert.match(loanDetailSource, /openCreateForSameCounterparty\('borrow'\)/)
  assert.match(loanDetailSource, /新增同對象借出/)
  assert.match(loanDetailSource, /新增同對象借入/)
  assert.match(loanDetailSource, /class="row btn-wrap counterparty-actions"/)
})

test('SMB-225 v1.2.49: same-counterparty create sheet reuses the standard loan create form fields', () => {
  // The bottom-sheet itself must be wired up.
  assert.match(loanDetailSource, /:open="createOpen"/)
  assert.match(loanDetailSource, /:title="createSheetTitle"/)
  assert.match(loanDetailSource, /@click="submitCreateLoan"/)

  // Form must include direction switch, counterparty input, principal,
  // optional interest, start/due date pickers, account select and note.
  assert.match(loanDetailSource, /v-model="createForm\.direction"/)
  assert.match(loanDetailSource, /v-model="createForm\.counterpartyName"/)
  assert.match(loanDetailSource, /v-model\.number="createForm\.principalMajor"/)
  assert.match(loanDetailSource, /v-model\.number="createForm\.interestMajor"/)
  assert.match(loanDetailSource, /pickCreateStartDate/)
  assert.match(loanDetailSource, /pickCreateDueDate/)
  assert.match(loanDetailSource, /v-model="createForm\.accountId"/)
  assert.match(loanDetailSource, /v-model="createForm\.note"/)
})

test('SMB-225 v1.2.49: openCreateForSameCounterparty pre-fills counterparty name from current loan', () => {
  // The handler must read counterparty_name from the current loan value and
  // assign it into the form. We also assert the direction is locked to the
  // argument so 借出 / 借入 don\u2019t leak into one another.
  assert.match(
    loanDetailSource,
    /function openCreateForSameCounterparty\(direction\)\s*\{[\s\S]*?loan\.value\?\.counterparty_name[\s\S]*?createForm\.direction =\s*direction === 'borrow'\s*\?\s*'borrow'\s*:\s*'lend'/,
  )
})

test('SMB-225 v1.2.49: submitCreateLoan validates counterparty + principal and calls loanStore.create', () => {
  assert.match(
    loanDetailSource,
    /async function submitCreateLoan\(\)\s*\{[\s\S]*?counterpartyName[\s\S]*?'請輸入對象名稱'[\s\S]*?principalMinor[\s\S]*?'本金需大於 0'[\s\S]*?loanStore\.create\(\{[\s\S]*?direction: createForm\.direction[\s\S]*?counterpartyName,[\s\S]*?principalMinor,/,
  )
})

test('SMB-225 v1.2.49: same-counterparty create sheet participates in app:request-close-overlay handler', () => {
  assert.match(
    loanDetailSource,
    /function onRequestCloseOverlay\(event\)\s*\{\s*if \(createOpen\.value\) \{\s*closeCreateSheet\(\)/,
  )
})

test('SMB-225 v1.2.49: createSheetTitle reflects the chosen direction (借出 / 借入)', () => {
  assert.match(
    loanDetailSource,
    /createSheetTitle = computed\(\(\) => \{[\s\S]*?createForm\.direction === 'borrow'[\s\S]*?'新增同對象借入'[\s\S]*?'新增同對象借出'/,
  )
})
