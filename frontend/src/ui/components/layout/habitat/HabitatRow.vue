<template>
  <component
    :is="tag"
    class="habitat-row"
    :class="rowClass"
    :to="to"
    :href="href"
    :target="target"
    :rel="rel"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? disabled : undefined"
    :data-testid="testId || undefined"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  as: {
    type: String,
    default: 'div',
  },
  to: {
    type: String,
    default: '',
  },
  href: {
    type: String,
    default: '',
  },
  target: {
    type: String,
    default: '',
  },
  rel: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  testId: {
    type: String,
    default: '',
  },
  interactive: {
    type: Boolean,
    default: false,
  },
})

const tag = computed(() => {
  if (props.to) return RouterLink
  if (props.href) return 'a'
  if (props.as === 'button') return 'button'
  return props.as
})

const rowClass = computed(() => ({
  'habitat-row-interactive': Boolean(props.to || props.href || props.interactive),
}))
</script>
