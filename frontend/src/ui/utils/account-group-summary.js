export function buildGroupSummaries(groups = [], accounts = [], balances = []) {
  const balanceMap = new Map((balances ?? []).map((item) => [item.id, Number(item.balance_minor)]))
  const accountsByGroup = new Map()

  for (const account of accounts ?? []) {
    const groupId = account.group_id
    if (!accountsByGroup.has(groupId)) {
      accountsByGroup.set(groupId, [])
    }
    accountsByGroup.get(groupId).push(account)
  }

  return (groups ?? []).map((group) => {
    const groupAccounts = accountsByGroup.get(group.id) ?? []
    const totalMinor = groupAccounts.reduce((total, account) => (
      total + (balanceMap.get(account.id) ?? Number(account.opening_balance_minor ?? 0))
    ), 0)

    return {
      ...group,
      accountCount: groupAccounts.length,
      totalMinor,
    }
  })
}
