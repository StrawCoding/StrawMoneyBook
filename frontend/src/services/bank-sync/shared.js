export function normalizeText(value) {
  return String(value ?? '').trim()
}

export function normalizeProviderId(value) {
  return normalizeText(value).toLowerCase()
}

export function isMockProviderId(value) {
  const normalized = normalizeProviderId(value)
  return normalized === 'mock' || normalized === 'mock_bank_tw'
}

export function isFirstBankProviderId(value) {
  return normalizeProviderId(value) === 'first_bank_tw'
}

export function isHuaNanBankProviderId(value) {
  return normalizeProviderId(value) === 'hua_nan_bank_tw'
}

export function isNativeBankProviderId(value) {
  return isHuaNanBankProviderId(value)
}

export function simpleHash(input) {
  const source = String(input ?? '')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

export function createFirstBankProviderConnectionId({
  nationalId,
  repeatSeq,
  userCode,
} = {}) {
  const normalizedNationalId = normalizeText(nationalId).toUpperCase()
  const normalizedRepeatSeq = normalizeText(repeatSeq || '0')
  const normalizedUserCode = normalizeText(userCode)
  if (!normalizedNationalId || !normalizedUserCode) return ''
  return `first_bank_identity_${simpleHash(`${normalizedNationalId}:${normalizedRepeatSeq}:${normalizedUserCode}`)}`
}

export function createHuaNanProviderConnectionId({
  nationalId,
  userCode,
} = {}) {
  const normalizedNationalId = normalizeText(nationalId).toUpperCase()
  const normalizedUserCode = normalizeText(userCode)
  if (!normalizedNationalId || !normalizedUserCode) return ''
  return `hua_nan_identity_${simpleHash(`${normalizedNationalId}:${normalizedUserCode}`)}`
}

export function createBankProviderConnectionId(providerId, options = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  if (normalizedProviderId === 'hua_nan_bank_tw') {
    return createHuaNanProviderConnectionId(options)
  }
  return ''
}

/**
 * Native vault may be keyed by provider_connection_id OR local DB id (legacy).
 * Always pass distinct candidates so Android can resolve without false
 * bank_sync_credentials_missing / first_bank_legacy_reconnect_required.
 */
export function buildNativeVaultLookupIds(connection = {}) {
  const localId = normalizeText(connection?.id)
  const providerRef = normalizeText(connection?.provider_connection_id)
  const primary = providerRef || localId
  return {
    connectionId: primary,
    connection_id: localId || primary,
    provider_connection_id: providerRef || primary,
    local_connection_id: localId || primary,
  }
}

export function buildImportedNoteParts(row = {}) {
  const transactionType = normalizeText(row?.transaction_type ?? row?.transactionType)
  const summary = normalizeText(row?.summary)
  const note = normalizeText(row?.note)
  return [transactionType, summary, note].filter(Boolean)
}

export function buildImportedNote(row = {}) {
  const parts = buildImportedNoteParts(row)
  if (!parts.length) return null
  return parts.join('｜')
}

export function formatBankErrorForStorage(error) {
  const code = normalizeText(error?.code)
  const message = normalizeText(error?.message ?? error)
  if (code && message && code !== message) {
    return `${code}: ${message}`
  }
  return code || message || 'bank_sync_unknown_error'
}

export function extractBankErrorCode(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const colonIndex = text.indexOf(':')
  if (colonIndex <= 0) return text
  return normalizeText(text.slice(0, colonIndex))
}

const BANK_CREDENTIAL_AUTH_ERROR_CODES = Object.freeze([
  'first_bank_login_failed',
  'first_bank_login_page_mismatch',
  'first_bank_portal_contract_failed',
  'first_bank_session_expired',
  'first_bank_password_required',
  'first_bank_user_code_required',
  'first_bank_national_id_required',
  'first_bank_repeat_seq_required',
  'first_bank_credentials_required',
  'first_bank_legacy_reconnect_required',
  'first_bank_my_accounts_trigger_missing',
  'hua_nan_login_failed',
  'hua_nan_login_page_mismatch',
  'hua_nan_session_expired',
  'hua_nan_password_required',
  'hua_nan_user_code_required',
  'hua_nan_national_id_required',
  'hua_nan_credentials_required',
  'hua_nan_legacy_reconnect_required',
  'hua_nan_login_trigger_missing',
])

const BANK_PORTAL_CHANGED_ERROR_CODES = Object.freeze([
  'first_bank_login_page_mismatch',
  'first_bank_portal_contract_failed',
  'first_bank_account_list_not_found',
  'first_bank_my_accounts_trigger_missing',
  'first_bank_transaction_query_failed',
  'hua_nan_account_list_not_found',
  'hua_nan_transaction_query_failed',
  'hua_nan_transaction_page_timeout',
])

const BANK_NON_RECONNECT_PORTAL_CODES = Object.freeze([
  'hua_nan_account_list_not_found',
  'hua_nan_transaction_query_failed',
  'hua_nan_transaction_page_timeout',
])

export function isBankCredentialAuthError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message ?? error).toLowerCase()
  if (BANK_NON_RECONNECT_PORTAL_CODES.includes(code)) {
    return false
  }
  if (BANK_CREDENTIAL_AUTH_ERROR_CODES.includes(code)) {
    return true
  }

  return (
    message.includes('login failed')
    || message.includes('session expired')
    || message.includes('reconnect')
    || message.includes('密碼')
    || message.includes('代碼')
    || message.includes('身分證')
    || message.includes('登入失敗')
    || message.includes('逾時')
  )
}

export function classifyFirstBankSyncFailure(error) {
  const code = normalizeText(error?.code).toLowerCase()
  if (BANK_PORTAL_CHANGED_ERROR_CODES.includes(code)) {
    return 'portal_changed'
  }
  if (isBankCredentialAuthError(error)) {
    return 'reconnect'
  }
  const message = normalizeText(error?.message ?? error).toLowerCase()
  if (
    code.includes('timeout')
    || code.includes('temporarily')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('暫時')
    || message.includes('稍後')
  ) {
    return 'retry'
  }
  return 'retry'
}

export function shouldRequireReconnectAfterBankSyncError(providerId, error) {
  if (!isNativeBankProviderId(providerId)) return false
  return isBankCredentialAuthError(error)
}

export function shouldRequireReconnectForStoredBankConnection(providerId, status, lastError) {
  if (normalizeText(status).toLowerCase() !== 'error') return false
  const code = extractBankErrorCode(lastError)
  return shouldRequireReconnectAfterBankSyncError(providerId, {
    code,
    message: lastError,
  })
}

export function selectSyncableBankAccounts(accounts = []) {
  if (!Array.isArray(accounts)) return []
  return accounts.filter((item) => {
    return Boolean(Number(item?.enabled ?? 0)) && Boolean(normalizeText(item?.mapped_account_id))
  })
}
