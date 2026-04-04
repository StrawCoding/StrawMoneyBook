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
  return categoryName === '退款' || note.startsWith('退款：') || note.startsWith('退款:')
}

export function hasRefundLink(tx) {
  return Number(tx?.has_refund_link ?? 0) === 1
}

export function isCountableForIncomeExpense(tx) {
  if (Number(tx?.include_in_analysis ?? 1) === 0) return false
  if (hasRefundLink(tx)) return false
  return !isRefundTransaction(tx)
}

export function isCountableForBudget(tx) {
  if (String(tx?.type ?? '') !== 'expense') return false
  if (Number(tx?.include_in_budget ?? 1) === 0) return false
  if (hasRefundLink(tx)) return false
  return !isRefundTransaction(tx)
}
