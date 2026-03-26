<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ connection?.user_label || t('invoice_carrier.detail.title', '發票載具明細') }}</h2>
      <RouterLink class="btn back-btn" to="/invoice-carriers">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="featureEnabled && !connection" class="card panel">
      <p class="muted">{{ loading ? t('common.loading', '載入中...') : t('invoice_carrier.detail.not_found', '找不到發票載具連線') }}</p>
    </article>

    <template v-else-if="featureEnabled">
      <article class="card panel">
        <p v-if="connection.status === 'reauth_required'" class="reauth-banner">
          {{ t('invoice_carrier.detail.reauth_hint', '目前需要重新驗證，請重新登入一次後再同步。') }}
        </p>
        <div class="row action-row">
          <button class="btn primary" :disabled="syncing || !apiReady" :aria-busy="syncing" @click="syncNow">
            {{ syncing ? t('invoice_carrier.syncing', '同步中...') : t('invoice_carrier.sync_now', '立即同步') }}
          </button>
          <RouterLink class="btn" :to="{ name: 'invoice-carriers-create', query: { connectionId: connection.id } }">
            {{ t('invoice_carrier.reauth', '重新驗證') }}
          </RouterLink>
        </div>
      </article>

      <article class="card panel filter-panel">
        <h3>{{ t('invoice_carrier.detail.sync_filter', '同步查詢條件') }}</h3>
        <div class="filter-grid">
          <label>
            <span>{{ t('invoice_carrier.filter.date_from', '開始日期') }}</span>
            <input v-model="syncFilter.dateFrom" class="input" type="date" />
          </label>
          <label>
            <span>{{ t('invoice_carrier.filter.date_to', '結束日期') }}</span>
            <input v-model="syncFilter.dateTo" class="input" type="date" />
          </label>
          <label>
            <span>{{ t('invoice_carrier.filter.carrier', '歸戶載具') }}</span>
            <select v-model="syncFilter.carrier" class="input">
              <option v-for="option in carrierOptions" :key="option.value || option.label" :value="option.value">
                {{ option.label || option.value }}
              </option>
            </select>
          </label>
          <label>
            <span>{{ t('invoice_carrier.filter.status', '發票狀態') }}</span>
            <select v-model="syncFilter.status" class="input">
              <option value="all">{{ t('invoice_carrier.filter.status_all', '全部發票') }}</option>
              <option value="0">{{ t('invoice_carrier.filter.status_0', '未捐贈發票') }}</option>
              <option value="1">{{ t('invoice_carrier.filter.status_1', '已捐贈發票') }}</option>
              <option value="4">{{ t('invoice_carrier.filter.status_4', '已作廢發票') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('invoice_carrier.filter.buyer_ban', '買方統編') }}</span>
            <input v-model.trim="syncFilter.buyerBan" class="input" type="text" />
          </label>
          <label>
            <span>{{ t('invoice_carrier.filter.product_name', '品名關鍵字') }}</span>
            <input v-model.trim="syncFilter.productName" class="input" type="text" />
          </label>
        </div>
      </article>

      <article class="card panel filter-panel">
        <h3>{{ t('invoice_carrier.detail.local_filter', '本地清單篩選') }}</h3>
        <div class="filter-grid">
          <label>
            <span>{{ t('invoice_carrier.local_filter.search', '搜尋') }}</span>
            <input v-model.trim="localFilter.searchText" class="input" type="text" :placeholder="t('invoice_carrier.local_filter.search_placeholder', '搜尋發票號碼、店家或載具名稱')" />
          </label>
          <label>
            <span>{{ t('invoice_carrier.local_filter.viewed', '檢視狀態') }}</span>
            <select v-model="localFilter.viewed" class="input">
              <option value="all">{{ t('invoice_carrier.local_filter.viewed_all', '全部') }}</option>
              <option value="viewed">{{ t('invoice_carrier.local_filter.viewed_only', '已檢視') }}</option>
              <option value="unviewed">{{ t('invoice_carrier.local_filter.unviewed_only', '未檢視') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('invoice_carrier.local_filter.imported', '匯入狀態') }}</span>
            <select v-model="localFilter.imported" class="input">
              <option value="all">{{ t('invoice_carrier.local_filter.imported_all', '全部') }}</option>
              <option value="imported">{{ t('invoice_carrier.local_filter.imported_only', '已匯入') }}</option>
              <option value="unimported">{{ t('invoice_carrier.local_filter.unimported_only', '未匯入') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('invoice_carrier.local_filter.status', '發票狀態') }}</span>
            <select v-model="localFilter.invoiceStatus" class="input">
              <option value="all">{{ t('invoice_carrier.filter.status_all', '全部發票') }}</option>
              <option value="0">{{ t('invoice_carrier.filter.status_0', '未捐贈發票') }}</option>
              <option value="1">{{ t('invoice_carrier.filter.status_1', '已捐贈發票') }}</option>
              <option value="4">{{ t('invoice_carrier.filter.status_4', '已作廢發票') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('invoice_carrier.local_filter.date_from', '本地開始日期') }}</span>
            <input v-model="localFilter.dateFrom" class="input" type="date" />
          </label>
          <label>
            <span>{{ t('invoice_carrier.local_filter.date_to', '本地結束日期') }}</span>
            <input v-model="localFilter.dateTo" class="input" type="date" />
          </label>
        </div>
      </article>

      <article class="card panel">
        <div class="row action-row import-row">
          <label class="import-account-field">
            <span>{{ t('invoice_carrier.detail.import_account', '匯入帳戶') }}</span>
            <select v-model="targetAccountId" class="input">
              <option value="">{{ t('invoice_carrier.detail.import_account_placeholder', '請選擇帳戶') }}</option>
              <option v-for="option in accountOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button class="btn" :disabled="savingTargetAccount || !connection" :aria-busy="savingTargetAccount" @click="saveTargetAccount">
            {{ savingTargetAccount ? t('common.processing', '處理中') : t('invoice_carrier.detail.save_import_account', '儲存匯入帳戶') }}
          </button>
          <button class="btn primary" :disabled="importing || !selectedIds.length || !targetAccountId" :aria-busy="importing" @click="importSelection">
            {{ importing ? t('common.processing', '處理中') : t('invoice_carrier.detail.import_selected', { count: selectedIds.length }, '匯入所選 {count} 筆') }}
          </button>
        </div>

        <div class="row action-row">
          <button class="btn" @click="selectAllRows">{{ t('invoice_carrier.select_all', '全選') }}</button>
          <button class="btn" @click="clearSelection">{{ t('invoice_carrier.select_none', '取消全選') }}</button>
          <button class="btn" @click="invertSelection">{{ t('invoice_carrier.invert_selection', '反向選取') }}</button>
          <button class="btn" :disabled="marking || !selectedIds.length" :aria-busy="marking" @click="markSelection(true)">
            {{ marking ? t('common.processing', '處理中') : t('invoice_carrier.mark_viewed', '標記已檢視') }}
          </button>
          <button class="btn" :disabled="marking || !selectedIds.length" :aria-busy="marking" @click="markSelection(false)">
            {{ marking ? t('common.processing', '處理中') : t('invoice_carrier.mark_unviewed', '標記未檢視') }}
          </button>
        </div>

        <div v-if="!filteredInvoices.length" class="muted">{{ t('invoice_carrier.detail.invoice_empty', '目前沒有符合條件的本地發票。') }}</div>

        <ul v-else class="invoice-list">
          <li v-for="row in filteredInvoices" :key="row.id" class="invoice-item">
            <label class="check-row item-head">
              <input :checked="selectedIdSet.has(row.id)" type="checkbox" @change="toggleSelection(row.id, $event)" />
              <span class="item-main">
                <strong>{{ row.invoice_number }}</strong>
                <small class="muted">{{ row.seller_name || '-' }}</small>
              </span>
              <span class="item-chip-wrap">
                <span class="status-chip" :class="{ viewed: row.is_viewed === 1 }">{{ row.is_viewed === 1 ? t('invoice_carrier.viewed', '已檢視') : t('invoice_carrier.unviewed', '未檢視') }}</span>
                <span class="status-chip" :class="{ imported: row.imported === 1 }">{{ row.imported === 1 ? t('invoice_carrier.imported', '已匯入') : t('invoice_carrier.unimported', '未匯入') }}</span>
              </span>
            </label>
            <div class="item-body">
              <div class="row line">
                <span>{{ formatCurrency(row.amount_minor) }}</span>
                <span class="muted">{{ row.invoice_date }}</span>
              </div>
              <small class="muted">{{ row.carrier_label || '-' }} / {{ invoiceStatusLabel(row.invoice_status) }}</small>
              <small v-if="row.imported === 1" class="muted">
                {{ t('invoice_carrier.detail.imported_account', '已匯入帳戶') }}: {{ row.mapped_account_name || t('invoice_carrier.detail.imported_account_unknown', '已選帳戶') }}
              </small>
              <small v-if="row.buyer_ban" class="muted">{{ t('invoice_carrier.filter.buyer_ban', '買方統編') }}: {{ row.buyer_ban }}</small>
            </div>
          </li>
        </ul>
      </article>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getDefaultEinvoiceSyncFilter,
  getInvoiceCarrierConnectionDetail,
  importSelectedInvoiceCarrierInvoices,
  listInvoiceCarrierMirrorInvoices,
  markInvoiceCarrierMirrorInvoicesViewed,
  saveInvoiceCarrierConnectionSettings,
  syncInvoiceCarrierNow,
} from '@/ui/services/einvoice-carrier.service'
import {
  getEinvoiceCarrierApiUnavailableMessage,
  isEinvoiceCarrierApiConfigured,
  isEinvoiceCarrierFeatureEnabled,
} from '@/services/einvoice-carrier/backend'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()

