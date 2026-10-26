<template>
  <header class="period-chrome" :data-testid="chromeTestId">
    <div class="period-title-row">
      <button
        type="button"
        class="period-arrow"
        :data-testid="`${idPrefix}-prev`"
        :disabled="!canStep"
        :aria-label="prevLabel"
        @click="$emit('step', -1)"
      >
        ‹
      </button>
      <button
        type="button"
        class="period-title period-title-btn"
        :data-testid="`${idPrefix}-title`"
        @click="sheetOpen = true"
      >
        {{ title }}
      </button>
      <button
        type="button"
        class="period-arrow"
        :data-testid="`${idPrefix}-next`"
        :disabled="!canStep"
        :aria-label="nextLabel"
        @click="$emit('step', 1)"
      >
        ›
      </button>
    </div>
    <slot name="below" />
    <InputBottomSheet
      :open="sheetOpen"
      :title="sheetTitle"
      @close="sheetOpen = false"
    >
      <slot name="sheet" />
    </InputBottomSheet>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'

defineProps({
  chromeTestId: {
    type: String,
    required: true,
  },
  idPrefix: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  canStep: {
    type: Boolean,
    default: true,
  },
  sheetTitle: {
    type: String,
    default: '',
  },
  prevLabel: {
    type: String,
    default: '',
  },
  nextLabel: {
    type: String,
    default: '',
  },
})

defineEmits(['step'])

const sheetOpen = ref(false)

function closeSheet() {
  sheetOpen.value = false
}

defineExpose({ closeSheet })
</script>

<style scoped>
.period-chrome {
  display: grid;
  gap: 8px;
}

.period-title-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
}

.period-title {
  margin: 0;
  text-align: center;
  font-size: clamp(22px, 6vw, 28px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.period-title-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.period-title-btn:hover {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.period-arrow {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  border-radius: 999px;
  width: 40px;
  height: 40px;
  font-size: 22px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}

.period-arrow:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
