<template>
  <section class="stack">
    <header class="row">
      <h2>{{ t('transaction_about.title') }}</h2>
      <button class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
    </header>

    <article v-if="transaction" class="card panel">
      <header class="row">
        <h3 class="title-with-icon">
          <font-awesome-icon
            v-if="categoryIconOfTransaction(transaction)"
            :icon="categoryIconOfTransaction(transaction)"
            class="title-icon"
          />
          <span>{{ labelOfTransaction(transaction) }}</span>
        </h3>
        <MoneyText :value-minor="transaction.amount_minor" :currency="transaction.account_currency_code" :tone="transaction.type" />
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.account') }}</small>
          <span>{{ accountName(transaction.account_id) }}</span>
        </div>
        <div v-if="transaction.type === 'transfer'" class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.incoming_account') }}</small>
          <span>{{ accountName(transaction.peer_account_id) }}</span>
        </div>
        <div v-else class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.category') }}</small>
          <span class="category-value">
            <font-awesome-icon v-if="detailCategoryIcon(transaction)" :icon="detailCategoryIcon(transaction)" class="category-icon" />
            <span>{{ detailCategoryName(transaction) }}</span>
          </span>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.time') }}</small>
          <span>{{ formatTime(transaction.occurred_at) }}</span>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.transaction_type') }}</small>
          <span>{{ transactionTypeLabel(transaction.type) }}</span>
        </div>
      </div>

      <p v-if="displayNote(transaction.note)" class="note">{{ displayNote(transaction.note) }}</p>

      <div class="row action-row">
        <button
          v-if="canCreateRefund"
          class="btn"
          :disabled="refunding"
          @click="openRefundSheet"
        >
          {{ refunding ? t('transaction_about.refunding') : t('transaction_about.refund_transaction') }}
        </button>
        <button class="btn primary" @click="openEdit(transaction)">
          {{ t('transaction_about.edit_transaction') }}
        </button>
      </div>
    </article>

    <article v-if="transaction" class="card panel">
      <header class="row">
        <h3>{{ t('transaction_about.related_records') }}</h3>
      </header>

      <div class="relation-list">
        <article
          v-for="related in relationRows"
          :key="related.key"
          class="relation-item card"
        >
          <header class="row relation-head">
            <small class="muted">{{ related.prefix }}</small>
            <MoneyText :value-minor="related.tx.amount_minor" :currency="related.tx.account_currency_code" :tone="related.tx.type" />
          </header>

          <div class="relation-body">
            <p class="relation-title">
              {{ labelOfTransaction(related.tx) }}
            </p>
            <p class="muted">{{ relationAccountText(related.tx) }}</p>
            <p class="muted">{{ formatTime(related.tx.occurred_at) }}</p>
            <p v-if="displayNote(related.tx.note)" class="muted relation-note">{{ displayNote(related.tx.note) }}</p>
          </div>

          <div class="row relation-action">
            <button
              class="btn primary"
              @click="openEdit(related.tx)"
            >
              {{ t('transaction_about.edit_transaction') }}
            </button>
          </div>
        </article>

        <p v-if="!hasAnyRelation" class="muted">{{ t('transaction_about.no_related_records') }}</p>
      </div>
    </article>

    <article v-if="!transaction && !loading" class="card panel">
      <p class="muted">{{ t('transaction_about.not_found') }}</p>
    </article>

    <InputBottomSheet
      :open="refundSheetOpen"
      :title="t('transaction_about.refund_account_title')"
      :body-class="'stack'"
      :show-footer="true"
      :close-text="t('common.cancel')"
      @close="closeRefundSheet"
    >
      <label class="field">
        {{ t('transaction_about.refund_account_field') }}
        <CustomSelect v-model="refundAccountId" :groups="refundAccountGroups" />
      </label>
      <label class="field">
        {{ t('transaction_about.refund_deduct_amount_field') }}
        <input
          v-model.number="refundDeductAmountMajor"
          class="input"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
        />
      </label>
      <p class="muted">{{ t('transaction_about.refund_account_hint') }}</p>

      <template #footer>
        <button class="btn" @click="closeRefundSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="refunding" @click="createRefund">
          {{ refunding ? t('transaction_about.refunding') : t('transaction_about.refund_transaction') }}
        </button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { loadTransactionDetailContext } from '@/core/services/transaction-query.service'
import { useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel, getSystemTransactionType } from '@/ui/utils/system-transaction-presenter'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const loading = ref(false)
const allTransactions = ref([])
const transaction = ref(null)
const refunding = ref(false)
const refundSheetOpen = ref(false)
const refundAccountId = ref('')
const refundDeductAmountMajor = ref(0)

const txId = computed(() => String(route.params.id ?? ''))

const reimbursementSourceTx = computed(() => {
  const tx = transaction.value
  if (!tx || tx.origin_type !== 'reimbursement' || !tx.external_ref_id) return null
  return allTransactions.value.find((item) => item.id === tx.external_ref_id) ?? null
})

