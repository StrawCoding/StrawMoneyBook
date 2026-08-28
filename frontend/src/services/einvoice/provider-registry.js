/**
 * Carrier sync Provider Registry (Architecture B — modular restore).
 * Active: nat_gov_einvoice_tw only (財政部電子發票整合服務平台).
 */

export const CARRIER_PROVIDER_IDS = Object.freeze({
  NAT_GOV_EINVOICE_TW: 'nat_gov_einvoice_tw',
})

/** @typedef {{ id: string, labelKey: string, type: string, required?: boolean, maxlength?: number, inputmode?: string }} CredentialField */

/** @type {Record<string, { id: string, name: string, country: string, lookbackDays: number, identityScheme: string, credentialSchema: CredentialField[], capabilities: Record<string, string>, enabled: boolean }>} */
const PROVIDERS = Object.freeze({
  [CARRIER_PROVIDER_IDS.NAT_GOV_EINVOICE_TW]: {
    id: CARRIER_PROVIDER_IDS.NAT_GOV_EINVOICE_TW,
    name: '財政部電子發票整合服務平台',
    country: 'TW',
    lookbackDays: 14,
    identityScheme: 'natgov:mobile-barcode:v1',
    enabled: true,
    credentialSchema: [
      { id: 'cardNo', labelKey: 'settings_carrier_sync.phone', type: 'tel', required: true, maxlength: 10, inputmode: 'tel' },
      { id: 'cardEncrypt', labelKey: 'settings_carrier_sync.password', type: 'password', required: true, maxlength: 32 },
      { id: 'captchaCode', labelKey: 'settings_carrier_sync.captcha.title', type: 'text', required: false, maxlength: 4 },
    ],
    capabilities: {
      portalLoad: 'SAFE_RETRY',
      fetchInvoices: 'SAFE_RETRY',
      loginSubmit: 'NO_RETRY',
      captchaSubmit: 'USER_INTERACTION_REQUIRED',
      cloudflareWait: 'SAFE_RETRY',
      sessionExpired: 'REAUTH',
    },
  },
})

export function listRegisteredCarrierProviders() {
  return Object.values(PROVIDERS)
    .filter((item) => item.enabled)
    .map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country,
    }))
}

export function getCarrierProviderDefinition(providerId) {
  const id = String(providerId ?? '').trim().toLowerCase()
  const def = PROVIDERS[id] || null
  if (!def || !def.enabled) return null
  return def
}

export function isRegisteredCarrierProviderId(providerId) {
  return Boolean(getCarrierProviderDefinition(providerId))
}

export function getCarrierProviderLookbackDays(providerId) {
  return Number(getCarrierProviderDefinition(providerId)?.lookbackDays ?? 14) || 14
}

export function getDefaultCarrierProviderId() {
  return CARRIER_PROVIDER_IDS.NAT_GOV_EINVOICE_TW
}
