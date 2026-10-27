<template>
  <article class="habitat-flow-section budget-category-table" data-testid="budget-category-table">
    <header class="row">
      <h3>{{ t('budgeting.display.category_table') }}</h3>
      <span class="badge">{{ t('budgeting.items_count', { count: budgetStore.items.length }) }}</span>
    </header>

    <div v-if="!hasRows" class="empty-wrap">
      <p class="muted empty-copy">{{ t('budgeting.display.empty') }}</p>
      <button type="button" class="btn primary" data-testid="budget-category-empty-settings" @click="$emit('go-settings')">
        {{ t('budgeting.display.go_settings') }}
      </button>
    </div>

    <div v-else class="grouped-list">
      <section
        v-for="section in budgetStore.groupedBudgetSections"
        :key="section.type === 'container' ? section.container.id : 'unassigned'"
        class="budget-section"
      >
        <button
          v-if="section.type === 'container'"
          type="button"
          class="container-row"
          :class="{ 'month-over': section.container.isOver || section.container.isPeriodOver }"
          :data-testid="`budget-category-container-${section.container.id}`"
          @click="$emit('select-container', section.container)"
        >
          <span class="row-icon-wrap">
            <font-awesome-icon :icon="containerIcon" class="row-icon" />
          </span>
          <div class="row-main">
            <div class="row-title">
              <strong>{{ section.container.name }}</strong>
              <span class="pool-period-chip">{{ containerPeriodLabel(section.container) }}</span>
            </div>
            <BudgetProgressBar
              class="row-progress"
              :ratio="containerUsedRatio(section.container)"
              :over="section.container.isOver"
              :percent-label="containerUsedPercentLabel(section.container)"
              :subtitle="t('budgeting.used')"
              :aria-label="section.container.name"
            />
            <div class="amount-grid">
              <div class="stat-cell">
                <span class="muted">{{ t('budgeting.budget_total') }}</span>
                <MoneyText :value-minor="containerBudgetMinor(section.container)" />
              </div>
              <div class="stat-cell">
                <span class="muted">{{ t('budgeting.used') }}</span>
                <MoneyText :value-minor="containerSpentMinor(section.container)" />
              </div>
              <div class="stat-cell" :class="{ 'remain-over': section.container.isOver }">
                <span class="muted">{{ t('budgeting.remaining') }}</span>
                <MoneyText :value-minor="containerRemainMinor(section.container)" />
              </div>
            </div>
          </div>
        </button>
        <h4 v-else class="unassigned-title">{{ t('budgeting.container.unassigned_title') }}</h4>

        <ul class="list">
          <li v-for="item in section.items" :key="item.id">
            <button
              type="button"
              class="item-row"
              :class="{ 'item-over': isItemOverBudget(item) }"
              :data-testid="`budget-category-item-${item.id}`"
              @click="$emit('select-item', item)"
            >
              <span class="row-icon-wrap">
                <font-awesome-icon :icon="categoryIcon(item.category_id)" class="row-icon" />
              </span>
              <div class="row-main">
                <div class="row-title">
                  <strong>{{ categoryName(item.category_id) }}</strong>
                  <span v-if="isDailyPoolChild(item)" class="pool-child-label muted">
                    {{ t('budgeting.container.daily_pool_child_label') }}
                  </span>
                </div>
                <BudgetProgressBar
                  class="row-progress"
                  :ratio="itemUsedRatio(item)"
                  :over="itemUsedRatio(item) > 1"
                  :percent-label="itemUsedPercentLabel(item)"
                  :subtitle="isDailyPoolChild(item) ? t('budgeting.display.pool_share') : t('budgeting.used')"
                  :aria-label="categoryName(item.category_id)"
                />
                <div class="amount-grid">
                  <div class="stat-cell">
                    <span class="muted">{{ t('budgeting.budget_total') }}</span>
                    <MoneyText v-if="!isDailyPoolChild(item)" :value-minor="itemBudgetMinor(item)" />
                    <span v-else class="muted">—</span>
                  </div>
                  <div class="stat-cell">
                    <span class="muted">{{ t('budgeting.used') }}</span>
                    <MoneyText :value-minor="itemSpentMinorForItem(item)" />
                  </div>
                  <div class="stat-cell" :class="{ 'remain-over': isItemOverBudget(item) }">
                    <span class="muted">{{ t('budgeting.remaining') }}</span>
                    <MoneyText v-if="!isDailyPoolChild(item)" :value-minor="itemRemainMinor(item)" />
                    <span v-else class="muted">—</span>
                  </div>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetProgressBar from '@/ui/components/budget/BudgetProgressBar.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  isDailyPoolChildItem,
  itemDisplayBudgetMinor,
  itemDisplayRemainMinor,
  itemDisplaySpentMinor,
  itemDisplayUsedPercentLabel,
  itemDisplayUsedRatio,
} from '@/core/services/budget.service'
import { defaultCategoryExpenseIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'

defineEmits(['select-item', 'select-container', 'go-settings'])

const budgetStore = useBudgetStore()
const categoryStore = useCategoryStore()
const { t } = useI18n()

const containerIcon = 'fa-solid fa-vault'
const hasRows = computed(() => (
  budgetStore.items.length > 0 || budgetStore.containers.length > 0
))

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name
    ?? t('budgeting.deleted_category')
}

