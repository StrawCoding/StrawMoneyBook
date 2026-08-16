/**
 * Architecture B: remote Playwright bank scrape helpers are retired.
 * Production path is Android native WebView automation only.
 */

function retiredError() {
  const error = new Error(
    'Remote Playwright bank provider was removed in Architecture B. Use Android native bank automation.',
  )
  error.code = 'playwright_bank_provider_retired'
  throw error
}

export function createPlaywrightBankSession() {
  retiredError()
}

export async function runPlaywrightBankLogin() {
  retiredError()
}

export async function destroyPlaywrightBankSession() {
  retiredError()
}
