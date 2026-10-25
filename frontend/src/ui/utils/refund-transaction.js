import { translateMessage } from '@/ui/services/i18n.service.js'

function textOf(value) {
  return String(value ?? '').trim()
}

export function isRefundTransaction(tx) {
  const originType = textOf(tx?.origin_type)
  if (originType === 'refund') return true

  const externalRefId = textOf(tx?.external_ref_id)
  if (!externalRefId) return false

  const categoryName = textOf(tx?.category_name)
  const note = textOf(tx?.note)
  const refundLabel = translateMessage('common.refund', '退款')
  const refundPrefix = translateMessage('common.refund_prefix', '退款：')
  return categoryName === '退款'
    || categoryName === refundLabel
    || note.startsWith('退款：')
    || note.startsWith('退款:')
    || note.startsWith(refundPrefix)
}

export function hasRefundLink(tx) {
  return Number(tx?.has_refund_link ?? 0) === 1
}

export function getRefundDeductedMinor(tx) {
  const raw = Math.round(Number(tx?.refund_deducted_minor ?? 0))
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.abs(Math.round(Number(tx?.amount_minor ?? 0)) || 0), raw)
  }
  return hasRefundLink(tx) ? Math.abs(Math.round(Number(tx?.amount_minor ?? 0)) || 0) : 0
}

export function getEffectiveTransactionAmountMinor(tx) {
  const amount = Math.round(Number(tx?.amount_minor ?? 0))
  if (!Number.isFinite(amount) || amount === 0) return 0
  if (isRefundTransaction(tx)) return 0

  const deductedMinor = getRefundDeductedMinor(tx)
  if (deductedMinor <= 0) return amount

  const remainingMinor = Math.max(0, Math.abs(amount) - deductedMinor)
  if (remainingMinor <= 0) return 0
  return amount < 0 ? remainingMinor * -1 : remainingMinor
}

export function isCountableForIncomeExpense(tx) {
  if (Number(tx?.include_in_analysis ?? 1) === 0) return false
  return getEffectiveTransactionAmountMinor(tx) !== 0
}

export function isCountableForBudget(tx) {
  if (String(tx?.type ?? '') !== 'expense') return false
  if (Number(tx?.include_in_budget ?? 1) === 0) return false
  return getEffectiveTransactionAmountMinor(tx) < 0
}
