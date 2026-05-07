import test from 'node:test'
import assert from 'node:assert/strict'

import {
  areSharedLedgerSnapshotsEquivalent,
  mergeSharedLedgerSnapshots,
  normalizeSharedLedgerSnapshot,
} from '../src/ui/services/shared-ledger/snapshot-merge.js'
import { isLocalOnlyAppSettingKey } from '../src/ui/services/local-only-app-settings.js'

function buildSnapshot(tables) {
  return {
    schema_version: 18,
    ledger_id: 'ledger_sync_test',
    exported_at: '2026-03-19T00:00:00.000Z',
    tables: {
      ledgers: [{
        id: 'ledger_sync_test',
        name: 'Shared Ledger',
        updated_at: '2026-03-19T00:00:00.000Z',
      }],
      deleted_log: [],
      ...tables,
    },
  }
}

test('mergeSharedLedgerSnapshots keeps the newest row update', () => {
  const local = buildSnapshot({
    categories: [{
      id: 'cat_food',
      name: '本地舊分類',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    categories: [{
      id: 'cat_food',
      name: '遠端新分類',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const merged = mergeSharedLedgerSnapshots(local, remote)
  assert.equal(merged.tables.categories[0]?.name, '遠端新分類')
})

test('mergeSharedLedgerSnapshots keeps tombstones so deleted rows do not come back', () => {
  const local = buildSnapshot({
    deleted_log: [{
      id: 1,
      ledger_id: 'ledger_sync_test',
      table_name: 'accounts',
      row_pk: 'acc_deleted',
      payload_json: '{"id":"acc_deleted"}',
      deleted_at: '2026-03-19T10:30:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    accounts: [{
      id: 'acc_deleted',
      name: '會被刪除的帳戶',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })

  const merged = mergeSharedLedgerSnapshots(local, remote)
  assert.equal(Array.isArray(merged.tables.accounts), true)
  assert.equal(merged.tables.accounts.length, 0)
  assert.equal(merged.tables.deleted_log[0]?.row_pk, 'acc_deleted')
})

test('normalizeSharedLedgerSnapshot removes stale tombstones after a row is recreated', () => {
  const snapshot = buildSnapshot({
    app_settings: [{
      key: 'setting.theme',
      value_json: '"sunrise"',
      updated_at: '2026-03-19T12:00:00.000Z',
    }],
    deleted_log: [{
      id: 2,
      ledger_id: 'ledger_sync_test',
      table_name: 'app_settings',
      row_pk: 'setting.theme',
      payload_json: '{"key":"setting.theme"}',
      deleted_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  assert.equal(normalized.tables.app_settings.length, 1)
  assert.equal(normalized.tables.deleted_log.length, 0)
})

test('areSharedLedgerSnapshotsEquivalent ignores exported_at differences', () => {
  const left = buildSnapshot({
    accounts: [{
      id: 'acc_1',
      name: 'Cash',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const right = {
    ...buildSnapshot({
      accounts: [{
        id: 'acc_1',
        name: 'Cash',
        updated_at: '2026-03-19T09:00:00.000Z',
      }],
    }),
    exported_at: '2026-03-19T23:59:59.999Z',
  }

  assert.equal(areSharedLedgerSnapshotsEquivalent(left, right), true)
})

test('mergeSharedLedgerSnapshots keeps deterministic rows when timestamps tie', () => {
  const local = buildSnapshot({
    categories: [{
      id: 'cat_food',
      name: '本地名稱',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    categories: [{
      id: 'cat_food',
      name: '遠端名稱',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })

  const merged = mergeSharedLedgerSnapshots(local, remote)
  assert.equal(merged.tables.categories[0]?.name, '遠端名稱')
})

test('normalizeSharedLedgerSnapshot keeps unknown tables sorted and intact', () => {
  const snapshot = buildSnapshot({
    custom_table: [{
      id: 'custom_2',
      updated_at: '2026-03-19T11:00:00.000Z',
    }, {
      id: 'custom_1',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  assert.deepEqual(
    normalized.tables.custom_table.map((row) => row.id),
    ['custom_1', 'custom_2'],
  )
})

test('mergeSharedLedgerSnapshots removes a stale tombstone when a newer row is recreated', () => {
  const local = buildSnapshot({
    deleted_log: [{
      id: 5,
      ledger_id: 'ledger_sync_test',
      table_name: 'categories',
      row_pk: 'cat_returned',
      payload_json: '{"id":"cat_returned"}',
      deleted_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    categories: [{
      id: 'cat_returned',
      name: '重新建立的分類',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const merged = mergeSharedLedgerSnapshots(local, remote)
  assert.equal(merged.tables.categories.length, 1)
  assert.equal(merged.tables.deleted_log.length, 0)
})

test('isLocalOnlyAppSettingKey excludes bookkeeping reminder settings from shared sync', () => {
  assert.equal(isLocalOnlyAppSettingKey('bookkeeping.reminder.settings.v1'), true, '記帳提醒設定應被排除在同步外')
  assert.equal(isLocalOnlyAppSettingKey('bookkeeping.streak.v1'), true, '所有 bookkeeping. 前綴設定都應被排除')
  assert.equal(isLocalOnlyAppSettingKey('backup.google_drive'), true, 'backup. 設定應被排除')
  assert.equal(isLocalOnlyAppSettingKey('sync.google_drive'), true, 'sync. 設定應被排除')
  assert.equal(isLocalOnlyAppSettingKey('shared_ledger_meta'), true, 'shared_ledger_meta 應被排除')
  assert.equal(isLocalOnlyAppSettingKey('transaction.addon_templates'), false, '一般交易設定不應被排除')
  assert.equal(isLocalOnlyAppSettingKey('ai_bookkeeping.auto_fill_rules'), false, 'AI 設定不應被排除')
  assert.equal(isLocalOnlyAppSettingKey('exchange_rate.settings'), false, '匯率設定不應被排除')
})
