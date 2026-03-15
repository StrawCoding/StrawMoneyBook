<template>
  <div class="view-root">
    <section class="stack">
      <header class="row page-header">
        <h2 class="page-title">{{ t('icon_picker.title') }}</h2>
        <button class="btn back-btn" type="button" @click="goBack">{{ t('common.back') }}</button>
      </header>

      <article class="card panel">
        <div class="icon-grid">
          <button
            v-for="item in options"
            :key="item.value"
            class="icon-btn"
            :class="{ active: item.value === currentValue }"
            type="button"
            :aria-label="item.label"
            :title="item.label"
            @click.stop.prevent="pick(item.value)"
          >
            <font-awesome-icon :icon="item.icon" />
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { accountIconOptions, categoryIconOptions, normalizeFaIcon } from '@/ui/utils/fa-icon-options'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { canNavigateBackInApp } from '@/ui/services/navigation-back.service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const uiStore = useUiStore()
const picking = ref(false)

const scope = computed(() => (queryText(route.query.scope) === 'account' ? 'account' : 'category'))
const options = computed(() => (scope.value === 'account' ? accountIconOptions : categoryIconOptions))
const currentValue = computed(() => normalizeFaIcon(queryText(route.query.current), options.value[0]?.value ?? ''))

async function pick(icon) {
  if (picking.value) return
  const normalizedIcon = normalizeFaIcon(icon, '')
  if (!normalizedIcon) return
  picking.value = true
  const from = queryText(route.query.from)
  const accountId = queryText(route.query.accountId)
  const categoryId = queryText(route.query.categoryId)
  const nextQuery = buildBaseQuery(route.query)

  if (from === 'account-detail') {
    if (!accountId) {
      uiStore.pushToast(t('icon_picker.error.missing_account_id'), 'error')
      picking.value = false
      return
    }
    nextQuery.editAccountIcon = normalizedIcon
    await safeNavigate({ name: 'account-detail', params: { id: accountId }, query: nextQuery })
    picking.value = false
    return
  }

  if (from === 'settings-category-detail') {
    nextQuery.categoryIcon = normalizedIcon
    await safeNavigate({ name: 'settings-category-detail', params: { id: categoryId }, query: nextQuery })
    picking.value = false
    return
  }

  if (from === 'asset-account-management-edit') {
    nextQuery.editAccountIcon = normalizedIcon
    await safeNavigate({ name: 'asset-account-management', query: nextQuery })
    picking.value = false
    return
  }

  if (from === 'asset-account-management') {
    nextQuery.openAccountDialog = '1'
    nextQuery.accountIcon = normalizedIcon
    await safeNavigate({ name: 'asset-account-management', query: nextQuery })
    picking.value = false
    return
  }

  if (from === 'settings-categories-edit') {
    nextQuery.editCategoryIcon = normalizedIcon
    await safeNavigate({ name: 'settings-categories', query: nextQuery })
    picking.value = false
    return
  }

  nextQuery.openCategoryDialog = '1'
  nextQuery.categoryIcon = normalizedIcon
  await safeNavigate({ name: 'settings-categories', query: nextQuery })
  picking.value = false
}

function goBack() {
  if (canNavigateBackInApp(route.fullPath)) {
    void router.back()
    return
  }

  const from = queryText(route.query.from)
  const accountId = queryText(route.query.accountId)
  const categoryId = queryText(route.query.categoryId)
  const nextQuery = buildBaseQuery(route.query)

  if (from === 'account-detail') {
    void router.push({ name: 'account-detail', params: { id: accountId }, query: nextQuery })
    return
  }

  if (from === 'settings-category-detail') {
    void router.push({ name: 'settings-category-detail', params: { id: categoryId }, query: nextQuery })
    return
  }

  if (from === 'asset-account-management-edit') {
    void router.push({ name: 'asset-account-management', query: nextQuery })
    return
  }

  if (from === 'asset-account-management') {
    void router.push({ name: 'asset-account-management', query: nextQuery })
    return
  }
  void router.push({ name: 'settings-categories', query: nextQuery })
}

async function safeNavigate(target) {
  try {
    await router.replace(target)
  } catch (error) {
    uiStore.pushToast(error?.message ?? t('icon_picker.error.navigate_failed'), 'error')
  }
}

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function buildBaseQuery(query) {
  const nextQuery = { ...query }
  delete nextQuery.scope
  delete nextQuery.from
  delete nextQuery.current
  delete nextQuery.accountId
  delete nextQuery.categoryId
  delete nextQuery.accountIcon
  delete nextQuery.editAccountIcon
  delete nextQuery.categoryIcon
  delete nextQuery.editCategoryIcon
  return nextQuery
}
</script>

<style scoped>.page-title {
  margin: 0;
  font-size: 22px
}
.panel {
  padding: 14px
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  touch-action: pan-y;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--field-border);
  background: color-mix(in srgb, var(--card) 85%, var(--surface-popover) 15%);
  border-radius: 12px;
  color: var(--text);
  aspect-ratio: 1;
  min-height: 52px;
  padding: 0;
  font-size: 18px
}
.icon-btn.active {
  color: var(--primary-soft);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  background: color-mix(in srgb, var(--primary) 16%, var(--card) 84%)
}
.icon-btn:active {
  transform: scale(0.97)
}</style>
