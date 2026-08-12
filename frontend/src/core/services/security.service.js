import { withTransaction } from '@/core/db/sqlite'
import {
  assertSellQuantityAllowed,
  buildSecurityPosition,
  estimateSellPrincipalMinor,
  sumIncludedSecuritiesMarketValue,
} from '@/core/utils/securities-position'
import {
  describeSettlementPosting,
  deriveSettlementCashLegs,
  isSettlementDue,
  normalizeRecordMode,
  normalizeSettlementStatus,
  normalizeUnrealizedMode,
  RECORD_MODE,
  SETTLEMENT_STATUS,
  toSettleAtIso,
  UNREALIZED_MODE,
} from '@/core/utils/securities-settlement'
import {
  createSecurity,
  createSecurityTransaction,
  findSecurityById,
  findSecurityTransactionById,
  listAllSecurityTransactions,
  listDueSecurityTransactions,
  listSecurities,
  listSecurityTransactions,
  softDeleteSecurity,
  softDeleteSecurityTransaction,
  updateSecurity,
  updateSecurityTransaction,
  updateSecurityTransactionSettlement,
} from '@/core/repositories/security.repo'
import { findAccountById } from '@/core/repositories/account.repo'
import { query, run } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { firstRow, rowsOf } from '@/core/repositories/base.repo'
import {
  createAdjustment,
  createExpense,
  createIncome,
} from '@/core/services/transaction.service'
import { softDeleteTransactionById } from '@/core/repositories/transaction.repo'
import {
  createCategory,
  createCategoryGroup,
  listCategories,
  listCategoryGroups,
} from '@/core/repositories/category.repo'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'

export const INVESTMENT_PNL_SYSTEM_KEY = 'investment_pnl'
export const UNREALIZED_MODE_SETTING_KEY = 'securities.unrealized_mode'

function groupTransactionsBySecurityId(transactions = []) {
  const map = new Map()
  const rows = Array.isArray(transactions) ? transactions : []
  for (const tx of rows) {
    const securityId = String(tx?.security_id ?? '').trim()
    if (!securityId) continue
    if (!map.has(securityId)) map.set(securityId, [])
    map.get(securityId).push(tx)
  }
  return map
}

export async function getSecuritiesUnrealizedMode(ledgerId) {
  const raw = await getSetting(ledgerId, UNREALIZED_MODE_SETTING_KEY)
  return normalizeUnrealizedMode(raw ?? UNREALIZED_MODE.market)
}

export async function setSecuritiesUnrealizedMode(ledgerId, mode) {
  const normalized = normalizeUnrealizedMode(mode)
  await setSetting(ledgerId, UNREALIZED_MODE_SETTING_KEY, normalized)
  return normalized
}

export async function ensureInvestmentPnlCategory(ledgerId) {
  const categories = await listCategories(ledgerId, { includeArchived: true })
  const byKey = categories.find((item) => String(item.system_key ?? '') === INVESTMENT_PNL_SYSTEM_KEY)
  if (byKey) return byKey.id

  // Locale-agnostic fallback names used before system_key existed
  const byName = categories.find((item) => {
    const name = String(item.name ?? '').trim()
    return name === '投資損益' || name === 'Investment P&L' || name === '投資損益（證券）'
  })
  if (byName) {
    await run(
      `UPDATE categories SET system_key = ?, updated_at = ? WHERE ledger_id = ? AND id = ?;`,
      [INVESTMENT_PNL_SYSTEM_KEY, nowIso(), ledgerId, byName.id],
    )
    return byName.id
  }

  const groups = await listCategoryGroups(ledgerId)
  let group = groups.find((item) => ['both', 'income'].includes(String(item.kind ?? '')) && !Number(item.is_archived))
  if (!group) {
    group = await createCategoryGroup(ledgerId, {
      name: '投資',
      kind: 'both',
      sortOrder: groups.length,
    })
  }

  const created = await createCategory(ledgerId, {
    groupId: group.id,
    name: '投資損益',
    kind: 'both',
    icon: 'fa-solid fa-chart-line',
    isBudgetable: 0,
    sortOrder: categories.filter((item) => item.group_id === group.id).length,
  })
  await run(
    `UPDATE categories SET system_key = ?, updated_at = ? WHERE ledger_id = ? AND id = ?;`,
    [INVESTMENT_PNL_SYSTEM_KEY, nowIso(), ledgerId, created.id],
  )
  return created.id
}

