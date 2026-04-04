import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)
const budgetRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/budget.repo.js'),
  'utf8',
)
const exportServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/export.service.js'),
  'utf8',
)
const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)
const aboutSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionAboutPage.vue'),
  'utf8',
)
const editSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionEditPage.vue'),
  'utf8',
)

test('transaction queries expose refund-link state for downstream summaries', () => {
  assert.match(transactionRepoSource, /function refundRelationExistsSql\(sourceAlias = 't'\)/)
  assert.match(transactionRepoSource, /AS has_refund_link/)
})

test('budget and export queries exclude refunded source transactions from aggregates', () => {
  assert.match(budgetRepoSource, /function refundedSourceExclusionSql\(sourceAlias = 'transactions'\)/)
  assert.match(budgetRepoSource, /AND \$\{refundedSourceExclusionSql\('transactions'\)\}/)
  assert.match(exportServiceSource, /AS has_refund_link/)
})

test('refund creation validates account selection, avoids duplicates, and marks refund origin type', () => {
  assert.match(transactionServiceSource, /const existingRefunds = await listTransactionsByExternalRef\(ledgerId, sourceTransactionId\)/)
  assert.match(transactionServiceSource, /throw new Error\('此交易已建立退款'\)/)
  assert.match(transactionServiceSource, /throw new Error\('退款帳戶幣別必須與原交易帳戶一致'\)/)
  assert.match(transactionServiceSource, /originType: 'refund'/)
})

test('transaction about page opens an account picker before creating refunds', () => {
  assert.match(aboutSource, /const refundSheetOpen = ref\(false\)/)
  assert.match(aboutSource, /const refundAccountId = ref\(''\)/)
  assert.match(aboutSource, /<InputBottomSheet[\s\S]*transaction_about\.refund_account_title/)
  assert.match(aboutSource, /<CustomSelect v-model="refundAccountId" :groups="refundAccountGroups"/)
  assert.match(aboutSource, /@click="openRefundSheet"/)
  assert.match(aboutSource, /accountId: refundAccountId\.value/)
})

test('refund edit page limits refund records to adjustment mode only', () => {
  assert.match(editSource, /if \(String\(transaction\.value\?\.origin_type \?\? ''\)\.trim\(\) === 'refund'\) \{/)
  assert.match(editSource, /return \[\{ value: 'adjustment', label: t\('transaction\.type\.adjustment'/)
})
