<template>
  <div class="view-root habitat-page" :class="rootClass" :data-testid="testId">
    <header
      v-if="showHeader"
      class="habitat-hello-block"
      :data-testid="helloTestId || undefined"
    >
      <div class="habitat-title-row">
        <h1 class="habitat-page-title">{{ title }}</h1>
        <div v-if="$slots.toolbar" class="habitat-toolbar">
          <slot name="toolbar" />
        </div>
      </div>
      <p v-if="kicker" class="habitat-kicker">{{ kicker }}</p>
      <slot name="header-extra" />
    </header>
    <section class="stack habitat-stack" :class="stackClass">
      <slot />
    </section>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  kicker: {
    type: String,
    default: '',
  },
  testId: {
    type: String,
    default: '',
  },
  helloTestId: {
    type: String,
    default: '',
  },
  rootClass: {
    type: String,
    default: '',
  },
  stackClass: {
    type: String,
    default: '',
  },
})

const slots = useSlots()

const showHeader = computed(() => Boolean(
  props.title || props.kicker || slots.toolbar || slots['header-extra'],
))
</script>

<style scoped>
.habitat-hello-block {
  display: grid;
  gap: 8px;
  padding: 2px 2px 4px;
}

.habitat-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.habitat-page-title {
  margin: 0;
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.12;
  flex: 1 1 auto;
  min-width: 0;
}

.habitat-kicker {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}

.habitat-toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.habitat-stack {
  min-width: 0;
}
</style>