const reimbursementSettledTx = computed(() => {
  const tx = transaction.value
  if (!tx) return null
  return (
    allTransactions.value.find(
      (item) => item.id !== tx.id && item.origin_type === 'reimbursement' && item.external_ref_id === tx.id,
    ) ?? null
  )
})

const transferRelated = computed(() => {
  const tx = transaction.value
  if (!tx?.transfer_group_id) return []
  return allTransactions.value.filter((item) => item.id !== tx.id && item.transfer_group_id === tx.transfer_group_id)
})

const loanRelated = computed(() => {
  const tx = transaction.value
  if (!tx || tx.origin_type !== 'loan_payment' || !tx.external_ref_id) return []
  return allTransactions.value.filter(
    (item) =>
      item.id !== tx.id && item.origin_type === 'loan_payment' && String(item.external_ref_id) === String(tx.external_ref_id),
  )
})

const refundSourceTx = computed(() => {
  const tx = transaction.value
  if (!tx || getSystemTransactionType(tx) !== 'refund' || !tx.external_ref_id) return null
  return allTransactions.value.find((item) => item.id === tx.external_ref_id) ?? null
})

const refundRelated = computed(() => {
  const tx = transaction.value
  if (!tx) return []
  return allTransactions.value.filter(
    (item) =>
      item.id !== tx.id
      && getSystemTransactionType(item) === 'refund'
      && String(item.external_ref_id) === String(tx.id),
  )
})

const relationRows = computed(() => {
  const rows = []

  if (refundSourceTx.value) {
    rows.push({
      key: `refund-source-${refundSourceTx.value.id}`,
      prefix: t('transaction_about.relation_prefix.refund'),
      tx: refundSourceTx.value,
    })
  }
  for (const tx of refundRelated.value) {
    rows.push({
      key: `refund-${tx.id}`,
      prefix: t('transaction_about.relation_prefix.refund'),
      tx,
    })
  }
  if (reimbursementSourceTx.value) {
    rows.push({
      key: `reim-source-${reimbursementSourceTx.value.id}`,
      prefix: t('transaction_about.relation_prefix.reimbursement_source'),
      tx: reimbursementSourceTx.value,
    })
  }
  if (reimbursementSettledTx.value) {
    rows.push({
      key: `reim-settled-${reimbursementSettledTx.value.id}`,
      prefix: t('transaction_about.relation_prefix.reimbursement_settled'),
      tx: reimbursementSettledTx.value,
    })
  }
  for (const tx of transferRelated.value) {
    rows.push({
      key: `transfer-${tx.id}`,
      prefix: t('transaction_about.relation_prefix.transfer'),
      tx,
    })
  }
  for (const tx of loanRelated.value) {
    rows.push({
      key: `loan-${tx.id}`,
      prefix: t('transaction_about.relation_prefix.loan'),
      tx,
    })
  }

  return rows
})

const hasAnyRelation = computed(() => {
  return relationRows.value.length > 0
})

const refundAccountGroups = computed(() => {
  const tx = transaction.value
  if (!tx?.account_id) return []

  const sourceCurrency = String(tx.account_currency_code ?? '').trim().toUpperCase()
  return accountStore.groupedRegularAccounts
    .map((group) => ({
      ...group,
      options: (group.options ?? []).filter((option) => {
        const account = accountStore.regularAccounts.find((item) => item.id === option.value)
        if (!account) return false
        const currency = String(account.currency_code ?? '').trim().toUpperCase()
        if (!sourceCurrency || !currency) return true
        return currency === sourceCurrency
      }),
    }))
    .filter((group) => Array.isArray(group.options) && group.options.length > 0)
})

const canCreateRefund = computed(() => {
  const tx = transaction.value
  if (!tx) return false
  if (!['expense', 'income'].includes(String(tx.type ?? ''))) return false
  if (tx.transfer_group_id) return false
  if (getSystemTransactionType(tx) === 'refund') return false
  const originType = String(tx.origin_type ?? '').trim()
  if (['reimbursement', 'loan_payment'].includes(originType)) return false
  return refundRelated.value.length === 0
})

watch(
  () => [ledgerStore.activeLedgerId, txId.value],
  () => {
    void load()
  },
)

onMounted(async () => {
  if (!categoryStore.categories.length) await categoryStore.load()
  if (!accountStore.accounts.length) await accountStore.load()
  if (!loanStore.items.length) await loanStore.load()
  await load()
})

