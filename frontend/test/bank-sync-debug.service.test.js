import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getBankSyncConsoleLogSnapshot,
  getBankSyncDebugTraceSnapshot,
  isBankSyncDebugEnabled,
  isBankSyncDebugEnabledFromEnv,
  logBankSyncAction,
  resetBankSyncDebugTraceForTest,
  sanitizeBankSyncLogDetails,
  setBankSyncDebugEnabled,
  setBankSyncDebugEnvForTest,
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

test('debug mode honors MODE=debug, DEV, and VITE_BANK_SYNC_DEBUG', () => {
  assert.equal(isBankSyncDebugEnabledFromEnv({ MODE: 'debug' }), true)
  assert.equal(isBankSyncDebugEnabledFromEnv({ MODE: 'development' }), true)
  assert.equal(isBankSyncDebugEnabledFromEnv({ DEV: true }), true)
  assert.equal(isBankSyncDebugEnabledFromEnv({ VITE_BANK_SYNC_DEBUG: 'true' }), true)
  assert.equal(isBankSyncDebugEnabledFromEnv({ MODE: 'production' }), false)
  assert.equal(isBankSyncDebugEnabledFromEnv({}), false)
})

test('logBankSyncAction is silent unless debug mode is on', () => {
  const lines = []
  const originalLog = console.log
  console.log = (...args) => {
    lines.push(args)
  }
  try {
    logBankSyncAction('service.connect', { provider: 'first_bank_tw' })
    assert.equal(lines.length, 0)
    assert.equal(getBankSyncConsoleLogSnapshot().length, 0)

    setBankSyncDebugEnvForTest({ MODE: 'debug' })
    logBankSyncAction('service.connect', { provider: 'first_bank_tw', password: 'secret-value' })
    assert.equal(isBankSyncDebugEnabled(), true)
    assert.equal(lines.length, 1)
    assert.equal(lines[0][0], '[SMB:bank-sync]')
    assert.equal(lines[0][1], 'service.connect')
    assert.equal(lines[0][2].password, '[redacted]')
    assert.equal(lines[0][2].provider, 'first_bank_tw')
    const [consoleEntry] = getBankSyncConsoleLogSnapshot()
    assert.equal(consoleEntry.action, 'service.connect')
    assert.equal(consoleEntry.details.password, '[redacted]')
  } finally {
    console.log = originalLog
  }
})

test('sanitizeBankSyncLogDetails redacts credential fields', () => {
  const sanitized = sanitizeBankSyncLogDetails({
    nationalId: 'A123456789',
    userCode: 'user01',
    captchaCode: 'AB12',
    provider: 'first_bank_tw',
  })
  assert.equal(sanitized.nationalId, '[redacted]')
  assert.equal(sanitized.userCode, '[redacted]')
  assert.equal(sanitized.captchaCode, '[redacted]')
  assert.equal(sanitized.provider, 'first_bank_tw')
})

test('runtime toggle enables debug console on production web', () => {
  assert.equal(isBankSyncDebugEnabledFromEnv({ MODE: 'production' }), false)
  setBankSyncDebugEnvForTest({ MODE: 'production' })
  assert.equal(isBankSyncDebugEnabled(), false)
  setBankSyncDebugEnabled(true)
  assert.equal(isBankSyncDebugEnabled(), true)
  setBankSyncDebugEnabled(false)
  assert.equal(isBankSyncDebugEnabled(), false)
})

test('traceBankSyncOperation prints begin/end to console in debug mode', async () => {
  setBankSyncDebugEnvForTest({ VITE_BANK_SYNC_DEBUG: '1' })
  const lines = []
  const originalLog = console.log
  console.log = (...args) => {
    lines.push(args)
  }
  try {
    await traceBankSyncOperation('sync_bank_connection', {
      ledgerId: 'ledger-1',
      provider: 'first_bank_tw',
      connectionId: 'conn-1',
    }, async () => ({ ok: true }))
    const actions = lines.map((item) => item[1])
    assert.ok(actions.includes('trace.begin'))
    assert.ok(actions.includes('trace.end'))
  } finally {
    console.log = originalLog
  }
})


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
