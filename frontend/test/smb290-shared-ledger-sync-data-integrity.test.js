import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  mergeSharedLedgerSnapshots,
  summarizeSharedLedgerSnapshotIntegrity,
  threeWayMergeSnapshots,
} from '../src/ui/services/shared-ledger/snapshot-merge.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readSource(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function buildSnapshot(tables) {
  return {
    schema_version: 18,
    ledger_id: 'ledger_smb290',
    exported_at: '2026-07-28T00:00:00.000Z',
    tables: {
      ledgers: [{
        id: 'ledger_smb290',
        name: 'Shared Integrity',
        updated_at: '2026-07-28T00:00:00.000Z',
      }],
      deleted_log: [],
      ...tables,
    },
  }
}

const accountGroups = [{
  id: 'group_cash',
  name: '現金',
  updated_at: '2026-07-28T01:00:00.000Z',
}]

const categoryGroups = [{
  id: 'group_expense',
  name: '支出',
  updated_at: '2026-07-28T01:00:00.000Z',
}]

const baseAccounts = [{
  id: 'acc_cash',
  group_id: 'group_cash',
  name: '現金',
  opening_balance_minor: 0,
  updated_at: '2026-07-28T01:00:00.000Z',
}]

const baseCategories = [{
  id: 'cat_food',
  group_id: 'group_expense',
  name: '餐飲',
  updated_at: '2026-07-28T01:00:00.000Z',
}]

