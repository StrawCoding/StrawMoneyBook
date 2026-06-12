import { addonDeltaMajorFromNote, stripAddonSummaryFromNote } from '@/ui/utils/addon-note'

function absMinor(value) {
  return Math.abs(Math.round(Number(value ?? 0)))
}

function addonDeltaMinorFromNote(note) {
  return Math.round(Number(addonDeltaMajorFromNote(note) ?? 0) * 100)
}

export function reimbursementOriginalMinor(tx) {
  const settledMinor = absMinor(tx?.amount_minor)
  const addonDeltaMinor = addonDeltaMinorFromNote(tx?.note)
  return Math.max(0, settledMinor - addonDeltaMinor)
}

function normalizeReimburseTargetMinor(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return numeric
}

// SMB-237: a reimbursable expense can carry a custom "報銷金額" (claim target)
// stored in `reimburse_target_minor`. When set, claim sheet import and exports
// use this amount instead of the full original expense; when unset it falls back
// to the original expense amount (the previous behaviour).
export function reimbursementClaimableMinor(tx) {
  const originalMinor = reimbursementOriginalMinor(tx)
  if (!Number(tx?.is_reimbursable)) return originalMinor
  const target = normalizeReimburseTargetMinor(tx?.reimburse_target_minor)
  if (target === null) return originalMinor
  return target
}

export function reimbursementReimbursedMinor(tx) {
  const claimableMinor = reimbursementClaimableMinor(tx)
  const reimbursedMinor = absMinor(tx?.reimbursed_minor)
  if (reimbursedMinor <= 0) return 0
  return Math.min(reimbursedMinor, claimableMinor || reimbursedMinor)
}

export function reimbursementPendingMinor(tx) {
  const claimableMinor = reimbursementClaimableMinor(tx)
  const reimbursedMinor = reimbursementReimbursedMinor(tx)
  return Math.max(0, claimableMinor - reimbursedMinor)
}

export function reimbursementNoteText(tx) {
  return stripAddonSummaryFromNote(tx?.note)
}

function parseAdvanceIds(rawValue) {
  const text = String(rawValue ?? '').trim()
  if (!text) return []
  return Array.from(new Set(text.split(',').map((item) => item.trim()).filter(Boolean)))
}

function parseAdvanceUsageMap(rawValue) {
  const text = String(rawValue ?? '').trim()
  const map = {}
  if (!text) return map

  for (const pair of text.split(',')) {
    const [advanceId, amountText] = String(pair ?? '').split(':', 2)
    const normalizedId = String(advanceId ?? '').trim()
    if (!normalizedId) continue
    map[normalizedId] = absMinor(amountText)
  }

  return map
}

export function withReimbursementDerivedFields(tx) {
  if (!tx || typeof tx !== 'object') return tx
  const originalMinor = reimbursementOriginalMinor(tx)
  const claimableMinor = reimbursementClaimableMinor(tx)
  const reimbursedMinor = reimbursementReimbursedMinor(tx)
  return {
    ...tx,
    original_amount_minor: originalMinor,
    claimable_amount_minor: claimableMinor,
    reimbursed_display_minor: reimbursedMinor,
    pending_amount_minor: Math.max(0, claimableMinor - reimbursedMinor),
    note_plain: reimbursementNoteText(tx),
    advance_ids: parseAdvanceIds(tx?.advance_ids_csv),
    advance_usage_map: parseAdvanceUsageMap(tx?.advance_usage_pairs),
  }
}
