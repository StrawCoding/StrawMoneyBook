import { computed, ref } from 'vue'
import {
  applyUiLayout,
  getCurrentUiLayout,
  isModernUiLayout,
  saveUiLayout,
} from '@/ui/services/ui-layout.service'

const layoutRef = ref(getCurrentUiLayout())

export function useUiLayout() {
  const layout = computed(() => layoutRef.value)
  const isModern = computed(() => isModernUiLayout(layoutRef.value))

  function syncLayoutFromStorage() {
    layoutRef.value = applyUiLayout(getCurrentUiLayout())
  }

  function setLayout(layoutId) {
    layoutRef.value = saveUiLayout(layoutId)
    return layoutRef.value
  }

  return {
    layout,
    isModern,
    syncLayoutFromStorage,
    setLayout,
  }
}

export function syncUiLayoutFromStorage() {
  layoutRef.value = applyUiLayout(getCurrentUiLayout())
}
