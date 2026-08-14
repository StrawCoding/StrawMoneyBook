import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatSharedLedgerDateTime,
  getSharedLedgerAssignableRoles,
  getSharedLedgerRoleLabel,
} from '../src/ui/views/settings/shared-ledger/formatters.js'

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsSharedLedgerPage.vue'),
  'utf8',
)

test('ART-17 SettingsSharedLedgerPage composes members/invite/sync panels', () => {
  assert.match(pageSource, /SharedLedgerMembersPanel/)
  assert.match(pageSource, /SharedLedgerEmailInvitePanel/)
  assert.match(pageSource, /SharedLedgerSyncStatusPanel/)
  assert.match(pageSource, /shared-ledger\/formatters\.js/)
})

test('ART-17 shared-ledger formatters keep role/date helpers pure', () => {
  const t = (key, fallback) => fallback
  assert.equal(getSharedLedgerRoleLabel(t, 'owner'), '擁有者')
  assert.equal(getSharedLedgerRoleLabel(t, 'viewer'), '唯讀成員')
  assert.deepEqual(
    getSharedLedgerAssignableRoles({ role: 'member' }, { canTransferOwnership: false, assignableRoles: ['admin', 'member', 'viewer'] }),
    ['member', 'viewer'],
  )
  assert.deepEqual(
    getSharedLedgerAssignableRoles({ role: 'member' }, { canTransferOwnership: true, assignableRoles: ['admin', 'member', 'viewer'] }),
    ['admin', 'member', 'viewer'],
  )
  assert.equal(formatSharedLedgerDateTime(''), '-')
  assert.equal(formatSharedLedgerDateTime('not-a-date'), 'not-a-date')
})
