<template>
  <section class="stack">
    <h2 class="page-title">{{ t('budgeting.title') }}</h2>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.monthly_budget') }}</h3>
        <div class="month-controls">
          <button class="btn month-btn" :disabled="budgetStore.loading" @click="changeMonth(-1)">‹</button>
          <span class="month-label">{{ displayMonth }}</span>
          <button class="btn month-btn" :disabled="budgetStore.loading" @click="changeMonth(1)">›</button>
          <button class="btn month-today" :disabled="budgetStore.loading" @click="goCurrentMonth">{{ t('budgeting.this_month') }}</button>
        </div>
      </header>

      <div class="stack stat">
        <div class="row">
          <span class="muted">{{ t('budgeting.budget_total') }}</span>
          <MoneyText :value-minor="budgetStore.totalBudgetMinor" />
        </div>
        <div class="row">
          <span class="muted">{{ t('budgeting.used') }}</span>
          <MoneyText :value-minor="budgetStore.totalSpentMinor" />
        </div>
        <div class="row">
          <span class="muted">{{ t('budgeting.remaining') }}</span>
          <MoneyText :value-minor="budgetStore.remainMinor" />
        </div>
      </div>

      <div class="row action-row">
        <button class="btn" @click="copyPreviousMonth">{{ t('budgeting.copy_previous') }}</button>
        <button class="btn primary" @click="openCreate">{{ t('budgeting.add_item') }}</button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.items_by_category') }}</h3>
        <span class="badge">{{ t('budgeting.items_count', { count: budgetStore.items.length }) }}</span>
      </header>

      <ul class="list">
        <li v-for="item in budgetStore.items" :key="item.id" class="item-row">
          <div class="item-main">
            <div class="pie-shell" :class="{ over: isItemOverBudget(item) }">
              <div class="mini-pie" :style="itemPieStyle(item)">
                <div class="pie-hole">
                  <strong>{{ itemUsedPercentLabel(item) }}</strong>
                  <small>{{ t('budgeting.used') }}</small>
                </div>
              </div>
            </div>

            <div class="item-content">
              <div class="row">
                <span>{{ categoryName(item.category_id) }}</span>
                <MoneyText :value-minor="item.amount_minor" />
              </div>
              <div class="row">
                <small class="muted">
                  {{ t('budgeting.used') }} {{ formatMajor(itemSpentMinor(item.category_id)) }} / {{ t('budgeting.remaining') }} {{ formatMajor(itemRemainMinor(item)) }}
                </small>
                <div class="btn-wrap">
                  <button class="btn" @click="openEdit(item)">{{ t('budgeting.edit') }}</button>
                  <button class="btn" @click="removeItem(item.id)">{{ t('budgeting.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li v-if="budgetStore.items.length === 0" class="muted">{{ t('budgeting.empty') }}</li>
      </ul>
    </article>

    <BudgetItemSheet
      :open="isSheetOpen"
      :item="editingItem"
      :categories="categoryStore.expenseCategories"
      :category-groups="categoryStore.expenseCategoryGroups"
      @close="closeSheet"
      @save="saveItem"
    />

    <AppDialog
      :open="deleteDialogOpen"
      :title="t('budgeting.delete')"
      :message="t('budgeting.confirm_delete')"
      :cancel-text="t('common.cancel')"
      :confirm-text="t('budgeting.delete')"
      :loading="deleteLoading"
      @close="closeDeleteDialog"
      @confirm="confirmRemoveItem"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetItemSheet from '@/ui/components/budget/BudgetItemSheet.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useI18n } from '@/ui/services/i18n.service'

const budgetStore = useBudgetStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const isSheetOpen = ref(false)
const editingItem = ref(null)
const deleteDialogOpen = ref(false)
const deleteLoading = ref(false)
const pendingDeleteItemId = ref('')

function changeMonth(offset) {
  const monthKey = shiftMonthKey(budgetStore.monthKey, offset)
  if (!monthKey) return
  budgetStore.loadMonth(monthKey)
}

function goCurrentMonth() {
  const monthKey = monthKeyFromDate(new Date())
  if (monthKey === budgetStore.monthKey) return
  budgetStore.loadMonth(monthKey)
}

const displayMonth = computed(() => {
  if (!budgetStore.monthKey) return '-'
  const [year, month] = budgetStore.monthKey.split('-')
  return t('budgeting.month_display', { year, month })
})

function shiftMonthKey(monthKey, offset = 0) {
  const [year, month] = String(monthKey ?? '').split('-').map((part) => Number(part))
  if (!year || !month) return ''
  const next = new Date(year, month - 1 + offset, 1)
  return monthKeyFromDate(next)
}

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name ?? t('budgeting.deleted_category')
}

function itemSpentMinor(categoryId) {
  return Number(budgetStore.spentMap[categoryId] ?? 0)
}

function itemBudgetMinor(item) {
  return Math.max(0, Number(item?.amount_minor ?? 0))
}

function itemRemainMinor(item) {
  return itemBudgetMinor(item) - itemSpentMinor(item?.category_id)
}

function itemUsedRatio(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) return 0
  return itemSpentMinor(item.category_id) / budgetMinor
}

function itemUsedPercentLabel(item) {
  return `${Math.round(itemUsedRatio(item) * 100)}%`
}

function isItemOverBudget(item) {
  return itemBudgetMinor(item) > 0 && itemUsedRatio(item) > 1
}

function itemPieStyle(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) {
    return {
      background: 'conic-gradient(var(--chart-track) 0deg 360deg)',
    }
  }

  const usedDeg = Math.min(360, Math.max(0, itemUsedRatio(item)) * 360)
  return {
    background: `conic-gradient(var(--chart-budget-used) 0deg ${usedDeg}deg, var(--chart-budget-remain) ${usedDeg}deg 360deg)`,
  }
}

