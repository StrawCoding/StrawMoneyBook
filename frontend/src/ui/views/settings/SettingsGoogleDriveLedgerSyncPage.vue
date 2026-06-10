<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-arrow-right-arrow-left" class="title-icon" />{{ t('settings_google_sync.title', '帳本同步') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel" :class="{ working: !!googleLedgerSyncBusyId }">
      <p class="muted">
        {{
          t(
            'settings_google_sync.desc',
            '和備份不同，這裡只同步你勾選的帳本；資料變動後會即時更新到 Google Drive appDataFolder，並在其他裝置拉回最新版本。',
          )
        }}
      </p>
      <p class="muted compact">
        {{
          t(
            'settings_google_sync.account_hint',
            { email: googleSyncAccountLabel },
            '目前 Google 帳號：{email}',
          )
        }}
      </p>

      <div v-if="!hasGoogleLedgerSyncMembershipAccess" class="member-only-lock">
        <strong>{{ t('settings_google_sync.member_only', '帳本同步僅限會員使用') }}</strong>
        <p class="muted compact">
          {{
            t(
              'settings_google_sync.member_only_desc',
              '可選擇指定帳本在不同裝置間即時同步；啟用會員後才能開啟與背景同步。',
            )
          }}
        </p>
        <RouterLink class="btn" to="/settings/membership-benefits">
          {{ t('settings_google_sync.view_membership', '查看會員權益') }}
        </RouterLink>
      </div>

      <ul v-else-if="googleLedgerSyncBindings.length" class="sync-ledger-list">
        <li v-for="item in googleLedgerSyncBindings" :key="item.ledgerId" class="sync-ledger-item">
          <div class="sync-ledger-main">
            <div class="stack internal-stack">
              <strong>{{ item.ledgerName }}</strong>
              <p class="muted compact">
                {{
                  item.state.enabled
                    ? t(
                      'settings_google_sync.last_synced',
                      { time: formatDateTime(item.state.lastSyncedAt) },
                      '上次同步：{time}',
                    )
                    : t('settings_google_sync.disabled', '尚未啟用同步')
                }}
              </p>
              <p v-if="item.state.lastError" class="muted compact">
                {{
                  t(
                    'settings_google_sync.last_error',
                    { error: item.state.lastError },
                    '最近錯誤：{error}',
                  )
                }}
              </p>
              <p v-if="item.state.lastConflictCount > 0" class="conflict-hint compact">
                {{
                  t(
                    'settings_google_sync.conflict_warning',
                    { count: item.state.lastConflictCount },
                    '上次同步有 {count} 筆衝突已自動合併（採較新變更）',
                  )
                }}
              </p>
            </div>

            <div class="sync-ledger-actions">
              <label class="check-row">
                <input
                  type="checkbox"
                  :checked="item.state.enabled"
                  :disabled="googleLedgerSyncBusyId === item.ledgerId"
                  @change="toggleGoogleLedgerSync(item, $event)"
                />
                <span>{{ t('settings_google_sync.enable', '啟用同步') }}</span>
              </label>
              <button
                class="btn"
                :disabled="googleLedgerSyncBusyId === item.ledgerId || !item.state.enabled"
                @click="syncGoogleLedgerItem(item)"
              >
                {{
                  googleLedgerSyncBusyId === item.ledgerId
                    ? t('settings_google_sync.syncing', '同步中...')
                    : t('settings_google_sync.sync_now', '立即同步')
                }}
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p v-else class="muted compact">
        {{ t('settings_google_sync.empty', '目前沒有可同步的帳本。') }}
      </p>
    </article>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMembershipTierSnapshot, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import {
  listGoogleDriveLedgerSyncBindings,
  setGoogleDriveLedgerSyncEnabled,
  setGoogleDriveLedgerSyncState,
  syncGoogleDriveLedgerNow,
} from '@/ui/services/google-drive-ledger-sync.service'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const googleLedgerSyncBindings = ref([])
const googleLedgerSyncBusyId = ref('')
const membershipTier = ref(getMembershipTierSnapshot())

