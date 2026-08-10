<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-building-columns" class="title-icon" />{{ t('settings_bank_sync_create.title') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!bankSyncApiReady" class="card panel warning-panel">
      <h3>{{ t('settings_bank_sync_create.api_unavailable_title') }}</h3>
      <p class="muted">{{ bankSyncApiMessage }}</p>
    </article>

    <article v-else-if="!hasBankSyncMembershipAccess" class="card panel warning-panel">
      <h3>{{ t('settings_bank_sync.member_only', '銀行同步僅限會員使用') }}</h3>
      <p class="muted">{{ t('settings_bank_sync.member_only_desc', '免費版可查看功能介紹，但建立連線、同步與匯入銀行交易都需要會員資格。') }}</p>
      <RouterLink class="btn" to="/settings/membership-benefits">
        {{ t('settings_bank_sync.view_membership', '查看會員權益') }}
      </RouterLink>
    </article>

    <template v-else>
      <article class="card panel wizard-head">
        <div class="step-indicator">
          <span
            v-for="step in 4"
            :key="step"
            class="step-dot"
            :class="{ active: currentStep === step, done: currentStep > step }"
          />
        </div>
        <h3>{{ stepTitle }}</h3>
      </article>

      <article v-if="currentStep === 1" class="card panel">
        <p class="muted">{{ t('settings_bank_sync.platform_hint') }}</p>
        <div v-for="provider in providerOptions" :key="provider.value" class="provider-card selected">
          <strong>{{ provider.label }}</strong>
        </div>
        <p class="muted coming-soon">{{ t('settings_bank_sync_create.wizard.coming_soon') }}</p>
        <div class="row action-row">
          <button class="btn primary" @click="goToStep(2)">{{ t('settings_bank_sync_create.wizard.next') }}</button>
        </div>
      </article>

      <article v-else-if="currentStep === 2" class="card panel">
        <p class="muted hint-block">{{ t('settings_bank_sync_create.first_bank_hint') }}</p>

        <label class="field">
          {{ t('settings_bank_sync_create.initial_sync_start_date') }}
          <DateTimePickerField
            :date="form.initialSyncStartDate"
            :hour="pickerHour"
            :minute="pickerMinute"
            @update:date="form.initialSyncStartDate = $event"
            @update:hour="pickerHour = $event"
            @update:minute="pickerMinute = $event"
          />
          <small class="muted">{{ t('settings_bank_sync_create.initial_sync_start_date_hint') }}</small>
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.national_id') }}
          <input v-model.trim="form.nationalId" class="input" type="text" maxlength="12" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.repeat_seq') }}
          <input v-model.trim="form.repeatSeq" class="input" type="text" inputmode="numeric" maxlength="4" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.user_code') }}
          <input v-model.trim="form.code" class="input" type="text" maxlength="20" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.password') }}
          <input v-model="form.password" class="input" type="password" maxlength="40" />
        </label>

        <article v-if="showCaptchaPanel" class="captcha-panel">
          <label class="field">
            {{ t('settings_bank_sync_create.captcha_image') }}
            <img v-if="captchaImageSrc" :src="captchaImageSrc" alt="captcha" class="captcha-image" />
            <p v-else class="muted">{{ t('settings_bank_sync_create.captcha.empty') }}</p>
          </label>
          <label class="field">
            {{ t('settings_bank_sync_create.captcha_code') }}
            <input v-model.trim="form.captchaCode" class="input" type="text" maxlength="4" inputmode="text" autocomplete="one-time-code" />
          </label>
          <p class="muted">{{ t('settings_bank_sync_create.error.first_bank_captcha_manual_required') }}</p>
        </article>

        <article v-if="progressText" class="progress-panel">
          <strong>{{ progressText }}</strong>
          <small class="muted">{{ t('settings_bank_sync_create.discovery_hint') }}</small>
        </article>

        <div class="row action-row">
          <button class="btn" :disabled="submitting" @click="goToStep(1)">{{ t('settings_bank_sync_create.wizard.back') }}</button>
          <button class="btn primary" :disabled="!canSubmitLogin || submitting" @click="submitLogin">
            {{ submitting ? t('settings_bank_sync_create.creating') : t('settings_bank_sync_create.wizard.next') }}
          </button>
        </div>
      </article>

      <article v-else-if="currentStep === 3" class="card panel">
        <p class="muted">{{ t('settings_bank_sync.account_sync.desc') }}</p>
        <div v-for="account in accountDrafts" :key="account.id" class="account-row">
          <label class="check-row account-enable">
            <input v-model="account.enabledBool" type="checkbox" />
            <span>{{ account.account_name }}（{{ account.account_mask || '-' }}）</span>
          </label>
          <label class="field">
            {{ t('settings_bank_sync.account_sync.target_account') }}
            <CustomSelect v-model="account.mappedAccountIdDraft" :groups="ledgerAccountGroups" :placeholder="t('settings_bank_sync.account_sync.choose_account')" />
          </label>
          <label class="field">
            {{ t('settings_bank_sync.account_sync.display_name') }}
            <input v-model.trim="account.userLabelDraft" class="input" type="text" :placeholder="t('settings_bank_sync.account_sync.display_name_placeholder')" />
          </label>
        </div>
        <div class="row action-row">
          <button class="btn" :disabled="savingAccounts" @click="goToStep(2)">{{ t('settings_bank_sync_create.wizard.back') }}</button>
          <button class="btn primary" :disabled="!canSaveAccounts || savingAccounts" @click="saveAccountsAndContinue">
            {{ savingAccounts ? t('settings_bank_sync.common.saving') : t('settings_bank_sync_create.wizard.next') }}
          </button>
        </div>
      </article>

      <article v-else-if="currentStep === 4" class="card panel">
        <p class="muted">{{ t('settings_bank_sync_create.wizard.syncing_first') }}</p>
        <article v-if="progressText" class="progress-panel">
          <strong>{{ progressText }}</strong>
        </article>
      </article>
    </template>

    <AppDialog
      :open="confirmDialogOpen"
      :title="t('settings_bank_sync_create.confirm.title', '確認新增銀行連線')"
      :message="confirmMessage"
      :confirm-text="t('settings_bank_sync_create.create')"
      :loading="submitting"
      @close="confirmDialogOpen = false"
      @confirm="confirmSubmitLogin"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { withLeadingAccountOption } from '@/ui/utils/account-option-groups'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { getMembershipTierSnapshot, hasBankSyncMembershipAccess as hasBankSyncMembershipAccessForTier, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import {
  connectBankProvider,
  getBankProviderOptions,
  saveBankAccountsSettings,
  syncBankConnectionNow,
} from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage, isBankSyncApiConfigured } from '@/services/bank-sync/backend'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()
const bankSyncApiReady = isBankSyncApiConfigured()
const bankSyncApiMessage = computed(() => getBankSyncApiUnavailableMessage())

