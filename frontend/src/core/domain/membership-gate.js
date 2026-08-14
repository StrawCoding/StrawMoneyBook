/**
 * ART-16 — Client MembershipGate (UX limits only; server remains authoritative).
 */
import {
  assertCanCreateAccount,
  assertCanCreateLedger,
  assertCanCreateLoan,
  assertCanCreateReimbursement,
  assertCanCreateSavingsJar,
  assertCanCreateSubscription,
  getMembershipLimits,
  getMembershipTierSnapshot,
  isFreeTier,
  isMembershipLimitError,
} from '../services/membership.service.js'

export const MembershipGate = Object.freeze({
  /** Client snapshot — never treat as server entitlement proof. */
  getSnapshot: getMembershipTierSnapshot,
  isFreeTier,
  getLimits: getMembershipLimits,
  isLimitError: isMembershipLimitError,
  assertCanCreateLedger,
  assertCanCreateAccount,
  assertCanCreateSavingsJar,
  assertCanCreateLoan,
  assertCanCreateReimbursement,
  assertCanCreateSubscription,
})

export default MembershipGate