test('smb290: multi-device concurrent adds keep both transactions without duplication', () => {
  const base = buildSnapshot({
    account_groups: accountGroups,
    accounts: baseAccounts,
    category_groups: categoryGroups,
    categories: baseCategories,
  })
  const local = buildSnapshot({
    account_groups: accountGroups,
    accounts: baseAccounts,
    category_groups: categoryGroups,
    categories: baseCategories,
    transactions: [{
      id: 'tx_device_a',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -12000,
      occurred_at: '2026-07-28T08:00:00.000Z',
      updated_at: '2026-07-28T08:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    account_groups: accountGroups,
    accounts: baseAccounts,
    category_groups: categoryGroups,
    categories: baseCategories,
    transactions: [{
      id: 'tx_device_b',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -34000,
      occurred_at: '2026-07-28T09:00:00.000Z',
      updated_at: '2026-07-28T09:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts } = threeWayMergeSnapshots(base, local, remote)
  const integrity = summarizeSharedLedgerSnapshotIntegrity(mergedSnapshot)

  assert.equal(hasConflicts, false)
  assert.deepEqual(integrity.transactionIds, ['tx_device_a', 'tx_device_b'])
  assert.equal(integrity.transactionCount, 2)
  assert.equal(integrity.amountMinorTotal, -46000)
})

test('smb290: remote account metadata edit must not wipe local unsynced transaction', () => {
  const base = buildSnapshot({
    account_groups: accountGroups,
    accounts: baseAccounts,
    category_groups: categoryGroups,
    categories: baseCategories,
  })
  const local = buildSnapshot({
    account_groups: accountGroups,
    accounts: baseAccounts,
    category_groups: categoryGroups,
    categories: baseCategories,
    transactions: [{
      id: 'tx_local_unsynced',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -8800,
      occurred_at: '2026-07-28T10:00:00.000Z',
      updated_at: '2026-07-28T10:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    account_groups: accountGroups,
    accounts: [{
      ...baseAccounts[0],
      opening_balance_minor: 250000,
      updated_at: '2026-07-28T11:00:00.000Z',
    }],
    category_groups: categoryGroups,
    categories: baseCategories,
  })

  const { mergedSnapshot } = threeWayMergeSnapshots(base, local, remote, { prefer: 'remote' })
  const integrity = summarizeSharedLedgerSnapshotIntegrity(mergedSnapshot)

  assert.equal(mergedSnapshot.tables.accounts[0]?.opening_balance_minor, 250000)
  assert.deepEqual(integrity.transactionIds, ['tx_local_unsynced'])
  assert.equal(integrity.amountMinorTotal, -8800)
})

test('smb290: newer child resurrects tombstoned parent instead of cascade-dropping transactions', () => {
  const snapshot = buildSnapshot({
    account_groups: [],
    accounts: [{
      id: 'acc_cash',
      group_id: 'group_cash',
      name: '現金',
      updated_at: '2026-07-28T12:00:00.000Z',
    }],
    category_groups: categoryGroups,
    categories: baseCategories,
    transactions: [{
      id: 'tx_after_delete',
      account_id: 'acc_cash',
      category_id: 'cat_food',
      amount_minor: -500,
      occurred_at: '2026-07-28T12:30:00.000Z',
      updated_at: '2026-07-28T12:30:00.000Z',
    }],
    deleted_log: [{
      id: 9,
      ledger_id: 'ledger_smb290',
      table_name: 'account_groups',
      row_pk: 'group_cash',
      payload_json: JSON.stringify({
        id: 'group_cash',
        name: '現金',
        updated_at: '2026-07-28T01:00:00.000Z',
      }),
      deleted_at: '2026-07-28T11:00:00.000Z',
    }],
  })

  const twoWay = mergeSharedLedgerSnapshots(snapshot, buildSnapshot({
    account_groups: [],
    accounts: [],
    category_groups: categoryGroups,
    categories: baseCategories,
  }), { detectConflicts: true })

  const integrity = summarizeSharedLedgerSnapshotIntegrity(twoWay.mergedSnapshot)
  assert.equal(integrity.transactionCount, 1)
  assert.deepEqual(integrity.transactionIds, ['tx_after_delete'])
  assert.ok(twoWay.mergedSnapshot.tables.account_groups.some((row) => row.id === 'group_cash'))
  assert.ok(twoWay.mergedSnapshot.tables.accounts.some((row) => row.id === 'acc_cash'))
})

test('smb290: same-row edit conflict is detectable and leaves diagnosable merge log fields', () => {
  const base = buildSnapshot({
    category_groups: categoryGroups,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '餐飲',
      updated_at: '2026-07-28T01:00:00.000Z',
    }],
  })
  const local = buildSnapshot({
    category_groups: categoryGroups,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '本地餐飲',
      updated_at: '2026-07-28T10:00:00.000Z',
    }],
  })
  const remote = buildSnapshot({
    category_groups: categoryGroups,
    categories: [{
      id: 'cat_food',
      group_id: 'group_expense',
      name: '遠端餐飲',
      updated_at: '2026-07-28T11:00:00.000Z',
    }],
  })

  const { mergedSnapshot, hasConflicts, conflicts } = threeWayMergeSnapshots(base, local, remote, {
    prefer: 'remote',
  })

  assert.equal(hasConflicts, true)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0]?.tableName, 'categories')
  assert.equal(conflicts[0]?.rowKey, 'cat_food')
  assert.equal(mergedSnapshot.tables.categories[0]?.name, '遠端餐飲')
})

test('smb290: shared-ledger service pull merges dirty/base instead of silent overwrite', () => {
  const service = readSource('src/ui/services/shared-ledger.service.js')
  assert.match(service, /function resolveSharedLedgerPullSnapshot/)
  assert.match(service, /function buildSyncStatusPatch/)
  assert.match(service, /conflict_resolved/)
  assert.match(service, /last_conflict_count/)
  assert.match(service, /last_merge_log/)
  assert.match(service, /Never hard-replace over local changes/)
  assert.match(service, /hasDirtyLedger\(activeLedgerId\)/)
  assert.match(service, /allowLocked:\s*true/)
  assert.match(service, /markLedgerDirty\(normalizedLedgerId\)/)
  assert.match(service, /failed to persist base snapshot map/)
})

test('smb290: settings page surfaces conflict_resolved status and toast', () => {
  const page = readSource('src/ui/views/settings/SettingsSharedLedgerPage.vue')
  const i18n = readSource('src/ui/services/i18n.service.js')
  assert.match(page, /sync_status_conflict_resolved/)
  assert.match(page, /toast\.sync_conflict_resolved/)
  assert.match(page, /result\?\.hasConflicts/)
  assert.match(i18n, /settings_shared_ledgers\.sync_status_conflict_resolved/)
  assert.match(i18n, /settings_shared_ledgers\.toast\.sync_conflict_resolved/)
})

test('smb290: account_coherence no longer bundles transactions for wipe', () => {
  const merge = readSource('src/ui/services/shared-ledger/snapshot-merge.js')
  assert.match(merge, /Do NOT bundle accounts with all referencing transactions/)
  assert.match(merge, /resurrectReferencedParentsFromTombstones/)
  assert.match(merge, /summarizeSharedLedgerSnapshotIntegrity/)
  assert.doesNotMatch(merge, /conflictType:\s*'account_coherence'/)
  assert.doesNotMatch(merge, /'account_coherence'/)
})
