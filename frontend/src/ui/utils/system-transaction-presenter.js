function textOf(value) {
  return String(value ?? '').trim()
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

  return ''
}

export function getSystemTransactionLabel(tx) {
  const type = getSystemTransactionType(tx)
  if (type === 'refund') return '退款'
  if (type === 'advance') return '代收'
  return ''
}

export function getSystemTransactionIcon(tx) {
  const type = getSystemTransactionType(tx)
  if (type === 'refund') return 'fa-solid fa-money-bill-wave'
  if (type === 'advance') return 'fa-solid fa-hand-holding-dollar'
  return ''
}