export async function isInvestmentPnlCategory(ledgerId, categoryId) {
  const id = String(categoryId ?? '').trim()
  if (!id) return false
  const row = firstRow(
    await query(
      `SELECT system_key FROM categories WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1;`,
      [ledgerId, id],
    ),
  )
  return String(row?.system_key ?? '') === INVESTMENT_PNL_SYSTEM_KEY
}

export async function loadSecuritiesDashboard(ledgerId, options = {}) {
  await ensureInvestmentPnlCategory(ledgerId)
  const unrealizedMode = options.unrealizedMode
    ? normalizeUnrealizedMode(options.unrealizedMode)
    : await getSecuritiesUnrealizedMode(ledgerId)
  const settlementAccountId = options.settlementAccountId ?? null
  const [securitiesResult, transactionsResult] = await Promise.all([
    listSecurities(ledgerId, { settlementAccountId }),
    listAllSecurityTransactions(ledgerId),
  ])
  const securities = Array.isArray(securitiesResult) ? securitiesResult : []
  const bySecurity = groupTransactionsBySecurityId(transactionsResult)
  const items = securities.map((security) => {
    const position = buildSecurityPosition(security, bySecurity.get(security.id) ?? [], { unrealizedMode })
    return {
      ...security,
      position,
    }
  })
  const includedMarketValueMinor = sumIncludedSecuritiesMarketValue(
    items.map((item) => item.position),
    { unrealizedMode },
  )
  const totalMarketValueMinor = items.reduce((sum, item) => sum + Number(item.position?.marketValueMinor ?? 0), 0)
  const totalInvestedMinor = items.reduce((sum, item) => sum + Number(item.position?.investedMinor ?? 0), 0)
  const totalDisplayValueMinor = items.reduce((sum, item) => sum + Number(item.position?.displayValueMinor ?? 0), 0)

  return {
    items,
    unrealizedMode,
    summary: {
      count: items.length,
      includedMarketValueMinor,
      totalMarketValueMinor,
      totalInvestedMinor,
      totalDisplayValueMinor,
      totalDeltaMinor: unrealizedMode === UNREALIZED_MODE.cost ? 0 : totalMarketValueMinor - totalInvestedMinor,
    },
  }
}

export async function loadSecurityDetail(ledgerId, securityId) {
  const unrealizedMode = await getSecuritiesUnrealizedMode(ledgerId)
  const security = await findSecurityById(ledgerId, securityId)
  if (!security) return null
  const transactions = await listSecurityTransactions(ledgerId, securityId)
  const position = buildSecurityPosition(security, transactions, { unrealizedMode })
  return { security, transactions, position, unrealizedMode }
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
  const recordMode = normalizeRecordMode(payload.recordMode ?? payload.record_mode)
  assertSellQuantityAllowed(detail.position.quantity, payload.quantity, { recordMode })
  if (recordMode === RECORD_MODE.position && (payload.principalMinor == null && payload.principal_minor == null)) {
    payload = {
      ...payload,
      principalMinor: estimateSellPrincipalMinor(detail.transactions, payload.quantity),
    }
  }
  return createSecurityTransaction(ledgerId, { ...payload, type: 'sell' })
}

export async function updateSecurityProfile(ledgerId, securityId, payload = {}) {
  return updateSecurity(ledgerId, securityId, payload)
}

export async function updateSecurityEvent(ledgerId, transactionId, payload = {}) {
  return updateSecurityTransaction(ledgerId, transactionId, payload)
}

async function resolveSettlementAccountId(ledgerId, security, tx) {
  const fromTx = String(tx?.cash_account_id ?? '').trim()
  if (fromTx) return fromTx
  const fromSecurity = String(security?.settlement_account_id ?? '').trim()
  if (fromSecurity) return fromSecurity
  throw new Error('缺少交割帳戶，無法入帳')
}

async function assertSettlementAccount(ledgerId, accountId) {
  const account = await findAccountById(ledgerId, accountId)
  if (!account) throw new Error('交割帳戶不存在')
  if (String(account.account_type ?? '') !== 'asset') {
    throw new Error('交割帳戶必須為資產帳戶')
  }
  return account
}

