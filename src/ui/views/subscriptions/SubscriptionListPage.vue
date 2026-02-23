<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('subscription_page.title') }}</h2>
        <div class="row header-actions">
          <RouterLink class="btn" :to="{ name: 'subscription-detail', params: { id: 'new' } }">
            {{ t('subscription_page.form.create') }}
          </RouterLink>
          <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
        </div>
      </header>
      <div class="row">
        <span class="muted">{{ t('subscription_page.summary.active') }}</span>
        <span class="badge">{{ t('subscription_page.summary.active_count', { count: activeCount }) }}</span>
      </div>
      <div class="row">
        <span class="muted">{{ t('subscription_page.summary.monthly_estimate') }}</span>
        <MoneyText :value-minor="monthlyEstimateMinor" />
      </div>
      <button class="btn primary" :disabled="syncing" @click="checkDueCharges">
        {{ syncing ? t('subscription_page.checking_due') : t('subscription_page.check_due') }}
      </button>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('subscription_page.list.title') }}</h3>
      </header>

      <ul class="list">
        <li v-for="item in subscriptions" :key="item.id" class="entry">
          <div class="row">
            <strong>{{ item.name }}</strong>
            <MoneyText :value-minor="item.amountMinor" />
          </div>
          <div class="row muted">
            <span>{{ item.intervalLabel }}</span>
            <span>{{ t('subscription_page.list.next_charge', { date: item.nextChargeDate || '-' }) }}</span>
          </div>
          <div class="row muted item-meta-row">
            <span>{{ t('subscription_page.list.account', { account: accountName(item.accountId) }) }}</span>
            <span>{{ t('subscription_page.list.category', { category: categoryPathName(item.categoryId) }) }}</span>
          </div>
          <div class="row action-row">
            <button class="btn" type="button" :class="{ primary: item.enabled }" @click="toggleItem(item)">
              {{ item.enabled ? t('subscription_page.status.enabled') : t('subscription_page.status.disabled') }}
            </button>
            <button class="btn" type="button" @click="chargeNow(item)">{{ t('subscription_page.actions.charge_now') }}</button>
            <RouterLink class="btn" :to="{ name: 'subscription-detail', params: { id: item.id } }">
              {{ t('subscription_page.actions.edit') }}
            </RouterLink>
            <button class="btn danger" type="button" @click="deleteItem(item)">{{ t('subscription_page.actions.delete') }}</button>
          </div>
        </li>
        <li v-if="!subscriptions.length" class="muted">{{ t('subscription_page.list.empty') }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  chargeSubscriptionNow,
  deleteSubscription,
  listSubscriptions,
  runDueSubscriptionCharges,
  toggleSubscriptionEnabled,
} from '@/core/services/subscription.service'

const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()

const subscriptions = ref([])
const syncing = ref(false)
const expenseCategoryGroups = computed(() => categoryStore.expenseCategoryGroups ?? [])

const activeCount = computed(() => subscriptions.value.filter((item) => item.enabled).length)
const monthlyEstimateMinor = computed(() => {
  return Math.round(subscriptions.value.reduce((total, item) => {
    if (!item.enabled) return total
    const amount = Math.max(0, Number(item.amountMinor ?? 0))
    const interval = Math.max(1, Number(item.intervalValue ?? 1))
    if (item.intervalUnit === 'day') {
      return total + (amount * 30) / interval
    }
    if (item.intervalUnit === 'year') {
      return total + amount / (12 * interval)
    }
    return total + amount / interval
  }, 0))
})

onMounted(async () => {
  await loadAll()
  await runDueCharges(false)
})

watch(
  () => ledgerStore.activeLedgerId,
  async () => {
    await loadAll()
    await runDueCharges(false)
  },
)

async function loadAll() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    subscriptions.value = []
    return
  }

  await Promise.all([accountStore.load(), categoryStore.load()])
  subscriptions.value = await listSubscriptions(ledgerId)
}

function accountName(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '-'
}

function categoryPathName(categoryId) {
  const id = String(categoryId ?? '')
  if (!id) return '-'
  for (const group of expenseCategoryGroups.value) {
    const matched = group.categories.find((item) => item.id === id)
    if (matched) return `${group.name} / ${matched.name}`
  }
  return categoryStore.categories.find((item) => item.id === id)?.name ?? '-'
}

async function deleteItem(item) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  const ok = window.confirm(t('subscription_page.confirm_delete', { name: item.name }))
  if (!ok) return
  try {
    await deleteSubscription(ledgerId, item.id)
    subscriptions.value = await listSubscriptions(ledgerId)
    uiStore.pushToast(t('subscription_page.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.delete_failed'), 'error')
  }
}

async function toggleItem(item) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  try {
    await toggleSubscriptionEnabled(ledgerId, item.id, !item.enabled)
    subscriptions.value = await listSubscriptions(ledgerId)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.toggle_failed'), 'error')
  }
}

async function chargeNow(item) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  try {
    await chargeSubscriptionNow(ledgerId, item.id)
    await Promise.all([accountStore.load(), transactionStore.loadRecent()])
    subscriptions.value = await listSubscriptions(ledgerId)
    uiStore.pushToast(t('subscription_page.toast.charged_one', { name: item.name }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.charge_failed'), 'error')
  }
}

async function checkDueCharges() {
  await runDueCharges(true)
}

async function runDueCharges(manual) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || syncing.value) return
  syncing.value = true
  try {
    const result = await runDueSubscriptionCharges(ledgerId)
    if (result.chargedCount > 0) {
      await Promise.all([accountStore.load(), transactionStore.loadRecent()])
      subscriptions.value = await listSubscriptions(ledgerId)
      uiStore.pushToast(t('subscription_page.toast.charged_many', { count: result.chargedCount }))
    } else if (manual) {
      uiStore.pushToast(t('subscription_page.toast.no_due'))
    }
    if (result.errors.length) {
      uiStore.pushToast(result.errors[0], 'error')
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.check_failed'), 'error')
  } finally {
    syncing.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.badge {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}

.list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.entry {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.item-meta-row {
  gap: 10px;
  flex-wrap: wrap;
}

.action-row {
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.header-actions {
  gap: 8px;
}

@media (max-width: 720px) {
  .header-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
</style>
