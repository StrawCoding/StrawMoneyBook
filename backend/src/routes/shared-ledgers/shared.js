import { requireAuthenticatedUser } from '../../collab/auth-session.js'
import {
  methodGuard,
  parseBody,
  sendJson,
  splitPathSegments,
} from '../../collab/http.js'
import {
  applyMembershipGrant,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerMemberList,
  buildSharedLedgerSummary,
  canAssignMemberRole,
  canInviteMembers,
  canManageMembers,
  canPushSnapshot,
  canTransferOwnership,
  createId,
  createInviteCode,
  findPendingInvitationForEmail,
  findUserByEmail,
  findUserById,
  getMemberRole,
  getMembershipGrantSummary,
  getSharedLedgerPermissions,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  normalizeRole,
  nowIso,
  readStore,
  SHARED_LEDGER_ROLES,
  updateStore,
  validateEmail,
  validateSnapshot,
} from '../../collab/store.js'
import { buildPublicUserProfile } from '../../collab/auth-store.js'
import { normalizeText } from '../../collab/http.js'

export const SHARED_LEDGER_FIRST_TRIAL_DAYS = 3
export const SHARED_LEDGER_FIRST_TRIAL_SOURCE = 'shared_ledger_first_trial'

export function findSharedLedger(data, sharedLedgerId) {
  return data.shared_ledgers.find((item) => String(item.id) === String(sharedLedgerId)) ?? null
}

export function createForbiddenError(message) {
  const error = new Error(message || '沒有權限執行此操作')
  error.code = 'shared_ledger_forbidden'
  error.status = 403
  return error
}

export function listSharedLedgersForUser(data, userId) {
  return data.shared_ledgers
    .filter((item) => isSharedLedgerMember(item, userId))
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .map((item) => buildSharedLedgerSummary(item, userId, data))
}

export function isSharedLedgerTrialEligible(user) {
  const grants = Array.isArray(user?.membership_grants) ? user.membership_grants : []
  return grants.length === 0
}

export async function ensureSharedLedgerMembership(res, user) {
  if (getMembershipGrantSummary(user).active) {
    return true
  }

  sendJson(res, 403, {
    error: 'membership_required',
    message: '共同帳本僅限會員使用',
    user: await buildPublicUserProfile(user),
    membership_trial_eligible: isSharedLedgerTrialEligible(user),
  })
  return false
}

export {
  applyMembershipGrant,
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerMemberList,
  buildSharedLedgerSummary,
  canAssignMemberRole,
  canInviteMembers,
  canManageMembers,
  canPushSnapshot,
  canTransferOwnership,
  createId,
  createInviteCode,
  findPendingInvitationForEmail,
  findUserByEmail,
  findUserById,
  getMemberRole,
  getSharedLedgerPermissions,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  methodGuard,
  normalizeRole,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  requireAuthenticatedUser,
  sendJson,
  SHARED_LEDGER_ROLES,
  splitPathSegments,
  updateStore,
  validateEmail,
  validateSnapshot,
}