async function postCashLegsForConfirmedTx(ledgerId, security, tx) {
  const accountId = await resolveSettlementAccountId(ledgerId, security, tx)
  await assertSettlementAccount(ledgerId, accountId)
  const legs = deriveSettlementCashLegs({
    type: tx.type,
    recordMode: tx.record_mode,
    quantity: tx.quantity,
    priceMinor: tx.price_minor,
    feeMinor: tx.fee_minor,
    feeMode: tx.fee_mode,
    principalMinor: tx.principal_minor,
    proceedsMinor: tx.proceeds_minor,
  })
  const posting = describeSettlementPosting(legs)
  const occurredAt = String(tx.settle_at || tx.occurred_at || nowIso())
  const noteBase = `證券交割 ${security.symbol || ''} ${tx.type}`.trim()
  let cashPrincipalTxId = null
  let cashPnlTxId = null

  if (posting.principalAdjustmentMinor) {
    cashPrincipalTxId = await createAdjustment(ledgerId, {
      accountId,
      amountMinor: posting.principalAdjustmentMinor,
      categoryId: null,
      note: `${noteBase} 本金`,
      occurredAt,
      includeInBudget: false,
      includeInAnalysis: false,
      originType: 'manual',
      externalRefId: tx.id,
    })
  }

  if (posting.pnlType === 'income' && posting.pnlAmountMinor > 0) {
    const categoryId = await ensureInvestmentPnlCategory(ledgerId)
    cashPnlTxId = await createIncome(ledgerId, {
      accountId,
      categoryId,
      amountMinor: posting.pnlAmountMinor,
      note: `${noteBase} 損益`,
      occurredAt,
      includeInBudget: false,
      includeInAnalysis: true,
      originType: 'manual',
      externalRefId: tx.id,
    })
  } else if (posting.pnlType === 'expense' && posting.pnlAmountMinor > 0) {
    const categoryId = await ensureInvestmentPnlCategory(ledgerId)
    cashPnlTxId = await createExpense(ledgerId, {
      accountId,
      categoryId,
      amountMinor: posting.pnlAmountMinor,
      note: `${noteBase} 損益`,
      occurredAt,
      includeInBudget: false,
      includeInAnalysis: true,
      originType: 'manual',
      externalRefId: tx.id,
      isReimbursable: false,
    })
  }

  // Sell net cash must equal proceeds: principal adj + pnl = proceeds
  // Buy: only principal out.
  return { cashPrincipalTxId, cashPnlTxId, legs, posting }
}

async function rollbackCashLegs(ledgerId, tx) {
  const principalId = String(tx?.cash_principal_tx_id ?? '').trim()
  const pnlId = String(tx?.cash_pnl_tx_id ?? '').trim()
  if (principalId) await softDeleteTransactionById(ledgerId, principalId)
  if (pnlId) await softDeleteTransactionById(ledgerId, pnlId)
}

export async function confirmSecuritySettlement(ledgerId, transactionId, { force = false, now = new Date() } = {}) {
  return withTransaction(async () => {
    const tx = await findSecurityTransactionById(ledgerId, transactionId)
    if (!tx) throw new Error('找不到證券流水')
    const status = normalizeSettlementStatus(tx.settlement_status)
    if (status === SETTLEMENT_STATUS.cancelled) throw new Error('已取消的交割不可確認')
    if (status === SETTLEMENT_STATUS.confirmed && tx.cash_principal_tx_id) {
      return tx
    }
    if (status === SETTLEMENT_STATUS.scheduled && !force && !isSettlementDue(tx.settle_at, now)) {
      throw new Error('交割尚未到期；若要提前入帳請使用提前確認')
    }

    const security = await findSecurityById(ledgerId, tx.security_id)
    if (!security) throw new Error('找不到證券標的')
    if (!security.settlement_account_id && !tx.cash_account_id) {
      throw new Error('請先設定交割帳戶')
    }

    const { cashPrincipalTxId, cashPnlTxId } = await postCashLegsForConfirmedTx(ledgerId, security, tx)
    return updateSecurityTransactionSettlement(ledgerId, tx.id, {
      settlementStatus: SETTLEMENT_STATUS.confirmed,
      confirmedAt: nowIso(),
      cashPrincipalTxId,
      cashPnlTxId,
    })
  })
}

