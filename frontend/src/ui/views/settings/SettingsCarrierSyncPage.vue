<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title">
        <font-awesome-icon icon="fa-solid fa-receipt" class="title-icon" />
        {{ t('settings_carrier_sync.title') }}
      </h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel" data-testid="carrier-sync-availability">
      <h3>{{ t('settings_carrier_sync.availability.title') }}</h3>
      <p class="muted compact">{{ t('settings_carrier_sync.availability.desc') }}</p>
      <ul class="availability-list">
        <li
          v-for="stage in availability.stages"
          :key="stage.id"
          class="availability-row"
          :data-stage="stage.id"
          :data-ok="stage.ok ? '1' : '0'"
        >
          <span class="availability-label">{{ t(`settings_carrier_sync.availability.stage.${stage.id}`) }}</span>
          <strong :class="stage.ok ? 'status-ok' : 'status-blocked'">
            {{ stage.ok ? t('settings_carrier_sync.availability.ok') : t('settings_carrier_sync.availability.blocked') }}
          </strong>
          <code v-if="stage.code" class="error-code">{{ stage.code }}</code>
        </li>
      </ul>
      <p v-if="availability.errorCode" class="muted warning-text">
        {{ t('settings_carrier_sync.availability.error_code', { code: availability.errorCode }) }}
      </p>
      <div class="row action-row">
        <RouterLink
          v-if="availability.recoveryCta === 'membership'"
          class="btn primary"
          to="/settings/membership-benefits"
          data-testid="carrier-sync-recovery-cta"
        >
          {{ t('settings_carrier_sync.view_membership') }}
        </RouterLink>
        <button
          v-else
          class="btn primary"
          type="button"
          data-testid="carrier-sync-recovery-cta"
          @click="handleRecoveryCta"
        >
          {{ carrierRecoveryCtaLabel }}
        </button>
      </div>
      <p class="muted compact">
        {{ t('settings_carrier_sync.availability.checked_at', { time: formatDateTime(availability.checkedAt) }) }}
      </p>
      <p class="muted compact">{{ t('settings_carrier_sync.availability.health_note') }}</p>
    </article>

    <article class="card panel">
      <h3>{{ t('settings_carrier_sync.management_title') }}</h3>
      <p class="muted">{{ t('settings_carrier_sync.management_desc') }}</p>

      <div v-if="!hasCarrierAccess" class="member-only-lock">
        <strong>{{ t('settings_carrier_sync.member_only') }}</strong>
        <p class="muted compact">{{ t('settings_carrier_sync.member_only_desc') }}</p>
        <RouterLink class="btn" to="/settings/membership-benefits">
          {{ t('settings_carrier_sync.view_membership') }}
        </RouterLink>
      </div>

      <template v-else>
        <p v-if="!apiReady" class="muted warning-text">{{ apiMessage }}</p>
        <p class="muted disclaimer-text">{{ t('settings_carrier_sync.disclaimer.line_1') }}</p>
      </template>
    </article>

    <template v-if="hasCarrierAccess">
      <article class="card panel">
        <h3>{{ t('settings_carrier_sync.credentials_title') }}</h3>
        <p class="muted">{{ t('settings_carrier_sync.credentials_desc') }}</p>

        <label class="field-label">{{ t('settings_carrier_sync.phone') }}</label>
        <input v-model="carrierPhone" class="field-input" type="tel" inputmode="tel" autocomplete="username" />

        <label class="field-label mt">{{ t('settings_carrier_sync.password') }}</label>
        <input v-model="carrierPassword" class="field-input" type="password" autocomplete="current-password" />

        <label class="remember-row mt">
          <input v-model="rememberCredentials" type="checkbox" />
          <span>{{ t('einvoice.step1.remember') }}</span>
        </label>

        <button class="btn link-btn" type="button" @click="handleClearCredential">
          {{ t('einvoice.step1.clear_saved') }}
        </button>
      </article>

      <article class="card panel">
        <h3>{{ t('settings_carrier_sync.sync_settings_title') }}</h3>
        <label class="remember-row">
          <input v-model="autoSyncEnabled" type="checkbox" @change="saveConfig" />
          <span>{{ t('settings_carrier_sync.auto_sync') }}</span>
        </label>
        <p class="muted compact">{{ t('settings_carrier_sync.auto_sync_hint') }}</p>

        <label class="field-label mt">{{ t('settings_carrier_sync.lookback_days') }}</label>
        <input v-model.number="lookbackDays" class="field-input" type="number" min="1" max="14" @change="saveConfig" />

        <label class="field-label mt">{{ t('settings_carrier_sync.default_account') }}</label>
        <CustomSelect
          v-model="defaultAccountId"
          class="field-input-select"
          :groups="accountSelectGroups"
          :placeholder="t('settings_carrier_sync.no_default_account')"
          data-testid="carrier-default-account"
          @update:model-value="saveConfig"
        />

        <label class="field-label mt">{{ t('settings_carrier_sync.default_category') }}</label>
        <CustomSelect
          v-model="defaultCategoryId"
          class="field-input-select"
          :groups="categorySelectGroups"
          :placeholder="t('settings_carrier_sync.no_default_category')"
          data-testid="carrier-default-category"
          @update:model-value="saveConfig"
        />

        <ul class="meta-list">
          <li>
            <span class="muted">{{ t('settings_carrier_sync.meta.last_sync') }}</span>
            <strong>{{ formatDateTime(syncConfig?.lastSyncAt) }}</strong>
          </li>
          <li>
            <span class="muted">{{ t('settings_carrier_sync.meta.sync_status') }}</span>
            <strong>{{ syncStatusText(syncConfig?.lastSyncStatus) }}</strong>
          </li>
        </ul>
        <p v-if="syncConfig?.lastError" class="muted warning-text">{{ syncConfig.lastError }}</p>

        <div class="row action-row">
          <button class="btn primary" :disabled="syncing || !canSync" :aria-busy="syncing" @click="handleSyncNow">
            {{ syncing ? t('settings_carrier_sync.syncing') : t('settings_carrier_sync.sync_now') }}
          </button>
        </div>
        <p v-if="syncMessage" class="muted">{{ syncMessage }}</p>
      </article>

      <article class="card panel review-panel" data-testid="carrier-sync-review">
        <header class="row review-head">
          <h3>{{ t('settings_carrier_sync.review.title') }}</h3>
          <button class="btn" :disabled="reviewLoading" @click="reloadPending">
            {{ reviewLoading ? t('common.loading') : t('settings_carrier_sync.review.reload') }}
          </button>
        </header>

        <div v-if="!pendingRows.length" class="muted">{{ t('settings_carrier_sync.review.empty') }}</div>
        <template v-else>
          <div class="row review-action-row">
            <button class="btn" @click="selectAll">{{ t('settings_carrier_sync.review.select_all') }}</button>
            <button class="btn" @click="clearSelection">{{ t('settings_carrier_sync.review.select_none') }}</button>
            <button class="btn primary" :disabled="importing || !selectedIds.length" @click="handleImportSelected">
              {{ importing ? t('settings_carrier_sync.review.importing') : t('settings_carrier_sync.review.import_selected', { count: selectedIds.length }) }}
            </button>
            <button class="btn" :disabled="!selectedIds.length" @click="handleDismissSelected">
              {{ t('settings_carrier_sync.review.dismiss_selected') }}
            </button>
          </div>

          <ul class="review-list">
            <li v-for="row in pendingRows" :key="row.id" class="review-item">
              <label class="review-row">
                <input v-model="selectedIds" type="checkbox" :value="row.invoiceNumber" />
                <div class="review-copy">
                  <strong>{{ row.merchantName || t('einvoice.step3.unknown_merchant') }}</strong>
                  <small class="muted">{{ row.invoiceNumber }}</small>
                  <div class="review-meta">
                    <span>{{ formatDate(row.invoiceDate) }}</span>
                    <span v-if="row.carrierName" class="carrier-chip">{{ row.carrierName }}</span>
                  </div>
                </div>
                <strong class="amount">NT${{ formatAmount(row.amount) }}</strong>
              </label>
            </li>
          </ul>
        </template>
      </article>
    </template>

    <AppDialog
      :open="showCaptchaDialog"
      :title="t('settings_carrier_sync.captcha.title')"
      :message="t('settings_carrier_sync.captcha.desc')"
      :cancel-text="t('common.cancel')"
      :confirm-text="t('settings_carrier_sync.captcha.confirm')"
      @close="closeCaptchaDialog"
      @confirm="submitCaptchaAndSync"
    >
      <div class="captcha-panel">
        <img v-if="captchaImageSrc" :src="captchaImageSrc" alt="captcha" class="captcha-image" />
        <p v-if="captchaExpired" class="muted warning-text">{{ t('settings_carrier_sync.captcha.expired') }}</p>
        <input v-model="captchaCode" class="field-input" :placeholder="t('settings_carrier_sync.captcha.placeholder')" />
        <div class="row captcha-actions">
          <button class="btn" type="button" :disabled="captchaRefreshing" @click="refreshCaptchaImage">
            {{ captchaRefreshing ? t('settings_carrier_sync.captcha.refreshing') : t('settings_carrier_sync.captcha.refresh') }}
          </button>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { getMembershipTierSnapshot, hasCarrierSyncMembershipAccess, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import {
  dismissPendingCarrierInvoices,
  getCarrierSyncState,
  importPendingCarrierInvoices,
  saveCarrierSyncConfig,
  cancelCarrierSyncSession,
  refreshCarrierCaptchaSession,
  syncCarrierInvoicesNow,
} from '@/services/einvoice/carrier-sync.service.js'
import {
  clearEInvoiceCredential,
  loadEInvoiceCredential,
  saveEInvoiceCredential,
} from '@/services/einvoice/backend.js'
import { isEInvoiceApiConfigured } from '@/services/einvoice/scrape-api.js'
import {
  assessCarrierSyncAvailability,
  refreshCarrierApiHealthProbe,
} from '@/services/einvoice/availability.js'
import { isValidCarrierPhone, normalizeCarrierPhone } from '@/services/einvoice/shared.js'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { withLeadingAccountOption } from '@/ui/utils/account-option-groups'
import { buildCategorySelectGroups } from '@/ui/utils/category-options'

const NONE_OPTION = '__none__'

const { t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()

const membershipTier = ref(getMembershipTierSnapshot())
const hasCarrierAccess = computed(() => hasCarrierSyncMembershipAccess(membershipTier.value))
const apiReady = computed(() => isEInvoiceApiConfigured())
const apiMessage = computed(() => t('settings_carrier_sync.api_unavailable'))
const apiHealth = ref(null)
const availability = ref(assessCarrierSyncAvailability({ membershipTier: membershipTier.value }))

const carrierPhone = ref('')
const carrierPassword = ref('')
const rememberCredentials = ref(true)
const autoSyncEnabled = ref(false)
const lookbackDays = ref(7)
const defaultAccountId = ref(NONE_OPTION)
const defaultCategoryId = ref(NONE_OPTION)
const syncConfig = ref(null)
const pendingRows = ref([])
const selectedIds = ref([])
const syncing = ref(false)
const importing = ref(false)
const reviewLoading = ref(false)
const syncMessage = ref('')
const showCaptchaDialog = ref(false)
const captchaCode = ref('')
const captchaImageSrc = ref('')
const captchaSessionId = ref('')
const captchaRefreshing = ref(false)
const captchaExpired = ref(false)
const captchaOpenedAt = ref(0)
const CAPTCHA_TTL_MS = 2 * 60 * 1000
let captchaExpireTimer = null

const accountSelectGroups = computed(() => withLeadingAccountOption(
  accountStore.groupedRegularAccounts,
  { value: NONE_OPTION, label: t('settings_carrier_sync.no_default_account') },
))
const categorySelectGroups = computed(() => withLeadingAccountOption(
  buildCategorySelectGroups(categoryStore, 'expense'),
  { value: NONE_OPTION, label: t('settings_carrier_sync.no_default_category') },
))
const canSync = computed(() => apiReady.value && isValidCarrierPhone(carrierPhone.value) && carrierPassword.value.trim().length >= 4)
const carrierRecoveryCtaLabel = computed(() => {
  const cta = availability.value?.recoveryCta
  if (cta === 'retry_health') return t('settings_carrier_sync.availability.cta.retry_health')
  if (cta === 'enter_credentials') return t('settings_carrier_sync.availability.cta.enter_credentials')
  if (cta === 'enter_captcha') return t('settings_carrier_sync.availability.cta.enter_captcha')
  if (cta === 'retry_sync') return t('settings_carrier_sync.sync_now')
  if (cta === 'open_review') return t('settings_carrier_sync.review.reload')
  return t('settings_carrier_sync.availability.cta.retry_health')
})

let unsubscribeMembership = null

function extractCarrierErrorCode(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const colonIndex = text.indexOf(':')
  if (colonIndex > 0) {
    const code = text.slice(0, colonIndex).trim()
    if (/^[a-z0-9_]+$/i.test(code)) return code
  }
  return ''
}

function refreshAvailability(extra = {}) {
  const lastError = String(syncConfig.value?.lastError ?? '').trim()
  availability.value = assessCarrierSyncAvailability({
    membershipTier: membershipTier.value,
    apiHealth: apiHealth.value,
    carrierPhone: carrierPhone.value,
    hasPassword: Boolean(carrierPassword.value.trim()),
    captchaRequired: showCaptchaDialog.value,
    lastSyncStatus: syncConfig.value?.lastSyncStatus ?? '',
    lastErrorCode: extractCarrierErrorCode(lastError) || (lastError ? 'einvoice_query_failed' : ''),
    pendingCount: pendingRows.value.length,
    ...extra,
  })
}

async function probeHealth() {
  apiHealth.value = await refreshCarrierApiHealthProbe()
  refreshAvailability()
  return apiHealth.value
}

function handleRecoveryCta() {
  const cta = availability.value?.recoveryCta
  if (cta === 'retry_health') {
    void probeHealth()
    return
  }
  if (cta === 'enter_credentials') {
    document.querySelector('.field-input')?.focus?.()
    return
  }
  if (cta === 'enter_captcha' || cta === 'retry_sync') {
    void handleSyncNow()
    return
  }
  if (cta === 'open_review') {
    void reloadPending()
  }
}

function clearCaptchaExpireTimer() {
  if (captchaExpireTimer) {
    clearTimeout(captchaExpireTimer)
    captchaExpireTimer = null
  }
}

function armCaptchaExpireTimer() {
  clearCaptchaExpireTimer()
  captchaOpenedAt.value = Date.now()
  captchaExpired.value = false
  captchaExpireTimer = setTimeout(() => {
    captchaExpired.value = true
  }, CAPTCHA_TTL_MS)
}

async function loadCredential() {
  const saved = await loadEInvoiceCredential()
  if (!saved) return
  if (!isValidCarrierPhone(saved.carrierBarcode)) {
    carrierPhone.value = ''
    carrierPassword.value = ''
    rememberCredentials.value = false
    syncMessage.value = t('settings_carrier_sync.legacy_credentials_reenter')
    return
  }
  carrierPhone.value = saved.carrierBarcode
  carrierPassword.value = saved.verificationCode
  rememberCredentials.value = true
}

async function reloadState() {
  reviewLoading.value = true
  try {
    const state = await getCarrierSyncState()
    syncConfig.value = state.config
    pendingRows.value = state.pending
    if (state.config) {
      autoSyncEnabled.value = state.config.autoSyncEnabled
      lookbackDays.value = state.config.lookbackDays
      defaultAccountId.value = state.config.defaultAccountId || NONE_OPTION
      defaultCategoryId.value = state.config.defaultCategoryId || NONE_OPTION
    }
    refreshAvailability()
  } finally {
    reviewLoading.value = false
  }
}

async function saveConfig() {
  await saveCarrierSyncConfig({
    ledgerId: ledgerStore.activeLedgerId,
    autoSyncEnabled: autoSyncEnabled.value,
    lookbackDays: lookbackDays.value,
    defaultAccountId: defaultAccountId.value === NONE_OPTION ? null : (defaultAccountId.value || null),
    defaultCategoryId: defaultCategoryId.value === NONE_OPTION ? null : (defaultCategoryId.value || null),
  })
}

async function persistCredentialIfNeeded() {
  if (!rememberCredentials.value) return
  await saveEInvoiceCredential(
    normalizeCarrierPhone(carrierPhone.value),
    carrierPassword.value,
  )
}

async function handleSyncNow() {
  if (!canSync.value || syncing.value) return
  syncing.value = true
  syncMessage.value = ''
  try {
    await persistCredentialIfNeeded()
    const result = await syncCarrierInvoicesNow({
      carrierBarcode: normalizeCarrierPhone(carrierPhone.value),
      verificationCode: carrierPassword.value,
      ledgerId: ledgerStore.activeLedgerId,
    })
    syncMessage.value = t('settings_carrier_sync.sync_result', {
      fetched: result.fetchedCount,
      pending: result.newPendingCount,
    })
    pendingRows.value = result.pending
    await reloadState()
    if (result.newPendingCount > 0) {
      uiStore.pushToast(t('settings_carrier_sync.toast.new_pending', { count: result.newPendingCount }))
    }
  } catch (error) {
    if (error?.code === 'einvoice_captcha_required') {
      captchaSessionId.value = error.sessionId ?? ''
      captchaImageSrc.value = error.captchaImageBase64
        ? `data:image/png;base64,${error.captchaImageBase64}`
        : ''
      captchaCode.value = ''
      showCaptchaDialog.value = true
      armCaptchaExpireTimer()
      refreshAvailability({ captchaRequired: true })
      return
    }
    syncMessage.value = error?.message || t('settings_carrier_sync.sync_failed')
    uiStore.pushToast(syncMessage.value, 'error')
    refreshAvailability({ lastErrorCode: String(error?.code ?? 'einvoice_query_failed') })
  } finally {
    syncing.value = false
  }
}

async function refreshCaptchaImage() {
  if (captchaRefreshing.value) return
  captchaRefreshing.value = true
  try {
    const previousSessionId = captchaSessionId.value
    const refreshed = await refreshCarrierCaptchaSession({
      carrierBarcode: normalizeCarrierPhone(carrierPhone.value),
      verificationCode: carrierPassword.value,
      previousSessionId,
    })
    captchaSessionId.value = refreshed.sessionId
    captchaImageSrc.value = refreshed.captchaImageBase64
      ? `data:image/png;base64,${refreshed.captchaImageBase64}`
      : ''
    captchaCode.value = ''
    armCaptchaExpireTimer()
    refreshAvailability({ captchaRequired: true })
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_carrier_sync.captcha.refresh_failed'), 'error')
  } finally {
    captchaRefreshing.value = false
  }
}

async function submitCaptchaAndSync() {
  const submittedSessionId = captchaSessionId.value
  showCaptchaDialog.value = false
  captchaExpired.value = false
  clearCaptchaExpireTimer()
  syncing.value = true
  try {
    const result = await syncCarrierInvoicesNow({
      carrierBarcode: normalizeCarrierPhone(carrierPhone.value),
      verificationCode: carrierPassword.value,
      captchaCode: captchaCode.value,
      sessionId: submittedSessionId,
      ledgerId: ledgerStore.activeLedgerId,
    })
    captchaCode.value = ''
    captchaImageSrc.value = ''
    captchaSessionId.value = ''
    pendingRows.value = result.pending
    await reloadState()
    uiStore.pushToast(t('settings_carrier_sync.toast.synced'))
  } catch (error) {
    if (submittedSessionId) {
      await cancelCarrierSyncSession(submittedSessionId).catch(() => null)
    }
    captchaImageSrc.value = ''
    captchaSessionId.value = ''
    uiStore.pushToast(error?.message || t('settings_carrier_sync.sync_failed'), 'error')
    refreshAvailability({ lastErrorCode: String(error?.code ?? 'einvoice_query_failed') })
  } finally {
    syncing.value = false
  }
}

async function closeCaptchaDialog() {
  const sessionId = captchaSessionId.value
  showCaptchaDialog.value = false
  captchaCode.value = ''
  captchaImageSrc.value = ''
  captchaSessionId.value = ''
  captchaExpired.value = false
  clearCaptchaExpireTimer()
  refreshAvailability({ captchaRequired: false })
  if (sessionId) {
    await cancelCarrierSyncSession(sessionId).catch(() => null)
  }
}

async function handleImportSelected() {
  if (!selectedIds.value.length || importing.value) return
  importing.value = true
  try {
    const result = await importPendingCarrierInvoices({
      invoiceNumbers: [...selectedIds.value],
      ledgerId: ledgerStore.activeLedgerId,
      accountId: defaultAccountId.value || undefined,
      categoryId: defaultCategoryId.value || undefined,
    })
    selectedIds.value = []
    await reloadState()
    uiStore.pushToast(t('settings_carrier_sync.toast.imported', { count: result.imported.length }))
  } catch (error) {
    uiStore.pushToast(error?.message || t('einvoice.error.import_failed'), 'error')
  } finally {
    importing.value = false
  }
}

async function handleDismissSelected() {
  if (!selectedIds.value.length) return
  await dismissPendingCarrierInvoices([...selectedIds.value])
  selectedIds.value = []
  await reloadState()
}

async function handleClearCredential() {
  await clearEInvoiceCredential()
  carrierPhone.value = ''
  carrierPassword.value = ''
  rememberCredentials.value = false
  uiStore.pushToast(t('einvoice.step1.clear_saved_done'))
}

function selectAll() {
  selectedIds.value = pendingRows.value.map((row) => row.invoiceNumber)
}

function clearSelection() {
  selectedIds.value = []
}

function reloadPending() {
  return reloadState()
}

function formatAmount(amount) {
  return Number(amount).toLocaleString('zh-TW')
}

function formatDate(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleDateString('zh-TW')
}

function formatDateTime(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleString('zh-TW')
}

function syncStatusText(status) {
  const normalized = String(status ?? 'idle')
  if (normalized === 'ok') return t('settings_carrier_sync.status.ok')
  if (normalized === 'error') return t('settings_carrier_sync.status.error')
  if (normalized === 'captcha_required') return t('settings_carrier_sync.status.captcha_required')
  return t('settings_carrier_sync.status.idle')
}

onMounted(async () => {
  unsubscribeMembership = subscribeMembershipSnapshot((snapshot) => {
    membershipTier.value = snapshot.tier
    refreshAvailability()
  })
  await accountStore.load()
  await categoryStore.load()
  await loadCredential()
  await reloadState()
  await saveConfig()
  await probeHealth()
  try {
    if (localStorage.getItem('straw.playwright.hooks') === '1') {
      window.__SMB_PLAYWRIGHT_CARRIER_SYNC__ = {
        setPendingRows(rows = []) {
          pendingRows.value = Array.isArray(rows) ? rows : []
          refreshAvailability({ pendingCount: pendingRows.value.length })
          return pendingRows.value.length
        },
        getAvailability() {
          return availability.value
        },
      }
    }
  } catch {
    // ignore storage access failures
  }
})

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') unsubscribeMembership()
  clearCaptchaExpireTimer()
  try {
    if (window.__SMB_PLAYWRIGHT_CARRIER_SYNC__) delete window.__SMB_PLAYWRIGHT_CARRIER_SYNC__
  } catch {
    // ignore
  }
  const sessionId = captchaSessionId.value
  captchaSessionId.value = ''
  if (sessionId) {
    void cancelCarrierSyncSession(sessionId).catch(() => null)
  }
})
</script>

