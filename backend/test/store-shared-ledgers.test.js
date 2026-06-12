import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSharedLedgerMemberList,
  buildSharedLedgerSummary,
  canAssignMemberRole,
  canInviteMembers,
  canManageMembers,
  canPushSnapshot,
  canTransferOwnership,
  findPendingInvitationForEmail,
  getMemberRole,
  getSharedLedgerPermissions,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  normalizeRole,
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
  assert.equal(summary.permissions.can_push, true)
  assert.equal(summary.permissions.can_invite, true)
  assert.equal(summary.permissions.can_transfer_ownership, true)
})

test('role permission matrix matches owner/admin/member/viewer rules', () => {
  assert.equal(normalizeRole('OWNER'), 'owner')
  assert.equal(normalizeRole('bogus'), 'member')

  const owner = getSharedLedgerPermissions('owner')
  assert.deepEqual(owner, {
    can_pull: true,
    can_push: true,
    can_invite: true,
    can_manage_members: true,
    can_transfer_ownership: true,
    can_delete_ledger: true,
  })

  const admin = getSharedLedgerPermissions('admin')
  assert.equal(admin.can_push, true)
  assert.equal(admin.can_invite, true)
  assert.equal(admin.can_manage_members, true)
  assert.equal(admin.can_transfer_ownership, false)
  assert.equal(admin.can_delete_ledger, false)

  const member = getSharedLedgerPermissions('member')
  assert.equal(member.can_push, true)
  assert.equal(member.can_invite, false)
  assert.equal(member.can_manage_members, false)

  const viewer = getSharedLedgerPermissions('viewer')
  assert.equal(viewer.can_pull, true)
  assert.equal(viewer.can_push, false)
  assert.equal(viewer.can_invite, false)

  // Non-member (empty role) gets no permissions at all.
  assert.equal(getSharedLedgerPermissions('').can_pull, false)
  assert.equal(getSharedLedgerPermissions('').can_push, false)

  assert.equal(canPushSnapshot('viewer'), false)
  assert.equal(canPushSnapshot('member'), true)
  assert.equal(canInviteMembers('member'), false)
  assert.equal(canInviteMembers('admin'), true)
  assert.equal(canManageMembers('admin'), true)
  assert.equal(canManageMembers('member'), false)
  assert.equal(canTransferOwnership('admin'), false)
  assert.equal(canTransferOwnership('owner'), true)
})

test('canAssignMemberRole enforces role-change governance', () => {
  // Owner can promote/demote anyone except setting owner via role change.
  assert.equal(canAssignMemberRole('owner', 'member', 'admin'), true)
  assert.equal(canAssignMemberRole('owner', 'admin', 'viewer'), true)
  assert.equal(canAssignMemberRole('owner', 'member', 'owner'), false)
  assert.equal(canAssignMemberRole('owner', 'owner', 'admin'), false)

  // Admin can only toggle member<->viewer, never touch admins or create admins.
  assert.equal(canAssignMemberRole('admin', 'member', 'viewer'), true)
  assert.equal(canAssignMemberRole('admin', 'viewer', 'member'), true)
  assert.equal(canAssignMemberRole('admin', 'member', 'admin'), false)
  assert.equal(canAssignMemberRole('admin', 'admin', 'viewer'), false)

  // Member/viewer can never manage roles.
  assert.equal(canAssignMemberRole('member', 'viewer', 'member'), false)
  assert.equal(canAssignMemberRole('viewer', 'member', 'viewer'), false)
})

test('buildSharedLedgerMemberList resolves display names and owner flag', () => {
  const data = {
    users: [
      { id: 'user_owner', display_name: 'Owner', email: 'owner@example.com' },
      { id: 'user_viewer', display_name: '', email: 'viewer@example.com' },
    ],
  }
  const sharedLedger = {
    id: 'sl_1',
    owner_user_id: 'user_owner',
    members: [
      { user_id: 'user_owner', role: 'owner', joined_at: '2026-03-20T00:00:00.000Z' },
      { user_id: 'user_viewer', role: 'viewer', joined_at: '2026-03-21T00:00:00.000Z' },
    ],
  }

  const members = buildSharedLedgerMemberList(sharedLedger, data, { findUserById })
  assert.equal(members.length, 2)
  assert.equal(members[0].is_owner, true)
  assert.equal(members[0].display_name, 'Owner')
  assert.equal(members[1].role, 'viewer')
  assert.equal(members[1].display_name, 'viewer@example.com')
  assert.equal(members[1].is_owner, false)
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
