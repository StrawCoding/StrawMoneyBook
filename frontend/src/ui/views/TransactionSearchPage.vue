<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('transaction_search.title') }}</h2>
      <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <input
        v-model.trim="keyword"
        class="input"
        type="search"
        :placeholder="t('transaction_search.search_placeholder')"
      />
      <details class="advanced-filter">
        <summary>{{ t('transaction_search.advanced_search') }}</summary>
        <div class="advanced-grid">
          <label>
            {{ t('transaction_search.start_date') }}
            <HomeRangePicker mode="day" :day="startDay" @update:day="pickStartDay" />
          </label>
          <label>
            {{ t('transaction_search.end_date') }}
            <HomeRangePicker mode="day" :day="endDay" @update:day="pickEndDay" />
          </label>
        </div>
      </details>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <small class="muted">{{ t('transaction_search.results_count', { count: searchTotal }) }}</small>
        <button class="btn" :class="{ active: batchMode }" @click="toggleBatchMode">
          {{ batchMode ? '取消批量' : '批量操作' }}
        </button>
      </header>

      <div v-if="batchMode" class="batch-bar">
        <button class="btn" @click="toggleSelectAll">
          {{ selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0 ? '取消全選' : '全選' }}
        </button>
        <span class="muted batch-count">已選 {{ selectedIds.size }} 筆</span>
        <button class="btn primary" :disabled="selectedIds.size === 0 || batchWorking" @click="openBatchEditSheet">
          批量編輯
        </button>
      </div>

      <ul class="tx-list">
        <li
          v-for="tx in filteredTransactions"
          :key="tx.id"
          class="tx-item"
          :class="{ selectable: batchMode, selected: selectedIds.has(tx.id) }"
          role="button"
          tabindex="0"
          @click="batchMode ? toggleSelect(tx.id) : openEdit(tx)"
        >
          <span v-if="batchMode" class="batch-checkbox" :class="{ checked: selectedIds.has(tx.id) }">
            <font-awesome-icon v-if="selectedIds.has(tx.id)" icon="fa-solid fa-check" />
          </span>
          <div class="tx-main">
            <strong class="tx-title">
              <font-awesome-icon v-if="categoryIcon(tx)" :icon="categoryIcon(tx)" class="tx-icon" />
              <span>{{ labelOfTransaction(tx) }}</span>
            </strong>
            <small class="muted tx-account-line">
              <font-awesome-icon v-if="accountIcon(tx.account_id)" :icon="accountIcon(tx.account_id)" class="tx-account-icon" />
              <span>{{ accountName(tx.account_id) }} ・ {{ formatTime(tx.occurred_at) }}</span>
            </small>
            <small class="muted tx-note">{{ noteText(tx.note) || '-' }}</small>
          </div>
          <div class="amount-wrap">
            <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
            <small
              v-if="showAddonDeltaTag(tx)"
              class="addon-delta"
              :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
            >
              {{ addonDeltaTag(tx.note) }}
            </small>
          </div>
        </li>
        <li v-if="!filteredTransactions.length" class="muted empty">{{ t('transaction_search.no_results') }}</li>
      </ul>

      <nav v-if="searchTotal > 0" class="pagination-bar" aria-label="交易搜尋分頁">
        <button class="btn" :disabled="!canGoPreviousPage" @click="goPreviousPage">
          {{ t('common.previous_page') }}
        </button>
        <span class="muted page-status">
          {{ t('common.page_status', { page: currentPage, totalPages }) }}
          ・{{ t('common.page_range', { start: pageStart, end: pageEnd, total: searchTotal }) }}
        </span>
        <button class="btn" :disabled="!canGoNextPage" @click="goNextPage">
          {{ t('common.next_page') }}
        </button>
      </nav>
    </article>

    <InputBottomSheet
      :open="batchEditSheetOpen"
      title="批量編輯交易"
      :body-class="'stack form-wrap'"
      :show-footer="true"
      :close-text="'取消'"
      @close="closeBatchEditSheet"
    >
      <div class="batch-summary muted">
        已選 {{ selectedIds.size }} 筆
        <span v-if="selectedBatchStats.expenseCount">・支出 {{ selectedBatchStats.expenseCount }}</span>
        <span v-if="selectedBatchStats.incomeCount">・收入 {{ selectedBatchStats.incomeCount }}</span>
        <span v-if="selectedBatchStats.transferCount">・轉帳 {{ selectedBatchStats.transferCount }}</span>
        <span v-if="selectedBatchStats.adjustmentCount">・調整 {{ selectedBatchStats.adjustmentCount }}</span>
      </div>
      <label>
        分類
        <CustomSelect v-model="batchPatch.categoryId" :groups="batchCategoryGroups" :placeholder="'選擇分類（不變 / 指定分類）'" />
      </label>
      <label>
        備註
        <CustomSelect v-model="batchPatch.noteMode" :options="batchNoteModeOptions" :placeholder="'選擇備註處理方式'" />
      </label>
      <label v-if="batchPatch.noteMode === 'replace'">
        新備註
        <textarea v-model.trim="batchPatch.note" class="textarea" rows="3" placeholder="輸入要套用到所有選取交易的備註" />
      </label>
      <label>
        可報銷
        <CustomSelect
          v-model="batchPatch.isReimbursableMode"
          :options="batchReimbursableOptions"
          :placeholder="'選擇是否更新可報銷'"
        />
      </label>
      <label>
        納入預算
        <CustomSelect
          v-model="batchPatch.includeInBudgetMode"
          :options="batchToggleOptions"
          :placeholder="'選擇是否更新納入預算'"
        />
      </label>
      <label>
        納入收支分析
        <CustomSelect
          v-model="batchPatch.includeInAnalysisMode"
          :options="batchToggleOptions"
          :placeholder="'選擇是否更新納入收支分析'"
        />
      </label>
      <p class="muted batch-hint">
        分類只會套用到收入 / 支出交易；可報銷只會套用到支出交易。若所選交易中包含不適用項目，完成後會在結果摘要中顯示略過筆數。
      </p>
      <template #footer>
        <button class="btn primary" :disabled="batchWorking" @click="applyBatchEdit">
          {{ batchWorking ? '更新中...' : `套用至 ${selectedIds.size} 筆` }}
        </button>
      </template>
    </InputBottomSheet>

  </section>
