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
        <MoneyText :value-minor="transaction.amount_minor" :tone="transaction.type" />
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
            <font-awesome-icon v-if="categoryIcon(transaction.category_id)" :icon="categoryIcon(transaction.category_id)" class="category-icon" />
            <span>{{ categoryName(transaction.category_id) }}</span>
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

      <p v-if="transaction.note" class="note">{{ transaction.note }}</p>

      <div class="row action-row">
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
            <MoneyText :value-minor="related.tx.amount_minor" :tone="related.tx.type" />
          </header>

          <div class="relation-body">
            <p class="relation-title">
              {{ labelOfTransaction(related.tx) }}
            </p>
            <p class="muted">{{ relationAccountText(related.tx) }}</p>
            <p class="muted">{{ formatTime(related.tx.occurred_at) }}</p>
            <p v-if="related.tx.note" class="muted relation-note">{{ related.tx.note }}</p>
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

    <HomeTransactionEditSheet :open="isEditOpen" :tx="editingTx" @close="closeEdit" @saved="handleSaved" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeTransactionEditSheet from '@/ui/components/home/HomeTransactionEditSheet.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listAllTransactions } from '@/core/repositories/transaction.repo'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const loading = ref(false)
const allTransactions = ref([])
const transaction = ref(null)
const isEditOpen = ref(false)
const editingTx = ref(null)

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

const relationRows = computed(() => {
  const rows = []

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
    allTransactions.value = await listAllTransactions(ledgerId)
    transaction.value = allTransactions.value.find((item) => item.id === txId.value) ?? null
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_about.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function openEdit(tx) {
  if (!tx) return
  editingTx.value = tx
  isEditOpen.value = true
}

function closeEdit() {
  isEditOpen.value = false
  editingTx.value = null
}

async function handleSaved() {
  await load()
  if (!transaction.value) {
    closeEdit()
    goBack()
    return
  }
  closeEdit()
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push('/')
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
  if (!tx || tx.type === 'adjustment') return ''
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

function categoryName(categoryId) {
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? '-'
}

function categoryIcon(categoryId) {
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
