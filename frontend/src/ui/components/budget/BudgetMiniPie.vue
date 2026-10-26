<template>
  <div class="pie-shell" :class="{ over }" :style="shellStyle">
    <svg class="pie-ring" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <circle
        class="pie-track"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
      />
      <circle
        v-if="usedDash > 0"
        class="pie-used"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        :stroke-dasharray="`${usedDash} ${circumference}`"
      />
    </svg>
    <div class="pie-hole">
      <strong>{{ resolvedPercentLabel }}</strong>
      <small>{{ subtitle }}</small>
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
    default: '已用',
  },
  size: {
    type: Number,
    default: 68,
  },
  strokeWidth: {
    type: Number,
    default: 8,
  },
})

const center = computed(() => Number(props.size) / 2)
const radius = computed(() => Math.max(4, center.value - Number(props.strokeWidth) / 2 - 1))
const circumference = computed(() => 2 * Math.PI * radius.value)
const safeRatio = computed(() => {
  const value = Number(props.ratio)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
})
const usedDash = computed(() => circumference.value * safeRatio.value)
const resolvedPercentLabel = computed(() => {
  const label = String(props.percentLabel ?? '').trim()
  if (label) return label
  const raw = Number(props.ratio)
  const ratio = Number.isFinite(raw) ? Math.max(0, raw) : 0
  return `${Math.round(ratio * 100)}%`
})
const shellStyle = computed(() => ({
  '--pie-size': `${Number(props.size)}px`,
}))
</script>

<style scoped>
.pie-shell {
  position: relative;
  width: var(--pie-size);
  height: var(--pie-size);
  display: grid;
  place-items: center;
}

.pie-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.pie-track,
.pie-used {
  fill: none;
  stroke-linecap: round;
}

.pie-track {
  stroke: var(--chart-budget-remain);
}

.pie-used {
  stroke: var(--chart-budget-used);
  transition: stroke-dasharray var(--anim-mid) ease;
}

.pie-shell.over .pie-used {
  stroke: var(--chart-budget-used);
}

.pie-hole {
  position: absolute;
  width: calc(var(--pie-size) * 0.72);
  height: calc(var(--pie-size) * 0.72);
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 90%, var(--bg) 10%);
  display: grid;
  place-items: center;
  transition: transform var(--anim-mid) var(--anim-spring);
  gap: 1px;
  text-align: center;
}

.pie-hole strong {
  font-size: 12px;
  line-height: 1;
  transition:
    opacity var(--anim-fast) var(--anim-standard),
    transform var(--anim-mid) var(--anim-spring);
}

.pie-hole small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1;
}
</style>
