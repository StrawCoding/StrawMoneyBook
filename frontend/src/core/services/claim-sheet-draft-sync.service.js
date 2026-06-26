import {
  findReimbursementTransactionById,
  findTransactionRecordById,
} from '@/core/repositories/transaction.repo'
import {
  deleteReimbursementItemById,
  listDraftTransactionImportItemsByTransactionIds,
  recomputeReimbursementTotal,
  updateReimbursementItemById,
} from '@/core/repositories/reimbursement.repo'
import {
  isReimbursementImportClaimItem,
  reconcileDraftClaimItemRows,
} from '@/core/utils/claim-sheet-draft-sync'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'

async function loadReimbursementTransactionForDraftSync(ledgerId, txId) {
  const normalizedTxId = String(txId ?? '').trim()
  if (!normalizedTxId) return null

  const reimbursableTx = await findReimbursementTransactionById(ledgerId, normalizedTxId)
  if (reimbursableTx) {
    return {
      ...reimbursableTx,
      note_plain: stripAddonSummaryFromNote(reimbursableTx?.note),
    }
  }

  const record = await findTransactionRecordById(ledgerId, normalizedTxId)
  if (!record) return null

  return {
    ...record,
    note_plain: stripAddonSummaryFromNote(record?.note),
    reimbursed_minor: 0,
  }
}

function normalizeDraftSyncTransactionIds(rawList) {
  if (!Array.isArray(rawList)) return []
  return Array.from(new Set(rawList.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

const defaultDraftClaimSheetSyncDeps = {
  listDraftTransactionImportItemsByTransactionIds,
  loadReimbursementTransactionForDraftSync,
  deleteReimbursementItemById,
  updateReimbursementItemById,
  recomputeReimbursementTotal,
}

let draftClaimSheetSyncDepsOverride = null

function draftClaimSheetSyncDeps() {
  return draftClaimSheetSyncDepsOverride ?? defaultDraftClaimSheetSyncDeps
}

export function setDraftClaimSheetSyncDependenciesForTest(overrides = {}) {
  draftClaimSheetSyncDepsOverride = {
    ...defaultDraftClaimSheetSyncDeps,
    ...overrides,
  }
}

export function resetDraftClaimSheetSyncDependenciesForTest() {
  draftClaimSheetSyncDepsOverride = null
}

export async function reconcileDraftClaimSheetImportItems(ledgerId, options = {}) {
  const deps = draftClaimSheetSyncDeps()
  const txIds = normalizeDraftSyncTransactionIds(options?.txIds)
  if (!txIds.length) {
    return {
      updatedItemIds: [],
      removedItemIds: [],
      affectedReimbursementIds: [],
    }
  }

  const draftItems = await deps.listDraftTransactionImportItemsByTransactionIds(ledgerId, txIds)
  if (!draftItems.length) {
    return {
      updatedItemIds: [],
      removedItemIds: [],
      affectedReimbursementIds: [],
    }
  }

  const txCache = new Map()
  const reimbursementIdsToRecompute = new Set()

  for (const item of draftItems) {
    if (!isReimbursementImportClaimItem(item)) continue
    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId || txCache.has(txId)) continue
    txCache.set(txId, await deps.loadReimbursementTransactionForDraftSync(ledgerId, txId))
  }

  const txById = Object.fromEntries(txCache.entries())
  const { updatedRows, removedItemIds, affectedReimbursementIds } = reconcileDraftClaimItemRows(draftItems, txById)

  for (const itemId of removedItemIds) {
    await deps.deleteReimbursementItemById(ledgerId, itemId)
  }

  for (const row of updatedRows) {
    await deps.updateReimbursementItemById(ledgerId, row.itemId, {
      description: row.description,
      amountMinor: row.amountMinor,
    })
    reimbursementIdsToRecompute.add(row.reimbursementId)
  }

  for (const reimbursementId of affectedReimbursementIds) {
    reimbursementIdsToRecompute.add(reimbursementId)
  }

  for (const reimbursementId of reimbursementIdsToRecompute) {
    await deps.recomputeReimbursementTotal(ledgerId, reimbursementId)
  }

  return {
    updatedItemIds: updatedRows.map((row) => row.itemId),
    removedItemIds,
    affectedReimbursementIds: Array.from(reimbursementIdsToRecompute),
  }
}

export async function syncDraftClaimSheetsForTransaction(ledgerId, txId) {
  return reconcileDraftClaimSheetImportItems(ledgerId, { txIds: [txId] })
}
