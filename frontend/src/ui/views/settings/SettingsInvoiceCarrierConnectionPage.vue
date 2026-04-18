<template>
  <section class="stack">
    <header class="row page-head">
      <div class="title-wrap">
        <h2>{{ connection?.user_label || '電子發票載具詳情' }}</h2>
        <small v-if="connection" class="muted">{{ connection.provider_connection_id || connection.provider }}</small>
      </div>
      <RouterLink class="btn back-btn" to="/settings/invoice-carrier">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!connection && !loading" class="card panel">
      <h3>找不到此載具</h3>
      <p class="muted">這筆電子發票載具可能已被移除，請返回列表重新確認。</p>
    </article>

    <template v-else-if="connection">
      <article v-if="needsReauth" class="card panel reauth-panel">
        <strong>此載具需要重新驗證</strong>
        <p class="muted">
          上次同步遇到 Cloudflare 或登入失效。請重新打開 headed browser 完成安全驗證後，再重新保存本機憑證。
        </p>
        <RouterLink class="btn primary" :to="{ name: 'settings-invoice-carrier-create', query: { connectionId: connection.id } }">
          重新驗證載具
        </RouterLink>
      </article>

      <article class="card panel">
        <header class="row connection-head">
          <h3>載具資訊</h3>
          <span class="status-chip" :class="`status-${connection.status}`">{{ connectionStatusText(connection.status) }}</span>
        </header>

        <ul class="meta-list">
          <li><span class="label">手機號碼</span><strong>{{ connection.mobile_phone }}</strong></li>
          <li><span class="label">同步狀態</span><strong>{{ syncStatusText(connection.last_sync_status) }}</strong></li>
          <li><span class="label">最後同步</span><strong>{{ formatDateTime(connection.last_sync_at) }}</strong></li>
          <li><span class="label">可用載具</span><strong>{{ carrierOptions.length - 1 }}</strong></li>
        </ul>

        <p v-if="connection.last_error" class="error-text">{{ connection.last_error }}</p>
        <p v-if="!invoiceCarrierApiReady" class="warning-text">{{ invoiceCarrierApiMessage }}</p>

        <div class="filter-grid">
          <label class="field">
            <span>同步起日</span>
            <DateTimePickerField v-model:date="startDate" :hour="0" :minute="0" :show-time="false" />
          </label>
          <label class="field">
            <span>同步迄日</span>
            <DateTimePickerField v-model:date="endDate" :hour="0" :minute="0" :show-time="false" />
          </label>
          <label class="field carrier-filter">
            <span>載具篩選</span>
            <CustomSelect v-model="carrierCode" :options="carrierOptions" placeholder="全部載具" />
          </label>
        </div>

        <div class="row action-row">
          <button class="btn primary" :disabled="!canSync || loading" @click="syncInvoices">
            {{ loading ? '同步中...' : '立即同步' }}
          </button>
          <button class="btn danger" :disabled="loading" @click="deleteConnection">
            刪除載具
          </button>
        </div>

        <div v-if="syncSummary" class="summary-panel">
          <strong>同步摘要</strong>
          <p>新增 {{ syncSummary.addedCount }} 筆、更新 {{ syncSummary.updatedCount }} 筆、略過重複/未變更 {{ syncSummary.unchangedCount }} 筆。</p>
        </div>
      </article>

      <article class="card panel">
        <header class="row connection-head">
          <h3>發票清單（{{ invoices.length }} 筆）</h3>
          <button class="btn" :disabled="!unimportedInvoices.length" @click="toggleSelectAll">
            {{ allSelectableChosen ? '取消全選' : '全選未匯入' }}
          </button>
        </header>

        <p v-if="!invoices.length" class="muted">尚未匯入任何發票，請先同步。</p>

        <template v-else>
          <div class="invoice-list">
            <label v-for="invoice in invoices" :key="invoice.id" class="invoice-item">
              <input
                v-model="selectedInvoiceIds"
                type="checkbox"
                :value="invoice.id"
                :disabled="Boolean(invoice.imported_transaction_id)"
              />
              <div class="invoice-body">
                <div class="invoice-head">
                  <strong>{{ invoice.invoice_number }}</strong>
                  <span v-if="invoice.imported_transaction_id" class="badge">已匯入</span>
                </div>
                <small class="muted">{{ invoice.invoice_date }}｜{{ invoice.seller_name || '未提供賣方' }}</small>
                <small class="muted">NT$ {{ formatAmount(invoice.amount) }}｜{{ invoice.carrier_label || '全部載具' }}</small>
              </div>
            </label>
          </div>

          <div v-if="unimportedInvoices.length" class="import-panel">
            <label class="field">
              <span>匯入至帳戶</span>
              <CustomSelect v-model="targetAccountId" :groups="accountGroups" placeholder="請選擇帳戶" />
            </label>
            <div class="row action-row">
              <button class="btn primary" :disabled="!selectedInvoiceIds.length || !targetAccountId || loading" @click="importSelectedInvoices">
                匯入 {{ selectedInvoiceIds.length }} 筆發票
              </button>
            </div>
            <p v-if="importSummary" class="success-text">已匯入 {{ importSummary.count }} 筆發票為交易。</p>
          </div>
        </template>
      </article>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  getInvoiceCarrierApiUnavailableMessage,
  isInvoiceCarrierApiConfigured,
} from '@/services/invoice-carrier/backend'

function buildDefaultStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 60)
  return date.toISOString().slice(0, 10)
}

function buildDefaultEndDate() {
  return new Date().toISOString().slice(0, 10)
}

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const store = useInvoiceCarrierStore()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

const invoiceCarrierApiReady = isInvoiceCarrierApiConfigured()
const invoiceCarrierApiMessage = computed(() => getInvoiceCarrierApiUnavailableMessage())
const connectionId = computed(() => String(route.params.id ?? '').trim())
const connection = computed(() => store.currentConnection)
const invoices = computed(() => store.currentInvoices)
const unimportedInvoices = computed(() => invoices.value.filter((item) => !item.imported_transaction_id))
const loading = computed(() => store.loading)
const needsReauth = computed(() => String(connection.value?.status ?? '').trim().toLowerCase() === 'reauth_required')
const carrierOptions = computed(() => [
  { value: 'all', label: '全部載具' },
  ...((Array.isArray(connection.value?.carrier_options) ? connection.value.carrier_options : []).map((item) => ({
    value: item.value,
    label: item.label,
  }))),
])
const accountGroups = computed(() => accountStore.groupedRegularAccounts)
const allSelectableChosen = computed(() => {
  if (!unimportedInvoices.value.length) return false
  const selectedSet = new Set(selectedInvoiceIds.value)
  return unimportedInvoices.value.every((item) => selectedSet.has(item.id))
})
const canSync = computed(() => Boolean(
  invoiceCarrierApiReady
  && connection.value
  && !needsReauth.value
  && ledgerStore.activeLedgerId,
))

const startDate = ref(buildDefaultStartDate())
const endDate = ref(buildDefaultEndDate())
const carrierCode = ref('all')
const targetAccountId = ref('')
const selectedInvoiceIds = ref([])
const syncSummary = ref(null)
const importSummary = ref(null)

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function formatAmount(value) {
  return Number(value ?? 0).toLocaleString(locale.value)
}

function connectionStatusText(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'reauth_required') return '需重新驗證'
  if (normalized === 'error') return '同步失敗'
  if (normalized === 'inactive') return '已停用'
  return '正常'
}

function syncStatusText(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'ok') return '成功'
  if (normalized === 'error') return '失敗'
  return '尚未同步'
}

function pickDefaultAccountId() {
  const firstAccount = accountStore.accounts.find((item) => !String(item?.savings_jar_goal_type ?? '').trim())
  targetAccountId.value = firstAccount?.id ?? ''
}

