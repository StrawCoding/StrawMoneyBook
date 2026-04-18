function parseLocalDateTime(value) {
  if (!value) return NaN
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

function dayStartMs(dayKey) {
  return parseLocalDateTime(dayKey ? `${dayKey}T00:00` : '')
}

function dayEndMs(dayKey) {
  return parseLocalDateTime(dayKey ? `${dayKey}T23:59:59` : '')
}

export function filterTransactionsForSearch({
  transactions = [],
  keyword = '',
  startDay = '',
  endDay = '',
  labelOfTransaction,
  accountName,
  formatTime,
  noteText,
}) {
  const query = String(keyword ?? '').trim().toLowerCase()
  const startMs = dayStartMs(startDay)
  const endMs = dayEndMs(endDay)

  return transactions.filter((tx) => {
    const occurredMs = new Date(tx.occurred_at).getTime()
    if (Number.isFinite(startMs) && occurredMs < startMs) return false
    if (Number.isFinite(endMs) && occurredMs > endMs) return false

    if (!query) return true

    const category = labelOfTransaction(tx)
    const account = accountName(tx.account_id)
    const amount = String(Math.abs(Number(tx.amount_minor ?? 0)) / 100)
    const time = formatTime(tx.occurred_at)
    const note = noteText(tx.note)
    const text = `${category} ${account} ${amount} ${time} ${note}`.toLowerCase()
    return text.includes(query)
  })
}

export function summarizeSelectedBatchTransactions(transactions = []) {
  return transactions.reduce((summary, tx) => {
    const type = String(tx?.type ?? '').trim()
    if (type === 'expense') summary.expenseCount += 1
    else if (type === 'income') summary.incomeCount += 1
    else if (type === 'transfer') summary.transferCount += 1
    else if (type === 'adjustment') summary.adjustmentCount += 1
    return summary
  }, {
    expenseCount: 0,
    incomeCount: 0,
    transferCount: 0,
    adjustmentCount: 0,
  })
}
