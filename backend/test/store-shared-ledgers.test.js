import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSharedLedgerSummary,
  findPendingInvitationForEmail,
  getMemberRole,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  validateSnapshot,
} from '../src/collab/store-shared-ledgers.js'

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function findUserById(data, userId) {
  return data.users.find((user) => String(user.id) === String(userId)) ?? null
}

test('shared ledger helpers resolve member roles and pending invitations', () => {
  const sharedLedger = {
    id: 'sl_1',
    ledger_id: 'ledger_1',
    name: 'Team Ledger',
    invite_code: 'ABCD1234',
    owner_user_id: 'user_owner',
    members: [{ user_id: 'user_owner', role: 'owner' }],
    invitations: [{
      id: 'inv_1',
      email: 'member@example.com',
      status: 'pending',
      invited_by_user_id: 'user_owner',
      created_at: '2026-03-20T00:00:00.000Z',
      accepted_at: '',
    }],
    version: 1,
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    updated_by_user_id: 'user_owner',
  }

  assert.equal(getMemberRole(sharedLedger, 'user_owner'), 'owner')
  assert.equal(isSharedLedgerMember(sharedLedger, 'user_owner'), true)
  assert.equal(findPendingInvitationForEmail(sharedLedger, 'MEMBER@example.com', { normalizeEmail })?.id, 'inv_1')
})

test('shared ledger helpers validate snapshots and build summaries', () => {
  const data = {
    users: [{
      id: 'user_owner',
      display_name: 'Owner',
      email: 'owner@example.com',
      account: 'owner@example.com',
    }],
    shared_ledgers: [],
  }
  const sharedLedger = {
    id: 'sl_1',
    ledger_id: 'ledger_1',
    name: 'Team Ledger',
    invite_code: 'ABCD1234',
    owner_user_id: 'user_owner',
    members: [{ user_id: 'user_owner', role: 'owner' }],
    invitations: [],
    version: 2,
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-21T00:00:00.000Z',
    updated_by_user_id: 'user_owner',
  }

  const snapshotInfo = validateSnapshot({
    ledger_id: 'ledger_1',
    tables: {
      ledgers: [{ id: 'ledger_1', name: 'Team Ledger' }],
    },
  })
  assert.equal(snapshotInfo.ledgerName, 'Team Ledger')

  const summary = buildSharedLedgerSummary(sharedLedger, 'user_owner', data, { findUserById })
  assert.equal(summary.owner_display_name, 'Owner')
  assert.equal(summary.role, 'owner')
})

test('pending invitation list is filtered by email and sorted descending by creation time', () => {
  const data = {
    users: [{
      id: 'user_owner',
      display_name: 'Owner',
      email: 'owner@example.com',
      account: 'owner@example.com',
    }],
    shared_ledgers: [{
      id: 'sl_1',
      ledger_id: 'ledger_1',
      name: 'Older',
      owner_user_id: 'user_owner',
      invite_code: 'OLD',
      members: [],
      invitations: [{
        id: 'inv_old',
        email: 'member@example.com',
        status: 'pending',
        invited_by_user_id: 'user_owner',
        created_at: '2026-03-19T00:00:00.000Z',
        accepted_at: '',
      }],
    }, {
      id: 'sl_2',
      ledger_id: 'ledger_2',
      name: 'Newer',
      owner_user_id: 'user_owner',
      invite_code: 'NEW',
      members: [],
      invitations: [{
        id: 'inv_new',
        email: 'member@example.com',
        status: 'pending',
        invited_by_user_id: 'user_owner',
        created_at: '2026-03-20T00:00:00.000Z',
        accepted_at: '',
      }],
    }],
  }

  const items = listPendingSharedLedgerInvitationsForUser(data, { email: 'member@example.com' }, {
    normalizeEmail,
    findUserById,
  })

  assert.equal(items.length, 2)
  assert.equal(items[0].id, 'inv_new')
  assert.equal(items[1].id, 'inv_old')
})
