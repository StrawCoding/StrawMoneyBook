<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">代收抵扣紀錄</h2>
      <div class="row header-actions">
        <RouterLink class="btn" :to="{ name: 'reimbursement-advance-manage' }">代收管理</RouterLink>
        <RouterLink class="btn back-btn" :to="{ name: 'reimbursements' }">返回</RouterLink>
      </div>
    </header>

    <article class="card panel summary-panel">
      <div class="summary-row">
        <span class="muted">抵扣筆數</span>
        <strong>{{ records.length }}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">涉及代收</span>
        <strong>{{ usedAdvanceCount }}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">抵扣總額</span>
        <MoneyText :value-minor="usedTotalMinor" />
      </div>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>抵扣清單</h3>
        <small class="muted">已移出代收管理頁</small>
      </header>

      <ul class="record-list">
        <li v-for="record in records" :key="record.id" class="record-item">
          <div class="record-main">
            <div class="row record-head">
              <div class="record-title-wrap">
                <span class="record-title">
                  <font-awesome-icon
                    v-if="advanceCategoryIcon(record)"
                    :icon="advanceCategoryIcon(record)"
                    class="record-icon"
                  />
                  <strong>{{ advanceDisplayName(record) }}</strong>
                </span>
                <small class="muted">帳戶：{{ record.account_name || '未指定帳戶' }}</small>
              </div>
              <MoneyText :value-minor="record.amount_minor" />
            </div>

            <div class="record-meta">
              <small class="muted">來源交易：{{ expenseDisplayName(record) }}</small>
              <small class="muted">交易日期：{{ formatTime(record.expense_occurred_at) }}</small>
              <small class="muted">抵扣時間：{{ formatTime(record.created_at) }}</small>
              <small v-if="record.advance_note" class="muted break-word">代收備註：{{ record.advance_note }}</small>
              <small v-if="record.expense_deleted_at" class="danger-text">來源交易已刪除，可手動清除殘留紀錄。</small>
            </div>
          </div>

          <div class="record-actions">
            <button
              v-if="!record.expense_deleted_at"
              class="btn"
              @click="openOffsetAbout(record)"
            >
              抵扣明細
            </button>
            <button
              v-if="!record.expense_deleted_at"
              class="btn"
              @click="openTransaction(record.expense_tx_id)"
            >
              來源交易
            </button>
            <button
              class="btn danger"
              :disabled="deletingUsageId === record.id"
              @click="openDeleteDialog(record)"
            >
              {{ deletingUsageId === record.id ? '刪除中...' : '刪除紀錄' }}
            </button>
          </div>
        </li>

        <li v-if="!loading && !records.length" class="muted">目前沒有代收抵扣紀錄</li>
        <li v-if="loading" class="muted">載入中...</li>
      </ul>
    </article>

    <AppDialog
      :open="Boolean(deleteTarget)"
      title="刪除抵扣紀錄"
      :message="deleteDialogMessage"
      confirm-text="確認刪除"
      cancel-text="取消"
      loading-text="刪除中..."
      :loading="Boolean(deletingUsageId)"
      @close="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  deleteReimbursementAdvanceUsageEntry,
  listReimbursementAdvanceUsageRecordsData,
} from '@/core/services/reimbursement.service'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'

const router = useRouter()
const ledgerStore = useLedgerStore()
const reimbursementStore = useReimbursementStore()
const uiStore = useUiStore()

const loading = ref(false)
const deletingUsageId = ref('')
const deleteTarget = ref(null)
const records = ref([])

const usedAdvanceCount = computed(() => {
  return new Set(records.value.map((item) => String(item?.advance_id ?? '').trim()).filter(Boolean)).size
})
const usedTotalMinor = computed(() => {
  return records.value.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item?.amount_minor ?? 0))), 0)
})
const deleteDialogMessage = computed(() => {
  if (!deleteTarget.value) return ''
  return `確定要刪除這筆抵扣紀錄？\n${expenseDisplayName(deleteTarget.value)}`
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void load()
  },
)

onMounted(() => {
  void load()
})

async function load() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    records.value = []
    return
  }

  loading.value = true
  try {
    records.value = await listReimbursementAdvanceUsageRecordsData(ledgerId)
  } catch (error) {
    records.value = []
    uiStore.pushToast(error.message ?? '載入抵扣紀錄失敗', 'error')
  } finally {
    loading.value = false
  }
}

function advanceDisplayName(record) {
  const name = String(record?.category_name ?? '').trim()
  if (name) return name
  const note = String(record?.advance_note ?? '').trim()
  return note || '代收'
}

function advanceCategoryIcon(record) {
  return String(record?.category_icon ?? '').trim()
}

function expenseDisplayName(record) {
  const categoryName = String(record?.expense_category_name ?? '').trim()
  if (categoryName) return categoryName
  const noteText = stripAddonSummaryFromNote(record?.expense_note)
  if (noteText) return noteText
  return String(record?.expense_tx_id ?? '').trim() || '來源交易'
}

function openTransaction(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-about', params: { id: txId } })
}

function openOffsetAbout(record) {
  const txId = String(record?.expense_tx_id ?? '').trim()
  if (!txId) return
  void router.push({ name: 'reimbursement-offset-about', params: { id: txId }, query: { tab: 'reimbursed' } })
}

function openDeleteDialog(record) {
  const usageId = String(record?.id ?? '').trim()
  if (!usageId || deletingUsageId.value) return
  deleteTarget.value = record
}

function closeDeleteDialog() {
  if (deletingUsageId.value) return
  deleteTarget.value = null
}

async function confirmDelete() {
  const ledgerId = ledgerStore.activeLedgerId
  const usageId = String(deleteTarget.value?.id ?? '').trim()
  if (!ledgerId || !usageId || deletingUsageId.value) return

  deletingUsageId.value = usageId
  try {
    await deleteReimbursementAdvanceUsageEntry(ledgerId, usageId)
    await Promise.all([load(), reimbursementStore.load()])
    deleteTarget.value = null
    uiStore.pushToast('抵扣紀錄已刪除')
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除抵扣紀錄失敗', 'error')
  } finally {
    deletingUsageId.value = ''
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-header,
.panel-head,
.record-head {
  align-items: center;
}

.header-actions {
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.page-title,
h3 {
  margin: 0;
}

.summary-panel {
  display: grid;
  gap: 10px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.record-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.record-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 12px;
}

.record-main,
.record-title-wrap,
.record-meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.record-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.record-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.record-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.danger-text {
  color: var(--danger, #c62828);
}

.break-word {
  overflow-wrap: anywhere;
}
</style>
