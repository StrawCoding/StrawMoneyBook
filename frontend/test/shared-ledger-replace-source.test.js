import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sharedLedgerServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'),
  'utf8',
)

test('shared ledger replace keeps a local snapshot rollback path before destructive import (SMB-187)', () => {
  assert.match(sharedLedgerServiceSource, /const existingSnapshot = existingLedger \? await exportLedgerJson\(ledgerId\) : null/)
  assert.match(sharedLedgerServiceSource, /let purgedExistingLedger = false/)
  assert.match(sharedLedgerServiceSource, /purgedExistingLedger = true/)
  assert.match(sharedLedgerServiceSource, /catch \(error\) \{\s*if \(purgedExistingLedger && existingSnapshot\) \{/s)
  assert.match(
    sharedLedgerServiceSource,
    /await importLedgerJsonAsNewLedger\(JSON\.stringify\(existingSnapshot\), \{\s*keepLedgerId: true,\s*ledgerName: existingLedger\.name,\s*runIntegrityRepair: false,\s*\}\)/s,
  )
  // smb297: sync / rollback replace must never auto-confirm integrity repair
  assert.match(sharedLedgerServiceSource, /runIntegrityRepair:\s*false/)
  assert.doesNotMatch(
    sharedLedgerServiceSource,
    /runIntegrityRepair:\s*true/,
  )
})
