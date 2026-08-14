<template>
  <div class="email-invite-box">
    <label class="field">
      {{ t('settings_shared_ledgers.email_invite', 'Email 邀請') }}
      <input
        class="input"
        type="email"
        autocomplete="email"
        inputmode="email"
        maxlength="120"
        :value="email"
        :placeholder="t('settings_shared_ledgers.email_invite_placeholder', '輸入對方 Email')"
        :disabled="busy || disabled"
        @input="$emit('update:email', String($event.target.value || '').trim())"
      />
    </label>
    <div class="remote-actions email-invite-actions">
      <button
        class="btn primary"
        :disabled="busy || disabled || !email"
        @click="$emit('send')"
      >
        {{
          busy
            ? t('settings_shared_ledgers.email_invite_sending', '寄送中...')
            : t('settings_shared_ledgers.email_invite_send', '寄送邀請')
        }}
      </button>
    </div>
  </div>

  <p class="muted compact">
    {{ t('settings_shared_ledgers.email_invite_hint', '若 Email 寄送失敗，邀請仍會保留，可稍後重發或改分享加入連結。') }}
  </p>

  <div v-if="outgoingInvitations.length" class="stack internal-stack">
    <strong>{{ t('settings_shared_ledgers.email_invite_pending', '待加入的 Email 邀請') }}</strong>
    <ul class="remote-list">
      <li v-for="item in outgoingInvitations" :key="item.id" class="remote-item">
        <div class="remote-main">
          <div class="stack internal-stack">
            <strong>{{ item.email }}</strong>
            <p class="muted compact">
              {{ t('settings_shared_ledgers.email_invite_sent_at', { time: formatDateTime(item.created_at) }, '建立時間：{time}') }}
            </p>
            <p class="email-delivery-status" :class="`status-${item.email_delivery_status || 'pending'}`">
              {{ deliveryLabel(item) }}
            </p>
            <p v-if="item.email_last_error" class="email-delivery-error compact">
              {{ item.email_last_error }}
            </p>
          </div>
          <div class="remote-actions">
            <button
              v-if="canResend(item)"
              class="btn"
              :disabled="resendBusyId === item.id || disabled"
              @click="$emit('resend', item)"
            >
              {{
                resendBusyId === item.id
                  ? t('settings_shared_ledgers.email_invite_resending', '重發中...')
                  : t('settings_shared_ledgers.email_invite_resend', '重發邀請')
              }}
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { translateMessage as t } from '@/ui/services/i18n.service'
import { formatSharedLedgerDateTime } from './formatters.js'

defineProps({
  email: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  outgoingInvitations: { type: Array, default: () => [] },
  resendBusyId: { type: [String, Number], default: '' },
  deliveryLabel: { type: Function, required: true },
  canResend: { type: Function, required: true },
})

defineEmits(['update:email', 'send', 'resend'])

function formatDateTime(value) {
  return formatSharedLedgerDateTime(value)
}
</script>
