<template>
  <section class="stack feature-list-page" data-testid="feature-list-page">
    <article class="card panel">
      <header class="row">
        <h2 class="feature-list-page-title">{{ t('feature_list.title') }}</h2>
      </header>

      <section class="feature-section" data-testid="feature-list-general">
        <h3 class="feature-section-title">{{ t('feature_list.general') }}</h3>
        <nav class="feature-list">
          <RouterLink
            v-for="feature in generalFeatures"
            :key="feature.to"
            class="feature-link"
            :data-testid="feature.testId"
            :to="feature.to"
          >
            <span class="feature-icon-wrap">
              <font-awesome-icon :icon="feature.icon" class="feature-icon" />
            </span>
            <span>{{ feature.label }}</span>
          </RouterLink>
        </nav>
      </section>

      <section class="feature-section" data-testid="feature-list-advanced">
        <h3 class="feature-section-title">{{ t('feature_list.advanced') }}</h3>
        <nav class="feature-list">
          <RouterLink
            v-for="feature in advancedFeatures"
            :key="feature.to"
            class="feature-link"
            :data-testid="feature.testId"
            :to="feature.to"
          >
            <span class="feature-icon-wrap">
              <font-awesome-icon :icon="feature.icon" class="feature-icon" />
            </span>
            <span>{{ feature.label }}</span>
          </RouterLink>
        </nav>
      </section>
    </article>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { isBankSyncFeatureEnabled } from '@/services/bank-sync/backend'

const { t } = useI18n()
const showBankSyncEntry = isBankSyncFeatureEnabled()

const generalFeatures = computed(() => ([
  { to: '/budget', label: t('feature_list.budget_items'), icon: 'fa-solid fa-chart-pie', testId: 'feature-link-budget' },
  { to: '/loans', label: t('feature_list.loans'), icon: 'fa-solid fa-hand-holding-dollar', testId: 'feature-link-loans' },
  { to: '/reimbursements', label: t('feature_list.reimbursements'), icon: 'fa-solid fa-receipt', testId: 'feature-link-reimbursements' },
  { to: '/claim-sheets', label: t('feature_list.claim_sheets'), icon: 'fa-solid fa-file-invoice-dollar', testId: 'feature-link-claim-sheets' },
  { to: '/savings-jars', label: t('feature_list.savings_jars'), icon: 'fa-solid fa-piggy-bank', testId: 'feature-link-savings-jars' },
  { to: '/subscriptions', label: t('feature_list.subscriptions'), icon: 'fa-solid fa-clock-rotate-left', testId: 'feature-link-subscriptions' },
  { to: '/transactions/search', label: t('feature_list.search_transactions'), icon: 'fa-solid fa-magnifying-glass', testId: 'feature-link-search' },
]))

const advancedFeatures = computed(() => ([
  {
    to: '/settings/shared-ledgers',
    label: t('feature_list.shared_ledgers'),
    icon: 'fa-solid fa-users',
    testId: 'feature-link-shared-ledgers',
  },
  {
    to: '/settings/google-drive-ledger-sync',
    label: t('feature_list.google_drive_sync', '帳本同步'),
    icon: 'fa-solid fa-cloud-arrow-up',
    testId: 'feature-link-ledger-sync',
  },
  {
    to: '/settings/auto-backup#drive-appdata-browser',
    label: t('feature_list.drive_appdata_restore', 'Drive 備份選檔／舊版還原'),
    icon: 'fa-solid fa-clock-rotate-left',
    testId: 'feature-link-drive-appdata-restore',
  },
  ...(showBankSyncEntry
    ? [{
        to: '/settings/bank-sync',
        label: t('feature_list.bank_sync'),
        icon: 'fa-solid fa-building-columns',
        testId: 'feature-link-bank-sync',
      }]
    : []),
  {
    to: '/settings/carrier-sync',
    label: t('feature_list.carrier_sync'),
    icon: 'fa-solid fa-file-invoice',
    testId: 'feature-link-carrier-sync',
  },
]))
</script>

<style scoped>
.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 18px
}
.feature-section {
  margin-top: 16px
}
.feature-section:first-of-type {
  margin-top: 12px
}
.feature-section-title {
  margin: 0 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--muted, color-mix(in srgb, var(--text) 62%, transparent))
}
.feature-list {
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
  font-weight: 700;
  /* Keep rows clear of fixed BottomNav when scrolled into view / focused. */
  scroll-margin-bottom: calc(88px + var(--navigation-bar-height));
  scroll-margin-top: 24px;
}
.feature-list-page {
  padding-bottom: 12px;
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
}
</style>
