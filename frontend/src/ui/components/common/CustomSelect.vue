<template>
  <div class="custom-select" :class="{ disabled }">
    <button
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
            {{ selectedLabel || resolvedPlaceholder }}
          </span>
          <small v-if="selectedOption?.groupName && selectedLabel" class="selected-group">
            {{ selectedOption.groupName }}
          </small>
        </span>
      </span>
      <span class="arrow" :class="{ open }">▾</span>
    </button>

    <InputBottomSheet
      :open="open"
      :title="resolvedPlaceholder"
      :body-class="'menu-sheet-body'"
      :sheet-class="{ 'icon-only-menu': iconOnly, 'menu-sheet': true }"
      @close="closeMenu"
    >
      <template v-if="normalizedGroups.length">
        <div v-for="group in normalizedGroups" :key="group.id" class="group">
          <p v-if="String(group.name ?? '').trim()" class="group-label">{{ group.name }}</p>
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
    </InputBottomSheet>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n } from '@/ui/services/i18n.service'

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
    default: '',
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
const { t } = useI18n()
const resolvedPlaceholder = computed(() => props.placeholder || t('common.select'))

const normalizedOptions = computed(() => normalizeOptions(props.options))
const normalizedGroups = computed(() => {
  return (props.groups ?? [])
    .map((group, index) => {
      const groupName = group.name ?? t('common.category')
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

function closeMenu() {
  open.value = false
}

function pick(value) {
  emit('update:modelValue', value)
  closeMenu()
}
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
.menu-sheet {
  padding: 16px;
}
.menu-sheet-body {
  display: grid;
  gap: 8px;
  padding-top: 4px;
}
.group + .group {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 6px
}
.menu-sheet-body .group + .group {
  margin-top: 0;
  padding-top: 10px;
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
