<template>
  <div class="view-root">
    <section class="stack">
      <article class="card panel">
        <header class="row">
          <h2>{{ t('settings_shared_ledgers.title', '共同帳本') }}</h2>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </header>
        <p class="muted intro">
          {{ t('settings_shared_ledgers.desc', '登入後可把本機帳本同步成共同帳本，或使用邀請碼加入其他人的帳本。') }}
        </p>
        <p v-if="apiUnavailable" class="notice">
          {{ apiUnavailableMessage }}
        </p>
      </article>

      <article v-if="!sessionUser" class="card panel">
        <header class="section-head">
          <h3>{{ authMode === 'login' ? t('settings_shared_ledgers.login', '登入') : t('settings_shared_ledgers.register', '註冊') }}</h3>
          <div class="tab-row">
            <button type="button" class="tab-btn" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">
              {{ t('settings_shared_ledgers.login', '登入') }}
            </button>
            <button type="button" class="tab-btn" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">
              {{ t('settings_shared_ledgers.register', '註冊') }}
            </button>
          </div>
        </header>

        <div class="form-grid">
          <label class="field">
            {{ t('settings_shared_ledgers.account', '帳號') }}
            <input
              v-model.trim="authForm.account"
              class="input"
              type="text"
              maxlength="32"
              autocomplete="username"
              :placeholder="t('settings_shared_ledgers.account_placeholder', '例如：straw_user')"
              :disabled="authSubmitting || apiUnavailable"
            />
          </label>

          <label v-if="authMode === 'register'" class="field">
            {{ t('settings_shared_ledgers.display_name', '顯示名稱') }}
            <input
              v-model.trim="authForm.displayName"
              class="input"
              type="text"
              maxlength="32"
              autocomplete="nickname"
              :placeholder="t('settings_shared_ledgers.display_name_placeholder', '例如：小明')"
              :disabled="authSubmitting || apiUnavailable"
            />
          </label>

          <label class="field">
            {{ t('settings_shared_ledgers.password', '密碼') }}
            <input
              v-model="authForm.password"
              class="input"
              type="password"
              maxlength="64"
              autocomplete="current-password"
              :placeholder="t('settings_shared_ledgers.password_placeholder', '至少 8 碼')"
              :disabled="authSubmitting || apiUnavailable"
              @keyup.enter="submitAuth"
            />
          </label>
        </div>

        <button class="btn primary wide-btn" :disabled="authSubmitting || apiUnavailable || !canSubmitAuth" @click="submitAuth">
          {{
            authSubmitting
              ? t('settings_shared_ledgers.submitting', '處理中...')
              : authMode === 'login'
                ? t('settings_shared_ledgers.login', '登入')
                : t('settings_shared_ledgers.register', '註冊')
          }}
        </button>
      </article>

      <template v-else>
        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.account_info', '共同帳本帳號') }}</h3>
          </header>
          <div class="info-row">
            <div>
              <strong>{{ sessionUser.display_name || sessionUser.account }}</strong>
              <p class="muted compact">{{ sessionUser.account }}</p>
            </div>
            <button class="btn" :disabled="loggingOut || apiUnavailable" @click="handleLogout">
              {{ loggingOut ? t('settings_shared_ledgers.logging_out', '登出中...') : t('settings_shared_ledgers.logout', '登出') }}
            </button>
          </div>
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
              <div class="meta-grid">
                <div>
                  <span class="meta-label">{{ t('settings_shared_ledgers.invite_code', '邀請碼') }}</span>
                  <strong>{{ activeLedgerMeta.invite_code || '-' }}</strong>
                </div>
                <div>
                  <span class="meta-label">{{ t('settings_shared_ledgers.remote_version', '遠端版本') }}</span>
                  <strong>{{ activeLedgerMeta.version || 0 }}</strong>
                </div>
                <div>
                  <span class="meta-label">{{ t('settings_shared_ledgers.last_synced', '上次同步') }}</span>
                  <strong>{{ formatDateTime(activeLedgerMeta.last_synced_at) }}</strong>
                </div>
              </div>

              <label class="checkbox-row">
                <input :checked="activeLedgerMeta.auto_sync_enabled !== false" type="checkbox" @change="toggleAutoSync" />
                <span>{{ t('settings_shared_ledgers.auto_sync', '資料變更後自動同步') }}</span>
              </label>

              <div class="action-row">
                <button class="btn primary" :disabled="ledgerActionBusy || apiUnavailable" @click="pushActiveLedger">
                  {{ ledgerActionBusy === 'push' ? t('settings_shared_ledgers.pushing', '上傳中...') : t('settings_shared_ledgers.push_now', '立即上傳') }}
                </button>
                <button class="btn" :disabled="ledgerActionBusy || apiUnavailable" @click="pullActiveLedger">
                  {{ ledgerActionBusy === 'pull' ? t('settings_shared_ledgers.pulling', '下載中...') : t('settings_shared_ledgers.pull_now', '下載最新') }}
                </button>
              </div>
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
            {{ t('settings_shared_ledgers.no_active_ledger', '目前沒有本機帳本，可先用邀請碼加入共同帳本。') }}
          </p>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_shared_ledgers.join_title', '加入共同帳本') }}</h3>
          </header>
          <div class="join-row">
            <input
              v-model.trim="inviteCodeInput"
              class="input"
              type="text"
              maxlength="16"
              :placeholder="t('settings_shared_ledgers.invite_code_placeholder', '輸入邀請碼')"
              :disabled="joiningLedger || apiUnavailable"
              @keyup.enter="joinByInviteCode"
            />
            <button class="btn primary" :disabled="joiningLedger || apiUnavailable || !inviteCodeInput" @click="joinByInviteCode">
              {{ joiningLedger ? t('settings_shared_ledgers.joining', '加入中...') : t('settings_shared_ledgers.join', '加入') }}
            </button>
          </div>
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
                    {{ t('settings_shared_ledgers.invite_code', '邀請碼') }}：{{ item.invite_code || '-' }}
                  </p>
                  <p v-if="bindingMap[item.id]" class="muted compact">
                    {{ t('settings_shared_ledgers.local_binding', { name: bindingMap[item.id].ledgerName }, '已綁定本機帳本：{name}') }}
                  </p>
                </div>
                <div class="remote-actions">
                  <button class="btn" :disabled="remoteItemBusyId === item.id || apiUnavailable" @click="copyInviteCode(item.invite_code)">
                    {{ t('settings_shared_ledgers.copy_code', '複製邀請碼') }}
                  </button>
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
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  getSharedLedgerApiUnavailableMessage,
  isSharedLedgerApiConfigured,
  loginSharedLedgerAccount,
  logoutSharedLedgerAccount,
  refreshSharedLedgerSession,
  registerSharedLedgerAccount,
} from '@/services/shared-ledger/backend'
import {
  getSharedLedgerSessionUser,
  importRemoteSharedLedgerToLocal,
  joinSharedLedgerByInviteCode,
  listLocalSharedLedgerBindings,
  listRemoteSharedLedgers,
  publishLedgerAsShared,
  pullSharedLedgerToLocal,
  pushLocalLedgerToShared,
  setSharedLedgerAutoSyncEnabled,
} from '@/ui/services/shared-ledger.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const apiUnavailable = computed(() => !isSharedLedgerApiConfigured())
const apiUnavailableMessage = computed(() => getSharedLedgerApiUnavailableMessage())
const authMode = ref('login')
const authSubmitting = ref(false)
const loggingOut = ref(false)
const sessionUser = ref(getSharedLedgerSessionUser())
const authForm = ref({
  account: '',
  displayName: '',
  password: '',
})
const remoteLoading = ref(false)
const remoteLedgers = ref([])
const bindingMap = ref({})
const activeLedgerMeta = ref(null)
const sharedLedgerNameInput = ref('')
const ledgerActionBusy = ref('')
const inviteCodeInput = ref('')
const joiningLedger = ref(false)
const remoteItemBusyId = ref('')

