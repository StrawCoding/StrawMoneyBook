<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ counterpartyName }}</h2>
        <div class="row head-actions">
          <button class="btn primary" @click="openCreateSheet">新增借貸</button>
          <RouterLink class="btn back-btn" :to="backLink">返回</RouterLink>
        </div>
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
        <li
          v-for="loan in visibleLoans"
          :key="loan.id"
          class="entry clickable-entry"
          role="button"
          tabindex="0"
          @click="openLoanDetail(loan.id)"
        >
          <div class="entry-body">
            <div class="icon-col">
              <font-awesome-icon :icon="loanDirectionIcon(loan)" class="loan-icon" />
            </div>

            <div class="entry-content">
              <div class="row item-main">
                <span class="row item-block">
                  <small class="muted">金額</small>
                  <MoneyText :value-minor="loan.principal_minor" />
                </span>
                <span class="row item-block">
                  <small class="muted">{{ loan.direction === 'lend' ? '收回' : '歸還' }}</small>
                  <MoneyText :value-minor="loan.paid_minor ?? 0" />
                </span>
              </div>

              <div class="row item-meta">
                <span class="row item-block">
                  <small class="muted">帳戶</small>
                  <span class="item-value">{{ loan.setup_account_name || '—' }}</span>
                </span>
                <span class="row item-block">
                  <small class="muted">日期</small>
                  <span class="item-value">{{ formatDateTime(loan.setup_occurred_at || loan.created_at) }}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="row btn-wrap">
            <button v-if="!showFinished" class="btn" @click.stop="openRepaySheet(loan)" :disabled="!canRepay(loan)">{{ collectionLabel(loan) }}</button>
            <button v-if="!showFinished" class="btn" @click.stop="openVoidDialog(loan.id)" :disabled="loan.status === 'void'">完成</button>
            <button v-if="showFinished && loan.status === 'void'" class="btn" @click.stop="markRestore(loan.id)">恢復</button>
            <button v-if="canDeleteLoan(loan)" class="btn danger" @click.stop="openDeleteDialog(loan.id)">刪除</button>
          </div>
        </li>
        <li v-if="visibleLoans.length === 0" class="muted">{{ showFinished ? '目前沒有已結束借貸' : '目前沒有進行中借貸' }}</li>
      </ul>
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

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="repayOpen" class="sheet-mask" @click.self="closeRepaySheet">
          <article class="sheet card">
            <header class="row">
              <h3>借貸{{ collectionLabel(repayLoan) }}</h3>
              <button class="btn" @click="closeRepaySheet">關閉</button>
            </header>

            <div class="stack form-wrap">
              <p class="muted">{{ repayLoan?.counterparty_name }} / 剩餘 <MoneyText :value-minor="repayLoan?.remaining_minor ?? 0" /></p>
              <label>
                {{ collectionLabel(repayLoan) }}金額（元）
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

    <AppDialog
      :open="confirmDialog.open"
      :title="confirmDialog.type === 'void' ? '完成借貸' : '刪除借貸'"
      :message="confirmDialog.type === 'void' ? '確定要完成這筆借貸？不會刪除交易紀錄' : '確定要刪除這筆借貸？此動作無法復原'"
      :loading="confirmDialog.loading"
      :confirm-text="confirmDialog.type === 'void' ? '確認完成' : '確認刪除'"
      @close="closeConfirmDialog"
      @confirm="confirmDialogAction"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
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

const repayOpen = ref(false)
const repayLoan = ref(null)
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