async function loadPage() {
  store.clearError()
  syncSummary.value = null
  importSummary.value = null
  if (!accountStore.ready) {
    await accountStore.load()
  }
  if (!targetAccountId.value) {
    pickDefaultAccountId()
  }
  await store.selectConnection(connectionId.value)
}

async function syncInvoices() {
  if (!canSync.value) return
  try {
    syncSummary.value = await store.syncConnection(ledgerStore.activeLedgerId, connectionId.value, {
      startDate: startDate.value,
      endDate: endDate.value,
      carrierCode: carrierCode.value === 'all' ? '' : carrierCode.value,
    })
    uiStore.pushToast('電子發票同步完成', 'info')
  } catch {
    // store.error already contains the user-facing message.
  }
}

function toggleSelectAll() {
  if (allSelectableChosen.value) {
    selectedInvoiceIds.value = []
    return
  }
  selectedInvoiceIds.value = unimportedInvoices.value.map((item) => item.id)
}

async function importSelectedInvoices() {
  if (!ledgerStore.activeLedgerId) {
    store.setError('缺少活動帳本，請先建立或切換帳本')
    return
  }
  if (!targetAccountId.value) {
    store.setError('請選擇匯入帳戶')
    return
  }
  try {
    const result = await store.importInvoices(
      selectedInvoiceIds.value,
      ledgerStore.activeLedgerId,
      targetAccountId.value,
      null,
    )
    importSummary.value = {
      count: result.length,
    }
    selectedInvoiceIds.value = []
    uiStore.pushToast(`已匯入 ${result.length} 筆發票`, 'info')
  } catch {
    // store.error already contains the user-facing message.
  }
}

async function deleteConnection() {
  if (!confirm('確定要刪除此載具嗎？')) return
  try {
    await store.deleteConnection(connectionId.value)
    await router.push('/settings/invoice-carrier')
  } catch {
    // store.error already contains the user-facing message.
  }
}

watch(
  () => invoices.value,
  (rows) => {
    const validIds = new Set(rows.map((item) => item.id))
    selectedInvoiceIds.value = selectedInvoiceIds.value.filter((id) => validIds.has(id))
  },
  { deep: true },
)

watch(
  () => route.params.id,
  () => {
    if (connectionId.value) {
      void loadPage()
    }
  },
)

onMounted(() => {
  void loadPage()
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.page-head,
.connection-head,
.action-row {
  justify-content: space-between;
  align-items: center;
}

.action-row {
  gap: 10px;
  flex-wrap: wrap;
}

.title-wrap {
  min-width: 0;
}

h2,
h3 {
  margin: 0;
}

.muted,
.label {
  color: var(--muted);
}

.reauth-panel,
.summary-panel,
.import-panel {
  background: color-mix(in srgb, var(--primary) 8%, var(--card) 92%);
  border-radius: 12px;
}

.reauth-panel {
  gap: 10px;
}

.warning-text,
.error-text,
.success-text {
  margin: 0;
  font-size: 13px;
}

.warning-text {
  color: #8a5a00;
}

.error-text {
  color: var(--error);
}

.success-text {
  color: var(--success);
}

.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.meta-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}

.filter-grid {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
}

.carrier-filter {
  max-width: 320px;
}

.status-chip,
.badge {
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 700;
}

.status-active,
.badge {
  background: color-mix(in srgb, var(--success) 14%, var(--card) 86%);
  color: var(--success);
}

.status-error,
.status-reauth_required {
  background: color-mix(in srgb, #e8a317 18%, var(--card) 82%);
  color: #8a5a00;
}

.status-inactive {
  background: color-mix(in srgb, var(--muted) 14%, var(--card) 86%);
  color: var(--muted);
}

.invoice-list {
  display: grid;
  gap: 10px;
}

.invoice-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}

.invoice-body {
  display: grid;
  gap: 4px;
}

.invoice-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn.danger {
  background: var(--error);
  color: #fff;
}
</style>
