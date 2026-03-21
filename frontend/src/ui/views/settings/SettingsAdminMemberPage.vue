<template>
  <section class="stack">
    <header class="row page-head">
      <div class="title-wrap">
        <h2>{{ pageTitle }}</h2>
        <small v-if="member" class="muted">{{ member.email }}</small>
      </div>
      <RouterLink class="btn back-btn" to="/settings/admin">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="apiUnavailable" class="card panel">
      <p class="muted error-text">{{ apiUnavailableMessage }}</p>
    </article>

    <article v-else-if="!isAdmin" class="card panel">
      <p class="muted error-text">{{ t('settings_admin.not_allowed', '你目前沒有管理員權限。') }}</p>
    </article>

    <article v-else-if="loading" class="card panel">
      <p class="muted">{{ t('common.loading', '載入中...') }}</p>
    </article>

    <article v-else-if="!member" class="card panel">
      <h3>{{ t('settings_admin.member.not_found', '找不到這位會員') }}</h3>
      <p class="muted">{{ t('settings_admin.member.not_found_desc', '這位會員可能已被刪除，請返回管理員列表重新確認。') }}</p>
      <RouterLink class="btn" to="/settings/admin">{{ t('settings_admin.member.back_to_list', '返回會員列表') }}</RouterLink>
    </article>

    <template v-else>
      <article class="card panel">
        <div class="member-hero">
          <div>
            <div class="hero-row">
              <strong>{{ member.display_name || t('settings_admin.users.name_missing', '未設定名稱') }}</strong>
              <span v-if="member.is_admin" class="status-chip status-admin">{{ t('settings_admin.users.admin', '管理員') }}</span>
            </div>
            <p class="muted compact">{{ member.email }}</p>
          </div>
          <span class="status-chip" :class="member.membership_active ? 'status-active' : 'status-inactive'">
            {{ membershipLabel(member) }}
          </span>
        </div>
      </article>

      <article class="card panel detail-grid">
        <div class="detail-card">
          <small class="muted">{{ t('settings_admin.users.membership', '會員') }}</small>
          <strong>{{ membershipLabel(member) }}</strong>
          <small class="muted">{{ membershipDetail(member) }}</small>
        </div>
        <div class="detail-card">
          <small class="muted">{{ t('settings_admin.member.membership_source', '會員來源') }}</small>
          <strong>{{ member.membership_source || '-' }}</strong>
        </div>
        <div class="detail-card">
          <small class="muted">{{ t('settings_admin.member.created_at', '建立時間') }}</small>
          <strong>{{ formatDateTime(member.created_at) }}</strong>
        </div>
        <div class="detail-card">
          <small class="muted">{{ t('settings_admin.users.last_login', '最後登入') }}</small>
          <strong>{{ formatDateTime(member.last_login_at) }}</strong>
        </div>
      </article>

      <article class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_admin.member.actions', '會員管理操作') }}</h3>
        </header>
        <p class="muted compact">
          {{ t('settings_admin.member.actions_desc', '詳細會員資料與操作集中在這一頁，列表頁只保留簡介與入口。') }}
        </p>
        <div class="action-panel">
          <label class="field">
            <span>{{ t('settings_admin.member.plan', '會員方案') }}</span>
            <select v-model="membershipDraft" class="input select-input">
              <option value="monthly">{{ t('settings_admin.membership.monthly', '月費') }}</option>
              <option value="lifetime">{{ t('settings_admin.membership.lifetime', '終身') }}</option>
            </select>
          </label>
          <div class="row action-row">
            <button class="btn primary" :disabled="membershipSaving" @click="saveMembership">
              {{ membershipSaving ? t('common.processing', '處理中') : t('settings_admin.users.set_membership', '設定會員') }}
            </button>
            <button class="btn" :disabled="membershipSaving" @click="clearMembership">
              {{ t('settings_admin.users.clear_membership', '清除會員') }}
            </button>
            <button class="btn danger" :disabled="deletingUser || member.id === sessionUser?.id" @click="deleteUser">
              {{ deletingUser ? t('common.processing', '處理中') : t('common.delete', '刪除') }}
            </button>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  deleteAdminUser,
  getAdminOverview,
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  subscribeSharedLedgerSession,
  updateAdminUserMembership,
} from '@/services/shared-ledger/backend'

