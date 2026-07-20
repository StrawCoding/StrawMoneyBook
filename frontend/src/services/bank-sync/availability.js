import { Capacitor } from '@capacitor/core'
import { hasBankSyncMembershipAccess } from '@/core/services/membership.service.js'
import {
  getBankSyncSupportMatrix,
  isBankSyncApiConfigured,
  isBankSyncFeatureEnabled,
  isBankSyncNativeAutomationAvailable,
} from './backend.js'
import { isNativeBankAutomationRuntimeSupported } from './native-automation.js'
import { buildBankSyncAvailabilityAssessment } from './availability-core.js'

/**
 * Diagnostic availability flow for bank sync:
 * membership → platform/app → automation/API → credentials → captcha → sync → review/import
 * Each stage returns a de-identified error code + single recovery CTA when blocked.
 */
export function assessBankSyncAvailability({
  membershipTier = '',
  hasCredentials = false,
  credentialsInvalid = false,
  captchaRequired = false,
  lastSyncStatus = '',
  pendingReviewCount = 0,
  lastErrorCode = '',
  featureEnabled = isBankSyncFeatureEnabled(),
  androidRuntime = isNativeBankAutomationRuntimeSupported(),
  nativeAutomationAvailable = isBankSyncNativeAutomationAvailable(),
  apiConfigured = isBankSyncApiConfigured(),
} = {}) {
  return buildBankSyncAvailabilityAssessment({
    membershipOk: hasBankSyncMembershipAccess(membershipTier),
    featureEnabled,
    androidRuntime,
    nativeAutomationAvailable,
    apiConfigured,
    hasCredentials,
    credentialsInvalid,
    captchaRequired,
    lastSyncStatus,
    pendingReviewCount,
    lastErrorCode,
    platform: Capacitor.getPlatform(),
    matrix: getBankSyncSupportMatrix(),
    checkedAt: Date.now(),
  })
}

export { buildBankSyncAvailabilityAssessment } from './availability-core.js'
