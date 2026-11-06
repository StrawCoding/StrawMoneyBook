import test from 'node:test'
import assert from 'node:assert/strict'
import {
  beginBankSyncProgressTracking,
  getBankSyncProgressSnapshot,
  resetBankSyncProgress,
  subscribeBankSyncProgress,
  updateBankSyncProgress,
} from '../src/services/bank-sync/progress.js'

test('bank sync progress clamps percent and notifies subscribers', () => {
  resetBankSyncProgress()
  const seen = []
  const unsubscribe = subscribeBankSyncProgress((snapshot) => {
    seen.push({ ...snapshot })
  })
  beginBankSyncProgressTracking('sync_bank')
  updateBankSyncProgress({ percent: 150, stage: 'sync_window' })
  updateBankSyncProgress({ percent: -5 })
  const latest = getBankSyncProgressSnapshot()
  assert.equal(latest.active, true)
  assert.equal(latest.percent, 0)
  assert.equal(latest.action, 'sync_bank')
  assert.ok(seen.length >= 2)
  unsubscribe()
  resetBankSyncProgress()
})
