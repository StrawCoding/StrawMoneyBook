/**
 * Bank sync Provider Registry (Architecture B — modular restore).
 * Active: hua_nan_bank_tw only. first_bank_tw slot disabled (no implementation).
 */

export const BANK_PROVIDER_IDS = Object.freeze({
  FIRST_BANK_TW: 'first_bank_tw',
  HUA_NAN_BANK_TW: 'hua_nan_bank_tw',
})

/** Disabled provider stubs — must not appear in listRegisteredBankProviders(). */
const DISABLED_PROVIDER_IDS = new Set([BANK_PROVIDER_IDS.FIRST_BANK_TW])

/** @typedef {{ id: string, labelKey: string, type: string, required?: boolean, maxlength?: number, inputmode?: string, defaultValue?: string }} CredentialField */

/** @type {Record<string, { id: string, name: string, country: string, lookbackDays: number, identityScheme: string, credentialSchema: CredentialField[], capabilities: Record<string, string>, enabled: boolean }>} */
const PROVIDERS = Object.freeze({
  [BANK_PROVIDER_IDS.FIRST_BANK_TW]: {
    id: BANK_PROVIDER_IDS.FIRST_BANK_TW,
    name: '第一銀行 i-Bank',
    country: 'TW',
    lookbackDays: 3,
    identityScheme: 'firstbank:portal-ref:v1',
    enabled: false,
    credentialSchema: [],
    capabilities: {},
  },
  [BANK_PROVIDER_IDS.HUA_NAN_BANK_TW]: {
    id: BANK_PROVIDER_IDS.HUA_NAN_BANK_TW,
    name: '華南銀行 個人網銀',
    country: 'TW',
    lookbackDays: 3,
    identityScheme: 'huanan:portal-ref:v1',
    enabled: true,
    credentialSchema: [
      { id: 'nationalId', labelKey: 'settings_bank_sync_create.national_id', type: 'text', required: true, maxlength: 10 },
      { id: 'userCode', labelKey: 'settings_bank_sync_create.user_code', type: 'text', required: true, maxlength: 10 },
      { id: 'password', labelKey: 'settings_bank_sync_create.password', type: 'password', required: true, maxlength: 16 },
      { id: 'captchaCode', labelKey: 'settings_bank_sync_create.captcha_code', type: 'text', required: false, maxlength: 4, inputmode: 'numeric' },
    ],
    capabilities: {
      portalLoad: 'SAFE_RETRY',
      fetchTransactions: 'SAFE_RETRY',
      loginSubmit: 'NO_RETRY',
      captchaSubmit: 'USER_INTERACTION_REQUIRED',
      virtualKeyboard: 'USER_INTERACTION_REQUIRED',
      sessionExpired: 'REAUTH',
    },
  },
})

export function listRegisteredBankProviders() {
  return Object.values(PROVIDERS)
    .filter((item) => item.enabled && !DISABLED_PROVIDER_IDS.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country,
    }))
}

export function getBankProviderDefinition(providerId) {
  const id = String(providerId ?? '').trim().toLowerCase()
  const def = PROVIDERS[id] || null
  if (!def || !def.enabled || DISABLED_PROVIDER_IDS.has(def.id)) return null
  return def
}

export function isRegisteredBankProviderId(providerId) {
  return Boolean(getBankProviderDefinition(providerId))
}

export function isDisabledBankProviderId(providerId) {
  const id = String(providerId ?? '').trim().toLowerCase()
  return DISABLED_PROVIDER_IDS.has(id)
}

export function getBankProviderCredentialSchema(providerId) {
  return getBankProviderDefinition(providerId)?.credentialSchema ?? []
}

export function getBankProviderLookbackDays(providerId) {
  return Number(getBankProviderDefinition(providerId)?.lookbackDays ?? 3) || 3
}

export function getBankProviderIdentityScheme(providerId) {
  return String(getBankProviderDefinition(providerId)?.identityScheme ?? '').trim()
}

export function getBankProviderOperationRetryCapability(providerId, operation) {
  const def = getBankProviderDefinition(providerId)
  if (!def) return 'NO_RETRY'
  return String(def.capabilities?.[operation] ?? 'NO_RETRY')
}
