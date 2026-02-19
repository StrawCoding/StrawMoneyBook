<template>
  <section class="stack">
    <header class="row page-head">
      <h2>銀行同步</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>新增銀行連結</h3>
      <p class="muted">本版預設接 Sandbox Provider（Mock Bank），流程與正式銀行同步一致，可先驗證匯入與防重邏輯。</p>
      <div class="row connect-row">
        <div class="provider-field">
          <label>銀行 Provider</label>
          <CustomSelect v-model="selectedProviderId" :options="providerOptions" />
        </div>
        <button class="btn primary" :disabled="!canConnect" :aria-busy="connecting" @click="connectProvider">
          {{ connecting ? '連結中...' : '連結銀行' }}
        </button>
        <button class="btn" :disabled="loadingState" :aria-busy="loadingState" @click="reloadState">
          {{ loadingState ? '更新中...' : '重新整理' }}
        </button>
      </div>
    </article>

    <article v-if="!connections.length" class="card panel">
      <p class="muted">尚未連結任何銀行。請先建立連結後再同步交易。</p>
    </article>

    <article v-for="connection in connections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div class="title-wrap">
          <h3>{{ connection.user_label || connection.provider }}</h3>
          <small class="muted">{{ connection.provider_connection_id }}</small>
        </div>
        <span class="status-chip" :class="`status-${connection.status}`">{{ connectionStatusText(connection.status) }}</span>
      </header>

      <ul class="meta-list">
        <li><span class="muted">上次同步</span><strong>{{ formatDateTime(connection.last_sync_at) }}</strong></li>
        <li><span class="muted">同步狀態</span><strong>{{ syncStatusText(connection.last_sync_status) }}</strong></li>
        <li v-if="connection.last_error"><span class="muted">錯誤</span><strong>{{ connection.last_error }}</strong></li>
      </ul>

      <div class="row action-row">
        <button class="btn" @click="openReview(connection.id)">查看待匯入交易</button>
        <button
          class="btn primary"
          :disabled="syncingConnectionId === connection.id"
          :aria-busy="syncingConnectionId === connection.id"
          @click="syncConnection(connection.id)"
        >
          {{ syncingConnectionId === connection.id ? '同步中...' : '立即同步' }}
        </button>
        <button
          class="btn"
          :disabled="disconnectingConnectionId === connection.id"
          :aria-busy="disconnectingConnectionId === connection.id"
          @click="disconnectConnection(connection.id)"
        >
          {{ disconnectingConnectionId === connection.id ? '解除中...' : '解除連結' }}
        </button>
      </div>

      <section class="sub-panel">
        <h4>帳戶同步設定</h4>
        <p class="muted">可啟用/停用帳戶同步，並映射到 StrawMoneyBook 帳戶作為匯入目標。</p>
        <div v-for="account in connection.accounts" :key="account.id" class="account-row">
          <label class="check-row account-enable">
            <input v-model="account.enabledBool" type="checkbox" />
            <span>{{ account.account_name }}（{{ account.account_mask || '-' }}）</span>
          </label>
          <div class="account-config">
            <label class="field">
              匯入目標帳戶
              <CustomSelect v-model="account.mappedAccountIdDraft" :options="ledgerAccountOptions" placeholder="請選擇帳戶" />
            </label>
            <label class="field">
              顯示名稱（可空白）
              <input v-model.trim="account.userLabelDraft" class="input" type="text" placeholder="例如：薪轉帳戶" />
            </label>
            <button
              class="btn"
              :disabled="savingAccountId === account.id"
              :aria-busy="savingAccountId === account.id"
              @click="saveAccount(connection.id, account)"
            >
              {{ savingAccountId === account.id ? '儲存中...' : '儲存帳戶設定' }}
            </button>
          </div>
        </div>
      </section>

      <section class="sub-panel">
        <h4>同步規則</h4>
        <div class="rule-grid">
          <label class="field">
            同步方向
            <CustomSelect v-model="connection.ruleDraft.direction" :options="directionOptions" />
          </label>
          <label class="field">
            最小金額（元）
            <input v-model.number="connection.ruleDraft.minAmountMajor" class="input" type="number" min="0" step="1" />
          </label>
          <label class="field">
            回溯天數
            <CustomSelect v-model="connection.ruleDraft.lookbackDays" :options="lookbackOptions" />
          </label>
          <label class="field keyword-field">
            排除關鍵字（逗號分隔）
            <textarea v-model="connection.ruleDraft.excludeKeywordText" class="input text-area" rows="2" placeholder="例如：信用卡繳款, 內部轉帳" />
          </label>
          <label class="check-row">
            <input v-model="connection.ruleDraft.includePending" type="checkbox" />
            <span>包含 pending 交易</span>
          </label>
          <button
            class="btn"
            :disabled="savingRuleConnectionId === connection.id"
            :aria-busy="savingRuleConnectionId === connection.id"
            @click="saveRule(connection)"
          >
            {{ savingRuleConnectionId === connection.id ? '儲存中...' : '儲存同步規則' }}
          </button>
        </div>
      </section>
    </article>

    <article v-if="activeConnection" class="card panel review-panel">
      <header class="row review-head">
        <h3>待匯入交易（{{ activeConnection.user_label || activeConnection.provider }}）</h3>
        <button class="btn" :disabled="reviewLoading" :aria-busy="reviewLoading" @click="loadReview(activeConnection.id)">
          {{ reviewLoading ? '載入中...' : '重新載入' }}
        </button>
      </header>

      <div v-if="!reviewRows.length" class="muted">目前沒有待匯入交易。</div>
      <template v-else>
        <div class="row review-action-row">
          <button class="btn" @click="selectAllReviewRows">全選</button>
          <button class="btn" @click="clearReviewSelection">全不選</button>
          <button class="btn" @click="invertReviewSelection">反向選取</button>
          <button class="btn" :disabled="markingSeen || !selectedReviewIds.length" :aria-busy="markingSeen" @click="markSelectedSeen">
            {{ markingSeen ? '標記中...' : '標記已看過' }}
          </button>
          <button class="btn primary" :disabled="importing || !selectedReviewIds.length" :aria-busy="importing" @click="importSelected">
            {{ importing ? '匯入中...' : `匯入勾選 (${selectedReviewIds.length})` }}
          </button>
        </div>

        <ul class="review-list">
          <li v-for="row in reviewRows" :key="row.id" class="review-item">
            <label class="check-row item-head">
              <input :checked="selectedReviewIdSet.has(row.id)" type="checkbox" @change="toggleReviewSelection(row.id, $event)" />
              <span class="item-main">
                <strong>{{ formatAmountMinor(row.amount_minor, row.currency) }}</strong>
                <small class="muted">{{ formatDateTime(row.posted_at) }}</small>
              </span>
              <span class="status-chip" :class="`status-${row.status}`">{{ row.status }}</span>
            </label>
            <div class="item-body">
              <div>{{ row.merchant || row.description || '（無描述）' }}</div>
              <small class="muted">
                {{ row.bank_account_user_label || row.bank_account_name || '-' }}
                → {{ row.mapped_account_name || '未映射帳戶' }}
              </small>
            </div>
          </li>
        </ul>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  connectBankProvider,
  disconnectBankConnection,
  getBankProviderOptions,
  getBankSyncState,
  importSelectedBankTransactions,
  listBankReviewTransactions,
  markBankReviewTransactionsSeen,
  saveBankAccountSettings,
  saveBankSyncRuleSettings,
  syncBankConnectionNow,
} from '@/ui/services/bank-sync.service'

