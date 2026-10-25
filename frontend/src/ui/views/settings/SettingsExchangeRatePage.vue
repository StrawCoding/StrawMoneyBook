<template>
  <HabitatPageShell
    :title="t('settings_exchange_rate.title')"
    :kicker="t('settings_exchange_rate.habitat_hello')"
    test-id="settings-exchange-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >

    <article class="card panel">
      <div class="row switch-row">
        <div class="switch-text">
          <strong>{{ t('settings_exchange_rate.auto_sync') }}</strong>
          <small class="muted">{{ t('settings_exchange_rate.auto_sync_hint') }}</small>
        </div>
        <button
          type="button"
          class="btn"
          :class="{ primary: settings.autoSyncEnabled }"
          :disabled="!activeLedgerId || savingSettings"
          @click="toggleAutoSync"
        >
          {{ settings.autoSyncEnabled ? t('common.on') : t('common.off') }}
        </button>
      </div>

      <div class="detail-list">
        <div class="detail-item">
          <small class="muted">{{ t('settings_exchange_rate.latest_sync') }}</small>
          <strong>{{ syncedAtLabel }}</strong>
        </div>
        <div class="detail-item">
          <small class="muted">{{ t('settings_exchange_rate.rate_date') }}</small>
          <strong>{{ effectiveDateLabel }}</strong>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" :class="{ busy: syncing }" :disabled="!activeLedgerId" @click="syncNow">
          {{ syncing ? t('settings_exchange_rate.syncing') : t('settings_exchange_rate.sync_now') }}
        </button>
      </div>
    </article>

    <article class="card panel">
      <header class="row preview-head">
        <h3>{{ t('settings_exchange_rate.preview_title') }}</h3>
        <small class="muted">{{ t('settings_exchange_rate.preview_hint') }}</small>
      </header>

      <ul class="rate-list">
        <li v-for="item in previewRates" :key="item.code" class="rate-item">
          <span>{{ item.code }}</span>
          <strong>{{ item.valueLabel }}</strong>
        </li>
      </ul>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { currencyOptions } from '@/ui/constants/currency-options'
import {
  getExchangeRateSettings,
  getExchangeRateSnapshot,
  syncCbcExchangeRateSnapshot,
  updateExchangeRateSettings,
} from '@/ui/services/exchange-rate.service'

const { t } = useI18n()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()

const settings = reactive({
  autoSyncEnabled: false,
  provider: 'cbc',
  syncIntervalHours: 24,
})

const snapshot = reactive({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})

const savingSettings = ref(false)
const syncing = ref(false)

const activeLedgerId = computed(() => ledgerStore.activeLedgerId)

const syncedAtLabel = computed(() => {
  if (!snapshot.syncedAt) return t('settings_exchange_rate.never_synced')
  const date = new Date(snapshot.syncedAt)
  if (Number.isNaN(date.getTime())) return t('settings_exchange_rate.never_synced')
  return date.toLocaleString(resolveIntlLocale())
})

const effectiveDateLabel = computed(() => {
  if (!snapshot.effectiveDate) return t('settings_exchange_rate.no_rate_date')
  return snapshot.effectiveDate
})

const previewRates = computed(() => {
  return currencyOptions.map((item) => {
    const code = item.value
    const numeric = Number(snapshot.rates?.[code])
    const valueLabel = Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(6) : '-'
    return {
      code,
      valueLabel,
    }
  })
})

async function loadState() {
  if (!activeLedgerId.value) return
  const [nextSettings, nextSnapshot] = await Promise.all([
    getExchangeRateSettings(activeLedgerId.value),
    getExchangeRateSnapshot(activeLedgerId.value),
  ])
  Object.assign(settings, nextSettings)
  Object.assign(snapshot, nextSnapshot)
}

async function toggleAutoSync() {
  if (!activeLedgerId.value || savingSettings.value) return
  savingSettings.value = true
  try {
    const next = await updateExchangeRateSettings(activeLedgerId.value, {
      autoSyncEnabled: !settings.autoSyncEnabled,
    })
    Object.assign(settings, next)
    uiStore.pushToast(t('settings_exchange_rate.toast.settings_saved'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_exchange_rate.toast.settings_save_failed'), 'error')
  } finally {
    savingSettings.value = false
  }
}

async function syncNow() {
  if (!activeLedgerId.value || syncing.value) return
  syncing.value = true
  try {
    const nextSnapshot = await syncCbcExchangeRateSnapshot(activeLedgerId.value)
    Object.assign(snapshot, nextSnapshot)
    uiStore.pushToast(t('settings_exchange_rate.toast.sync_done', { date: nextSnapshot.effectiveDate || '-' }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_exchange_rate.toast.sync_failed'), 'error')
  } finally {
    syncing.value = false
  }
}

watch(
  () => activeLedgerId.value,
  () => {
    void loadState()
  },
  { immediate: true },
)
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.page-header {
  align-items: center;
}

.switch-row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.switch-text {
  display: grid;
  gap: 4px;
}

.detail-list {
  display: grid;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-head h3 {
  margin: 0;
}

.rate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.rate-item {
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
