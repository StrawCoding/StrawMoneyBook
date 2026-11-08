export function claimPaidMinorOf(claim) {
  return Math.max(0, Math.round(Number(claim?.paid_minor ?? 0)))
}

export function claimTotalMinorOf(claim) {
  return Math.max(0, Math.round(Number(claim?.total_minor ?? 0)))
}

export function claimRemainingMinor(claim) {
  return Math.max(0, claimTotalMinorOf(claim) - claimPaidMinorOf(claim))
}

export function itemSettledMinorOf(item) {
  return Math.max(0, Math.round(Number(item?.settled_minor ?? 0)))
}

export function itemAmountMinorOf(item) {
  return Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
}

export function itemRemainingMinor(item) {
  return Math.max(0, itemAmountMinorOf(item) - itemSettledMinorOf(item))
}

export function isBorrowLoanClaimItem(item) {
  if (!item) return false
  if (String(item.source_type ?? '').trim() !== 'transaction') return false
  return String(item.entry_type ?? '').trim() === 'income'
}

export function isAdvanceClaimItem(item) {
  return String(item?.source_type ?? '').trim() === 'advance'
}

export function allocateClaimPaymentFifo(items = [], paymentMinor = 0) {
  let remaining = Math.max(0, Math.round(Number(paymentMinor ?? 0)))
  const allocations = []
  const ordered = [...items].sort((left, right) => {
    const created = String(left?.created_at ?? '').localeCompare(String(right?.created_at ?? ''))
    if (created !== 0) return created
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
  })

  for (const item of ordered) {
    if (remaining <= 0) break
    const itemRemain = itemRemainingMinor(item)
    if (itemRemain <= 0) continue
    const amountMinor = Math.min(itemRemain, remaining)
    allocations.push({
      itemId: String(item.id ?? ''),
      amountMinor,
      item,
    })
    remaining -= amountMinor
  }

  return {
    allocations,
    allocatedMinor: Math.max(0, Math.round(Number(paymentMinor ?? 0)) - remaining),
    leftoverMinor: remaining,
  }
}

export function isClaimCollecting(claim) {
  return claimPaidMinorOf(claim) > 0 && claimRemainingMinor(claim) > 0
}

export function isClaimFullyPaid(claim) {
  return String(claim?.status ?? '') === 'paid' || (
    claimTotalMinorOf(claim) > 0 && claimRemainingMinor(claim) <= 0 && claimPaidMinorOf(claim) > 0
  )
}

const UNPAID_EDITABLE_STATUSES = new Set(['draft', 'submitted', 'in_review', 'approved'])

export function claimRecordedPaymentMinor(claim, payments = null) {
  const paidOnClaim = claimPaidMinorOf(claim)
  if (paidOnClaim > 0) return paidOnClaim
  if (!Array.isArray(payments) || !payments.length) return paidOnClaim
  return payments.reduce(
    (sum, payment) => sum + Math.max(0, Math.round(Number(payment?.amount_minor ?? 0))),
    0,
  )
}

/** Editable until fully paid or rejected; partial payments (collecting) may edit without undoing ledger entries. */
export function isClaimDraftEditable(claim, options = {}) {
  if (!claim) return false
  const payments = options.payments ?? null
  const recordedMinor = claimRecordedPaymentMinor(claim, payments)
  const status = String(claim?.status ?? 'draft').trim()
  if (status === 'rejected') return false
  if (status === 'paid') {
    return recordedMinor <= 0
  }
  if (isClaimFullyPaid(claim)) return false
  return UNPAID_EDITABLE_STATUSES.has(status)
}
