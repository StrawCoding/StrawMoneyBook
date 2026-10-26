<template>
  <section class="home-tx-feed">
    <header class="home-tx-head">
      <div class="home-tx-title-row">
        <h3 class="home-tx-title">{{ t('home_tx.title') }}</h3>
        <div class="home-tx-tools">
          <RouterLink class="home-tx-tool" to="/transactions/search" :aria-label="t('feature_list.search_transactions')">
            <font-awesome-icon icon="fa-solid fa-magnifying-glass" />
          </RouterLink>
          <RouterLink class="home-tx-tool" to="/transactions/calendar" :aria-label="t('calendar_page.title')">
            <font-awesome-icon icon="fa-solid fa-calendar" />
          </RouterLink>
        </div>
      </div>
      <p class="muted home-tx-meta">
        {{ t('home_tx.badge_count', { month: monthLabel, count: transactionStore.homeTotal }) }}
      </p>
    </header>

    <ul class="tx-list">
      <li v-for="group in groupedRecentTransactions" :key="group.dateKey" class="tx-date-group">
        <div class="tx-date-head">
          <span>{{ group.label }}</span>
          <span class="tx-date-total">
            <small>{{ t('home_tx.date_income_short') }} <MoneyText :value-minor="group.incomeMinor" tone="income" /></small>
            <small>{{ t('home_tx.date_expense_short') }} <MoneyText :value-minor="group.expenseMinor" tone="expense" /></small>
          </span>
        </div>
        <ul class="tx-day-list">
          <li
            v-for="tx in group.items"
            :key="tx.id"
            class="tx-item"
            role="button"
            tabindex="0"
            @click="openEdit(tx)"
          >
            <div class="tx-icon-col">
              <font-awesome-icon v-if="categoryIconOfTransaction(tx)" :icon="categoryIconOfTransaction(tx)" class="tx-icon" />
            </div>
            <div class="tx-main">
              <div class="tx-type">
                <span>{{ labelOfTransaction(tx) }}</span>
              </div>
              <div class="tx-meta-row muted">
                <small class="tx-time">{{ formatTime(tx?.occurred_at) }}</small>
                <small class="tx-note">{{ noteText(tx) }}</small>
              </div>
              <div v-if="editorAttributionOf(tx)" class="tx-editor-row" data-testid="tx-editor-attribution">
                <small v-if="editorAttributionOf(tx).samePerson" class="tx-editor-chip">
                  <span class="tx-editor-initial">{{ editorAttributionOf(tx).editorInitial }}</span>
                  {{ t('home_tx.editor_same', { name: editorAttributionOf(tx).updatedByName }, '建立／編輯 {name}') }}
                </small>
                <template v-else>
                  <small class="tx-editor-chip">
                    <span class="tx-editor-initial">{{ editorAttributionOf(tx).creatorInitial }}</span>
                    {{ t('home_tx.editor_created', { name: editorAttributionOf(tx).createdByName }, '建立 {name}') }}
                  </small>
                  <small class="tx-editor-chip">
                    <span class="tx-editor-initial">{{ editorAttributionOf(tx).editorInitial }}</span>
                    {{ t('home_tx.editor_updated', { name: editorAttributionOf(tx).updatedByName }, '編輯 {name}') }}
                  </small>
                </template>
              </div>
            </div>
            <div class="tx-side">
              <div class="amount-line">
                <small
                  v-if="showAddonDeltaTag(tx)"
                  class="addon-delta"
                  :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
                >
                  {{ addonDeltaTag(tx.note) }}
                </small>
                <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
              </div>
              <small class="muted tx-account-side">{{ accountNameOfTransaction(tx) }}</small>
            </div>
          </li>
        </ul>
      </li>
      <li v-if="visibleHomeTransactions.length === 0" class="empty-item">
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">
            <font-awesome-icon icon="fa-solid fa-receipt" />
          </span>
          <strong>{{ t('home_tx.empty_this_month') }}</strong>
          <p class="muted empty-state-copy">{{ t('home_tx.empty_hint') }}</p>
          <RouterLink class="btn primary empty-state-action" to="/transactions/quick-add">{{ t('home_tx.empty_action') }}</RouterLink>
        </div>
      </li>
    </ul>

    <nav v-if="transactionStore.homeTotal > 0" class="home-tx-pagination" aria-label="首頁交易分頁">
      <button type="button" class="home-tx-page-btn" :disabled="!canGoPreviousHomePage" @click="goPreviousHomePage">
        {{ t('common.previous_page') }}
      </button>
      <span class="muted home-tx-page-status">
        {{ t('common.page_status', { page: transactionStore.homePage, totalPages: transactionStore.homeTotalPages }) }}
        ・{{ t('common.page_range', { start: homePageStart, end: homePageEnd, total: transactionStore.homeTotal }) }}
      </span>
      <button type="button" class="home-tx-page-btn" :disabled="!canGoNextHomePage" @click="goNextHomePage">
        {{ t('common.next_page') }}
      </button>
    </nav>

  </section>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { HOME_TRANSACTION_PAGE_SIZE } from '@/core/repositories/transaction.repo'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { addonDeltaMajorFromNote, addonDeltaTagText, stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { rememberHomeScrollPosition } from '@/ui/services/route-scroll.service'
import { getEffectiveTransactionAmountMinor, isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'
import { buildTransactionEditorAttributionView } from '@/core/services/transaction-editor-attribution'
import { getSetting } from '@/core/repositories/settings.repo'

const transactionStore = useTransactionStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const ledgerStore = useLedgerStore()
const router = useRouter()
const { t } = useI18n()
const activeLedgerIsShared = ref(false)
const currentUserId = ref('')


const monthLabel = computed(() => {
  if (transactionStore.homeFilterMode === 'all') return t('home_page.all_transactions')
  if (transactionStore.homeFilterMode === 'year') return t('home_tx.range_year', { year: transactionStore.homeFilterKey })
  if (transactionStore.homeFilterMode === 'day') return transactionStore.homeFilterKey
  if (transactionStore.homeFilterMode === 'month') {
    const [year, month] = String(transactionStore.homeFilterKey).split('-')
    if (year && month) return `${year}/${month}`
  }
  return t('home_tx.range_current')
})

const visibleHomeTransactions = computed(() => {
  const typeFilter = transactionStore.homeTypeFilter
  if (typeFilter === 'income' || typeFilter === 'expense') {
    return transactionStore.homeRecent.filter((tx) => tx.type === typeFilter)
  }
  return transactionStore.homeRecent
})

const homePageStart = computed(() => {
  if (transactionStore.homeTotal <= 0) return 0
  return ((transactionStore.homePage - 1) * HOME_TRANSACTION_PAGE_SIZE) + 1
})

const homePageEnd = computed(() => {
  return Math.min(transactionStore.homeTotal, transactionStore.homePage * HOME_TRANSACTION_PAGE_SIZE)
})

const canGoPreviousHomePage = computed(() => transactionStore.homePage > 1)
const canGoNextHomePage = computed(() => transactionStore.homePage < transactionStore.homeTotalPages)

async function goPreviousHomePage() {
  if (!canGoPreviousHomePage.value) return
  await transactionStore.loadHomePage(transactionStore.homePage - 1)
}

async function goNextHomePage() {
  if (!canGoNextHomePage.value) return
  await transactionStore.loadHomePage(transactionStore.homePage + 1)
}

const groupedRecentTransactions = computed(() => {
  const grouped = []
  const groupMap = new Map()
  for (const tx of visibleHomeTransactions.value) {
    const key = dateKeyOf(tx.occurred_at)
    if (!groupMap.has(key)) {
      const group = { dateKey: key, label: dateLabelOf(tx.occurred_at), items: [], incomeMinor: 0, expenseMinor: 0 }
      groupMap.set(key, group)
      grouped.push(group)
    }
    const group = groupMap.get(key)
    group.items.push(tx)
    if (!isCountableForIncomeExpense(tx)) continue
    const effectiveAmountMinor = getEffectiveTransactionAmountMinor(tx)
    if (tx.type === 'income') {
      group.incomeMinor += Math.abs(effectiveAmountMinor)
    } else if (tx.type === 'expense') {
      group.expenseMinor += Math.abs(effectiveAmountMinor)
    }
  }
  return grouped
})

function dateKeyOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'invalid-date'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function labelOf(type) {
  if (type === 'expense') return t('home_tx.type.expense')
  if (type === 'income') return t('home_tx.type.income')
  if (type === 'transfer') return t('home_tx.type.transfer')
  return t('home_tx.type.balance')
}

function labelOfTransaction(tx) {
  if (!tx) return '結餘'
  if (tx.origin_type === 'reimbursement') return '報銷'
  if (tx.origin_type === 'loan_payment') {
    return loanTransactionLabel(tx)
  }
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  if (tx.type === 'transfer') return '轉帳'
  if (tx.type === 'adjustment') return '結餘'
  const kind = category?.kind
  if (kind === 'income') return '收入'
  if (kind === 'expense') return '支出'
  return labelOf(tx.type)
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') {
    return tx.type === 'income' ? '收回' : '借出'
  }
  if (loanDirection === 'borrow') {
    return tx.type === 'expense' ? '歸還' : '借入'
  }
  return tx.type === 'income' ? '收回' : '借出'
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

function accountNameOfTransaction(tx) {
  if (!tx?.account_id) return t('home_tx.unknown_account')
  return accountStore.accounts.find((item) => item.id === tx.account_id)?.name ?? t('home_tx.unknown_account')
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(resolveIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function editorAttributionOf(tx) {
  return buildTransactionEditorAttributionView(tx, {
    currentUserId: currentUserId.value,
    isSharedLedger: activeLedgerIsShared.value,
  })
}

async function refreshSharedLedgerFlag() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    activeLedgerIsShared.value = false
    return
  }
  try {
    const meta = await getSetting(ledgerId, 'shared_ledger_meta')
    activeLedgerIsShared.value = Boolean(meta && typeof meta === 'object' && meta.shared_ledger_id)
  } catch {
    activeLedgerIsShared.value = false
  }
  try {
    const { getSharedLedgerSession } = await import('@/services/shared-ledger/backend')
    currentUserId.value = String(getSharedLedgerSession()?.user?.id ?? '')
  } catch {
    currentUserId.value = ''
  }
}

onMounted(() => {
  void refreshSharedLedgerFlag()
})

function noteText(tx) {
  return stripAddonSummaryFromNote(tx?.note).trim() || '-'
}

function addonDeltaMajor(note) {
  return addonDeltaMajorFromNote(note)
}

function addonDeltaTag(note) {
  return addonDeltaTagText(note)
}

function showAddonDeltaTag(tx) {
  if (!tx) return false
  if (tx.type === 'transfer' && Number(tx.amount_minor ?? 0) > 0) return false
  return Boolean(addonDeltaTag(tx.note))
}

function openEdit(tx) {
  if (!tx) return
  rememberHomeScrollPosition()
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}
</script>

<style scoped>
.home-tx-feed {
  display: grid;
  gap: 8px;
  padding: 8px 0 4px;
  border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
}

.home-tx-head {
  display: grid;
  gap: 4px;
}

.home-tx-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.home-tx-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.home-tx-tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.home-tx-tool {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  text-decoration: none;
  border-radius: 999px;
}

.home-tx-tool:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.home-tx-meta {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.tx-list {
  list-style: none;
  padding: 0;
  margin: 4px 0 0;
  display: grid;
  gap: 14px;
}

.tx-date-group {
  display: grid;
  gap: 0;
}

.tx-date-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 650;
  padding: 6px 2px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.tx-date-total {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.tx-date-total small {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.tx-day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}

.tx-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 2px;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: transparent;
  cursor: pointer;
  outline: none;
  min-width: 0;
  content-visibility: auto;
  contain-intrinsic-size: auto 68px;
  overflow: hidden;
}

.tx-day-list li:last-child .tx-item {
  border-bottom: 0;
}

.tx-item:active {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}
.tx-item:focus, .tx-item:focus-visible {
  outline: none;
  box-shadow: none
}
.tx-main {
  flex: 1;
  min-width: 0
}
.tx-icon-col {
  width: 28px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 2px;
}
.tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 1;
  text-align: right;
  min-width: 0;
  max-width: 42%;
}
.amount-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.addon-delta {
  font-size: 12px;
  line-height: 1.2
}
.addon-delta.plus {
  color: var(--delta-plus)
}
.addon-delta.minus {
  color: var(--delta-minus)
}
.tx-type {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  font-weight: 650;
  font-size: 15px;
  margin-bottom: 2px;
  min-width: 0;
  max-width: 100%
}
.tx-type span {
  min-width: 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden
}
.tx-main .muted {
  min-width: 0;
}
.tx-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.tx-editor-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.tx-editor-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
}
.tx-editor-initial {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: color-mix(in srgb, var(--primary) 78%, #111 22%);
}
.tx-time {
  flex-shrink: 0;
}
.tx-note {
  display: block;
  min-width: 0;
  flex: 1;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tx-account-side {
  max-width: 120px
}
.tx-icon {
  font-size: 18px;
  color: var(--muted);
  flex-shrink: 0;
}

.empty-item {
  text-align: center;
  padding: 0;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 28px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.empty-state strong {
  font-size: var(--text-md);
}
.empty-state-icon {
  width: 40px;
  height: 40px;
  border-radius: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--muted);
  font-size: 22px;
}
.empty-state-copy {
  margin: 0;
  max-width: 22rem;
  line-height: 1.5;
}
.empty-state-action {
  min-width: 108px;
}
.home-tx-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  flex-wrap: wrap;
}

.home-tx-page-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  font-weight: 650;
  padding: 6px 4px;
  cursor: pointer;
}

.home-tx-page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.home-tx-page-status {
  flex: 1;
  text-align: center;
  min-width: 10rem;
  line-height: 1.4;
  font-size: 12px;
}
</style>
