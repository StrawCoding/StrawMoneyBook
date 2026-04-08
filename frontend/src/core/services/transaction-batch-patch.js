import { mergeAddonItemsToNote, parseAddonItemsFromNote } from '../../ui/utils/addon-note.js'

export const BATCH_NOTE_MODE_KEEP = 'keep'
export const BATCH_NOTE_MODE_REPLACE = 'replace'
export const BATCH_NOTE_MODE_CLEAR = 'clear'
export const BATCH_TOGGLE_KEEP = 'keep'
export const BATCH_TOGGLE_TRUE = 'true'
export const BATCH_TOGGLE_FALSE = 'false'

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value ?? '').trim()
  return allowed.includes(normalized) ? normalized : fallback
}

function normalizeId(value) {
  return String(value ?? '').trim()
}

function isRefundTransactionLike(tx) {
  if (String(tx?.origin_type ?? '').trim() === 'refund') return true
  const categoryName = String(tx?.category_name ?? '').trim()
  const note = String(tx?.note ?? '').trim()
  if (!String(tx?.external_ref_id ?? '').trim()) return false
  return categoryName === '退款' || note.startsWith('退款：') || note.startsWith('退款:')
}

export function applyBatchNotePatch(currentNote, patch) {
  const currentItems = parseAddonItemsFromNote(currentNote)
  if (patch.noteMode === BATCH_NOTE_MODE_KEEP) {
    return currentNote ?? null
  }
  if (patch.noteMode === BATCH_NOTE_MODE_CLEAR) {
    const next = mergeAddonItemsToNote('', currentItems).trim()
    return next || null
  }

  const nextBaseNote = String(patch.note ?? '').trim()
  const next = mergeAddonItemsToNote(nextBaseNote, currentItems).trim()
  return next || null
}

export function normalizeBatchTransactionPatch(rawPatch = {}) {
  return {
    categoryId: normalizeId(rawPatch.categoryId),
    noteMode: normalizeMode(
      rawPatch.noteMode,
      [BATCH_NOTE_MODE_KEEP, BATCH_NOTE_MODE_REPLACE, BATCH_NOTE_MODE_CLEAR],
      BATCH_NOTE_MODE_KEEP,
    ),
    note: String(rawPatch.note ?? '').trim(),
    isReimbursableMode: normalizeMode(
      rawPatch.isReimbursableMode,
      [BATCH_TOGGLE_KEEP, BATCH_TOGGLE_TRUE, BATCH_TOGGLE_FALSE],
      BATCH_TOGGLE_KEEP,
    ),
    includeInBudgetMode: normalizeMode(
      rawPatch.includeInBudgetMode,
      [BATCH_TOGGLE_KEEP, BATCH_TOGGLE_TRUE, BATCH_TOGGLE_FALSE],
      BATCH_TOGGLE_KEEP,
    ),
    includeInAnalysisMode: normalizeMode(
      rawPatch.includeInAnalysisMode,
      [BATCH_TOGGLE_KEEP, BATCH_TOGGLE_TRUE, BATCH_TOGGLE_FALSE],
      BATCH_TOGGLE_KEEP,
    ),
  }
}

export function hasBatchTransactionPatchChanges(patch) {
  if (normalizeId(patch?.categoryId)) return true
  if (patch?.noteMode && patch.noteMode !== BATCH_NOTE_MODE_KEEP) return true
  if (patch?.isReimbursableMode && patch.isReimbursableMode !== BATCH_TOGGLE_KEEP) return true
  if (patch?.includeInBudgetMode && patch.includeInBudgetMode !== BATCH_TOGGLE_KEEP) return true
  if (patch?.includeInAnalysisMode && patch.includeInAnalysisMode !== BATCH_TOGGLE_KEEP) return true
  return false
}

export function buildBatchTransactionUpdateInput(currentTx, rawPatch = {}) {
  const patch = normalizeBatchTransactionPatch(rawPatch)
  const type = String(currentTx?.type ?? '').trim()

  if (patch.categoryId && !['expense', 'income'].includes(type)) {
    return { ok: false, reason: '只有收入或支出交易可批量更改分類' }
  }

  if (patch.isReimbursableMode !== BATCH_TOGGLE_KEEP && type !== 'expense') {
    return { ok: false, reason: '只有支出交易可批量設定可報銷' }
  }

  const isRefund = isRefundTransactionLike(currentTx)
  const nextIsReimbursable = isRefund
    ? false
    : patch.isReimbursableMode === BATCH_TOGGLE_KEEP
      ? Boolean(Number(currentTx?.is_reimbursable ?? 0))
      : patch.isReimbursableMode === BATCH_TOGGLE_TRUE

  const nextIncludeInBudget = isRefund
    ? false
    : patch.includeInBudgetMode === BATCH_TOGGLE_KEEP
      ? Boolean(Number(currentTx?.include_in_budget ?? 1))
      : patch.includeInBudgetMode === BATCH_TOGGLE_TRUE

  const nextIncludeInAnalysis = isRefund
    ? false
    : patch.includeInAnalysisMode === BATCH_TOGGLE_KEEP
      ? Boolean(Number(currentTx?.include_in_analysis ?? 1))
      : patch.includeInAnalysisMode === BATCH_TOGGLE_TRUE

  return {
    ok: true,
    input: {
      accountId: currentTx.account_id,
      peerAccountId: currentTx.peer_account_id ?? null,
      categoryId: patch.categoryId || (currentTx.category_id ?? null),
      amountMinor: Number(currentTx.amount_minor ?? 0),
      occurredAt: currentTx.occurred_at,
      note: applyBatchNotePatch(currentTx.note, patch),
      isReimbursable: nextIsReimbursable,
      reimbursementState: nextIsReimbursable ? 'pending' : 'none',
      includeInBudget: nextIncludeInBudget,
      includeInAnalysis: nextIncludeInAnalysis,
    },
  }
}
