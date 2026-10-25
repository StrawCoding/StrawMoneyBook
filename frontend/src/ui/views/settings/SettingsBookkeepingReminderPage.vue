<template>
  <HabitatPageShell
    :title="t('settings_bookkeeping_reminder.title')"
    :kicker="t('settings_bookkeeping_reminder.habitat_hello')"
    test-id="settings-reminder-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >

    <article class="card panel">
      <div class="row switch-row">
        <div class="switch-text">
          <strong>{{ t('settings_bookkeeping_reminder.enabled_label') }}</strong>
          <small class="muted">{{ t('settings_bookkeeping_reminder.description') }}</small>
        </div>
        <button
          type="button"
          class="btn"
          :class="{ primary: form.enabled }"
          :disabled="loading || saving"
          @click="form.enabled = !form.enabled"
        >
          {{ form.enabled ? t('common.on') : t('common.off') }}
        </button>
      </div>

      <label class="field-label">
        {{ t('settings_bookkeeping_reminder.time_label') }}
        <TimePickerField
          v-model="form.time"
          :disabled="loading || saving"
          :title="t('common.pick_time')"
        />
      </label>

      <div class="detail-item">
        <small class="muted">{{ t('settings_bookkeeping_reminder.status_label') }}</small>
        <strong>{{ statusText }}</strong>
      </div>

      <div v-if="showExactAlarmAction" class="row action-row exact-alarm-row">
        <button class="btn" :disabled="loading || saving || exactAlarmOpening" @click="openExactAlarmSettings">
          {{ exactAlarmOpening ? t('common.processing') : t('settings_bookkeeping_reminder.open_exact_alarm') }}
        </button>
      </div>

      <div class="row action-row">
        <button class="btn primary" :disabled="loading || saving" @click="saveReminderSettings">
          {{ saving ? t('settings_bookkeeping_reminder.saving') : t('common.save') }}
        </button>
      </div>
    </article>

    <article class="card panel">
      <div class="achievement-header">
        <strong>{{ t('settings_bookkeeping_reminder.achievement_title') }}</strong>
        <small class="muted">{{ t('settings_bookkeeping_reminder.achievement_subtitle') }}</small>
      </div>

      <div class="achievement-grid">
        <section v-for="metric in achievementMetrics" :key="metric.key" class="achievement-card">
          <small class="muted">{{ metric.label }}</small>
          <strong>{{ metric.value }}</strong>
        </section>
      </div>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, reactive, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { RouterLink } from 'vue-router'
import TimePickerField from '@/ui/components/common/TimePickerField.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  getBookkeepingAchievement,
  getBookkeepingReminderSettings,
  openBookkeepingReminderExactAlarmSettings,
  saveBookkeepingReminderSettings,
  syncBookkeepingReminderForLedger,
} from '@/ui/services/bookkeeping-reminder.service'

const { t } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const loading = ref(false)
const saving = ref(false)
const exactAlarmOpening = ref(false)
const reminderStatus = ref('disabled')
const form = reactive({
  enabled: false,
  time: '21:00',
})
const achievement = reactive({
  currentStreak: 0,
  bestStreak: 0,
  totalBookkeepingDays: 0,
  lastBookkeepingDate: '',
})
let latestReminderSyncJobId = 0

const statusText = computed(() => {
  if (reminderStatus.value === 'permission_denied') {
    return t('settings_bookkeeping_reminder.status.permission_denied')
  }
  if (reminderStatus.value === 'exact_alarm_required') {
    return t('settings_bookkeeping_reminder.status.exact_alarm_required')
  }
  if (reminderStatus.value === 'unsupported') {
    return t('settings_bookkeeping_reminder.status.unsupported')
  }
  if (!form.enabled) {
    return t('settings_bookkeeping_reminder.status.disabled')
  }
  return t('settings_bookkeeping_reminder.status.active')
})

const showExactAlarmAction = computed(() => reminderStatus.value === 'exact_alarm_required')

const achievementMetrics = computed(() => [
  {
    key: 'current-streak',
    label: t('settings_bookkeeping_reminder.achievement.current_streak'),
    value: t('settings_bookkeeping_reminder.days_value', { count: achievement.currentStreak }),
  },
  {
    key: 'best-streak',
    label: t('settings_bookkeeping_reminder.achievement.best_streak'),
    value: t('settings_bookkeeping_reminder.days_value', { count: achievement.bestStreak }),
  },
  {
    key: 'total-days',
    label: t('settings_bookkeeping_reminder.achievement.total_days'),
    value: t('settings_bookkeeping_reminder.days_value', { count: achievement.totalBookkeepingDays }),
  },
  {
    key: 'latest-date',
    label: t('settings_bookkeeping_reminder.achievement.last_bookkeeping_date'),
    value: achievement.lastBookkeepingDate || '-',
  },
])

