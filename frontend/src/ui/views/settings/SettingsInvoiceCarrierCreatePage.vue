<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ pageTitle }}</h2>
      <RouterLink class="btn back-btn" to="/settings/invoice-carrier">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel intro-panel">
      <div class="eyebrow">實驗性</div>
      <h3>{{ invoiceCarrierAutomationReady ? 'Android 端內全自動流程' : '此平台僅提供診斷與說明' }}</h3>
      <p class="muted">
        {{ invoiceCarrierAutomationReady
          ? 'App 會直接在原生 WebView 內完成登入、驗證碼辨識、查詢頁載入與憑證保存。手機號碼、密碼與狀態仍只會加密保存在本機 secure settings / native vault，不會同步到 Google Drive 或 shared-ledger snapshot。'
          : '電子發票載具目前正式支援 Android App。Web 版不會再假裝能開 headed browser 或要求手動輸入圖形驗證碼；此頁只會提供能力診斷與使用說明。' }}
      </p>
      <p class="muted">
        {{ reconnectMode
          ? '重新驗證會覆蓋本機保存的憑證與狀態，完成後即可再次自動同步。'
          : '建立成功後，後續同步會優先沿用本機保存的憑證與 cookie；若站點流程變動，系統會明確標示為需重新驗證或自動化受阻。' }}
      </p>
    </article>

    <article v-if="!invoiceCarrierAutomationReady || !invoiceCarrierLinkingSupported" class="card panel warning-panel">
      <h3>此平台暫不支援自動化新增載具</h3>
      <p class="muted">{{ invoiceCarrierApiMessage || invoiceCarrierLinkingMessage }}</p>
      <p class="muted">請改用 Android App 執行新增或重新驗證，Web 版可保留作為設定入口與診斷頁。</p>
    </article>

    <template v-else>
      <article class="card panel">
        <h3>{{ reconnectMode ? '重新驗證載具' : '新增載具' }}</h3>
        <p class="muted">
          請輸入手機號碼與電子發票登入密碼。系統會在 App 內自動完成登入與驗證碼處理，不需要再手動輸入圖形驗證碼。
        </p>

        <label class="field">
          <span>手機號碼</span>
          <input v-model.trim="mobilePhone" type="tel" placeholder="09xxxxxxxx" />
        </label>

        <label class="field">
          <span>密碼</span>
          <input v-model="password" type="password" placeholder="電子發票登入密碼" />
        </label>

        <div v-if="automationPhaseText || debugLastStep || debugHint" class="status-panel">
          <p v-if="automationPhaseText"><strong>目前狀態：</strong>{{ automationPhaseText }}</p>
          <p v-if="debugLastStep"><strong>最後步驟：</strong>{{ debugLastStep }}</p>
          <p v-if="debugHint" class="muted"><strong>診斷提示：</strong>{{ debugHint }}</p>
        </div>

        <div class="row action-row">
          <button class="btn primary" :disabled="!canSubmit || submitting" @click="submitAuth">
            {{ submitting ? (reconnectMode ? '重新驗證中...' : '建立連線中...') : (reconnectMode ? '開始重新驗證' : '開始新增載具') }}
          </button>
        </div>
      </article>

      <article v-if="successConnectionId" class="card panel success-panel">
        <h3>{{ reconnectMode ? '重新驗證完成' : '載具新增成功' }}</h3>
        <p class="muted">
          {{ reconnectMode ? '本機加密憑證與狀態已更新。' : '本機加密憑證與狀態已建立。' }}
        </p>
        <div class="row action-row">
          <RouterLink class="btn" to="/settings/invoice-carrier">返回列表</RouterLink>
          <RouterLink class="btn primary" :to="{ name: 'settings-invoice-carrier-connection', params: { id: successConnectionId } }">
            打開載具詳情
          </RouterLink>
        </div>
      </article>

      <article v-if="errorText" class="card panel error-panel">
        <strong>{{ errorText }}</strong>
      </article>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getInvoiceCarrierApiUnavailableMessage,
  getInvoiceCarrierLinkingUnavailableMessage,
  isInvoiceCarrierApiConfigured,
  isInvoiceCarrierLinkingSupported,
} from '@/services/invoice-carrier/backend'
import { normalizeText } from '@/services/invoice-carrier/shared'
import { connectInvoiceCarrier } from '@/ui/services/invoice-carrier.service'

