<template>
  <teleport to="body">
    <transition name="overlay-fade">
      <section v-if="open" class="sheet-mask dialog-mask" @click.self="$emit('close')">
        <article class="card dialog">
          <header class="row dialog-head">
            <h3>{{ title }}</h3>
            <button class="btn mini-btn" @click="$emit('close')">關閉</button>
          </header>

          <p v-if="message" class="muted dialog-message">{{ message }}</p>
          <div class="dialog-body">
            <slot />
          </div>

          <footer v-if="showFooter" class="row dialog-actions">
            <button class="btn" :disabled="loading" @click="$emit('close')">{{ cancelText }}</button>
            <button class="btn primary" :disabled="confirmDisabled || loading" @click="$emit('confirm')">
              {{ loading ? loadingText : confirmText }}
            </button>
          </footer>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

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
    default: '取消',
  },
  confirmText: {
    type: String,
    default: '確認',
  },
  loadingText: {
    type: String,
    default: '處理中...',
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
})

const emit = defineEmits(['close', 'confirm'])

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

<style scoped>.dialog-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: grid;
  place-items: center;
  z-index: 75;
  padding: 18px
}
.dialog {
  width: min(480px, 100%);
  border-radius: 16px;
  padding: 14px;
  display: grid;
  gap: 10px
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
  gap: 10px
}
.dialog-actions {
  justify-content: flex-end;
  gap: 8px
}
.mini-btn {
  padding: 8px 12px;
  font-size: 13px
}</style>
