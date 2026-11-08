export function readReimbursableFlag(tx) {
  const raw = tx?.is_reimbursable ?? tx?.isReimbursable
  if (raw === true || raw === 1 || raw === '1') return true
  if (typeof raw === 'string' && raw.trim() !== '' && Number(raw) !== 0) return true
  return false
}

export function readReimbursementState(tx) {
  return String(tx?.reimbursement_state ?? tx?.reimbursementState ?? 'none').trim().toLowerCase()
}

/** 支出且已標為可報銷（含已完成報銷入帳） */
export function isReimbursableExpenseTransaction(tx) {
  if (String(tx?.type ?? '').trim().toLowerCase() !== 'expense') return false
  return readReimbursableFlag(tx)
}

/** @returns {'pending' | 'settled' | null} */
export function reimbursableTransactionBadgeVariant(tx) {
  if (!isReimbursableExpenseTransaction(tx)) return null
  return readReimbursementState(tx) === 'reimbursed' ? 'settled' : 'pending'
}

/** @deprecated use reimbursableTransactionBadgeVariant */
export function isPendingReimbursableTransaction(tx) {
  return reimbursableTransactionBadgeVariant(tx) === 'pending'
}
