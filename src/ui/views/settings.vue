<template>
  <section class="stack">
    <h2>{{ t('settings.title') }}</h2>

    <article v-for="(group, groupIndex) in settingGroups" :key="groupIndex" class="card panel setting-group">
      <RouterLink v-for="item in group" :key="item.to" class="item-link" :to="item.to">
        <font-awesome-icon :icon="item.icon" class="item-icon" />
        <span>{{ t(item.labelKey) }}</span>
      </RouterLink>
    </article>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const settingGroups = [
  [
    { to: '/settings/ledgers', labelKey: 'settings.ledger_management', icon: 'fa-solid fa-book' },
    { to: '/settings/categories', labelKey: 'settings.category_management', icon: 'fa-solid fa-tags' },
    { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', icon: 'fa-solid fa-receipt' },
    { to: '/settings/exchange-rate', labelKey: 'settings.exchange_rate', icon: 'fa-solid fa-arrow-right-arrow-left' },
  ],
  [
    { to: '/settings/data-management', labelKey: 'settings.data_management', icon: 'fa-solid fa-database' },
    { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', icon: 'fa-solid fa-cloud-arrow-up' },
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
]
</script>

<style scoped>
.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 24px
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
