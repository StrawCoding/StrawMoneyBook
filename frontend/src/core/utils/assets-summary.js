import { convertBalanceToTargetCurrency } from './fx-convert.js'

function isAccountIncludedInAssets(account) {
  return Number(account?.include_in_assets ?? 1) === 1
}

function resolveBalanceAccount(item, accountById) {
  return accountById.get(item?.id) || item
}

export function calculateAssetSummary({
  balances = [],
  accounts = [],
  rates = {},
  targetCurrencyCode = 'TWD',
  receivableMinor = 0,
  payableMinor = 0,
  unreimbursedMinor = 0,
  securitiesMarketValueMinor = 0,
} = {}) {
  let disposableMinor = 0
  let liabilityMinor = 0
  let advanceDeductedMinor = 0
  const balanceMap = new Map()
  const advanceMap = new Map()
  const accountById = new Map((accounts ?? []).map((item) => [item.id, item]))

  for (const item of balances) {
    const account = resolveBalanceAccount(item, accountById)
    const rawBalance = Number(item?.balance_minor ?? 0)
    const balance = convertBalanceToTargetCurrency(
      rawBalance,
      account,
      targetCurrencyCode,
      rates,
    )
    const rawAdvanceMinor = Math.max(0, Number(item?.reimbursement_advance_minor ?? 0))
    const advanceMinor = convertBalanceToTargetCurrency(
      rawAdvanceMinor,
      account,
      targetCurrencyCode,
      rates,
    )

    balanceMap.set(item?.id, balance)
    advanceMap.set(item?.id, advanceMinor)

    if (!isAccountIncludedInAssets(account)) continue

    if (item?.account_type === 'asset' || account?.account_type === 'asset') {
      if (balance > 0) {
        const deductedAdvanceMinor = Math.min(balance, advanceMinor)
        disposableMinor += Math.max(0, balance - advanceMinor)
        advanceDeductedMinor += deductedAdvanceMinor
      } else if (balance < 0) {
        liabilityMinor += Math.abs(balance)
      }
      continue
    }

    if ((item?.account_type === 'liability' || account?.account_type === 'liability') && balance !== 0) {
      liabilityMinor += Math.abs(balance)
    }
  }

  const securitiesMinor = Math.max(0, Number(securitiesMarketValueMinor ?? 0))

  return {
    disposableMinor: Math.max(0, disposableMinor),
    liabilityMinor,
    advanceDeductedMinor,
    securitiesMarketValueMinor: securitiesMinor,
    totalAssetMinor: Math.max(0, disposableMinor)
      + Number(receivableMinor ?? 0)
      - Number(payableMinor ?? 0)
      + Number(unreimbursedMinor ?? 0)
      + securitiesMinor,
    balanceMap,
    advanceMap,
  }
}

export function isAssetAccountIncludedInTotals(account) {
  return isAccountIncludedInAssets(account)
}
