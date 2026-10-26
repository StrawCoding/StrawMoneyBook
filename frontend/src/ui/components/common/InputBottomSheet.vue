<template>
  <teleport to="body">
    <transition name="overlay-fade" appear>
      <section
        v-if="open"
        class="app-overlay-sheet-mask"
        :class="{ 'app-overlay-sheet-mask-nested': nested }"
        data-testid="app-overlay-sheet-mask"
        @click.self="$emit('close')"
      >
        <article
          class="card sheet app-bottom-sheet app-overlay-sheet-card"
          :class="[sheetClass, sizeClass, { 'app-overlay-sheet-has-footer': showFooter || hasFooterSlot }]"
          :data-sheet-size="size"
        >
          <div v-if="showHandle" class="app-overlay-sheet-handle" aria-hidden="true" />

          <header class="row app-overlay-sheet-head">
            <h3 class="app-overlay-sheet-title">{{ title }}</h3>
            <button
              v-if="showHeaderClose"
              type="button"
              class="app-overlay-sheet-close"
              :aria-label="resolvedCloseAriaLabel"
              data-testid="app-overlay-sheet-close"
              @click="$emit('close')"
            >
              <font-awesome-icon v-if="closeVariant === 'icon'" icon="fa-solid fa-xmark" />
              <span v-else>{{ resolvedCloseText }}</span>
            </button>
          </header>

          <div ref="bodyEl" class="app-bottom-sheet-body" :class="bodyClass">
            <slot />
          </div>

          <footer
            v-if="showFooter || hasFooterSlot"
            class="app-overlay-sheet-footer row footer"
          >
            <slot name="footer" />
          </footer>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  showFooter: {
    type: Boolean,
    default: false,
  },
  closeText: {
    type: String,
    default: '',
  },
  bodyClass: {
    type: [String, Array, Object],
    default: '',
  },
  sheetClass: {
    type: [String, Array, Object],
    default: '',
  },
  /** compact | form | tall */
  size: {
    type: String,
    default: 'form',
  },
  showHandle: {
    type: Boolean,
    default: true,
  },
  /** icon | text */
  closeVariant: {
    type: String,
    default: 'icon',
  },
  /** When false and footer slot exists, header close is hidden (footer owns cancel). */
  headerClose: {
    type: Boolean,
    default: undefined,
  },
  nested: {
    type: Boolean,
    default: false,
  },
  autofocusBody: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])
const slots = useSlots()
const { t } = useI18n()
const bodyEl = ref(null)
const hasFooterSlot = computed(() => Boolean(slots.footer))
const resolvedCloseText = computed(() => props.closeText || t('common.close'))
const resolvedCloseAriaLabel = computed(() => props.closeText || t('common.close'))

const sizeClass = computed(() => {
  const size = String(props.size ?? 'form').trim() || 'form'
  return `app-overlay-sheet-size-${size}`
})

const showHeaderClose = computed(() => {
  if (props.headerClose === false) return false
  if (props.headerClose === true) return true
  if (hasFooterSlot.value || props.showFooter) return props.closeVariant === 'icon'
  return true
})

function onRequestCloseOverlay(event) {
  if (!props.open) return
  emit('close')
  event.preventDefault()
}

function focusFirstField() {
  if (!props.autofocusBody || !bodyEl.value) return
  const focusable = bodyEl.value.querySelector(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
  )
  if (focusable && typeof focusable.focus === 'function') {
    focusable.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    void nextTick(() => focusFirstField())
  },
)

onMounted(() => {
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})
</script>

<style scoped>
.footer {
  justify-content: flex-end;
  gap: 8px;
}

.app-overlay-sheet-close {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--bg-soft);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.app-overlay-sheet-close:hover {
  color: var(--text);
}

.mini-btn {
  padding: 8px 12px;
  font-size: 13px;
}
</style>
