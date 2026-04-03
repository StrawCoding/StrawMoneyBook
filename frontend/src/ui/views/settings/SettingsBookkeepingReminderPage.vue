<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('settings_bookkeeping_reminder.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

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
          title="選擇提醒時間"
        />
      </label>

      <div class="detail-item">
        <small class="muted">{{ t('settings_bookkeeping_reminder.status_label') }}</small>
        <strong>{{ statusText }}</strong>
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
  </section>
</template>

<script setup>
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
  saveBookkeepingReminderSettings,
  syncBookkeepingReminderForLedger,
} from '@/ui/services/bookkeeping-reminder.service'

const { t } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const loading = ref(false)
const saving = ref(false)
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

const statusText = computed(() => {
  if (reminderStatus.value === 'permission_denied') {
    return t('settings_bookkeeping_reminder.status.permission_denied')
  }
  if (reminderStatus.value === 'unsupported') {
    return t('settings_bookkeeping_reminder.status.unsupported')
  }
  if (!form.enabled) {
    return t('settings_bookkeeping_reminder.status.disabled')
  }
  return t('settings_bookkeeping_reminder.status.active')
})

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
    reminderStatus.value = settings.enabled && Capacitor.getPlatform() === 'web' ? 'unsupported' : settings.enabled ? 'active' : 'disabled'
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.load_failed'), 'error')
  } finally {
    loading.value = false
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

    const currentLedgerResult = await syncBookkeepingReminderForLedger(ledgerId, {
      requestPermission: saved.enabled,
    })
    reminderStatus.value = currentLedgerResult?.status ?? (saved.enabled ? 'active' : 'disabled')

    if (reminderStatus.value === 'permission_denied') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.permission_denied'), 'error')
    } else if (reminderStatus.value === 'unsupported') {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.unsupported'), 'error')
    } else {
      uiStore.pushToast(t('settings_bookkeeping_reminder.toast.saved'))
    }

    window.dispatchEvent(new CustomEvent('app:bookkeeping-reminder-config-updated', {
      detail: { ledgerId },
    }))
  } catch (error) {
    uiStore.pushToast(error?.message || t('settings_bookkeeping_reminder.toast.save_failed'), 'error')
  } finally {
    saving.value = false
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