const props = defineProps({
  id: {
    type: String,
    default: '',
  },
})

const router = useRouter()
const uiStore = useUiStore()
const { locale, t } = useI18n()

const apiUnavailable = !isSharedLedgerApiConfigured()
const apiUnavailableMessage = getSharedLedgerApiUnavailableMessage()
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const loading = ref(false)
const membershipSaving = ref(false)
const deletingUser = ref(false)
const member = ref(null)
const membershipDraft = ref('monthly')

const isAdmin = computed(() => Boolean(sessionUser.value?.is_admin))
const normalizedMemberId = computed(() => String(props.id ?? '').trim())
const pageTitle = computed(() => (
  member.value?.display_name
    || member.value?.email
    || t('settings_admin.member.title', '會員詳細資料')
))

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function inferMembershipPlan(user) {
  const expiresAt = String(user?.membership_bonus_expires_at ?? '').trim()
  if (expiresAt.startsWith('2099-12-31')) return 'lifetime'
  return 'monthly'
}

function membershipLabel(user) {
  if (user?.membership_active) {
    return t('settings_admin.users.membership_active', '啟用中')
  }
  return t('settings_admin.users.membership_inactive', '未啟用')
}

function membershipDetail(user) {
  if (!user?.membership_active) {
    return t('settings_admin.member.membership_inactive_desc', '目前沒有啟用中的會員資格。')
  }
  const expiresAt = String(user?.membership_bonus_expires_at ?? '').trim()
  if (expiresAt) {
    return t('settings_admin.member.membership_expires', { time: formatDateTime(expiresAt) }, '到期時間：{time}')
  }
  return t('settings_admin.member.membership_active_desc', '會員資格已啟用。')
}

async function loadMember() {
  if (apiUnavailable || !isAdmin.value || !normalizedMemberId.value) return
  loading.value = true
  try {
    const data = await getAdminOverview()
    const matched = Array.isArray(data?.users)
      ? data.users.find((item) => String(item?.id ?? '') === normalizedMemberId.value)
      : null
    member.value = matched ?? null
    membershipDraft.value = inferMembershipPlan(matched)
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '載入會員資料失敗'), 'error')
  } finally {
    loading.value = false
  }
}

async function saveMembership() {
  if (!member.value) return
  membershipSaving.value = true
  try {
    await updateAdminUserMembership(member.value.id, {
      plan: membershipDraft.value || 'monthly',
      active: true,
    })
    uiStore.pushToast(t('settings_admin.toast.membership_saved', '會員設定已更新'))
    await loadMember()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '更新會員失敗'), 'error')
  } finally {
    membershipSaving.value = false
  }
}

async function clearMembership() {
  if (!member.value) return
  membershipSaving.value = true
  try {
    await updateAdminUserMembership(member.value.id, {
      plan: '',
      active: false,
    })
    uiStore.pushToast(t('settings_admin.toast.membership_cleared', '會員已清除'))
    await loadMember()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '清除會員失敗'), 'error')
  } finally {
    membershipSaving.value = false
  }
}

async function deleteUser() {
  if (!member.value) return
  if (!window.confirm(`確定要刪除 ${member.value.email} 嗎？`)) return
  deletingUser.value = true
  try {
    await deleteAdminUser(member.value.id)
    uiStore.pushToast(t('settings_admin.toast.user_deleted', '使用者已刪除'))
    await router.replace({ name: 'settings-admin' })
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '刪除使用者失敗'), 'error')
  } finally {
    deletingUser.value = false
  }
}

let unsubscribeSession = null

watch([normalizedMemberId, isAdmin], () => {
  void loadMember()
}, { immediate: false })

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? null
  })
  void loadMember()
})

onUnmounted(() => {
  if (typeof unsubscribeSession === 'function') {
    unsubscribeSession()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
}
.page-head,
.section-head {
  align-items: center;
}
.title-wrap {
  min-width: 0;
}
.member-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.hero-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.detail-card {
  display: grid;
  gap: 4px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 12px;
}
.action-panel {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
}
.select-input {
  min-width: 120px;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
}
.status-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.status-admin,
.status-active {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ok);
}
.status-inactive {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
}
.compact {
  margin: 0;
}
.error-text {
  color: var(--danger, #b42318);
}
@media (max-width: 720px) {
  .member-hero {
    flex-direction: column;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
