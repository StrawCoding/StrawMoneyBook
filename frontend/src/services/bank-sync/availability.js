import { Capacitor } from '@capacitor/core'
import { hasBankSyncMembershipAccess } from '@/core/services/membership.service.js'
import {
  getBankSyncSupportMatrix,
  isBankSyncApiConfigured,
  isBankSyncFeatureEnabled,
  isBankSyncNativeAutomationAvailable,
} from './backend.js'

/**
 * Diagnostic availability flow for bank sync:
 * membership → platform/app → automation/API → credentials → captcha → sync → review/import
 * Each stage returns a de-identified error code + single recovery CTA when blocked.
 */
export function assessBankSyncAvailability({
  membershipTier = '',
  hasCredentials = false,
  captchaRequired = false,
  lastSyncStatus = '',
  pendingReviewCount = 0,
  lastErrorCode = '',
} = {}) {
  const matrix = getBankSyncSupportMatrix()
  const membershipOk = hasBankSyncMembershipAccess(membershipTier)
  const featureOk = isBankSyncFeatureEnabled()
  const platformOk = isBankSyncNativeAutomationAvailable()
  const apiOk = isBankSyncApiConfigured()
  const syncOk = String(lastSyncStatus ?? '').toLowerCase() === 'ok'
  const stages = [
    {
      id: 'membership',
      ok: membershipOk,
      code: membershipOk ? null : 'bank_sync_membership_required',
      recovery: 'membership',
    },
    {
      id: 'platform',
      ok: featureOk && platformOk,
      code: !featureOk
        ? 'bank_sync_feature_disabled'
        : (platformOk ? null : 'bank_sync_android_only'),
      recovery: platformOk ? null : 'get_android_app',
    },
    {
      id: 'api',
      ok: apiOk,
      code: apiOk ? null : 'bank_sync_api_unavailable',
      recovery: 'retry_check',
    },
    {
      id: 'credentials',
      ok: !platformOk || hasCredentials,
      code: (!platformOk || hasCredentials) ? null : 'bank_sync_credentials_missing',
      recovery: 'open_create',
    },
    {
      id: 'captcha',
      ok: !captchaRequired,
      code: captchaRequired ? 'bank_sync_captcha_required' : null,
      recovery: captchaRequired ? 'enter_captcha' : null,
    },
    {
      id: 'sync',
      ok: !lastErrorCode && (syncOk || !hasCredentials),
      code: lastErrorCode || (syncOk || !hasCredentials ? null : 'bank_sync_pending'),
      recovery: lastErrorCode ? 'retry_sync' : null,
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
    checkedAt: Date.now(),
    platform: Capacitor.getPlatform(),
    matrix,
    ready: stages.every((stage) => stage.ok || stage.id === 'review'),
    blocker,
    stages,
    recoveryCta: blocker?.recovery ?? (pendingReviewCount > 0 ? 'open_review' : null),
    errorCode: blocker?.code ?? null,
  }
}
