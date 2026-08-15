import { query, run, withTransaction } from '@/core/db/sqlite'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { nowIso } from '@/core/utils/id'
import { firstRow } from '@/core/repositories/base.repo'
import { findAccountById } from '@/core/repositories/account.repo'
import { isSavingsJarAccount } from '@/core/repositories/savings-jar.repo'
import {
  createAdjustment,
  createExpense,
  createIncome,
  createTransfer,
  deleteManualTransaction,
  updateManualTransaction,
} from '@/core/services/transaction.service'
import { findTransactionByIdempotencyKey } from '@/core/repositories/transaction.repo'
import {
  buildTxAck,
  validateTxCreatePayload,
  validateTxDeletePayload,
  validateTxUpdatePayload,
  wearExternalRefId,
} from '@/core/services/wear-protocol'
import { getWearSyncState } from '@/core/services/wear-sync-epoch.service'

const WearCompanion = registerPlugin('WearCompanion')
const WEAR_SCHEMA_VERSION = 45

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function isUniqueConstraintError(error) {
  const message = String(error?.message ?? error ?? '')
  return /unique\s*constraint/i.test(message) || /idx_tx_idempotency|wear_applied/i.test(message)
}

async function readMaxSchemaVersion() {
  try {
    const row = firstRow(await query('SELECT MAX(version) AS v FROM schema_migrations;'))
    return Number(row?.v) || 0
  } catch {
    return 0
  }
}

async function findWearApplied(idempotencyKey) {
  return firstRow(await query(
    `SELECT idempotency_key, ledger_id, tx_id, applied_at
     FROM wear_applied WHERE idempotency_key = ? LIMIT 1;`,
    [idempotencyKey],
  ))
}

async function insertWearApplied({ idempotencyKey, ledgerId, txId }) {
  await run(
    `INSERT INTO wear_applied (idempotency_key, ledger_id, tx_id, applied_at)
     VALUES (?, ?, ?, ?);`,
    [idempotencyKey, ledgerId, txId, nowIso()],
  )
}

async function ledgerExists(ledgerId) {
  const row = firstRow(await query(
    `SELECT id FROM ledgers WHERE id = ? AND deleted_at IS NULL LIMIT 1;`,
    [ledgerId],
  ))
  return Boolean(row?.id)
}

async function anyLedgerExists() {
  const row = firstRow(await query(
    `SELECT id FROM ledgers WHERE deleted_at IS NULL LIMIT 1;`,
  ))
  return Boolean(row?.id)
}

async function categoryUsable(ledgerId, categoryId, type) {
  const kind = type === 'income' ? 'income' : 'expense'
  const row = firstRow(await query(
    `SELECT id FROM categories
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL
       AND COALESCE(is_archived, 0) = 0
       AND kind = ?
     LIMIT 1;`,
    [ledgerId, categoryId, kind],
  ))
  return Boolean(row?.id)
}

async function findTransferOutLegId(ledgerId, transferGroupId) {
  if (!transferGroupId) return null
  const row = firstRow(await query(
    `SELECT id FROM transactions
     WHERE ledger_id = ? AND transfer_group_id = ? AND amount_minor < 0
     ORDER BY created_at ASC LIMIT 1;`,
    [ledgerId, transferGroupId],
  ))
  return row?.id ?? null
}

/**
 * Shared preflight for every watch op: schema floor, ledger presence and the
 * active-ledger match. Returns an ack to send back, or null to continue.
 */
