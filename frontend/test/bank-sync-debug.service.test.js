import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getBankSyncDebugTraceSnapshot,
  resetBankSyncDebugTraceForTest,
  traceBankSyncOperation,
} from '../src/core/services/bank-sync-debug.service.js'

afterEach(() => {
  resetBankSyncDebugTraceForTest()
})

test('traceBankSyncOperation records native debug trace on success', async () => {
  const result = await traceBankSyncOperation('connect_first_bank', {
    ledgerId: 'ledger-1',
    provider: 'first_bank_tw',
    connectionId: 'conn-1',
  }, async (context) => {
    context.attachDebugTrace({
      action: 'connect_first_bank',
      debugHint: 'check captcha',
      debugLastStep: 'captcha_ocr',
      steps: [
        { step: 'load_login_page', status: 'ok', message: 'loaded', at: Date.now() },
      ],
    })
    return { ok: true }
  })

  assert.deepEqual(result, { ok: true })
  const [entry] = getBankSyncDebugTraceSnapshot()
  assert.equal(entry.operation, 'connect_first_bank')
  assert.equal(entry.status, 'ok')
  assert.equal(entry.debugHint, 'check captcha')
  assert.equal(entry.debugLastStep, 'captcha_ocr')
  assert.equal(entry.steps[0].step, 'load_login_page')
})

test('traceBankSyncOperation records native debug trace on error', async () => {
  const error = new Error('captcha failed')
  error.code = 'FIRST_BANK_CAPTCHA_OCR_FAILED'
  error.debugTrace = {
    action: 'connect_first_bank',
    debugHint: 'check source.png',
    debugLastStep: 'captcha_ocr',
    steps: [
      { step: 'captcha_wait_ready', status: 'ok', message: 'ready', at: Date.now() },
      { step: 'captcha_ocr', status: 'error', message: 'no 4-char result', at: Date.now() },
    ],
  }

  await assert.rejects(() => traceBankSyncOperation('connect_first_bank', {
    ledgerId: 'ledger-1',
    provider: 'first_bank_tw',
    connectionId: 'conn-1',
  }, async () => {
    throw error
  }))

  const [entry] = getBankSyncDebugTraceSnapshot()
  assert.equal(entry.status, 'error')
  assert.equal(entry.errorCode, 'FIRST_BANK_CAPTCHA_OCR_FAILED')
  assert.equal(entry.debugHint, 'check source.png')
  assert.equal(entry.steps.length, 2)
})
