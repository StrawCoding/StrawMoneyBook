<template>
  <section class="stack">
    <h2>{{ t('settings.title') }}</h2>

    <RouterLink class="card panel account-card" to="/settings/account">
      <div class="account-avatar">
        <img v-if="sessionUser?.avatar_url" :src="sessionUser.avatar_url" alt="avatar" class="avatar-img" />
        <span v-else>{{ avatarLabel }}</span>
      </div>
      <div class="account-main">
        <strong>{{ sessionUser?.display_name || t('settings_account.login_register') }}</strong>
        <small class="muted">{{ sessionUser?.email || t('settings_account.login_hint') }}</small>
      </div>
      <font-awesome-icon icon="fa-solid fa-chevron-down" class="account-arrow" />
    </RouterLink>

    <article v-for="(group, groupIndex) in settingGroups" :key="groupIndex" class="card panel setting-group">
      <RouterLink v-for="item in group" :key="item.to" class="item-link" :to="item.to">
        <font-awesome-icon :icon="item.icon" class="item-icon" />
        <span class="item-copy">
          <span>{{ t(item.labelKey) }}</span>
          <small class="muted">{{ t(item.descKey) }}</small>
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
    { to: '/settings/ledgers', labelKey: 'settings.ledger_management', descKey: 'settings.desc.ledger_management', icon: 'fa-solid fa-book' },
    { to: '/settings/shared-ledgers', labelKey: 'settings.shared_ledgers', descKey: 'settings.desc.shared_ledgers', icon: 'fa-solid fa-users' },
    { to: '/settings/categories', labelKey: 'settings.category_management', descKey: 'settings.desc.category_management', icon: 'fa-solid fa-tags' },
    { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', descKey: 'settings.desc.addon_templates', icon: 'fa-solid fa-receipt' },
    { to: '/settings/auto-fill-rules', labelKey: 'settings.auto_fill_rules', descKey: 'settings.desc.auto_fill_rules', icon: 'fa-solid fa-wand-magic-sparkles' },
    { to: '/settings/exchange-rate', labelKey: 'settings.exchange_rate', descKey: 'settings.desc.exchange_rate', icon: 'fa-solid fa-arrow-right-arrow-left' },
  ],
  [
    { to: '/settings/data-management', labelKey: 'settings.data_management', descKey: 'settings.desc.data_management', icon: 'fa-solid fa-database' },
    { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', descKey: 'settings.desc.auto_backup', icon: 'fa-solid fa-cloud-arrow-up' },
    { to: '/settings/google-drive-ledger-sync', labelKey: 'settings.google_drive_ledger_sync', descKey: 'settings.desc.google_drive_ledger_sync', icon: 'fa-solid fa-arrow-right-arrow-left' },
    ...(showBankSyncEntry ? [{ to: '/settings/bank-sync', labelKey: 'settings.bank_sync', descKey: 'settings.desc.bank_sync', icon: 'fa-solid fa-building-columns' }] : []),
    { to: '/settings/carrier-sync', labelKey: 'settings.carrier_sync', descKey: 'settings.desc.carrier_sync', icon: 'fa-solid fa-receipt' },
  ],
  [
    { to: '/settings/language', labelKey: 'settings.language', descKey: 'settings.desc.language', icon: 'fa-solid fa-language' },
    { to: '/settings/personalization', labelKey: 'settings.personalization', descKey: 'settings.desc.personalization', icon: 'fa-solid fa-palette' },
    { to: '/settings/security', labelKey: 'settings.security_lock', descKey: 'settings.desc.security_lock', icon: 'fa-solid fa-shield-halved' },
    { to: '/settings/bookkeeping-reminder', labelKey: 'settings.bookkeeping_reminder', descKey: 'settings.desc.bookkeeping_reminder', icon: 'fa-solid fa-calendar-days' },
  ],
  [
    { to: '/settings/membership-benefits', labelKey: 'settings.membership_benefits', descKey: 'settings.desc.membership_benefits', icon: 'fa-solid fa-money-check-dollar' },
    ...(showAdminEntry.value ? [{ to: '/settings/admin', labelKey: 'settings.admin_console', descKey: 'settings.desc.admin_console', icon: 'fa-solid fa-users' }] : []),
    { to: '/settings/about', labelKey: 'settings.about_us', descKey: 'settings.desc.about_us', icon: 'fa-solid fa-users' },
    { to: '/settings/version-info', labelKey: 'settings.version_info', descKey: 'settings.desc.version_info', icon: 'fa-solid fa-circle-info' },
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
