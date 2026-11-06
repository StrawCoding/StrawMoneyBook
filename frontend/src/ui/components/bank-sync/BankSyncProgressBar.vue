<template>
  <div v-if="visible" class="bank-sync-progress" data-testid="bank-sync-progress-bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
    <div class="bank-sync-progress-track">
      <div class="bank-sync-progress-fill" :style="{ width: `${percent}%` }" />
    </div>
    <span class="bank-sync-progress-label">{{ t('settings_bank_sync.progress.percent', { percent }) }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  active: { type: Boolean, default: false },
  percent: { type: Number, default: 0 },
})

const { t } = useI18n()
const visible = computed(() => props.active && props.percent >= 0)
</script>

<style scoped>
.bank-sync-progress {
  display: grid;
  gap: 6px;
  width: 100%;
}

.bank-sync-progress-track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.bank-sync-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary) 85%, transparent),
    color-mix(in srgb, var(--primary-soft, var(--primary)) 90%, transparent)
  );
  transition: width 0.35s ease;
}

.bank-sync-progress-label {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