async function preflight(payload, options, { requireLedgerMatch = true } = {}) {
  const schemaVersion = await readMaxSchemaVersion()
  if (schemaVersion < WEAR_SCHEMA_VERSION) {
    return buildTxAck({
      status: 'schema_upgrade_required',
      idempotencyKey: payload.idempotencyKey,
      op: payload.op,
      error: 'open StrawMB on phone to finish update',
    })
  }

  if (!(await anyLedgerExists())) {
    return buildTxAck({
      status: 'engine_not_ready',
      idempotencyKey: payload.idempotencyKey,
      op: payload.op,
      error: 'complete StrawMB setup on phone',
    })
  }

  const applied = await findWearApplied(payload.idempotencyKey)
  if (applied?.tx_id) {
    return buildTxAck({
      status: 'duplicate',
      idempotencyKey: payload.idempotencyKey,
      op: payload.op,
      txId: applied.tx_id,
    })
  }

  const activeLedgerId = String(options.activeLedgerId ?? '').trim()
  if (requireLedgerMatch && activeLedgerId && activeLedgerId !== payload.ledgerId) {
    return buildTxAck({
      status: 'ledger_mismatch',
      idempotencyKey: payload.idempotencyKey,
      op: payload.op,
      error: 'phone active ledger changed',
    })
  }

  if (!(await ledgerExists(payload.ledgerId))) {
    return buildTxAck({
      status: 'ledger_mismatch',
      idempotencyKey: payload.idempotencyKey,
      op: payload.op,
      error: 'ledger not on phone',
    })
  }

  return null
}

async function resolveUsableAccount(payload, accountId, { label = 'account' } = {}) {
  const account = await findAccountById(payload.ledgerId, accountId)
  if (!account || account.deleted_at || Number(account.is_archived) === 1) {
    return {
      ack: buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        op: payload.op,
        error: `${label} missing`,
      }),
    }
  }
  if (await isSavingsJarAccount(payload.ledgerId, accountId)) {
    return {
      ack: buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        op: payload.op,
        error: 'savings jar not allowed',
      }),
    }
  }
  return { account }
}

function tagsJsonOrNull(tags) {
  return Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null
}

/**
 * updateTransactionById never touches tags_json, so watch tag edits need this
 * targeted write. Rows whose tags_json holds a marker object (credit purchase,
 * credit refund) are skipped so their credit metadata survives the edit.
 */
async function writeTagsJson(ledgerId, txId, tagsJson) {
  await run(
    `UPDATE transactions
     SET tags_json = ?, updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
       AND transfer_group_id IS NULL
       AND (tags_json IS NULL OR TRIM(tags_json) = '' OR TRIM(tags_json) LIKE '[%');`,
    [tagsJson, nowIso(), ledgerId, txId],
  )
}

function baseCreateFields(payload) {
  return {
    amountMinor: payload.amountMinor,
    occurredAt: payload.occurredAt,
    postedAt: payload.occurredAt,
    note: payload.note,
    isReimbursable: Boolean(payload.isReimbursable),
    includeInBudget: payload.includeInBudget,
    includeInAnalysis: payload.includeInAnalysis,
    originType: 'wear',
    idempotencyKey: payload.idempotencyKey,
    externalRefId: wearExternalRefId(payload.idempotencyKey),
    createdByDisplayName: 'Wear OS',
    tagsJson: tagsJsonOrNull(payload.tags),
  }
}

