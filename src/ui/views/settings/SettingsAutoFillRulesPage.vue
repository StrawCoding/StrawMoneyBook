<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('settings_auto_fill.title') }}</h2>
        <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted">{{ t('settings_auto_fill.hint') }}</p>
      <button class="btn primary" :disabled="!activeLedgerId" @click="goToCreatePage">
        {{ t('settings_auto_fill.add_rule') }}
      </button>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('settings_auto_fill.list_title') }}</h3>
        <small class="muted">{{ t('settings_auto_fill.list_hint') }}</small>
      </header>

      <ul v-if="rules.length" class="rule-list">
        <li v-for="rule in rules" :key="rule.id" class="rule-item">
          <div class="rule-copy">
            <strong>{{ rule.keyword }}</strong>
            <small class="muted">{{ describeRule(rule) }}</small>
          </div>
          <div class="rule-actions">
            <button class="btn" @click="goToEditPage(rule.id)">{{ t('common.edit') }}</button>
            <button class="btn danger" @click="removeRule(rule.id)">{{ t('common.delete') }}</button>
          </div>
        </li>
      </ul>

      <p v-else class="muted">{{ t('settings_auto_fill.empty') }}</p>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getAutoFillRules, removeAutoFillRule } from '@/ui/services/auto-fill-rule.service'

const router = useRouter()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const rules = ref([])
const loadingState = ref(false)

const activeLedgerId = computed(() => ledgerStore.activeLedgerId)

watch(
  () => activeLedgerId.value,
  () => {
    void loadState()
  },
  { immediate: true },
)

async function ensureStoresReady() {
  if (!activeLedgerId.value) return
  await Promise.all([
    accountStore.load().catch(() => null),
    categoryStore.load().catch(() => null),
  ])
}

async function loadState() {
  if (loadingState.value) return
  if (!activeLedgerId.value) {
    rules.value = []
    return
  }

  loadingState.value = true
  try {
    await ensureStoresReady()
    rules.value = await getAutoFillRules(activeLedgerId.value)
  } finally {
    loadingState.value = false
  }
}

function goToCreatePage() {
  if (!activeLedgerId.value) return
  void router.push({ name: 'settings-auto-fill-rule-create' })
}

function goToEditPage(ruleId) {
  const normalizedId = String(ruleId ?? '').trim()
  if (!normalizedId) return
  void router.push({
    name: 'settings-auto-fill-rule-edit',
    params: { id: normalizedId },
  })
}

function accountNameOf(accountId) {
  if (!accountId) return t('settings_auto_fill.keep_current')
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '-'
}

function categoryNameOf(categoryId) {
  if (!categoryId) return ''
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? ''
}

function describeRule(rule) {
  const parts = []
  const typeLabel = rule.type === 'income'
    ? t('analysis_page.type.income')
    : rule.type === 'transfer'
      ? t('transaction_about.type.transfer')
      : t('analysis_page.type.expense')

  parts.push(typeLabel)
  if (rule.type === 'transfer') {
    parts.push(`${accountNameOf(rule.accountId)} → ${accountNameOf(rule.peerAccountId)}`)
  } else if (rule.accountId) {
    parts.push(accountNameOf(rule.accountId))
  }

  if (rule.categoryId) {
    parts.push(categoryNameOf(rule.categoryId))
  }
  if (rule.amountMajor) {
    parts.push(`${t('settings_auto_fill.amount')} ${rule.amountMajor}`)
  }
  if (rule.note) {
    parts.push(`${t('settings_auto_fill.note')} ${rule.note}`)
  }
  if (rule.isReimbursable) {
    parts.push(t('settings_auto_fill.reimbursable'))
  }
  if (Array.isArray(rule.addonItems) && rule.addonItems.length) {
    const addonPreview = rule.addonItems
      .slice(0, 2)
      .map((item) => `${item.label}+${item.deltaMajor}`)
      .join('、')
    const remainCount = Math.max(0, rule.addonItems.length - 2)
    const addons = remainCount > 0
      ? `${addonPreview} 等 ${rule.addonItems.length} 項`
      : addonPreview
    parts.push(`${t('settings_auto_fill.addon')} ${addons}`)
  }

  return parts.join(' / ')
}

async function removeRule(ruleId) {
  if (!activeLedgerId.value) return
  try {
    rules.value = await removeAutoFillRule(activeLedgerId.value, ruleId)
    uiStore.pushToast(t('settings_auto_fill.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_auto_fill.toast.delete_failed'), 'error')
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

h2,
h3 {
  margin: 0;
}

.rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.rule-item {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rule-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.rule-copy strong,
.rule-copy small {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.rule-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}
</style>
