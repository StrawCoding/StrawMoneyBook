<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_bank_sync_create.title') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!bankSyncApiReady" class="card panel warning-panel">
      <h3>{{ t('settings_bank_sync_create.api_unavailable_title') }}</h3>
      <p class="muted">{{ bankSyncApiMessage }}</p>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('settings_bank_sync_create.form_title') }}</h3>
        <button class="btn primary" :disabled="!canSubmit || submitting || !bankSyncApiReady" @click="submit">
          {{ submitting ? t('settings_bank_sync_create.creating') : t('settings_bank_sync_create.create') }}
        </button>
      </header>

      <label class="field">
        {{ t('settings_bank_sync_create.bank_provider') }}
        <CustomSelect v-model="form.providerId" :options="providerOptions" />
      </label>

      <p v-if="isMockProviderSelected" class="muted hint-block">
        {{ t('settings_bank_sync_create.mock_hint') }}
      </p>

      <template v-if="isFirstBankSelected">
        <p class="muted hint-block">
          {{ t('settings_bank_sync_create.first_bank_hint') }}
        </p>

        <label class="field">
          {{ t('settings_bank_sync_create.initial_sync_start_date') }}
          <input v-model="form.initialSyncStartDate" class="input" type="date" />
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

        <article v-if="progressText" class="progress-panel">
          <strong>{{ progressText }}</strong>
          <small class="muted">{{ t('settings_bank_sync_create.discovery_hint') }}</small>
        </article>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { connectBankProvider, getBankProviderOptions } from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage, isBankSyncApiConfigured } from '@/services/bank-sync/backend'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()
const bankSyncApiReady = isBankSyncApiConfigured()
const bankSyncApiMessage = computed(() => getBankSyncApiUnavailableMessage())

const submitting = ref(false)
const progressText = ref('')

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
})

const backLink = { name: 'settings-bank-sync' }
const providerOptions = computed(() => {
  return getBankProviderOptions().map((item) => ({
    value: item.id,
    label: item.country ? `${item.name} (${item.country})` : item.name,
  }))
})
const isMockProviderSelected = computed(() => {
  return String(form.providerId ?? '').trim().toLowerCase() === 'mock_bank_tw'
    || String(form.providerId ?? '').trim().toLowerCase() === 'mock'
})
const isFirstBankSelected = computed(() => {
  return String(form.providerId ?? '').trim().toLowerCase() === 'first_bank_tw'
})
const canSubmit = computed(() => {
  if (!ledgerStore.activeLedgerId || !String(form.providerId ?? '').trim()) return false
  if (!isFirstBankSelected.value) return true
  return Boolean(
    String(form.initialSyncStartDate ?? '').trim()
    && String(form.nationalId ?? '').trim()
    && String(form.repeatSeq ?? '').trim()
    && String(form.code ?? '').trim()
    && String(form.password ?? '').trim(),
  )
})

onMounted(() => {
  if (!form.providerId) {
    form.providerId = providerOptions.value[0]?.value ?? ''
  }
})

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

async function submit() {
  if (!bankSyncApiReady) {
    uiStore.pushToast(bankSyncApiMessage.value, 'error')
    return
  }
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  const stopProgress = isFirstBankSelected.value ? startSubmitProgress() : () => {}
  try {
    const connection = await connectBankProvider(ledgerStore.activeLedgerId, form.providerId, {
      initialSyncStartDate: form.initialSyncStartDate,
      nationalId: form.nationalId,
      repeatSeq: form.repeatSeq,
      code: form.code,
      password: form.password,
    })

    uiStore.pushToast(t('settings_bank_sync_create.toast.created'))
    await router.push({
      name: 'settings-bank-sync',
      query: {
        focusConnectionId: connection.id,
      },
    })
  } catch (error) {
    uiStore.pushToast(resolveCreateErrorMessage(error, 'settings_bank_sync_create.toast.create_failed'), 'error')
  } finally {
    stopProgress()
    submitting.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.warning-panel {
  gap: 8px;
}

.page-head,
.panel-head {
  align-items: center;
  justify-content: space-between;
}

h2,
h3 {
  margin: 0;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.hint-block {
  margin: 0;
}

.progress-panel {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  padding: 12px;
  display: grid;
  gap: 6px;
}
</style>