const { t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()

const loadingState = ref(false)
const connecting = ref(false)
const syncingConnectionId = ref('')
const disconnectingConnectionId = ref('')
const savingAccountId = ref('')
const savingRuleConnectionId = ref('')
const reviewLoading = ref(false)
const importing = ref(false)
const markingSeen = ref(false)

const selectedProviderId = ref('')
const connections = ref([])
const activeConnectionId = ref('')
const reviewRows = ref([])
const selectedReviewIds = ref([])

const directionOptions = [
  { value: 'all', label: '全部' },
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
]

const lookbackOptions = [
  { value: 0, label: '0 天' },
  { value: 1, label: '1 天' },
  { value: 3, label: '3 天' },
  { value: 7, label: '7 天' },
]

const providerOptions = computed(() => {
  return getBankProviderOptions().map((item) => ({
    value: item.id,
    label: item.country ? `${item.name} (${item.country})` : item.name,
  }))
})

const ledgerAccountOptions = computed(() => {
  const options = accountStore.accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }))
  return [{ value: '__none__', label: '不設定匯入目標（暫不匯入）' }, ...options]
})

const activeConnection = computed(() => {
  return connections.value.find((item) => item.id === activeConnectionId.value) ?? null
})

const selectedReviewIdSet = computed(() => new Set(selectedReviewIds.value))
const canConnect = computed(() => {
  return Boolean(ledgerStore.activeLedgerId && selectedProviderId.value && !connecting.value)
})