const repayForm = reactive({
  amountMajor: null,
  accountId: '',
  note: '',
})
const confirmDialog = reactive({
  open: false,
  loading: false,
  type: 'void',
  loanId: '',
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
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
  syncTabFromRoute(route.query.tab)
  syncFinishedFromRoute(route.query.finished)
  void Promise.all([loanStore.load(), accountStore.load()])
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
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

function collectionLabel(item) {
  return item?.direction === 'borrow' ? '歸還' : '收回'
}

async function refreshLinkedData() {
  await Promise.all([
    transactionStore.loadRecent(),
    budgetStore.loadMonth(budgetStore.monthKey),
    accountStore.load(),
  ])
}

function canRepay(loan) {
  return ['active', 'partial'].includes(loan.status)
}

function canDeleteLoan(loan) {
  if (!loan) return false
  return loan.direction === 'lend' || ['void', 'settled'].includes(loan.status)
}

function loanDirectionIcon(loan) {
  return loan?.direction === 'borrow' ? 'fa-solid fa-arrow-down' : 'fa-solid fa-arrow-up'
}

function openCreateSheet() {
  const now = new Date()
  createOpen.value = true
  createForm.direction = tab.value === 'borrow' ? 'borrow' : 'lend'
  createForm.counterpartyName = counterpartyName.value === '未命名對象' ? '' : counterpartyName.value
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

    await refreshLinkedData()

    uiStore.pushToast('借貸已建立')
    closeCreateSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? '建立借貸失敗', 'error')
  }
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

    await refreshLinkedData()

    uiStore.pushToast(`${collectionLabel(repayLoan.value)}已記錄`)
    closeRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? `${collectionLabel(repayLoan.value)}失敗`, 'error')
  }
}

function openVoidDialog(loanId) {
  confirmDialog.open = true
  confirmDialog.loading = false
  confirmDialog.type = 'void'
  confirmDialog.loanId = String(loanId ?? '')
}

function openDeleteDialog(loanId) {
  confirmDialog.open = true
  confirmDialog.loading = false
  confirmDialog.type = 'delete'
  confirmDialog.loanId = String(loanId ?? '')
}

function closeConfirmDialog() {
  if (confirmDialog.loading) return
  confirmDialog.open = false
  confirmDialog.loanId = ''
}

function onRequestCloseOverlay(event) {
  if (repayOpen.value) {
    closeRepaySheet()
    event.preventDefault()
    return
  }
  if (createOpen.value) {
    closeCreateSheet()
    event.preventDefault()
  }
}

async function confirmDialogAction() {
  if (!confirmDialog.loanId) return
  confirmDialog.loading = true

  try {
    if (confirmDialog.type === 'void') {
      await loanStore.markVoid(confirmDialog.loanId)
      await refreshLinkedData()
      uiStore.pushToast('借貸已完成')
      confirmDialog.open = false
      return
    }
    await loanStore.deleteVoided(confirmDialog.loanId)
    await refreshLinkedData()
    uiStore.pushToast('借貸已刪除')
    confirmDialog.open = false
  } catch (error) {
    uiStore.pushToast(error.message ?? (confirmDialog.type === 'void' ? '完成失敗' : '刪除失敗'), 'error')
  } finally {
    confirmDialog.loading = false
  }
}

async function markRestore(loanId) {
  try {
    await loanStore.restoreVoided(loanId)
    await refreshLinkedData()
    uiStore.pushToast('借貸已恢復')
  } catch (error) {
    uiStore.pushToast(error.message ?? '恢復失敗', 'error')
  }
}

function openLoanDetail(loanId) {
  void router.push({
    name: 'loan-detail',
    params: { id: loanId },
    query: {
      tab: tab.value,
      finished: showFinished.value ? '1' : '0',
      name: counterpartyName.value,
    },
  })
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16)
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
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
.head-actions {
  gap: 8px
}
.list {
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
.entry {
  width: 100%;
  color: var(--text);
  text-align: left;
  display: grid;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  gap: 6px;
  background: color-mix(in srgb, var(--card) 94%, #111 6%);
  outline: none;
  box-shadow: none
}
.clickable-entry {
  cursor: pointer
}
.entry:focus, .entry:focus-visible {
  outline: none;
  box-shadow: none
}
.entry-body {
  display: flex;
  align-items: center;
  gap: 10px
}
.icon-col {
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0
}
.entry-content {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px
}
.item-main, .item-meta {
  justify-content: space-between
}
.item-block {
  align-items: center;
  gap: 6px
}
.loan-icon {
  color: var(--primary-soft);
  font-size: 20px
}
.item-main {
  font-size: 15px
}
.item-meta {
  font-size: 14px
}
.item-main .muted,
.item-meta .muted {
  font-size: 13px
}
.item-value {
  max-width: 140px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}
.btn-wrap {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px
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