const activeLedger = computed(() => ledgerStore.activeLedger)
const canSubmitAuth = computed(() => {
  if (!authForm.value.account || !authForm.value.password) return false
  if (authMode.value === 'register' && !authForm.value.displayName) return false
  return true
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
  if (!sessionUser.value || apiUnavailable.value) return
  remoteLoading.value = true
  try {
    remoteLedgers.value = await listRemoteSharedLedgers()
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
      sessionUser.value = session?.user ?? null
    } catch {
      sessionUser.value = null
    }
  }

  await refreshLocalBindings()
  if (sessionUser.value) {
    await loadRemoteLedgers()
  } else {
    remoteLedgers.value = []
  }
}

async function submitAuth() {
  if (!canSubmitAuth.value || apiUnavailable.value) return
  authSubmitting.value = true
  try {
    const payload = {
      account: authForm.value.account,
      displayName: authForm.value.displayName,
      password: authForm.value.password,
    }
    const session = authMode.value === 'login'
      ? await loginSharedLedgerAccount(payload)
      : await registerSharedLedgerAccount(payload)
    sessionUser.value = session.user
    authForm.value.password = ''
    uiStore.pushToast(
      authMode.value === 'login'
        ? t('settings_shared_ledgers.toast.login_done', '共同帳本登入成功')
        : t('settings_shared_ledgers.toast.register_done', '共同帳本註冊成功'),
    )
    await refreshSessionAndData()
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.auth_failed', '共同帳本登入失敗'), 'error')
  } finally {
    authSubmitting.value = false
  }
}

