<template>
  <section class="budget-month-calendar" data-testid="budget-month-calendar">
    <div class="row month-head">
      <button
        type="button"
        class="btn mini-btn"
        data-testid="budget-calendar-prev-month"
        @click="$emit('prev-month')"
      >
        ‹
      </button>
      <strong data-testid="budget-calendar-month-label">{{ monthLabel }}</strong>
      <button
        type="button"
        class="btn mini-btn"
        data-testid="budget-calendar-next-month"
        @click="$emit('next-month')"
      >
        ›
      </button>
    </div>

    <div class="week-head">
      <span v-for="label in weekLabels" :key="label">{{ label }}</span>
    </div>

    <div class="calendar-grid">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="day-cell"
        :class="{
          empty: !cell.dateKey,
          faded: cell.dateKey && !cell.inPeriod,
          selected: cell.dateKey === selectedDateKey,
          today: cell.isToday,
          over: cell.isOver,
        }"
        :data-testid="cell.dateKey ? `budget-calendar-day-${cell.dateKey}` : undefined"
        :data-in-period="cell.inPeriod ? 'true' : 'false'"
        :disabled="!cell.selectable"
        @click="selectDay(cell)"
      >
        <span class="day-num">{{ cell.dayLabel }}</span>
        <span v-if="cell.selectable && cell.spentMinor > 0" class="day-amount expense">
          -{{ formatMinor(cell.spentMinor) }}
        </span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { buildBudgetMonthCalendarCells } from '@/core/services/budget-daily-stats.js'

const props = defineProps({
  monthKey: {
    type: String,
    required: true,
  },
  dailyStatsRows: {
    type: Array,
    default: () => [],
  },
  periodStartDate: {
    type: String,
    default: '',
  },
  periodEndDate: {
    type: String,
    default: '',
  },
  todayKey: {
    type: String,
    default: '',
  },
  selectedDateKey: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['prev-month', 'next-month', 'select-day'])
const ledgerStore = useLedgerStore()
const { locale } = useI18n()

const weekLabels = computed(() => (
  Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + index))
  ))
))

const cells = computed(() => buildBudgetMonthCalendarCells({
  monthKey: props.monthKey,
  dailyStatsRows: props.dailyStatsRows,
  periodStartDate: props.periodStartDate,
  periodEndDate: props.periodEndDate,
  todayKey: props.todayKey,
}))

const monthLabel = computed(() => {
  const [year, month] = String(props.monthKey ?? '').split('-')
  return year && month ? `${year}/${month}` : props.monthKey
})

const ledgerCurrencyCode = computed(() => (
  normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD')
))

function selectDay(cell) {
  if (!cell?.selectable || !cell.dateKey) return
  emit('select-day', cell.dateKey)
}

function formatMinor(minor) {
  const value = Math.abs(Number(minor ?? 0))
  return new Intl.NumberFormat(resolveIntlLocale(), {
    style: 'currency',
    currency: ledgerCurrencyCode.value,
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}
</script>

<style scoped>
.month-head {
  justify-content: space-between;
  align-items: center;
}
.mini-btn {
  min-width: 42px;
}
.week-head {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  width: min(100%, 460px);
  margin-inline: auto;
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.calendar-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  width: min(100%, 460px);
  margin-inline: auto;
  min-width: 0;
}
.day-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 92%, transparent);
  aspect-ratio: 1 / 1;
  min-height: 52px;
  padding: 4px 3px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 2px;
  overflow: hidden;
  min-width: 0;
  color: var(--text);
}
.day-cell.empty {
  background: transparent;
  border-style: dashed;
}
.day-cell.faded {
  opacity: 0.38;
}
.day-cell.selected {
  border-color: var(--primary);
}
.day-cell.today {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 55%, transparent);
}
.day-cell.over {
  border-color: color-mix(in srgb, var(--danger, #d14343) 42%, var(--border) 58%);
  background: color-mix(in srgb, var(--danger, #d14343) 6%, var(--card) 94%);
}
.day-num {
  font-weight: 700;
  font-size: 12px;
  align-self: flex-start;
  line-height: 1.2;
}
.day-amount {
  width: 100%;
  font-size: 9px;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.expense {
  color: #ef4444;
}

@media (max-width: 480px) {
  .week-head,
  .calendar-grid {
    width: 100%;
    gap: 3px;
  }
  .day-cell {
    min-height: 46px;
    padding: 3px 2px;
  }
  .day-num {
    font-size: 11px;
  }
  .day-amount {
    font-size: 8px;
  }
}
</style>