function normalizeConnectionForView(connection) {
  const accounts = Array.isArray(connection?.accounts)
    ? connection.accounts.map((account) => ({
      ...account,
      enabledBool: Boolean(Number(account?.enabled ?? 0)),
      mappedAccountIdDraft: String(account?.mapped_account_id ?? '__none__') || '__none__',
      userLabelDraft: String(account?.user_label ?? ''),
    }))
    : []

  const rule = connection?.rule ?? {}
  return {
    ...connection,
    accounts,
    ruleDraft: {
      direction: String(rule.direction ?? 'all'),
      excludeKeywordText: String(rule.excludeKeywordText ?? ''),
      minAmountMajor: Number(rule.minAmountMinor ?? 0) / 100,
      includePending: Boolean(rule.includePending),
      lookbackDays: Number(rule.lookbackDays ?? 3) || 3,
    },
  }
}

function normalizeActiveConnection() {
  if (!connections.value.length) {
    activeConnectionId.value = ''
    return
  }
  const exists = connections.value.some((item) => item.id === activeConnectionId.value)
  if (exists) return
  activeConnectionId.value = connections.value[0].id
}

async function reloadState({ loadReviewAfter = true } = {}) {
  if (!ledgerStore.activeLedgerId) {
    connections.value = []
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }

  loadingState.value = true
  try {
    await accountStore.load()
    const state = await getBankSyncState(ledgerStore.activeLedgerId)
    connections.value = state.map(normalizeConnectionForView)
    if (!selectedProviderId.value) {
      selectedProviderId.value = providerOptions.value[0]?.value ?? ''
    }
    normalizeActiveConnection()
    if (loadReviewAfter && activeConnectionId.value) {
      await loadReview(activeConnectionId.value)
    }
  } finally {
    loadingState.value = false
  }
}

async function connectProvider() {
  if (!canConnect.value) return
  connecting.value = true
  try {
    const connection = await connectBankProvider(ledgerStore.activeLedgerId, selectedProviderId.value)
    uiStore.pushToast('銀行連結成功')
    await reloadState({ loadReviewAfter: false })
    activeConnectionId.value = connection.id
    await loadReview(connection.id)
  } catch (error) {
    uiStore.pushToast(error?.message || '銀行連結失敗', 'error')
  } finally {
    connecting.value = false
  }
}

