<template>
  <div class="view-root habitat-page" :class="rootClass" :data-testid="testId">
    <header
      v-if="showHeader"
      class="habitat-hello-block"
      :data-testid="helloTestId || undefined"
    >
      <div class="habitat-title-row" :class="{ 'has-back': showBackControl }">
        <div v-if="showBackControl" class="habitat-back-slot">
          <RouterLink
            v-if="backTo"
            class="btn back-btn"
            :to="backTo"
            :aria-label="backLabel"
            :title="backLabel"
            data-testid="habitat-back-link"
          >
            <font-awesome-icon icon="fa-solid fa-chevron-left" />
          </RouterLink>
          <slot v-else name="back" />
        </div>
        <h1 class="habitat-page-title">{{ title }}</h1>
        <div v-if="$slots.toolbar" class="habitat-toolbar">
          <slot name="toolbar" />
        </div>
      </div>
      <p v-if="showDeckKicker" class="habitat-kicker">{{ kicker }}</p>
      <slot name="header-extra" />
    </header>
    <section
      class="stack habitat-stack"
      :class="stackClass"
      :data-testid="stackTestId || undefined"
      :data-theme-aware="stackThemeAware ? '1' : undefined"
    >
      <slot />
    </section>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiLayout } from '@/ui/composables/useUiLayout'

const props = defineProps({
  backTo: {
    type: String,
    default: '',
  },
  backLabelKey: {
    type: String,
    default: 'common.back',
  },
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
  stackTestId: {
    type: String,
    default: '',
  },
  stackThemeAware: {
    type: Boolean,
    default: false,
  },
})

const slots = useSlots()
const { t } = useI18n()
const { isModern } = useUiLayout()

const backLabel = computed(() => t(props.backLabelKey))

/** Modern: hide title-deck copy only; in-page metric lines (%, amounts) stay visible. */
const showDeckKicker = computed(() => Boolean(props.kicker) && !isModern.value)

const showBackControl = computed(() => Boolean(props.backTo || slots.back))

const showHeader = computed(() => Boolean(
  props.title || props.kicker || showBackControl.value || slots.toolbar || slots['header-extra'],
))
</script>

<style scoped>
.habitat-hello-block {
  display: grid;
  gap: 8px;
  padding: 2px 2px 4px;
}

.habitat-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 10px;
}

.habitat-title-row.has-back {
  grid-template-columns: 40px minmax(0, 1fr) auto;
}

.habitat-back-slot {
  grid-column: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.habitat-title-row.has-back .habitat-page-title {
  grid-column: 2;
}

.habitat-title-row.has-back .habitat-toolbar {
  grid-column: 3;
}

.habitat-page-title {
  margin: 0;
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.12;
  min-width: 0;
  grid-column: 1;
}

.habitat-title-row:not(.has-back) .habitat-page-title {
  grid-column: 1;
}

.habitat-title-row:not(.has-back) .habitat-toolbar {
  grid-column: 2;
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