const featureEnabled = isEinvoiceCarrierFeatureEnabled()
const apiReady = isEinvoiceCarrierApiConfigured()
const apiUnavailableMessage = getEinvoiceCarrierApiUnavailableMessage()
const loading = ref(false)
const syncing = ref(false)
const marking = ref(false)
const importing = ref(false)
const savingTargetAccount = ref(false)
const connection = ref(null)
const invoices = ref([])
const selectedIds = ref([])
const targetAccountId = ref('')
const syncFilter = reactive(getDefaultEinvoiceSyncFilter())
const localFilter = reactive({
  searchText: '',
  viewed: 'all',
  imported: 'all',
  invoiceStatus: 'all',
  dateFrom: '',
  dateTo: '',
})

const accountOptions = computed(() => (
  accountStore.regularAccounts.map((account) => ({
    value: account.id,
    label: account.name,
  }))
))
const carrierOptions = computed(() => {
  const options = Array.isArray(connection.value?.carrier_options) ? connection.value.carrier_options : []
  if (!options.length) {
    return [{ value: 'all', label: t('invoice_carrier.filter.carrier_all', '全部載具') }]
  }
  const hasAll = options.some((item) => item.value === 'all')
  return hasAll ? options : [{ value: 'all', label: t('invoice_carrier.filter.carrier_all', '全部載具') }, ...options]
})
const selectedIdSet = computed(() => new Set(selectedIds.value))
const filteredInvoices = computed(() => {
  const searchText = String(localFilter.searchText ?? '').trim().toLowerCase()
  return invoices.value.filter((row) => {
    if (localFilter.viewed === 'viewed' && Number(row.is_viewed ?? 0) !== 1) return false
    if (localFilter.viewed === 'unviewed' && Number(row.is_viewed ?? 0) === 1) return false
    if (localFilter.imported === 'imported' && Number(row.imported ?? 0) !== 1) return false
    if (localFilter.imported === 'unimported' && Number(row.imported ?? 0) === 1) return false
    if (localFilter.invoiceStatus !== 'all' && String(row.invoice_status ?? '') !== localFilter.invoiceStatus) return false
    if (localFilter.dateFrom && String(row.invoice_date ?? '') < localFilter.dateFrom) return false
    if (localFilter.dateTo && String(row.invoice_date ?? '') > localFilter.dateTo) return false
    if (!searchText) return true
    const haystack = [
      row.invoice_number,
      row.seller_name,
      row.carrier_label,
      row.buyer_ban,
    ].join(' ').toLowerCase()
    return haystack.includes(searchText)
  })
})

