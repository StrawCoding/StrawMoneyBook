<template>
  <div class="view-root">
    <section class="stack">
      <article class="card panel">
        <header class="row">
          <h2>{{ t('settings_shared_ledgers.title', '共同帳本') }}</h2>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </header>
        <p class="muted intro">
          {{ t('settings_shared_ledgers.desc_link_share', '共同帳本為會員功能，啟用後可建立共同帳本、分享加入連結，並在這裡管理同步與共享狀態。') }}
        </p>
        <p v-if="apiUnavailable" class="notice">
          {{ apiUnavailableMessage }}
        </p>
      </article>

      <article v-if="pendingInviteLinkCode" class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_shared_ledgers.invite_link_detected', '偵測到共享連結') }}</h3>
          <button class="btn" :disabled="inviteLinkJoining" @click="dismissPendingInviteLink">
            {{ t('common.clear', '清除') }}
          </button>
        </header>

        <div class="stack internal-stack">
          <p class="muted compact">{{ pendingInviteLinkMessage }}</p>
          <div class="link-code">{{ pendingInviteLinkCode }}</div>
          <div class="remote-actions">
            <button class="btn primary" :disabled="!canJoinPendingInviteLink || inviteLinkJoining" @click="joinPendingInviteLink()">
              {{
                inviteLinkJoining
                  ? t('settings_shared_ledgers.joining_by_link', '加入中...')
                  : t('settings_shared_ledgers.join_by_link', '立即加入')
              }}
            </button>
            <RouterLink v-if="!sessionUser" class="btn" to="/settings/account">
              {{ t('settings_account.login_register', '前往登入 / 註冊') }}
            </RouterLink>
            <RouterLink v-else-if="!hasMembershipAccess" class="btn" to="/settings/membership-benefits">
              {{ t('settings_shared_ledgers.view_membership', '查看會員權益') }}
            </RouterLink>
          </div>
        </div>
      </article>

      <article v-if="!sessionUser" class="card panel">
        <div class="profile-row">
          <div class="avatar-wrap">
            <div class="avatar-fallback">?</div>
          </div>
          <div class="profile-meta">
            <strong>{{ t('settings_shared_ledgers.login_required', '尚未登入帳號') }}</strong>
            <p class="muted compact">
              {{ t('settings_shared_ledgers.login_required_desc_link', '登入後才能建立共同帳本、分享加入連結，以及接收點擊連結帶入的共享帳本。') }}
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
              <p class="muted compact">{{ membershipStatusText }}</p>
            </div>
          </div>
        </article>

        <article v-if="!hasMembershipAccess" class="card panel membership-lock">
          <div class="stack internal-stack">
            <div class="info-block">
              <strong>{{ t('settings_shared_ledgers.member_only', '共同帳本僅限會員使用') }}</strong>
              <p class="muted compact">
                {{ t('settings_shared_ledgers.member_only_desc', '建立、邀請、接受邀請與背景同步都需要會員資格。') }}
              </p>
            </div>

            <div v-if="isTrialEligible" class="notice-box">
              <strong>{{ t('settings_shared_ledgers.first_trial_title', '第一次使用付費會員，3 天免費') }}</strong>
              <p class="muted compact">
                {{ t('settings_shared_ledgers.first_trial_desc', '可先啟用 3 天免費試用，再開始使用共同帳本。') }}
              </p>
            </div>

            <div class="remote-actions">
              <button
                v-if="isTrialEligible"
                class="btn primary"
                :disabled="trialActivating || apiUnavailable"
                @click="activateFirstTrial"
              >
                {{ trialActivating ? t('settings_shared_ledgers.trial_activating', '啟用中...') : t('settings_shared_ledgers.trial_activate', '啟用 3 天免費') }}
              </button>
              <RouterLink class="btn" to="/settings/membership-benefits">
                {{ t('settings_shared_ledgers.view_membership', '查看會員權益') }}
              </RouterLink>
            </div>
          </div>
        </article>

        <template v-else>
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
                    {{ t('settings_shared_ledgers.auto_sync_hint', '已啟用背景同步：本機變更會自動上傳，並在開啟 App 時檢查遠端最新資料。') }}
                  </p>
                </div>

                <div class="remote-actions">
                  <button class="btn" :disabled="Boolean(ledgerActionBusy) || apiUnavailable" @click="stopSharingActiveLedger">
                    {{
                      ledgerActionBusy === 'unlink'
                        ? t('settings_shared_ledgers.unsharing', '取消共享中...')
                        : t('settings_shared_ledgers.unshare', '取消共享')
                    }}
                  </button>
                </div>

                <label class="checkbox-row">
                  <input :checked="activeLedgerMeta.auto_sync_enabled !== false" type="checkbox" @change="toggleAutoSync" />
                  <span>{{ t('settings_shared_ledgers.auto_sync', '資料變更後自動同步') }}</span>
                </label>

                <div class="share-link-box">
                  <label class="field">
                    {{ t('settings_shared_ledgers.share_link', '共享加入連結') }}
                    <input
                      :value="currentShareLink"
                      class="input"
                      type="text"
                      readonly
                      :placeholder="t('settings_shared_ledgers.share_link_placeholder', '建立共同帳本後即可產生共享連結')"
                      @focus="$event.target.select()"
                    />
                  </label>
                  <div class="remote-actions share-link-actions">
                    <button class="btn primary" :disabled="shareLinkBusy || ledgerActionBusy || apiUnavailable || !currentShareLink" @click="shareCurrentLedgerLink">
                      {{
                        shareLinkBusy === 'share'
                          ? t('settings_shared_ledgers.sharing_link', '分享中...')
                          : t('settings_shared_ledgers.share_link_action', '分享連結')
                      }}
                    </button>
                    <button class="btn" :disabled="shareLinkBusy || ledgerActionBusy || apiUnavailable || !currentShareLink" @click="copyCurrentLedgerLink">
                      {{
                        shareLinkBusy === 'copy'
                          ? t('settings_shared_ledgers.copying_link', '複製中...')
                          : t('settings_shared_ledgers.copy_link', '複製連結')
                      }}
                    </button>
                  </div>
                </div>

                <p class="muted compact">
                  {{ t('settings_shared_ledgers.share_link_hint', '把這個連結傳給對方後，對方點擊即可開啟 app；登入並啟用會員後會直接加入共同帳本。') }}
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
                    <button class="btn primary" :disabled="remoteItemBusyId === item.id || apiUnavailable" @click="downloadRemoteLedger(item)">
                      {{
                        remoteItemBusyId === item.id
                          ? t('settings_shared_ledgers.downloading', '下載中...')
                          : bindingMap[item.id]
                            ? t('settings_shared_ledgers.pull_now', '下載最新')
                            : t('settings_shared_ledgers.download_to_local', '下載到本機')
                      }}
                    </button>
                    <button class="btn" :disabled="remoteDeleteBusyId === item.id || apiUnavailable" @click="removeRemoteLedger(item)">
                      {{
                        remoteDeleteBusyId === item.id
                          ? getRemoteUnshareBusyLabel(item)
                          : getRemoteUnshareLabel(item)
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
      </template>
    </section>

    <AppDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      :loading="confirmDialog.loading"
      :loading-text="confirmDialog.loadingText"
      @close="closeConfirmDialog"
      @confirm="confirmDialogAction"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  activateSharedLedgerTrial,
  buildSharedLedgerInviteLink,
  clearPendingSharedLedgerInviteCode,
  getSharedLedgerApiUnavailableMessage,
  getPendingSharedLedgerInviteCode,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  rememberPendingSharedLedgerInviteCode,
  refreshSharedLedgerSession,
  subscribeSharedLedgerSession,
} from '@/services/shared-ledger/backend'
import {
  acceptSharedLedgerInvitationToLocal,
  importRemoteSharedLedgerToLocal,
  joinSharedLedgerByLinkToLocal,
  listLocalSharedLedgerBindings,
  listRemoteSharedLedgers,
  publishLedgerAsShared,
  setSharedLedgerAutoSyncEnabled,
  stopSharingLocalLedger,
  stopSharingRemoteSharedLedger,
} from '@/ui/services/shared-ledger.service'

const route = useRoute()
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
const remoteDeleteBusyId = ref('')
const invitationBusyId = ref('')
const shareLinkBusy = ref('')
const trialActivating = ref(false)
const pendingInviteLinkCode = ref(getPendingSharedLedgerInviteCode())
const inviteLinkJoining = ref(false)
const lastAutoJoinInviteCode = ref('')
const confirmDialog = ref({
  open: false,
  mode: '',
  title: '',
  message: '',
  confirmText: '',
  loadingText: '',
  loading: false,
  item: null,
})

const activeLedger = computed(() => ledgerStore.activeLedger)
const accountName = computed(() => String(sessionUser.value?.display_name || sessionUser.value?.email || sessionUser.value?.account || '').trim())
const hasMembershipAccess = computed(() => Boolean(sessionUser.value?.membership_active))
const isTrialEligible = computed(() => Boolean(sessionUser.value?.membership_trial_eligible))
const avatarLabel = computed(() => {
  const base = accountName.value || '?'
  return base.slice(0, 1).toUpperCase()
})
const membershipStatusText = computed(() => {
  if (hasMembershipAccess.value) {
    const expiresAt = String(sessionUser.value?.membership_bonus_expires_at ?? '').trim()
    if (expiresAt) {
      return t('settings_shared_ledgers.membership_active_until', { time: formatDateTime(expiresAt) }, '會員已啟用，可使用至 {time}')
    }
    return t('settings_shared_ledgers.membership_active', '會員已啟用，可使用共同帳本與共享邀請。')
  }

  if (isTrialEligible.value) {
    return t('settings_shared_ledgers.membership_trial_hint', '第一次使用付費會員可先免費試用 3 天。')
  }

  return t('settings_shared_ledgers.membership_required_hint', '共同帳本目前僅限有效會員使用。')
})
const currentRemoteLedger = computed(() => {
  const sharedLedgerId = String(activeLedgerMeta.value?.shared_ledger_id ?? '').trim()
  if (!sharedLedgerId) return null
  return remoteLedgers.value.find((item) => String(item?.id ?? '') === sharedLedgerId) ?? null
})
const currentInviteCode = computed(() => String(currentRemoteLedger.value?.invite_code ?? activeLedgerMeta.value?.invite_code ?? '').trim())
const currentShareLink = computed(() => buildSharedLedgerInviteLink(currentInviteCode.value))
const canJoinPendingInviteLink = computed(() => Boolean(
  pendingInviteLinkCode.value
  && sessionUser.value
  && hasMembershipAccess.value
  && !apiUnavailable.value,
))
const pendingInviteLinkMessage = computed(() => {
  if (!pendingInviteLinkCode.value) return ''
  if (!sessionUser.value) {
    return t('settings_shared_ledgers.pending_link_login_hint', '已偵測到共享連結，登入後即可加入共同帳本。')
  }
  if (!hasMembershipAccess.value) {
    return t('settings_shared_ledgers.pending_link_membership_hint', '已偵測到共享連結，啟用會員後即可加入共同帳本。')
  }
  return t('settings_shared_ledgers.pending_link_ready_hint', '已偵測到共享連結，會將共同帳本下載到本機並開始同步。')
})

async function copyTextToClipboard(text) {
  const normalizedText = String(text ?? '').trim()
  if (!normalizedText) {
    throw new Error('缺少可複製的內容')
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText)
    return true
  }
  throw new Error('目前裝置不支援直接複製，請手動選取連結')
}

