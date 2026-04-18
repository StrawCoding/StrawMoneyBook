<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ pageTitle }}</h2>
      <RouterLink class="btn back-btn" to="/settings/invoice-carrier">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!invoiceCarrierApiReady" class="card panel warning-panel">
      <h3>電子發票載具 API 尚未可用</h3>
      <p class="muted">{{ invoiceCarrierApiMessage }}</p>
    </article>

    <template v-else>
      <article class="card panel intro-panel">
        <div class="eyebrow">實驗性</div>
        <h3>3 段式連線流程</h3>
        <div class="stepper">
          <span class="step-chip" :class="stepClass(1)">1. 啟動瀏覽器驗證</span>
          <span class="step-chip" :class="stepClass(2)">2. 填入登入資訊</span>
          <span class="step-chip" :class="stepClass(3)">3. 完成連線</span>
        </div>
        <p class="muted">
          這個流程不會嘗試繞過 Cloudflare。第一次或憑證失效時，必須在剛開啟的瀏覽器完成安全驗證。
        </p>
      </article>

      <article v-if="currentStep === 1" class="card panel">
        <h3>步驟 1：啟動瀏覽器並完成安全驗證</h3>
        <p class="muted">
          按下開始後會開一個 headed Playwright 瀏覽器。若畫面顯示 `Just a moment...`，請先在該視窗完成 Cloudflare 安全驗證。
        </p>
        <div class="row action-row">
          <button class="btn primary" :disabled="startingSession" @click="startSession">
            {{ startingSession ? '啟動中...' : (reconnectMode ? '開始重新驗證' : '開始新增載具') }}
          </button>
          <button class="btn" :disabled="!sessionId || refreshingStatus" @click="refreshSessionStatus()">
            {{ refreshingStatus ? '檢查中...' : '重新檢查狀態' }}
          </button>
        </div>

        <div v-if="sessionId" class="status-panel">
          <p><strong>瀏覽器 Session：</strong>{{ sessionId }}</p>
          <p><strong>目前頁面：</strong>{{ sessionStatus?.url || sessionStatus?.title || '等待載入中' }}</p>
          <p v-if="sessionStatus?.cloudflare_blocked" class="warning-text">
            請在剛開啟的瀏覽器完成 Cloudflare 安全驗證，完成後此頁會自動切到下一步。
          </p>
          <p v-else-if="sessionStatus?.login_form_ready" class="success-text">
            已通過安全驗證，接下來請輸入手機號碼、密碼與圖形驗證碼。
          </p>
          <p v-else class="muted">
            正在等待登入頁可用...
          </p>
          <p v-if="sessionStatus?.error_message" class="error-text">{{ sessionStatus.error_message }}</p>
        </div>
      </article>

      <article v-else-if="currentStep === 2" class="card panel">
        <h3>步驟 2：輸入登入資訊</h3>
        <p class="muted">
          完成登入後，手機號碼、密碼與瀏覽器狀態會加密保存在本機 secure settings，不會同步到 Google Drive 或 shared-ledger snapshot。
        </p>

        <div v-if="sessionStatus?.cloudflare_blocked" class="warning-panel inline-warning">
          <strong>仍在等待 Cloudflare 驗證</strong>
          <p class="muted">請回到瀏覽器完成驗證，再按一次重新檢查狀態。</p>
          <button class="btn" :disabled="refreshingStatus" @click="refreshSessionStatus()">重新檢查狀態</button>
        </div>

        <template v-else>
          <label class="field">
            <span>手機號碼</span>
            <input v-model.trim="mobilePhone" type="tel" placeholder="09xxxxxxxx" />
          </label>

          <label class="field">
            <span>密碼</span>
            <input v-model="password" type="password" placeholder="電子發票登入密碼" />
          </label>

          <div v-if="requiresCaptcha && captchaImageUrl" class="captcha-box">
            <div class="captcha-head">
              <span>圖形驗證碼</span>
              <button class="btn small" :disabled="refreshingStatus" @click="refreshSessionStatus(true)">更新驗證碼</button>
            </div>
            <img :src="captchaImageUrl" alt="captcha" />
            <p v-if="captchaAutoFilled" class="muted">
              OCR 建議：{{ captchaAutoFilled }}
            </p>
          </div>

          <label v-if="requiresCaptcha" class="field">
            <span>圖形驗證碼</span>
            <input v-model.trim="captchaCode" type="text" maxlength="10" inputmode="numeric" placeholder="請輸入圖片上的數字" />
          </label>
          <p v-else class="muted">
            已在瀏覽器完成登入，不需要再次輸入圖形驗證碼；系統會直接保存本機加密憑證。
          </p>

          <div class="row action-row">
            <button class="btn" :disabled="refreshingStatus" @click="refreshSessionStatus()">重新檢查狀態</button>
            <button class="btn primary" :disabled="!canSubmit || submitting" @click="submitAuth">
              {{ submitting ? (reconnectMode ? '更新憑證中...' : '建立連線中...') : (reconnectMode ? '完成重新驗證' : '完成登入並建立連線') }}
            </button>
          </div>
        </template>
      </article>

      <article v-else class="card panel success-panel">
        <h3>{{ reconnectMode ? '重新驗證完成' : '載具新增成功' }}</h3>
        <p class="muted">
          {{ reconnectMode ? '本機加密憑證與瀏覽器狀態已更新，之後可再次自動同步。' : '之後同步會優先使用本機加密保存的瀏覽器狀態；若過期則自動重登入一次。' }}
        </p>
        <div class="row action-row">
          <RouterLink class="btn" to="/settings/invoice-carrier">返回列表</RouterLink>
          <RouterLink v-if="successConnectionId" class="btn primary" :to="{ name: 'settings-invoice-carrier-connection', params: { id: successConnectionId } }">
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getInvoiceCarrierApiUnavailableMessage,
  isInvoiceCarrierApiConfigured,
} from '@/services/invoice-carrier/backend'
import { normalizeText } from '@/services/invoice-carrier/shared'
import {
  completeInvoiceCarrierAuth,
  disconnectInvoiceCarrierLinkSession,
  pollInvoiceCarrierSessionStatus,
  startInvoiceCarrierLinkSession,
} from '@/ui/services/invoice-carrier.service'

