<template>
  <HabitatPageShell
    :title="t('settings.title')"
    :kicker="t('settings_page.habitat_hello')"
    test-id="settings-view"
    hello-test-id="settings-hello-block"
    stack-class="settings-page"
  >
    <HabitatSection :title="t('settings_page.section_account')">
      <HabitatListGroup>
        <HabitatRow
          to="/settings/account"
          class="settings-account-row"
          test-id="settings-account-card"
          interactive
        >
          <div class="account-avatar">
            <img v-if="sessionUser?.avatar_url" :src="sessionUser.avatar_url" alt="avatar" class="avatar-img" />
            <span v-else>{{ avatarLabel }}</span>
          </div>
          <div class="account-main">
            <strong>{{ accountCardTitle }}</strong>
            <small class="muted">{{ accountCardHint }}</small>
          </div>
          <font-awesome-icon icon="fa-solid fa-chevron-right" class="row-chevron" aria-hidden="true" />
        </HabitatRow>
      </HabitatListGroup>
    </HabitatSection>

    <HabitatSection
      v-for="group in settingGroups"
      :key="group.titleKey"
      :title="t(group.titleKey)"
    >
      <HabitatListGroup>
        <HabitatRow
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="settings-nav-row"
          interactive
        >
          <font-awesome-icon :icon="item.icon" class="item-icon" />
          <span class="item-copy">
            <span>{{ t(item.labelKey) }}</span>
            <small class="muted">{{ t(item.descKey) }}</small>
          </span>
          <font-awesome-icon icon="fa-solid fa-chevron-right" class="row-chevron" aria-hidden="true" />
        </HabitatRow>
      </HabitatListGroup>
    </HabitatSection>
  </HabitatPageShell>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import HabitatSection from '@/ui/components/layout/habitat/HabitatSection.vue'
import HabitatListGroup from '@/ui/components/layout/habitat/HabitatListGroup.vue'
import HabitatRow from '@/ui/components/layout/habitat/HabitatRow.vue'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getSharedLedgerAuthStatus,
  getSharedLedgerSession,
  refreshSharedLedgerSession,
  subscribeSharedLedgerSession,
} from '@/services/shared-ledger/backend'

const { t } = useI18n()
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const sessionRestoring = ref(Boolean(getSharedLedgerAuthStatus().restoring))
const sessionNeedsReauth = ref(Boolean(getSharedLedgerAuthStatus().needsReauth))
const showAdminEntry = computed(() => Boolean(sessionUser.value?.is_admin))
const accountCardTitle = computed(() => {
  if (sessionUser.value?.display_name) return sessionUser.value.display_name
  if (sessionRestoring.value) return t('settings_account.session_restoring', 'Session 恢復中')
  if (sessionNeedsReauth.value) return t('settings_account.session_needs_relogin', '需重新登入')
  return t('settings_account.login_register')
})
const accountCardHint = computed(() => {
  if (sessionUser.value?.email) return sessionUser.value.email
  if (sessionRestoring.value) {
    return t('settings_account.session_restoring_hint', '正在恢復登入狀態，完成後會自動繼續同步。')
  }
  if (sessionNeedsReauth.value) {
    return t('settings_account.session_needs_relogin_hint', '登入狀態已過期，已保留帳號資料。請重新登入後再繼續使用會員功能。')
  }
  return t('settings_account.login_hint')
})

function syncAccountCardFromAuth(session = getSharedLedgerSession()) {
  const status = getSharedLedgerAuthStatus()
  sessionUser.value = session?.user ?? status.user ?? null
  sessionRestoring.value = Boolean(status.restoring)
  sessionNeedsReauth.value = Boolean(status.needsReauth)
}

