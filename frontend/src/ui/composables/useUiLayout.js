import { computed, ref } from 'vue'
import {
  applyUiLayout,
  getCurrentUiLayout,
  isModernUiLayout,
  normalizeUiLayout,
} from '@/ui/services/ui-layout.service'

const layoutRef = ref(getCurrentUiLayout())

export function useUiLayout() {
  const layout = computed({
    get: () => layoutRef.value,
    set: (value) => {
      layoutRef.value = normalizeUiLayout(value)
    },
  })

  const isModern = computed(() => isModernUiLayout(layoutRef.value))

  function previewLayout(nextLayout) {
    layoutRef.value = applyUiLayout(nextLayout)
  }

  function syncLayoutFromStorage() {
    layoutRef.value = applyUiLayout(getCurrentUiLayout())
  }

  return {
    layout,
    isModern,
    previewLayout,
    syncLayoutFromStorage,
  }
}

export function syncUiLayoutFromStorage() {
  layoutRef.value = applyUiLayout(getCurrentUiLayout())
}
