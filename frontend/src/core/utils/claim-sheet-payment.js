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
