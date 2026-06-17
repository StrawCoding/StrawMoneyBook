// Native WebView automation is deleted/disabled: the e-invoice portal blocks
// embedded WebView scraping and OCR-based CAPTCHA handling is unreliable.
// Carrier invoice queries are now handled via backend Playwright scrape API.

export function isEInvoiceAutomationRuntimeSupported() {
  return false
}

// Kept as a no-op stub so any stale import paths don't crash.
export async function queryNativeEInvoices() {
  throw new Error('Native e-invoice automation is disabled; use backend Playwright scrape instead')
}