</template>

<script setup>
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { useTransactionSearchPage } from '@/ui/composables/useTransactionSearchPage'

const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const {
  keyword,
  startDay,
  endDay,
  filteredTransactions,
  searchTotal,
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  canGoPreviousPage,
  canGoNextPage,
  batchMode,
  selectedIds,
  batchEditSheetOpen,
  batchWorking,
  batchPatch,
  batchCategoryGroups,
  batchNoteModeOptions,
  batchToggleOptions,
  batchReimbursableOptions,
  selectedBatchStats,
  pickStartDay,
  pickEndDay,
  toggleBatchMode,
  toggleSelectAll,
  goPreviousPage,
  goNextPage,
  openBatchEditSheet,
  closeBatchEditSheet,
  applyBatchEdit,
  toggleSelect,
  openEdit,
  categoryIcon,
  labelOfTransaction,
  accountIcon,
  accountName,
  formatTime,
  noteText,
  showAddonDeltaTag,
  addonDeltaMajor,
  addonDeltaTag,
} = useTransactionSearchPage({
  ledgerStore,
  categoryStore,
  accountStore,
  loanStore,
  uiStore,
  route,
  router,
  t,
  locale,
})
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 18px
}
.advanced-filter {
  margin-top: 8px;
  overflow: hidden;
  max-height: 34px;
  opacity: 0.92;
  transition:
    max-height var(--anim-mid) ease,
    opacity var(--anim-fast) ease
}
.advanced-filter[open] {
  max-height: 240px;
  opacity: 1
}
.advanced-filter summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px
}
.advanced-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.advanced-grid label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px
}
.tx-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.tx-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  content-visibility: auto;
  contain-intrinsic-size: auto 72px;
}
.tx-main {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0
}
.tx-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0
}
.tx-icon {
  width: 13px;
  color: var(--primary-soft)
}
.tx-title span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
}
.tx-account-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0
}
.tx-account-icon {
  width: 12px
}
.tx-account-line span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
}
.tx-note {
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden
}
.amount-wrap {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 0;
  text-align: right
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
.empty {
  text-align: center;
  padding: 12px
}
.panel-head {
  margin-bottom: 8px
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  margin-bottom: 4px
}
.batch-count {
  flex: 1
}
.batch-summary,
.batch-hint {
  font-size: 12px;
  line-height: 1.5
}
.pagination-bar {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px
}
.page-status {
  text-align: center;
  min-width: 0
}
.tx-item.selectable {
  cursor: pointer;
  gap: 8px
}
.tx-item.selected {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent)
}
.batch-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--primary)
}
.batch-checkbox.checked {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff
}
.btn.active {
  background: var(--primary);
  color: #fff
}
@media (max-width: 420px) {
  .pagination-bar {
    grid-template-columns: 1fr 1fr
  }
  .page-status {
    grid-column: 1 / -1;
    grid-row: 1;
    font-size: 12px
  }
}</style>
