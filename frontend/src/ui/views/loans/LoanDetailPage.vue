<template>
  <section class="stack">
    <header class="row page-head">
      <h2>借貸明細</h2>
      <RouterLink class="btn back-btn" :to="backLink">返回</RouterLink>
    </header>

    <article class="card panel">
      <div v-if="loan" class="stack loan-body">
        <div class="row">
          <strong>{{ loan.counterparty_name || '未命名對象' }}</strong>
          <span class="badge" :class="loan.status">{{ statusLabel(loan) }}</span>
        </div>

        <div class="row muted">
          <span>{{ loan.direction === 'lend' ? '借出' : '借入' }}</span>
          <span>{{ formatDateTime(loan.start_date) }}{{ loan.due_date ? ` ~ ${formatDateTime(loan.due_date)}` : '' }}</span>
        </div>

        <div class="row"><small class="muted">本金</small><MoneyText :value-minor="loan.principal_minor" /></div>
        <div class="row"><small class="muted">預設利息</small><MoneyText :value-minor="loan.preset_interest_minor ?? 0" /></div>
        <div class="row"><small class="muted">建立入帳帳戶</small><span>{{ loan.setup_account_name || '—' }}</span></div>
        <div class="row"><small class="muted">{{ paidLabel(loan) }}</small><MoneyText :value-minor="loan.paid_minor" /></div>
        <div class="row">
          <small class="muted">已還本金 / 利息</small>
          <span>
            <MoneyText :value-minor="loan.principal_paid_minor ?? 0" /> /
            <MoneyText :value-minor="loan.interest_paid_minor ?? 0" />
          </span>
        </div>
        <div class="row"><small class="muted">剩餘</small><MoneyText :value-minor="loan.remaining_minor" /></div>

        <div class="row btn-wrap">
          <button v-if="!showFinished" class="btn" @click="openRepaySheet" :disabled="!canRepay(loan)">{{ collectionLabel(loan) }}</button>
          <button class="btn" @click="openSetupAccountSheet">變更入帳帳戶</button>
          <button class="btn" @click="refreshDetail">刷新</button>
          <button v-if="!showFinished" class="btn" @click="openVoidDialog" :disabled="loan.status === 'void'">完成</button>
          <button v-if="showFinished" class="btn" @click="openPrincipalSheet">變更本金</button>
          <button v-if="showFinished && loan.status === 'void'" class="btn" @click="markRestore">恢復</button>
          <button v-if="canDeleteLoan(loan)" class="btn danger" @click="openDeleteDialog">刪除</button>
        </div>

        <div class="row btn-wrap counterparty-actions">
          <small class="muted counterparty-actions-hint">新增同對象的下一筆借貸</small>
          <button class="btn" @click="openCreateForSameCounterparty('lend')">
            <font-awesome-icon icon="fa-solid fa-arrow-up" class="counterparty-action-icon" />
            新增同對象借出
          </button>
          <button class="btn" @click="openCreateForSameCounterparty('borrow')">
            <font-awesome-icon icon="fa-solid fa-arrow-down" class="counterparty-action-icon" />
            新增同對象借入
          </button>
        </div>
      </div>

      <p v-else class="muted">找不到借貸資料</p>
    </article>

    <article class="card panel">
      <div class="row">
        <h3>{{ collectionRecordLabel(loan) }}</h3>
        <button class="btn" @click="refreshDetail">刷新</button>
      </div>
      <ul class="payments">
        <li v-for="payment in payments" :key="payment.id" class="row pay-item">
          <span>{{ formatDateTime(payment.paid_at) }}</span>
          <span class="pay-amount-wrap">
            <MoneyText :value-minor="payment.amount_minor" />
            <small class="muted">
              本金 <MoneyText :value-minor="payment.principal_component_minor ?? 0" />
              / 利息 <MoneyText :value-minor="payment.interest_component_minor ?? 0" />
            </small>
            <span class="pay-actions">
              <button class="btn" @click="openEditRepayment(payment)">變更</button>
              <button class="btn danger" @click="openDeleteRepaymentDialog(payment)">刪除</button>
            </span>
          </span>
        </li>
        <li v-if="!payments.length" class="muted">尚無{{ collectionRecordLabel(loan) }}</li>
      </ul>
    </article>

    <InputBottomSheet
      :open="repayOpen"
      :title="editingRepayment ? `編輯${collectionLabel(loan)}` : `借貸${collectionLabel(loan)}`"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeRepaySheet"
    >
              <p class="muted">{{ loan?.counterparty_name }} / 剩餘 <MoneyText :value-minor="loan?.remaining_minor ?? 0" /></p>
              <label>
                {{ collectionLabel(loan) }}金額（元）
                <input v-model.number="repayForm.amountMajor" class="input" type="number" min="0" step="1" />
              </label>
              <p v-if="repayInterestPreview > 0" class="interest-hint muted">
                超出本金部分 <MoneyText :value-minor="repayInterestPreview" /> 將計為利息
              </p>

              <label>
                帳戶
                <CustomSelect v-model="repayForm.accountId" :options="accountStore.accounts" />
              </label>

              <label>
                備註
                <textarea v-model="repayForm.note" class="textarea" rows="2" />
              </label>
      <template #footer>
        <button class="btn" @click="closeRepaySheet">取消</button>
        <button class="btn primary" @click="submitRepayment">{{ editingRepayment ? '儲存變更' : '儲存' }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="setupAccountOpen"
      title="變更入帳帳戶"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeSetupAccountSheet"
    >
              <p class="muted">{{ loan?.counterparty_name }} / 目前帳戶 {{ loan?.setup_account_name || '—' }}</p>
              <label>
                帳戶
                <CustomSelect v-model="setupAccountForm.accountId" :options="accountStore.accounts" />
              </label>
      <template #footer>
        <button class="btn" @click="closeSetupAccountSheet">取消</button>
        <button class="btn primary" @click="submitSetupAccount">儲存</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="principalOpen"
      title="變更本金"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closePrincipalSheet"
    >
              <p class="muted">{{ loan?.counterparty_name }}</p>
              <label>
                本金（元）
                <input v-model.number="principalForm.principalMajor" class="input" type="number" min="1" step="1" />
              </label>
      <template #footer>
        <button class="btn" @click="closePrincipalSheet">取消</button>
        <button class="btn primary" @click="submitPrincipal">儲存</button>
      </template>
    </InputBottomSheet>

    <AppDialog
      :open="confirmDialog.open"
      :title="confirmDialog.type === 'void' ? '完成借貸' : '刪除借貸'"
      :message="confirmDialog.type === 'void' ? '確定要完成這筆借貸？不會刪除交易紀錄' : '確定要刪除這筆借貸？此動作無法復原'"
      :loading="confirmDialog.loading"
      :confirm-text="confirmDialog.type === 'void' ? '確認完成' : '確認刪除'"
      @close="closeConfirmDialog"
      @confirm="confirmDialogAction"
    />

    <AppDialog
      :open="deleteRepaymentDialog.open"
      :title="`刪除${collectionLabel(loan)}`"
      :message="`確定要刪除這筆${collectionLabel(loan)}紀錄？\n會同步刪除對應交易並重算借貸金額。`"
      :loading="deleteRepaymentDialog.loading"
      confirm-text="確認刪除"
      @close="closeDeleteRepaymentDialog"
      @confirm="confirmDeleteRepayment"
    />

    <InputBottomSheet
      :open="createOpen"
      :title="createSheetTitle"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeCreateSheet"
    >
              <p class="muted">{{ createForm.counterpartyName || '未命名對象' }} · {{ createForm.direction === 'borrow' ? '借入（應付）' : '借出（應收）' }}</p>

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
      <template #footer>
        <button class="btn" :disabled="creatingLoan" @click="closeCreateSheet">取消</button>
        <button class="btn primary" :disabled="creatingLoan" @click="submitCreateLoan">
          {{ creatingLoan ? '處理中…' : '儲存' }}
        </button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import {
  buildLoanCounterpartyQuery,
  buildLoanListQuery,
  normalizeLoanFinished,
  normalizeLoanTab,
} from '@/ui/views/loans/loan-route-state.js'

const route = useRoute()
const router = useRouter()
const loanStore = useLoanStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const transactionStore = useTransactionStore()
const budgetStore = useBudgetStore()

const repayOpen = ref(false)
const editingRepayment = ref(null)
const principalOpen = ref(false)
const setupAccountOpen = ref(false)
const createOpen = ref(false)
const creatingLoan = ref(false)
const repayForm = reactive({
  amountMajor: null,
  accountId: '',
  note: '',
})
const setupAccountForm = reactive({
  accountId: '',
})
const principalForm = reactive({
  principalMajor: null,
})
const confirmDialog = reactive({
  open: false,
  loading: false,
  type: 'void',
})
const deleteRepaymentDialog = reactive({
  open: false,
  loading: false,
  paymentId: '',
})
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

const loanId = computed(() => String(route.params.id ?? ''))
const loan = computed(() => {
  if (loanStore.detail?.loan?.id === loanId.value) return loanStore.detail.loan
  return loanStore.items.find((item) => item.id === loanId.value) ?? null
})
const payments = computed(() => {
  if (loanStore.detail?.loan?.id !== loanId.value) return []
  return loanStore.detail?.payments ?? []
})
const defaultAccountId = computed(() => accountStore.accounts[0]?.id ?? '')
const showFinished = computed(() => normalizeLoanFinished(route.query.finished))

const repayInterestPreview = computed(() => {
  if (!loan.value || Number(loan.value.preset_interest_minor ?? 0) > 0) return 0
  const amountMinor = Math.round(Number(repayForm.amountMajor ?? 0) * 100)
  const principalRemainingMinor = Number(loan.value.principal_remaining_minor ?? 0)
  return Math.max(0, amountMinor - principalRemainingMinor)
})

const createSheetTitle = computed(() => {
  return createForm.direction === 'borrow' ? '新增同對象借入' : '新增同對象借出'
})

const backLink = computed(() => {
  const tab = normalizeLoanTab(route.query.tab)
  const name = String(route.query.name ?? '').trim()
  if (name) {
    return {
      name: 'loan-counterparty-detail',
      query: buildLoanCounterpartyQuery(route.query, {
        name,
        tab,
        showFinished: showFinished.value,
      }),
    }
  }
  return {
    name: 'loans',
    query: buildLoanListQuery(route.query, {
      tab,
      showFinished: showFinished.value,
    }),
  }
})

onMounted(() => {
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
  void loadPage()
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

watch(
  () => route.params.id,
  () => {
    void loadPage()
  },
)

async function loadPage() {
  if (!loanId.value) return
  await Promise.all([loanStore.load(), accountStore.load()])
  await loanStore.loadDetail(loanId.value)
}

async function refreshLinkedData() {
  await Promise.all([
    transactionStore.loadRecent(),
    budgetStore.loadMonth(budgetStore.monthKey),
    accountStore.load(),
  ])
}

function statusLabel(item) {
  const status = String(item?.status ?? '')
  const map = {
    active: '進行中',
    partial: item?.direction === 'lend' ? '部分收回' : '部分償還',
    settled: '已結清',
    void: '完成',
  }
  return map[status] ?? status
}

function canRepay(item) {
  return ['active', 'partial'].includes(item.status)
}

function canDeleteLoan(item) {
  return Boolean(item)
}

function collectionLabel(item) {
  return item?.direction === 'borrow' ? '歸還' : '收回'
}

function paidLabel(item) {
  return item?.direction === 'borrow' ? '已歸還' : '已收回'
}

function collectionRecordLabel(item) {
  return `${collectionLabel(item)}紀錄`
}

function openRepaySheet() {
  if (!loan.value) return
  editingRepayment.value = null
  repayOpen.value = true
  repayForm.amountMajor = Number(loan.value.remaining_minor ?? 0) / 100
  repayForm.accountId = defaultAccountId.value
  repayForm.note = ''
}

function openEditRepayment(payment) {
  if (!loan.value || !payment?.id) return
  editingRepayment.value = payment
  repayOpen.value = true
  repayForm.amountMajor = Math.abs(Number(payment.amount_minor ?? 0)) / 100
  repayForm.accountId = String(payment.account_id ?? defaultAccountId.value)
  repayForm.note = String(payment.note ?? '')
}

function closeRepaySheet() {
  repayOpen.value = false
  editingRepayment.value = null
}

function openSetupAccountSheet() {
  if (!loan.value) return
  setupAccountOpen.value = true
  setupAccountForm.accountId = String(loan.value.setup_account_id ?? defaultAccountId.value)
}

function closeSetupAccountSheet() {
  setupAccountOpen.value = false
}

function openDeleteRepaymentDialog(payment) {
  if (!payment?.id) return
  deleteRepaymentDialog.open = true
  deleteRepaymentDialog.loading = false
  deleteRepaymentDialog.paymentId = String(payment.id)
}

function resetDeleteRepaymentDialog() {
  deleteRepaymentDialog.open = false
  deleteRepaymentDialog.loading = false
  deleteRepaymentDialog.paymentId = ''
}

function closeDeleteRepaymentDialog() {
  if (deleteRepaymentDialog.loading) return
  resetDeleteRepaymentDialog()
}

function openPrincipalSheet() {
  if (!loan.value) return
  principalOpen.value = true
  principalForm.principalMajor = Number(loan.value.principal_minor ?? 0) / 100
}

function closePrincipalSheet() {
  principalOpen.value = false
}

async function submitRepayment() {
  if (!loan.value) return
  try {
    if (editingRepayment.value?.id) {
      await loanStore.updateRepayment({
        loanId: loan.value.id,
        paymentId: editingRepayment.value.id,
        accountId: repayForm.accountId,
        amountMinor: Math.round(Number(repayForm.amountMajor ?? 0) * 100),
        note: repayForm.note,
        paidAt: editingRepayment.value.paid_at,
      })
    } else {
      await loanStore.repay({
        loanId: loan.value.id,
        accountId: repayForm.accountId,
        amountMinor: Math.round(Number(repayForm.amountMajor ?? 0) * 100),
        note: repayForm.note,
        paidAt: new Date().toISOString(),
      })
    }

    await refreshLinkedData()

    uiStore.pushToast(editingRepayment.value ? `${collectionLabel(loan.value)}紀錄已更新` : `${collectionLabel(loan.value)}已記錄`)
    closeRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? (editingRepayment.value ? `更新${collectionLabel(loan.value)}失敗` : `${collectionLabel(loan.value)}失敗`), 'error')
  }
}

async function submitSetupAccount() {
  if (!loan.value) return
  try {
    await loanStore.updateSetupAccount({
      loanId: loan.value.id,
      accountId: setupAccountForm.accountId,
    })
    await refreshLinkedData()
    uiStore.pushToast('借貸入帳帳戶已更新')
    closeSetupAccountSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新借貸入帳帳戶失敗', 'error')
  }
}

async function refreshDetail() {
  if (!loanId.value) return
  await loanStore.loadDetail(loanId.value)
}

async function submitPrincipal() {
  if (!loan.value) return
  try {
    await loanStore.updateCompletedPrincipal({
      loanId: loan.value.id,
      principalMinor: Math.round(Number(principalForm.principalMajor ?? 0) * 100),
    })
    await refreshLinkedData()
    uiStore.pushToast('本金已更新')
    closePrincipalSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新本金失敗', 'error')
  }
}

async function confirmDeleteRepayment() {
  if (!loan.value || !deleteRepaymentDialog.paymentId) return

  deleteRepaymentDialog.loading = true
  try {
    await loanStore.deleteRepayment({
      loanId: loan.value.id,
      paymentId: deleteRepaymentDialog.paymentId,
    })
    await refreshLinkedData()
    uiStore.pushToast(`${collectionLabel(loan.value)}紀錄已刪除`)
    resetDeleteRepaymentDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? `刪除${collectionLabel(loan.value)}紀錄失敗`, 'error')
  } finally {
    deleteRepaymentDialog.loading = false
  }
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

function openCreateForSameCounterparty(direction) {
  if (!loan.value) return
  const now = new Date()
  const rawCounterparty = String(loan.value?.counterparty_name ?? '').trim()
  createOpen.value = true
  createForm.direction = direction === 'borrow' ? 'borrow' : 'lend'
  createForm.counterpartyName = rawCounterparty
  createForm.principalMajor = null
  createForm.interestMajor = null
  createForm.startDate = now.toISOString().slice(0, 10)
  createForm.startHour = now.getHours()
  createForm.startMinute = now.getMinutes()
  createForm.dueDate = ''
  createForm.dueHour = now.getHours()
  createForm.dueMinute = now.getMinutes()
  createForm.accountId = String(loan.value?.setup_account_id ?? defaultAccountId.value ?? '')
  createForm.note = ''
}

function closeCreateSheet() {
  if (creatingLoan.value) return
  createOpen.value = false
}

async function submitCreateLoan() {
  if (creatingLoan.value) return
  const counterpartyName = String(createForm.counterpartyName ?? '').trim()
  if (!counterpartyName) {
    uiStore.pushToast('請輸入對象名稱', 'error')
    return
  }
  const principalMinor = Math.round(Number(createForm.principalMajor ?? 0) * 100)
  if (!Number.isFinite(principalMinor) || principalMinor <= 0) {
    uiStore.pushToast('本金需大於 0', 'error')
    return
  }
  creatingLoan.value = true
  try {
    await loanStore.create({
      direction: createForm.direction,
      counterpartyName,
      principalMinor,
      interestMinor: Math.max(0, Math.round(Number(createForm.interestMajor ?? 0) * 100)),
      startDate: formatLoanDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      dueDate: createForm.dueDate
        ? formatLoanDateTime(createForm.dueDate, createForm.dueHour, createForm.dueMinute)
        : null,
      occurredAt: toIsoFromDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      accountId: createForm.accountId,
      note: createForm.note,
    })
    await refreshLinkedData()
    uiStore.pushToast(`已新增${createForm.direction === 'borrow' ? '借入' : '借出'}：${counterpartyName}`)
    createOpen.value = false
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增借貸失敗', 'error')
  } finally {
    creatingLoan.value = false
  }
}

function openVoidDialog() {
  confirmDialog.open = true
  confirmDialog.loading = false
  confirmDialog.type = 'void'
}

function openDeleteDialog() {
  confirmDialog.open = true
  confirmDialog.loading = false
  confirmDialog.type = 'delete'
}

function closeConfirmDialog() {
  if (confirmDialog.loading) return
  confirmDialog.open = false
}

function onRequestCloseOverlay(event) {
  if (createOpen.value) {
    closeCreateSheet()
    event.preventDefault()
    return
  }
  if (repayOpen.value) {
    closeRepaySheet()
    event.preventDefault()
    return
  }
  if (setupAccountOpen.value) {
    closeSetupAccountSheet()
    event.preventDefault()
    return
  }
  if (principalOpen.value) {
    closePrincipalSheet()
    event.preventDefault()
  }
}

async function markRestore() {
  if (!loan.value) return
  try {
    await loanStore.restoreVoided(loan.value.id)
    await refreshLinkedData()
    uiStore.pushToast('借貸已恢復')
  } catch (error) {
    uiStore.pushToast(error.message ?? '恢復失敗', 'error')
  }
}

async function removeVoidedLoan() {
  if (!loan.value) return

  try {
    await loanStore.deleteVoided(loan.value.id)
    await refreshLinkedData()
    uiStore.pushToast('借貸已刪除')
    void router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除失敗', 'error')
  }
}

async function confirmDialogAction() {
  if (!loan.value) return
  confirmDialog.loading = true
  try {
    if (confirmDialog.type === 'void') {
      await loanStore.markVoid(loan.value.id)
      await refreshLinkedData()
      uiStore.pushToast('借貸已完成')
      confirmDialog.open = false
      return
    }
    await removeVoidedLoan()
    confirmDialog.open = false
  } catch (error) {
    uiStore.pushToast(error.message ?? (confirmDialog.type === 'void' ? '完成失敗' : '刪除失敗'), 'error')
  } finally {
    confirmDialog.loading = false
  }
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

.loan-body {
  margin-top: 8px;
}

.btn-wrap {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.counterparty-actions {
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent 40%);
  padding-top: 10px;
  margin-top: 4px;
  align-items: center;
}

.counterparty-actions-hint {
  flex: 1 1 auto;
  text-align: left;
  font-size: 13px;
}

.counterparty-action-icon {
  margin-right: 6px;
}

@media (max-width: 480px) {
  .counterparty-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .counterparty-actions-hint {
    text-align: center;
  }

  .counterparty-actions .btn {
    width: 100%;
  }
}

.field-block {
  display: grid;
  gap: 6px;
}

.field-label {
  color: var(--muted);
  font-size: 13px;
}

.date-picker-wrap {
  width: min(220px, 100%);
}

.due-date-row {
  gap: 8px;
  align-items: center;
}

.due-picker-wrap {
  flex: 0 1 220px;
  min-width: 0;
  max-width: 220px;
}

.due-date-row .mini-btn {
  flex: 0 0 auto;
}

.payments {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.pay-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.pay-amount-wrap {
  display: grid;
  justify-items: end;
  gap: 2px;
}

.pay-actions {
  display: flex;
  gap: 8px;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: flex-end;
  z-index: 70;
}

.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
}

.form-wrap {
  margin-top: 10px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.interest-hint {
  font-size: 12px;
  margin: 0;
}
</style>
