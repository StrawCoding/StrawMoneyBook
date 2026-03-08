<template>
  <transition-group name="toast" tag="section" class="toast-host">
    <article v-for="toast in orderedToasts" :key="toast.id" class="toast" :class="toast.type">
      {{ toast.message }}
    </article>
  </transition-group>
</template>

<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/ui/stores/ui.store'

const uiStore = useUiStore()
const orderedToasts = computed(() => {
  const errorToasts = uiStore.toasts.filter((item) => item.type === 'error')
  const normalToasts = uiStore.toasts.filter((item) => item.type !== 'error')
  return [...errorToasts, ...normalToasts]
})
</script>

<style scoped>.toast-host {
  position: fixed;
  left: calc(max(var(--safe-area-left), calc((100vw - var(--app-max-width)) / 2)) + 14px);
  right: calc(max(var(--safe-area-right), calc((100vw - var(--app-max-width)) / 2)) + 14px);
  top: calc(10px + var(--status-bar-height));
  display: grid;
  gap: 8px;
  pointer-events: none;
  z-index: 160
}
.toast {
  justify-self: center;
  max-width: 520px;
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-popover);
  color: var(--text);
  padding: 10px 12px;
  box-shadow: var(--shadow)
}
.toast.error {
  border-color: var(--danger-btn-border);
  background: var(--danger-btn-bg);
  color: var(--danger-btn-text)
}
.toast-enter-active, .toast-leave-active {
  transition:
    opacity var(--anim-fast) ease,
    transform var(--anim-fast) ease
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateY(-14px)
}
.toast-move {
  transition: transform var(--anim-fast) ease
}</style>