const settingGroups = computed(() => [
  {
    titleKey: 'settings_page.section_bookkeeping',
    items: [
      { to: '/settings/ledgers', labelKey: 'settings.ledger_management', descKey: 'settings.desc.ledger_management', icon: 'fa-solid fa-book' },
      { to: '/settings/categories', labelKey: 'settings.category_management', descKey: 'settings.desc.category_management', icon: 'fa-solid fa-tags' },
      { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', descKey: 'settings.desc.addon_templates', icon: 'fa-solid fa-receipt' },
      { to: '/settings/auto-fill-rules', labelKey: 'settings.auto_fill_rules', descKey: 'settings.desc.auto_fill_rules', icon: 'fa-solid fa-wand-magic-sparkles' },
      { to: '/settings/exchange-rate', labelKey: 'settings.exchange_rate', descKey: 'settings.desc.exchange_rate', icon: 'fa-solid fa-arrow-right-arrow-left' },
    ],
  },
  {
    titleKey: 'settings_page.section_data',
    items: [
      { to: '/settings/data-management', labelKey: 'settings.data_management', descKey: 'settings.desc.data_management', icon: 'fa-solid fa-database' },
      { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', descKey: 'settings.desc.auto_backup', icon: 'fa-solid fa-cloud-arrow-up' },
    ],
  },
  {
    titleKey: 'settings_page.section_app',
    items: [
      { to: '/settings/language', labelKey: 'settings.language', descKey: 'settings.desc.language', icon: 'fa-solid fa-language' },
      { to: '/settings/personalization', labelKey: 'settings.personalization', descKey: 'settings.desc.personalization', icon: 'fa-solid fa-palette' },
      { to: '/settings/security', labelKey: 'settings.security_lock', descKey: 'settings.desc.security_lock', icon: 'fa-solid fa-shield-halved' },
      { to: '/settings/bookkeeping-reminder', labelKey: 'settings.bookkeeping_reminder', descKey: 'settings.desc.bookkeeping_reminder', icon: 'fa-solid fa-calendar-days' },
    ],
  },
  {
    titleKey: 'settings_page.section_about',
    items: [
      { to: '/settings/membership-benefits', labelKey: 'settings.membership_benefits', descKey: 'settings.desc.membership_benefits', icon: 'fa-solid fa-money-check-dollar' },
      ...(showAdminEntry.value ? [{ to: '/settings/admin', labelKey: 'settings.admin_console', descKey: 'settings.desc.admin_console', icon: 'fa-solid fa-users' }] : []),
      { to: '/settings/about', labelKey: 'settings.about_us', descKey: 'settings.desc.about_us', icon: 'fa-solid fa-users' },
      { to: '/settings/version-info', labelKey: 'settings.version_info', descKey: 'settings.desc.version_info', icon: 'fa-solid fa-circle-info' },
    ],
  },
])

const avatarLabel = computed(() => {
  const base = String(sessionUser.value?.display_name || sessionUser.value?.email || '?').trim()
  return base.slice(0, 1).toUpperCase()
})

let unsubscribeSession = null

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    syncAccountCardFromAuth(session)
  })
  void refreshSharedLedgerSession()
    .then((session) => {
      syncAccountCardFromAuth(session ?? getSharedLedgerSession())
    })
    .catch(() => {
      syncAccountCardFromAuth(getSharedLedgerSession())
    })
})

onUnmounted(() => {
  if (typeof unsubscribeSession === 'function') {
    unsubscribeSession()
  }
})
</script>

<style scoped>
.settings-account-row {
  align-items: flex-start;
}

.account-avatar {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  overflow: hidden;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 76%, #fff 24%), #1b8f6a);
  color: #fff;
  font-size: 18px;
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
  font-size: 12px;
  line-height: 1.35;
}

.settings-nav-row {
  align-items: flex-start;
}

.item-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.item-copy > span:first-child {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 650;
}

.item-copy small {
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
}

.item-icon {
  width: 18px;
  flex-shrink: 0;
  color: var(--muted);
  margin-top: 3px;
}

.row-chevron {
  color: var(--muted);
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 4px;
}
</style>
