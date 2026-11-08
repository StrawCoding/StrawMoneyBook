/** 支出且標為可報銷、尚未完成報銷入帳（待報銷流程中） */
export function isPendingReimbursableTransaction(tx) {
  if (String(tx?.type ?? '').trim() !== 'expense') return false
  if (!Number(tx?.is_reimbursable)) return false
  const state = String(tx?.reimbursement_state ?? 'none').trim().toLowerCase()
  return state !== 'reimbursed'
}

export function reimbursableTransactionRowClass(tx) {
  return isPendingReimbursableTransaction(tx) ? 'tx-item--reimbursable' : ''
}
