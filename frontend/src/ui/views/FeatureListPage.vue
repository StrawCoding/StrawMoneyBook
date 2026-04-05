<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('feature_list.title') }}</h2>
        <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
      </header>
      <nav class="feature-list">
        <RouterLink v-for="feature in features" :key="feature.to" class="feature-link" :to="feature.to">
          <span class="feature-icon-wrap">
            <font-awesome-icon :icon="feature.icon" class="feature-icon" />
          </span>
          <span>{{ feature.label }}</span>
        </RouterLink>
      </nav>
    </article>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()

const features = computed(() => ([
  { to: '/settings/google-drive-ledger-sync', label: t('feature_list.google_drive_sync', '帳本同步'), icon: 'fa-solid fa-cloud-arrow-up' },
  { to: '/settings/invoice-carrier', label: t('feature_list.invoice_carrier', '電子發票載具'), icon: 'fa-solid fa-file-invoice' },
  { to: '/loans', label: t('feature_list.loans'), icon: 'fa-solid fa-hand-holding-dollar' },
  { to: '/reimbursements', label: t('feature_list.reimbursements'), icon: 'fa-solid fa-receipt' },
  { to: '/claim-sheets', label: t('feature_list.claim_sheets'), icon: 'fa-solid fa-file-invoice-dollar' },
  { to: '/savings-jars', label: t('feature_list.savings_jars'), icon: 'fa-solid fa-piggy-bank' },
  { to: '/subscriptions', label: t('feature_list.subscriptions'), icon: 'fa-solid fa-clock-rotate-left' },
  { to: '/transactions/search', label: t('feature_list.search_transactions'), icon: 'fa-solid fa-magnifying-glass' },
]))
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 18px
}
.feature-list {
  margin-top: 12px;
  display: grid;
  gap: 8px
}
.feature-link {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-soft-accent);
  font-weight: 700
}
.feature-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
  flex: 0 0 auto
}
.feature-icon {
  width: 16px;
}</style>
