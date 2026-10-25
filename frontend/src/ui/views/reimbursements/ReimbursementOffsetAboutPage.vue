<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('reimbursement.offset_about_title') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="detail" class="card panel">
      <header class="row panel-head">
        <div>
          <h3>{{ sourceTitle }}</h3>
          <small class="muted">{{ formatTime(detail.sourceTx.occurred_at) }}</small>
        </div>
        <MoneyText :value-minor="sourceAmountMinor" />
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">{{ t('reimbursement.original_expense') }}</small>
          <MoneyText :value-minor="sourceAmountMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('reimbursement.advance_offset') }}</small>
          <MoneyText :value-minor="detail.offsetMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('reimbursement.cash_in') }}</small>
          <MoneyText :value-minor="detail.cashMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('reimbursement.total_reimbursed') }}</small>
          <MoneyText :value-minor="detail.settledMinor" />
        </div>
      </div>

      <p class="muted notice">
        {{ t('reimbursement.offset_no_transfer_hint') }}
      </p>

      <div class="row action-row">
        <button class="btn" @click="openTransaction(detail.sourceTx.id)">{{ t('reimbursement.source_tx') }}</button>
        <button v-if="detail.cashTx?.id" class="btn" @click="openTransaction(detail.cashTx.id)">{{ t('reimbursement.cash_in') }}</button>
      </div>
    </article>

    <article v-if="detail" class="card panel">
      <header class="row panel-head">
        <h3>{{ t('reimbursement.offset_items') }}</h3>
        <span class="badge">{{ detail.usages.length }}</span>
      </header>

      <ul class="usage-list">
        <li v-for="usage in detail.usages" :key="usage.id" class="usage-item">
          <div class="usage-main">
            <div class="usage-title">
              <font-awesome-icon v-if="usage.category_icon" :icon="usage.category_icon" class="usage-icon" />
              <strong>{{ usageDisplayName(usage) }}</strong>
            </div>
            <small class="muted">{{ t('reimbursement_advance_usage.account_prefix') }}{{ usage.account_name || t('common.unknown_account') }}</small>
            <small v-if="usage.advance_note" class="muted break-word">{{ usage.advance_note }}</small>
          </div>
          <MoneyText :value-minor="usage.amount_minor" />
        </li>
        <li v-if="!detail.usages.length" class="muted">{{ t('reimbursement.no_offset') }}</li>
      </ul>
    </article>

    <article v-if="!detail && !loading" class="card panel">
      <p class="muted">{{ t('reimbursement.offset_not_found') }}</p>
    </article>
  </section>
</template>

<script setup>
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { getReimbursementOffsetDetail } from '@/core/services/reimbursement.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const loading = ref(false)
const detail = ref(null)

const expenseTxId = computed(() => String(route.params.id ?? ''))
const backLink = computed(() => ({
  name: 'reimbursements',
  query: { tab: route.query.tab === 'pending' ? 'pending' : 'reimbursed' },
}))
const sourceTitle = computed(() => {
  const categoryName = String(detail.value?.sourceTx?.category_name ?? '').trim()
  if (categoryName) return categoryName
  const noteText = String(detail.value?.sourceTx?.note ?? '').trim()
  if (noteText) return noteText
  return t('reimbursement.source_reimbursement')
})
const sourceAmountMinor = computed(() => Math.abs(Math.round(Number(detail.value?.sourceTx?.amount_minor ?? 0))))

watch(
  () => [ledgerStore.activeLedgerId, expenseTxId.value],
  () => {
    void load()
  },
)

onMounted(() => {
  void load()
})

async function load() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !expenseTxId.value) {
    detail.value = null
    return
  }

  loading.value = true
  try {
    detail.value = await getReimbursementOffsetDetail(ledgerId, expenseTxId.value)
  } catch (error) {
    detail.value = null
    uiStore.pushToast(error.message ?? t('reimbursement.offset_load_failed'), 'error')
  } finally {
    loading.value = false
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

function openTransaction(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-about', params: { id: txId } })
}

function usageDisplayName(usage) {
  const name = String(usage?.category_name ?? '').trim()
  if (name) return name
  const note = String(usage?.advance_note ?? '').trim()
  return note || t('reimbursement_advance_usage.default_advance_name')
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-header,
.panel-head,
.action-row {
  align-items: center;
}

.page-title,
h3 {
  margin: 0;
}

.detail-grid {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.notice {
  margin: 12px 0 0;
}

.action-row {
  margin-top: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.usage-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.usage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.usage-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.usage-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.usage-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.break-word {
  overflow-wrap: anywhere;
}
</style>
