import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const quickAddSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/QuickAddPage.vue'),
  'utf8',
)
const transactionEditSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionEditPage.vue'),
  'utf8',
)
const aiBookkeepingPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)
const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)

test('manual transaction forms allow zero amount after addon offsets', () => {
  assert.match(quickAddSource, /settledAmountMinorRaw < 0/)
  assert.match(transactionEditSource, /settledAmountMinorRaw < 0/)
  assert.match(aiBookkeepingPageSource, /settledAmountMinorRaw < 0/)
  assert.match(transactionServiceSource, /assertNonNegativeAmount\(amountMinor\)/)
})

test('AI bookkeeping parser receives addon templates from the active ledger', () => {
  assert.match(aiBookkeepingPageSource, /addonTemplates: addonTemplateItems\.value/)
})
