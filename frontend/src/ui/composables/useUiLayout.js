import { computed, ref } from 'vue'
import {
  applyUiLayout,
  getCurrentUiLayout,
  isModernUiLayout,
} from '@/ui/services/ui-layout.service'

const layoutRef = ref(getCurrentUiLayout())

export function useUiLayout() {
  const layout = computed(() => layoutRef.value)

  /** Always true: App is modern-only (Apple HIG). */
  const isModern = computed(() => isModernUiLayout(layoutRef.value))

  function syncLayoutFromStorage() {
    layoutRef.value = applyUiLayout(getCurrentUiLayout())
  }

  return {
    layout,
    isModern,
    syncLayoutFromStorage,
  }
}

export function syncUiLayoutFromStorage() {
  layoutRef.value = applyUiLayout(getCurrentUiLayout())
}