export async function rescheduleSecuritySettlement(ledgerId, transactionId, settleAt) {
  const tx = await findSecurityTransactionById(ledgerId, transactionId)
  if (!tx) throw new Error('找不到證券流水')
  if (normalizeSettlementStatus(tx.settlement_status) !== SETTLEMENT_STATUS.scheduled) {
    throw new Error('僅排程中的交割可改期')
  }
  return updateSecurityTransactionSettlement(ledgerId, transactionId, {
    settleAt: toSettleAtIso(settleAt),
  })
}

export async function cancelSecuritySettlement(ledgerId, transactionId) {
  return withTransaction(async () => {
    const tx = await findSecurityTransactionById(ledgerId, transactionId)
    if (!tx) throw new Error('找不到證券流水')
    const status = normalizeSettlementStatus(tx.settlement_status)
    if (status === SETTLEMENT_STATUS.cancelled) return tx
    if (status === SETTLEMENT_STATUS.confirmed) {
      await rollbackCashLegs(ledgerId, tx)
    }
    return updateSecurityTransactionSettlement(ledgerId, transactionId, {
      settlementStatus: SETTLEMENT_STATUS.cancelled,
      confirmedAt: null,
      cashPrincipalTxId: null,
      cashPnlTxId: null,
    })
  })
}

export async function removeSecurity(ledgerId, securityId) {
  await withTransaction(async () => {
    const txs = await listSecurityTransactions(ledgerId, securityId)
    for (const tx of txs) {
      if (normalizeSettlementStatus(tx.settlement_status) === SETTLEMENT_STATUS.confirmed) {
        await rollbackCashLegs(ledgerId, tx)
      }
    }
    await softDeleteSecurity(ledgerId, securityId)
  })
}

export async function removeSecurityTransaction(ledgerId, transactionId) {
  await withTransaction(async () => {
    const tx = await findSecurityTransactionById(ledgerId, transactionId)
    if (!tx) return
    if (normalizeSettlementStatus(tx.settlement_status) === SETTLEMENT_STATUS.confirmed) {
      await rollbackCashLegs(ledgerId, tx)
    }
    await softDeleteSecurityTransaction(ledgerId, transactionId)
  })
}

export async function runDueSecuritySettlements(ledgerId, now = new Date()) {
  await ensureInvestmentPnlCategory(ledgerId)
  const due = await listDueSecurityTransactions(ledgerId, now instanceof Date ? now.toISOString() : String(now))
  const results = []
  for (const tx of due) {
    try {
      const confirmed = await confirmSecuritySettlement(ledgerId, tx.id, { force: false, now })
      results.push({ id: tx.id, ok: true, tx: confirmed })
    } catch (error) {
      results.push({ id: tx.id, ok: false, error: error?.message || String(error) })
    }
  }
  return results
}

export async function getIncludedSecuritiesMarketValueMinor(ledgerId) {
  const dashboard = await loadSecuritiesDashboard(ledgerId)
  return dashboard.summary.includedMarketValueMinor
}

export async function markAccountAsSettlement(ledgerId, accountId, isSettlement = true) {
  const account = await findAccountById(ledgerId, accountId)
  if (!account) throw new Error('找不到帳戶')
  await run(
    `UPDATE accounts
        SET is_settlement = ?, updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [isSettlement ? 1 : 0, nowIso(), ledgerId, accountId],
  )
  return findAccountById(ledgerId, accountId)
}

export async function listSettlementAccounts(ledgerId) {
  return rowsOf(
    await query(
      `SELECT *
         FROM accounts
        WHERE ledger_id = ?
          AND deleted_at IS NULL
          AND is_archived = 0
          AND account_type = 'asset'
          AND is_settlement = 1
        ORDER BY sort_order ASC, name ASC;`,
      [ledgerId],
    ),
  )
}

export async function listCandidateSettlementAccounts(ledgerId) {
  return rowsOf(
    await query(
      `SELECT *
         FROM accounts
        WHERE ledger_id = ?
          AND deleted_at IS NULL
          AND is_archived = 0
          AND account_type = 'asset'
        ORDER BY is_settlement DESC, sort_order ASC, name ASC;`,
      [ledgerId],
    ),
  )
}
