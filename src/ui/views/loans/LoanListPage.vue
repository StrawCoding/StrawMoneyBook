<template>
  <section class="stack">
    <article class="card panel summary">
      <header class="row">
        <h2>借貸清單</h2>
        <button class="btn primary" @click="openCreateSheet">新增借貸</button>
      </header>
      <div class="row">
        <span class="muted">進行中</span>
        <span class="badge">{{ loanStore.summary.activeCount }}</span>
      </div>
      <div class="row">
        <span class="muted">應收</span>
        <MoneyText :value-minor="loanStore.summary.totalReceivable" />
      </div>
      <div class="row">
        <span class="muted">應付</span>
        <MoneyText :value-minor="loanStore.summary.totalPayable" />
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

      <ul v-if="counterpartyGroups.length" class="counterparty-list">
        <li v-for="group in counterpartyGroups" :key="group.key">
          <button class="counterparty-btn" @click="openCounterpartyDetail(group.name)">
            <span class="counterparty-name">{{ group.name }}</span>
            <span class="row counterparty-meta">
              <span class="muted">{{ group.items.length }} 筆</span>
              <MoneyText :value-minor="group.remainingMinor" />
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="muted">{{ showFinished ? '目前沒有已結束借貸' : '目前沒有進行中借貸' }}</p>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="createOpen" class="sheet-mask" @click.self="closeCreateSheet">
          <article class="sheet card">
            <header class="row">
              <h3>新增借貸</h3>
              <button class="btn" @click="closeCreateSheet">關閉</button>
            </header>

            <div class="stack form-wrap">
              <label>
                借貸方向
                <CustomSelect v-model="createForm.direction" :options="directionOptions" />
              </label>

              <label>
                對象名稱
                <input v-model="createForm.counterpartyName" class="input" />
              </label>

              <label>
                本金（元）
                <input v-model.number="createForm.principalMajor" class="input" type="number" min="0" step="1" />
              </label>

              <label>
                預設利息（元，可選）
                <input v-model.number="createForm.interestMajor" class="input" type="number" min="0" step="1" />
              </label>

              <div class="field-block">
                <span class="field-label">開始日期</span>
                <div class="date-picker-wrap">
                  <DateTimePickerField
                    :date="createForm.startDate"
                    :hour="createForm.startHour"
                    :minute="createForm.startMinute"
                    prefer-bottom-anchor
                    @update:date="pickCreateStartDate"
                    @update:hour="pickCreateStartHour"
                    @update:minute="pickCreateStartMinute"
                  />
                </div>
              </div>

              <div class="field-block">
                <span class="field-label">到期日（可選）</span>
                <div class="row due-date-row">
                  <div class="due-picker-wrap">
                    <DateTimePickerField
                      :date="createForm.dueDate"
                      :hour="createForm.dueHour"
                      :minute="createForm.dueMinute"
                      prefer-bottom-anchor
                      @update:date="pickCreateDueDate"
                      @update:hour="pickCreateDueHour"
                      @update:minute="pickCreateDueMinute"
                    />
                  </div>
                  <button class="btn mini-btn" type="button" @click="clearCreateDueDate">清除</button>
                </div>
              </div>

              <label>
                建立入帳帳戶
                <CustomSelect v-model="createForm.accountId" :options="accountStore.accounts" />
              </label>

              <label>
                備註
                <textarea v-model="createForm.note" class="textarea" rows="2" />
              </label>
            </div>

            <footer class="row">
              <button class="btn" @click="closeCreateSheet">取消</button>
              <button class="btn primary" @click="createLoan">儲存</button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'

const route = useRoute()
const router = useRouter()
const loanStore = useLoanStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const transactionStore = useTransactionStore()
const budgetStore = useBudgetStore()

const createOpen = ref(false)
const tab = ref('lend')
const showFinished = ref(false)
const directionOptions = [
  { value: 'lend', label: '借出（應收）' },
  { value: 'borrow', label: '借入（應付）' },
]

const createForm = reactive({
  direction: 'lend',
  counterpartyName: '',
  principalMajor: null,
  interestMajor: null,
  startDate: new Date().toISOString().slice(0, 10),
  startHour: new Date().getHours(),
  startMinute: new Date().getMinutes(),
  dueDate: '',
  dueHour: new Date().getHours(),
  dueMinute: new Date().getMinutes(),
  accountId: '',
  note: '',
})

