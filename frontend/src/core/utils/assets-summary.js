function isAccountIncludedInAssets(account) {
  return Number(account?.include_in_assets ?? 1) === 1
}

export function calculateAssetSummary({
  balances = [],
  receivableMinor = 0,
  payableMinor = 0,
  unreimbursedMinor = 0,
} = {}) {
  let disposableMinor = 0
  let liabilityMinor = 0
  let advanceDeductedMinor = 0
  const balanceMap = new Map()
  const advanceMap = new Map()

  for (const item of balances) {
    const balance = Number(item?.balance_minor ?? 0)
    const advanceMinor = Math.max(0, Number(item?.reimbursement_advance_minor ?? 0))

    balanceMap.set(item?.id, balance)
    advanceMap.set(item?.id, advanceMinor)

    if (!isAccountIncludedInAssets(item)) continue

    if (item?.account_type === 'asset') {
      if (balance > 0) {
        const deductedAdvanceMinor = Math.min(balance, advanceMinor)
        disposableMinor += Math.max(0, balance - advanceMinor)
        advanceDeductedMinor += deductedAdvanceMinor
      } else if (balance < 0) {
        liabilityMinor += Math.abs(balance)
      }
      continue
    }

    if (item?.account_type === 'liability' && balance !== 0) {
      liabilityMinor += Math.abs(balance)
    }
  }

  return {
    disposableMinor: Math.max(0, disposableMinor),
    liabilityMinor,
    advanceDeductedMinor,
    totalAssetMinor: Math.max(0, disposableMinor)
      + Number(receivableMinor ?? 0)
      - Number(payableMinor ?? 0)
      + Number(unreimbursedMinor ?? 0),
    balanceMap,
    advanceMap,
  }
}

export function isAssetAccountIncludedInTotals(account) {
  return isAccountIncludedInAssets(account)
}
