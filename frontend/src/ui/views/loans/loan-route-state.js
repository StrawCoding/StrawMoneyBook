export function normalizeLoanTab(value) {
  return value === 'borrow' ? 'borrow' : 'lend'
}

export function normalizeLoanFinished(value) {
  return value === '1' || value === 'true'
}

export function toLoanFinishedQueryValue(value) {
  return value ? '1' : '0'
}

export function buildLoanListQuery(query = {}, state = {}) {
  return {
    ...query,
    tab: normalizeLoanTab(state.tab),
    finished: toLoanFinishedQueryValue(Boolean(state.showFinished)),
  }
}

export function buildLoanCounterpartyQuery(query = {}, state = {}) {
  const nextQuery = buildLoanListQuery(query, state)
  const name = String(state.name ?? '').trim()
  if (name) {
    nextQuery.name = name
  } else {
    delete nextQuery.name
  }
  return nextQuery
}