const defaultAccountId = computed(() => accountStore.accounts[0]?.id ?? '')
const loansByTab = computed(() => loanStore.items.filter((loan) => loan.direction === tab.value))
const visibleLoans = computed(() => {
  if (showFinished.value) {
    return loansByTab.value.filter((loan) => ['settled', 'void'].includes(loan.status))
  }
  return loansByTab.value.filter((loan) => ['active', 'partial'].includes(loan.status))
})
const counterpartyGroups = computed(() => {
  const groups = new Map()
  for (const loan of visibleLoans.value) {
    const name = normalizeCounterpartyName(loan.counterparty_name)
    if (!groups.has(name)) {
      groups.set(name, {
        key: name,
        name,
        items: [],
        remainingMinor: 0,
      })
    }
    const group = groups.get(name)
    group.items.push(loan)
    group.remainingMinor += Number(loan.remaining_minor ?? 0)
  }
  return Array.from(groups.values())
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

function openCounterpartyDetail(name) {
  void router.push({
    name: 'loan-counterparty-detail',
    query: {
      name,
      tab: tab.value,
      finished: showFinished.value ? '1' : '0',
    },
  })
}

function openCreateSheet() {
  const now = new Date()
  createOpen.value = true
  createForm.direction = 'lend'
  createForm.counterpartyName = ''
  createForm.principalMajor = null
  createForm.interestMajor = null
  createForm.startDate = now.toISOString().slice(0, 10)
  createForm.startHour = now.getHours()
  createForm.startMinute = now.getMinutes()
  createForm.dueDate = ''
  createForm.dueHour = now.getHours()
  createForm.dueMinute = now.getMinutes()
  createForm.accountId = defaultAccountId.value
  createForm.note = ''
}

function closeCreateSheet() {
  createOpen.value = false
}

function pickCreateStartDate(value) {
  createForm.startDate = String(value ?? '')
}

function pickCreateStartHour(value) {
  createForm.startHour = Number(value ?? 0)
}

function pickCreateStartMinute(value) {
  createForm.startMinute = Number(value ?? 0)
}

function pickCreateDueDate(value) {
  createForm.dueDate = String(value ?? '')
}

function pickCreateDueHour(value) {
  createForm.dueHour = Number(value ?? 0)
}

function pickCreateDueMinute(value) {
  createForm.dueMinute = Number(value ?? 0)
}

function clearCreateDueDate() {
  createForm.dueDate = ''
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatLoanDateTime(date, hour, minute) {
  return `${date} ${pad2(hour)}:${pad2(minute)}`
}

function toIsoFromDateTime(date, hour, minute) {
  const parsed = new Date(`${date}T${pad2(hour)}:${pad2(minute)}:00`)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

async function createLoan() {
  try {
    await loanStore.create({
      direction: createForm.direction,
      counterpartyName: createForm.counterpartyName,
      principalMinor: Math.round(Number(createForm.principalMajor ?? 0) * 100),
      interestMinor: Math.round(Number(createForm.interestMajor ?? 0) * 100),
      startDate: formatLoanDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      dueDate: createForm.dueDate
        ? formatLoanDateTime(createForm.dueDate, createForm.dueHour, createForm.dueMinute)
        : null,
      occurredAt: toIsoFromDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      accountId: createForm.accountId,
      note: createForm.note,
    })

    await Promise.all([transactionStore.loadRecent(), budgetStore.loadMonth(budgetStore.monthKey), accountStore.load()])

    uiStore.pushToast('借貸已建立')
    closeCreateSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? '建立借貸失敗', 'error')
  }
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.summary {
  display: grid;
  gap: 8px
}
.counterparty-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
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
.counterparty-btn {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--card) 94%, #111 6%);
  color: var(--text);
  text-align: left;
  display: grid;
  gap: 6px
}
.counterparty-name {
  font-size: 16px;
  font-weight: 700
}
.counterparty-meta {
  justify-content: space-between
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
.field-block {
  display: grid;
  gap: 6px
}
.field-label {
  color: var(--muted);
  font-size: 13px
}
.date-picker-wrap {
  width: min(220px, 100%)
}
.due-date-row {
  gap: 8px;
  align-items: center
}
.due-picker-wrap {
  flex: 0 1 220px;
  min-width: 0;
  max-width: 220px
}
.due-date-row .mini-btn {
  flex: 0 0 auto
}
label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px
}</style>