function formatCurrency(amountMinor) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((Number(amountMinor) || 0) / 100)
}

function invoiceStatusLabel(status) {
  const normalized = String(status ?? '').trim()
  if (normalized === '0') return t('invoice_carrier.filter.status_0', '未捐贈發票')
  if (normalized === '1') return t('invoice_carrier.filter.status_1', '已捐贈發票')
  if (normalized === '4') return t('invoice_carrier.filter.status_4', '已作廢發票')
  return t('invoice_carrier.filter.status_all', '全部發票')
}

function resetSelection() {
  selectedIds.value = []
}

function hydrateSyncFilterFromConnection(currentConnection) {
  const base = getDefaultEinvoiceSyncFilter()
  const next = currentConnection?.sync_filter && typeof currentConnection.sync_filter === 'object'
    ? currentConnection.sync_filter
    : {}
  syncFilter.dateFrom = next.dateFrom || base.dateFrom
  syncFilter.dateTo = next.dateTo || base.dateTo
  syncFilter.carrier = next.carrier || base.carrier
  syncFilter.status = next.status || base.status
  syncFilter.buyerBan = next.buyerBan || ''
  syncFilter.productName = next.productName || ''
}

async function loadAll() {
  const ledgerId = ledgerStore.activeLedgerId
  const connectionId = String(route.params.id ?? '').trim()
  if (!ledgerId || !connectionId) return
  loading.value = true
  try {
    await accountStore.load()
    connection.value = await getInvoiceCarrierConnectionDetail(ledgerId, connectionId)
    hydrateSyncFilterFromConnection(connection.value)
    targetAccountId.value = String(connection.value?.mapped_account_id ?? '').trim()
    invoices.value = await listInvoiceCarrierMirrorInvoices(ledgerId, { connectionId })
    resetSelection()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '載入發票載具明細失敗'), 'error')
    await router.replace({ name: 'invoice-carriers' })
  } finally {
    loading.value = false
  }
}