async function handleLogout() {
  loggingOut.value = true
  try {
    await logoutSharedLedgerAccount()
    sessionUser.value = null
    remoteLedgers.value = []
    uiStore.pushToast(t('settings_shared_ledgers.toast.logout_done', '已登出共同帳本帳號'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.logout_failed', '登出失敗'), 'error')
  } finally {
    loggingOut.value = false
  }
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

async function pushActiveLedger() {
  if (!activeLedger.value || apiUnavailable.value) return
  ledgerActionBusy.value = 'push'
  try {
    await pushLocalLedgerToShared(activeLedger.value.id)
    await refreshLocalBindings()
    await loadRemoteLedgers()
    uiStore.pushToast(t('settings_shared_ledgers.toast.push_done', '共同帳本已上傳'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.push_failed', '共同帳本上傳失敗'), 'error')
  } finally {
    ledgerActionBusy.value = ''
  }
}

async function pullActiveLedger() {
  if (!activeLedger.value || apiUnavailable.value) return
  ledgerActionBusy.value = 'pull'
  try {
    const hadNoLedgers = ledgerStore.ledgers.length === 0
    const result = await pullSharedLedgerToLocal(activeLedger.value.id)
    await afterLedgerImported(result.ledgerId, hadNoLedgers)
    uiStore.pushToast(t('settings_shared_ledgers.toast.pull_done', '共同帳本已下載到本機'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.pull_failed', '共同帳本下載失敗'), 'error')
  } finally {
    ledgerActionBusy.value = ''
  }
}

async function joinByInviteCode() {
  if (!inviteCodeInput.value || apiUnavailable.value) return
  joiningLedger.value = true
  try {
    const hadNoLedgers = ledgerStore.ledgers.length === 0
    const result = await joinSharedLedgerByInviteCode(inviteCodeInput.value)
    inviteCodeInput.value = ''
    await afterLedgerImported(result.ledgerId, hadNoLedgers)
    uiStore.pushToast(t('settings_shared_ledgers.toast.join_done', '已加入共同帳本'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_shared_ledgers.toast.join_failed', '加入共同帳本失敗'), 'error')
  } finally {
    joiningLedger.value = false
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

async function copyInviteCode(inviteCode) {
  const text = String(inviteCode ?? '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    uiStore.pushToast(t('settings_shared_ledgers.toast.code_copied', '邀請碼已複製'))
  } catch {
    uiStore.pushToast(t('settings_shared_ledgers.toast.copy_failed', '複製邀請碼失敗'), 'error')
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

onMounted(() => {
  void refreshSessionAndData()
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
.tab-row,
.action-row,
.remote-actions,
.join-row,
.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.tab-btn {
  border: 1px solid var(--line, var(--field-border));
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--primary) 18%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 50%, var(--line, var(--field-border)));
}

.form-grid,
.stack,
.internal-stack,
.info-block {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.wide-btn {
  width: 100%;
}

.meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.meta-grid > div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
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

.remote-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.remote-item {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
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
  .join-row,
  .info-row,
  .remote-main {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
