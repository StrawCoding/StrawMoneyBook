<template>
  <div ref="rootRef" class="range-picker">
    <button ref="triggerRef" type="button" class="input trigger" @click="toggleOpen">
      <span>{{ displayLabel }}</span>
      <span class="icon">▾</span>
    </button>

    <teleport to="body">
      <transition name="popover-fade">
        <section v-if="open" ref="panelRef" class="panel card" :style="panelStyle" data-no-runtime-translate>
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
                :class="{ muted: !cell.inMonth, active: cell.iso === day }"
                @click="pickDay(cell.iso)"
              >
                {{ cell.day }}
              </button>
            </div>
          </div>

          <footer class="foot">
            <button type="button" class="btn" @click="pickToday">今天</button>
            <button type="button" class="btn" @click="open = false">關閉</button>
          </footer>
        </section>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
})

const emit = defineEmits(['update:year', 'update:month', 'update:day'])

const open = ref(false)
const rootRef = ref(null)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
const weekNames = ['日', '一', '二', '三', '四', '五', '六']
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
  if (props.mode === 'year') return `${props.year || now.getFullYear()} 年`
  if (props.mode === 'day') return props.day || toDayKey(now)
  return props.month || toMonthKey(now)
})

const headerLabel = computed(() => {
  if (props.mode === 'year') return `${viewYear.value} 年`
  if (props.mode === 'month') return `${viewYear.value} 年`
  return `${viewYear.value} 年 ${viewMonth.value + 1} 月`
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
  emit('update:day', iso)
  open.value = false
}

function pickToday() {
  const today = new Date()
  if (props.mode === 'year') {
    emit('update:year', today.getFullYear())
  } else if (props.mode === 'month') {
    emit('update:month', toMonthKey(today))
  } else {
    emit('update:day', toDayKey(today))
  }
  open.value = false
}

function toggleOpen() {
  open.value = !open.value
}

function monthName(month) {
  const map = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  return map[month - 1] ?? `${month}月`
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

function handleWindowClick(event) {
  if (rootRef.value?.contains(event.target)) return
  if (panelRef.value?.contains(event.target)) return
  open.value = false
}

function updatePanelPosition() {
  const trigger = triggerRef.value
  const panel = panelRef.value
  if (!trigger || !panel || typeof window === 'undefined') return
  const rect = trigger.getBoundingClientRect()
  const viewportWidth = Number(window.innerWidth || document.documentElement.clientWidth || 0)
  const viewportHeight = Number(window.innerHeight || document.documentElement.clientHeight || 0)
  const panelWidth = Math.min(Math.max(280, rect.width), Math.max(220, viewportWidth - 16))
  const maxPanelHeight = Math.max(240, viewportHeight - 16)
  const panelHeight = Math.min(panel.scrollHeight || 0, maxPanelHeight)
  const spaceAbove = Math.max(0, rect.top)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom)
  const shouldDropUp = spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - panelWidth - 8))
  const top = shouldDropUp
    ? Math.max(8, rect.top - panelHeight - 6)
    : Math.min(Math.max(8, rect.bottom + 6), Math.max(8, viewportHeight - panelHeight - 8))
  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
    maxHeight: `${maxPanelHeight}px`,
  }
}

watch(open, async (value) => {
  if (!value) {
    panelStyle.value = {}
    return
  }
  await nextTick()
  updatePanelPosition()
})

function handleWindowResizeOrScroll() {
  if (!open.value) return
  updatePanelPosition()
}

function onRequestCloseOverlay(event) {
  if (!open.value) return
  open.value = false
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  window.addEventListener('resize', handleWindowResizeOrScroll)
  window.addEventListener('scroll', handleWindowResizeOrScroll, true)
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('resize', handleWindowResizeOrScroll)
  window.removeEventListener('scroll', handleWindowResizeOrScroll, true)
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})
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
.panel {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 10px;
  background: var(--surface-popover);
  box-shadow: var(--shadow-popover-lg);
  z-index: 130;
  overflow: auto
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