async function syncNow() {
  const ledgerId = ledgerStore.activeLedgerId
  const connectionId = String(route.params.id ?? '').trim()
  if (!ledgerId || !connectionId) return
  syncing.value = true
  try {
    const result = await syncInvoiceCarrierNow(ledgerId, connectionId, {
      filter: { ...syncFilter },
    })
    uiStore.pushToast(t('invoice_carrier.toast.sync_done', { count: result.syncedCount }, '已同步 {count} 筆發票'))
    await loadAll()
  } catch (error) {
    uiStore.pushToast(String((error?.message ?? apiUnavailableMessage) || '發票載具同步失敗'), 'error')
  } finally {
    syncing.value = false
  }
}

function toggleSelection(id, event) {
  const checked = Boolean(event?.target?.checked)
  const current = new Set(selectedIds.value)
  if (checked) {
    current.add(id)
  } else {
    current.delete(id)
  }
  selectedIds.value = Array.from(current)
}

function selectAllRows() {
  selectedIds.value = filteredInvoices.value.map((row) => row.id)
}

function clearSelection() {
  selectedIds.value = []
}

function invertSelection() {
  const current = new Set(selectedIds.value)
  selectedIds.value = filteredInvoices.value
    .map((row) => row.id)
    .filter((id) => !current.has(id))
}

async function markSelection(isViewed) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !selectedIds.value.length) return
  marking.value = true
  try {
    await markInvoiceCarrierMirrorInvoicesViewed(ledgerId, selectedIds.value, isViewed)
    uiStore.pushToast(isViewed ? t('invoice_carrier.toast.mark_viewed', '已標記為已檢視') : t('invoice_carrier.toast.mark_unviewed', '已標記為未檢視'))
    await loadAll()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '更新發票檢視狀態失敗'), 'error')
  } finally {
    marking.value = false
  }
}

async function saveTargetAccount() {
  const ledgerId = ledgerStore.activeLedgerId
  const connectionId = String(route.params.id ?? '').trim()
  if (!ledgerId || !connectionId) return
  savingTargetAccount.value = true
  try {
    connection.value = await saveInvoiceCarrierConnectionSettings(ledgerId, connectionId, {
      mappedAccountId: targetAccountId.value,
    })
    targetAccountId.value = String(connection.value?.mapped_account_id ?? '').trim()
    uiStore.pushToast(t('invoice_carrier.toast.import_account_saved', '已儲存匯入帳戶'))
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '儲存匯入帳戶失敗'), 'error')
  } finally {
    savingTargetAccount.value = false
  }
}

async function importSelection() {
  const ledgerId = ledgerStore.activeLedgerId
  const connectionId = String(route.params.id ?? '').trim()
  if (!ledgerId || !connectionId || !selectedIds.value.length || !targetAccountId.value) return
  importing.value = true
  try {
    const result = await importSelectedInvoiceCarrierInvoices(ledgerId, connectionId, selectedIds.value, {
      accountId: targetAccountId.value,
    })
    uiStore.pushToast(
      t(
        'invoice_carrier.toast.import_done',
        { imported: result.importedCount, skipped: result.skippedCount },
        '已匯入 {imported} 筆，略過 {skipped} 筆',
      ),
    )
    await transactionStore.refreshAfterWriteSafe(2500)
    await loadAll()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '匯入發票失敗'), 'error')
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  if (!featureEnabled) {
    void router.replace({ name: 'features' })
    return
  }
  void loadAll()
})
</script>

<style scoped>
.panel {
  padding: 14px;
}
.filter-panel {
  display: grid;
  gap: 12px;
}
.filter-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.filter-grid label {
  display: grid;
  gap: 8px;
  font-weight: 700;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
}
.import-row {
  align-items: flex-end;
}
.import-account-field {
  display: grid;
  gap: 8px;
  font-weight: 700;
  flex: 1 1 260px;
  min-width: min(320px, 100%);
}
.reauth-banner {
  margin: 0 0 12px;
  color: var(--warn);
  font-weight: 700;
}
.invoice-list {
  display: grid;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  overflow: hidden;
}
.invoice-item {
  border-bottom: 1px solid var(--field-border);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}
.invoice-item:last-child {
  border-bottom: none;
}
.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-chip-wrap {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.item-main {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.item-body {
  display: grid;
  gap: 4px;
}
.line {
  justify-content: space-between;
}
.status-chip {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  color: var(--warn);
  font-size: 12px;
  font-weight: 700;
}
.status-chip.viewed {
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  color: var(--ok);
}
.status-chip.imported {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}
</style>
