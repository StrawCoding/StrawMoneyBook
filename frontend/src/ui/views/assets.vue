<template>
  <HabitatPageShell
    :title="t('assets_page.title')"
    :kicker="t('assets_page.habitat_hello')"
    test-id="assets-view"
    hello-test-id="assets-hello-block"
    root-class="assets-modern"
    stack-class="assets-page"
  >
    <template #toolbar>
      <LedgerSwitcher class="ledger-switcher-wrap ledger-panel" data-testid="assets-ledger-switcher" />
      <RouterLink class="text-link manage-link" to="/assets/accounts">{{ t('assets_page.manage') }}</RouterLink>
    </template>

    <article class="card panel vault-summary-card">
      <header class="row vault-summary-head">
        <h3>{{ t('assets_page.summary_title') }}</h3>
      </header>
      <div class="vault-metrics">
        <div class="summary-item summary-total">
          <div class="row summary-title-row">
            <small class="muted">{{ t('assets_page.total_assets') }}</small>
            <button
              type="button"
              class="summary-info-btn"
              :aria-label="t('assets_page.total_assets_info_button', '查看總資產說明')"
              :title="t('assets_page.total_assets_info_button', '查看總資產說明')"
              @click="totalAssetsInfoOpen = true"
            >
              <font-awesome-icon icon="fa-solid fa-circle-info" />
            </button>
          </div>
          <MoneyText :value-minor="totalAssetMinor" />
        </div>
        <div class="vault-split">
          <div class="summary-item summary-stat">
            <small class="muted">{{ t('assets_page.disposable') }}</small>
            <MoneyText :value-minor="disposableMinor" />
          </div>
          <div class="summary-item summary-stat">
            <small class="muted">{{ t('assets_page.liability') }}</small>
            <MoneyText :value-minor="liabilityMinor" />
          </div>
        </div>
      </div>
      <ul class="vault-drill-list" data-testid="assets-drill-list">
        <li>
          <button type="button" class="vault-drill-row" data-testid="assets-lend-entry" @click="goLoans('lend')">
            <span class="vault-drill-label">{{ t('assets_page.lend') }}</span>
            <span class="vault-drill-value">
              <MoneyText :value-minor="loanStore.summary.totalReceivable" />
              <span class="vault-drill-chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" class="vault-drill-row" data-testid="assets-borrow-entry" @click="goLoans('borrow')">
            <span class="vault-drill-label">{{ t('assets_page.borrow') }}</span>
            <span class="vault-drill-value">
              <MoneyText :value-minor="loanStore.summary.totalPayable" />
              <span class="vault-drill-chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" class="vault-drill-row" data-testid="assets-securities-entry" @click="goSecurities">
            <span class="vault-drill-label">{{ t('assets_page.securities') }}</span>
            <span class="vault-drill-value">
              <MoneyText data-testid="assets-securities-amount" :value-minor="securitiesDisplayMinor" />
              <span class="vault-drill-chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" class="vault-drill-row" data-testid="assets-credit-entry" @click="goCreditCards">
            <span class="vault-drill-label">{{ t('assets_page.credit_cards') }}</span>
            <span class="vault-drill-value">
              <MoneyText :value-minor="creditDebtMinor" />
              <span class="vault-drill-chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </li>
      </ul>
    </article>

    <article class="card panel accounts-island">
      <header class="row accounts-island-head">
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
              <MoneyText class="group-total" :value-minor="group.totalMinor" :currency="group.currencyCode" />
              <font-awesome-icon
                icon="fa-solid fa-chevron-down"
                class="group-chevron"
                :class="{ open: isGroupExpanded(group.id) }"
              />
            </span>
          </button>

          <ul v-if="isGroupExpanded(group.id)" class="account-list">
            <li v-for="account in accountsByGroup(group.id)" :key="account.id">
              <RouterLink
                :to="`/accounts/${account.id}`"
                class="account-row"
                :class="{ excluded: !isAccountIncludedInAssets(account), 'group-stat-excluded': !isAccountIncludedInGroupStatistics(account) }"
              >
                <span class="account-left">
                  <span class="account-icon-wrap">
                    <font-awesome-icon v-if="account.icon" :icon="account.icon" class="account-icon" />
                  </span>
                  <span class="account-text">
                    <span class="account-name">{{ account.name }}</span>
                    <small v-if="advanceMinorOf(account.id) > 0" class="muted account-advance">
                      {{ t('assets_page.advance_label') }} <MoneyText :value-minor="advanceMinorOf(account.id)" />
                    </small>
                  </span>
                </span>
                <span class="account-right">
                  <MoneyText class="account-balance" :value-minor="balanceOf(account.id)" :currency="account.currency_code" />
                </span>
              </RouterLink>
            </li>
          </ul>
        </li>
      </ul>
    </article>

    <AppDialog
      :open="totalAssetsInfoOpen"
      :title="t('assets_page.total_assets', '總資產')"
      :show-footer="false"
      @close="totalAssetsInfoOpen = false"
    >
      <div class="stack summary-info-content">
        <p class="muted compact">
          {{
            t(
              'assets_page.total_assets_formula',
              '總資產 = 可支配 + 借出 - 借入 + 未報銷 + 有價證券市值（計入者）',
            )
          }}
        </p>
        <p class="muted compact">
          {{
            t(
              'assets_page.total_assets_advance_note',
              '可支配金額已先扣除代收，所以總資產會一起扣掉代收，不會把暫收款算進資產。',
            )
          }}
        </p>
        <p class="muted compact">
          {{
            t(
              'assets_page.total_assets_advance_amount',
              { amount: deductedAdvanceLabel },
              '目前已扣除代收：{amount}',
            )
          }}
        </p>
      </div>
    </AppDialog>
  </HabitatPageShell>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useSecurityStore } from '@/ui/stores/security.store'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { calculateAssetSummary, isAssetAccountIncludedInTotals } from '@/core/utils/assets-summary'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'

