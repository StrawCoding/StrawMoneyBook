import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sharedLedgerServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'),
  'utf8',
)
const destructiveOpsSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/application/destructive-data-ops.js'),
  'utf8',
)

test('shared ledger replace keeps durable recovery + rollback path before destructive import (SMB-187 / ART-09)', () => {
  assert.match(sharedLedgerServiceSource, /const existingSnapshot = existingLedger \? await exportLedgerJson\(ledgerId\) : null/)
  assert.match(sharedLedgerServiceSource, /replaceLedgerWithDurableRecovery/)
  assert.match(sharedLedgerServiceSource, /purpose: 'shared_ledger_replace'/)
  assert.match(destructiveOpsSource, /requireRecoveryBackupBeforeWipe/)
  assert.match(destructiveOpsSource, /purgedExistingLedger = true/)
  assert.match(destructiveOpsSource, /catch \(error\) \{\s*if \(purgedExistingLedger\) \{/s)
  assert.match(destructiveOpsSource, /shared_ledger_replace_restore_failed/)
  assert.match(destructiveOpsSource, /importLedgerJsonAsNewLedger\(restoredText/)
  // smb297: sync / rollback replace must never auto-confirm integrity repair
  assert.match(sharedLedgerServiceSource, /runIntegrityRepair:\s*false/)
  assert.doesNotMatch(
    sharedLedgerServiceSource,
    /runIntegrityRepair:\s*true/,
  )
})
