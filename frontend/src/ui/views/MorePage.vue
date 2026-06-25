<template>
  <section class="stack more-page" data-testid="more-page">
    <h2>{{ t('nav.more') }}</h2>

    <article class="card panel">
      <h3>{{ t('more_page.todo_summary') }}</h3>
      <ul class="todo-list">
        <li>
          <span>{{ t('more_page.pending_reimbursement') }}</span>
          <RouterLink class="todo-action" to="/reimbursements">
            <template v-if="pendingReimbursementCount > 0">
              {{ pendingReimbursementCount }}
            </template>
            <template v-else>{{ t('more_page.none') }}</template>
          </RouterLink>
        </li>
        <li>
          <span>{{ t('more_page.outstanding_lend') }}</span>
          <RouterLink class="todo-action" to="/loans">
            <template v-if="outstandingLendMinor > 0">
              <MoneyText :value-minor="outstandingLendMinor" />
            </template>
            <template v-else>{{ t('more_page.none') }}</template>
          </RouterLink>
        </li>
        <li>
          <span>{{ t('more_page.upcoming_subscription') }}</span>
          <RouterLink class="todo-action" to="/subscriptions">
            <template v-if="upcomingSubscriptionLabel">{{ upcomingSubscriptionLabel }}</template>
            <template v-else>{{ t('more_page.none') }}</template>
          </RouterLink>
        </li>
        <li>
          <span>{{ t('more_page.backup_status') }}</span>
          <RouterLink class="todo-action" to="/settings/auto-backup">
            {{ backupStatusLabel }}
          </RouterLink>
        </li>
      </ul>
    </article>

    <label class="search-field card panel">
      <span class="muted">{{ t('more_page.search_placeholder') }}</span>
      <input
        v-model.trim="searchQuery"
        class="input"
        type="search"
        :placeholder="t('more_page.search_placeholder')"
        data-testid="more-page-search"
      />
    </label>

    <article class="card panel">
      <h3>{{ t('more_page.modules') }}</h3>
      <nav class="module-grid">
        <RouterLink
          v-for="module in filteredModules"
          :key="module.to"
          class="module-link"
          :to="module.to"
        >
          <span class="module-icon-wrap">
            <font-awesome-icon :icon="module.icon" class="module-icon" />
          </span>
          <span class="module-copy">
            <strong>{{ module.label }}</strong>
            <small class="muted">{{ module.hint }}</small>
          </span>
          <span v-if="module.badge" class="module-badge">{{ module.badge }}</span>
        </RouterLink>
      </nav>
    </article>

    <article class="card panel">
      <h3>{{ t('more_page.settings_shortcuts') }}</h3>
      <nav class="shortcut-list">
        <RouterLink
          v-for="shortcut in filteredShortcuts"
          :key="shortcut.to"
          class="shortcut-link"
          :to="shortcut.to"
        >
          <font-awesome-icon :icon="shortcut.icon" class="shortcut-icon" />
          <span>{{ shortcut.label }}</span>
        </RouterLink>
      </nav>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { resolveSubscriptionNextChargeDate } from '@/core/utils/subscription-schedule'
import { getSubscriptionItems } from '@/core/services/subscription-tracker.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getGoogleBackupState } from '@/ui/services/google-backup.service'

const ledgerStore = useLedgerStore()
const loanStore = useLoanStore()
const reimbursementStore = useReimbursementStore()
const { t } = useI18n()

const searchQuery = ref('')
const subscriptionItems = ref([])
const backupNeedsAttention = ref(false)

const pendingReimbursementCount = computed(() => reimbursementStore.pendingItems.length)
const outstandingLendMinor = computed(() => Number(loanStore.summary.totalReceivable ?? 0))

const upcomingSubscriptionLabel = computed(() => {
  const now = new Date()
  let nearestDays = null
  for (const item of subscriptionItems.value) {
    if (item.paused) continue
    const nextDate = resolveSubscriptionNextChargeDate(item)
    if (!nextDate) continue
    const diffMs = new Date(`${nextDate}T00:00:00`).getTime() - now.getTime()
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000))
    if (days < 0) continue
    if (nearestDays === null || days < nearestDays) nearestDays = days
  }
  if (nearestDays === null) return ''
  return t('more_page.upcoming_subscription_days', { days: nearestDays })
})

const backupStatusLabel = computed(() => {
  if (backupNeedsAttention.value) return t('more_page.backup_attention')
  return t('more_page.check')
})

