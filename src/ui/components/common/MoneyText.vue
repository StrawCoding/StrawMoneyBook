<template>
  <span :class="toneClass">{{ text }}</span>
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
  tone: {
    type: String,
    default: '',
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

const toneClass = computed(() => {
  const tone = String(props.tone ?? '').trim()
  if (tone === 'income') return 'money-income'
  if (tone === 'expense') return 'money-expense'
  return ''
})
</script>

<style scoped>
.money-income {
  color: var(--income-dark)
}

.money-expense {
  color: var(--expense-dark)
}
</style>