async function load() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !txId.value) {
    transaction.value = null
    return
  }

  loading.value = true
  try {
    const detailContext = await loadTransactionDetailContext(ledgerId, txId.value)
    allTransactions.value = detailContext.allTransactions
    transaction.value = detailContext.transaction
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_about.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function openEdit(tx) {
  if (!tx) return
  void router.push({ name: 'transaction-edit', params: { id: tx.id } }).catch(() => {})
}

function goBack() {
  void goBackOrFallback(router, '/')
}

function openRefundSheet() {
  if (!canCreateRefund.value || refunding.value) return
  refundAccountId.value = String(transaction.value?.account_id ?? '')
  refundDeductAmountMajor.value = Math.abs(Number(transaction.value?.amount_minor ?? 0)) / 100
  refundSheetOpen.value = true
}

function closeRefundSheet() {
  if (refunding.value) return
  refundSheetOpen.value = false
}

async function createRefund() {
  const tx = transaction.value
  if (!tx || refunding.value || !canCreateRefund.value) return

  const amountMinor = Math.abs(Number(tx.amount_minor ?? 0))
  const refundDeductMinor = Math.round(Math.abs(Number(refundDeductAmountMajor.value ?? 0)) * 100)
  if (!amountMinor || !tx.account_id || !refundAccountId.value || !refundDeductMinor || refundDeductMinor > amountMinor) {
    uiStore.pushToast(t('transaction_about.toast.refund_failed'), 'error')
    return
  }

  const noteLines = [
    `${t('transaction_about.refund_transaction')}：${labelOfTransaction(tx)}`,
    displayNote(tx.note),
  ].filter(Boolean)

  refunding.value = true
  try {
    const refundTxId = await transactionStore.addRefund({
      occurredAt: new Date().toISOString(),
      accountId: refundAccountId.value,
      sourceTransactionId: tx.id,
      amountMinor: refundDeductMinor,
      note: noteLines.join('\n'),
    })
    uiStore.pushToast(t('transaction_about.toast.refund_created'))
    refundSheetOpen.value = false
    if (refundTxId) {
      await router.push({ name: 'transaction-about', params: { id: refundTxId } })
      return
    }
    await load()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_about.toast.refund_failed'), 'error')
  } finally {
    refunding.value = false
  }
}

function transactionTypeLabel(type) {
  if (type === 'income') return t('transaction_about.type.income')
  if (type === 'transfer') return t('transaction_about.type.transfer')
  if (type === 'adjustment') return t('transaction_about.type.adjustment')
  return t('transaction_about.type.expense')
}

function labelOfTransaction(tx) {
  if (!tx) return t('transaction_about.type.adjustment')
  if (tx.origin_type === 'reimbursement') return t('transaction_about.type.reimbursement')
  if (tx.origin_type === 'loan_payment') return loanTransactionLabel(tx)
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  return transactionTypeLabel(tx.type)
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? t('transaction_about.type.loan_receive_back') : t('transaction_about.type.loan_lend')
  if (loanDirection === 'borrow') return tx.type === 'expense' ? t('transaction_about.type.loan_repay') : t('transaction_about.type.loan_borrow')
  return tx.type === 'income' ? t('transaction_about.type.loan_receive_back') : t('transaction_about.type.loan_lend')
}

function categoryIconOfTransaction(tx) {
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx.category_icon ?? '').trim()
  if (directIcon) return directIcon
  if (tx.type === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  if (tx.origin_type === 'reimbursement') return 'fa-solid fa-receipt'
  if (tx.origin_type === 'loan_payment') return loanTransactionIcon(tx)
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  return category?.icon ?? ''
}

function loanTransactionIcon(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
  if (loanDirection === 'borrow') return tx.type === 'expense' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-arrow-down'
  return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
}

function detailCategoryName(tx) {
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx?.category_name ?? '').trim()
  if (directName) return directName
  const categoryId = String(tx?.category_id ?? '').trim()
  if (!categoryId) return '-'
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? '-'
}

function detailCategoryIcon(tx) {
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx?.category_icon ?? '').trim()
  if (directIcon) return directIcon
  const categoryId = String(tx?.category_id ?? '').trim()
  if (!categoryId) return ''
  return categoryStore.categories.find((item) => item.id === categoryId)?.icon ?? ''
}

function accountName(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '-'
}

function relationAccountText(tx) {
  if (!tx) return '-'
  if (tx.type === 'transfer') {
    return `${accountName(tx.account_id)} → ${accountName(tx.peer_account_id)}`
  }
  return accountName(tx.account_id)
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayNote(note) {
  return stripAddonSummaryFromNote(note).trim()
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
.title-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.title-icon {
  width: 15px;
  color: var(--primary);
}
.detail-grid {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.category-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.category-icon {
  width: 14px;
  color: var(--primary);
}
.note {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}
.action-row {
  margin-top: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.field {
  display: grid;
  gap: 6px;
}
.relation-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.relation-item {
  text-align: left;
  padding: 10px;
}
.relation-head {
  margin-bottom: 6px;
}
.relation-body {
  display: grid;
  gap: 2px;
}
.relation-title {
  margin: 0;
  font-weight: 700;
}
.relation-note {
  margin-top: 4px;
}
.relation-action {
  margin-top: 8px;
}
</style>