const currentStep = ref(1)
const submitting = ref(false)
const savingAccounts = ref(false)
const progressText = ref('')
const confirmDialogOpen = ref(false)
const showCaptchaPanel = ref(false)
const captchaImageSrc = ref('')
const pickerHour = ref(0)
const pickerMinute = ref(0)
const membershipTier = ref(getMembershipTierSnapshot())
const createdConnection = ref(null)
const accountDrafts = ref([])

function defaultInitialSyncStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const form = reactive({
  providerId: '',
  initialSyncStartDate: defaultInitialSyncStartDate(),
  nationalId: '',
  repeatSeq: '0',
  code: '',
  password: '',
  captchaCode: '',
})

const backLink = { name: 'settings-bank-sync' }
const providerOptions = computed(() => {
  return getBankProviderOptions().map((item) => ({
    value: item.id,
    label: item.country ? `${item.name} (${item.country})` : item.name,
  }))
})
const hasBankSyncMembershipAccess = computed(() => hasBankSyncMembershipAccessForTier(membershipTier.value))
const stepTitle = computed(() => {
  const titles = {
    1: t('settings_bank_sync_create.wizard.step1_title'),
    2: t('settings_bank_sync_create.wizard.step2_title'),
    3: t('settings_bank_sync_create.wizard.step3_title'),
    4: t('settings_bank_sync_create.wizard.step4_title'),
  }
  return titles[currentStep.value] || ''
})
const canSubmitLogin = computed(() => {
  if (!ledgerStore.activeLedgerId || !String(form.providerId ?? '').trim()) return false
  return Boolean(
    String(form.initialSyncStartDate ?? '').trim()
    && String(form.nationalId ?? '').trim()
    && String(form.repeatSeq ?? '').trim()
    && String(form.code ?? '').trim()
    && String(form.password ?? '').trim(),
  )
})
const ledgerAccountGroups = computed(() => {
  return withLeadingAccountOption(
    accountStore.groupedRegularAccounts,
    {
      value: '__none__',
      label: t('settings_bank_sync.account_sync.no_target'),
    },
  )
})
const ledgerAccountOptions = computed(() => {
  return ledgerAccountGroups.value.flatMap((group) => group.options ?? [])
})
const canSaveAccounts = computed(() => {
  return accountDrafts.value.some((account) => {
    const mappedAccountId = String(account.mappedAccountIdDraft ?? '').trim()
    return account.enabledBool && mappedAccountId && mappedAccountId !== '__none__'
  })
})
const confirmMessage = computed(() => {
  const providerLabel = providerOptions.value.find((item) => item.value === form.providerId)?.label || form.providerId
  return t(
    'settings_bank_sync_create.confirm.first_bank_message',
    `確認要以 ${providerLabel} 建立銀行連線，並從 ${form.initialSyncStartDate} 開始同步嗎？`,
  )
})

