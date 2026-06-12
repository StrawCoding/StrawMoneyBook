import test from 'node:test'
import assert from 'node:assert/strict'

import {
  areSharedLedgerSnapshotsEquivalent,
  mergeSharedLedgerSnapshots,
  normalizeSharedLedgerSnapshot,
  threeWayMergeSnapshots,
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
    category_groups: [{
      id: 'group_expense',
      name: '支出',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地舊分類',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: [{
      id: 'group_expense',
      name: '支出',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
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
    category_groups: [{
      id: 'group_expense',
      name: '支出',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地名稱',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: [{
      id: 'group_expense',
      name: '支出',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
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
    category_groups: [{
      id: 'group_expense',
      name: '支出',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    categories: [{
      id: 'cat_returned',
      group_id: 'group_expense',
      name: '重新建立的分類',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const merged = mergeSharedLedgerSnapshots(local, remote)
  assert.equal(merged.tables.categories.length, 1)
  assert.equal(merged.tables.deleted_log.length, 0)
})

test('normalizeSharedLedgerSnapshot prunes rows that would violate shared-ledger import foreign keys (SMB-187)', () => {
  const snapshot = buildSnapshot({
    account_groups: [],
    accounts: [{
      id: 'acc_deleted',
      group_id: 'group_deleted',
      name: '已刪除帳戶',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    category_groups: [],
    categories: [{
      id: 'cat_deleted',
      group_id: 'cat_group_deleted',
      name: '已刪除分類',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    transactions: [{
      id: 'tx_orphan',
      account_id: 'acc_deleted',
      category_id: 'cat_deleted',
      amount_minor: 100,
      occurred_at: '2026-05-13T10:00:00.000Z',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    transaction_attachments: [{
      id: 'att_orphan',
      transaction_id: 'tx_orphan',
      file_uri: 'file://orphan.jpg',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
  })

  const normalized = normalizeSharedLedgerSnapshot(snapshot)

  assert.equal(normalized.tables.accounts.length, 0)
  assert.equal(normalized.tables.categories.length, 0)
  assert.equal(normalized.tables.transactions.length, 0)
  assert.equal(normalized.tables.transaction_attachments.length, 0)
})

test('normalizeSharedLedgerSnapshot nulls optional shared-ledger foreign keys when referenced rows are missing (SMB-187)', () => {
  const snapshot = buildSnapshot({
    account_groups: [{
      id: 'group_cash',
      name: '現金',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    category_groups: [],
    categories: [],
    transactions: [{
      id: 'tx_kept',
      account_id: 'acc_cash',
      peer_account_id: 'acc_missing',
      category_id: 'cat_missing',
      amount_minor: 100,
      occurred_at: '2026-05-13T10:00:00.000Z',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    reimbursements: [{
      id: 'rei_kept',
      title: '請款',
      status: 'paid',
      counterparty_id: 'cp_missing',
      paid_tx_id: 'tx_missing',
      total_minor: 100,
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
    reimbursement_items: [{
      id: 'rei_item',
      reimbursement_id: 'rei_kept',
      source_type: 'transaction',
      transaction_id: 'tx_missing',
      category_id: 'cat_missing',
      account_id: 'acc_missing',
      amount_minor: 100,
      occurred_at: '2026-05-13T10:00:00.000Z',
      updated_at: '2026-05-13T10:00:00.000Z',
    }],
  })

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  const tx = normalized.tables.transactions.find((row) => row.id === 'tx_kept')
  const reimbursement = normalized.tables.reimbursements.find((row) => row.id === 'rei_kept')
  const reimbursementItem = normalized.tables.reimbursement_items.find((row) => row.id === 'rei_item')

  assert.equal(tx.peer_account_id, null)
  assert.equal(tx.category_id, null)
  assert.equal(reimbursement.counterparty_id, null)
  assert.equal(reimbursement.paid_tx_id, null)
  assert.equal(reimbursementItem.transaction_id, null)
  assert.equal(reimbursementItem.category_id, null)
  assert.equal(reimbursementItem.account_id, null)
})

const categoryGroupFixture = [{
  id: 'group_expense',
  name: '支出',
  updated_at: '2026-03-19T08:00:00.000Z',
}]

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

test('threeWayMergeSnapshots: local unchanged, remote changed → take remote', () => {
  const base = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '餐飲',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote)
  assert.equal(hasConflicts, false)
  assert.equal(mergedSnapshot.tables.categories[0]?.name, '餐飲')
})

test('threeWayMergeSnapshots: remote unchanged, local changed → take local', () => {
  const base = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地新名稱',
      updated_at: '2026-03-19T12:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote)
  assert.equal(hasConflicts, false)
  assert.equal(mergedSnapshot.tables.categories[0]?.name, '本地新名稱')
})

test('threeWayMergeSnapshots: both changed same row → conflict, prefer remote', () => {
  const base = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地食物',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '遠端食物',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts, conflicts } = threeWayMergeSnapshots(base, local, remote, { prefer: 'remote' })
  assert.equal(hasConflicts, true)
  assert.equal(conflicts.length, 1)
  assert.equal(mergedSnapshot.tables.categories[0]?.name, '遠端食物')
})

test('threeWayMergeSnapshots: both changed same row → conflict, prefer local', () => {
  const base = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '食物',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地食物',
      updated_at: '2026-03-19T12:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '遠端食物',
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote, { prefer: 'local' })
  assert.equal(hasConflicts, true)
  assert.equal(mergedSnapshot.tables.categories[0]?.name, '本地食物')
})

test('threeWayMergeSnapshots: local deleted, remote unchanged → keep deleted (tombstone wins)', () => {
  const base = buildSnapshot({
    accounts: [{
      id: 'acc_1',
      name: 'Cash',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    accounts: [],
    deleted_log: [{
      id: 1,
      ledger_id: 'ledger_sync_test',
      table_name: 'accounts',
      row_pk: 'acc_1',
      payload_json: '{"id":"acc_1"}',
      deleted_at: '2026-03-19T12:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    accounts: [{
      id: 'acc_1',
      name: 'Cash',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote)
  assert.equal(hasConflicts, false)
  assert.equal(mergedSnapshot.tables.accounts.length, 0)
})

const accountGroupFixture = [{
  id: 'group_cash',
  name: '現金',
  updated_at: '2026-03-19T08:00:00.000Z',
}]

test('mergeSharedLedgerSnapshots with detectConflicts returns structured merge result (SMB-236)', () => {
  const local = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地名稱',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '遠端名稱',
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
  })

  const result = mergeSharedLedgerSnapshots(local, remote, { detectConflicts: true })
  assert.equal(typeof result.mergedSnapshot, 'object')
  assert.equal(Array.isArray(result.conflicts), true)
  assert.equal(typeof result.hasConflicts, 'boolean')
  assert.equal(result.mergedSnapshot.tables.categories[0]?.name, '遠端名稱')
})

test('mergeSharedLedgerSnapshots detects cross-table account coherence conflicts (SMB-236)', () => {
  const local = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      opening_balance_minor: 0,
      updated_at: '2026-03-19T09:00:00.000Z',
    }],
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '餐飲',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    transactions: [{
      id: 'tx_local',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -10000,
      occurred_at: '2026-03-19T10:00:00.000Z',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      opening_balance_minor: 500000,
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts, conflicts } = mergeSharedLedgerSnapshots(local, remote, {
    detectConflicts: true,
    prefer: 'remote',
  })

  assert.equal(hasConflicts, true)
  assert.ok(conflicts.some((conflict) => conflict.conflictType === 'account_coherence'))
  assert.equal(mergedSnapshot.tables.accounts[0]?.opening_balance_minor, 500000)
  assert.equal(mergedSnapshot.tables.transactions.length, 0)
})

test('mergeSharedLedgerSnapshots keeps transfer legs atomic when both sides changed (SMB-236)', () => {
  const local = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [
      {
        id: 'acc_a',
        group_id: 'group_cash',
        name: 'A',
        updated_at: '2026-03-19T08:00:00.000Z',
      },
      {
        id: 'acc_b',
        group_id: 'group_cash',
        name: 'B',
        updated_at: '2026-03-19T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx_out',
        type: 'transfer',
        transfer_group_id: 'xfer_1',
        account_id: 'acc_a',
        peer_account_id: 'acc_b',
        amount_minor: -5000,
        occurred_at: '2026-03-19T12:00:00.000Z',
        updated_at: '2026-03-19T12:00:00.000Z',
      },
      {
        id: 'tx_in',
        type: 'transfer',
        transfer_group_id: 'xfer_1',
        account_id: 'acc_b',
        peer_account_id: 'acc_a',
        amount_minor: 5000,
        occurred_at: '2026-03-19T09:00:00.000Z',
        updated_at: '2026-03-19T09:00:00.000Z',
      },
    ],
  })
  const remote = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [
      {
        id: 'acc_a',
        group_id: 'group_cash',
        name: 'A',
        updated_at: '2026-03-19T08:00:00.000Z',
      },
      {
        id: 'acc_b',
        group_id: 'group_cash',
        name: 'B',
        updated_at: '2026-03-19T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx_out',
        type: 'transfer',
        transfer_group_id: 'xfer_1',
        account_id: 'acc_a',
        peer_account_id: 'acc_b',
        amount_minor: -7000,
        occurred_at: '2026-03-19T11:00:00.000Z',
        updated_at: '2026-03-19T11:00:00.000Z',
      },
      {
        id: 'tx_in',
        type: 'transfer',
        transfer_group_id: 'xfer_1',
        account_id: 'acc_b',
        peer_account_id: 'acc_a',
        amount_minor: 7000,
        occurred_at: '2026-03-19T11:30:00.000Z',
        updated_at: '2026-03-19T11:30:00.000Z',
      },
    ],
  })

  const { mergedSnapshot, hasConflicts, conflicts } = mergeSharedLedgerSnapshots(local, remote, {
    detectConflicts: true,
    prefer: 'remote',
  })

  assert.equal(hasConflicts, true)
  assert.ok(conflicts.some((conflict) => conflict.conflictType === 'transfer_group'))
  const amounts = mergedSnapshot.tables.transactions.map((row) => row.amount_minor).sort((a, b) => a - b)
  assert.deepEqual(amounts, [-5000, 5000])
})

test('threeWayMergeSnapshots detects cross-table account coherence conflicts (SMB-236)', () => {
  const base = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      opening_balance_minor: 0,
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      opening_balance_minor: 0,
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    category_groups: categoryGroupFixture,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '餐飲',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    transactions: [{
      id: 'tx_local',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -10000,
      occurred_at: '2026-03-19T10:00:00.000Z',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    account_groups: accountGroupFixture,
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      opening_balance_minor: 500000,
      updated_at: '2026-03-19T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts, conflicts } = threeWayMergeSnapshots(base, local, remote, {
    prefer: 'remote',
  })

  assert.equal(hasConflicts, true)
  assert.ok(conflicts.some((conflict) => conflict.conflictType === 'account_coherence'))
  assert.equal(mergedSnapshot.tables.accounts[0]?.opening_balance_minor, 500000)
  assert.equal(mergedSnapshot.tables.transactions.length, 0)
})

test('threeWayMergeSnapshots: remote added row, base empty → include new row', () => {
  const base = buildSnapshot({})
  const local = buildSnapshot({})
  const remote = buildSnapshot({
    account_groups: [{
      id: 'group_assets',
      name: '資產',
      updated_at: '2026-03-19T08:00:00.000Z',
    }],
    accounts: [{
      id: 'acc_new',
      group_id: 'group_assets',
      name: 'New Account',
      updated_at: '2026-03-19T10:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote)
  assert.equal(hasConflicts, false)
  assert.equal(mergedSnapshot.tables.accounts.length, 1)
  assert.equal(mergedSnapshot.tables.accounts[0]?.name, 'New Account')
})
