const CREDENTIALS_STAGE_CODES = new Set([
  'bank_sync_credentials_missing',
  'first_bank_legacy_reconnect_required',
  'first_bank_credentials_required',
  'first_bank_password_required',
  'first_bank_user_code_required',
  'first_bank_national_id_required',
  'first_bank_repeat_seq_required',
])

function extractErrorCode(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const colonIndex = text.indexOf(':')
  if (colonIndex > 0) {
    const code = text.slice(0, colonIndex).trim()
    if (/^[a-z0-9_]+$/i.test(code)) return code
  }
  return text
}

function isCredentialAuthErrorCode(code, raw = '') {
  const normalized = String(code ?? '').trim().toLowerCase()
  if (CREDENTIALS_STAGE_CODES.has(normalized)) return true
  const message = String(raw ?? '').toLowerCase()
  return (
    message.includes('credentials are missing')
    || message.includes('reconnect')
    || message.includes('session expired')
    || message.includes('login failed')
  )
}

/**
 * Pure bank-sync availability assessment (no Capacitor / membership imports).
 * Credentials stage only applies when nativeAutomationAvailable is true so
 * Web / non-Android never emit bank_sync_credentials_missing.
 */
export function buildBankSyncAvailabilityAssessment({
  membershipOk = false,
  featureEnabled = false,
  androidRuntime = false,
  nativeAutomationAvailable = false,
  apiConfigured = false,
  hasCredentials = false,
  credentialsInvalid = false,
  captchaRequired = false,
  lastSyncStatus = '',
  pendingReviewCount = 0,
  lastErrorCode = '',
  platform = 'web',
  matrix = null,
  checkedAt = Date.now(),
} = {}) {
  const featureOk = Boolean(featureEnabled)
  const platformRuntimeOk = Boolean(androidRuntime)
  const nativeReady = Boolean(nativeAutomationAvailable)
  const apiOk = Boolean(apiConfigured)
  const normalizedLastError = extractErrorCode(lastErrorCode)
  const credentialAuthError = isCredentialAuthErrorCode(normalizedLastError, lastErrorCode)
  const syncOk = String(lastSyncStatus ?? '').toLowerCase() === 'ok'
  const credentialsApplicable = nativeReady
  const credentialsMissing = credentialsApplicable && !hasCredentials
  const credentialsBroken = credentialsApplicable
    && hasCredentials
    && (Boolean(credentialsInvalid) || credentialAuthError)

  let credentialsCode = null
  let credentialsRecovery = null
  if (credentialsMissing) {
    credentialsCode = 'bank_sync_credentials_missing'
    credentialsRecovery = 'open_create'
  } else if (credentialsBroken) {
    credentialsCode = CREDENTIALS_STAGE_CODES.has(normalizedLastError)
      ? normalizedLastError
      : 'bank_sync_credentials_missing'
    credentialsRecovery = 'reconnect'
  }

  let syncCode = null
  let syncRecovery = null
  let syncStageOk = true
  if (!credentialsMissing && !credentialsBroken) {
    if (normalizedLastError) {
      syncStageOk = false
      syncCode = normalizedLastError
      syncRecovery = 'retry_sync'
    } else if (hasCredentials && !syncOk) {
      syncStageOk = false
      syncCode = 'bank_sync_pending'
    }
  }

  const stages = [
    {
      id: 'membership',
      ok: Boolean(membershipOk),
      code: membershipOk ? null : 'bank_sync_membership_required',
      recovery: 'membership',
    },
    {
      id: 'platform',
      ok: featureOk && platformRuntimeOk,
      code: !featureOk
        ? 'bank_sync_feature_disabled'
        : (platformRuntimeOk ? null : 'bank_sync_android_only'),
      recovery: !featureOk
        ? 'retry_check'
        : (platformRuntimeOk ? null : 'get_android_app'),
    },
    {
      id: 'api',
      ok: !platformRuntimeOk || apiOk,
      code: (!platformRuntimeOk || apiOk) ? null : 'bank_sync_api_unavailable',
      recovery: 'retry_check',
    },
    {
      id: 'credentials',
      ok: !credentialsMissing && !credentialsBroken,
      code: credentialsCode,
      recovery: credentialsRecovery,
    },
    {
      id: 'captcha',
      ok: !captchaRequired,
      code: captchaRequired ? 'bank_sync_captcha_required' : null,
      recovery: captchaRequired ? 'enter_captcha' : null,
    },
    {
      id: 'sync',
      ok: syncStageOk,
      code: syncCode,
      recovery: syncRecovery,
    },
    {
      id: 'review',
      ok: true,
      code: pendingReviewCount > 0 ? 'bank_sync_pending_review' : null,
      recovery: pendingReviewCount > 0 ? 'open_review' : null,
      meta: { pendingReviewCount },
    },
  ]

  const blocker = stages.find((stage) => !stage.ok) ?? null
  return {
    feature: 'bank_sync',
    checkedAt,
    platform,
    matrix,
    ready: stages.every((stage) => stage.ok || stage.id === 'review'),
    blocker,
    stages,
    recoveryCta: blocker?.recovery ?? (pendingReviewCount > 0 ? 'open_review' : null),
    errorCode: blocker?.code ?? null,
  }
}
