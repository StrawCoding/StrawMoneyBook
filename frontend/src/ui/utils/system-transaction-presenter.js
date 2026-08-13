function textOf(value) {
  return String(value ?? '').trim()
}

const SECURITY_PNL_NAMES = new Set(['投資損益', 'Investment P&L', '投資損益（證券）'])
export const SECURITY_SETTLEMENT_ICON = 'fa-solid fa-chart-line'

function isSecuritySettlementTx(tx) {
  const origin = textOf(tx?.origin_type)
  if (origin === 'security_settlement') return true
  const note = textOf(tx?.note)
  if (note.startsWith('證券交割')) return true
  const ref = textOf(tx?.external_ref_id)
  if (ref.startsWith('stx_')) return true
  const categoryName = textOf(tx?.category_name)
  if (SECURITY_PNL_NAMES.has(categoryName)) return true
  return false
}

export function getSystemTransactionType(tx) {
  const categoryName = textOf(tx?.category_name)
  const externalRefId = textOf(tx?.external_ref_id)
  const note = textOf(tx?.note)

  if (categoryName === '退款' || note.startsWith('退款：')) {
    return 'refund'
  }

  if (
    categoryName === '代收' ||
    externalRefId.startsWith('radv') ||
    note === '報銷代收' ||
    note.startsWith('報銷代收\n')
  ) {
    return 'advance'
  }

  if (isSecuritySettlementTx(tx)) {
    if (textOf(tx?.type) === 'adjustment' || !textOf(tx?.category_id)) return 'security_principal'
    return 'security_pnl'
  }

  return ''
}

export function getSystemTransactionLabel(tx) {
  const type = getSystemTransactionType(tx)
  if (type === 'refund') return '退款'
  if (type === 'advance') return '代收'
  if (type === 'security_principal') return '證券本金'
  return ''
}

export function getSystemTransactionIcon(tx) {
  const type = getSystemTransactionType(tx)
  if (type === 'refund') return 'fa-solid fa-money-bill-wave'
  if (type === 'advance') return 'fa-solid fa-hand-holding-dollar'
  if (type === 'security_principal' || type === 'security_pnl') return SECURITY_SETTLEMENT_ICON
  return ''
}
