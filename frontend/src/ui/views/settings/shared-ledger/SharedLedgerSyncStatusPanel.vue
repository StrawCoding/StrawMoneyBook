<template>
  <div class="sync-status-box" data-testid="shared-ledger-sync-status">
    <p class="muted compact">
      {{ t('settings_shared_ledgers.sync_status', '同步狀態') }}：
      <strong>{{ statusLabel }}</strong>
    </p>
    <p v-if="lastSyncedAt" class="muted compact">
      {{ t('settings_shared_ledgers.last_synced_at', { time: formatDateTime(lastSyncedAt) }, '上次同步：{time}') }}
    </p>
    <p v-if="version" class="muted compact">
      {{ t('settings_shared_ledgers.sync_version', { version }, '版本：{version}') }}
    </p>
    <p v-if="lastSyncError" class="notice compact">
      {{ lastSyncError }}
    </p>
    <div class="remote-actions">
      <button class="btn" :disabled="retryDisabled" @click="$emit('retry')">
        {{
          retryBusy
            ? t('settings_shared_ledgers.sync_retrying', '重試中...')
            : t('settings_shared_ledgers.sync_retry', '重試同步')
        }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { translateMessage as t } from '@/ui/services/i18n.service'
import { formatSharedLedgerDateTime } from './formatters.js'

defineProps({
  statusLabel: { type: String, default: '' },
  lastSyncedAt: { type: [String, Number, Date], default: '' },
  version: { type: [String, Number], default: '' },
  lastSyncError: { type: String, default: '' },
  retryBusy: { type: Boolean, default: false },
  retryDisabled: { type: Boolean, default: false },
})

defineEmits(['retry'])

function formatDateTime(value) {
  return formatSharedLedgerDateTime(value)
}
</script>