async function syncConnection(connectionId) {
  syncingConnectionId.value = connectionId
  try {
    const result = await syncBankConnectionNow(ledgerStore.activeLedgerId, connectionId)
    uiStore.pushToast(`同步完成：新增 ${result.added.length} 筆，更新 ${result.modified.length} 筆`)
    await reloadState({ loadReviewAfter: false })
    activeConnectionId.value = connectionId
    await loadReview(connectionId)
  } catch (error) {
    uiStore.pushToast(error?.message || '同步失敗', 'error')
  } finally {
    syncingConnectionId.value = ''
  }
}

async function disconnectConnection(connectionId) {
  if (!window.confirm('確定要解除此銀行連結？')) return
  disconnectingConnectionId.value = connectionId
  try {
    await disconnectBankConnection(ledgerStore.activeLedgerId, connectionId, {
      softDelete: false,
      clearMirrorData: true,
    })
    uiStore.pushToast('已解除銀行連結')
    await reloadState({ loadReviewAfter: true })
  } catch (error) {
    uiStore.pushToast(error?.message || '解除連結失敗', 'error')
  } finally {
    disconnectingConnectionId.value = ''
  }
}

async function saveAccount(connectionId, account) {
  savingAccountId.value = account.id
  try {
    await saveBankAccountSettings(ledgerStore.activeLedgerId, account.id, {
      enabled: account.enabledBool,
      mappedAccountId: account.mappedAccountIdDraft === '__none__' ? null : account.mappedAccountIdDraft,
      userLabel: account.userLabelDraft,
    })
    uiStore.pushToast('帳戶同步設定已儲存')
    await reloadState({ loadReviewAfter: false })
    if (activeConnectionId.value === connectionId) {
      await loadReview(connectionId)
    }
  } catch (error) {
    uiStore.pushToast(error?.message || '儲存帳戶設定失敗', 'error')
  } finally {
    savingAccountId.value = ''
  }
}

async function saveRule(connection) {
  savingRuleConnectionId.value = connection.id
  try {
    await saveBankSyncRuleSettings(ledgerStore.activeLedgerId, connection.id, {
      direction: connection.ruleDraft.direction,
      excludeKeywordText: connection.ruleDraft.excludeKeywordText,
      minAmountMinor: Math.round(Number(connection.ruleDraft.minAmountMajor ?? 0) * 100),
      includePending: connection.ruleDraft.includePending,
      lookbackDays: Number(connection.ruleDraft.lookbackDays ?? 3),
    })
    uiStore.pushToast('同步規則已儲存')
    await reloadState({ loadReviewAfter: false })
    if (activeConnectionId.value === connection.id) {
      await loadReview(connection.id)
    }
  } catch (error) {
    uiStore.pushToast(error?.message || '儲存規則失敗', 'error')
  } finally {
    savingRuleConnectionId.value = ''
  }
}

function openReview(connectionId) {
  activeConnectionId.value = connectionId
  void loadReview(connectionId)
}

async function loadReview(connectionId) {
  if (!connectionId) {
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }
  reviewLoading.value = true
  try {
    const rows = await listBankReviewTransactions(ledgerStore.activeLedgerId, {
      connectionId,
      includeImported: false,
      limit: 300,
    })
    reviewRows.value = rows
    selectedReviewIds.value = rows.filter((item) => item.defaultSelected).map((item) => item.id)
    await markBankReviewTransactionsSeen(ledgerStore.activeLedgerId, rows.map((item) => item.id))
  } finally {
    reviewLoading.value = false
  }
}

function selectAllReviewRows() {
  selectedReviewIds.value = reviewRows.value.map((item) => item.id)
}

function clearReviewSelection() {
  selectedReviewIds.value = []
}

function invertReviewSelection() {
  const set = new Set(selectedReviewIds.value)
  selectedReviewIds.value = reviewRows.value.map((item) => item.id).filter((id) => !set.has(id))
}

