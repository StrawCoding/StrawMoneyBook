/**
 * ART-08 — Drive ledger replace must require durable recovery proof before purge.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(
  resolve(root, 'src/ui/services/google-drive-ledger-sync.service.js'),
  'utf8',
)

test('ART-08: google-drive ledger replace requires durable recovery before purge', () => {
  assert.match(source, /requireRecoveryBackupBeforeWipe/)
  assert.match(source, /persistVerifiedRecoveryBackup/)
  assert.match(source, /readVerifiedRecoveryBackup/)
  assert.match(source, /purpose: 'google_drive_ledger_replace'/)
  assert.match(
    source,
    /recoveryProof = await requireRecoveryBackupBeforeWipe\([\s\S]*await purgeLedger\(requestedLedgerId\)/,
  )
})

test('ART-08: import failure restores from durable proof before memory fallback', () => {
  assert.match(source, /readVerifiedRecoveryBackup\(recoveryProof\.backupId\)/)
  assert.match(source, /String\(durable\?\.jsonText/)
  assert.match(source, /Last-resort memory fallback/)
})
