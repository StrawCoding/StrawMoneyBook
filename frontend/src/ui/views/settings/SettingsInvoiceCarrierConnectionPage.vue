<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ connection?.user_label || '電子發票載具詳情' }}</h2>
      <RouterLink class="btn back-btn" to="/settings/invoice-carrier">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!connection" class="card panel">
      <p class="muted">找不到此載具</p>
    </article>

    <template v-else>
      <article class="card panel">
        <h3>載具資訊</h3>
        <ul class="meta-list">
          <li>
            <span class="label">手機號碼</span>
            <strong>{{ connection.mobile_phone }}</strong>
          </li>
          <li>
            <span class="label">提供商</span>
            <strong>{{ connection.provider }}</strong>
          </li>
          <li>
            <span class="label">狀態</span>
            <strong :class="{ active: connection.status === 'active' }">
              {{ connection.status === 'active' ? '活躍' : '停用' }}
            </strong>
          </li>
          <li>
            <span class="label">最後同步</span>
            <strong>{{ formatDateTime(connection.last_sync_at) }}</strong>
          </li>
        </ul>

        <div style="margin-top: 12px;">
          <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 8px;">同步範圍</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <DateTimePickerField
              v-model:date="startDate"
              :hour="0"
              :minute="0"
              :show-time="false"
            />
            <DateTimePickerField
              v-model:date="endDate"
              :hour="0"
              :minute="0"
              :show-time="false"
            />
          </div>
        </div>

        <div class="row action-row" style="margin-top: 12px;">
          <button class="btn primary" :disabled="loading" @click="syncInvoices">
            {{ loading ? '同步中...' : '立即同步' }}
          </button>
          <button class="btn danger" :disabled="loading" @click="deleteConnection">
            刪除載具
          </button>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>
      </article>

      <article class="card panel">
        <h3>發票清單（{{ invoices.length }}筆）</h3>
        <p class="muted" v-if="invoices.length === 0">尚未匯入任何發票，請先同步。</p>

        <div v-else class="invoice-list">
          <div v-for="invoice in invoices" :key="invoice.id" class="invoice-item">
            <label class="checkbox-wrap">
              <input
                type="checkbox"
                :value="invoice.id"
                v-model="selectedInvoiceIds"
                :disabled="invoice.imported_transaction_id"
              />
              <span></span>
            </label>
            <div class="invoice-content">
              <div>
                <strong>{{ invoice.invoice_number }}</strong>
                <span v-if="invoice.imported_transaction_id" class="badge imported">已匯入</span>
              </div>
              <small class="muted">
                {{ invoice.invoice_date }} - {{ invoice.seller_name }} - NT${{ invoice.amount }}
              </small>
            </div>
          </div>
        </div>

        <div v-if="unimportedCount > 0" style="margin-top: 12px;">
          <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 8px;">
            匯入至帳戶
          </label>
          <CustomSelect v-model="targetAccountId" :groups="accountGroups" />
          <div class="row action-row" style="margin-top: 12px;">
            <button class="btn primary" :disabled="!selectedInvoiceIds.length || loading" @click="importInvoices">
              匯入 {{ selectedInvoiceIds.length }} 筆發票
            </button>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<script setup>
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { computed, onMounted, ref } from 'vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useInvoiceCarrierStore()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()

const connectionId = computed(() => route.params.id)
const connection = computed(() => store.currentConnection)
const invoices = computed(() => store.currentInvoices)
const loading = computed(() => store.loading)
const error = computed(() => store.error)

const selectedInvoiceIds = ref([])
const unimportedCount = computed(() =>
  invoices.value.filter((inv) => !inv.imported_transaction_id).length,
)

// 日期範圍選擇：預設為兩個月前至今天
function getDefaultStartDate() {
  const today = new Date()
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate())
  return twoMonthsAgo.toISOString().split('T')[0]
}

function getDefaultEndDate() {
  const today = new Date()
  return today.toISOString().split('T')[0]
}

const startDate = ref(getDefaultStartDate())
const endDate = ref(getDefaultEndDate())

// 帳戶選擇
const accountGroups = computed(() => accountStore.groupedRegularAccounts)

function getDefaultTargetAccountId() {
  // 預設為帳本的第一個帳戶（非儲蓄罐）
  const firstAccount = accountStore.accounts.find((acc) => !String(acc?.savings_jar_goal_type ?? '').trim())
  return firstAccount?.id || null
}

const targetAccountId = ref(getDefaultTargetAccountId())

function formatDateTime(isoString) {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-TW')
}

async function syncInvoices() {
  try {
    const storedSessionId = store.sessionIds[connectionId.value]
    if (!storedSessionId) {
      store.error = '載具 session 已過期，請重新新增載具'
      return
    }
    await store.syncConnection(storedSessionId, connectionId.value, {
      startDate: startDate.value,
      endDate: endDate.value,
    })
  } catch (e) {
    console.error('Sync failed:', e)
  }
}

async function importInvoices() {
  if (!selectedInvoiceIds.value.length) return

  if (!targetAccountId.value) {
    store.error = '請選擇匯入帳戶'
    return
  }

  try {
    await store.importInvoices(
      selectedInvoiceIds.value,
      ledgerStore.currentLedger.id,
      targetAccountId.value,
      null,
    )
    selectedInvoiceIds.value = []
  } catch (e) {
    console.error('Import failed:', e)
  }
}

async function deleteConnection() {
  if (!confirm('確定要刪除此載具嗎？')) return
  try {
    await store.deleteConnection(connectionId.value)
    await router.push('/settings/invoice-carrier')
  } catch (e) {
    console.error('Delete failed:', e)
  }
}

onMounted(() => {
  store.selectConnection(connectionId.value)
})
</script>

<style scoped>
.panel {
  padding: 14px;
  margin-bottom: 12px;
}

h2, h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

h2 {
  font-size: 18px;
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
  font-size: 13px;
}

.meta-list .label {
  color: var(--muted);
}

.meta-list strong {
  font-weight: 700;
}

.meta-list strong.active {
  color: var(--success);
}

.action-row {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 12px;
  font-size: 13px;
  flex: 1;
}

.btn.danger {
  background: var(--error);
  color: white;
}

.error-msg {
  color: var(--error);
  font-size: 12px;
  margin-top: 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
  border-radius: 4px;
}

.invoice-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.invoice-item {
  display: flex;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  align-items: flex-start;
}

.checkbox-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
  flex: 0 0 auto;
}

.checkbox-wrap input {
  margin-right: 6px;
}

.checkbox-wrap span {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: inline-block;
}

.checkbox-wrap input:checked + span {
  background: var(--primary);
  border-color: var(--primary);
}

.invoice-content {
  flex: 1;
  font-size: 12px;
}

.invoice-content div {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
}

.invoice-content strong {
  font-weight: 700;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--success);
  color: white;
  border-radius: 3px;
}

.badge.imported {
  background: var(--success);
}

.muted {
  color: var(--muted);
}
</style>