function toggleReviewSelection(id, event) {
  const checked = Boolean(event?.target?.checked)
  const set = new Set(selectedReviewIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  selectedReviewIds.value = Array.from(set)
}

async function importSelected() {
  if (!selectedReviewIds.value.length) return
  importing.value = true
  try {
    const result = await importSelectedBankTransactions(ledgerStore.activeLedgerId, selectedReviewIds.value)
    uiStore.pushToast(`匯入完成：成功 ${result.importedCount} 筆，略過 ${result.skippedCount} 筆`)
    await transactionStore.refreshAfterWriteSafe(2500)
    await loadReview(activeConnectionId.value)
  } catch (error) {
    uiStore.pushToast(error?.message || '匯入失敗', 'error')
  } finally {
    importing.value = false
  }
}

async function markSelectedSeen() {
  if (!selectedReviewIds.value.length) return
  markingSeen.value = true
  try {
    await markBankReviewTransactionsSeen(ledgerStore.activeLedgerId, selectedReviewIds.value)
    uiStore.pushToast('已標記為看過')
    await loadReview(activeConnectionId.value)
  } catch (error) {
    uiStore.pushToast(error?.message || '標記失敗', 'error')
  } finally {
    markingSeen.value = false
  }
}

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString()
}

function formatAmountMinor(amountMinor, currency) {
  const value = Number(amountMinor ?? 0) / 100
  const safeCurrency = String(currency ?? '').trim().toUpperCase() || 'TWD'
  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${safeCurrency}`
  }
}

function connectionStatusText(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'active') return '啟用中'
  if (normalized === 'revoked') return '已停用'
  return '異常'
}

function syncStatusText(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'ok') return '成功'
  if (normalized === 'error') return '失敗'
  return '待同步'
}

onMounted(() => {
  selectedProviderId.value = providerOptions.value[0]?.value ?? ''
  void reloadState({ loadReviewAfter: true })
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void reloadState({ loadReviewAfter: true })
  },
)
</script>

<style scoped>.panel {
  padding: 14px
}
.page-head {
  justify-content: space-between;
  align-items: center
}
h2 {
  margin: 0
}
h3, h4 {
  margin: 0
}
.connect-row {
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-end
}
.provider-field {
  min-width: 220px;
  flex: 1
}
.provider-field > label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-muted)
}
.connection-card {
  display: flex;
  flex-direction: column;
  gap: 12px
}
.connection-head {
  justify-content: space-between;
  align-items: center;
  gap: 12px
}
.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px
}
.title-wrap > small {
  font-size: 12px
}
.status-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--panel) 80%, transparent)
}
.status-active,
.status-ok,
.status-posted {
  color: #0f7a3f;
  background: color-mix(in srgb, #0f7a3f 16%, transparent)
}
.status-revoked,
.status-error,
.status-reversed {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 14%, transparent)
}
.status-pending,
.status-idle {
  color: #7a5200;
  background: color-mix(in srgb, #7a5200 14%, transparent)
}
.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px
}
.meta-list > li {
  display: flex;
  flex-direction: column;
  gap: 2px
}
.action-row {
  gap: 8px;
  flex-wrap: wrap
}
.sub-panel {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px
}
.account-row {
  border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  padding-top: 10px
}
.account-row:first-of-type {
  border-top: none;
  padding-top: 0
}
.account-enable {
  margin-bottom: 8px
}
.account-config {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end
}
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  align-items: end
}
.keyword-field {
  grid-column: 1 / -1
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px
}
.text-area {
  resize: vertical;
  min-height: 72px
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px
}
.review-panel {
  display: flex;
  flex-direction: column;
  gap: 10px
}
.review-head {
  justify-content: space-between;
  align-items: center;
  gap: 10px
}
.review-action-row {
  gap: 8px;
  flex-wrap: wrap
}
.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px
}
.review-item {
  border: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  border-radius: 10px;
  padding: 8px
}
.item-head {
  justify-content: space-between;
  gap: 10px
}
.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1
}
.item-body {
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px
}
@media (max-width: 860px) {
  .account-config {
    grid-template-columns: 1fr
  }
}
</style>
