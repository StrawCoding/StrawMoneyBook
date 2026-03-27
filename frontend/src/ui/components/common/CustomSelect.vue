<template>
  <div ref="rootRef" class="custom-select" :class="{ disabled }">
    <button
      ref="triggerRef"
      type="button"
      class="select trigger"
      :class="{ open }"
      :disabled="disabled"
      @click="toggleOpen"
    >
      <span class="value" :class="{ 'icon-only': iconOnly }">
        <font-awesome-icon v-if="selectedOption?.icon" :icon="selectedOption.icon" class="option-icon" />
        <span v-if="!iconOnly || !selectedOption?.icon" class="text-wrap">
          <span class="text" :class="{ placeholder: !selectedLabel }">
            {{ selectedLabel || placeholder }}
          </span>
          <small v-if="selectedOption?.groupName && selectedLabel" class="selected-group">
            {{ selectedOption.groupName }}
          </small>
        </span>
      </span>
      <span class="arrow" :class="{ open }">▾</span>
    </button>

    <teleport to="body">
      <transition name="popover-fade">
        <section
          v-if="open"
          ref="menuRef"
          class="menu card"
          :style="menuStyle"
          data-no-runtime-translate
          :class="{ 'icon-only-menu': iconOnly }"
        >
          <template v-if="normalizedGroups.length">
            <div v-for="group in normalizedGroups" :key="group.id" class="group">
              <p class="group-label">{{ group.name }}</p>
              <button
                v-for="option in group.options"
                :key="`${group.id}-${String(option.value)}`"
                type="button"
                class="menu-item"
                :class="{ 'icon-only-item': iconOnly, active: isActive(option.value) }"
                :disabled="option.disabled"
                @click="pick(option.value)"
              >
                <font-awesome-icon v-if="option.icon" :icon="option.icon" class="option-icon" />
                <span v-if="!iconOnly">{{ option.label }}</span>
              </button>
            </div>
          </template>

          <template v-else>
            <button
              v-for="option in normalizedOptions"
              :key="String(option.value)"
              type="button"
              class="menu-item"
              :class="{ 'icon-only-item': iconOnly, active: isActive(option.value) }"
              :disabled="option.disabled"
              @click="pick(option.value)"
            >
              <font-awesome-icon v-if="option.icon" :icon="option.icon" class="option-icon" />
              <span v-if="!iconOnly">{{ option.label }}</span>
            </button>
          </template>
        </section>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  groups: {
    type: Array,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: '請選擇',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  iconOnly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])
const open = ref(false)
const rootRef = ref(null)
const triggerRef = ref(null)
const menuRef = ref(null)
const menuStyle = ref({})

const normalizedOptions = computed(() => normalizeOptions(props.options))
const normalizedGroups = computed(() => {
  return (props.groups ?? [])
    .map((group, index) => {
      const groupName = group.name ?? '分類'
      const groupOptions = normalizeOptions(group.options ?? group.categories ?? [], groupName)
      if (!groupOptions.length) return null
      return {
        id: group.id ?? `group-${index}`,
        name: groupName,
        options: groupOptions,
      }
    })
    .filter(Boolean)
})

const selectedLabel = computed(() => {
  const flatOptions = normalizedGroups.value.length
    ? normalizedGroups.value.flatMap((group) => group.options)
    : normalizedOptions.value
  const hit = flatOptions.find((option) => isSameValue(option.value, props.modelValue))
  return hit?.label ?? ''
})
const selectedOption = computed(() => {
  const flatOptions = normalizedGroups.value.length
    ? normalizedGroups.value.flatMap((group) => group.options)
    : normalizedOptions.value
  return flatOptions.find((option) => isSameValue(option.value, props.modelValue)) ?? null
})

function normalizeOptions(options, groupName = '') {
  return (options ?? [])
    .map((item) => ({
      value: item.value ?? item.id ?? '',
      label: item.label ?? item.name ?? String(item.value ?? item.id ?? ''),
      icon: item.icon ?? '',
      groupName: String(item.groupName ?? groupName ?? '').trim(),
      disabled: Boolean(item.disabled),
    }))
    .filter((item) => item.value !== '')
}

function isSameValue(a, b) {
  return String(a) === String(b)
}

function isActive(value) {
  return isSameValue(value, props.modelValue)
}

function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
}

function pick(value) {
  emit('update:modelValue', value)
  open.value = false
}

function handleWindowClick(event) {
  if (rootRef.value?.contains(event.target)) return
  if (menuRef.value?.contains(event.target)) return
  open.value = false
}

function updateMenuPosition() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu || typeof window === 'undefined') return

  const rect = trigger.getBoundingClientRect()
  const panelWidth = Math.max(180, rect.width)
  const viewportWidth = Number(window.innerWidth || document.documentElement.clientWidth || 0)
  const viewportHeight = Number(window.innerHeight || document.documentElement.clientHeight || 0)
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - panelWidth - 8))
  const menuHeight = Math.min(menu.scrollHeight || 0, 280)
  const spaceAbove = Math.max(0, rect.top)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom)
  const shouldDropUp = spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow
  const top = shouldDropUp
    ? Math.max(8, rect.top - menuHeight - 6)
    : Math.min(Math.max(8, rect.bottom + 6), Math.max(8, viewportHeight - menuHeight - 8))

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
  }
}

function handleWindowResizeOrScroll() {
  if (!open.value) return
  updateMenuPosition()
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

watch(
  () => open.value,
  async (next) => {
    if (!next) {
      menuStyle.value = {}
      return
    }
    await nextTick()
    updateMenuPosition()
    if (menuRef.value) {
      menuRef.value.scrollTop = 0
    }
  },
)
</script>

<style scoped>.custom-select {
  position: relative;
  width: 100%
}
.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%
}
.trigger.open {
  border-color: color-mix(in srgb, var(--primary) 55%, transparent)
}
.value {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.value.icon-only {
  justify-content: center
}
.text-wrap {
  min-width: 0;
  display: grid;
  gap: 2px
}
.option-icon {
  width: 14px;
  color: var(--primary-soft)
}
.text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: left
}
.text.placeholder {
  color: var(--muted)
}
.selected-group {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
  text-align: left;
}
.arrow {
  transition: transform var(--anim-fast) ease
}
.arrow.open {
  transform: rotate(180deg)
}
.menu {
  z-index: 130;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface-popover);
  overflow: auto;
  max-height: 280px;
  box-shadow: var(--shadow-popover);
  padding: 4px
}
.group + .group {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 6px
}
.group-label {
  margin: 0;
  padding: 6px 10px 4px;
  color: var(--muted);
  font-size: 12px
}
.menu-item {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.menu-item.icon-only-item {
  justify-content: center
}
.menu-item:hover {
  background: color-mix(in srgb, var(--primary) 14%, transparent)
}
.menu-item.active {
  background: color-mix(in srgb, var(--primary) 24%, transparent);
  color: var(--primary-soft);
  font-weight: 700
}
.disabled .trigger {
  opacity: 0.65;
  cursor: not-allowed
}</style>
