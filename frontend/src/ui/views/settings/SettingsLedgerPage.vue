<template>
  <div class="view-root">
    <section class="stack">
      <header class="row page-head">
        <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-book" class="title-icon" />{{ t('settings_ledger_page.title') }}</h2>
        <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
      </header>

      <article class="card panel">
        <header class="row panel-head">
          <h3>{{ t('settings_ledger_page.title') }}</h3>
          <button class="btn primary" @click="createLedger">{{ t('settings_ledger_page.add_ledger') }}</button>
        </header>
        <small v-if="showFreeLimitHint" class="muted limit-tip">{{ t('settings_ledger_page.limit_hint') }}</small>

        <draggable
          v-model="ledgerItems"
          item-key="id"
          handle=".drag-handle"
          ghost-class="drag-ghost"
          :force-fallback="true"
          :delay-on-touch-only="true"
          :delay="120"
          class="ledger-list"
          @end="onLedgerSortEnd"
        >
          <template #item="{ element: ledger }">
            <li class="drag-item">
              <div class="ledger-row">
                <RouterLink
                  class="ledger-main"
                  :to="{ name: 'settings-ledger-detail', params: { id: ledger.id } }"
                >
                  <span>{{ ledger.name }}</span>
                </RouterLink>
                <font-awesome-icon icon="fa-solid fa-bars" class="drag-handle" :aria-label="t('settings_ledger_page.drag_sort')" />
              </div>
            </li>
          </template>
        </draggable>
      </article>
    </section>

    <AppDialog
      :open="dialogMode === 'create'"
      presentation="sheet"
      :title="t('settings_ledger_page.dialog_title')"
      :confirm-disabled="!ledgerNameInput.trim()"
      :confirm-text="t('common.save')"
      @close="closeDialog"
      @confirm="submitDialog"
    >
      <label class="field">
        {{ t('settings_ledger_page.name') }}
        <input v-model="ledgerNameInput" class="input" type="text" maxlength="40" :placeholder="t('settings_ledger_page.name_placeholder')" />
      </label>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import draggable from 'vuedraggable'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getMembershipLimits } from '@/core/services/membership.service'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()
const dialogMode = ref('')
const ledgerNameInput = ref('')
const ledgerItems = ref([])
const canCreateLedger = computed(() => ledgerStore.ledgers.length < getMembershipLimits().maxLedgers)
const showFreeLimitHint = computed(() => Number.isFinite(getMembershipLimits().maxLedgers))

watch(
  () => ledgerStore.ledgers,
  (items) => {
    const membershipLimits = getMembershipLimits()
    if (Number.isFinite(membershipLimits.maxLedgers)) {
      ledgerItems.value = items.slice(0, membershipLimits.maxLedgers)
      return
    }
    ledgerItems.value = items.slice()
  },
  { immediate: true },
)

async function createLedger() {
  if (!canCreateLedger.value) {
    uiStore.pushToast(t('settings_ledger_page.toast.limit_reached'), 'error')
    return
  }
  dialogMode.value = 'create'
  ledgerNameInput.value = ''
}

async function onLedgerSortEnd() {
  const ids = ledgerItems.value.map((item) => item.id)
  await ledgerStore.reorderLedgers(ids)
}

function closeDialog() {
  dialogMode.value = ''
  ledgerNameInput.value = ''
}

async function submitDialog() {
  const nextName = ledgerNameInput.value.trim()
  if (!nextName) return

  try {
    await ledgerStore.addLedger({
      name: nextName,
      currencyCode: 'TWD',
      timezone: 'Asia/Taipei',
    })
    uiStore.pushToast(t('settings_ledger_page.toast.created'))
    closeDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_ledger_page.toast.save_failed'), 'error')
  }
}

</script>

<style scoped>
.panel {
  padding: 14px
}
h2,
h3 {
  margin: 0;
  font-size: 18px
}
.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}
.panel-head {
  align-items: flex-start;
  gap: 10px;
}
.limit-tip {
  display: block;
  margin-top: 6px;
  font-size: 12px;
}
.ledger-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.drag-item {
  list-style: none;
}

.ledger-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}
.ledger-main {
  display: inline-flex;
  align-items: center;
  flex: 1;
  color: var(--text);
  text-decoration: none;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
}
.drag-handle {
  cursor: grab;
  color: var(--muted);
  font-size: 16px;
  padding: 4px;
  flex-shrink: 0;
}
.drag-ghost {
  opacity: 0.55;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
