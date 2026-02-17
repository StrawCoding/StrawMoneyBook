<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('assets_page.title') }}</h2>
      <RouterLink class="btn" to="/assets/accounts">{{ t('assets_page.manage') }}</RouterLink>
    </header>

    <article class="card panel ledger-panel">
      <header class="row">
        <h3>{{ t('assets_page.current_ledger') }}</h3>
      </header>
      <LedgerSwitcher class="ledger-switcher-wrap" />
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('assets_page.summary_title') }}</h3>
      </header>
      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('assets_page.disposable') }}</small>
          <MoneyText :value-minor="disposableMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('assets_page.liability') }}</small>
          <MoneyText :value-minor="liabilityMinor" />
        </div>
        <button class="summary-item summary-link" @click="goLoans('lend')">
          <div class="row summary-head">
            <small class="muted">{{ t('assets_page.lend') }}</small>
            <small class="muted summary-hint">{{ t('assets_page.view') }}</small>
          </div>
          <MoneyText :value-minor="loanStore.summary.totalReceivable" />
        </button>
        <button class="summary-item summary-link" @click="goLoans('borrow')">
          <div class="row summary-head">
            <small class="muted">{{ t('assets_page.borrow') }}</small>
            <small class="muted summary-hint">{{ t('assets_page.view') }}</small>
          </div>
          <MoneyText :value-minor="loanStore.summary.totalPayable" />
        </button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('assets_page.asset_accounts') }}</h3>
      </header>

      <ul class="group-list">
        <li v-for="group in groupSummaries" :key="group.id" class="group-item">
          <button
            class="row group-head"
            :class="{ open: isGroupExpanded(group.id) }"
            type="button"
            @click="toggleGroup(group.id)"
          >
            <h3 class="group-title">{{ group.name }}</h3>
            <span class="group-total-wrap">
              <MoneyText class="group-total" :value-minor="group.totalMinor" />
              <font-awesome-icon
                icon="fa-solid fa-chevron-down"
                class="group-chevron"
                :class="{ open: isGroupExpanded(group.id) }"
              />
            </span>
          </button>

          <ul v-if="isGroupExpanded(group.id)" class="account-list">
            <li v-for="account in accountsByGroup(group.id)" :key="account.id">
              <RouterLink :to="`/accounts/${account.id}`" class="account-row">
                <span class="account-left">
                  <span class="account-icon-wrap">
                    <font-awesome-icon v-if="account.icon" :icon="account.icon" class="account-icon" />
                  </span>
                  <span class="account-text">
                    <span class="account-name">{{ account.name }}</span>
                  </span>
                </span>
                <span class="account-right">
                  <MoneyText class="account-balance" :value-minor="balanceOf(account.id)" />
                </span>
              </RouterLink>
            </li>
          </ul>
        </li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import { useI18n } from '@/ui/services/i18n.service'

const router = useRouter()
const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const loanStore = useLoanStore()
const { t } = useI18n()

const balanceMetrics = computed(() => {
  let disposableMinor = 0
  let liabilityMinor = 0
  const balanceMap = new Map()

  for (const item of accountStore.balances) {
    const balance = Number(item.balance_minor ?? 0)
    balanceMap.set(item.id, balance)

    if (item.account_type === 'asset') {
      if (balance > 0) {
        disposableMinor += balance
      } else if (balance < 0) {
        liabilityMinor += Math.abs(balance)
      }
      continue
    }

    if (item.account_type === 'liability' && balance > 0) {
      liabilityMinor += balance
    }
  }

  return {
    disposableMinor: Math.max(0, disposableMinor),
    liabilityMinor,
    balanceMap,
  }
})
const disposableMinor = computed(() => balanceMetrics.value.disposableMinor)
const liabilityMinor = computed(() => balanceMetrics.value.liabilityMinor)

const groupSummaries = computed(() => accountStore.groupSummaries)
const expandedGroupIds = ref(new Set())
const expandedInitialized = ref(false)
const expandedStateStorageKey = 'assets-page:expanded-group-ids'

const groupedAccounts = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) {
    const groupId = account.group_id
    if (!map.has(groupId)) {
      map.set(groupId, [])
    }
    map.get(groupId).push(account)
  }
  return map
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    expandedInitialized.value = false
    expandedGroupIds.value = new Set()
  },
  { immediate: true },
)

