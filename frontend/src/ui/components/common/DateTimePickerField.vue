<template>
  <div ref="rootRef" class="dt-picker">
    <button ref="triggerRef" type="button" class="input trigger" @click="toggleOpen">
      <span>{{ displayText }}</span>
      <span class="icon">🗓</span>
    </button>

    <teleport to="body">
      <transition name="popover-fade">
        <section v-if="open" ref="panelRef" class="panel card" :style="panelStyle" data-no-runtime-translate>
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
              <small>時</small>
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
              <small>分</small>
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

          <footer class="foot">
            <button type="button" class="btn" @click="setNow">現在</button>
            <button type="button" class="btn" @click="open = false">完成</button>
          </footer>
        </section>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

const weekNames = ['日', '一', '二', '三', '四', '五', '六']
const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)
const open = ref(false)
const rootRef = ref(null)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
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
  return `${y}年${m}月`
})

const displayText = computed(() => {
  const parsed = parseDate(props.date)
  if (!parsed) return '-'
  const datePart = parsed.toLocaleDateString('zh-TW', {
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
  const panelWidth = Math.min(Math.max(300, rect.width), Math.max(240, viewportWidth - 16))
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - panelWidth - 8))
  const maxPanelHeight = Math.max(280, viewportHeight - 16)

  if (props.preferBottomAnchor) {
    const preferredMaxHeight = Math.min(maxPanelHeight, Math.max(280, Math.floor(viewportHeight * 0.72)))
    panelStyle.value = {
      position: 'fixed',
      bottom: '8px',
      left: `${left}px`,
      width: `${panelWidth}px`,
      maxHeight: `${preferredMaxHeight}px`,
    }
    return
  }

  const panelHeight = Math.min(panel.scrollHeight || 0, maxPanelHeight)
  const spaceAbove = Math.max(0, rect.top)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom)
  const shouldDropUp = spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow
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

watch(open, async (value) => {
  if (!value) {
    panelStyle.value = {}
    return
  }
  await nextTick()
  updatePanelPosition()
})
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
.panel {
  z-index: 130;
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 10px;
  background: var(--surface-popover);
  box-shadow: var(--shadow-popover-xl);
  overflow: auto
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
