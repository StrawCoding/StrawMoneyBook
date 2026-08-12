/**
 * Settlement confirm / cancel / rollback plans shared by security.service and sql.js tests.
 * Cash legs + settlement status must be applied in one SQLite transaction.
 */

import { createId, nowIso } from './id.js'
import {
  deriveSettlementCashLegs,
  describeSettlementPosting,
  normalizeSettlementStatus,
  SETTLEMENT_STATUS,
} from './securities-settlement.js'

function noteBase(security, tx) {
  return `證券交割 ${security?.symbol || ''} ${tx?.type || ''}`.trim()
}

/**
 * Build the ledger rows + status patch for confirming a security settlement.
 * IDs are pre-allocated so confirm + rollback stay referentially consistent.
 */
export function buildConfirmSettlementPlan({
  ledgerId,
  security,
  securityTx,
  investmentPnlCategoryId,
  principalTxId = null,
  pnlTxId = null,
  confirmedAt = null,
} = {}) {
  const accountId = String(securityTx?.cash_account_id || security?.settlement_account_id || '').trim()
  if (!accountId) throw new Error('缺少交割帳戶，無法入帳')

  const legs = deriveSettlementCashLegs({
    type: securityTx.type,
    recordMode: securityTx.record_mode,
    quantity: securityTx.quantity,
    priceMinor: securityTx.price_minor,
    feeMinor: securityTx.fee_minor,
    feeMode: securityTx.fee_mode,
    principalMinor: securityTx.principal_minor,
    proceedsMinor: securityTx.proceeds_minor,
  })
  const posting = describeSettlementPosting(legs)
  const occurredAt = String(securityTx.settle_at || securityTx.occurred_at || nowIso())
  const confirmed = String(confirmedAt || nowIso())
  const base = noteBase(security, securityTx)
  const ledgerRows = []

  let cashPrincipalTxId = null
  let cashPnlTxId = null

  if (posting.principalAdjustmentMinor) {
    cashPrincipalTxId = String(principalTxId || createId('tx'))
    ledgerRows.push({
      kind: 'principal',
      id: cashPrincipalTxId,
      ledgerId,
      type: 'adjustment',
      accountId,
      categoryId: null,
      amountMinor: posting.principalAdjustmentMinor,
      occurredAt,
      note: `${base} 本金`,
      includeInBudget: 0,
      includeInAnalysis: 0,
      originType: 'manual',
      externalRefId: securityTx.id,
      isReimbursable: 0,
      reimbursementState: 'none',
    })
  }

  if (posting.pnlType === 'income' && posting.pnlAmountMinor > 0) {
    if (!investmentPnlCategoryId) throw new Error('缺少投資損益分類')
    cashPnlTxId = String(pnlTxId || createId('tx'))
    ledgerRows.push({
      kind: 'pnl',
      id: cashPnlTxId,
      ledgerId,
      type: 'income',
      accountId,
      categoryId: investmentPnlCategoryId,
      amountMinor: Math.abs(posting.pnlAmountMinor),
      occurredAt,
      note: `${base} 損益`,
      includeInBudget: 0,
      includeInAnalysis: 1,
      originType: 'manual',
      externalRefId: securityTx.id,
      isReimbursable: 0,
      reimbursementState: 'none',
    })
  } else if (posting.pnlType === 'expense' && posting.pnlAmountMinor > 0) {
    if (!investmentPnlCategoryId) throw new Error('缺少投資損益分類')
    cashPnlTxId = String(pnlTxId || createId('tx'))
    ledgerRows.push({
      kind: 'pnl',
      id: cashPnlTxId,
      ledgerId,
      type: 'expense',
      accountId,
      categoryId: investmentPnlCategoryId,
      amountMinor: -Math.abs(posting.pnlAmountMinor),
      occurredAt,
      note: `${base} 損益`,
      includeInBudget: 0,
      includeInAnalysis: 1,
      originType: 'manual',
      externalRefId: securityTx.id,
      isReimbursable: 0,
      reimbursementState: 'none',
    })
  }

  return {
    legs,
    posting,
    cashPrincipalTxId,
    cashPnlTxId,
    ledgerRows,
    statusPatch: {
      settlementStatus: SETTLEMENT_STATUS.confirmed,
      confirmedAt: confirmed,
      cashPrincipalTxId,
      cashPnlTxId,
    },
  }
}

