<template>
  <Transition :name="transitionName" mode="out-in">
    <div :key="contentKey" class="period-content-shift" :class="$attrs.class">
      <slot />
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { normalizePeriodShiftDirection } from '@/ui/composables/usePeriodShiftDirection.js'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  contentKey: {
    type: String,
    required: true,
  },
  direction: {
    type: Number,
    default: 0,
  },
})

const transitionName = computed(() => {
  const normalized = normalizePeriodShiftDirection(props.direction)
  if (normalized > 0) return 'period-shift-forward'
  if (normalized < 0) return 'period-shift-back'
  return 'period-shift-fade'
})
</script>

<style scoped>
.period-content-shift {
  display: grid;
  gap: inherit;
  min-width: 0;
}
</style>