watch(
  groupSummaries,
  (groups) => {
    if (!expandedInitialized.value) {
      const stored = readExpandedGroupState()
      if (stored.exists) {
        expandedGroupIds.value = new Set(groups.filter((group) => stored.ids.has(group.id)).map((group) => group.id))
      } else {
        expandedGroupIds.value = new Set(groups.map((group) => group.id))
      }
      expandedInitialized.value = true
      persistExpandedGroupState()
      return
    }

    const nextExpanded = new Set()
    for (const group of groups) {
      if (expandedGroupIds.value.has(group.id)) {
        nextExpanded.add(group.id)
      }
    }
    expandedGroupIds.value = nextExpanded
    persistExpandedGroupState()
  },
  { immediate: true },
)

function accountsByGroup(groupId) {
  return groupedAccounts.value.get(groupId) ?? []
}

function isGroupExpanded(groupId) {
  return expandedGroupIds.value.has(groupId)
}

function toggleGroup(groupId) {
  const nextExpanded = new Set(expandedGroupIds.value)
  if (nextExpanded.has(groupId)) {
    nextExpanded.delete(groupId)
  } else {
    nextExpanded.add(groupId)
  }
  expandedGroupIds.value = nextExpanded
  persistExpandedGroupState()
}

function balanceOf(accountId) {
  return Number(balanceMetrics.value.balanceMap.get(accountId) ?? 0)
}

function goLoans(tab) {
  router.push({
    name: 'loans',
    query: { tab },
  })
}

function expandedStateStorageKeyForLedger() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) return ''
  return `${expandedStateStorageKey}:${ledgerId}`
}

function readExpandedGroupState() {
  if (typeof window === 'undefined') {
    return { exists: false, ids: new Set() }
  }
  const storageKey = expandedStateStorageKeyForLedger()
  if (!storageKey) return { exists: false, ids: new Set() }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw == null) return { exists: false, ids: new Set() }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { exists: true, ids: new Set() }
    return { exists: true, ids: new Set(parsed.map((item) => String(item))) }
  } catch {
    return { exists: false, ids: new Set() }
  }
}

function persistExpandedGroupState() {
  if (!expandedInitialized.value || typeof window === 'undefined') return
  const storageKey = expandedStateStorageKeyForLedger()
  if (!storageKey) return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedGroupIds.value)))
  } catch {
    // Ignore storage failures silently (e.g. private mode quota limits).
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

.page-title {
  font-size: 24px;
}

.page-header {
  align-items: center;
}

.ledger-switcher-wrap {
  margin-top: 10px;
  position: relative;
  z-index: 31;
}

.ledger-panel {
  position: relative;
  z-index: 30;
}

.group-list,
.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.summary-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.summary-link {
  width: 100%;
  text-align: left;
  color: inherit;
  background: color-mix(in srgb, var(--card) 76%, var(--surface-soft-accent) 24%);
  cursor: pointer;
}

.summary-head {
  align-items: center;
}

.summary-hint {
  font-size: 11px;
}

.group-list {
  margin-top: 12px;
  display: grid;
  gap: 16px;
}

.group-item {
  border: 0;
  border-radius: 0;
  padding: 0;
}

.group-head {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  align-items: center;
  margin-bottom: 0;
}

.group-head.open {
  margin-bottom: 8px;
}

.group-title {
  font-size: 18px;
  font-weight: 700;
}

.group-total-wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.group-total {
  color: color-mix(in srgb, #ff6a4c 85%, var(--text) 15%);
  font-weight: 700;
}

.group-chevron {
  color: var(--muted);
  font-size: 18px;
  transform: rotate(-90deg);
  transition: transform 140ms ease;
}

.group-chevron.open {
  transform: rotate(0deg);
}

.account-list {
  margin-top: 0;
  display: grid;
  gap: 12px;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--card) 86%, #111 14%);
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 8%, transparent);
  padding: 16px 16px;
}

a {
  color: var(--text);
  text-decoration: none;
}

.account-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.account-text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.account-name {
  font-size: 18px;
  line-height: 1.15;
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-balance {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
}

.account-right {
  display: grid;
  justify-items: end;
  gap: 3px;
  flex-shrink: 0;
}

.account-subtitle {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
}

.account-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.account-icon {
  font-size: 22px;
  color: #f7f7f7;
}

.mini-btn {
  padding: 10px 12px;
  font-size: inherit;
  border-radius: 12px;
}
</style>
