<template>
  <div class="view-root">
    <section class="stack">
      <article class="card panel">
        <header class="row">
          <h2>{{ t('settings_shared_ledgers.title', '共同帳本') }}</h2>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </header>
        <p class="muted intro">
          {{ t('settings_shared_ledgers.desc', '登入後可建立共同帳本、用 Email 邀請好友加入，並在這裡接受收到的邀請。') }}
        </p>
        <p v-if="apiUnavailable" class="notice">
          {{ apiUnavailableMessage }}
        </p>
      </article>

      <article v-if="!sessionUser" class="card panel">
        <div class="profile-row">
          <div class="avatar-wrap">
            <div class="avatar-fallback">?</div>
          </div>
          <div class="profile-meta">
            <strong>{{ t('settings_shared_ledgers.login_required', '尚未登入帳號') }}</strong>
            <p class="muted compact">
              {{ t('settings_shared_ledgers.login_required_desc', '登入後才能建立共同帳本、邀請好友，以及接受後端收到的共享帳本邀請。') }}
            </p>
          </div>
        </div>
        <RouterLink class="btn primary wide-btn" to="/settings/account">
          {{ t('settings_account.login_register', '前往登入 / 註冊') }}
        </RouterLink>
      </article>

      <template v-else>
        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.account_info', '目前登入帳號') }}</h3>
          </header>

          <div class="profile-row">
            <div class="avatar-wrap">
              <img v-if="sessionUser.avatar_url" :src="sessionUser.avatar_url" alt="avatar" class="avatar-img" />
              <div v-else class="avatar-fallback">{{ avatarLabel }}</div>
            </div>
            <div class="profile-meta">
              <strong>{{ accountName }}</strong>
              <p class="muted compact">{{ sessionUser.email || sessionUser.account }}</p>
              <p class="muted compact">
                {{ t('settings_shared_ledgers.account_hint', '共享帳本邀請會依照登入 Email 派送到後端待辦清單。') }}
              </p>
            </div>
          </div>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.pending_invites', '收到的共享帳本邀請') }}</h3>
            <button class="btn" :disabled="remoteLoading || apiUnavailable" @click="loadRemoteLedgers">
              {{ remoteLoading ? t('settings_shared_ledgers.loading', '載入中...') : t('settings_shared_ledgers.refresh', '重新整理') }}
            </button>
          </header>

          <ul v-if="pendingInvitations.length" class="remote-list">
            <li v-for="item in pendingInvitations" :key="item.id" class="remote-item">
              <div class="remote-main">
                <div class="stack internal-stack">
                  <strong>{{ item.shared_ledger_name }}</strong>
                  <p class="muted compact">
                    {{
                      t(
                        'settings_shared_ledgers.pending_invite_meta',
                        { name: item.invited_by_display_name || '-', time: formatDateTime(item.created_at) },
                        '邀請人：{name} ・ {time}',
                      )
                    }}
                  </p>
                  <p class="muted compact">
                    {{ t('settings_shared_ledgers.pending_invite_email', '邀請 Email') }}：{{ item.email }}
                  </p>
                </div>
                <div class="remote-actions">
                  <button class="btn primary" :disabled="invitationBusyId === item.id || apiUnavailable" @click="acceptInvitation(item)">
                    {{
                      invitationBusyId === item.id
                        ? t('settings_shared_ledgers.accepting', '接受中...')
                        : t('settings_shared_ledgers.accept_and_download', '接受並下載')
                    }}
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <p v-else class="muted compact">
            {{ t('settings_shared_ledgers.pending_invites_empty', '目前沒有待接受的共享帳本邀請。') }}
          </p>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.current_ledger', '目前帳本') }}</h3>
          </header>

          <div v-if="activeLedger" class="stack internal-stack">
            <div class="info-block">
              <strong>{{ activeLedger.name }}</strong>
              <p class="muted compact">{{ activeLedger.id }}</p>
            </div>

            <template v-if="activeLedgerMeta?.shared_ledger_id">
              <div class="info-block">
                <strong>{{ currentRemoteLedger?.name || activeLedgerMeta.remote_name || '-' }}</strong>
                <p class="muted compact">
                  {{ t('settings_shared_ledgers.remote_meta', { role: currentRemoteLedger?.role || activeLedgerMeta.role || '-' }, '{role}') }}
                </p>
                <p class="muted compact">
                  {{ t('settings_shared_ledgers.auto_sync_hint', '已啟用背景同步：本機變更會自動上傳，並每秒檢查遠端最新資料。') }}
                </p>
              </div>

              <label class="checkbox-row">
                <input :checked="activeLedgerMeta.auto_sync_enabled !== false" type="checkbox" @change="toggleAutoSync" />
                <span>{{ t('settings_shared_ledgers.auto_sync', '資料變更後自動同步') }}</span>
              </label>

              <div class="invite-box">
                <label class="field">
                  {{ t('settings_shared_ledgers.invite_email', '邀請好友 Email') }}
                  <input
                    v-model.trim="inviteEmailInput"
                    class="input"
                    type="email"
                    autocomplete="email"
                    :placeholder="t('settings_shared_ledgers.invite_email_placeholder', 'friend@example.com')"
                    :disabled="inviteSubmitting || ledgerActionBusy || apiUnavailable"
                    @keyup.enter="submitInviteByEmail"
                  />
                </label>
                <button class="btn primary" :disabled="inviteSubmitting || ledgerActionBusy || apiUnavailable || !inviteEmailInput" @click="submitInviteByEmail">
                  {{ inviteSubmitting ? t('settings_shared_ledgers.inviting', '邀請中...') : t('settings_shared_ledgers.send_invite', '送出邀請') }}
                </button>
              </div>

              <p class="muted compact">
                {{ t('settings_shared_ledgers.invite_email_hint', '系統不會寄出 Email，邀請會記錄在後端，對方用相同 Email 登入後即可在上方看到。') }}
              </p>
            </template>

            <template v-else>
              <label class="field">
                {{ t('settings_shared_ledgers.shared_name', '共同帳本名稱') }}
                <input
                  v-model.trim="sharedLedgerNameInput"
                  class="input"
                  type="text"
                  maxlength="40"
                  :placeholder="activeLedger.name"
                  :disabled="ledgerActionBusy || apiUnavailable"
                />
              </label>
              <button class="btn primary wide-btn" :disabled="ledgerActionBusy || apiUnavailable" @click="createSharedFromActiveLedger">
                {{ ledgerActionBusy === 'create' ? t('settings_shared_ledgers.creating', '建立中...') : t('settings_shared_ledgers.create_shared', '建立共同帳本') }}
              </button>
            </template>
          </div>

          <p v-else class="muted compact">
            {{ t('settings_shared_ledgers.no_active_ledger', '目前沒有本機帳本，可先建立帳本，或先接受共享帳本邀請下載到本機。') }}
          </p>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.my_ledgers', '我的共同帳本') }}</h3>
            <button class="btn" :disabled="remoteLoading || apiUnavailable" @click="loadRemoteLedgers">
              {{ remoteLoading ? t('settings_shared_ledgers.loading', '載入中...') : t('settings_shared_ledgers.refresh', '重新整理') }}
            </button>
          </header>

          <ul v-if="remoteLedgers.length" class="remote-list">
            <li v-for="item in remoteLedgers" :key="item.id" class="remote-item">
              <div class="remote-main">
                <div class="stack internal-stack">
                  <strong>{{ item.name }}</strong>
                  <p class="muted compact">
                    {{ t('settings_shared_ledgers.remote_meta', { role: item.role || '-', count: item.member_count || 0 }, '{role} ・ {count} 位成員') }}
                  </p>
                  <p class="muted compact">
                    {{
                      t(
                        'settings_shared_ledgers.remote_owner_meta',
                        { owner: item.owner_display_name || '-', time: formatDateTime(item.updated_at) },
                        '建立者：{owner} ・ 最近更新：{time}',
                      )
                    }}
                  </p>
                  <p v-if="bindingMap[item.id]" class="muted compact">
                    {{ t('settings_shared_ledgers.local_binding', { name: bindingMap[item.id].ledgerName }, '已綁定本機帳本：{name}') }}
                  </p>
                </div>
                <div class="remote-actions">
                  <button
                    v-if="bindingMap[item.id]"
                    class="btn"
                    :disabled="remoteItemBusyId === item.id || apiUnavailable"
                    @click="switchToLocalLedger(bindingMap[item.id].ledgerId)"
                  >
                    {{ t('settings_shared_ledgers.switch_local', '切換本機帳本') }}
                  </button>
                  <button class="btn primary" :disabled="remoteItemBusyId === item.id || apiUnavailable" @click="downloadRemoteLedger(item)">
                    {{
                      remoteItemBusyId === item.id
                        ? t('settings_shared_ledgers.downloading', '下載中...')
                        : bindingMap[item.id]
                          ? t('settings_shared_ledgers.pull_now', '下載最新')
                          : t('settings_shared_ledgers.download_to_local', '下載到本機')
                    }}
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <p v-else class="muted compact">
            {{ t('settings_shared_ledgers.empty', '目前還沒有共同帳本。') }}
          </p>
        </article>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  refreshSharedLedgerSession,
  subscribeSharedLedgerSession,
} from '@/services/shared-ledger/backend'
import {
  acceptSharedLedgerInvitationToLocal,
  importRemoteSharedLedgerToLocal,
  inviteEmailToSharedLedger,
  listLocalSharedLedgerBindings,
  listRemoteSharedLedgers,
  publishLedgerAsShared,
  setSharedLedgerAutoSyncEnabled,
} from '@/ui/services/shared-ledger.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const apiUnavailable = computed(() => !isSharedLedgerApiConfigured())
const apiUnavailableMessage = computed(() => getSharedLedgerApiUnavailableMessage())
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const remoteLoading = ref(false)
const remoteLedgers = ref([])
const pendingInvitations = ref([])
const bindingMap = ref({})
const activeLedgerMeta = ref(null)
const sharedLedgerNameInput = ref('')
const ledgerActionBusy = ref('')
const remoteItemBusyId = ref('')
const invitationBusyId = ref('')
const inviteEmailInput = ref('')
const inviteSubmitting = ref(false)

