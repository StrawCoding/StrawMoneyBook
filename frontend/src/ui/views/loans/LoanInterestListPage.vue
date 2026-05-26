<template>
  <section class="stack">
    <header class="row page-head">
      <h2>借貸利息明細</h2>
      <RouterLink class="btn back-btn" :to="{ name: 'loans' }">返回</RouterLink>
    </header>

    <article class="card panel summary">
      <p class="muted compact">
        借出 / 借入歸還超過本金的部分自動計為利息（歸類為「借貸利息」分類）；本頁與代報銷功能完全分離，獨立呈現所有借貸的利息累計與每筆紀錄。
      </p>
      <div class="row">
        <span class="muted">借出利息合計</span>
        <MoneyText :value-minor="loanStore.lendInterestTotalMinor" tone="income" />
      </div>
      <div class="row">
        <span class="muted">借入利息合計</span>
        <MoneyText :value-minor="loanStore.borrowInterestTotalMinor" tone="expense" />
      </div>
    </article>

    <article class="card panel">
      <div class="row list-header">
        <div class="tab-row">
          <button class="btn" :class="{ primary: tab === 'all' }" @click="tab = 'all'">全部</button>
          <button class="btn" :class="{ primary: tab === 'lend' }" @click="tab = 'lend'">借出</button>
          <button class="btn" :class="{ primary: tab === 'borrow' }" @click="tab = 'borrow'">借入</button>
        </div>
        <button class="btn end-btn" @click="refresh">刷新</button>
      </div>

      <ul class="payments">
        <li v-for="payment in visiblePayments" :key="payment.id" class="row pay-item">
          <span class="pay-meta">
            <strong class="counterparty">{{ payment.counterparty_name || '未命名對象' }}</strong>
            <small class="muted">{{ directionLabel(payment.loan_direction) }}・{{ formatDateTime(payment.paid_at) }}</small>
            <small class="muted">帳戶 {{ payment.account_name || '—' }}</small>
          </span>
          <span class="pay-amount-wrap">
            <MoneyText
              :value-minor="payment.interest_component_minor ?? 0"
              :tone="payment.loan_direction === 'lend' ? 'income' : 'expense'"
            />
            <small class="muted">
              本筆{{ collectionLabel(payment.loan_direction) }} <MoneyText :value-minor="payment.amount_minor ?? 0" />
              ・本金 <MoneyText :value-minor="payment.principal_component_minor ?? 0" />
            </small>
            <button class="btn mini-btn" @click="openLoan(payment.loan_id, payment.loan_direction)">查看借貸</button>
          </span>
        </li>
        <li v-if="!visiblePayments.length" class="muted">尚無利息紀錄</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useLoanStore } from '@/ui/stores/loan.store'

const router = useRouter()
const loanStore = useLoanStore()

const tab = ref('all')

const visiblePayments = computed(() => {
  if (tab.value === 'lend' || tab.value === 'borrow') {
    return loanStore.interestPayments.filter((payment) => payment.loan_direction === tab.value)
  }
  return loanStore.interestPayments
})

onMounted(async () => {
  await loanStore.loadInterestPayments()
})

async function refresh() {
  await loanStore.loadInterestPayments()
}

function directionLabel(direction) {
  if (direction === 'lend') return '借出'
  if (direction === 'borrow') return '借入'
  return '—'
}

function collectionLabel(direction) {
  return direction === 'borrow' ? '歸還' : '收回'
}

function openLoan(loanId, direction) {
  if (!loanId) return
  void router.push({
    name: 'loan-detail',
    params: { id: loanId },
    query: {
      tab: direction === 'borrow' ? 'borrow' : 'lend',
      finished: '0',
    },
  })
}

function formatDateTime(value) {
  if (!value) return '—'
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw} 00:00`
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 16)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return raw.replace('T', ' ').slice(0, 16)
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.summary {
  display: grid;
  gap: 6px;
}

.summary .compact {
  margin: 0;
  line-height: 1.45;
}

.list-header {
  align-items: center;
  margin-bottom: 12px;
}

.tab-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.end-btn {
  min-width: 84px;
}

.payments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.pay-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  align-items: flex-start;
}

.pay-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.counterparty {
  font-size: 15px;
  font-weight: 700;
}

.pay-amount-wrap {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.mini-btn {
  font-size: 12px;
  padding: 4px 8px;
}
</style>
