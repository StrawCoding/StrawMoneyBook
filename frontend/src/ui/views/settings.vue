<template>
  <section class="stack">
    <h2>{{ t('settings.title') }}</h2>

    <RouterLink class="card panel account-card" to="/settings/account">
      <div class="account-avatar">
        <img v-if="sessionUser?.avatar_url" :src="sessionUser.avatar_url" alt="avatar" class="avatar-img" />
        <span v-else>{{ avatarLabel }}</span>
      </div>
      <div class="account-main">
        <strong>{{ sessionUser?.display_name || t('settings_account.login_register', '登入 / 註冊') }}</strong>
        <small class="muted">{{ sessionUser?.email || t('settings_account.login_hint', '點擊登入後即可同步共享帳本與啟用邀請碼') }}</small>
      </div>
      <font-awesome-icon icon="fa-solid fa-chevron-down" class="account-arrow" />
    </RouterLink>

    <article v-for="(group, groupIndex) in settingGroups" :key="groupIndex" class="card panel setting-group">
      <RouterLink v-for="item in group" :key="item.to" class="item-link" :to="item.to">
        <font-awesome-icon :icon="item.icon" class="item-icon" />
        <span class="item-copy">
          <span>{{ t(item.labelKey) }}</span>
          <small class="muted">{{ item.desc }}</small>
        </span>
      </RouterLink>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { isBankSyncFeatureEnabled } from '@/services/bank-sync/backend'
import { getSharedLedgerSession, refreshSharedLedgerSession, subscribeSharedLedgerSession } from '@/services/shared-ledger/backend'

const { t } = useI18n()
const showBankSyncEntry = isBankSyncFeatureEnabled()
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const showAdminEntry = computed(() => Boolean(sessionUser.value?.is_admin))
const settingGroups = computed(() => [
  [
    { to: '/settings/ledgers', labelKey: 'settings.ledger_management', icon: 'fa-solid fa-book', desc: '切換、排序與整理目前使用的帳本。' },
    { to: '/settings/shared-ledgers', labelKey: '共同帳本', icon: 'fa-solid fa-users', desc: '邀請成員、接受共享與同步共同帳本。' },
    { to: '/settings/categories', labelKey: 'settings.category_management', icon: 'fa-solid fa-tags', desc: '管理收入、支出分類與群組排序。' },
    { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', icon: 'fa-solid fa-receipt', desc: '建立常用附加項目，快速套用到交易。' },
    { to: '/settings/auto-fill-rules', labelKey: 'settings.auto_fill_rules', icon: 'fa-solid fa-wand-magic-sparkles', desc: '依關鍵字自動帶入分類、帳戶與欄位。' },
    { to: '/settings/exchange-rate', labelKey: 'settings.exchange_rate', icon: 'fa-solid fa-arrow-right-arrow-left', desc: '同步匯率並檢查跨幣別換算結果。' },
  ],
  [
    { to: '/settings/data-management', labelKey: 'settings.data_management', icon: 'fa-solid fa-database', desc: '匯入、匯出、重設備份與資料修復。' },
    { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', icon: 'fa-solid fa-cloud-arrow-up', desc: '設定 Google Drive 或 WebDAV 自動備份。' },
    { to: '/settings/google-drive-ledger-sync', labelKey: 'settings.google_drive_ledger_sync', icon: 'fa-solid fa-arrow-right-arrow-left', desc: '跨裝置同步單一帳本的最新資料。' },
    ...(showBankSyncEntry ? [{ to: '/settings/bank-sync', labelKey: 'settings.bank_sync', icon: 'fa-solid fa-building-columns', desc: '管理銀行連線、同步規則與待匯入交易。' }] : []),
    { to: '/settings/invoice-carrier', labelKey: '電子發票載具（實驗性）', icon: 'fa-solid fa-file-invoice', desc: '連接載具、重新驗證並同步發票資料。' },
  ],
  [
    { to: '/settings/language', labelKey: 'settings.language', icon: 'fa-solid fa-language', desc: '切換介面語言與顯示用字。' },
    { to: '/settings/personalization', labelKey: 'settings.personalization', icon: 'fa-solid fa-palette', desc: '調整主題、字體比例與個人化外觀。' },
    { to: '/settings/security', labelKey: 'settings.security_lock', icon: 'fa-solid fa-shield-halved', desc: '設定安全鎖與回到前景時的保護。' },
    { to: '/settings/bookkeeping-reminder', labelKey: 'settings.bookkeeping_reminder', icon: 'fa-solid fa-calendar-days', desc: '安排每日提醒與檢查通知權限。' },
  ],
  [
    { to: '/settings/membership-benefits', labelKey: 'settings.membership_benefits', icon: 'fa-solid fa-money-check-dollar', desc: '查看會員功能、方案差異與權益狀態。' },
    ...(showAdminEntry.value ? [{ to: '/settings/admin', labelKey: 'settings.admin_console', icon: 'fa-solid fa-users', desc: '檢視後台統計、會員與錯誤紀錄。' }] : []),
    { to: '/settings/about', labelKey: 'settings.about_us', icon: 'fa-solid fa-users', desc: '查看官網、社群、聯絡方式與隱私資訊。' },
    { to: '/settings/version-info', labelKey: 'settings.version_info', icon: 'fa-solid fa-circle-info', desc: '確認目前版本、更新紀錄與除錯資訊入口。' },
  ],
])
const avatarLabel = computed(() => {
  const base = String(sessionUser.value?.display_name || sessionUser.value?.email || '?').trim()
  return base.slice(0, 1).toUpperCase()
})

let unsubscribeSession = null

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? null
  })
  void refreshSharedLedgerSession()
    .then((session) => {
      sessionUser.value = session?.user ?? getSharedLedgerSession()?.user ?? null
    })
    .catch(() => {
      sessionUser.value = getSharedLedgerSession()?.user ?? null
    })
})

onUnmounted(() => {
  if (typeof unsubscribeSession === 'function') {
    unsubscribeSession()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 24px
}
.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
}
.account-avatar {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  overflow: hidden;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 76%, #fff 24%), #1b8f6a);
  color: #fff;
  font-size: 20px;
  font-weight: 800;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.account-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.account-main small {
  white-space: normal;
}
.account-arrow {
  color: var(--muted);
  transform: rotate(-90deg);
}
.setting-group {
  display: grid;
  gap: 0
}
.item-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  text-decoration: none;
  color: var(--text);
  font-weight: 700
}
.item-copy {
  display: grid;
  gap: 2px;
}
.item-copy small {
  font-weight: 500;
  line-height: 1.35;
}
.item-link + .item-link {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line, var(--field-border))
}
.item-icon {
  width: 18px;
  color: var(--text-muted)
}
</style>