function getRemoteUnshareLabel(item) {
  const role = String(item?.role ?? '').trim().toLowerCase()
  return role === 'owner'
    ? t('settings_shared_ledgers.delete_shared', '刪除共享')
    : t('settings_shared_ledgers.leave_shared', '不再共享')
}

function getRemoteUnshareBusyLabel(item) {
  const role = String(item?.role ?? '').trim().toLowerCase()
  return role === 'owner'
    ? t('settings_shared_ledgers.deleting_shared', '刪除中...')
    : t('settings_shared_ledgers.leaving_shared', '處理中...')
}

function getRemoteUnshareConfirmMessage(item) {
  const role = String(item?.role ?? '').trim().toLowerCase()
  return role === 'owner'
    ? t('settings_shared_ledgers.delete_shared_confirm', '刪除共享後，所有成員都會失去這本共同帳本的同步連線。是否繼續？')
    : t('settings_shared_ledgers.leave_shared_confirm', '不再共享後，這本共同帳本會從你的列表移除，已下載到本機的帳本只保留本機資料。是否繼續？')
}

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
  if (!sessionUser.value || apiUnavailable.value || !hasMembershipAccess.value) {
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

function refreshSharedLedgerViewInBackground() {
  void (async () => {
    await refreshLocalBindings()
    await loadRemoteLedgers()
  })().catch((error) => {
    console.warn('[shared-ledger] refresh view state failed', error)
  })
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

async function activateFirstTrial() {
  if (!sessionUser.value || !isTrialEligible.value || apiUnavailable.value) return
  trialActivating.value = true
  try {
    const result = await activateSharedLedgerTrial()
    await loadRemoteLedgers()
    uiStore.pushToast(
      t(
        'settings_shared_ledgers.toast.trial_started',
        { time: formatDateTime(result?.expires_at) },
        '已啟用 3 天免費試用，期限至 {time}',
      ),
    )
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.trial_failed', '啟用免費試用失敗'), 'error')
  } finally {
    trialActivating.value = false
  }
}

async function createSharedFromActiveLedger() {
  if (!activeLedger.value || apiUnavailable.value) return
  ledgerActionBusy.value = 'create'
  try {
    await publishLedgerAsShared(activeLedger.value.id, {
      name: sharedLedgerNameInput.value || activeLedger.value.name,
    })
    refreshSharedLedgerViewInBackground()
    uiStore.pushToast(t('settings_shared_ledgers.toast.created', '共同帳本已建立'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.create_failed', '建立共同帳本失敗'), 'error')
  } finally {
    ledgerActionBusy.value = ''
  }
}

async function shareCurrentLedgerLink() {
  if (!currentShareLink.value || apiUnavailable.value) return
  shareLinkBusy.value = 'share'
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: t('settings_shared_ledgers.share_link_title', '共同帳本邀請'),
        text: t('settings_shared_ledgers.share_link_share_text', '點擊連結即可加入我分享的共同帳本。'),
        url: currentShareLink.value,
      })
      uiStore.pushToast(t('settings_shared_ledgers.toast.link_shared', '已開啟共享連結分享'))
      return
    }
    await copyTextToClipboard(currentShareLink.value)
    uiStore.pushToast(t('settings_shared_ledgers.toast.link_copied', '共享連結已複製'))
  } catch (error) {
    if (String(error?.name ?? '').trim() === 'AbortError') {
      return
    }
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.link_share_failed', '分享共享連結失敗'), 'error')
  } finally {
    shareLinkBusy.value = ''
  }
}

