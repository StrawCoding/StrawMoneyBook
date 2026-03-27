<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ reauthMode ? t('invoice_carrier.create.reauth_title', '重新驗證發票載具') : t('invoice_carrier.create.title', '新增發票載具') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="featureEnabled && !apiReady" class="card panel">
      <p class="muted">{{ apiUnavailableMessage }}</p>
    </article>

    <article v-else-if="featureEnabled" class="card panel form-panel">
      <p class="muted">{{ t('invoice_carrier.create.desc', '目前僅支援 Android App 內的電子發票手機條碼登入。圖形驗證碼辨識、登入與同步都會在 App 內自動完成。') }}</p>

      <label class="field">
        {{ t('invoice_carrier.create.mobile_phone', '手機號碼') }}
        <input v-model.trim="form.mobilePhone" class="input" type="text" inputmode="numeric" maxlength="10" />
      </label>

      <label class="field">
        {{ t('invoice_carrier.create.password', '驗證碼(密碼)') }}
        <input v-model="form.password" class="input" type="password" maxlength="16" />
      </label>

      <article v-if="progressText" class="progress-panel">
        <strong>{{ progressText }}</strong>
        <small class="muted">{{ t('invoice_carrier.create.progress_hint', '請保持 App 在前景，系統會自動處理驗證碼與登入流程。') }}</small>
      </article>

      <div class="row action-row">
        <button class="btn primary" :disabled="!canSubmit || submitting" :aria-busy="submitting" @click="submit">
          {{ submitting ? t('invoice_carrier.create.submitting', '登入並同步中...') : t('invoice_carrier.create.submit', '登入並開始同步') }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  connectInvoiceCarrier,
  getInvoiceCarrierCredentialDraft,
} from '@/ui/services/einvoice-carrier.service'
import {
  getEinvoiceCarrierApiUnavailableMessage,
  isEinvoiceCarrierApiConfigured,
  isEinvoiceCarrierFeatureEnabled,
} from '@/services/einvoice-carrier/backend'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const featureEnabled = isEinvoiceCarrierFeatureEnabled()
const apiReady = isEinvoiceCarrierApiConfigured()
const apiUnavailableMessage = getEinvoiceCarrierApiUnavailableMessage()
const submitting = ref(false)
const progressText = ref('')
const form = reactive({
  mobilePhone: '',
  password: '',
})

const connectionId = computed(() => String(route.query.connectionId ?? '').trim())
const reauthMode = computed(() => Boolean(connectionId.value))
const canSubmit = computed(() => (
  Boolean(ledgerStore.activeLedgerId && form.mobilePhone && form.password)
))
const backLink = computed(() => {
  return reauthMode.value
    ? { name: 'invoice-carriers-detail', params: { id: connectionId.value } }
    : { name: 'invoice-carriers' }
})

async function loadSavedCredentialDraft() {
  if (!ledgerStore.activeLedgerId || !connectionId.value) return
  try {
    const draft = await getInvoiceCarrierCredentialDraft(ledgerStore.activeLedgerId, connectionId.value)
    if (!draft) return
    form.mobilePhone = draft.mobilePhone || form.mobilePhone
    form.password = draft.password || form.password
  } catch {
    // Ignore missing saved draft.
  }
}

function resolveCreateErrorMessage(error) {
  if (error?.code === 'einvoice_api_unavailable') return apiUnavailableMessage

  const code = String(error?.code ?? '').trim()
  const rawMessage = String(error?.message ?? '').trim()
  const mappedByCode = {
    einvoice_captcha_ocr_failed: t('invoice_carrier.create.error.captcha_ocr_failed', '圖形驗證碼辨識失敗，請稍後再試'),
    einvoice_login_failed: t('invoice_carrier.create.error.login_failed', '發票載具登入失敗，請確認手機號碼與驗證碼(密碼)'),
    einvoice_password_change_required: t('invoice_carrier.create.error.password_change_required', '發票載具驗證碼(密碼)已逾期，請先到電子發票平台更改後再重新登入'),
    einvoice_query_failed: t('invoice_carrier.create.error.query_failed', '登入成功，但暫時無法讀取發票查詢頁'),
    einvoice_session_expired: t('invoice_carrier.create.error.session_expired', '登入 Session 已失效，請重新驗證'),
    einvoice_automation_busy: t('invoice_carrier.create.error.busy', '目前已有一個發票載具流程在執行中，請稍後再試'),
    einvoice_automation_timeout: t('invoice_carrier.create.error.timeout', '發票載具流程逾時，請稍後再試'),
    einvoice_automation_unavailable: t('invoice_carrier.create.error.unavailable', '目前無法啟動 App 內的發票載具流程，請稍後再試'),
    einvoice_automation_android_only: t('invoice_carrier.create.error.android_only', '發票載具同步目前僅支援 Android App'),
  }
  return mappedByCode[code] || rawMessage || t('invoice_carrier.create.error.generic', '發票載具登入失敗')
}

function startSubmitProgress() {
  progressText.value = t('invoice_carrier.create.progress.recognizing_captcha', '圖形驗證碼辨識中...')
  const timers = [
    window.setTimeout(() => {
      progressText.value = t('invoice_carrier.create.progress.logging_in', '登入中...')
    }, 900),
    window.setTimeout(() => {
      progressText.value = t('invoice_carrier.create.progress.loading_carriers', '讀取載具清單中...')
    }, 2400),
  ]

  return () => {
    timers.forEach((timerId) => window.clearTimeout(timerId))
    progressText.value = ''
  }
}

async function submit() {
  if (!ledgerStore.activeLedgerId) return
  submitting.value = true
  const stopProgress = startSubmitProgress()
  try {
    const connection = await connectInvoiceCarrier(ledgerStore.activeLedgerId, {
      provider: 'tw_einvoice_mobile_barcode',
      authMode: 'mobile_barcode',
      mobilePhone: form.mobilePhone,
      password: form.password,
    })
    uiStore.pushToast(t('invoice_carrier.toast.connected', '發票載具登入成功'))
    await router.replace({ name: 'invoice-carriers-detail', params: { id: connection.id } })
  } catch (error) {
    uiStore.pushToast(resolveCreateErrorMessage(error), 'error')
  } finally {
    stopProgress()
    submitting.value = false
  }
}

onMounted(async () => {
  if (!featureEnabled) {
    await router.replace({ name: 'features' })
    return
  }
  await loadSavedCredentialDraft()
})
</script>

<style scoped>
.panel {
  padding: 14px;
}
.form-panel {
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 8px;
  font-weight: 700;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
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
