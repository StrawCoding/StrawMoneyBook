/**
 * Architecture B: remote First Bank HTTP scrape is retired.
 * Production path is Android native WebView automation only.
 * Kept as a tombstone so API route imports do not load the old scraper.
 */

function retiredError(operation) {
  const error = new Error(
    `Remote First Bank ${operation} was removed in Architecture B. Use Android native bank automation.`,
  )
  error.code = 'first_bank_remote_provider_retired'
  throw error
}

export async function createFirstBankLinkSession() {
  retiredError('link_session')
}

export async function exchangeFirstBankAuth() {
  retiredError('exchange')
}

export async function syncFirstBankTransactions() {
  retiredError('sync')
}

export async function disconnectFirstBankAuth() {
  retiredError('disconnect')
}

export async function markFirstBankTransactionsImported() {
  retiredError('mark_imported')
}
