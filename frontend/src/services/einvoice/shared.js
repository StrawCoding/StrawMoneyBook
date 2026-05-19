export const EINVOICE_PLATFORM = 'einvoice'

export function createEInvoiceError(message, code = 'einvoice_error') {
  const error = new Error(String(message ?? '').trim() || 'E-invoice error')
  error.code = String(code ?? 'einvoice_error')
  return error
}

export function isEInvoiceError(error) {
  return error instanceof Error && typeof error.code === 'string'
}
