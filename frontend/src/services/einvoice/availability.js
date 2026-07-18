import { Capacitor } from '@capacitor/core'
import { hasCarrierSyncMembershipAccess } from '@/core/services/membership.service.js'
import { isEInvoiceApiConfigured, probeEInvoiceApiHealth } from './scrape-api.js'
import { isValidCarrierPhone } from './shared.js'

/**
 * Diagnostic availability flow for carrier (e-invoice) sync:
 * membership → platform/app → API health → credentials → captcha → sync → review/import
 */
export function assessCarrierSyncAvailability({
  membershipTier = '',
  apiHealth = null,
  carrierPhone = '',
  hasPassword = false,
  captchaRequired = false,
  lastSyncStatus = '',
  lastErrorCode = '',
  pendingCount = 0,
} = {}) {
  const membershipOk = hasCarrierSyncMembershipAccess(membershipTier)
  const apiConfigured = isEInvoiceApiConfigured()
  const healthOk = apiHealth == null
    ? apiConfigured
    : Boolean(apiHealth?.ok && apiHealth?.configured !== false)
  const passwordOk = Boolean(hasPassword)
  const credsOk = isValidCarrierPhone(carrierPhone) && passwordOk
  const syncStatus = String(lastSyncStatus ?? '').toLowerCase()
  const syncOk = syncStatus === 'ok' || syncStatus === 'idle' || syncStatus === ''
  const stages = [
    {
      id: 'membership',
      ok: membershipOk,
      code: membershipOk ? null : 'carrier_sync_membership_required',
      recovery: 'membership',
    },
    {
      id: 'platform',
      ok: true,
      code: null,
      recovery: null,
      meta: { platform: Capacitor.getPlatform() },
    },
    {
      id: 'api',
      ok: apiConfigured && healthOk,
      code: !apiConfigured
        ? 'carrier_sync_api_not_configured'
        : (healthOk ? null : String(apiHealth?.errorCode ?? 'carrier_sync_api_unavailable')),
      recovery: 'retry_health',
    },
    {
      id: 'credentials',
      ok: credsOk,
      code: credsOk ? null : 'carrier_sync_credentials_missing',
      recovery: 'enter_credentials',
    },
    {
      id: 'captcha',
      ok: !captchaRequired && syncStatus !== 'captcha_required',
      code: (captchaRequired || syncStatus === 'captcha_required')
        ? 'einvoice_captcha_required'
        : null,
      recovery: 'enter_captcha',
    },
    {
      id: 'sync',
      ok: !lastErrorCode && (syncOk || syncStatus === 'captcha_required'),
      code: lastErrorCode || (syncStatus === 'error' ? 'einvoice_query_failed' : null),
      recovery: lastErrorCode || syncStatus === 'error' ? 'retry_sync' : null,
    },
    {
      id: 'review',
      ok: true,
      code: pendingCount > 0 ? 'carrier_sync_pending_review' : null,
      recovery: pendingCount > 0 ? 'open_review' : null,
      meta: { pendingCount },
    },
  ]

  const blocker = stages.find((stage) => !stage.ok) ?? null
  return {
    feature: 'carrier_sync',
    checkedAt: Date.now(),
    platform: Capacitor.getPlatform(),
    ready: Boolean(membershipOk && apiConfigured && healthOk && credsOk && !captchaRequired),
    blocker,
    stages,
    recoveryCta: blocker?.recovery ?? (pendingCount > 0 ? 'open_review' : null),
    errorCode: blocker?.code ?? null,
  }
}

export async function refreshCarrierApiHealthProbe() {
  return probeEInvoiceApiHealth()
}
