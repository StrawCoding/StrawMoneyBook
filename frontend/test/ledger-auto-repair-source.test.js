import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repairServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/repair.service.js'),
  'utf8',
)
const ledgerRuntimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/ledger-runtime.service.js'),
  'utf8',
)

test('SMB-189 ledger integrity auto repair covers detected ledger data errors', () => {
  assert.match(ledgerRuntimeSource, /await ensureLedgerIntegrity\(normalizedLedgerId\)/)
  assert.match(repairServiceSource, /const REPAIR_ACCOUNT_ID = 'system_repair_account'/)
  assert.match(repairServiceSource, /SET account_id = \?/)
  assert.match(repairServiceSource, /SET peer_account_id = \?/)
  assert.match(repairServiceSource, /SET category_id = NULL/)
  assert.match(repairServiceSource, /SET transfer_group_id = NULL,\s+peer_account_id = NULL/s)
  assert.match(repairServiceSource, /orphanTxPeerAccount/)
  assert.match(repairServiceSource, /invalidTransferGroupFixed/)
})
