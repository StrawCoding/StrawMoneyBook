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
        <span>{{ t(item.labelKey) }}</span>
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
const settingGroups = computed(() => [
  [
    { to: '/settings/ledgers', labelKey: 'settings.ledger_management', icon: 'fa-solid fa-book' },
    { to: '/settings/shared-ledgers', labelKey: '共同帳本', icon: 'fa-solid fa-users' },
    { to: '/settings/categories', labelKey: 'settings.category_management', icon: 'fa-solid fa-tags' },
    { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', icon: 'fa-solid fa-receipt' },
    { to: '/settings/auto-fill-rules', labelKey: 'settings.auto_fill_rules', icon: 'fa-solid fa-wand-magic-sparkles' },
    { to: '/settings/exchange-rate', labelKey: 'settings.exchange_rate', icon: 'fa-solid fa-arrow-right-arrow-left' },
  ],
  [
    { to: '/settings/data-management', labelKey: 'settings.data_management', icon: 'fa-solid fa-database' },
    { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', icon: 'fa-solid fa-cloud-arrow-up' },
    ...(showBankSyncEntry ? [{ to: '/settings/bank-sync', labelKey: 'settings.bank_sync', icon: 'fa-solid fa-building-columns' }] : []),
  ],
  [
    { to: '/settings/language', labelKey: 'settings.language', icon: 'fa-solid fa-language' },
    { to: '/settings/personalization', labelKey: 'settings.personalization', icon: 'fa-solid fa-palette' },
    { to: '/settings/security', labelKey: 'settings.security_lock', icon: 'fa-solid fa-shield-halved' },
  ],
  [
    { to: '/settings/membership-benefits', labelKey: 'settings.membership_benefits', icon: 'fa-solid fa-money-check-dollar' },
    { to: '/settings/about', labelKey: 'settings.about_us', icon: 'fa-solid fa-users' },
    { to: '/settings/version-info', labelKey: 'settings.version_info', icon: 'fa-solid fa-circle-info' },
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
