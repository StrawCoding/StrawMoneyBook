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

export function isBankCredentialAuthError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message ?? error).toLowerCase()
  if ([
    'first_bank_login_failed',
    'first_bank_session_expired',
    'first_bank_password_required',
    'first_bank_user_code_required',
    'first_bank_national_id_required',
    'first_bank_repeat_seq_required',
    'first_bank_credentials_required',
    'first_bank_legacy_reconnect_required',
    'first_bank_my_accounts_trigger_missing',
  ].includes(code)) {
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

export function shouldRequireReconnectAfterBankSyncError(providerId, error) {
  if (!isFirstBankProviderId(providerId)) return false
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