const hasGoogleLedgerSyncMembershipAccess = computed(() => membershipTier.value === 'member')
const googleSyncAccountLabel = computed(() => {
  const connectedBinding = googleLedgerSyncBindings.value.find((item) => item.state.accountEmail)
  return connectedBinding?.state?.accountEmail || '-'
})

function formatDateTime(isoText) {
  if (!isoText) return '-'
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(locale.value || 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function errorMessage(error, fallback) {
  if (typeof error === 'string' && error.trim()) return error.trim()

  const pick = (...values) => {
    for (const value of values) {
      const text = String(value ?? '').trim()
      if (text) return text
    }
    return ''
  }

  const baseMessage = pick(
    error?.message,
    error?.error_description,
    error?.errorDescription,
    error?.errorMessage,
    error?.details,
    error?.error,
    error?.cause?.message,
    error?.data?.message,
    error?.response?.data?.message,
  )
  if (baseMessage) return baseMessage

  const code = pick(error?.code, error?.errorCode, error?.status, error?.errorNumber)
  if (code) return `${fallback} (code=${code})`
  return fallback
}

async function refreshGoogleLedgerSyncBindings() {
  googleLedgerSyncBindings.value = await listGoogleDriveLedgerSyncBindings(ledgerStore.ledgers)
}

function updateGoogleLedgerSyncBindingState(ledgerId, nextState) {
  googleLedgerSyncBindings.value = googleLedgerSyncBindings.value.map((item) => (
    String(item.ledgerId) === String(ledgerId)
      ? {
          ...item,
          state: nextState,
        }
      : item
  ))
}

async function toggleGoogleLedgerSync(item, event) {
  if (!hasGoogleLedgerSyncMembershipAccess.value) {
    uiStore.pushToast(t('settings_google_sync.member_only', '帳本同步僅限會員使用'), 'error')
    return
  }
  const ledgerId = String(item?.ledgerId ?? '').trim()
  if (!ledgerId) return
  const enabled = Boolean(event?.target?.checked)
  const isActiveLedger = ledgerId === String(ledgerStore.activeLedgerId ?? '').trim()
  googleLedgerSyncBusyId.value = ledgerId
  try {
    const nextState = await setGoogleDriveLedgerSyncEnabled(ledgerId, enabled, {
      interactiveAuth: enabled,
    })
    if (isActiveLedger) {
      await ledgerStore.reloadActiveLedger()
    } else {
      await ledgerStore.refresh()
    }
    updateGoogleLedgerSyncBindingState(ledgerId, nextState)
    await refreshGoogleLedgerSyncBindings()
    uiStore.pushToast(
      enabled
        ? t('settings_google_sync.toast.enabled', '帳本同步已啟用')
        : t('settings_google_sync.toast.disabled', '帳本同步已停用'),
    )
  } catch (error) {
    if (error?.code === 'GOOGLE_ACCOUNT_SWITCHED') {
      const confirmed = window.confirm(
        t(
          'settings_google_sync.confirm.switch_account',
          { bound: error.boundEmail, current: error.currentEmail },
          `Google 帳號已切換為 ${error.currentEmail}，是否改綁定此帳號並重新同步？`,
        ),
      )
      if (confirmed) {
        await setGoogleDriveLedgerSyncState(ledgerId, { accountEmail: error.currentEmail })
        return toggleGoogleLedgerSync(item, event)
      }
    }
    await refreshGoogleLedgerSyncBindings()
    uiStore.pushToast(errorMessage(error, t('settings_google_sync.toast.toggle_failed', '更新帳本同步失敗')), 'error')
  } finally {
    googleLedgerSyncBusyId.value = ''
  }
}

async function syncGoogleLedgerItem(item) {
  if (!hasGoogleLedgerSyncMembershipAccess.value) {
    uiStore.pushToast(t('settings_google_sync.member_only', '帳本同步僅限會員使用'), 'error')
    return
  }
  const ledgerId = String(item?.ledgerId ?? '').trim()
  if (!ledgerId) return
  googleLedgerSyncBusyId.value = ledgerId
  try {
    const result = await syncGoogleDriveLedgerNow(ledgerId, { interactiveAuth: true })
    updateGoogleLedgerSyncBindingState(ledgerId, result.state)
    if (result.action === 'pull') {
      if (ledgerId === String(ledgerStore.activeLedgerId ?? '').trim()) {
        await ledgerStore.reloadActiveLedger()
      } else {
        await ledgerStore.refresh()
      }
      await refreshGoogleLedgerSyncBindings()
      if (result.hasConflicts) {
        uiStore.pushToast(
          t(
            'settings_google_sync.toast.merged_with_conflicts',
            { count: result.conflictCount ?? result.state?.lastConflictCount ?? 0 },
            '已合併同步，{count} 筆衝突已採較新變更',
          ),
          'warning',
        )
      } else if (result.mergeMode === 'two_way') {
        uiStore.pushToast(t('settings_google_sync.toast.pulled_merged', '已合併本機與遠端變更並同步'))
      } else {
        uiStore.pushToast(t('settings_google_sync.toast.pulled', '已從 Google Drive 拉回最新帳本'))
      }
      return
    }
    if (result.action === 'push') {
      uiStore.pushToast(t('settings_google_sync.toast.pushed', '已將帳本更新到 Google Drive'))
      return
    }
    uiStore.pushToast(t('settings_google_sync.toast.up_to_date', '帳本已是最新狀態'))
  } catch (error) {
    if (error?.code === 'GOOGLE_ACCOUNT_SWITCHED') {
      const confirmed = window.confirm(
        t(
          'settings_google_sync.confirm.switch_account',
          { bound: error.boundEmail, current: error.currentEmail },
          `Google 帳號已切換為 ${error.currentEmail}，是否改綁定此帳號並重新同步？`,
        ),
      )
      if (confirmed) {
        await setGoogleDriveLedgerSyncState(ledgerId, { accountEmail: error.currentEmail })
        return syncGoogleLedgerItem(item)
      }
    }
    await refreshGoogleLedgerSyncBindings()
    uiStore.pushToast(errorMessage(error, t('settings_google_sync.toast.sync_failed', '帳本同步失敗')), 'error')
  } finally {
    googleLedgerSyncBusyId.value = ''
  }
}

let unsubscribeMembership = null

onMounted(() => {
  unsubscribeMembership = subscribeMembershipSnapshot((next) => {
    membershipTier.value = String(next?.tier ?? getMembershipTierSnapshot())
  }, { emitCurrent: true })
  void refreshGoogleLedgerSyncBindings()
})

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') {
    unsubscribeMembership()
    unsubscribeMembership = null
  }
})

watch(
  () => [ledgerStore.activeLedgerId, ledgerStore.ledgers.length],
  () => {
    void refreshGoogleLedgerSyncBindings()
  },
)
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
  position: relative;
  overflow: hidden;
}
.panel::after {
  content: '';
  position: absolute;
  inset: -40%;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 40%,
    color-mix(in srgb, var(--primary) 8%, transparent) 50%,
    transparent 60%
  );
  transform: translateX(-120%);
}
.panel.working::after {
  animation: panel-sweep 1.45s linear infinite;
}
.page-head {
  align-items: center;
  justify-content: space-between;
}
.sync-ledger-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.sync-ledger-item {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 92%, var(--primary) 8%);
}
.sync-ledger-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.sync-ledger-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.member-only-lock {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--warning, #f59e0b) 10%, var(--card) 90%);
}
h2,
h3 {
  margin: 0;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}
.compact {
  margin: 0;
}
.conflict-hint {
  color: color-mix(in srgb, var(--warning, #f59e0b) 85%, var(--text) 15%);
}
@keyframes panel-sweep {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}
</style>
