function normalizeCurrencyCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function buildAccountOptionGroups(groups = [], accounts = [], options = {}) {
  const currencyCode = normalizeCurrencyCode(options.currencyCode)
  const filteredAccounts = (accounts ?? []).filter((account) => {
    if (!currencyCode) return true
    return normalizeCurrencyCode(account?.currency_code) === currencyCode
  })

  const accountsByGroupId = new Map()
  for (const account of filteredAccounts) {
    const groupId = account?.group_id ?? '__ungrouped__'
    if (!accountsByGroupId.has(groupId)) {
      accountsByGroupId.set(groupId, [])
    }
    accountsByGroupId.get(groupId).push(account)
  }

  const groupedOptions = []
  const includedGroupIds = new Set()
  for (const group of groups ?? []) {
    const groupAccounts = accountsByGroupId.get(group.id) ?? []
    if (!groupAccounts.length) continue

    groupedOptions.push({
      id: group.id,
      name: group.name,
      options: groupAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: account.icon,
      })),
    })
    includedGroupIds.add(group.id)
  }

  const ungroupedAccounts = filteredAccounts.filter((account) => !includedGroupIds.has(account?.group_id))
  if (ungroupedAccounts.length) {
    groupedOptions.push({
      id: '__ungrouped__',
      name: '未分組',
      options: ungroupedAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: account.icon,
      })),
    })
  }

  return groupedOptions
}
