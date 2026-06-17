<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title">
        <font-awesome-icon icon="fa-solid fa-receipt" class="title-icon" />
        {{ t('settings_carrier_sync.title') }}
      </h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

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
        <select v-model="defaultAccountId" class="field-input" @change="saveConfig">
          <option value="">{{ t('settings_carrier_sync.no_default_account') }}</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
        </select>

        <label class="field-label mt">{{ t('settings_carrier_sync.default_category') }}</label>
        <select v-model="defaultCategoryId" class="field-input" @change="saveConfig">
          <option value="">{{ t('settings_carrier_sync.no_default_category') }}</option>
          <option v-for="category in expenseCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>

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

      <article class="card panel review-panel">
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
        <input v-model="captchaCode" class="field-input" :placeholder="t('settings_carrier_sync.captcha.placeholder')" />
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
  syncCarrierInvoicesNow,
} from '@/services/einvoice/carrier-sync.service.js'
import {
  clearEInvoiceCredential,
  loadEInvoiceCredential,
  saveEInvoiceCredential,
} from '@/services/einvoice/backend.js'
import { isEInvoiceApiConfigured } from '@/services/einvoice/scrape-api.js'
import { isValidCarrierPhone, normalizeCarrierPhone } from '@/services/einvoice/shared.js'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()

const membershipTier = ref(getMembershipTierSnapshot())
const hasCarrierAccess = computed(() => hasCarrierSyncMembershipAccess(membershipTier.value))
const apiReady = computed(() => isEInvoiceApiConfigured())
const apiMessage = computed(() => t('settings_carrier_sync.api_unavailable'))

const carrierPhone = ref('')
const carrierPassword = ref('')
const rememberCredentials = ref(true)
const autoSyncEnabled = ref(false)
const lookbackDays = ref(7)
const defaultAccountId = ref('')
const defaultCategoryId = ref('')
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

const accounts = computed(() => accountStore.accounts ?? [])
const expenseCategories = computed(() => categoryStore.expenseCategories ?? [])
const canSync = computed(() => apiReady.value && isValidCarrierPhone(carrierPhone.value) && carrierPassword.value.trim().length >= 4)

let unsubscribeMembership = null

async function loadCredential() {
  const saved = await loadEInvoiceCredential()
  if (!saved) return
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
      defaultAccountId.value = state.config.defaultAccountId ?? ''
      defaultCategoryId.value = state.config.defaultCategoryId ?? ''
    }
  } finally {
    reviewLoading.value = false
  }
}

async function saveConfig() {
  await saveCarrierSyncConfig({
    ledgerId: ledgerStore.activeLedgerId,
    autoSyncEnabled: autoSyncEnabled.value,
    lookbackDays: lookbackDays.value,
    defaultAccountId: defaultAccountId.value || null,
    defaultCategoryId: defaultCategoryId.value || null,
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
      showCaptchaDialog.value = true
      return
    }
    syncMessage.value = error?.message || t('settings_carrier_sync.sync_failed')
    uiStore.pushToast(syncMessage.value, 'error')
  } finally {
    syncing.value = false
  }
}

async function submitCaptchaAndSync() {
  showCaptchaDialog.value = false
  syncing.value = true
  try {
    const result = await syncCarrierInvoicesNow({
      carrierBarcode: normalizeCarrierPhone(carrierPhone.value),
      verificationCode: carrierPassword.value,
      captchaCode: captchaCode.value,
      sessionId: captchaSessionId.value,
      ledgerId: ledgerStore.activeLedgerId,
    })
    captchaCode.value = ''
    pendingRows.value = result.pending
    await reloadState()
    uiStore.pushToast(t('settings_carrier_sync.toast.synced'))
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_carrier_sync.sync_failed'), 'error')
  } finally {
    syncing.value = false
  }
}

function closeCaptchaDialog() {
  showCaptchaDialog.value = false
  captchaCode.value = ''
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
  })
  await accountStore.load()
  await categoryStore.load()
  await loadCredential()
  await reloadState()
  await saveConfig()
})

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') unsubscribeMembership()
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
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--card);
}
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
</style>