async function dispatchCreate(payload) {
  const ledgerId = payload.ledgerId

  if (payload.type === 'expense' || payload.type === 'income') {
    const createPayload = {
      ...baseCreateFields(payload),
      accountId: payload.accountId,
      categoryId: payload.categoryId,
    }
    return payload.type === 'income'
      ? createIncome(ledgerId, createPayload)
      : createExpense(ledgerId, createPayload)
  }

  if (payload.type === 'credit_spend') {
    // Reuse the phone credit path: createExpense forwards a credit account to
    // createCreditPurchase (statement assignment + accrual/liability postings).
    // tags_json carries the credit_purchase marker there, so watch tags are dropped.
    const fields = baseCreateFields(payload)
    delete fields.tagsJson
    return createExpense(ledgerId, {
      ...fields,
      accountId: payload.accountId,
      categoryId: payload.categoryId,
    })
  }

  if (payload.type === 'adjustment') {
    return createAdjustment(ledgerId, {
      ...baseCreateFields(payload),
      accountId: payload.accountId,
      categoryId: payload.categoryId,
    })
  }

  if (payload.type === 'transfer') {
    const result = await createTransfer(ledgerId, {
      fromAccountId: payload.accountId,
      toAccountId: payload.peerAccountId,
      amountMinor: payload.amountMinor,
      occurredAt: payload.occurredAt,
      note: payload.note,
      includeInBudget: payload.includeInBudget,
      includeInAnalysis: payload.includeInAnalysis,
      originType: 'wear',
      idempotencyKey: payload.idempotencyKey,
      externalRefId: wearExternalRefId(payload.idempotencyKey),
      createdByDisplayName: 'Wear OS',
      tagsJson: tagsJsonOrNull(payload.tags),
    })
    return result?.outTxId ?? result?.transferGroupId ?? null
  }

  if (payload.type === 'credit_repay') {
    const { createCreditRepayment } = await import('@/core/services/credit.service')
    const result = await createCreditRepayment(ledgerId, {
      accountId: payload.accountId,
      sourceAccountId: payload.sourceAccountId ?? payload.peerAccountId,
      amountMinor: payload.amountMinor,
      paidAt: payload.occurredAt,
      note: payload.note,
      idempotencyKey: payload.idempotencyKey,
    })
    const outLeg = await findTransferOutLegId(ledgerId, result?.transferGroupId)
    return outLeg ?? result?.repaymentId ?? null
  }

  if (payload.type === 'credit_refund') {
    const { createCreditRefundAdjustment } = await import('@/core/services/credit.service')
    const result = await createCreditRefundAdjustment(ledgerId, {
      accountId: payload.accountId,
      amountMinor: payload.amountMinor,
      occurredAt: payload.occurredAt,
      postedAt: payload.occurredAt,
      note: payload.note,
      categoryId: payload.categoryId,
    })
    return result?.transactionId ?? null
  }

  if (payload.type === 'loan') {
    const { createLoanWithOptionalTransaction } = await import('@/core/services/loan.service')
    const loan = await createLoanWithOptionalTransaction(ledgerId, {
      direction: payload.loanDirection,
      principalMinor: payload.amountMinor,
      counterpartyName: payload.counterpartyName,
      startDate: String(payload.occurredAt).slice(0, 10),
      accountId: payload.accountId,
      categoryId: payload.categoryId,
      note: payload.note,
      occurredAt: payload.occurredAt,
    })
    return loan?.setup_tx_id ?? loan?.id ?? null
  }

  throw Object.assign(new Error(`unsupported wear type ${payload.type}`), { code: 'rejected' })
}

