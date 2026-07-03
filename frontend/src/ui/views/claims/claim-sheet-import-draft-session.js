const STORAGE_KEY = 'strawmoneybook.claimSheetDraftForm'

function storage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage ?? null
}

import { normalizeImportAmountOverrideMap } from '@/ui/utils/claim-sheet-import'

function normalizeIdList(list) {
  if (!Array.isArray(list)) return []
  return list.map((id) => String(id ?? '').trim()).filter(Boolean)
}

export function saveClaimSheetDraftSession(payload = {}) {
  const target = storage()
  if (!target) return
  target.setItem(STORAGE_KEY, JSON.stringify({
    title: String(payload.title ?? ''),
    counterpartyName: String(payload.counterpartyName ?? ''),
    note: String(payload.note ?? ''),
    importTxIds: normalizeIdList(payload.importTxIds),
    borrowLoanImportTxIds: normalizeIdList(payload.borrowLoanImportTxIds),
    importAmountOverrides: normalizeImportAmountOverrideMap(payload.importAmountOverrides),
    borrowLoanImportAmountOverrides: normalizeImportAmountOverrideMap(payload.borrowLoanImportAmountOverrides),
    manualItems: Array.isArray(payload.manualItems) ? payload.manualItems : [],
  }))
}

export function loadClaimSheetDraftSession() {
  const target = storage()
  if (!target) return null
  const raw = target.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      title: String(parsed?.title ?? ''),
      counterpartyName: String(parsed?.counterpartyName ?? ''),
      note: String(parsed?.note ?? ''),
      importTxIds: normalizeIdList(parsed?.importTxIds),
      borrowLoanImportTxIds: normalizeIdList(parsed?.borrowLoanImportTxIds),
      importAmountOverrides: normalizeImportAmountOverrideMap(parsed?.importAmountOverrides),
      borrowLoanImportAmountOverrides: normalizeImportAmountOverrideMap(parsed?.borrowLoanImportAmountOverrides),
      manualItems: Array.isArray(parsed?.manualItems) ? parsed.manualItems : [],
    }
  } catch {
    return null
  }
}

export function clearClaimSheetDraftSession() {
  storage()?.removeItem(STORAGE_KEY)
}
