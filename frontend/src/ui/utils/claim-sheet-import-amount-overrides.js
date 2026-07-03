import {
  normalizeImportAmountOverrideMap,
  resolveImportedTxAmountMinor,
} from '@/ui/utils/claim-sheet-import'

export function buildImportAmountOverrideMapFromClaimItems(items = [], kind = 'reimbursement') {
  const out = {}
  for (const item of items) {
    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId) continue
    const entryType = String(item?.entry_type ?? '').trim()
    const isBorrowLoan = entryType === 'income'
    if (kind === 'borrow_loan' && !isBorrowLoan) continue
    if (kind === 'reimbursement' && isBorrowLoan) continue
    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
    if (amountMinor <= 0) continue
    out[txId] = amountMinor / 100
  }
  return out
}

export function mergeImportAmountOverrideMaps(...maps) {
  return normalizeImportAmountOverrideMap(Object.assign({}, ...maps))
}

export function seedImportAmountOverrides(selectedTxs = [], existingMap = {}) {
  const normalized = normalizeImportAmountOverrideMap(existingMap)
  const next = { ...normalized }
  for (const tx of selectedTxs) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId || next[txId] !== undefined) continue
    next[txId] = resolveImportedTxAmountMinor(tx, {}) / 100
  }
  return next
}

export function pruneImportAmountOverrides(overrideMap = {}, selectedTxIds = []) {
  const selected = new Set(selectedTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  const next = {}
  for (const [txId, amountMajor] of Object.entries(normalizeImportAmountOverrideMap(overrideMap))) {
    if (selected.has(txId)) {
      next[txId] = amountMajor
    }
  }
  return next
}

export function clampImportAmountOverridesForTxs(overrideMap = {}, txs = []) {
  const next = { ...normalizeImportAmountOverrideMap(overrideMap) }
  for (const tx of txs) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId || next[txId] === undefined) continue
    next[txId] = resolveImportedTxAmountMinor(tx, next) / 100
  }
  return next
}
