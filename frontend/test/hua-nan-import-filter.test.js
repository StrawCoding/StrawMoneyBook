import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldIgnoreHuaNanImportedRow } from '../src/services/bank-sync/shared.js'

test('shouldIgnoreHuaNanImportedRow skips signature debit settlement', () => {
  assert.equal(
    shouldIgnoreHuaNanImportedRow({
      summary: '金融卡交易立即扣款',
      description: '簽帳扣',
    }),
    true,
  )
})

test('shouldIgnoreHuaNanImportedRow keeps signature debit merchant row', () => {
  assert.equal(
    shouldIgnoreHuaNanImportedRow({ summary: '簽章金融卡交易 統一超商' }),
    false,
  )
})

test('shouldIgnoreHuaNanImportedRow ignores unrelated 簽帳扣 without debit card context', () => {
  assert.equal(shouldIgnoreHuaNanImportedRow({ summary: '簽帳扣 轉帳' }), false)
})
