import { query, run, withTransaction } from '@/core/db/sqlite'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { nowIso } from '@/core/utils/id'
import { firstRow } from '@/core/repositories/base.repo'
import { findAccountById } from '@/core/repositories/account.repo'
import { isSavingsJarAccount } from '@/core/repositories/savings-jar.repo'
import { createExpense, createIncome } from '@/core/services/transaction.service'
import { findTransactionByIdempotencyKey } from '@/core/repositories/transaction.repo'
import {
  buildTxAck,
  validateTxCreatePayload,
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
      error: error.message,
    })
  }

  try {
    const schemaVersion = await readMaxSchemaVersion()
    if (schemaVersion < WEAR_SCHEMA_VERSION) {
      return buildTxAck({
        status: 'schema_upgrade_required',
        idempotencyKey: payload.idempotencyKey,
        error: 'open StrawMB on phone to finish update',
      })
    }

    if (!(await anyLedgerExists())) {
      return buildTxAck({
        status: 'engine_not_ready',
        idempotencyKey: payload.idempotencyKey,
        error: 'complete StrawMB setup on phone',
      })
    }

    const applied = await findWearApplied(payload.idempotencyKey)
    if (applied?.tx_id) {
      return buildTxAck({
        status: 'duplicate',
        idempotencyKey: payload.idempotencyKey,
        txId: applied.tx_id,
      })
    }

    const activeLedgerId = String(options.activeLedgerId ?? '').trim()
    if (activeLedgerId && activeLedgerId !== payload.ledgerId) {
      return buildTxAck({
        status: 'ledger_mismatch',
        idempotencyKey: payload.idempotencyKey,
        error: 'phone active ledger changed',
      })
    }

    if (!(await ledgerExists(payload.ledgerId))) {
      return buildTxAck({
        status: 'ledger_mismatch',
        idempotencyKey: payload.idempotencyKey,
        error: 'ledger not on phone',
      })
    }

    const account = await findAccountById(payload.ledgerId, payload.accountId)
    if (!account || account.deleted_at || Number(account.is_archived) === 1) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        error: 'account missing',
      })
    }
    if (await isSavingsJarAccount(payload.ledgerId, payload.accountId)) {
      return buildTxAck({
        status: 'rejected',
        idempotencyKey: payload.idempotencyKey,
        error: 'savings jar not allowed',
      })
    }
    if (!(await categoryUsable(payload.ledgerId, payload.categoryId, payload.type))) {
      return buildTxAck({
        status: 'catalog_stale',
        idempotencyKey: payload.idempotencyKey,
        error: 'category missing',
      })
    }

    await getWearSyncState()

    const createPayload = {
      accountId: payload.accountId,
      categoryId: payload.categoryId,
      amountMinor: payload.amountMinor,
      occurredAt: payload.occurredAt,
      postedAt: payload.occurredAt,
      note: payload.note,
      includeInBudget: payload.includeInBudget,
      includeInAnalysis: payload.includeInAnalysis,
      originType: 'wear',
      idempotencyKey: payload.idempotencyKey,
      externalRefId: wearExternalRefId(payload.idempotencyKey),
      createdByDisplayName: 'Wear OS',
    }

    const txId = await withTransaction(async () => {
      const createdId = payload.type === 'income'
        ? await createIncome(payload.ledgerId, createPayload)
        : await createExpense(payload.ledgerId, createPayload)
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
        txId: existing ?? null,
      })
    }
    return buildTxAck({
      status: 'rejected',
      idempotencyKey: payload.idempotencyKey,
      error: String(error?.message ?? error),
    })
  }
}
