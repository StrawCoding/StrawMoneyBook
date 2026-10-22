<template>
  <section class="daily-stats" data-testid="budget-daily-stats">
    <header class="row daily-stats-head">
      <div>
        <h3>{{ t('budgeting.daily_stats.title') }}</h3>
        <p class="muted">{{ t('budgeting.daily_stats.subtitle') }}</p>
      </div>
      <button type="button" class="btn" @click="expanded = !expanded">
        {{ expanded ? t('budgeting.daily_stats.collapse') : t('budgeting.daily_stats.expand') }}
      </button>
    </header>

    <div v-show="expanded" class="daily-stats-table-wrap">
      <table class="daily-stats-table">
        <thead>
          <tr>
            <th>{{ t('budgeting.daily_stats.col_date') }}</th>
            <th class="num">{{ t('budgeting.daily_stats.col_planned') }}</th>
            <th class="num">{{ t('budgeting.daily_stats.col_spent') }}</th>
            <th class="num">{{ t('budgeting.daily_stats.col_diff') }}</th>
            <th class="num">{{ t('budgeting.daily_stats.col_cumulative') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.dayKey"
            :class="{ 'row-today': row.dayKey === todayKey, 'row-over': row.plannedMinor > 0 && row.spentMinor > row.plannedMinor }"
          >
            <td>{{ formatDayLabel(row.dayKey) }}</td>
            <td class="num">
              <MoneyText v-if="row.plannedMinor > 0" :value-minor="row.plannedMinor" />
              <span v-else class="muted">—</span>
            </td>
            <td class="num">
              <MoneyText v-if="row.spentMinor > 0" :value-minor="row.spentMinor" />
              <span v-else class="muted">—</span>
            </td>
            <td class="num" :class="{ 'diff-over': row.diffMinor < 0 }">
              <MoneyText v-if="row.plannedMinor > 0 || row.spentMinor > 0" :value-minor="row.diffMinor" />
              <span v-else class="muted">—</span>
            </td>
            <td class="num">
              <MoneyText v-if="row.cumulativeSpentMinor > 0" :value-minor="row.cumulativeSpentMinor" />
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!visibleRows.length" class="muted empty-copy">{{ t('budgeting.daily_stats.empty') }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { dateKeyForLedgerTimeZone } from '@/core/services/budget.service'

const { t } = useI18n()
const budgetStore = useBudgetStore()
const ledgerStore = useLedgerStore()

const expanded = ref(true)

const todayKey = computed(() => dateKeyForLedgerTimeZone(ledgerStore.activeLedger?.timezone))

const visibleRows = computed(() => {
  const rows = budgetStore.dailyStatsRows ?? []
  const today = todayKey.value
  const futureStartIndex = rows.findIndex((row) => row.dayKey > today)
  if (futureStartIndex === -1) return rows
  return rows.slice(0, futureStartIndex + 1)
})

function formatDayLabel(dayKey) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!matched) return dayKey
  const label = `${matched[2]}/${matched[3]}`
  return dayKey === todayKey.value ? `${label} · ${t('budgeting.daily_stats.today')}` : label
}
</script>

<style scoped>
.daily-stats {
  margin-top: var(--space-3, 12px);
}

.daily-stats-head {
  align-items: flex-start;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-2, 8px);
}

.daily-stats-head h3 {
  margin: 0;
  font-size: 1rem;
}

.daily-stats-head p {
  margin: 4px 0 0;
  font-size: 0.85rem;
}

.daily-stats-table-wrap {
  overflow-x: auto;
}

.daily-stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.daily-stats-table th,
.daily-stats-table td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  text-align: left;
  white-space: nowrap;
}

.daily-stats-table th.num,
.daily-stats-table td.num {
  text-align: right;
}

.daily-stats-table tbody tr.row-today {
  background: color-mix(in srgb, var(--accent, #3dd68c) 12%, transparent);
}

.daily-stats-table tbody tr.row-over td.diff-over,
.daily-stats-table td.diff-over {
  color: var(--danger, #f07178);
}

.empty-copy {
  margin: 8px 0 0;
  font-size: 0.85rem;
}
</style>