async function copyCurrentLedgerLink() {
  if (!currentShareLink.value || apiUnavailable.value) return
  shareLinkBusy.value = 'copy'
  try {
    await copyTextToClipboard(currentShareLink.value)
    uiStore.pushToast(t('settings_shared_ledgers.toast.link_copied', '共享連結已複製'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.link_copy_failed', '複製共享連結失敗'), 'error')
  } finally {
    shareLinkBusy.value = ''
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

async function clearInviteCodeQueryFromRoute() {
  const nextQuery = { ...route.query }
  let changed = false
  for (const key of ['inviteCode', 'invite_code', 'code']) {
    if (Object.prototype.hasOwnProperty.call(nextQuery, key)) {
      delete nextQuery[key]
      changed = true
    }
  }
  if (!changed) return
  await router.replace({ path: route.path, query: nextQuery }).catch(() => {})
}

async function syncPendingInviteCodeFromRoute() {
  const rawInviteCode = route.query.inviteCode ?? route.query.invite_code ?? route.query.code
  if (rawInviteCode == null) return
  const normalizedInviteCode = rememberPendingSharedLedgerInviteCode(rawInviteCode)
  if (normalizedInviteCode) {
    pendingInviteLinkCode.value = normalizedInviteCode
    lastAutoJoinInviteCode.value = ''
  } else {
    pendingInviteLinkCode.value = ''
    clearPendingSharedLedgerInviteCode()
    uiStore.pushToast(t('settings_shared_ledgers.toast.invalid_link', '共享連結無效，請重新取得邀請連結'), 'error')
  }
  await clearInviteCodeQueryFromRoute()
}

function dismissPendingInviteLink() {
  pendingInviteLinkCode.value = ''
  lastAutoJoinInviteCode.value = ''
  clearPendingSharedLedgerInviteCode()
  void clearInviteCodeQueryFromRoute()
}

async function joinPendingInviteLink({ auto = false } = {}) {
  const inviteCode = String(pendingInviteLinkCode.value ?? '').trim()
  if (!inviteCode || !canJoinPendingInviteLink.value || inviteLinkJoining.value) return
  inviteLinkJoining.value = true
  try {
    const hadNoLedgers = ledgerStore.ledgers.length === 0
    const result = await joinSharedLedgerByLinkToLocal(inviteCode)
    await afterLedgerImported(result.ledgerId, hadNoLedgers)
    dismissPendingInviteLink()
    uiStore.pushToast(t('settings_shared_ledgers.toast.link_joined', '已透過共享連結加入共同帳本'))
  } catch (error) {
    if (!auto || String(error?.message ?? '').trim()) {
      uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.link_join_failed', '透過共享連結加入共同帳本失敗'), 'error')
    }
  } finally {
    inviteLinkJoining.value = false
  }
}

async function stopSharingActiveLedger() {
  if (!activeLedger.value || !activeLedgerMeta.value?.shared_ledger_id || apiUnavailable.value) return
  confirmDialog.value = {
    open: true,
    mode: 'active-unshare',
    title: t('settings_shared_ledgers.unshare', '取消共享'),
    message: t('settings_shared_ledgers.unshare_confirm', '取消共享後，這本帳本會保留在本機，但不再與共同帳本同步。是否繼續？'),
    confirmText: t('settings_shared_ledgers.unshare', '取消共享'),
    loadingText: t('settings_shared_ledgers.unsharing', '取消共享中...'),
    loading: false,
    item: null,
  }
}

async function removeRemoteLedger(item) {
  const sharedLedgerId = String(item?.id ?? '').trim()
  if (!sharedLedgerId || apiUnavailable.value) return
  confirmDialog.value = {
    open: true,
    mode: 'remote-unshare',
    title: getRemoteUnshareLabel(item),
    message: getRemoteUnshareConfirmMessage(item),
    confirmText: getRemoteUnshareLabel(item),
    loadingText: getRemoteUnshareBusyLabel(item),
    loading: false,
    item,
  }
}

function resetConfirmDialog() {
  confirmDialog.value = {
    open: false,
    mode: '',
    title: '',
    message: '',
    confirmText: '',
    loadingText: '',
    loading: false,
    item: null,
  }
}

function closeConfirmDialog() {
  if (confirmDialog.value.loading) return
  resetConfirmDialog()
}

async function confirmDialogAction() {
  if (!confirmDialog.value.open || confirmDialog.value.loading) return

  confirmDialog.value = {
    ...confirmDialog.value,
    loading: true,
  }

  try {
    if (confirmDialog.value.mode === 'active-unshare') {
      ledgerActionBusy.value = 'unlink'
      await stopSharingLocalLedger(activeLedger.value.id)
      resetConfirmDialog()
      ledgerActionBusy.value = ''
      remoteDeleteBusyId.value = ''
      refreshSharedLedgerViewInBackground()
      uiStore.pushToast(t('settings_shared_ledgers.toast.unshared', '已取消共享，帳本目前只保留本機'))
      return
    }

    if (confirmDialog.value.mode === 'remote-unshare') {
      const item = confirmDialog.value.item
      const sharedLedgerId = String(item?.id ?? '').trim()
      if (!sharedLedgerId) throw new Error('缺少共同帳本 ID')
      remoteDeleteBusyId.value = sharedLedgerId
      const binding = bindingMap.value[sharedLedgerId]
      const localLedgerIds = binding?.ledgerId ? [binding.ledgerId] : []
      await stopSharingRemoteSharedLedger(sharedLedgerId, { localLedgerIds })
      resetConfirmDialog()
      ledgerActionBusy.value = ''
      remoteDeleteBusyId.value = ''
      refreshSharedLedgerViewInBackground()
      uiStore.pushToast(
        String(item?.role ?? '').trim().toLowerCase() === 'owner'
          ? t('settings_shared_ledgers.toast.shared_deleted', '共享帳本已刪除')
          : t('settings_shared_ledgers.toast.shared_left', '已不再共享，帳本目前只保留本機'),
      )
      return
    }

    resetConfirmDialog()
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.unshare_failed', '取消共享失敗'), 'error')
    confirmDialog.value = {
      ...confirmDialog.value,
      loading: false,
    }
  } finally {
    ledgerActionBusy.value = ''
    remoteDeleteBusyId.value = ''
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

watch(
  () => [route.query.inviteCode, route.query.invite_code, route.query.code],
  () => {
    void syncPendingInviteCodeFromRoute()
  },
  { immediate: true },
)

watch(
  () => [pendingInviteLinkCode.value, canJoinPendingInviteLink.value],
  ([inviteCode, canJoin]) => {
    const normalizedInviteCode = String(inviteCode ?? '').trim()
    if (!normalizedInviteCode || !canJoin || inviteLinkJoining.value) return
    if (lastAutoJoinInviteCode.value === normalizedInviteCode) return
    lastAutoJoinInviteCode.value = normalizedInviteCode
    void joinPendingInviteLink({ auto: true })
  },
  { immediate: true },
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

.notice-box {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 12%, var(--card));
}

.section-head,
.action-row,
.remote-actions,
.info-row,
.share-link-box,
.share-link-actions {
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

.share-link-box {
  align-items: end;
}

.share-link-actions {
  align-items: stretch;
}

.link-code {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
  font-family: var(--font-mono, 'SFMono-Regular', Consolas, monospace);
  font-size: 13px;
  word-break: break-all;
}

.membership-lock {
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
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
  .share-link-box,
  .profile-row {
    flex-direction: column;
    align-items: stretch;
  }

  .avatar-wrap {
    align-self: flex-start;
  }
}
</style>