const router = useRouter()
const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const loanStore = useLoanStore()
const reimbursementStore = useReimbursementStore()
const securityStore = useSecurityStore()
const { t } = useI18n()
const totalAssetsInfoOpen = ref(false)

const balanceMetrics = computed(() => calculateAssetSummary({
  balances: accountStore.balances,
  accounts: accountStore.accounts,
  rates: accountStore.exchangeRateSnapshot?.rates ?? {},
  targetCurrencyCode: ledgerStore.activeLedger?.currency_code ?? 'TWD',
  receivableMinor: loanStore.summary.totalReceivable,
  payableMinor: loanStore.summary.totalPayable,
  unreimbursedMinor: reimbursementStore.pendingTotalMinor,
  securitiesMarketValueMinor: securityStore.summary.includedMarketValueMinor,
}))
const disposableMinor = computed(() => balanceMetrics.value.disposableMinor)
const liabilityMinor = computed(() => balanceMetrics.value.liabilityMinor)
const totalAssetMinor = computed(() => balanceMetrics.value.totalAssetMinor)
const securitiesDisplayMinor = computed(() => Number(
  securityStore.summary.includedDisplayValueMinor
    ?? securityStore.summary.totalDisplayValueMinor
    ?? securityStore.summary.includedMarketValueMinor
    ?? 0,
))
const creditDebtMinor = computed(() => {
  const balances = Array.isArray(accountStore.balances) ? accountStore.balances : []
  const accounts = Array.isArray(accountStore.accounts) ? accountStore.accounts : []
  const creditIds = new Set(
    accounts.filter((a) => String(a.account_kind) === 'credit').map((a) => a.id),
  )
  let debt = 0
  for (const row of balances) {
    if (!creditIds.has(row.id)) continue
    const bal = Number(row.balance_minor ?? 0)
    if (bal < 0) debt += -bal
  }
  return debt
})
const activeCurrencyCode = computed(() => normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD'))
const deductedAdvanceLabel = computed(() => {
  const amountMinor = Number(balanceMetrics.value.advanceDeductedMinor ?? 0)
  const amountMajor = amountMinor / 100
  return new Intl.NumberFormat(resolveIntlLocale(), {
    style: 'currency',
    currency: activeCurrencyCode.value,
    minimumFractionDigits: Math.abs(amountMinor) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMajor)
})

const expandedGroupIds = ref(new Set())
const expandedInitialized = ref(false)
const expandedStateStorageKey = 'assets-page:expanded-group-ids'

const groupedAccounts = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) {
    // 信用卡不進資產母分類列表；改由摘要「信用卡」入口管理
    if (String(account?.account_kind ?? '').toLowerCase() === 'credit') continue
    const groupId = account.group_id
    if (!map.has(groupId)) {
      map.set(groupId, [])
    }
    map.get(groupId).push(account)
  }
  return map
})