onMounted(async () => {
  unsubscribeMembership = subscribeMembershipSnapshot((next) => {
    membershipTier.value = String(next?.tier ?? getMembershipTierSnapshot())
  }, { emitCurrent: true })
  if (!form.providerId) {
    form.providerId = providerOptions.value[0]?.value ?? ''
  }
  await accountStore.load()
})

let unsubscribeMembership = null

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') {
    unsubscribeMembership()
  }
})

function goToStep(step) {
  currentStep.value = step
}

function normalizeAccountDrafts(connection) {
  const accounts = Array.isArray(connection?.accounts) ? connection.accounts : []
  accountDrafts.value = accounts.map((account) => ({
    ...account,
    enabledBool: Boolean(Number(account?.enabled ?? 1)),
    mappedAccountIdDraft: String(account?.mapped_account_id ?? '__none__') || '__none__',
    userLabelDraft: String(account?.user_label ?? account?.account_name ?? ''),
  }))
}

function resolveCreateErrorMessage(error, fallbackKey) {
  if (error?.code === 'bank_sync_api_unavailable') return bankSyncApiMessage.value

  const code = String(error?.code ?? '').trim()
  const rawMessage = String(error?.message ?? '').trim()
  const mappedByCode = {
    first_bank_national_id_required: t('settings_bank_sync_create.error.first_bank_national_id_required'),
    first_bank_repeat_seq_required: t('settings_bank_sync_create.error.first_bank_repeat_seq_required'),
    first_bank_user_code_required: t('settings_bank_sync_create.error.first_bank_user_code_required'),
    first_bank_password_required: t('settings_bank_sync_create.error.first_bank_password_required'),
    first_bank_initial_start_date_required: t('settings_bank_sync_create.error.first_bank_initial_start_date_required'),
    first_bank_captcha_ocr_failed: t('settings_bank_sync_create.error.first_bank_captcha_ocr_failed'),
    first_bank_captcha_manual_required: t('settings_bank_sync_create.error.first_bank_captcha_manual_required'),
    first_bank_login_page_mismatch: t('settings_bank_sync_create.error.first_bank_login_page_mismatch'),
    first_bank_login_failed: t('settings_bank_sync_create.error.first_bank_login_failed'),
    first_bank_account_list_not_found: t('settings_bank_sync_create.error.first_bank_account_list_not_found'),
    first_bank_legacy_reconnect_required: t('settings_bank_sync_create.error.first_bank_legacy_reconnect_required'),
    bank_automation_busy: t('settings_bank_sync_create.error.bank_automation_busy'),
    bank_automation_timeout: t('settings_bank_sync_create.error.bank_automation_timeout'),
    bank_automation_android_only: t('settings_bank_sync_create.error.bank_automation_android_only'),
    bank_automation_unavailable: t('settings_bank_sync_create.error.bank_automation_unavailable'),
  }
  if (mappedByCode[code]) return mappedByCode[code]

  if (rawMessage === '第一銀行登入身分資料不完整') {
    return t('settings_bank_sync_create.error.first_bank_identity_required')
  }

  return rawMessage || t(fallbackKey)
}

