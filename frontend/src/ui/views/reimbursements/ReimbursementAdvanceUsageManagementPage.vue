<template>
  <HabitatPageShell
    :title="t('reimbursement.offset_records')"
    :kicker="t('reimbursement.habitat_hello')"
    test-id="reimbursement-offset-view"
    back-to="/reimbursements"
  >

    <article class="card panel summary-panel">
      <div class="summary-row">
        <span class="muted">{{ t('reimbursement_advance_usage.count_label') }}</span>
        <strong>{{ records.length }}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">{{ t('reimbursement_advance_usage.advance_count_label') }}</span>
        <strong>{{ usedAdvanceCount }}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">{{ t('reimbursement_advance_usage.total_label') }}</span>
        <MoneyText :value-minor="usedTotalMinor" />
      </div>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('reimbursement_advance_usage.list_title') }}</h3>
        <small class="muted">{{ t('reimbursement_advance_usage.list_note') }}</small>
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
                <small class="muted">{{ t('reimbursement_advance_usage.account_prefix') }}{{ record.account_name || t('savings_jar.activity.unknown_account') }}</small>
              </div>
              <MoneyText :value-minor="record.amount_minor" />
            </div>

            <div class="record-meta">
              <small class="muted">{{ t('reimbursement_advance_usage.source_tx_prefix') }}{{ expenseDisplayName(record) }}</small>
              <small class="muted">{{ t('reimbursement_advance_usage.tx_date_prefix') }}{{ formatTime(record.expense_occurred_at) }}</small>
              <small class="muted">{{ t('reimbursement_advance_usage.offset_time_prefix') }}{{ formatTime(record.created_at) }}</small>
              <small v-if="record.advance_note" class="muted break-word">{{ t('reimbursement_advance_usage.advance_note_prefix') }}{{ record.advance_note }}</small>
              <small v-if="record.expense_deleted_at" class="danger-text">{{ t('reimbursement_advance_usage.source_deleted_warning') }}</small>
            </div>
          </div>

          <div class="record-actions">
            <button
              v-if="!record.expense_deleted_at"
              class="btn"
              @click="openOffsetAbout(record)"
            >
              {{ t('reimbursement_advance_usage.detail_button') }}
            </button>
            <button
              v-if="!record.expense_deleted_at"
              class="btn"
              @click="openTransaction(record.expense_tx_id)"
            >
              {{ t('reimbursement_advance_usage.source_tx_button') }}
            </button>
            <button
              class="btn danger"
              :disabled="deletingUsageId === record.id"
              @click="openDeleteDialog(record)"
            >
              {{ deletingUsageId === record.id ? t('reimbursement_advance_usage.deleting') : t('reimbursement_advance_usage.delete_button') }}
            </button>
          </div>
        </li>

        <li v-if="!loading && !records.length" class="muted">{{ t('reimbursement_advance_usage.empty') }}</li>
        <li v-if="loading" class="muted">{{ t('common.processing') }}</li>
      </ul>
    </article>

    <AppDialog
      :open="Boolean(deleteTarget)"
      :title="t('reimbursement_advance_usage.delete_dialog_title')"
      :message="deleteDialogMessage"
      :confirm-text="t('reimbursement_advance_usage.delete_dialog_confirm')"
      :cancel-text="t('common.cancel')"
      :loading-text="t('reimbursement_advance_usage.deleting')"
      :loading="Boolean(deletingUsageId)"
      @close="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
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
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const reimbursementStore = useReimbursementStore()
const uiStore = useUiStore()
const { t } = useI18n()

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
  return t('reimbursement_advance_usage.delete_dialog_message', { name: expenseDisplayName(deleteTarget.value) })
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
    uiStore.pushToast(error.message ?? t('reimbursement_advance_usage.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function advanceDisplayName(record) {
  const name = String(record?.category_name ?? '').trim()
  if (name) return name
  const note = String(record?.advance_note ?? '').trim()
  return note || t('reimbursement_advance_usage.default_advance_name')
}

function advanceCategoryIcon(record) {
  return String(record?.category_icon ?? '').trim()
}

function expenseDisplayName(record) {
  const categoryName = String(record?.expense_category_name ?? '').trim()
  if (categoryName) return categoryName
  const noteText = stripAddonSummaryFromNote(record?.expense_note)
  if (noteText) return noteText
  return String(record?.expense_tx_id ?? '').trim() || t('reimbursement_advance_usage.default_source_tx_name')
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
    uiStore.pushToast(t('reimbursement_advance_usage.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('reimbursement_advance_usage.toast.delete_failed'), 'error')
  } finally {
    deletingUsageId.value = ''
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(resolveIntlLocale(), {
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
