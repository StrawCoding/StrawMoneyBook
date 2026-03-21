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
      <p class="muted">{{ t('invoice_carrier.create.desc', '目前 v1 僅支援電子發票手機條碼登入。登入成功後會保存加密 Session，之後 App 開啟時自動同步。') }}</p>

      <label class="field">
        {{ t('invoice_carrier.create.mobile_phone', '手機號碼') }}
        <input v-model.trim="form.mobilePhone" class="input" type="text" inputmode="numeric" maxlength="10" />
      </label>

      <label class="field">
        {{ t('invoice_carrier.create.password', '驗證碼(密碼)') }}
        <input v-model="form.password" class="input" type="password" maxlength="16" />
      </label>

      <label class="field">
        {{ t('invoice_carrier.create.captcha', '圖形驗證碼') }}
        <input v-model.trim="form.captchaCode" class="input" type="text" inputmode="numeric" maxlength="8" />
      </label>

      <div class="captcha-box">
        <img v-if="captchaDataUrl" :src="captchaDataUrl" alt="captcha" class="captcha-image" />
        <div v-else class="captcha-placeholder muted">{{ t('invoice_carrier.create.captcha_loading', '驗證碼載入中') }}</div>
      </div>

      <div class="row action-row">
        <button class="btn" :disabled="loadingCaptcha" :aria-busy="loadingCaptcha" @click="loadCaptcha(true)">
          {{ loadingCaptcha ? t('common.loading', '載入中...') : t('invoice_carrier.create.refresh_captcha', '更新驗證碼') }}
        </button>
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
  createInvoiceCarrierLinkSession,
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
const loadingCaptcha = ref(false)
const submitting = ref(false)
const sessionId = ref('')
const captchaDataUrl = ref('')
const form = reactive({
  mobilePhone: '',
  password: '',
  captchaCode: '',
})

const connectionId = computed(() => String(route.query.connectionId ?? '').trim())
const reauthMode = computed(() => Boolean(connectionId.value))
const canSubmit = computed(() => (
  Boolean(form.mobilePhone && form.password && form.captchaCode && sessionId.value)
))
const backLink = computed(() => {
  return reauthMode.value
    ? { name: 'invoice-carriers-detail', params: { id: connectionId.value } }
    : { name: 'invoice-carriers' }
})

async function loadCaptcha(refresh = false) {
  loadingCaptcha.value = true
  try {
    const session = await createInvoiceCarrierLinkSession({
      provider: 'tw_einvoice_mobile_barcode',
      sessionId: refresh ? sessionId.value : '',
      refreshCaptcha: refresh && Boolean(sessionId.value),
    })
    sessionId.value = String(session.session_id ?? '')
    captchaDataUrl.value = String(session.captcha_image_data_url ?? '')
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '載入驗證碼失敗'), 'error')
  } finally {
    loadingCaptcha.value = false
  }
}

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

async function submit() {
  if (!ledgerStore.activeLedgerId) return
  submitting.value = true
  try {
    const connection = await connectInvoiceCarrier(ledgerStore.activeLedgerId, {
      provider: 'tw_einvoice_mobile_barcode',
      authMode: 'mobile_barcode',
      sessionId: sessionId.value,
      mobilePhone: form.mobilePhone,
      password: form.password,
      captchaCode: form.captchaCode,
    })
    uiStore.pushToast(t('invoice_carrier.toast.connected', '發票載具登入成功'))
    await router.replace({ name: 'invoice-carriers-detail', params: { id: connection.id } })
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '發票載具登入失敗'), 'error')
    form.captchaCode = ''
    await loadCaptcha(true)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!featureEnabled) {
    await router.replace({ name: 'features' })
    return
  }
  await loadSavedCredentialDraft()
  if (apiReady) {
    await loadCaptcha(false)
  }
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
.captcha-box {
  min-height: 56px;
  display: flex;
  align-items: center;
}
.captcha-image {
  max-width: 240px;
  border-radius: 10px;
  border: 1px solid var(--field-border);
}
.captcha-placeholder {
  padding: 12px;
  border: 1px dashed var(--field-border);
  border-radius: 10px;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
}
</style>
