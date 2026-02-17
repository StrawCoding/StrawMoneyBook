<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('settings_version.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <div class="detail-row">
        <small class="muted version-label">
          <font-awesome-icon icon="fa-solid fa-circle-info" class="version-icon" />
          <span>{{ t('settings_version.app_version') }}</span>
        </small>
        <strong>{{ version }}</strong>
      </div>
      <div class="actions">
        <RouterLink class="btn" to="/settings/developer-debug">{{ t('settings_version.developer') }}</RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import appPackage from '../../../../package.json'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const version = computed(() => String(appPackage?.version ?? '0.0.0'))
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 8px;
}

.page-title {
  margin: 0;
}

.page-header {
  align-items: center;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.version-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.version-icon {
  color: var(--primary-soft);
}

.actions {
  margin-top: 4px;
}
</style>
