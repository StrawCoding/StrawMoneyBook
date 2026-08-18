<template>
  <div class="dt-picker">
    <button type="button" class="input trigger" @click="toggleOpen">
      <span>{{ displayText }}</span>
      <span class="icon">🗓</span>
    </button>

    <InputBottomSheet
      :open="open"
      :title="t('datetime.pick_date')"
      :body-class="'panel-sheet-body'"
      :sheet-class="'panel-sheet'"
      :show-footer="true"
      @close="closePanel"
    >
      <header class="month-head">
        <button type="button" class="nav-btn" @click="shiftMonth(-1)">‹</button>
        <strong>{{ monthLabel }}</strong>
        <button type="button" class="nav-btn" @click="shiftMonth(1)">›</button>
      </header>

      <div class="week-row">
        <span v-for="w in weekNames" :key="w">{{ w }}</span>
      </div>

      <div class="day-grid">
        <button
          v-for="cell in dayCells"
          :key="cell.iso"
          type="button"
          class="day-btn"
          :class="{ muted: !cell.inMonth, active: cell.iso === date, today: cell.isToday }"
          @click="pickDate(cell.iso)"
        >
          {{ cell.day }}
        </button>
      </div>

      <div v-if="showTime" class="time-wrap">
        <div class="time-col">
          <small>{{ t('datetime.hour') }}</small>
          <div class="time-list">
            <button
              v-for="h in hours"
              :key="`h-${h}`"
              type="button"
              class="time-btn"
              :class="{ active: h === hour }"
              @click="pickHour(h)"
            >
              {{ pad2(h) }}
            </button>
          </div>
        </div>

        <div class="time-col">
          <small>{{ t('datetime.minute') }}</small>
          <div class="time-list">
            <button
              v-for="m in minutes"
              :key="`m-${m}`"
              type="button"
              class="time-btn"
              :class="{ active: m === minute }"
              @click="pickMinute(m)"
            >
              {{ pad2(m) }}
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn" @click="setNow">{{ t('datetime.now') }}</button>
        <button type="button" class="btn" @click="closePanel">{{ t('common.done') }}</button>
      </template>
    </InputBottomSheet>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { resolveIntlLocale, useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()

const props = defineProps({
  date: {
    type: String,
    required: true,
  },
  hour: {
    type: Number,
    required: true,
  },
  minute: {
    type: Number,
    required: true,
  },
  preferBottomAnchor: {
    type: Boolean,
    default: false,
  },
  showTime: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:date', 'update:hour', 'update:minute'])

const weekNames = computed(() => [
  t('datetime.week.sun'),
  t('datetime.week.mon'),
  t('datetime.week.tue'),
  t('datetime.week.wed'),
  t('datetime.week.thu'),
  t('datetime.week.fri'),
  t('datetime.week.sat'),
])
const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)
const open = ref(false)
const viewMonth = ref(parseDate(props.date) ?? new Date())

watch(
  () => props.date,
  (date) => {
    const parsed = parseDate(date)
    if (parsed) viewMonth.value = parsed
  },
)

const monthLabel = computed(() => {
  const y = viewMonth.value.getFullYear()
  const m = viewMonth.value.getMonth() + 1
  return t('datetime.month_label', { year: y, month: m })
})

const displayText = computed(() => {
  const parsed = parseDate(props.date)
  if (!parsed) return '-'
  const datePart = parsed.toLocaleDateString(resolveIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  if (!props.showTime) return datePart
  return `${datePart} ${pad2(props.hour)}:${pad2(props.minute)}`
})

const dayCells = computed(() => {
  const first = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  const cells = []
  const todayIso = toDateInput(new Date())
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = toDateInput(d)
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === viewMonth.value.getMonth(),
      isToday: iso === todayIso,
    })
  }
  return cells
})

function shiftMonth(delta) {
  const next = new Date(viewMonth.value)
  next.setMonth(next.getMonth() + delta, 1)
  viewMonth.value = next
}

function pickDate(nextDate) {
  emit('update:date', nextDate)
}

function pickHour(nextHour) {
  emit('update:hour', nextHour)
}

function pickMinute(nextMinute) {
  emit('update:minute', nextMinute)
}

function setNow() {
  const now = new Date()
  emit('update:date', toDateInput(now))
  emit('update:hour', now.getHours())
  emit('update:minute', now.getMinutes())
}

function toggleOpen() {
  open.value = !open.value
}

function closePanel() {
  open.value = false
}

function parseDate(dateInput) {
  if (!dateInput) return null
  const parsed = new Date(`${dateInput}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toDateInput(date) {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return `${y}-${m}-${d}`
}

function pad2(value) {
  return String(value).padStart(2, '0')
}
</script>

<style scoped>.dt-picker {
  position: relative
}
.trigger {
  display: flex;
  justify-content: space-between;
  align-items: center
}
.icon {
  opacity: 0.85
}
.panel-sheet {
  padding: 16px;
  gap: 14px;
}
.panel-sheet-body {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}
.month-head {
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
.week-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 4px
}
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px
}
.day-btn {
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: 10px;
  height: 34px;
  cursor: pointer
}
.day-btn.muted {
  color: var(--muted)
}
.day-btn.today {
  border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent)
}
.day-btn.active {
  background: linear-gradient(120deg, color-mix(in srgb, var(--primary) 70%, var(--card) 30%), var(--primary));
  color: var(--primary-contrast);
  font-weight: 700
}
.time-wrap {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--field-border);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.time-col small {
  color: var(--muted)
}
.time-list {
  margin-top: 6px;
  max-height: 132px;
  overflow: auto;
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 4px;
  display: grid;
  gap: 4px;
  background: var(--surface-popover)
}
.time-btn {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  height: 28px;
  cursor: pointer
}
.time-btn.active {
  background: color-mix(in srgb, var(--primary) 65%, var(--secondary) 35%);
  color: var(--primary-contrast);
  font-weight: 700
}
.foot {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 6px
}</style>
