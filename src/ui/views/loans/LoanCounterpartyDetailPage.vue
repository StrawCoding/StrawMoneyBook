<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ counterpartyName }}</h2>
        <RouterLink class="btn back-btn" :to="backLink">返回</RouterLink>
      </header>
      <div class="row summary-row">
        <span class="muted">{{ summaryLabel }}</span>
        <MoneyText :value-minor="outstandingMinor" />
      </div>
      <div class="row summary-row">
        <span class="muted">進行中筆數</span>
        <span class="badge">{{ activeCount }}</span>
      </div>
    </article>

    <article class="card panel">
      <div class="row list-header">
        <div class="tab-row">
          <button class="btn" :class="{ primary: tab === 'lend' }" @click="tab = 'lend'">借出</button>
          <button class="btn" :class="{ primary: tab === 'borrow' }" @click="tab = 'borrow'">借入</button>
        </div>
        <button class="btn end-btn" :class="{ primary: showFinished }" @click="showFinished = !showFinished">
          {{ showFinished ? '進行中' : '已結束' }}
        </button>
      </div>

      <ul class="list">
        <li v-for="loan in visibleLoans" :key="loan.id" class="entry">
          <div class="row">
            <strong>{{ loan.counterparty_name || '未命名對象' }}</strong>
            <span class="badge" :class="loan.status">{{ statusLabel(loan.status) }}</span>
          </div>

          <div class="row muted">
            <span>{{ loan.direction === 'lend' ? '借出' : '借入' }}</span>
            <span>{{ loan.start_date }}{{ loan.due_date ? ` ~ ${loan.due_date}` : '' }}</span>
          </div>

          <div class="row">
            <small class="muted">本金</small>
            <MoneyText :value-minor="loan.principal_minor" />
          </div>
          <div class="row">
            <small class="muted">已還</small>
            <MoneyText :value-minor="loan.paid_minor" />
          </div>
          <div class="row">
            <small class="muted">剩餘</small>
            <MoneyText :value-minor="loan.remaining_minor" />
          </div>

          <div class="row btn-wrap">
            <button v-if="!showFinished" class="btn" @click="openRepaySheet(loan)" :disabled="!canRepay(loan)">還款</button>
            <button class="btn" @click="showDetail(loan.id)">
              {{ loanStore.detail?.loan?.id === loan.id ? '收起' : '明細' }}
            </button>
            <button v-if="!showFinished" class="btn" @click="markVoid(loan.id)" :disabled="loan.status !== 'active'">作廢</button>
          </div>

          <transition name="collapse-fade">
            <div v-if="loanStore.detail?.loan?.id === loan.id" class="detail">
              <div class="row">
                <strong>還款紀錄</strong>
                <button class="btn" @click="loanStore.loadDetail(loan.id)">刷新</button>
              </div>
              <ul class="payments">
                <li v-for="payment in loanStore.detail?.payments ?? []" :key="payment.id" class="row pay-item">
                  <span>{{ payment.paid_at }}</span>
                  <MoneyText :value-minor="payment.amount_minor" />
                </li>
                <li v-if="!(loanStore.detail?.payments ?? []).length" class="muted">尚無還款紀錄</li>
              </ul>
            </div>
          </transition>
        </li>
        <li v-if="visibleLoans.length === 0" class="muted">{{ showFinished ? '目前沒有已結束借貸' : '目前沒有進行中借貸' }}</li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="repayOpen" class="sheet-mask" @click.self="closeRepaySheet">
          <article class="sheet card">
            <header class="row">
              <h3>借貸還款</h3>
              <button class="btn" @click="closeRepaySheet">關閉</button>
            </header>

            <div class="stack form-wrap">
              <p class="muted">{{ repayLoan?.counterparty_name }} / 剩餘 <MoneyText :value-minor="repayLoan?.remaining_minor ?? 0" /></p>
              <label>
                還款金額（元）
                <input v-model.number="repayForm.amountMajor" class="input" type="number" min="0" step="1" />
              </label>

              <label>
                帳戶
                <CustomSelect v-model="repayForm.accountId" :options="accountStore.accounts" />
              </label>

              <label>
                備註
                <textarea v-model="repayForm.note" class="textarea" rows="2" />
              </label>
            </div>

            <footer class="row">
              <button class="btn" @click="closeRepaySheet">取消</button>
              <button class="btn primary" @click="submitRepayment">儲存</button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'

const route = useRoute()
const loanStore = useLoanStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const transactionStore = useTransactionStore()
const budgetStore = useBudgetStore()

const repayOpen = ref(false)
const repayLoan = ref(null)
const tab = ref('lend')
const showFinished = ref(false)

