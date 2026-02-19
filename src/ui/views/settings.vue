<template>
  <section class="stack">
    <h2>{{ t('settings.title') }}</h2>

    <RouterLink
      v-for="item in settingItems"
      :key="item.to"
      class="card panel item-link"
      :to="item.to"
    >
      <font-awesome-icon :icon="item.icon" class="item-icon" />
      <span>{{ t(item.labelKey) }}</span>
    </RouterLink>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const settingItems = [
  { to: '/settings/data-management', labelKey: 'settings.data_management', icon: 'fa-solid fa-database' },
  { to: '/settings/auto-backup', labelKey: 'settings.auto_backup', icon: 'fa-solid fa-cloud-arrow-up' },
  { to: '/settings/bank-sync', labelKey: 'settings.bank_sync', icon: 'fa-solid fa-building-columns' },
  { to: '/settings/ledgers', labelKey: 'settings.ledger_management', icon: 'fa-solid fa-book' },
  { to: '/settings/categories', labelKey: 'settings.category_management', icon: 'fa-solid fa-tags' },
  { to: '/settings/addon-templates', labelKey: 'settings.addon_templates', icon: 'fa-solid fa-receipt' },
  { to: '/settings/language', labelKey: 'settings.language', icon: 'fa-solid fa-language' },
  { to: '/settings/personalization', labelKey: 'settings.personalization', icon: 'fa-solid fa-palette' },
  { to: '/settings/membership-benefits', labelKey: 'settings.membership_benefits', icon: 'fa-solid fa-money-check-dollar' },
  { to: '/settings/about', labelKey: 'settings.about_us', icon: 'fa-solid fa-users' },
  { to: '/settings/version-info', labelKey: 'settings.version_info', icon: 'fa-solid fa-circle-info' },
]
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 24px
}
.item-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  font-weight: 700
}
.item-icon {
  width: 18px;
  color: var(--text-muted)
}
</style>
