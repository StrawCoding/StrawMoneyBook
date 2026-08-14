<template>
  <div class="stack internal-stack member-manage-box">
    <div class="section-head">
      <strong>{{ t('settings_shared_ledgers.members_title', '成員與角色') }}</strong>
      <button class="btn" :disabled="loading || disabled" @click="$emit('refresh')">
        {{ loading ? t('settings_shared_ledgers.loading', '載入中...') : t('settings_shared_ledgers.refresh', '重新整理') }}
      </button>
    </div>
    <ul v-if="members.length" class="remote-list">
      <li v-for="member in members" :key="member.user_id" class="remote-item">
        <div class="remote-main">
          <div class="stack internal-stack">
            <strong>{{ member.display_name || member.email || member.user_id }}</strong>
            <p class="muted compact">{{ member.email }}</p>
            <p class="muted compact">{{ t('settings_shared_ledgers.member_role', '角色') }}：{{ roleLabel(member.role) }}</p>
          </div>
          <div class="remote-actions">
            <select
              v-if="!member.is_owner"
              class="input role-select"
              :value="member.role"
              :disabled="roleBusyId === member.user_id || disabled"
              @change="$emit('change-role', member, $event.target.value)"
            >
              <option v-for="roleOption in assignableRolesFor(member)" :key="roleOption" :value="roleOption">
                {{ roleLabel(roleOption) }}
              </option>
            </select>
            <button
              v-if="canTransferOwnership && !member.is_owner"
              class="btn"
              :disabled="transferBusyId === member.user_id || disabled"
              @click="$emit('transfer-ownership', member)"
            >
              {{ t('settings_shared_ledgers.transfer_ownership', '轉移所有權') }}
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="muted compact">
      {{ t('settings_shared_ledgers.members_empty', '目前只有你一位成員。') }}
    </p>
  </div>
</template>

<script setup>
import { translateMessage as t } from '@/ui/services/i18n.service'
import {
  getSharedLedgerAssignableRoles,
  getSharedLedgerRoleLabel,
} from './formatters.js'

const props = defineProps({
  members: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  roleBusyId: { type: [String, Number], default: '' },
  transferBusyId: { type: [String, Number], default: '' },
  canTransferOwnership: { type: Boolean, default: false },
  assignableRoles: { type: Array, default: () => ['admin', 'member', 'viewer'] },
})

defineEmits(['refresh', 'change-role', 'transfer-ownership'])

function roleLabel(role) {
  return getSharedLedgerRoleLabel(t, role)
}

function assignableRolesFor(member) {
  return getSharedLedgerAssignableRoles(member, {
    canTransferOwnership: props.canTransferOwnership,
    assignableRoles: props.assignableRoles,
  })
}
</script>