export async function applyWearTxCreate(rawPayload, options = {}) {
  if (isAndroidNativeRuntime()) {
    try {
      const ack = await WearCompanion.applyTxCreate({
        payload: rawPayload,
        activeLedgerId: String(options.activeLedgerId ?? '').trim(),
      })
      if (ack?.status) return ack
    } catch {
      // Fall through to JS engine when the native plugin is unavailable.
    }
  }

  let payload
  try {
    payload = validateTxCreatePayload(rawPayload)
  } catch (error) {
    return buildTxAck({
      status: error.code || 'rejected',
      idempotencyKey: String(rawPayload?.idempotencyKey ?? '').trim() || null,
      op: 'create',
      error: error.message,
    })
  }

  try {
    const gate = await preflight(payload, options)
    if (gate) return gate

    const primary = await resolveUsableAccount(payload, payload.accountId)
    if (primary.ack) return primary.ack

    if (payload.peerAccountId) {
      const peer = await resolveUsableAccount(payload, payload.peerAccountId, { label: 'peer account' })
      if (peer.ack) return peer.ack
    }

    const accountKind = String(primary.account.account_kind ?? 'cash')
    if (payload.type === 'credit_spend' && accountKind !== 'credit') {
      return buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        op: 'create',
        error: 'credit_spend requires a credit account',
      })
    }
    if (
      (payload.type === 'credit_repay' || payload.type === 'credit_refund')
      && accountKind !== 'credit'
    ) {
      return buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        op: 'create',
        error: `${payload.type} requires a credit account`,
      })
    }
    if (payload.type === 'income' && accountKind === 'credit') {
      return buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        op: 'create',
        error: 'credit income not supported on watch',
      })
    }

    // Loan opening books expense when lending out and income when borrowing in.
    const categoryType = payload.type === 'income'
      || (payload.type === 'loan' && payload.loanDirection === 'borrow')
      ? 'income'
      : 'expense'
    if (payload.categoryId && !(await categoryUsable(payload.ledgerId, payload.categoryId, categoryType))) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        op: 'create',
        error: 'category missing',
      })
    }

    await getWearSyncState()

    const txId = await withTransaction(async () => {
      const createdId = await dispatchCreate(payload)
      if (!createdId) {
        throw Object.assign(new Error('engine returned no transaction id'), { code: 'rejected' })
      }
      await insertWearApplied({
        idempotencyKey: payload.idempotencyKey,
        ledgerId: payload.ledgerId,
        txId: createdId,
      })
      return createdId
    })

    return buildTxAck({
      status: 'ok',
      idempotencyKey: payload.idempotencyKey,
      op: 'create',
      txId,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const applied = await findWearApplied(payload.idempotencyKey)
      const existing = applied?.tx_id
        || (await findTransactionByIdempotencyKey(payload.ledgerId, payload.idempotencyKey))?.id
      return buildTxAck({
        status: 'duplicate',
        idempotencyKey: payload.idempotencyKey,
        op: 'create',
        txId: existing ?? null,
      })
    }
    return buildTxAck({
      status: 'rejected',
      idempotencyKey: payload.idempotencyKey,
      op: 'create',
      error: String(error?.message ?? error),
    })
  }
}

async function findWearEditableTransaction(ledgerId, txId) {
  return firstRow(await query(
    `SELECT id, type, origin_type, transfer_group_id, amount_minor, deleted_at
     FROM transactions
     WHERE ledger_id = ? AND id = ? LIMIT 1;`,
    [ledgerId, txId],
  ))
}

export async function applyWearTxUpdate(rawPayload, options = {}) {
  if (isAndroidNativeRuntime()) {
    try {
      const ack = await WearCompanion.applyTxUpdate({
        payload: rawPayload,
        activeLedgerId: String(options.activeLedgerId ?? '').trim(),
      })
      if (ack?.status) return ack
    } catch {
      // Fall through to JS engine when the native plugin is unavailable.
    }
  }

  let payload
  try {
    payload = validateTxUpdatePayload(rawPayload)
  } catch (error) {
    return buildTxAck({
      status: error.code || 'rejected',
      idempotencyKey: String(rawPayload?.idempotencyKey ?? '').trim() || null,
      op: 'update',
      error: error.message,
    })
  }

  try {
    const gate = await preflight(payload, options)
    if (gate) return gate

    const target = await findWearEditableTransaction(payload.ledgerId, payload.targetTxId)
    if (!target || target.deleted_at) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        op: 'update',
        error: 'transaction missing',
      })
    }
    if (target.transfer_group_id) {
      return buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        op: 'update',
        error: 'edit transfers on phone',
      })
    }

    const primary = await resolveUsableAccount(payload, payload.accountId)
    if (primary.ack) return primary.ack
    if (payload.categoryId && !(await categoryUsable(payload.ledgerId, payload.categoryId, payload.type))) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        op: 'update',
        error: 'category missing',
      })
    }

    await withTransaction(async () => {
      await updateManualTransaction(payload.ledgerId, payload.targetTxId, {
        type: payload.type,
        accountId: payload.accountId,
        categoryId: payload.categoryId,
        amountMinor: payload.amountMinor,
        occurredAt: payload.occurredAt,
        note: payload.note,
        isReimbursable: payload.isReimbursable,
        includeInBudget: payload.includeInBudget,
        includeInAnalysis: payload.includeInAnalysis,
      })
      await writeTagsJson(payload.ledgerId, payload.targetTxId, tagsJsonOrNull(payload.tags))
      await insertWearApplied({
        idempotencyKey: payload.idempotencyKey,
        ledgerId: payload.ledgerId,
        txId: payload.targetTxId,
      })
    })

    return buildTxAck({
      status: 'ok',
      idempotencyKey: payload.idempotencyKey,
      op: 'update',
      txId: payload.targetTxId,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const applied = await findWearApplied(payload.idempotencyKey)
      return buildTxAck({
        status: 'duplicate',
        idempotencyKey: payload.idempotencyKey,
        op: 'update',
        txId: applied?.tx_id ?? payload.targetTxId,
      })
    }
    return buildTxAck({
      status: 'rejected',
      idempotencyKey: payload.idempotencyKey,
      op: 'update',
      error: String(error?.message ?? error),
    })
  }
}

