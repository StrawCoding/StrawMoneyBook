<template>
  <div class="ledger-switcher">
    <button
      class="switcher-btn switcher-trigger"
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
      :title="t('ledger_switcher.title')"
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
import { useI18n } from '@/ui/services/i18n.service'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()
const isOpen = ref(false)

const activeLedgerName = computed(() => {
  return ledgerStore.activeLedger?.name ?? t('ledger_switcher.placeholder')
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
    uiStore.pushToast(t('ledger_switcher.toast.switched'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('ledger_switcher.toast.failed'), 'error')
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
.ledger-switcher.home-hello-ledger {
  min-width: 0;
}
.switcher-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  width: auto;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: right;
}
.switcher-trigger:disabled {
  cursor: default;
  opacity: 0.72;
}
.switcher-btn {
  background-image: none;
  padding-right: 0;
  justify-content: flex-end;
  gap: 2px;
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
}
.home-hello-ledger .switcher-btn {
  min-width: 0;
  width: max-content;
  max-width: 100%;
}</style>
