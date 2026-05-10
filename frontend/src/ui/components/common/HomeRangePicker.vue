<template>
  <div class="range-picker">
    <button type="button" class="input trigger" @click="toggleOpen">
      <span>{{ displayLabel }}</span>
      <span class="icon">▾</span>
    </button>

    <InputBottomSheet
      :open="open"
      :title="t('home_range_picker.title')"
      :body-class="'panel-sheet-body'"
      :sheet-class="'panel-sheet'"
      :show-footer="true"
      @close="open = false"
    >
      <header class="panel-head">
        <button type="button" class="nav-btn" @click="shift(-1)">‹</button>
        <strong>{{ headerLabel }}</strong>
        <button type="button" class="nav-btn" @click="shift(1)">›</button>
      </header>

      <div v-if="mode === 'year'" class="year-grid">
        <button
          v-for="y in yearOptions"
          :key="`y-${y}`"
          type="button"
          class="cell-btn"
          :class="{ active: y === year }"
          @click="pickYear(y)"
        >
          {{ y }}
        </button>
      </div>

      <div v-else-if="mode === 'month'" class="month-grid">
        <button
          v-for="m in 12"
          :key="`m-${m}`"
          type="button"
          class="cell-btn"
          :class="{ active: m === viewMonth + 1 }"
          @click="pickMonth(m)"
        >
          {{ monthName(m) }}
        </button>
      </div>

      <div v-else>
        <div class="week-row">
          <span v-for="w in weekNames" :key="w">{{ w }}</span>
        </div>
        <div class="day-grid">
          <button
            v-for="cell in dayCells"
            :key="cell.iso"
            type="button"
            class="cell-btn day-btn"
            :class="{ muted: !cell.inMonth, active: isDayActive(cell) }"
            :disabled="multiSelectDays && !cell.inMonth"
            @click="pickDay(cell.iso)"
          >
            {{ cell.day }}
          </button>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn" @click="pickToday">{{ t('common.today') }}</button>
        <button type="button" class="btn" @click="open = false">{{ t('common.close') }}</button>
      </template>
    </InputBottomSheet>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  mode: {
    type: String,
    default: 'month',
  },
  year: {
    type: Number,
    default: new Date().getFullYear(),
  },
  month: {
    type: String,
    default: '',
  },
  day: {
    type: String,
    default: '',
  },
  multiSelectDays: {
    type: Boolean,
    default: false,
  },
  selectedDayNumbers: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:year', 'update:month', 'update:day', 'toggle:day-number'])

const { t, locale } = useI18n()
const open = ref(false)
// 2024-01-07 is a Sunday; we generate narrow weekday labels for Sun–Sat
const weekNames = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i))
  )
)
const now = new Date()
const viewYear = ref(props.year || now.getFullYear())
const viewMonth = ref(parseMonth(props.month)?.month ?? now.getMonth())

watch(
  () => props.year,
  (value) => {
    if (Number.isFinite(Number(value))) viewYear.value = Number(value)
  },
)

watch(
  () => props.month,
  (value) => {
    const parsed = parseMonth(value)
    if (!parsed) return
    viewYear.value = parsed.year
    viewMonth.value = parsed.month
  },
)

watch(
  () => props.day,
  (value) => {
    const parsed = parseDay(value)
    if (!parsed) return
    viewYear.value = parsed.year
    viewMonth.value = parsed.month
  },
)

const displayLabel = computed(() => {
  if (props.mode === 'year') return t('home_page.year_display', { year: props.year || now.getFullYear() })
  if (props.mode === 'day') return props.day || toDayKey(now)
  return props.month || toMonthKey(now)
})

const headerLabel = computed(() => {
  if (props.mode === 'year') return t('home_page.year_display', { year: viewYear.value })
  if (props.mode === 'month') return t('home_page.year_display', { year: viewYear.value })
  return t('home_page.month_display', { year: viewYear.value, month: viewMonth.value + 1 })
})

const yearOptions = computed(() => {
  const center = viewYear.value
  return Array.from({ length: 12 }, (_, i) => center - 6 + i)
})

const dayCells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      day: d.getDate(),
      iso: toDayKey(d),
      inMonth: d.getMonth() === viewMonth.value,
    })
  }
  return cells
})

function shift(offset) {
  if (props.mode === 'year') {
    viewYear.value += offset * 12
    return
  }
  if (props.mode === 'month') {
    viewYear.value += offset
    return
  }
  const next = new Date(viewYear.value, viewMonth.value + offset, 1)
  viewYear.value = next.getFullYear()
  viewMonth.value = next.getMonth()
}

function pickYear(value) {
  emit('update:year', value)
  open.value = false
}

function pickMonth(value) {
  const monthKey = `${viewYear.value}-${String(value).padStart(2, '0')}`
  emit('update:month', monthKey)
  open.value = false
}

function pickDay(iso) {
  if (props.multiSelectDays) {
    const parsed = parseDay(iso)
    if (parsed) emit('toggle:day-number', { day: parsed.day, dayKey: iso })
    return
  }
  emit('update:day', iso)
  open.value = false
}

function pickToday() {
  const today = new Date()
  if (props.mode === 'year') {
    emit('update:year', today.getFullYear())
  } else if (props.mode === 'month') {
    emit('update:month', toMonthKey(today))
  } else if (props.multiSelectDays) {
    viewYear.value = today.getFullYear()
    viewMonth.value = today.getMonth()
    emit('toggle:day-number', { day: today.getDate(), dayKey: toDayKey(today) })
    return
  } else {
    emit('update:day', toDayKey(today))
  }
  open.value = false
}

function toggleOpen() {
  open.value = !open.value
}

function monthName(month) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long' }).format(new Date(2024, month - 1, 1))
}

function isDayActive(cell) {
  if (!props.multiSelectDays) return cell.iso === props.day
  return cell.inMonth && props.selectedDayNumbers.includes(cell.day)
}

function parseMonth(monthKey) {
  const [year, month] = String(monthKey ?? '').split('-').map((part) => Number(part))
  if (!year || !month) return null
  return { year, month: month - 1 }
}

function parseDay(dayKey) {
  const [year, month, day] = String(dayKey ?? '').split('-').map((part) => Number(part))
  if (!year || !month || !day) return null
  return { year, month: month - 1, day }
}

function toMonthKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function toDayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

</script>

<style scoped>.range-picker {
  position: relative
}
.trigger {
  display: flex;
  justify-content: space-between;
  align-items: center
}
.icon {
  opacity: 0.8
}
.panel-sheet {
  padding: 16px;
}
.panel-sheet-body {
  display: grid;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px
}
.nav-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--surface-soft-accent);
  color: var(--primary-soft);
  font-size: 20px;
  cursor: pointer
}
.year-grid, .month-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px
}
.week-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 4px
}
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px
}
.cell-btn {
  border: 0;
  border-radius: 10px;
  background: var(--surface-soft-accent);
  color: var(--text);
  min-height: 34px;
  cursor: pointer;
  font-weight: 700
}
.day-btn {
  min-height: 32px
}
.cell-btn.muted {
  opacity: 0.45
}
.cell-btn.active {
  background: var(--primary);
  color: var(--primary-contrast);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent)
}
.foot {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px
}</style>