const activeLedger = computed(() => ledgerStore.activeLedger)
const accountName = computed(() => String(sessionUser.value?.display_name || sessionUser.value?.email || sessionUser.value?.account || '').trim())
const avatarLabel = computed(() => {
  const base = accountName.value || '?'
  return base.slice(0, 1).toUpperCase()
})
const currentRemoteLedger = computed(() => {
  const sharedLedgerId = String(activeLedgerMeta.value?.shared_ledger_id ?? '').trim()
  if (!sharedLedgerId) return null
  return remoteLedgers.value.find((item) => String(item?.id ?? '') === sharedLedgerId) ?? null
})

function formatDateTime(value) {
  const source = String(value ?? '').trim()
  if (!source) return '-'
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return source
  return parsed.toLocaleString()
}

async function refreshLocalBindings() {
  const bindings = await listLocalSharedLedgerBindings(ledgerStore.ledgers)
  const nextMap = {}
  for (const binding of bindings) {
    nextMap[binding.meta.shared_ledger_id] = binding
  }
  bindingMap.value = nextMap
  activeLedgerMeta.value = bindings.find((binding) => binding.ledgerId === ledgerStore.activeLedgerId)?.meta ?? null
}

async function loadRemoteLedgers() {
  if (!sessionUser.value || apiUnavailable.value) {
    remoteLedgers.value = []
    pendingInvitations.value = []
    return
  }

  remoteLoading.value = true
  try {
    const data = await listRemoteSharedLedgers()
    remoteLedgers.value = Array.isArray(data?.items) ? data.items : []
    pendingInvitations.value = Array.isArray(data?.pendingInvitations) ? data.pendingInvitations : []
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.load_failed', '載入共同帳本失敗'), 'error')
  } finally {
    remoteLoading.value = false
  }
}

