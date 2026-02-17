<template>
  <span>{{ text }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  valueMinor: {
    type: [Number, String],
    default: null,
  },
  currency: {
    type: String,
    default: 'TWD',
  },
})

const text = computed(() => {
  if (props.valueMinor === null || props.valueMinor === undefined || props.valueMinor === '') {
    return ''
  }

  const minor = Number(props.valueMinor)
  if (!Number.isFinite(minor)) return ''

  const major = minor / 100
  const hasFraction = Math.abs(minor) % 100 !== 0
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: props.currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(major)
})
</script>