<style scoped>
.page-head { align-items: center; justify-content: space-between; }
.page-title { display: flex; align-items: center; gap: 8px; margin: 0; }
.title-icon { color: var(--primary); }
.panel { padding: 14px; }
.member-only-lock { display: grid; gap: 8px; }
.compact { margin: 0; }
.warning-text { color: var(--warning, #f59e0b); }
.disclaimer-text { margin-top: 8px; }
.field-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.field-input {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--input-bg);
  color: var(--text);
}
.field-input-select { width: 100%; }
.mt { margin-top: 12px; }
.remember-row { display: flex; align-items: center; gap: 8px; }
.link-btn {
  margin-top: 10px;
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  padding: 0;
}
.meta-list { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
.action-row { margin-top: 12px; }
.review-head { align-items: center; justify-content: space-between; }
.review-action-row { gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.review-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.review-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
.review-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.review-copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
.review-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.carrier-chip {
  font-size: 10px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  border-radius: 999px;
  padding: 2px 8px;
}
.amount { color: var(--primary); }
.captcha-panel { display: grid; gap: 10px; margin-top: 8px; }
.captcha-image { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; }
.captcha-actions { gap: 8px; }
.availability-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}
.availability-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 10px;
  align-items: center;
}
.availability-label {
  color: var(--muted, #6b7280);
  font-size: 13px;
}
.status-ok { color: var(--success, #059669); }
.status-blocked { color: var(--warning, #d97706); }
.error-code {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--muted, #6b7280);
}
</style>
