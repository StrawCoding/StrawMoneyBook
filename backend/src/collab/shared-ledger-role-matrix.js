/**
 * ART-15 — Shared-ledger role permission matrix (single source for FE + BE).
 * Backend and frontend both import this module; do not fork permission rules.
 */

export const SHARED_LEDGER_ROLES = Object.freeze(['owner', 'admin', 'member', 'viewer'])

const DEFAULT_SHARED_LEDGER_ROLE = 'member'

export function normalizeSharedLedgerRole(role) {
  const normalized = String(role ?? '').trim().toLowerCase()
  return SHARED_LEDGER_ROLES.includes(normalized) ? normalized : DEFAULT_SHARED_LEDGER_ROLE
}

/**
 * @param {unknown} role
 * @returns {{
 *   can_pull: boolean,
 *   can_push: boolean,
 *   can_invite: boolean,
 *   can_manage_members: boolean,
 *   can_transfer_ownership: boolean,
 *   can_delete_ledger: boolean,
 * }}
 */
export function getSharedLedgerPermissions(role) {
  const normalized = String(role ?? '').trim().toLowerCase()
  const isOwner = normalized === 'owner'
  const isAdmin = normalized === 'admin'
  const isMember = normalized === 'member'
  const isViewer = normalized === 'viewer'
  const isKnownMember = isOwner || isAdmin || isMember || isViewer
  return {
    can_pull: isKnownMember,
    can_push: isOwner || isAdmin || isMember,
    can_invite: isOwner || isAdmin,
    can_manage_members: isOwner || isAdmin,
    can_transfer_ownership: isOwner,
    can_delete_ledger: isOwner,
  }
}

export function canPushSharedLedgerSnapshot(role) {
  return getSharedLedgerPermissions(role).can_push
}

export function canInviteSharedLedgerMembers(role) {
  return getSharedLedgerPermissions(role).can_invite
}

export function canManageSharedLedgerMembers(role) {
  return getSharedLedgerPermissions(role).can_manage_members
}

export function canTransferSharedLedgerOwnership(role) {
  return getSharedLedgerPermissions(role).can_transfer_ownership
}

/**
 * Owner may assign admin/member/viewer (not owner). Admin may only toggle member↔viewer.
 */
export function canAssignSharedLedgerMemberRole(actorRole, targetCurrentRole, nextRole) {
  const actor = String(actorRole ?? '').trim().toLowerCase()
  const current = normalizeSharedLedgerRole(targetCurrentRole)
  const next = normalizeSharedLedgerRole(nextRole)

  if (actor !== 'owner' && actor !== 'admin') return false
  if (next === 'owner') return false
  if (current === 'owner') return false

  if (actor === 'admin') {
    if (current === 'admin') return false
    if (next === 'admin') return false
  }

  return true
}
