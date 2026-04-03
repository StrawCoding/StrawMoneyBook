<template>
  <teleport to="body">
    <transition name="overlay-fade">
      <section
        v-if="open"
        class="app-overlay-sheet-mask"
        @click.self="$emit('close')"
      >
        <article
          class="card sheet app-bottom-sheet app-overlay-sheet-card"
          :class="sheetClass"
        >
          <header class="row app-overlay-sheet-head">
            <h3 class="app-overlay-sheet-title">{{ title }}</h3>
            <button type="button" class="btn mini-btn" @click="$emit('close')">{{ closeText }}</button>
          </header>

          <div class="app-bottom-sheet-body" :class="bodyClass">
            <slot />
          </div>

          <footer v-if="showFooter || hasFooterSlot" class="row footer">
            <slot name="footer" />
          </footer>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, useSlots } from 'vue'

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
    default: '關閉',
  },
  bodyClass: {
    type: [String, Array, Object],
    default: '',
  },
  sheetClass: {
    type: [String, Array, Object],
    default: '',
  },
})

const emit = defineEmits(['close'])
const slots = useSlots()
const hasFooterSlot = computed(() => Boolean(slots.footer))

function onRequestCloseOverlay(event) {
  if (!props.open) return
  emit('close')
  event.preventDefault()
}

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
  padding-top: 4px;
}

.mini-btn {
  padding: 8px 12px;
  font-size: 13px;
}
</style>
