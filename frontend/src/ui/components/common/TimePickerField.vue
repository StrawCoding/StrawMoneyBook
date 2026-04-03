<template>
  <div class="time-picker">
    <button
      type="button"
      class="input trigger"
      :disabled="disabled"
      @click="toggleOpen"
    >
      <span>{{ displayText }}</span>
      <span class="icon">🕒</span>
    </button>

    <InputBottomSheet
      :open="open"
      :title="title"
      :body-class="'panel-sheet-body'"
      :sheet-class="'panel-sheet'"
      :show-footer="true"
      @close="closePanel"
    >
      <div class="time-wrap">
        <div class="time-col">
          <small>時</small>
          <div class="time-list">
            <button
              v-for="h in hours"
              :key="`h-${h}`"
              type="button"
              class="time-btn"
              :class="{ active: h === draftHour }"
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
              :class="{ active: m === draftMinute }"
              @click="pickMinute(m)"
            >
              {{ pad2(m) }}
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn" @click="resetToCurrentValue">重設</button>
        <button type="button" class="btn primary" @click="applySelection">完成</button>
      </template>
    </InputBottomSheet>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
const DEFAULT_HOUR = 21
const DEFAULT_MINUTE = 0

const props = defineProps({
  modelValue: {
    type: String,
    default: '21:00',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '選擇時間',
  },
})

const emit = defineEmits(['update:modelValue'])

const hours = Array.from({ length: 24 }, (_, index) => index)
const minutes = Array.from({ length: 60 }, (_, index) => index)
const open = ref(false)
const draftHour = ref(DEFAULT_HOUR)
const draftMinute = ref(DEFAULT_MINUTE)

const displayText = computed(() => `${pad2(draftHour.value)}:${pad2(draftMinute.value)}`)

watch(
  () => props.modelValue,
  () => {
    syncDraftFromValue(props.modelValue)
  },
  { immediate: true },
)

function parseTime(value) {
  const matched = String(value ?? '').match(/^(\d{2}):(\d{2})$/)
  if (!matched) {
    return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE }
  }

  const hour = normalizeHour(matched[1])
  const minute = normalizeMinute(matched[2])
  return { hour, minute }
}

function normalizeHour(value) {
  const hour = Math.trunc(Number(value))
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return DEFAULT_HOUR
  return hour
}

function normalizeMinute(value) {
  const minute = Math.trunc(Number(value))
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return DEFAULT_MINUTE
  return minute
}

function syncDraftFromValue(value) {
  const next = parseTime(value)
  draftHour.value = next.hour
  draftMinute.value = next.minute
}

function toggleOpen() {
  if (props.disabled) return
  if (!open.value) {
    syncDraftFromValue(props.modelValue)
  }
  open.value = !open.value
}

function closePanel() {
  open.value = false
}

function pickHour(hour) {
  draftHour.value = hour
}

function pickMinute(minute) {
  draftMinute.value = minute
}

function resetToCurrentValue() {
  syncDraftFromValue(props.modelValue)
}

function applySelection() {
  emit('update:modelValue', `${pad2(draftHour.value)}:${pad2(draftMinute.value)}`)
  closePanel()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}
</script>

<style scoped>
.time-picker {
  position: relative;
}

.trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.icon {
  opacity: 0.85;
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

.time-wrap {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.time-col small {
  color: var(--muted);
}

.time-list {
  margin-top: 6px;
  max-height: 216px;
  overflow: auto;
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 4px;
  display: grid;
  gap: 4px;
  background: var(--surface-popover);
}

.time-btn {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  height: 28px;
  cursor: pointer;
}

.time-btn.active {
  background: color-mix(in srgb, var(--primary) 65%, var(--secondary) 35%);
  color: var(--primary-contrast);
  font-weight: 700;
}

.foot {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
