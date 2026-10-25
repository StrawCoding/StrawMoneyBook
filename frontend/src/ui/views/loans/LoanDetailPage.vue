<template>
  <HabitatPageShell
    :title="t('loans.detail_title')"
    :kicker="t('loans.habitat_hello')"
    test-id="loan-detail-view"
    back-to="/loans"
  >

    <article class="card panel">
      <div v-if="loan" class="stack loan-body">
        <div class="row">
          <strong>{{ loan.counterparty_name || t('common.unnamed_counterparty') }}</strong>
          <span class="badge" :class="loan.status">{{ statusLabel(loan) }}</span>
        </div>

        <div class="row muted">
          <span>{{ loan.direction === 'lend' ? t('loans.lend') : t('loans.borrow') }}</span>
          <span>{{ formatDateTime(loan.start_date) }}{{ loan.due_date ? ` ~ ${formatDateTime(loan.due_date)}` : '' }}</span>
        </div>

        <div class="row"><small class="muted">{{ t('loans.principal') }}</small><MoneyText :value-minor="loan.principal_minor" /></div>
        <div class="row"><small class="muted">{{ t('loans.preset_interest') }}</small><MoneyText :value-minor="loan.preset_interest_minor ?? 0" /></div>
        <div class="row"><small class="muted">{{ t('loans.setup_account') }}</small><span>{{ loan.setup_account_name || '—' }}</span></div>
        <div class="row"><small class="muted">{{ paidLabel(loan) }}</small><MoneyText :value-minor="loan.paid_minor" /></div>
        <div class="row">
          <small class="muted">{{ t('loans.paid_principal_interest') }}</small>
          <span>
            <MoneyText :value-minor="loan.principal_paid_minor ?? 0" /> /
            <MoneyText :value-minor="loan.interest_paid_minor ?? 0" />
          </span>
        </div>
        <div class="row"><small class="muted">{{ t('loans.remaining') }}</small><MoneyText :value-minor="loan.remaining_minor" /></div>

        <div class="row btn-wrap">
          <button v-if="!showFinished" class="btn" @click="openRepaySheet" :disabled="!canRepay(loan)">{{ collectionLabel(loan) }}</button>
          <button class="btn" @click="openSetupAccountSheet">{{ t('loans.change_setup_account') }}</button>
          <button class="btn" @click="refreshDetail">{{ t('common.refresh') }}</button>
          <button v-if="!showFinished" class="btn" @click="openVoidDialog" :disabled="loan.status === 'void'">{{ t('common.done') }}</button>
          <button v-if="showFinished" class="btn" @click="openPrincipalSheet">{{ t('loans.change_principal') }}</button>
          <button v-if="showFinished && loan.status === 'void'" class="btn" @click="markRestore">{{ t('common.restore') }}</button>
          <button v-if="canDeleteLoan(loan)" class="btn danger" @click="openDeleteDialog">{{ t('common.delete') }}</button>
        </div>
      </div>

      <p v-else class="muted">{{ t('loans.not_found') }}</p>
    </article>

    <article class="card panel">
      <div class="row">
        <h3>{{ collectionRecordLabel(loan) }}</h3>
        <button class="btn" @click="refreshDetail">{{ t('common.refresh') }}</button>
      </div>
      <ul class="payments">
        <li v-for="payment in payments" :key="payment.id" class="row pay-item">
          <span>{{ formatDateTime(payment.paid_at) }}</span>
          <span class="pay-amount-wrap">
            <MoneyText :value-minor="payment.amount_minor" />
            <small class="muted">
              {{ t('loans.principal') }} <MoneyText :value-minor="payment.principal_component_minor ?? 0" />
              / {{ t('loans.interest') }} <MoneyText :value-minor="payment.interest_component_minor ?? 0" />
            </small>
            <span class="pay-actions">
              <button class="btn" @click="openEditRepayment(payment)">{{ t('common.change') }}</button>
              <button class="btn danger" @click="openDeleteRepaymentDialog(payment)">{{ t('common.delete') }}</button>
            </span>
          </span>
        </li>
        <li v-if="!payments.length" class="muted">{{ t('settings_bank_sync.support_matrix.none') }}{{ collectionRecordLabel(loan) }}</li>
      </ul>
    </article>

    <InputBottomSheet
      :open="repayOpen"
      :title="editingRepayment ? t('loans.edit_collection', { action: collectionLabel(loan) }) : t('loans.loan_action_title', { action: collectionLabel(loan) })"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeRepaySheet"
    >
              <p class="muted">{{ loan?.counterparty_name }} / {{ t('loans.remaining') }} <MoneyText :value-minor="loan?.remaining_minor ?? 0" /></p>
              <label>
                {{ collectionLabel(loan) }}{{ t('common.amount_yuan') }}
                <input v-model.number="repayForm.amountMajor" class="input" type="number" min="0" step="1" />
              </label>
              <p v-if="repayInterestPreview > 0" class="interest-hint muted">
                {{ t('loans.over_principal') }} <MoneyText :value-minor="repayInterestPreview" /> {{ t('loans.counts_as_interest') }}
              </p>

              <label>
                {{ t('common.account') }}
                <CustomSelect v-model="repayForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>

              <label>
                {{ t('common.note') }}
                <textarea v-model="repayForm.note" class="textarea" rows="2" />
              </label>
      <template #footer>
        <button class="btn" @click="closeRepaySheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submitRepayment">{{ editingRepayment ? t('settings_ledger_detail.save_changes') : t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="setupAccountOpen"
      :title="t('loans.change_setup_account')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeSetupAccountSheet"
    >
              <p class="muted">{{ loan?.counterparty_name }} / {{ t('loans.current_account') }} {{ loan?.setup_account_name || '—' }}</p>
              <label>
                {{ t('common.account') }}
                <CustomSelect v-model="setupAccountForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>
      <template #footer>
        <button class="btn" @click="closeSetupAccountSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submitSetupAccount">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="principalOpen"
      :title="t('loans.change_principal')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closePrincipalSheet"
    >
              <p class="muted">{{ loan?.counterparty_name }}</p>
              <label>
                {{ t('loans.principal_yuan') }}
                <input v-model.number="principalForm.principalMajor" class="input" type="number" min="1" step="1" />
              </label>
      <template #footer>
        <button class="btn" @click="closePrincipalSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submitPrincipal">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <AppDialog
      :open="confirmDialog.open"
      :title="confirmDialog.type === 'void' ? t('loans.complete_loan') : t('loans.delete_loan')"
      :message="confirmDialog.type === 'void' ? t('loans.confirm_complete') : t('loans.confirm_delete')"
      :loading="confirmDialog.loading"
      :confirm-text="confirmDialog.type === 'void' ? t('claim_sheet.confirm_complete') : t('common.confirm_delete')"
      @close="closeConfirmDialog"
      @confirm="confirmDialogAction"
    />

    <AppDialog
      :open="deleteRepaymentDialog.open"
      :title="`${t('common.delete')}${collectionLabel(loan)}`"
      :message="t('loans.confirm_delete_collection', { action: collectionLabel(loan) })"
      :loading="deleteRepaymentDialog.loading"
      :confirm-text="t('common.confirm_delete')"
      @close="closeDeleteRepaymentDialog"
      @confirm="confirmDeleteRepayment"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useI18n } from '@/ui/services/i18n.service'
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
const { t } = useI18n()

const repayOpen = ref(false)
const editingRepayment = ref(null)
const principalOpen = ref(false)
const setupAccountOpen = ref(false)
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
    active: t('loans.active'),
    partial: item?.direction === 'lend' ? t('loans.partial_collect') : t('loans.partial_repay'),
    settled: t('loans.settled'),
    void: t('common.done'),
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
  return item?.direction === 'borrow' ? t('loans.repay') : t('loans.collect')
}