const modules = computed(() => ([
  {
    to: '/settings/google-drive-ledger-sync',
    label: t('more_page.module.google_drive_sync'),
    hint: t('feature_list.google_drive_sync'),
    icon: 'fa-solid fa-cloud-arrow-up',
    badge: '',
    searchText: 'google drive sync 帳本同步',
  },
  {
    to: '/reimbursements',
    label: t('more_page.module.reimbursements'),
    hint: t('feature_list.reimbursements'),
    icon: 'fa-solid fa-receipt',
    badge: pendingReimbursementCount.value > 0 ? String(pendingReimbursementCount.value) : '',
    searchText: 'reimbursements 報銷',
  },
  {
    to: '/loans',
    label: t('more_page.module.loans'),
    hint: t('feature_list.loans'),
    icon: 'fa-solid fa-hand-holding-dollar',
    badge: outstandingLendMinor.value > 0 ? t('more_page.badge_amount') : '',
    searchText: 'loans 借貸',
  },
  {
    to: '/claim-sheets',
    label: t('more_page.module.claim_sheets'),
    hint: t('feature_list.claim_sheets'),
    icon: 'fa-solid fa-file-invoice-dollar',
    badge: '',
    searchText: 'claim 請款',
  },
  {
    to: '/subscriptions',
    label: t('more_page.module.subscriptions'),
    hint: t('feature_list.subscriptions'),
    icon: 'fa-solid fa-clock-rotate-left',
    badge: upcomingSubscriptionLabel.value ? upcomingSubscriptionLabel.value : '',
    searchText: 'subscription 訂閱',
  },
  {
    to: '/savings-jars',
    label: t('more_page.module.savings_jars'),
    hint: t('feature_list.savings_jars'),
    icon: 'fa-solid fa-piggy-bank',
    badge: '',
    searchText: 'savings 存錢罐',
  },
  {
    to: '/budget',
    label: t('more_page.module.budget'),
    hint: t('feature_list.budget_items'),
    icon: 'fa-solid fa-chart-pie',
    badge: '',
    searchText: 'budget 預算',
  },
  {
    to: '/settings/carrier-sync',
    label: t('more_page.module.einvoice'),
    hint: t('feature_list.einvoice_import'),
    icon: 'fa-solid fa-file-invoice',
    badge: '',
    searchText: 'einvoice 發票 載具',
  },
  {
    to: '/transactions/search',
    label: t('more_page.module.search'),
    hint: t('feature_list.search_transactions'),
    icon: 'fa-solid fa-magnifying-glass',
    badge: '',
    searchText: 'search 搜尋 交易',
  },
]))

const shortcuts = computed(() => ([
  { to: '/settings', label: t('nav.settings'), icon: 'fa-solid fa-gear', searchText: 'settings 設定' },
  { to: '/settings/ledgers', label: t('settings.ledger_management'), icon: 'fa-solid fa-book', searchText: 'ledger 帳本' },
  { to: '/settings/shared-ledgers', label: t('settings.shared_ledgers'), icon: 'fa-solid fa-users', searchText: 'shared 共同帳本' },
  { to: '/settings/auto-backup', label: t('settings.auto_backup'), icon: 'fa-solid fa-cloud-arrow-up', searchText: 'backup 備份' },
  { to: '/settings/google-drive-ledger-sync', label: t('settings.google_drive_ledger_sync'), icon: 'fa-solid fa-arrow-right-arrow-left', searchText: 'sync 同步' },
  { to: '/settings/categories', label: t('settings.category_management'), icon: 'fa-solid fa-tags', searchText: 'category 分類' },
  { to: '/settings/personalization', label: t('settings.personalization'), icon: 'fa-solid fa-palette', searchText: 'personalization 主題 介面' },
  { to: '/settings/language', label: t('settings.language'), icon: 'fa-solid fa-language', searchText: 'language 語言' },
]))

const normalizedSearch = computed(() => String(searchQuery.value ?? '').trim().toLowerCase())

function matchesSearch(item) {
  if (!normalizedSearch.value) return true
  const haystack = `${item.label} ${item.hint ?? ''} ${item.searchText ?? ''}`.toLowerCase()
  return haystack.includes(normalizedSearch.value)
}

const filteredModules = computed(() => modules.value.filter(matchesSearch))
const filteredShortcuts = computed(() => shortcuts.value.filter(matchesSearch))

watch(
  () => ledgerStore.activeLedgerId,
  (ledgerId) => {
    if (!ledgerId) return
    void loadMoreData()
  },
  { immediate: true },
)

onMounted(() => {
  void loadMoreData()
})

async function loadMoreData() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  await Promise.all([
    reimbursementStore.pendingItems.length ? Promise.resolve() : reimbursementStore.load().catch(() => null),
    loanStore.summary.activeCount > 0 || loanStore.loading ? Promise.resolve() : loanStore.load().catch(() => null),
    loadSubscriptions(ledgerId),
    loadBackupStatus(ledgerId),
  ])
}

async function loadSubscriptions(ledgerId) {
  try {
    subscriptionItems.value = await getSubscriptionItems(ledgerId)
  } catch {
    subscriptionItems.value = []
  }
}

async function loadBackupStatus(ledgerId) {
  try {
    const state = await getGoogleBackupState(ledgerId)
    backupNeedsAttention.value = Boolean(
      state.autoEnabled
      && (
        !state.connected
        || state.lastBackupStatus === 'error'
        || state.lastAutoCheckReason === 'reauth_required'
      ),
    )
  } catch {
    backupNeedsAttention.value = false
  }
}
</script>

<style scoped>
.more-page h2 {
  margin: 0;
  font-size: 24px;
}
.panel {
  padding: 14px;
}
h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.todo-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.todo-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.todo-action {
  color: var(--primary-soft);
  text-decoration: none;
  font-weight: 700;
}
.search-field {
  display: grid;
  gap: 8px;
}
.module-grid,
.shortcut-list {
  display: grid;
  gap: 8px;
}
.module-link,
.shortcut-link {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-soft-accent);
}
.module-copy {
  display: grid;
  gap: 2px;
  flex: 1;
}
.module-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
}
.module-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--primary-soft);
}
.shortcut-icon {
  color: var(--primary);
  width: 16px;
}
</style>
