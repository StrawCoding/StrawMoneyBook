<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('feature_list.title') }}</h2>
        <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
      </header>
      <nav class="feature-list">
        <RouterLink class="feature-link" to="/loans">{{ t('feature_list.loans') }}</RouterLink>
        <RouterLink class="feature-link" to="/reimbursements">{{ t('feature_list.reimbursements') }}</RouterLink>
        <RouterLink class="feature-link" to="/claim-sheets">{{ t('feature_list.claim_sheets') }}</RouterLink>
        <RouterLink class="feature-link" to="/transactions/search">{{ t('feature_list.search_transactions') }}</RouterLink>
      </nav>
    </article>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
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
  text-decoration: none;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-soft-accent);
  font-weight: 700
}</style>
