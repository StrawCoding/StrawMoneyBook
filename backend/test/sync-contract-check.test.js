import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync as readSource } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyBankContractFailure,
  classifyEinvoiceContractFailure,
  FAILURE_CODES,
} from '../src/sync/contract-failure-classifier.js'
import {
  createEmptyStats,
  loadStats,
  recordContractCheckRun,
  saveStats,
} from '../src/sync/contract-check-stats.js'
import {
  buildAlertMessage,
  shouldSendPlaneAlert,
} from '../src/sync/contract-check-alert.js'

const repoRoot = resolve(import.meta.dirname, '..')
const runScriptSource = readSource(resolve(repoRoot, 'scripts/sync-contract-check-run.mjs'), 'utf8')
const bankCheckSource = readSource(resolve(repoRoot, 'scripts/first-bank-portal-contract-check.mjs'), 'utf8')
const bankConfigSource = readSource(resolve(repoRoot, 'src/bank/portal-config.js'), 'utf8')
const cronSource = readSource(resolve(repoRoot, 'scripts/sync-contract-check-cron.sh'), 'utf8')

test('SMB-253: failure classifier covers portal_changed / captcha / auth / timeout', () => {
  assert.deepEqual(FAILURE_CODES, ['portal_changed', 'captcha', 'auth', 'timeout', 'unknown'])

  assert.equal(classifyEinvoiceContractFailure({
    ok: false,
    captchaCheck: { ok: true },
    selectorCheck: { ok: false, found: { phone: false, password: true, captcha: true, submit: true } },
  }), 'portal_changed')

  assert.equal(classifyEinvoiceContractFailure({
    ok: false,
    captchaCheck: { ok: false, hasToken: false, hasImage: true, status: 200 },
    selectorCheck: { ok: true },
  }), 'captcha')

  assert.equal(classifyEinvoiceContractFailure({
    ok: false,
    captchaCheck: { ok: false, status: 401 },
    selectorCheck: { ok: true },
  }), 'auth')

  assert.equal(classifyEinvoiceContractFailure({
    ok: false,
    captchaCheck: { ok: true },
    selectorCheck: { ok: false, error: 'Timeout 180000ms exceeded' },
  }), 'timeout')

  assert.equal(classifyBankContractFailure({
    ok: false,
    anchors: { codeVerify: false, loginForm: true, captchaLoginArea: true, vrfyCode: true },
  }), 'portal_changed')

  assert.equal(classifyBankContractFailure({
    ok: false,
    error: 'fetch failed: 403 Forbidden',
  }), 'auth')

  assert.equal(classifyBankContractFailure({
    ok: false,
    error: 'AbortError: timed out',
  }), 'timeout')
})

test('SMB-253: contract check stats aggregate failure codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smb253-stats-'))
  const statsPath = join(dir, 'stats.json')

  try {
    let stats = createEmptyStats()
    stats = recordContractCheckRun(stats, {
      ok: false,
      checks: [{ target: 'einvoice', failureCode: 'portal_changed' }],
    })
    stats = recordContractCheckRun(stats, {
      ok: false,
      checks: [{ target: 'einvoice', failureCode: 'portal_changed' }, { target: 'first_bank', failureCode: 'captcha' }],
    })
    saveStats(statsPath, stats)

    const loaded = loadStats(statsPath)
    assert.equal(loaded.totals.runs, 2)
    assert.equal(loaded.totals.failures, 2)
    assert.equal(loaded.byCode.portal_changed, 2)
    assert.equal(loaded.byCode.captcha, 1)
    assert.equal(loaded.lastRun?.checks?.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('SMB-253: plane alert throttles repeated identical failures', () => {
  const now = Date.parse('2026-06-26T10:00:00.000Z')
  const stats = createEmptyStats()
  stats.lastAlert = {
    at: '2026-06-26T08:00:00.000Z',
    signature: 'einvoice:portal_changed|first_bank:portal_changed',
  }

  assert.equal(shouldSendPlaneAlert(stats, {
    checks: [
      { target: 'einvoice', failureCode: 'portal_changed' },
      { target: 'first_bank', failureCode: 'portal_changed' },
    ],
  }, { now, minIntervalMs: 6 * 60 * 60 * 1000 }), false)

  assert.equal(shouldSendPlaneAlert(stats, {
    checks: [{ target: 'einvoice', failureCode: 'captcha' }],
  }, { now, minIntervalMs: 6 * 60 * 60 * 1000 }), true)
})

test('SMB-253: alert message includes failure classification summary', () => {
  const message = buildAlertMessage({
    ok: false,
    checkedAt: '2026-06-26T02:00:00.000Z',
    checks: [
      { target: 'einvoice', ok: false, failureCode: 'portal_changed' },
      { target: 'first_bank', ok: true, failureCode: null },
    ],
    stats: {
      byCode: { portal_changed: 3, captcha: 1, auth: 0, timeout: 0, unknown: 0 },
      totals: { runs: 4, failures: 2 },
    },
  })

  assert.match(message, /portal_changed/)
  assert.match(message, /einvoice/)
  assert.match(message, /累計分類統計/)
})

test('SMB-253: run script wires checks, stats, and alerting', () => {
  assert.match(runScriptSource, /first-bank-portal-contract-check/)
  assert.match(runScriptSource, /einvoice-portal-contract-check/)
  assert.match(runScriptSource, /recordContractCheckRun/)
  assert.match(runScriptSource, /appendAlertLog/)
  assert.match(runScriptSource, /failureCode/)
})

test('SMB-253: bank contract check asserts login anchors', () => {
  assert.match(bankCheckSource, /code_verify/)
  assert.match(bankCheckSource, /captchaLoginArea/)
  assert.match(bankCheckSource, /vrfyCode/)
  assert.match(bankConfigSource, /ibank\.firstbank\.com\.tw/)
})

test('SMB-253: simulated selector drift classifies portal_changed and triggers alert decision', () => {
  const driftResult = {
    ok: false,
    captchaCheck: { ok: true, hasToken: true, hasImage: true, status: 200 },
    selectorCheck: {
      ok: false,
      found: { phone: false, password: true, captcha: true, submit: true },
    },
  }
  const failureCode = classifyEinvoiceContractFailure(driftResult)
  assert.equal(failureCode, 'portal_changed')

  const stats = createEmptyStats()
  assert.equal(shouldSendPlaneAlert(stats, {
    checks: [{ target: 'einvoice', ok: false, failureCode }],
  }), true)
  assert.match(buildAlertMessage({
    ok: false,
    checkedAt: '2026-06-26T02:00:00.000Z',
    checks: [{ target: 'einvoice', ok: false, failureCode }],
    stats: { byCode: { portal_changed: 1 }, totals: { runs: 1, failures: 1 } },
  }), /portal_changed/)
})

test('SMB-253: cron wrapper invokes run script', () => {
  assert.match(cronSource, /sync-contract-check-run\.mjs/)
})
