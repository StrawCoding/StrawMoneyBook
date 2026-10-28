<template>
  <HabitatPageShell
    :title="t('settings_credit_due_reminder.title')"
    :kicker="t('settings_credit_due_reminder.habitat_hello')"
    test-id="settings-credit-due-reminder-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >
    <section class="habitat-flow-section">
      <div class="row switch-row">
        <div class="switch-text">
          <strong>{{ t('settings_credit_due_reminder.enabled_label') }}</strong>
          <small class="muted">{{ t('settings_credit_due_reminder.description') }}</small>
        </div>
        <button
          type="button"
          class="btn"
          :class="{ primary: form.enabled }"
          :disabled="loading || saving"
          data-testid="credit-due-reminder-toggle"
          @click="form.enabled = !form.enabled"
        >
          {{ form.enabled ? t('common.on') : t('common.off') }}
        </button>
      </div>
      <p class="muted tip">{{ statusText }}</p>
      <button type="button" class="btn primary" :disabled="loading || saving" @click="saveSettings">
        {{ saving ? t('common.processing') : t('common.save') }}
      </button>
    </section>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, reactive, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  getCreditDueReminderSettings,
  setCreditDueReminderSettings,
  syncCreditDueRemindersForLedger,
} from '@/ui/services/credit-due-reminder.service'

const { t } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const loading = ref(false)
const saving = ref(false)
const syncStatus = ref('')

const form = reactive({ enabled: false })

const statusText = computed(() => {
  if (Capacitor.getPlatform() === 'web') {
    return t('settings_credit_due_reminder.status.web')
  }
  if (syncStatus.value === 'permission_denied') {
    return t('settings_credit_due_reminder.status.permission_denied')
  }
  if (form.enabled && syncStatus.value === 'scheduled') {
    return t('settings_credit_due_reminder.status.active')
  }
  if (!form.enabled) {
    return t('settings_credit_due_reminder.status.disabled')
  }
  return syncStatus.value || t('settings_credit_due_reminder.status.pending')
})

async function load() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  loading.value = true
  try {
    const settings = await getCreditDueReminderSettings(ledgerId)
    form.enabled = Boolean(settings.enabled)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  saving.value = true
  try {
    await setCreditDueReminderSettings(ledgerId, { enabled: form.enabled })
    const result = await syncCreditDueRemindersForLedger(ledgerId, { requestPermission: true })
    syncStatus.value = result.status
    uiStore.pushToast(t('common.saved'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    saving.value = false
  }
}

watch(() => ledgerStore.activeLedgerId, load, { immediate: true })
</script>

<style scoped>
.switch-row { align-items: center; justify-content: space-between; gap: 12px; }
.switch-text { display: grid; gap: 4px; }
.tip { font-size: 12px; margin: 12px 0; }
</style>
