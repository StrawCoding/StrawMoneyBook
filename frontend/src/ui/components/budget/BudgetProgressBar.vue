<template>
  <div
    class="budget-progress"
    :class="{ over, compact }"
    role="progressbar"
    :aria-valuenow="ariaPercent"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="resolvedAriaLabel"
  >
    <div v-if="showMeta" class="progress-meta">
      <span v-if="subtitle" class="progress-subtitle muted">{{ subtitle }}</span>
      <span class="progress-percent" :class="{ over }">{{ resolvedPercentLabel }}</span>
    </div>
    <div class="progress-track">
      <span class="progress-fill" :style="{ width: `${fillPercent}%` }" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ratio: {
    type: Number,
    default: 0,
  },
  over: {
    type: Boolean,
    default: false,
  },
  percentLabel: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
  showMeta: {
    type: Boolean,
    default: true,
  },
})

const rawRatio = computed(() => {
  const value = Number(props.ratio)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
})

const fillPercent = computed(() => Math.min(100, rawRatio.value * 100))

const ariaPercent = computed(() => Math.min(100, Math.round(rawRatio.value * 100)))

const resolvedPercentLabel = computed(() => {
  const label = String(props.percentLabel ?? '').trim()
  if (label) return label
  return `${Math.round(rawRatio.value * 100)}%`
})

const resolvedAriaLabel = computed(() => {
  const label = String(props.ariaLabel ?? '').trim()
  if (label) return label
  return resolvedPercentLabel.value
})
</script>

<style scoped>
.budget-progress {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.budget-progress.compact {
  gap: 4px;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.progress-subtitle {
  font-size: 11px;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-percent {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--chart-budget-used, var(--expense-dark));
  font-variant-numeric: tabular-nums;
}

.progress-percent.over {
  color: var(--danger, #d14343);
}

.progress-track {
  position: relative;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--chart-budget-remain, var(--income-dark)) 18%, var(--chart-track, var(--bg-soft)) 82%);
}

.budget-progress.compact .progress-track {
  height: 6px;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--chart-budget-used, var(--expense-dark)) 88%, #fff 12%),
    var(--chart-budget-used, var(--expense-dark))
  );
  transition: width var(--anim-mid) var(--anim-standard);
  min-width: 0;
}

.budget-progress.over .progress-fill {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--danger, #d14343) 82%, #fff 18%),
    var(--danger, #d14343)
  );
}

.budget-progress.over .progress-track {
  background: color-mix(in srgb, var(--danger, #d14343) 16%, var(--chart-track, var(--bg-soft)) 84%);
}
</style>
