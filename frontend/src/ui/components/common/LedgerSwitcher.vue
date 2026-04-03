<template>
  <div class="ledger-switcher">
    <button
      class="select switcher-btn"
      type="button"
      :disabled="switchableLedgers.length <= 1"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="toggleOpen"
    >
      <span>{{ activeLedgerName }}</span>
      <span class="arrow" :class="{ open: isOpen }"> ▾</span>
    </button>

    <InputBottomSheet
      :open="isOpen"
      title="選擇帳本"
      :body-class="'menu-sheet-body'"
      :sheet-class="'menu-sheet'"
      @close="isOpen = false"
    >
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
    </InputBottomSheet>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { isFreeTier } from '@/core/services/membership.service'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const isOpen = ref(false)

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
.menu-sheet-body {
  display: grid;
  gap: 8px;
  max-height: 320px;
}
.menu-item {
  width: 100%;
  border: 0;
  border-radius: 10px;
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
