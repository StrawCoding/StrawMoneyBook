import {
  convertBalanceToTargetCurrency,
  normalizeFxCurrencyCode,
} from './fx-convert.js'

function isIncludedInGroupStatistics(account) {
  return Number(account?.include_in_group_statistics ?? 1) === 1
}

function isCreditAccount(account) {
  return String(account?.account_kind ?? '').trim().toLowerCase() === 'credit'
}

export function buildGroupSummaries(groups = [], accounts = [], balances = [], options = {}) {
  const balanceMap = new Map((balances ?? []).map((item) => [item.id, Number(item.balance_minor)]))
  const accountsByGroup = new Map()
  const targetCurrencyCode = normalizeFxCurrencyCode(options.targetCurrencyCode, 'TWD')
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