function startSubmitProgress() {
  progressText.value = t('settings_bank_sync_create.progress.recognizing_captcha')
  const timers = [
    window.setTimeout(() => {
      progressText.value = t('settings_bank_sync_create.progress.logging_in')
    }, 900),
    window.setTimeout(() => {
      progressText.value = t('settings_bank_sync_create.progress.loading_accounts')
    }, 2400),
  ]

  return () => {
    timers.forEach((timerId) => window.clearTimeout(timerId))
    progressText.value = ''
  }
}

function submitLogin() {
  if (!bankSyncApiReady) {
    uiStore.pushToast(bankSyncApiMessage.value, 'error')
    return
  }
  if (!hasBankSyncMembershipAccess.value) {
    void router.push({ name: 'settings-membership-benefits', query: { from: 'bank_sync' } })
    return
  }
  if (!canSubmitLogin.value || submitting.value) return
  if (showCaptchaPanel.value && form.captchaCode.trim().length !== 4) {
    uiStore.pushToast(t('settings_bank_sync_create.error.first_bank_credentials_required'), 'error')
    return
  }
  confirmDialogOpen.value = true
}

async function confirmSubmitLogin() {
  if (!canSubmitLogin.value || submitting.value) return
  submitting.value = true
  const stopProgress = startSubmitProgress()
  try {
    const connection = await connectBankProvider(ledgerStore.activeLedgerId, form.providerId, {
      initialSyncStartDate: form.initialSyncStartDate,
      nationalId: form.nationalId,
      repeatSeq: form.repeatSeq,
      code: form.code,
      password: form.password,
      captchaCode: form.captchaCode,
    })

    createdConnection.value = connection
    normalizeAccountDrafts(connection)
    confirmDialogOpen.value = false
    showCaptchaPanel.value = false
    captchaImageSrc.value = ''
    form.captchaCode = ''
    uiStore.pushToast(t('settings_bank_sync_create.toast.created'))
    goToStep(3)
  } catch (error) {
    if (error?.code === 'first_bank_captcha_manual_required') {
      showCaptchaPanel.value = true
      captchaImageSrc.value = error.captchaImageBase64
        ? `data:image/png;base64,${error.captchaImageBase64}`
        : ''
      confirmDialogOpen.value = false
      uiStore.pushToast(resolveCreateErrorMessage(error, 'settings_bank_sync_create.error.first_bank_captcha_manual_required'), 'warning')
      return
    }
    uiStore.pushToast(resolveCreateErrorMessage(error, 'settings_bank_sync_create.toast.create_failed'), 'error')
  } finally {
    stopProgress()
    submitting.value = false
  }
}

async function saveAccountsAndContinue() {
  if (!createdConnection.value || !canSaveAccounts.value || savingAccounts.value) return
  savingAccounts.value = true
  try {
    await saveBankAccountsSettings(
      ledgerStore.activeLedgerId,
      accountDrafts.value.map((account) => ({
        bankAccountId: account.id,
        enabled: account.enabledBool,
        mappedAccountId: account.mappedAccountIdDraft === '__none__' ? null : account.mappedAccountIdDraft,
        userLabel: account.userLabelDraft,
      })),
    )
    goToStep(4)
    progressText.value = t('settings_bank_sync_create.progress.syncing_transactions')
    const result = await syncBankConnectionNow(ledgerStore.activeLedgerId, createdConnection.value.id)
    uiStore.pushToast(t('settings_bank_sync.toast.sync_done', { added: result.added.length, modified: result.modified.length }))
    await router.push({
      name: 'settings-bank-sync-connection',
      params: { id: createdConnection.value.id },
    })
  } catch (error) {
    uiStore.pushToast(resolveCreateErrorMessage(error, 'settings_bank_sync.toast.sync_failed'), 'error')
    goToStep(3)
  } finally {
    progressText.value = ''
    savingAccounts.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.warning-panel,
.wizard-head {
  gap: 8px;
}

.page-head {
  justify-content: space-between;
  align-items: center;
}

h2,
h3 {
  margin: 0;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.hint-block,
.coming-soon {
  margin: 0;
}

.progress-panel,
.provider-card {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  padding: 12px;
}

.provider-card.selected {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--line));
}

.step-indicator {
  display: flex;
  gap: 8px;
}

.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 30%, transparent);
}

.step-dot.active,
.step-dot.done {
  background: var(--primary);
}

.action-row {
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.account-row {
  display: grid;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}

.account-row:first-of-type {
  border-top: none;
  padding-top: 0;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.captcha-panel {
  border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, var(--line));
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.captcha-image {
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
}
</style>
