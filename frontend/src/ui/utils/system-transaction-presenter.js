import { translateMessage } from '@/ui/services/i18n.service.js'

function textOf(value) {
  return String(value ?? '').trim()
}

const SECURITY_PNL_NAMES = new Set(['投資損益', 'Investment P&L', '投資損益（證券）'])
export const SECURITY_SETTLEMENT_ICON = 'fa-solid fa-chart-line'

function isSecuritySettlementTx(tx) {
  const origin = textOf(tx?.origin_type)
  if (origin === 'security_settlement') return true
  const note = textOf(tx?.note)
  const settlementLabel = translateMessage('system_tx.security_settlement', '證券交割')
  if (note.startsWith('證券交割') || note.startsWith(settlementLabel)) return true
  const ref = textOf(tx?.external_ref_id)
  if (ref.startsWith('stx_')) return true
  const categoryName = textOf(tx?.category_name)
  if (
    SECURITY_PNL_NAMES.has(categoryName)
    || categoryName === translateMessage('system_tx.investment_pl', '投資損益')
    || categoryName === translateMessage('system_tx.investment_pl_security', '投資損益（證券）')
  ) return true
  return false
}

export function getSystemTransactionType(tx) {
  const categoryName = textOf(tx?.category_name)
  const externalRefId = textOf(tx?.external_ref_id)
  const note = textOf(tx?.note)

  const refundLabel = translateMessage('common.refund', '退款')
  const refundPrefix = translateMessage('common.refund_prefix', '退款：')
  const advanceNote = translateMessage('system_tx.reimbursement_advance', '報銷代收')
  if (categoryName === '退款' || categoryName === refundLabel || note.startsWith('退款：') || note.startsWith(refundPrefix)) {
    return 'refund'
  }

  if (
    categoryName === '代收' ||
    externalRefId.startsWith('radv') ||
    note === '報銷代收' ||
    note === advanceNote ||
    note.startsWith('報銷代收\n') ||
    note.startsWith(`${advanceNote}\n`)
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
  if (type === 'refund') return translateMessage('common.refund', '退款')
  if (type === 'advance') return translateMessage('assets_page.advance_label', '代收')
  if (type === 'security_principal') return translateMessage('system_tx.security_principal', '證券本金')
  return ''
}

export function getSystemTransactionIcon(tx) {
  const type = getSystemTransactionType(tx)
  if (type === 'refund') return 'fa-solid fa-money-bill-wave'
  if (type === 'advance') return 'fa-solid fa-hand-holding-dollar'
  if (type === 'security_principal' || type === 'security_pnl') return SECURITY_SETTLEMENT_ICON
  return ''
}
