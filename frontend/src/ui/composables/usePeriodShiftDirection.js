import { computed, ref } from 'vue'

/** @returns {-1 | 0 | 1} */
export function normalizePeriodShiftDirection(value) {
  const step = Number(value)
  if (!Number.isFinite(step) || step === 0) return 0
  return step < 0 ? -1 : 1
}

export function usePeriodShiftDirection() {
  const periodShiftDirection = ref(0)

  const periodShiftTransition = computed(() => {
    if (periodShiftDirection.value > 0) return 'period-shift-forward'
    if (periodShiftDirection.value < 0) return 'period-shift-back'
    return 'period-shift-fade'
  })

  function markPeriodShift(delta) {
    periodShiftDirection.value = normalizePeriodShiftDirection(delta)
  }

  function markPeriodShiftNeutral() {
    periodShiftDirection.value = 0
  }

  return {
    periodShiftDirection,
    periodShiftTransition,
    markPeriodShift,
    markPeriodShiftNeutral,
  }
}
