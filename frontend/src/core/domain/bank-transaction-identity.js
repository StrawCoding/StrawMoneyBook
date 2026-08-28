/**
 * Cross-source bank transaction identity (SYNC-01 / SYNC-02).
 * CSV (`fbcsv_`) and native automation (`fbtxn_` / `hncb_`) hashes differ;
 * same-account same-day same-amount is the portable duplicate signal.
 */

export function bankTxnCalendarDayKey(postedAt) {
  const raw = String(postedAt ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toISOString().slice(0, 10)
}

export function isCrossSourceLikelyDuplicate(left, right) {
  if (!left || !right) return false
  const leftAccount = String(left.bankAccountId ?? left.bank_account_id ?? '').trim()
  const rightAccount = String(right.bankAccountId ?? right.bank_account_id ?? '').trim()
  if (!leftAccount || leftAccount !== rightAccount) return false

  const leftId = String(left.providerTransactionId ?? left.provider_transaction_id ?? '').trim()
  const rightId = String(right.providerTransactionId ?? right.provider_transaction_id ?? '').trim()
  if (!leftId || !rightId || leftId === rightId) return false

  const leftAmount = Math.round(Number(left.amountMinor ?? left.amount_minor ?? 0))
  const rightAmount = Math.round(Number(right.amountMinor ?? right.amount_minor ?? 0))
  if (!Number.isFinite(leftAmount) || leftAmount !== rightAmount) return false

  const leftDay = bankTxnCalendarDayKey(left.postedAt ?? left.posted_at)
  const rightDay = bankTxnCalendarDayKey(right.postedAt ?? right.posted_at)
  return Boolean(leftDay) && leftDay === rightDay
}

export function mergeBankTxnRawJson(rawJson, extra = {}) {
  let parsed = {}
  try {
    parsed = JSON.parse(String(rawJson ?? '') || '{}')
  } catch {
    parsed = { raw: rawJson }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {}
  }
  return JSON.stringify({ ...parsed, ...extra })
}

export function readPossibleDuplicateOf(rawJson) {
  try {
    const parsed = JSON.parse(String(rawJson ?? '') || '{}')
    return String(parsed?.possible_duplicate_of ?? '').trim() || null
  } catch {
    return null
  }
}
