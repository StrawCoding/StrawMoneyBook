import { connectInvoiceCarrier as connectInvoiceCarrierBackend } from '@/services/invoice-carrier/backend'
import { normalizeCarrierOptions, normalizeText } from '@/services/invoice-carrier/shared'

export async function connectInvoiceCarrier(mobilePhone, password, options = {}) {
  void options
  const result = await connectInvoiceCarrierBackend({
    mobile_phone: mobilePhone,
    password,
  })

  return {
    ...result,
    credentialState: {
      provider: normalizeText(result.provider),
      mobilePhone: normalizeText(mobilePhone),
      password: String(password ?? ''),
      storageState: result.storage_state ?? null,
      carrierOptions: normalizeCarrierOptions(result.available_carriers || result.carrier_options),
      updatedAt: new Date().toISOString(),
    },
  }
}
