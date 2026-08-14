import { validateSharedLedgerSnapshot, SnapshotValidationError } from './snapshot-validator.js'
import {
  SHARED_LEDGER_ROLES,
  normalizeSharedLedgerRole,
  getSharedLedgerPermissions,
  canPushSharedLedgerSnapshot,
  canInviteSharedLedgerMembers,
  canManageSharedLedgerMembers,
  canTransferSharedLedgerOwnership,
  canAssignSharedLedgerMemberRole,
} from './shared-ledger-role-matrix.js'

export { SHARED_LEDGER_ROLES }

export function normalizeRole(role) {
  return normalizeSharedLedgerRole(role)
}

export function getMemberRole(sharedLedger, userId) {
  return sharedLedger?.members?.find((member) => String(member.user_id) === String(userId))?.role ?? ''
}

export function isSharedLedgerMember(sharedLedger, userId) {
  return Boolean(getMemberRole(sharedLedger, userId))
}

// Centralised permission matrix — single source: shared-ledger-role-matrix.js
export function getSharedLedgerPermissionsForRole(role) {
  return getSharedLedgerPermissions(role)
}

export { getSharedLedgerPermissions }

export function canPushSnapshot(role) {
  return canPushSharedLedgerSnapshot(role)
}

export function canInviteMembers(role) {
  return canInviteSharedLedgerMembers(role)
}

export function canManageMembers(role) {
  return canManageSharedLedgerMembers(role)
}

export function canTransferOwnership(role) {
  return canTransferSharedLedgerOwnership(role)
}

export function canAssignMemberRole(actorRole, targetCurrentRole, nextRole) {
  return canAssignSharedLedgerMemberRole(actorRole, targetCurrentRole, nextRole)
}

export function buildSharedLedgerMemberList(sharedLedger, data, { findUserById }) {
  const members = Array.isArray(sharedLedger?.members) ? sharedLedger.members : []
  const ownerId = String(sharedLedger?.owner_user_id ?? '')
  return members.map((member) => {
    const user = findUserById(data, member?.user_id)
    return {
      user_id: String(member?.user_id ?? ''),
      role: normalizeRole(member?.role),
      display_name: user?.display_name || user?.email || user?.account || '',
      email: String(user?.email ?? user?.account ?? '').trim(),
      joined_at: String(member?.joined_at ?? ''),
      is_owner: ownerId === String(member?.user_id ?? ''),
    }
  })
}

export function findPendingInvitationForEmail(sharedLedger, email, { normalizeEmail }) {
  const normalized = normalizeEmail(email)
  return (Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : [])
    .find((invitation) => String(invitation?.status ?? 'pending') === 'pending' && normalizeEmail(invitation?.email) === normalized) ?? null
}

export { SnapshotValidationError, validateSharedLedgerSnapshot }

export function validateSnapshot(snapshot) {
  return validateSharedLedgerSnapshot(snapshot)
}

export function buildSharedLedgerSummary(sharedLedger, currentUserId, data, { findUserById }) {
  const updatedBy = findUserById(data, sharedLedger.updated_by_user_id)
  const owner = findUserById(data, sharedLedger.owner_user_id)
  const pendingInvitations = Array.isArray(sharedLedger?.invitations)
    ? sharedLedger.invitations.filter((item) => String(item?.status ?? 'pending') === 'pending').length
    : 0
  const role = getMemberRole(sharedLedger, currentUserId)

  return {
    id: sharedLedger.id,
    ledger_id: sharedLedger.ledger_id,
    name: sharedLedger.name,
    invite_code: sharedLedger.invite_code,
    version: Number(sharedLedger.version ?? 0),
    role,
    permissions: getSharedLedgerPermissions(role),
    owner_display_name: owner?.display_name || owner?.email || owner?.account || '',
    member_count: Array.isArray(sharedLedger.members) ? sharedLedger.members.length : 0,
    pending_invitation_count: pendingInvitations,
    created_at: sharedLedger.created_at,
    updated_at: sharedLedger.updated_at,
    updated_by_display_name: updatedBy?.display_name || updatedBy?.email || updatedBy?.account || '',
  }
}

export function buildSharedLedgerInvitationSummary(sharedLedger, invitation, data, { findUserById }) {
  const invitedByUser = findUserById(data, invitation?.invited_by_user_id)
  return {
    id: invitation.id,
    shared_ledger_id: sharedLedger.id,
    shared_ledger_name: sharedLedger.name,
    ledger_id: sharedLedger.ledger_id,
    email: String(invitation?.email ?? '').trim().toLowerCase(),
    status: String(invitation?.status ?? 'pending'),
    invited_by_user_id: String(invitation?.invited_by_user_id ?? ''),
    invited_by_display_name: invitedByUser?.display_name || invitedByUser?.email || invitedByUser?.account || '',
    created_at: String(invitation?.created_at ?? ''),
    accepted_at: String(invitation?.accepted_at ?? ''),
    email_delivery_status: String(invitation?.email_delivery_status ?? 'pending'),
    email_sent_at: String(invitation?.email_sent_at ?? ''),
    email_last_error: String(invitation?.email_last_error ?? ''),
    email_last_attempt_at: String(invitation?.email_last_attempt_at ?? ''),
  }
}

export function listPendingSharedLedgerInvitationsForUser(data, user, {
  normalizeEmail,
  findUserById,
} = {}) {
  const email = normalizeEmail(user?.email ?? user?.account)
  const items = []
  for (const sharedLedger of data.shared_ledgers) {
    const invitations = Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : []
    for (const invitation of invitations) {
      if (String(invitation?.status ?? 'pending') !== 'pending') continue
      if (normalizeEmail(invitation?.email) !== email) continue
      items.push(buildSharedLedgerInvitationSummary(sharedLedger, invitation, data, { findUserById }))
    }
  }
  return items.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}