const route = useRoute()
const ledgerStore = useLedgerStore()
const store = useInvoiceCarrierStore()
const uiStore = useUiStore()
const { t } = useI18n()

const invoiceCarrierApiReady = isInvoiceCarrierApiConfigured()
const invoiceCarrierApiMessage = computed(() => getInvoiceCarrierApiUnavailableMessage())
const reconnectConnectionId = computed(() => normalizeText(route.query.connectionId))
const reconnectMode = computed(() => Boolean(reconnectConnectionId.value))
const pageTitle = computed(() => (
  reconnectMode.value
    ? t('settings_invoice_carrier.reauth_title', '重新驗證電子發票載具')
    : t('settings_invoice_carrier.create_title', '新增電子發票載具')
))

const currentStep = ref(1)
const startingSession = ref(false)
const refreshingStatus = ref(false)
const submitting = ref(false)
const sessionId = ref('')
const sessionStatus = ref(null)
const successConnectionId = ref('')
const existingConnection = ref(null)
const errorText = ref('')
const mobilePhone = ref('')
const password = ref('')
const captchaCode = ref('')

let pollTimerId = 0

const captchaImageUrl = computed(() => normalizeText(sessionStatus.value?.captcha_image))
const captchaAutoFilled = computed(() => normalizeText(sessionStatus.value?.captcha_auto_filled))
const requiresCaptcha = computed(() => Boolean(sessionStatus.value?.login_form_ready))
const canSubmit = computed(() => Boolean(
  sessionId.value
  && normalizeText(mobilePhone.value)
  && String(password.value ?? '').trim()
  && (!requiresCaptcha.value || normalizeText(captchaCode.value)),
))

function stepClass(step) {
  return {
    active: currentStep.value === step,
    done: currentStep.value > step,
  }
}

