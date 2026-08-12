function isIncludedInGroupStatistics(account) {
  return Number(account?.include_in_group_statistics ?? 1) === 1
}

function isCreditAccount(account) {
  return String(account?.account_kind ?? '').trim().toLowerCase() === 'credit'
}

function normalizeCurrencyCode(currencyCode, fallback = 'TWD') {
  const value = String(currencyCode ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(value)) return value
  return fallback
}

function convertBalanceToTargetCurrency(balanceMinor, account, targetCurrencyCode, rates) {
  const amountMinor = Math.round(Number(balanceMinor) || 0)
  const accountCurrencyCode = normalizeCurrencyCode(account?.currency_code, targetCurrencyCode)
  const normalizedTargetCurrencyCode = normalizeCurrencyCode(targetCurrencyCode, accountCurrencyCode)
  if (accountCurrencyCode === normalizedTargetCurrencyCode) return amountMinor

  const rate = resolveCrossExchangeRate(rates, accountCurrencyCode, normalizedTargetCurrencyCode)
  if (!rate) return amountMinor
  const convertedMagnitude = convertAmountMinorByRate(amountMinor, rate)
  return amountMinor < 0 ? convertedMagnitude * -1 : convertedMagnitude
}

function resolveCrossExchangeRate(rates, fromCurrency, toCurrency) {
  const from = normalizeCurrencyCode(fromCurrency, 'TWD')
  const to = normalizeCurrencyCode(toCurrency, 'TWD')
  if (from === to) return 1

  const fromPerUsd = Number(rates?.[from])
  const toPerUsd = Number(rates?.[to])
  if (!Number.isFinite(fromPerUsd) || fromPerUsd <= 0) return null
  if (!Number.isFinite(toPerUsd) || toPerUsd <= 0) return null
  return toPerUsd / fromPerUsd
}

function convertAmountMinorByRate(amountMinor, rate) {
  const amount = Math.abs(Math.round(Number(amountMinor) || 0))
  const numericRate = Number(rate)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(numericRate) || numericRate <= 0) return 0
  return Math.round(amount * numericRate)
}

export function buildGroupSummaries(groups = [], accounts = [], balances = [], options = {}) {
  const balanceMap = new Map((balances ?? []).map((item) => [item.id, Number(item.balance_minor)]))
  const accountsByGroup = new Map()
  const targetCurrencyCode = normalizeCurrencyCode(options.targetCurrencyCode, 'TWD')
  const rates = options.rates ?? {}

  for (const account of accounts ?? []) {
    // 信用卡不計入資產母分類統計（另有信用卡摘要）
    if (isCreditAccount(account)) continue
    const groupId = account.group_id
    if (!accountsByGroup.has(groupId)) {
      accountsByGroup.set(groupId, [])
    }
    accountsByGroup.get(groupId).push(account)
  }

  return (groups ?? []).map((group) => {
    const groupAccounts = accountsByGroup.get(group.id) ?? []
    const includedAccounts = groupAccounts.filter((account) => isIncludedInGroupStatistics(account))
    const totalMinor = includedAccounts.reduce((total, account) => {
      const balanceMinor = balanceMap.get(account.id) ?? Number(account.opening_balance_minor ?? 0)
      return total + convertBalanceToTargetCurrency(balanceMinor, account, targetCurrencyCode, rates)
    }, 0)

    return {
      ...group,
      accountCount: groupAccounts.length,
      includedAccountCount: includedAccounts.length,
      totalMinor,
      currencyCode: targetCurrencyCode,
    }
  })
}
