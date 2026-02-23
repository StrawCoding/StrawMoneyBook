const ACTIVE_LOAN_STATUSES = new Set(['active', 'partial'])

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateOrNull(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function normalizeCounterpartyName(rawName) {
  return String(rawName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function sortByRecent(loans = []) {
  return [...loans].sort((a, b) => {
    const aTime = Date.parse(String(a?.setup_occurred_at ?? a?.created_at ?? '')) || 0
    const bTime = Date.parse(String(b?.setup_occurred_at ?? b?.created_at ?? '')) || 0
    return bTime - aTime
  })
}

export function resolveLoanTransactionType(loanIntent) {
  if (!loanIntent) return 'expense'
  if (loanIntent.mode === 'create') {
    return loanIntent.direction === 'borrow' ? 'income' : 'expense'
  }
  return loanIntent.direction === 'borrow' ? 'expense' : 'income'
}

export function resolveLoanActionLabel(loanIntent) {
  if (!loanIntent) return '借貸'
  if (loanIntent.mode === 'create') {
    return loanIntent.direction === 'borrow' ? '借入' : '借出'
  }
  return loanIntent.direction === 'borrow' ? '歸還' : '收回'
}

export function formatLoanStartDateTime(occurredAt) {
  const date = toDateOrNull(occurredAt) ?? new Date()
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function resolveLoanOccurredAtIso(occurredAt) {
  return toDateOrNull(occurredAt)?.toISOString() ?? new Date().toISOString()
}

export function resolveLoanCounterpartyName(loanIntent) {
  return String(loanIntent?.counterpartyName ?? '').trim()
}

export function pickLoanForAiRepayment(loans, loanIntent) {
  const direction = loanIntent?.direction === 'borrow' ? 'borrow' : 'lend'
  const directionLabel = direction === 'borrow' ? '借入' : '借出'
  const activeLoans = sortByRecent(
    (loans ?? []).filter((item) => ACTIVE_LOAN_STATUSES.has(String(item?.status ?? '')) && item?.direction === direction),
  )

  if (!activeLoans.length) {
    return {
      loan: null,
      warning: `目前沒有可${loanIntent?.direction === 'borrow' ? '歸還' : '收回'}的${directionLabel}借貸`,
    }
  }

  const targetNameRaw = resolveLoanCounterpartyName(loanIntent)
  const targetName = normalizeCounterpartyName(targetNameRaw)
  if (!targetName) {
    if (activeLoans.length === 1) {
      return { loan: activeLoans[0], warning: '' }
    }
    return {
      loan: null,
      warning: '沒有辨識到借貸對象，請補上姓名，例如「歸還小明 500」',
    }
  }

  const exactMatched = activeLoans.filter((item) => normalizeCounterpartyName(item?.counterparty_name) === targetName)
  if (exactMatched.length > 0) {
    return {
      loan: sortByRecent(exactMatched)[0],
      warning: exactMatched.length > 1 ? `找到多筆「${targetNameRaw}」借貸，已套用最新一筆` : '',
    }
  }

  const fuzzyMatched = activeLoans.filter((item) => {
    const name = normalizeCounterpartyName(item?.counterparty_name)
    if (!name) return false
    return name.includes(targetName) || targetName.includes(name)
  })

  if (fuzzyMatched.length > 0) {
    return {
      loan: sortByRecent(fuzzyMatched)[0],
      warning: fuzzyMatched.length > 1 ? `找到多筆相近對象，已套用最新一筆` : '',
    }
  }

  return {
    loan: null,
    warning: `找不到進行中的「${targetNameRaw}」借貸，請先建立借貸或補上正確對象`,
  }
}