export async function applyWearTxDelete(rawPayload, options = {}) {
  if (isAndroidNativeRuntime()) {
    try {
      const ack = await WearCompanion.applyTxDelete({
        payload: rawPayload,
        activeLedgerId: String(options.activeLedgerId ?? '').trim(),
      })
      if (ack?.status) return ack
    } catch {
      // Fall through to JS engine when the native plugin is unavailable.
    }
  }

  let payload
  try {
    payload = validateTxDeletePayload(rawPayload)
  } catch (error) {
    return buildTxAck({
      status: error.code || 'rejected',
      idempotencyKey: String(rawPayload?.idempotencyKey ?? '').trim() || null,
      op: 'delete',
      error: error.message,
    })
  }

  try {
    const gate = await preflight(payload, options)
    if (gate) return gate

    const target = await findWearEditableTransaction(payload.ledgerId, payload.targetTxId)
    if (!target) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        op: 'delete',
        error: 'transaction missing',
      })
    }
    if (target.deleted_at) {
      // Already gone on the phone: idempotent success so the watch stops retrying.
      await insertWearApplied({
        idempotencyKey: payload.idempotencyKey,
        ledgerId: payload.ledgerId,
        txId: payload.targetTxId,
      })
      return buildTxAck({
        status: 'duplicate',
        idempotencyKey: payload.idempotencyKey,
        op: 'delete',
        txId: payload.targetTxId,
      })
    }

    await withTransaction(async () => {
      await deleteManualTransaction(payload.ledgerId, payload.targetTxId)
      await insertWearApplied({
        idempotencyKey: payload.idempotencyKey,
        ledgerId: payload.ledgerId,
        txId: payload.targetTxId,
      })
    })

    return buildTxAck({
      status: 'ok',
      idempotencyKey: payload.idempotencyKey,
      op: 'delete',
      txId: payload.targetTxId,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const applied = await findWearApplied(payload.idempotencyKey)
      return buildTxAck({
        status: 'duplicate',
        idempotencyKey: payload.idempotencyKey,
        op: 'delete',
        txId: applied?.tx_id ?? payload.targetTxId,
      })
    }
    return buildTxAck({
      status: 'rejected',
      idempotencyKey: payload.idempotencyKey,
      op: 'delete',
      error: String(error?.message ?? error),
    })
  }
}

/** Single entry point used by the outbox: routes an op to the matching engine. */
export async function applyWearOutboxOp(op, rawPayload, options = {}) {
  if (op === 'update') return applyWearTxUpdate(rawPayload, options)
  if (op === 'delete') return applyWearTxDelete(rawPayload, options)
  return applyWearTxCreate(rawPayload, options)
}
