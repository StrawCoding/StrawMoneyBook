<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-book" class="title-icon" />{{ t('settings_ledger_detail.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings/ledgers">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="ledger" class="card panel">
      <header class="row">
        <h3>{{ ledger.name }}</h3>
        <button class="btn primary" :disabled="!canSave || saving" @click="saveLedgerName">
          {{ saving ? t('settings_ledger_detail.saving') : t('settings_ledger_detail.save_changes') }}
        </button>
      </header>

      <label class="field">
        {{ t('settings_ledger_detail.ledger_name') }}
        <input v-model="ledgerNameInput" class="input" type="text" maxlength="40" :placeholder="t('settings_ledger_detail.ledger_name_placeholder')" />
      </label>

      <div class="row action-row">
        <button class="btn danger" :disabled="deleting" @click="removeLedgerRecord">
          {{ deleting ? t('settings_ledger_detail.processing') : t('settings_ledger_detail.delete_ledger') }}
        </button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">{{ t('settings_ledger_detail.not_found') }}</p>
    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      :title="t('settings_ledger_detail.delete_ledger')"
      :message="t('settings_ledger_detail.confirm_delete')"
      confirm-text="確認"
      :loading="deleting"
      :loading-text="t('settings_ledger_detail.processing')"
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveLedgerRecord"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)
const ledgerNameInput = ref('')

const ledgerId = computed(() => String(route.params.id ?? ''))
const ledger = computed(() => ledgerStore.ledgers.find((item) => item.id === ledgerId.value) ?? null)

const canSave = computed(() => {
  if (!ledger.value) return false
  const nextName = ledgerNameInput.value.trim()
  if (!nextName) return false
  return nextName !== String(ledger.value.name ?? '')
})

watch(
  () => ledger.value,
  (next) => {
    if (!next) return
    ledgerNameInput.value = String(next.name ?? '')
  },
  { immediate: true },
)

async function saveLedgerName() {
  if (!ledger.value || !canSave.value) return

  saving.value = true
  try {
    const nextName = ledgerNameInput.value.trim()
    if (nextName !== String(ledger.value.name ?? '')) {
      await ledgerStore.renameLedger(ledgerId.value, nextName)
    }
    uiStore.pushToast(t('settings_ledger_detail.toast.updated'))
    await router.push('/settings/ledgers')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_ledger_detail.toast.update_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeLedgerRecord() {
  if (!ledger.value) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemoveLedgerRecord() {
  if (!ledger.value) return
  deleting.value = true
  try {
    await ledgerStore.removeLedger(ledgerId.value)
    uiStore.pushToast(t('settings_ledger_detail.toast.deleted'))
    deleteConfirmOpen.value = false
    await router.push('/settings/ledgers')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_ledger_detail.toast.delete_failed'), 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  if (!ledgerStore.ledgers.length) {
    await ledgerStore.refresh()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

h3 {
  margin: 0;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.page-header {
  align-items: center;
}

.field {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.action-row {
  margin-top: 12px;
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}
</style>