function stopPolling() {
  if (pollTimerId) {
    window.clearInterval(pollTimerId)
    pollTimerId = 0
  }
}

function applySessionStatus(status) {
  sessionStatus.value = status ?? null
  if (!normalizeText(captchaCode.value) && captchaAutoFilled.value) {
    captchaCode.value = captchaAutoFilled.value
  }
  if (status?.login_form_ready || status?.search_form_ready) {
    currentStep.value = Math.max(currentStep.value, 2)
  }
}

function startPolling() {
  stopPolling()
  if (!sessionId.value) return
  pollTimerId = window.setInterval(() => {
    void refreshSessionStatus()
  }, 2000)
}

async function refreshSessionStatus(refreshCaptcha = false) {
  if (!sessionId.value) return null
  try {
    refreshingStatus.value = true
    const status = await pollInvoiceCarrierSessionStatus(sessionId.value, { refreshCaptcha })
    applySessionStatus(status)
    return status
  } catch (error) {
    errorText.value = String(error?.message ?? error ?? '無法取得電子發票登入狀態')
    throw error
  } finally {
    refreshingStatus.value = false
  }
}

async function startSession() {
  try {
    startingSession.value = true
    errorText.value = ''
    const result = await startInvoiceCarrierLinkSession()
    sessionId.value = normalizeText(result.session_id)
    applySessionStatus(result)
    startPolling()
  } catch (error) {
    errorText.value = String(error?.message ?? error ?? '啟動電子發票瀏覽器失敗')
  } finally {
    startingSession.value = false
  }
}

async function cleanupSession() {
  stopPolling()
  if (!sessionId.value) return
  try {
    await disconnectInvoiceCarrierLinkSession(sessionId.value)
  } catch {
    // Ignore disconnect cleanup errors.
  }
  sessionId.value = ''
}

async function submitAuth() {
  if (!ledgerStore.activeLedgerId) {
    errorText.value = '缺少活動帳本，請先建立或切換帳本'
    return
  }
  if (!canSubmit.value) return

  try {
    submitting.value = true
    errorText.value = ''
    const result = await completeInvoiceCarrierAuth(
      sessionId.value,
      mobilePhone.value,
      password.value,
      captchaCode.value,
    )

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
    currentStep.value = 3
    uiStore.pushToast(
      reconnectMode.value ? '電子發票載具已完成重新驗證' : '電子發票載具已建立',
      'info',
    )
    await cleanupSession()
  } catch (error) {
    errorText.value = String(error?.message ?? error ?? '電子發票登入失敗')
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

onBeforeUnmount(() => {
  if (currentStep.value !== 3) {
    void cleanupSession()
  } else {
    stopPolling()
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
.captcha-head,
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

.stepper {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.step-chip {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--muted) 10%, var(--card) 90%);
  color: var(--muted);
}

.step-chip.active {
  background: color-mix(in srgb, var(--primary) 18%, var(--card) 82%);
  color: var(--primary);
}

.step-chip.done {
  background: color-mix(in srgb, var(--success) 16%, var(--card) 84%);
  color: var(--success);
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
.captcha-box,
.warning-panel.inline-warning,
.error-panel,
.success-panel {
  border-radius: 12px;
  padding: 12px;
}

.status-panel,
.captcha-box {
  background: color-mix(in srgb, var(--primary) 8%, var(--card) 92%);
}

.warning-panel,
.warning-panel.inline-warning {
  background: color-mix(in srgb, #e8a317 14%, var(--card) 86%);
}

.success-panel {
  background: color-mix(in srgb, var(--success) 10%, var(--card) 90%);
}

.error-panel {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
}

.warning-text {
  color: #8a5a00;
  font-weight: 700;
}

.success-text {
  color: var(--success);
  font-weight: 700;
}

.error-text {
  color: var(--error);
  font-weight: 700;
}

.captcha-box img {
  max-width: 220px;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.small {
  padding: 6px 10px;
  font-size: 12px;
}
</style>