async function refreshSessionAndData() {
  if (!apiUnavailable.value) {
    try {
      const session = await refreshSharedLedgerSession()
      sessionUser.value = session?.user ?? getSharedLedgerSession()?.user ?? null
    } catch {
      sessionUser.value = getSharedLedgerSession()?.user ?? null
    }
  }

  await refreshLocalBindings()
  await loadRemoteLedgers()
}

async function afterLedgerImported(ledgerId, routeHome = false) {
  await ledgerStore.refresh()
  await ledgerStore.switchLedger(ledgerId, { force: true })
  await refreshLocalBindings()
  await loadRemoteLedgers()
  if (routeHome) {
    await router.replace('/')
  }
}

async function createSharedFromActiveLedger() {
  if (!activeLedger.value || apiUnavailable.value) return
  ledgerActionBusy.value = 'create'
  try {
    await publishLedgerAsShared(activeLedger.value.id, {
      name: sharedLedgerNameInput.value || activeLedger.value.name,
    })
    await refreshLocalBindings()
    await loadRemoteLedgers()
    uiStore.pushToast(t('settings_shared_ledgers.toast.created', '共同帳本已建立'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.create_failed', '建立共同帳本失敗'), 'error')
  } finally {
    ledgerActionBusy.value = ''
  }
}

async function submitInviteByEmail() {
  if (!activeLedger.value || !inviteEmailInput.value || apiUnavailable.value) return
  inviteSubmitting.value = true
  try {
    await inviteEmailToSharedLedger(activeLedger.value.id, inviteEmailInput.value)
    inviteEmailInput.value = ''
    await loadRemoteLedgers()
    uiStore.pushToast(t('settings_shared_ledgers.toast.email_invite_sent', '共享帳本邀請已送出'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.email_invite_failed', '送出共享帳本邀請失敗'), 'error')
  } finally {
    inviteSubmitting.value = false
  }
}

async function acceptInvitation(item) {
  const invitationId = String(item?.id ?? '').trim()
  if (!invitationId || apiUnavailable.value) return
  invitationBusyId.value = invitationId
  try {
    const hadNoLedgers = ledgerStore.ledgers.length === 0
    const result = await acceptSharedLedgerInvitationToLocal(invitationId)
    await afterLedgerImported(result.ledgerId, hadNoLedgers)
    uiStore.pushToast(t('settings_shared_ledgers.toast.invitation_accepted', '已接受共享帳本邀請'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.invitation_failed', '接受共享帳本邀請失敗'), 'error')
  } finally {
    invitationBusyId.value = ''
  }
}

async function downloadRemoteLedger(item) {
  if (!item?.id || apiUnavailable.value) return
  remoteItemBusyId.value = item.id
  try {
    const hadNoLedgers = ledgerStore.ledgers.length === 0
    const result = await importRemoteSharedLedgerToLocal(item.id)
    await afterLedgerImported(result.ledgerId, hadNoLedgers)
    uiStore.pushToast(t('settings_shared_ledgers.toast.pull_done', '共同帳本已下載到本機'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.pull_failed', '共同帳本下載失敗'), 'error')
  } finally {
    remoteItemBusyId.value = ''
  }
}

async function switchToLocalLedger(ledgerId) {
  try {
    await ledgerStore.switchLedger(ledgerId)
    await refreshLocalBindings()
    uiStore.pushToast(t('settings_shared_ledgers.toast.switched', '已切換到本機帳本'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.switch_failed', '切換本機帳本失敗'), 'error')
  }
}

async function toggleAutoSync(event) {
  if (!activeLedger.value) return
  try {
    await setSharedLedgerAutoSyncEnabled(activeLedger.value.id, Boolean(event?.target?.checked))
    await refreshLocalBindings()
    uiStore.pushToast(t('settings_shared_ledgers.toast.auto_sync_saved', '共同帳本自動同步設定已更新'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.auto_sync_failed', '儲存共同帳本設定失敗'), 'error')
  }
}

watch(
  () => ledgerStore.activeLedger?.name,
  (value) => {
    if (!sharedLedgerNameInput.value) {
      sharedLedgerNameInput.value = String(value ?? '')
    }
  },
  { immediate: true },
)

watch(
  () => [ledgerStore.activeLedgerId, ledgerStore.ledgers.length],
  () => {
    void refreshLocalBindings()
  },
)

let unsubscribeSession = null

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? null
    if (!sessionUser.value) {
      remoteLedgers.value = []
      pendingInvitations.value = []
      return
    }
    void loadRemoteLedgers()
  })
  void refreshSessionAndData()
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

h2,
h3,
p {
  margin: 0;
}

.intro,
.compact {
  margin: 0;
}

.notice {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #f44336 10%, var(--card));
}

.section-head,
.action-row,
.remote-actions,
.info-row,
.invite-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.stack,
.internal-stack,
.info-block,
.profile-meta,
.field {
  display: grid;
  gap: 12px;
}

.field {
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  flex: 1;
}

.wide-btn {
  width: 100%;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar-wrap {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img,
.avatar-fallback {
  width: 100%;
  height: 100%;
}

.avatar-img {
  object-fit: cover;
}

.avatar-fallback {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 76%, #fff 24%), #1b8f6a);
  color: #fff;
  font-size: 22px;
  font-weight: 800;
}

.meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.meta-grid > div,
.remote-item {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
}

.meta-grid > div {
  display: grid;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: var(--muted);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.invite-box {
  align-items: end;
}

.remote-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.remote-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .section-head,
  .remote-main,
  .invite-box,
  .profile-row {
    flex-direction: column;
    align-items: stretch;
  }

  .avatar-wrap {
    align-self: flex-start;
  }
}
</style>
