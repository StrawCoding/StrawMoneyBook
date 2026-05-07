export const EINVOICE_PLATFORM = 'einvoice'

export const EINVOICE_STATUS = Object.freeze({
  ALL: 'all',
  NOT_DONATED: 'not_donated',
  DONATED: 'donated',
  VOIDED: 'voided',
})

export function createEInvoiceError(message, code = 'einvoice_error') {
  const error = new Error(String(message ?? '').trim() || 'E-invoice error')
  error.code = String(code ?? 'einvoice_error')
  return error
}

export function isEInvoiceError(error) {
  return error instanceof Error && typeof error.code === 'string'
}