const repayForm = reactive({
  amountMajor: null,
  accountId: '',
  note: '',
})

const counterpartyName = computed(() => normalizeCounterpartyName(route.query.name))
const backLink = computed(() => ({
  name: 'loans',
  query: {
    tab: tab.value,
    finished: showFinished.value ? '1' : '0',
  },
}))
const defaultAccountId = computed(() => accountStore.accounts[0]?.id ?? '')
const loansByCounterpartyAndTab = computed(() => {
  return loanStore.items.filter((loan) => {
    if (loan.direction !== tab.value) return false
    return normalizeCounterpartyName(loan.counterparty_name) === counterpartyName.value
  })
})
const visibleLoans = computed(() => {
  if (showFinished.value) {
    return loansByCounterpartyAndTab.value.filter((loan) => ['settled', 'void'].includes(loan.status))
  }
  return loansByCounterpartyAndTab.value.filter((loan) => ['active', 'partial'].includes(loan.status))
})
const outstandingMinor = computed(() => {
  return loansByCounterpartyAndTab.value
    .filter((loan) => ['active', 'partial', 'settled'].includes(loan.status))
    .reduce((total, loan) => total + Number(loan.remaining_minor ?? 0), 0)
})
const activeCount = computed(() => {
  return loansByCounterpartyAndTab.value.filter((loan) => ['active', 'partial'].includes(loan.status)).length
})
const summaryLabel = computed(() => {
  return tab.value === 'lend' ? '該人欠你' : '你欠該人'
})

onMounted(() => {
  syncTabFromRoute(route.query.tab)
  syncFinishedFromRoute(route.query.finished)
  loanStore.load()
})

watch(
  () => route.query.tab,
  (tabValue) => {
    syncTabFromRoute(tabValue)
  },
)

watch(
  () => route.query.finished,
  (value) => {
    syncFinishedFromRoute(value)
  },
)

function syncTabFromRoute(tabValue) {
  tab.value = tabValue === 'borrow' ? 'borrow' : 'lend'
}

function syncFinishedFromRoute(value) {
  showFinished.value = value === '1' || value === 'true'
}

function normalizeCounterpartyName(rawName) {
  return String(rawName ?? '').trim() || '未命名對象'
}

function statusLabel(status) {
  const map = {
    active: '進行中',
    partial: '部分償還',
    settled: '已結清',
    void: '作廢',
  }
  return map[status] ?? status
}

function canRepay(loan) {
  return ['active', 'partial'].includes(loan.status)
}

function openRepaySheet(loan) {
  repayLoan.value = loan
  repayOpen.value = true
  repayForm.amountMajor = Number(loan.remaining_minor ?? 0) / 100
  repayForm.accountId = defaultAccountId.value
  repayForm.note = ''
}

function closeRepaySheet() {
  repayOpen.value = false
  repayLoan.value = null
}

async function submitRepayment() {
  if (!repayLoan.value) return

  try {
    await loanStore.repay({
      loanId: repayLoan.value.id,
      accountId: repayForm.accountId,
      amountMinor: Math.round(Number(repayForm.amountMajor ?? 0) * 100),
      note: repayForm.note,
      paidAt: new Date().toISOString(),
    })

    await Promise.all([transactionStore.loadRecent(), budgetStore.loadMonth(budgetStore.monthKey), accountStore.load()])

    uiStore.pushToast('還款已記錄')
    closeRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? '還款失敗', 'error')
  }
}

async function markVoid(loanId) {
  const ok = window.confirm('確定要作廢這筆借貸？')
  if (!ok) return

  try {
    await loanStore.markVoid(loanId)
    uiStore.pushToast('借貸已作廢')
  } catch (error) {
    uiStore.pushToast(error.message ?? '作廢失敗', 'error')
  }
}

function showDetail(loanId) {
  if (loanStore.detail?.loan?.id === loanId) {
    loanStore.detail = null
    return
  }
  loanStore.loadDetail(loanId)
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.summary-row {
  align-items: center
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px
}
.tab-row {
  display: flex;
  gap: 8px
}
.list-header {
  align-items: center;
  margin-bottom: 12px
}
.end-btn {
  min-width: 84px
}
.entry {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 6px
}
.badge.partial {
  background: var(--chip-warn-bg)
}
.badge.settled {
  background: var(--chip-ok-bg)
}
.badge.void {
  background: var(--chip-danger-bg)
}
.btn-wrap {
  justify-content: flex-end
}
.detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border)
}
.payments {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 6px
}
.pay-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px
}
.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: flex-end;
  z-index: 70
}
.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
.form-wrap {
  margin-top: 10px
}
label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px
}</style>
