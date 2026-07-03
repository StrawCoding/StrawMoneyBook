import { reimbursementPendingMinor } from '@/ui/utils/reimbursement-item'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'

const DEFAULT_REIMBURSEMENT_TITLE = '未命名報銷'

export function isReimbursementImportClaimItem(item) {
  if (!item) return false
  if (String(item.source_type ?? '').trim() !== 'transaction') return false
  return String(item.entry_type ?? '').trim() !== 'income'
}

export function buildReimbursementImportTitle(tx) {
  const categoryName = String(tx?.category_name ?? '').trim()
  if (categoryName) return categoryName

  const notePlain = String(tx?.note_plain ?? '').trim()
    || stripAddonSummaryFromNote(tx?.note)
  if (notePlain) return notePlain

  return DEFAULT_REIMBURSEMENT_TITLE
}

export function resolveReimbursementImportSync(tx) {
  if (!tx) {
    return { action: 'remove', reason: 'missing_transaction' }
  }
  if (!Number(tx.is_reimbursable)) {
    return { action: 'remove', reason: 'not_reimbursable' }
  }

  const pendingMinor = reimbursementPendingMinor(tx)
  if (pendingMinor <= 0) {
    return { action: 'remove', reason: 'no_pending_amount' }
  }

  return {
    action: 'update',
    amountMinor: pendingMinor,
    description: buildReimbursementImportTitle(tx),
  }
}

export function shouldSyncDraftClaimItem(item, tx) {
  const sync = resolveReimbursementImportSync(tx)
  if (sync.action === 'remove') return { shouldRemove: true, shouldUpdate: false, sync }
  if (!isReimbursementImportClaimItem(item)) {
    return { shouldRemove: false, shouldUpdate: false, sync: null }
  }

  const currentAmount = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  const currentDescription = String(item?.description ?? '').trim()
  const maxAmount = sync.amountMinor
  const nextAmount = Math.min(currentAmount, maxAmount)
  const shouldUpdate = nextAmount !== currentAmount || currentDescription !== sync.description
  return {
    shouldRemove: false,
    shouldUpdate,
    sync: {
      ...sync,
      amountMinor: nextAmount,
    },
  }
}

export function reconcileDraftClaimItemRows(draftItems = [], txById = {}) {
  const updatedRows = []
  const removedItemIds = []
  const affectedReimbursementIds = new Set()

  for (const item of draftItems) {
    if (!isReimbursementImportClaimItem(item)) continue

    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId) continue

    const tx = txById[txId] ?? null
    const decision = shouldSyncDraftClaimItem(item, tx)

    if (decision.shouldRemove) {
      removedItemIds.push(item.id)
      affectedReimbursementIds.add(item.reimbursement_id)
      continue
    }

    if (!decision.shouldUpdate || decision.sync?.action !== 'update') continue

    updatedRows.push({
      itemId: item.id,
      reimbursementId: item.reimbursement_id,
      description: decision.sync.description,
      amountMinor: decision.sync.amountMinor,
    })
    affectedReimbursementIds.add(item.reimbursement_id)
  }

  return {
    updatedRows,
    removedItemIds,
    affectedReimbursementIds: Array.from(affectedReimbursementIds),
  }
}
