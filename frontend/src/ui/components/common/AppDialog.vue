<template>
  <InputBottomSheet
    v-if="props.presentation === 'sheet'"
    :open="open"
    :title="title"
    :body-class="'dialog-body'"
    :sheet-class="'dialog-sheet'"
    :show-footer="showFooter"
    @close="$emit('close')"
  >
    <p v-if="message" class="muted dialog-message">{{ message }}</p>
    <slot />

    <template #footer>
      <button class="btn" :disabled="loading" @click="$emit('close')">{{ cancelLabel }}</button>
      <button class="btn primary" :disabled="confirmDisabled || loading" @click="$emit('confirm')">
        {{ loading ? loadingLabel : confirmLabel }}
      </button>
    </template>
  </InputBottomSheet>

  <teleport v-else to="body">
    <transition name="overlay-fade">
      <section
        v-if="open"
        class="dialog-mask dialog-mask-popup"
        @click.self="$emit('close')"
      >
        <article class="card dialog dialog-popup">
          <header class="row dialog-head">
            <h3>{{ title }}</h3>
            <button class="btn mini-btn" @click="$emit('close')">{{ closeLabel }}</button>
          </header>

          <p v-if="message" class="muted dialog-message">{{ message }}</p>
          <div class="dialog-body">
            <slot />
          </div>

          <footer v-if="showFooter" class="row dialog-actions">
            <button class="btn" :disabled="loading" @click="$emit('close')">{{ cancelLabel }}</button>
            <button class="btn primary" :disabled="confirmDisabled || loading" @click="$emit('confirm')">
              {{ loading ? loadingLabel : confirmLabel }}
            </button>
          </footer>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
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
  message: {
    type: String,
    default: '',
  },
  cancelText: {
    type: String,
    default: '',
  },
  confirmText: {
    type: String,
    default: '',
  },
  loadingText: {
    type: String,
    default: '',
  },
  confirmDisabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  showFooter: {
    type: Boolean,
    default: true,
  },
  presentation: {
    type: String,
    default: 'dialog',
  },
})

const emit = defineEmits(['close', 'confirm'])
const { t } = useI18n()
const closeLabel = computed(() => t('common.close'))
const cancelLabel = computed(() => props.cancelText || t('common.cancel'))
const confirmLabel = computed(() => props.confirmText || t('common.confirm'))
const loadingLabel = computed(() => props.loadingText || t('common.processing'))

function onRequestCloseOverlay(event) {
  if (!props.open || props.presentation === 'sheet') return
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

<style scoped>.dialog-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
}
.dialog-mask-popup {
  z-index: 75;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 18px;
}
.dialog {
  display: grid;
  gap: 10px
}
.dialog-popup {
  width: min(480px, 100%);
  border-radius: 16px;
  padding: 14px;
}
.dialog-head h3 {
  margin: 0
}
.dialog-message {
  margin: 0;
  white-space: pre-line;
}
.dialog-body {
  display: grid;
  gap: 10px;
}
.dialog-actions {
  justify-content: flex-end;
  gap: 8px
}
.mini-btn {
  padding: 8px 12px;
  font-size: 13px
}</style>