function categoryIcon(categoryId) {
  const icon = categoryStore.categories.find((category) => category.id === categoryId)?.icon
  return normalizeFaIcon(icon, defaultCategoryExpenseIcon)
}

function isDailyPoolChild(item) {
  return isDailyPoolChildItem(item, budgetStore.containers)
}

function itemSpentMinorForItem(item) {
  return itemDisplaySpentMinor(item, budgetStore.spentMap)
}

function itemBudgetMinor(item) {
  return itemDisplayBudgetMinor(item, budgetStore.containers)
}

function itemRemainMinor(item) {
  return itemDisplayRemainMinor(item, budgetStore.spentMap, budgetStore.containers)
}

function itemUsedRatio(item) {
  return itemDisplayUsedRatio(item, budgetStore.spentMap, budgetStore.containers, budgetStore.items)
}

function itemUsedPercentLabel(item) {
  return itemDisplayUsedPercentLabel(item, budgetStore.spentMap, budgetStore.containers, budgetStore.items)
}

function isItemOverBudget(item) {
  return budgetStore.isItemOver(item)
}

function containerPeriodLabel(container) {
  return String(container?.period_mode ?? container?.periodMode ?? '').trim() === 'daily'
    ? t('budgeting.container.period_mode.daily')
    : t('budgeting.container.period_mode.monthly')
}

function containerBudgetMinor(container) {
  return Number(container?.periodBudgetMinor ?? container?.amount_minor ?? 0)
}

function containerSpentMinor(container) {
  return Number(container?.periodSpentMinor ?? container?.spentMinor ?? 0)
}

function containerRemainMinor(container) {
  return Number(container?.periodRemainMinor ?? container?.remainMinor ?? 0)
}

function containerUsedRatio(container) {
  const amountMinor = containerBudgetMinor(container)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0
  const ratio = containerSpentMinor(container) / amountMinor
  return Number.isFinite(ratio) ? ratio : 0
}

function containerUsedPercentLabel(container) {
  return `${Math.round(containerUsedRatio(container) * 100)}%`
}
</script>

<style scoped>
h3,
h4 {
  margin: 0;
}
.grouped-list {
  margin-top: 12px;
  display: grid;
  gap: 14px;
}
.budget-section {
  display: grid;
  gap: 8px;
}
.empty-wrap {
  display: grid;
  gap: 10px;
  justify-items: start;
  margin-top: 8px;
}
.empty-copy {
  margin: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.container-row,
.item-row {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 96%, var(--surface-soft-accent) 4%);
  color: inherit;
  text-align: left;
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.container-row.month-over,
.item-row.item-over {
  border-color: color-mix(in srgb, var(--danger, #d14343) 34%, var(--border) 66%);
  background: color-mix(in srgb, var(--danger, #d14343) 5%, var(--card) 95%);
}
.row-icon-wrap {
  width: 28px;
  display: flex;
  justify-content: center;
  padding-top: 2px;
  flex-shrink: 0;
}
.row-icon {
  font-size: 18px;
  color: var(--primary-soft, var(--primary));
}
.row-main {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 8px;
}
.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.row-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pool-period-chip,
.pool-child-label {
  font-size: 12px;
}
.row-progress {
  width: 100%;
}
.amount-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.stat-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.stat-cell .muted {
  font-size: 11px;
}
.remain-over {
  color: var(--danger, #d14343);
}
.unassigned-title {
  font-size: 14px;
}
</style>
