import test from 'node:test'
import assert from 'node:assert/strict'
import { isAppShellBooting } from '../src/ui/composables/app-shell-runtime.helpers.js'

test('app boot waits for account store readiness when ledgers already exist', () => {
  assert.equal(isAppShellBooting({
    ledgerReady: false,
    hasLedgers: false,
    accountReady: false,
  }), true)
  assert.equal(isAppShellBooting({
    ledgerReady: true,
    hasLedgers: true,
    accountReady: false,
  }), true)
  assert.equal(isAppShellBooting({
    ledgerReady: true,
    hasLedgers: false,
    accountReady: false,
  }), false)
  assert.equal(isAppShellBooting({
    ledgerReady: true,
    hasLedgers: true,
    accountReady: true,
  }), false)
})
