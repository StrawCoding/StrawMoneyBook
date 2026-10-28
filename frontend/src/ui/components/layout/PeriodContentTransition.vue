<template>
  <div class="period-shift-viewport" :class="$attrs.class">
    <Transition :name="transitionName">
      <div :key="contentKey" class="period-content-shift">
        <slot />
      </div>
    </Transition>
  </div>
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
.period-shift-viewport {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-width: 0;
  display: grid;
  gap: inherit;
}

.period-content-shift {
  display: grid;
  gap: inherit;
  min-width: 0;
  width: 100%;
}
</style>
