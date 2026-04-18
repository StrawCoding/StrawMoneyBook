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
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  findPendingInvitationForEmail,
  findUserByEmail,
  getMembershipGrantSummary,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  nowIso,
  readStore,
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
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  findPendingInvitationForEmail,
  findUserByEmail,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  methodGuard,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  requireAuthenticatedUser,
  sendJson,
  splitPathSegments,
  updateStore,
  validateEmail,
  validateSnapshot,
}
