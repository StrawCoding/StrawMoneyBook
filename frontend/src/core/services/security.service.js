import {
  assertSellQuantityAllowed,
  buildSecurityPosition,
  sumIncludedSecuritiesMarketValue,
} from '@/core/utils/securities-position'
import {
  createSecurity,
  createSecurityTransaction,
  findSecurityById,
  listAllSecurityTransactions,
  listSecurities,
  listSecurityTransactions,
  softDeleteSecurity,
  softDeleteSecurityTransaction,
  updateSecurity,
} from '@/core/repositories/security.repo'

function groupTransactionsBySecurityId(transactions = []) {
  const map = new Map()
  for (const tx of transactions ?? []) {
    const securityId = String(tx?.security_id ?? '').trim()
    if (!securityId) continue
    if (!map.has(securityId)) map.set(securityId, [])
    map.get(securityId).push(tx)
  }
  return map
}

export async function loadSecuritiesDashboard(ledgerId) {
  const [securities, transactions] = await Promise.all([
    listSecurities(ledgerId),
    listAllSecurityTransactions(ledgerId),
  ])
  const bySecurity = groupTransactionsBySecurityId(transactions)
  const items = securities.map((security) => {
    const position = buildSecurityPosition(security, bySecurity.get(security.id) ?? [])
    return {
      ...security,
      position,
    }
  })
  const includedMarketValueMinor = sumIncludedSecuritiesMarketValue(items.map((item) => item.position))
  const totalMarketValueMinor = items.reduce((sum, item) => sum + Number(item.position?.marketValueMinor ?? 0), 0)
  const totalInvestedMinor = items.reduce((sum, item) => sum + Number(item.position?.investedMinor ?? 0), 0)

  return {
    items,
    summary: {
      count: items.length,
      includedMarketValueMinor,
      totalMarketValueMinor,
      totalInvestedMinor,
      totalDeltaMinor: totalMarketValueMinor - totalInvestedMinor,
    },
  }
}

export async function loadSecurityDetail(ledgerId, securityId) {
  const security = await findSecurityById(ledgerId, securityId)
  if (!security) return null
  const transactions = await listSecurityTransactions(ledgerId, securityId)
  const position = buildSecurityPosition(security, transactions)
  return { security, transactions, position }
}

export async function createSecurityWithOptionalBuy(ledgerId, payload = {}) {
  const security = await createSecurity(ledgerId, payload)
  let buyTx = null
  if (payload.initialBuy) {
    buyTx = await addSecurityBuy(ledgerId, {
      securityId: security.id,
      ...payload.initialBuy,
    })
  }
  return { security, buyTx }
}

export async function addSecurityBuy(ledgerId, payload = {}) {
  return createSecurityTransaction(ledgerId, { ...payload, type: 'buy' })
}

export async function addSecuritySell(ledgerId, payload = {}) {
  const securityId = String(payload.securityId ?? payload.security_id ?? '').trim()
  const detail = await loadSecurityDetail(ledgerId, securityId)
  if (!detail) throw new Error('找不到證券標的')
  assertSellQuantityAllowed(detail.position.quantity, payload.quantity)
  return createSecurityTransaction(ledgerId, { ...payload, type: 'sell' })
}

export async function updateSecurityProfile(ledgerId, securityId, payload = {}) {
  return updateSecurity(ledgerId, securityId, payload)
}

export async function removeSecurity(ledgerId, securityId) {
  await softDeleteSecurity(ledgerId, securityId)
}

export async function removeSecurityTransaction(ledgerId, transactionId) {
  await softDeleteSecurityTransaction(ledgerId, transactionId)
}

export async function getIncludedSecuritiesMarketValueMinor(ledgerId) {
  const dashboard = await loadSecuritiesDashboard(ledgerId)
  return dashboard.summary.includedMarketValueMinor
}
