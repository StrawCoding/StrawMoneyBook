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

export function reimbursementReimbursedMinor(tx) {
  const originalMinor = reimbursementOriginalMinor(tx)
  const reimbursedMinor = absMinor(tx?.reimbursed_minor)
  if (reimbursedMinor <= 0) return 0
  return Math.min(reimbursedMinor, originalMinor || reimbursedMinor)
}

export function reimbursementPendingMinor(tx) {
  const originalMinor = reimbursementOriginalMinor(tx)
  const reimbursedMinor = reimbursementReimbursedMinor(tx)
  return Math.max(0, originalMinor - reimbursedMinor)
}

export function reimbursementNoteText(tx) {
  return stripAddonSummaryFromNote(tx?.note)
}

export function withReimbursementDerivedFields(tx) {
  if (!tx || typeof tx !== 'object') return tx
  const originalMinor = reimbursementOriginalMinor(tx)
  const reimbursedMinor = reimbursementReimbursedMinor(tx)
  return {
    ...tx,
    original_amount_minor: originalMinor,
    reimbursed_display_minor: reimbursedMinor,
    pending_amount_minor: Math.max(0, originalMinor - reimbursedMinor),
    note_plain: reimbursementNoteText(tx),
  }
}
