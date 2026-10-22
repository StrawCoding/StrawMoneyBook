import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBookkeepingSubmitErrorMessage } from '../src/ui/utils/bookkeeping-submit-error.js'

const t = (key, fallback) => {
  const map = {
    'quick_add.error.amount_required': '請輸入有效金額（需大於 0）',
    'quick_add.error.credit_closed_statement': '帳單已關帳',
    'quick_add.toast.create_failed': '新增失敗',
  }
  return map[key] ?? fallback ?? key
}

test('resolveBookkeepingSubmitErrorMessage maps credit closed statement code', () => {
  const msg = resolveBookkeepingSubmitErrorMessage(
    { code: 'CLOSED_STATEMENT_POSTING_FORBIDDEN', message: 'raw' },
    t,
  )
  assert.equal(msg, '帳單已關帳')
})

test('resolveBookkeepingSubmitErrorMessage maps zero amount backend message', () => {
  const msg = resolveBookkeepingSubmitErrorMessage(new Error('金額必須大於 0'), t)
  assert.equal(msg, '請輸入有效金額（需大於 0）')
})

test('resolveBookkeepingSubmitErrorMessage falls back to message then generic', () => {
  assert.equal(resolveBookkeepingSubmitErrorMessage(new Error('自訂錯誤'), t), '自訂錯誤')
  assert.equal(resolveBookkeepingSubmitErrorMessage(new Error(''), t), '新增失敗')
})