function numberFormatLocale() {
  return locale.value === 'en' ? 'en-US' : 'zh-TW'
}

function formatMajor(amountMinor) {
  const minor = Number(amountMinor)
  if (!Number.isFinite(minor)) return ''

  const hasFraction = Math.abs(minor) % 100 !== 0
  return new Intl.NumberFormat(numberFormatLocale(), {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function openCreate() {
  editingItem.value = null
  isSheetOpen.value = true
}

function openEdit(item) {
  editingItem.value = item
  isSheetOpen.value = true
}

function closeSheet() {
  isSheetOpen.value = false
  editingItem.value = null
}

async function saveItem(payload) {
  try {
    await budgetStore.upsertItem(payload)
    uiStore.pushToast(t('budgeting.toast.saved'))
    closeSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.save_failed'), 'error')
  }
}

function removeItem(itemId) {
  pendingDeleteItemId.value = itemId
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleteLoading.value) return
  deleteDialogOpen.value = false
  pendingDeleteItemId.value = ''
}

async function confirmRemoveItem() {
  if (!pendingDeleteItemId.value || deleteLoading.value) return
  deleteLoading.value = true
  try {
    await budgetStore.deleteItem(pendingDeleteItemId.value)
    uiStore.pushToast(t('budgeting.toast.deleted'))
    deleteDialogOpen.value = false
    pendingDeleteItemId.value = ''
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.delete_failed'), 'error')
  } finally {
    deleteLoading.value = false
  }
}

async function copyPreviousMonth() {
  try {
    const result = await budgetStore.copyFromPreviousMonth()
    if (!result.copied) {
      uiStore.pushToast(t('budgeting.toast.copy_not_found', { fromMonth: result.fromMonth }))
      return
    }
    uiStore.pushToast(t('budgeting.toast.copied', { count: result.copied }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.copy_failed'), 'error')
  }
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.page-title {
  font-size: 24px
}
.month-controls {
  display: flex;
  align-items: center;
  gap: 6px
}
.month-label {
  min-width: 90px;
  text-align: center;
  font-weight: 700
}
.month-btn {
  width: 36px;
  padding: 8px 0
}
.month-today {
  padding: 8px 10px
}
.stat {
  margin-top: 10px
}
.action-row {
  margin-top: 12px
}
.list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.item-row {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.item-main {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px
}
.item-content {
  display: grid;
  gap: 8px;
  min-width: 0
}
.btn-wrap {
  display: flex;
  gap: 6px
}
.pie-shell {
  display: grid;
  place-items: center
}
.mini-pie {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  display: grid;
  place-items: center;
  box-shadow: 0 4px 14px color-mix(in srgb, black 24%, transparent)
}
.pie-shell.over .mini-pie {
  border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--danger) 36%, transparent)
}
.pie-hole {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 90%, var(--bg) 10%);
  display: grid;
  place-items: center;
  gap: 1px;
  text-align: center
}
.pie-hole strong {
  font-size: 12px;
  line-height: 1
}
.pie-hole small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1
}</style>