function paidLabel(item) {
  return item?.direction === 'borrow' ? t('loans.repaid') : t('loans.collected')
}

function collectionRecordLabel(item) {
  return t('loans.collection_records', { action: collectionLabel(item) })
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

    uiStore.pushToast(editingRepayment.value
      ? t('loans.collection_updated', { action: collectionLabel(loan.value) })
      : t('loans.collection_recorded', { action: collectionLabel(loan.value) }))
    closeRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? (editingRepayment.value
      ? t('loans.collection_update_failed', { action: collectionLabel(loan.value) })
      : t('loans.collection_failed', { action: collectionLabel(loan.value) })), 'error')
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
    uiStore.pushToast(t('loans.setup_account_updated'))
    closeSetupAccountSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.setup_account_update_failed'), 'error')
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
    uiStore.pushToast(t('loans.principal_updated'))
    closePrincipalSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.principal_update_failed'), 'error')
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
    uiStore.pushToast(t('loans.collection_deleted', { action: collectionLabel(loan.value) }))
    resetDeleteRepaymentDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.collection_delete_failed', { action: collectionLabel(loan.value) }), 'error')
  } finally {
    deleteRepaymentDialog.loading = false
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
    uiStore.pushToast(t('loans.restored'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('common.restore_failed'), 'error')
  }
}

async function removeVoidedLoan() {
  if (!loan.value) return

  try {
    await loanStore.deleteVoided(loan.value.id)
    await refreshLinkedData()
    uiStore.pushToast(t('loans.deleted'))
    void router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('common.delete_failed'), 'error')
  }
}

async function confirmDialogAction() {
  if (!loan.value) return
  confirmDialog.loading = true
  try {
    if (confirmDialog.type === 'void') {
      await loanStore.markVoid(loan.value.id)
      await refreshLinkedData()
      uiStore.pushToast(t('loans.completed'))
      confirmDialog.open = false
      return
    }
    await removeVoidedLoan()
    confirmDialog.open = false
  } catch (error) {
    uiStore.pushToast(error.message ?? (confirmDialog.type === 'void' ? t('common.complete_failed') : t('common.delete_failed')), 'error')
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