const route = useRoute()
const ledgerStore = useLedgerStore()
const store = useInvoiceCarrierStore()
const uiStore = useUiStore()
const { t } = useI18n()

const invoiceCarrierAutomationReady = isInvoiceCarrierApiConfigured()
const invoiceCarrierApiMessage = computed(() => getInvoiceCarrierApiUnavailableMessage())
const invoiceCarrierLinkingSupported = isInvoiceCarrierLinkingSupported()
const invoiceCarrierLinkingMessage = computed(() => getInvoiceCarrierLinkingUnavailableMessage())
const reconnectConnectionId = computed(() => normalizeText(route.query.connectionId))
const reconnectMode = computed(() => Boolean(reconnectConnectionId.value))
const pageTitle = computed(() => (
  reconnectMode.value
    ? t('settings_invoice_carrier.reauth_title', '重新驗證電子發票載具')
    : t('settings_invoice_carrier.create_title', '新增電子發票載具')
))

const submitting = ref(false)
const successConnectionId = ref('')
const existingConnection = ref(null)
const errorText = ref('')
const mobilePhone = ref('')
const password = ref('')
const automationPhase = ref('')
const debugHint = ref('')
const debugLastStep = ref('')
const canSubmit = computed(() => Boolean(
  normalizeText(mobilePhone.value)
  && String(password.value ?? '').trim(),
))
const automationPhaseText = computed(() => {
  if (automationPhase.value === 'starting') return '正在啟動原生自動化'
  if (automationPhase.value === 'connecting') return '正在登入電子發票網站'
  if (automationPhase.value === 'saving') return '正在保存本機憑證'
  if (automationPhase.value === 'done') return '完成'
  return ''
})

async function submitAuth() {
  if (!ledgerStore.activeLedgerId) {
    errorText.value = '缺少活動帳本，請先建立或切換帳本'
    return
  }
  if (!canSubmit.value) return

  try {
    submitting.value = true
    errorText.value = ''
    debugHint.value = ''
    debugLastStep.value = ''
    automationPhase.value = 'starting'

    const result = await connectInvoiceCarrier(
      mobilePhone.value,
      password.value,
      {
        connectionId: reconnectConnectionId.value,
      },
    )
    automationPhase.value = 'saving'

    const connection = await store.createConnection(
      ledgerStore.activeLedgerId,
      {
        provider: result.provider,
        mobile_phone: mobilePhone.value,
        provider_connection_id: result.provider_connection_id,
        carrier_options: result.available_carriers || result.carrier_options,
        user_label: existingConnection.value?.user_label || `電子發票 ${mobilePhone.value}`,
      },
      result.credentialState,
      reconnectConnectionId.value,
    )

    successConnectionId.value = connection.id
    automationPhase.value = 'done'
    uiStore.pushToast(
      reconnectMode.value ? '電子發票載具已完成重新驗證' : '電子發票載具已建立',
      'info',
    )
  } catch (error) {
    errorText.value = String(error?.message ?? error ?? '電子發票登入失敗')
    automationPhase.value = ''
    debugHint.value = normalizeText(error?.debugHint || error?.data?.debugTrace?.debugHint)
    debugLastStep.value = normalizeText(error?.debugLastStep || error?.data?.debugTrace?.debugLastStep)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (reconnectConnectionId.value) {
    try {
      existingConnection.value = await store.loadConnection(reconnectConnectionId.value)
      if (existingConnection.value?.mobile_phone) {
        mobilePhone.value = existingConnection.value.mobile_phone
      }
    } catch {
      // Ignore prefill failures and let the page continue.
    }
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.page-head,
.action-row {
  justify-content: space-between;
  align-items: center;
}

.action-row {
  gap: 10px;
  flex-wrap: wrap;
}

h2,
h3 {
  margin: 0;
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--primary);
}

.muted {
  color: var(--muted);
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
}

.field input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

.status-panel,
.warning-panel,
.error-panel,
.success-panel {
  border-radius: 12px;
  padding: 12px;
}

.status-panel {
  background: color-mix(in srgb, var(--primary) 8%, var(--card) 92%);
}

.warning-panel {
  background: color-mix(in srgb, #e8a317 14%, var(--card) 86%);
}

.success-panel {
  background: color-mix(in srgb, var(--success) 10%, var(--card) 90%);
}

.error-panel {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
}
</style>
