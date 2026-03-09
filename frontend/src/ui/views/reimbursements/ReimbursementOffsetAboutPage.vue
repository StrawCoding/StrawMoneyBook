<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">代收抵消明細</h2>
      <RouterLink class="btn back-btn" :to="backLink">返回</RouterLink>
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
          <small class="muted">原支出</small>
          <MoneyText :value-minor="sourceAmountMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">代收抵消</small>
          <MoneyText :value-minor="detail.offsetMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">現金入帳</small>
          <MoneyText :value-minor="detail.cashMinor" />
        </div>
        <div class="detail-row">
          <small class="muted">合計已報銷</small>
          <MoneyText :value-minor="detail.settledMinor" />
        </div>
      </div>

      <p class="muted notice">
        代收抵消可使用不同帳戶，這裡只會扣代收可用金額，不會另外建立轉帳。
      </p>

      <div class="row action-row">
        <button class="btn" @click="openTransaction(detail.sourceTx.id)">來源交易</button>
        <button v-if="detail.cashTx?.id" class="btn" @click="openTransaction(detail.cashTx.id)">現金入帳</button>
      </div>
    </article>

    <article v-if="detail" class="card panel">
      <header class="row panel-head">
        <h3>抵消項目</h3>
        <span class="badge">{{ detail.usages.length }}</span>
      </header>

      <ul class="usage-list">
        <li v-for="usage in detail.usages" :key="usage.id" class="usage-item">
          <div class="usage-main">
            <div class="usage-title">
              <font-awesome-icon v-if="usage.category_icon" :icon="usage.category_icon" class="usage-icon" />
              <strong>{{ usage.category_name || '未指定分類' }}</strong>
            </div>
            <small class="muted">帳戶：{{ usage.account_name || '未指定帳戶' }}</small>
            <small v-if="usage.advance_note" class="muted break-word">{{ usage.advance_note }}</small>
          </div>
          <MoneyText :value-minor="usage.amount_minor" />
        </li>
        <li v-if="!detail.usages.length" class="muted">這筆報銷目前沒有代收抵消。</li>
      </ul>
    </article>

    <article v-if="!detail && !loading" class="card panel">
      <p class="muted">找不到抵消資料，可能尚未使用代收抵扣。</p>
    </article>
  </section>
</template>

<script setup>
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
  return '來源報銷交易'
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
    uiStore.pushToast(error.message ?? '載入抵消資料失敗', 'error')
  } finally {
    loading.value = false
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

function openTransaction(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-about', params: { id: txId } })
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