watch(
  () => ledgerStore.activeLedgerId,
  (ledgerId) => {
    void loadReminderPage(ledgerId)
  },
  { immediate: true },
)

async function loadReminderPage(ledgerId) {
  if (!String(ledgerId ?? '').trim()) return
  latestReminderSyncJobId += 1
  loading.value = true
  try {
    const [settings, stats] = await Promise.all([
      getBookkeepingReminderSettings(ledgerId),
      getBookkeepingAchievement(ledgerId),
    ])
    form.enabled = settings.enabled
    form.time = `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`
    achievement.currentStreak = stats.currentStreak
    achievement.bestStreak = stats.bestStreak
    achievement.totalBookkeepingDays = stats.totalBookkeepingDays
    achievement.lastBookkeepingDate = stats.lastBookkeepingDate
    if (Capacitor.getPlatform() === 'web') {
      reminderStatus.value = settings.enabled ? 'unsupported' : 'disabled'
      return
    }

    const result = await syncBookkeepingReminderForLedger(ledgerId, { requestPermission: false })
    reminderStatus.value = result?.status ?? (settings.enabled ? 'active' : 'disabled')
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

async function syncReminderInBackground(ledgerId, savedSettings) {
  const jobId = ++latestReminderSyncJobId
  const normalizedLedgerId = String(ledgerId ?? '').trim()

  try {
    const result = await syncBookkeepingReminderForLedger(normalizedLedgerId, {
      requestPermission: savedSettings?.enabled === true,
    })
    if (jobId !== latestReminderSyncJobId) return
    if (String(ledgerStore.activeLedgerId ?? '').trim() !== normalizedLedgerId) return

    reminderStatus.value = result?.status ?? (savedSettings?.enabled ? 'active' : 'disabled')

    if (reminderStatus.value === 'permission_denied') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.permission_denied'), 'error')
    } else if (reminderStatus.value === 'exact_alarm_required') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.exact_alarm_required'), 'error')
    } else if (reminderStatus.value === 'unsupported') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.unsupported'), 'error')
    }
  } catch (error) {
    if (jobId !== latestReminderSyncJobId) return
    if (String(ledgerStore.activeLedgerId ?? '').trim() !== normalizedLedgerId) return
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.save_failed'), 'error')
  }
}

async function saveReminderSettings() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    uiStore.pushToast(t('settings_bookkeeping_reminder.toast.missing_ledger'), 'error')
    return
  }

  const matched = String(form.time ?? '').match(/^(\d{2}):(\d{2})$/)
  if (!matched) {
    uiStore.pushToast(t('settings_bookkeeping_reminder.toast.invalid_time'), 'error')
    return
  }

  saving.value = true
  try {
    const saved = await saveBookkeepingReminderSettings(ledgerId, {
      enabled: form.enabled,
      hour: Number(matched[1]),
      minute: Number(matched[2]),
    })
    form.enabled = saved.enabled
    form.time = `${String(saved.hour).padStart(2, '0')}:${String(saved.minute).padStart(2, '0')}`
    reminderStatus.value = saved.enabled && Capacitor.getPlatform() === 'web'
      ? 'unsupported'
      : saved.enabled
        ? 'active'
        : 'disabled'
    uiStore.pushToast(t('settings_bookkeeping_reminder.toast.saved'))
    void syncReminderInBackground(ledgerId, saved)
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.save_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function openExactAlarmSettings() {
  exactAlarmOpening.value = true
  try {
    const result = await openBookkeepingReminderExactAlarmSettings()
    if (result?.status === 'granted') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.exact_alarm_updated'))
    }
    await loadReminderPage(String(ledgerStore.activeLedgerId ?? '').trim())
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.exact_alarm_failed'), 'error')
  } finally {
    exactAlarmOpening.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 12px;
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

.field-label {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.action-row {
  justify-content: flex-end;
}

.achievement-header {
  display: grid;
  gap: 4px;
}

.achievement-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.achievement-card {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 6px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-popover) 12%);
}

.achievement-card strong {
  font-size: 20px;
}
</style>
