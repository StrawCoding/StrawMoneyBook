function absMinor(value) {
  return Math.abs(Math.round(Number(value ?? 0)))
}

export function resolveReimbursementListState(tx) {
  if (!Number(tx?.is_reimbursable)) return 'none'
  return absMinor(tx?.reimbursed_minor) > 0 ? 'reimbursed' : 'pending'
}

export function partitionReimbursementTransactions(items = []) {
  const pending = []
  const reimbursed = []

  for (const item of items) {
    const state = resolveReimbursementListState(item)
    if (state === 'reimbursed') {
      reimbursed.push(item)
    } else if (state === 'pending') {
      pending.push(item)
    }
  }

  return {
    pending,
    reimbursed,
  }
}
