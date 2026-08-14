/**
 * ART-09 — shared-ledger replaceLocalLedgerWithSnapshot failure hardening.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(root, '../src/ui/services/shared-ledger.service.js'), 'utf8')
const destructiveOps = readFileSync(
  resolve(root, '../src/core/application/destructive-data-ops.js'),
  'utf8',
)

test('ART-09: replaceLocalLedgerWithSnapshot requires durable recovery before purge', () => {
  assert.match(source, /replaceLedgerWithDurableRecovery/)
  assert.match(source, /purpose: 'shared_ledger_replace'/)
  assert.match(destructiveOps, /requireRecoveryBackupBeforeWipe/)
  assert.match(
    destructiveOps,
    /recoveryProof = await requireRecoveryBackupBeforeWipe\([\s\S]*await purgeLedger\(ledgerId\)/,
  )
})

test('ART-09: restore failure throws (not console-only) and never marks success', () => {
  assert.match(destructiveOps, /shared_ledger_replace_restore_failed/)
  assert.match(destructiveOps, /throw tagAppError\(wrapped/)
  assert.doesNotMatch(
    source,
    /console\.error\('\[shared-ledger\] failed to restore local ledger after snapshot import failure'/,
  )
})
