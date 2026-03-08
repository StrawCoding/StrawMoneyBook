<template>
  <div ref="rootRef" class="ledger-switcher">
    <button
      ref="triggerRef"
      class="select switcher-btn"
      type="button"
      :disabled="switchableLedgers.length <= 1"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="toggleOpen"
    >
      <span>{{ activeLedgerName }}</span>
      <span class="arrow" :class="{ open: isOpen }"> ▾</span>
    </button>

    <teleport to="body">
      <transition name="popover-fade">
        <div v-if="isOpen" ref="menuRef" class="menu card" :style="menuStyle" data-no-runtime-translate>
          <button
            v-for="ledger in switchableLedgers"
            :key="ledger.id"
            class="menu-item"
            :class="{ active: ledger.id === ledgerStore.activeLedgerId }"
            type="button"
            @click="onChange(ledger.id)"
          >
            {{ ledger.name }}
          </button>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { isFreeTier } from '@/core/services/membership.service'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const isOpen = ref(false)
const rootRef = ref(null)
const triggerRef = ref(null)
const menuRef = ref(null)
const menuStyle = ref({})

const activeLedgerName = computed(() => {
  return ledgerStore.activeLedger?.name ?? '請選擇帳本'
})
const switchableLedgers = computed(() => {
  const ledgers = ledgerStore.ledgers
  if (!isFreeTier()) return ledgers
  if (!ledgers.length) return []
  const active = ledgers.find((ledger) => ledger.id === ledgerStore.activeLedgerId)
  return active ? [active] : ledgers.slice(0, 1)
})

function toggleOpen() {
  if (switchableLedgers.value.length <= 1) return
  isOpen.value = !isOpen.value
}

async function onChange(nextLedgerId) {
  isOpen.value = false
  if (!nextLedgerId || nextLedgerId === ledgerStore.activeLedgerId) return
  try {
    await ledgerStore.switchLedger(nextLedgerId)
    uiStore.pushToast('已切換帳本')
  } catch (error) {
    uiStore.pushToast(error.message ?? '切換帳本失敗', 'error')
  }
}

function onWindowClick(event) {
  if (rootRef.value?.contains(event.target)) return
  if (menuRef.value?.contains(event.target)) return
  isOpen.value = false
}

function updateMenuPosition() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu || typeof window === 'undefined') return

  const rect = trigger.getBoundingClientRect()
  const panelWidth = Math.max(160, rect.width)
  const viewportWidth = Number(window.innerWidth || document.documentElement.clientWidth || 0)
  const viewportHeight = Number(window.innerHeight || document.documentElement.clientHeight || 0)
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - panelWidth - 8))
  const menuHeight = Math.min(menu.scrollHeight || 0, 320)
  const spaceAbove = Math.max(0, rect.top)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom)
  const shouldDropUp = spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow
  const top = shouldDropUp
    ? Math.max(8, rect.top - menuHeight - 6)
    : Math.min(Math.max(8, rect.bottom + 6), Math.max(8, viewportHeight - menuHeight - 8))

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
  }
}

function onWindowResizeOrScroll() {
  if (!isOpen.value) return
  updateMenuPosition()
}

function onRequestCloseOverlay(event) {
  if (!isOpen.value) return
  isOpen.value = false
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('click', onWindowClick)
  window.addEventListener('resize', onWindowResizeOrScroll)
  window.addEventListener('scroll', onWindowResizeOrScroll, true)
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
  window.removeEventListener('resize', onWindowResizeOrScroll)
  window.removeEventListener('scroll', onWindowResizeOrScroll, true)
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

watch(
  () => isOpen.value,
  async (next) => {
    if (!next) {
      menuStyle.value = {}
      return
    }
    await nextTick()
    updateMenuPosition()
  },
)

watch(
  () => switchableLedgers.value.length,
  (count) => {
    if (count <= 1) {
      isOpen.value = false
    }
  },
)
</script>

<style scoped>.ledger-switcher {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 160px
}
.switcher-btn {
  background-image: none;
  padding-right: 12px;
  justify-content: space-between;
  gap: 10px
}
.menu {
  z-index: 130;
  border-radius: 12px;
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  overflow: auto;
  max-height: 320px;
  box-shadow: var(--shadow-popover)
}
.menu-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}
.menu-item:hover {
  background: color-mix(in srgb, var(--primary) 16%, transparent)
}
.menu-item.active {
  background: color-mix(in srgb, var(--primary) 24%, transparent);
  color: var(--primary-soft);
  font-weight: 700;
}
.arrow {
  transition: transform 120ms ease
}
.arrow.open {
  transform: rotate(180deg)
}
.switcher-btn {
  min-width: 160px
}</style>