export function buildCancelSettlementPlan(securityTx, { cancelledAt = null } = {}) {
  const status = normalizeSettlementStatus(securityTx?.settlement_status)
  const softDeleteIds = []
  if (status === SETTLEMENT_STATUS.confirmed) {
    const principalId = String(securityTx?.cash_principal_tx_id ?? '').trim()
    const pnlId = String(securityTx?.cash_pnl_tx_id ?? '').trim()
    if (principalId) softDeleteIds.push(principalId)
    if (pnlId) softDeleteIds.push(pnlId)
  }
  return {
    softDeleteIds,
    statusPatch: {
      settlementStatus: SETTLEMENT_STATUS.cancelled,
      confirmedAt: null,
      cashPrincipalTxId: null,
      cashPnlTxId: null,
      cancelledAt: cancelledAt || nowIso(),
    },
  }
}

/** Minimal INSERT for cash legs — mirrors transaction.repo addTransaction columns used by settlement. */
export function buildInsertLedgerRowSql(row, createdAt = nowIso()) {
  return {
    sql: `INSERT INTO transactions (
      ledger_id, id, type, transfer_group_id, account_id, peer_account_id,
      category_id, amount_minor, occurred_at, note, location, tags_json, origin_type,
      external_ref_id, idempotency_key, is_reimbursable, reimbursement_state,
      reimbursed_at, reimburse_target_minor, include_in_budget, include_in_analysis,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL);`,
    values: [
      row.ledgerId,
      row.id,
      row.type,
      row.accountId,
      row.categoryId,
      row.amountMinor,
      row.occurredAt,
      row.note,
      row.originType || 'manual',
      row.externalRefId,
      row.isReimbursable ? 1 : 0,
      row.reimbursementState || 'none',
      row.includeInBudget ? 1 : 0,
      row.includeInAnalysis ? 1 : 0,
      createdAt,
      createdAt,
    ],
  }
}

export function buildSoftDeleteLedgerSql(ledgerId, txId, deletedAt = nowIso()) {
  return {
    sql: `UPDATE transactions
       SET deleted_at = ?, idempotency_key = NULL, updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    values: [deletedAt, deletedAt, ledgerId, txId],
  }
}

export function buildUpdateSecuritySettlementSql(ledgerId, securityTxId, patch, updatedAt = nowIso()) {
  return {
    sql: `UPDATE security_transactions
       SET settlement_status = ?,
           settle_at = COALESCE(settle_at, settle_at),
           confirmed_at = ?,
           cash_principal_tx_id = ?,
           cash_pnl_tx_id = ?,
           updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    values: [
      patch.settlementStatus,
      patch.confirmedAt,
      patch.cashPrincipalTxId,
      patch.cashPnlTxId,
      updatedAt,
      ledgerId,
      securityTxId,
    ],
  }
}

/**
 * Apply confirm plan on a db that exposes run(sql, values) — e.g. sql.js wrapper.
 * Caller must wrap with BEGIN/COMMIT/ROLLBACK (or product withTransaction).
 * @param {object} options
 * @param {() => void} [options.afterPrincipal] — test hook: throw to prove mid-tx rollback
 */
export function applyConfirmSettlementPlan(db, {
  ledgerId,
  securityTxId,
  plan,
  afterPrincipal = null,
  now = null,
} = {}) {
  const stamp = now || nowIso()
  for (const row of plan.ledgerRows) {
    const stmt = buildInsertLedgerRowSql(row, stamp)
    db.run(stmt.sql, stmt.values)
    if (row.kind === 'principal' && typeof afterPrincipal === 'function') {
      afterPrincipal(row)
    }
  }
  const statusStmt = buildUpdateSecuritySettlementSql(ledgerId, securityTxId, plan.statusPatch, stamp)
  db.run(statusStmt.sql, statusStmt.values)
  return plan
}

export function applyCancelSettlementPlan(db, {
  ledgerId,
  securityTxId,
  plan,
  afterSoftDelete = null,
  now = null,
} = {}) {
  const stamp = now || nowIso()
  for (const txId of plan.softDeleteIds) {
    const stmt = buildSoftDeleteLedgerSql(ledgerId, txId, stamp)
    db.run(stmt.sql, stmt.values)
  }
  if (typeof afterSoftDelete === 'function') afterSoftDelete(plan)
  const statusStmt = buildUpdateSecuritySettlementSql(ledgerId, securityTxId, plan.statusPatch, stamp)
  db.run(statusStmt.sql, statusStmt.values)
  return plan
}

/** sql.js / better-sqlite style helper: BEGIN → fn → COMMIT, else ROLLBACK. */
export function runAtomicSql(db, fn) {
  db.run('BEGIN')
  try {
    const result = fn()
    db.run('COMMIT')
    return result
  } catch (error) {
    try {
      db.run('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  }
}