/** 資產頁群組：信用卡已自 groupSummaries 排除；隱藏空群組 */
const groupSummaries = computed(() => {
  return (accountStore.groupSummaries ?? []).filter((group) => {
    return (groupedAccounts.value.get(group.id) ?? []).length > 0
  })
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    expandedInitialized.value = false
    expandedGroupIds.value = new Set()
    void securityStore.load()
  },
  { immediate: true },
)

onMounted(() => {
  void securityStore.load()
})

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

function advanceMinorOf(accountId) {
  return Number(balanceMetrics.value.advanceMap.get(accountId) ?? 0)
}

function isAccountIncludedInAssets(account) {
  return isAssetAccountIncludedInTotals(account)
}

function isAccountIncludedInGroupStatistics(account) {
  return Number(account?.include_in_group_statistics ?? 1) === 1
}

function goLoans(tab) {
  router.push({
    name: 'loans',
    query: { tab },
  })
}

function goSecurities() {
  router.push({ name: 'securities' })
}

function goCreditCards() {
  router.push({ name: 'credit-cards' })
}

function goReimbursements() {
  router.push({ name: 'reimbursements' })
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
.assets-hello-block {
  display: grid;
  gap: 8px;
  padding: 2px 2px 4px;
}

.assets-title-row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.assets-large-title {
  margin: 0;
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.12;
}

.assets-habitat-hello {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}

.manage-link {
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  color: var(--primary);
  text-decoration: none;
  padding: 6px 0;
}

.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.page-header {
  display: flex;
  align-items: center;
}

.ledger-switcher-wrap {
  position: relative;
  z-index: 31;
}

.ledger-panel {
  position: relative;
  z-index: 30;
}

.vault-summary-head,
.accounts-island-head {
  margin-bottom: 2px;
}

.group-list,
.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.vault-metrics {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.vault-split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  background: var(--bg-soft);
}

.summary-total {
  border: 0;
  background: color-mix(in srgb, var(--secondary) 12%, var(--card) 88%);
}

.summary-stat {
  border: 0;
}

.vault-drill-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--card);
}

.vault-drill-list li + li {
  border-top: 1px solid var(--border);
}

.vault-drill-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.vault-drill-row:active {
  background: var(--bg-soft);
}

.vault-drill-label {
  font-size: 14px;
  font-weight: 650;
  color: var(--text);
}

.vault-drill-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.vault-drill-chevron {
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  font-weight: 400;
}

.summary-note {
  line-height: 1.4;
}

.summary-title-row {
  align-items: center;
  gap: 8px;
}

.summary-info-btn {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
}

.summary-info-btn:hover {
  color: var(--primary-soft);
}

.summary-info-content {
  gap: 8px;
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
  border-radius: var(--habitat-radius-tile, 14px);
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: none;
  padding: 14px 14px;
}
.account-row.excluded {
  background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
  border-color: color-mix(in srgb, var(--muted) 28%, var(--border) 72%);
  opacity: 0.88;
}
.account-row.group-stat-excluded {
  border-bottom-style: dashed;
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
  font-size: 17px;
  line-height: 1.15;
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-advance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.account-row.excluded .account-name {
  color: color-mix(in srgb, var(--text) 58%, var(--muted) 42%);
}

.account-balance {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
}
.account-row.excluded .account-balance {
  color: var(--muted);
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
  color: color-mix(in srgb, var(--primary) 68%, var(--text) 32%);
}
.account-row.excluded .account-icon {
  color: color-mix(in srgb, var(--muted) 78%, var(--text) 22%);
}

.mini-btn {
  padding: 10px 12px;
  font-size: inherit;
  border-radius: 12px;
}

</style>
