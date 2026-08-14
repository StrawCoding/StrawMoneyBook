/**
 * ART-06 — SnapshotValidator unit + failure-injection tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SnapshotValidationError,
  validateSharedLedgerSnapshot,
} from '../src/collab/snapshot-validator.js'
import { validateSnapshot } from '../src/collab/store-shared-ledgers.js'

function goldenSnapshot(overrides = {}) {
  return {
    schema_version: 1,
    ledger_id: 'ledger_1',
    exported_at: '2026-08-14T00:00:00.000Z',
    tables: {
      ledgers: [{
        id: 'ledger_1',
        name: 'Team Ledger',
        currency_code: 'TWD',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      }],
      accounts: [{
        id: 'acc_1',
        ledger_id: 'ledger_1',
        name: 'Cash',
        opening_balance_minor: 0,
      }],
      categories: [{
        id: 'cat_1',
        ledger_id: 'ledger_1',
        name: 'Food',
      }],
      transactions: [{
        id: 'tx_1',
        ledger_id: 'ledger_1',
        account_id: 'acc_1',
        category_id: 'cat_1',
        amount_minor: -100,
        occurred_at: '2026-08-10T00:00:00.000Z',
      }],
    },
    ...overrides,
  }
}

test('ART-06: golden snapshot passes structural/semantic/integrity', () => {
  const info = validateSharedLedgerSnapshot(goldenSnapshot())
  assert.equal(info.ledgerId, 'ledger_1')
  assert.equal(info.ledgerName, 'Team Ledger')
  assert.equal(info.schemaVersion, 1)
})

test('ART-06: validateSnapshot re-export stays compatible', () => {
  const info = validateSnapshot({
    ledger_id: 'ledger_1',
    tables: { ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }] },
  })
  assert.equal(info.ledgerName, 'Team Ledger')
})

test('ART-06 structural: rejects non-object / missing ledger / unsupported table', () => {
  assert.throws(() => validateSharedLedgerSnapshot(null), SnapshotValidationError)
  assert.throws(() => validateSharedLedgerSnapshot({ tables: { ledgers: [] } }), /ledger_id/)
  assert.throws(
    () => validateSharedLedgerSnapshot({
      ledger_id: 'ledger_1',
      tables: {
        ledgers: [{ id: 'ledger_1', name: 'x' }],
        evil_table: [],
      },
    }),
    /不支援的資料表/,
  )
  assert.throws(
    () => validateSharedLedgerSnapshot({
      ledger_id: 'ledger_1',
      tables: { ledgers: 'nope' },
    }),
    /必須是陣列/,
  )
})

test('ART-06 semantic: rejects mixed ledger_id and bad amount_minor', () => {
  assert.throws(
    () => validateSharedLedgerSnapshot(goldenSnapshot({
      tables: {
        ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }],
        accounts: [{ id: 'acc_1', ledger_id: 'other', name: 'x' }],
      },
    })),
    /ledger_id 與快照不一致/,
  )
  assert.throws(
    () => validateSharedLedgerSnapshot(goldenSnapshot({
      tables: {
        ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }],
        transactions: [{ id: 'tx_1', amount_minor: 12.5 }],
      },
    })),
    /amount_minor/,
  )
  assert.throws(
    () => validateSharedLedgerSnapshot({
      ledger_id: 'ledger_1',
      tables: { ledgers: [{ id: 'ledger_other', name: 'x' }] },
    }),
    /必須包含 ledger_id 對應列/,
  )
})

test('ART-06 integrity: rejects duplicate ids and broken tx FK', () => {
  assert.throws(
    () => validateSharedLedgerSnapshot(goldenSnapshot({
      tables: {
        ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }],
        accounts: [
          { id: 'acc_1', ledger_id: 'ledger_1', name: 'a' },
          { id: 'acc_1', ledger_id: 'ledger_1', name: 'b' },
        ],
      },
    })),
    /重複 id/,
  )
  assert.throws(
    () => validateSharedLedgerSnapshot(goldenSnapshot({
      tables: {
        ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }],
        accounts: [{ id: 'acc_1', ledger_id: 'ledger_1', name: 'Cash' }],
        transactions: [{
          id: 'tx_1',
          ledger_id: 'ledger_1',
          account_id: 'acc_missing',
          amount_minor: 1,
        }],
      },
    })),
    /不存在的 account_id/,
  )
})
