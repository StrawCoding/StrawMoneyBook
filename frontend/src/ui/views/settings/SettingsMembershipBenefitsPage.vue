<template>
  <HabitatPageShell
    :title="t('settings_membership.title')"
    :kicker="t('settings_membership.habitat_hello')"
    test-id="settings-membership-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >

    <article class="card panel">
      <p class="muted subtitle">{{ t('membership_page.subtitle') }}</p>
      <div v-if="showTrialNote" class="trial-note">
        <strong>{{ t('membership_page.first_trial_title', '第一次使用付費會員 3 天免費') }}</strong>
        <p class="muted subtitle">
          {{
            sessionUser
              ? t('membership_page.first_trial_desc', '首次可先啟用 3 天免費會員，再開始使用共同帳本等會員功能。')
              : t('membership_page.first_trial_login_desc', '第一次使用付費會員可先免費 3 天，請先登入後再啟用。')
          }}
        </p>
        <RouterLink v-if="!sessionUser" class="btn primary trial-login-btn" to="/settings/account">
          {{ t('membership_page.first_trial_login_btn', '請先登入') }}
        </RouterLink>
      </div>
      <div class="row plan-row">
        <span class="muted">{{ t('membership_page.current_plan') }}</span>
        <span class="badge">{{ currentPlanLabel }}</span>
      </div>
    </article>

    <article class="card panel membership-compare-panel">
      <h3>{{ t('membership_page.compare.detail_title') }}</h3>
      <p class="muted compare-lead">{{ t('membership_page.compare.lead') }}</p>
      <div class="membership-compare-matrix" role="table" :aria-label="t('membership_page.compare.title')">
        <div class="membership-compare-header" role="row">
          <span class="col-feature" role="columnheader">{{ t('membership_page.compare.feature') }}</span>
          <span role="columnheader">{{ t('membership_page.compare.free') }}</span>
          <span role="columnheader">{{ t('membership_page.compare.premium') }}</span>
          <span role="columnheader">{{ t('membership_page.compare.lifetime') }}</span>
        </div>
        <div
          v-for="item in compareRows"
          :key="item.key"
          class="membership-compare-data-row"
          role="row"
        >
          <span class="col-feature membership-compare-feature" role="cell">
            {{ t(item.featureKey, item.featureFallback) }}
          </span>
          <span
            v-for="tier in compareTiers"
            :key="`${item.key}-${tier}`"
            class="compare-mark"
            role="cell"
          >
            <font-awesome-icon
              v-if="compareCellMode(item, tier) === 'check'"
              icon="fa-solid fa-check"
              class="compare-check"
              aria-hidden="true"
            />
            <span v-else-if="compareCellMode(item, tier) === 'dash'" class="compare-dash" aria-hidden="true">—</span>
            <span v-else class="compare-text">{{ compareCellText(item, tier) }}</span>
          </span>
        </div>
      </div>
    </article>

    <article class="card panel">
      <h3>{{ t('membership_page.google_play.title') }}</h3>
      <p class="muted subtitle">{{ t('membership_page.google_play.desc') }}</p>
      <div class="plans-wrap">
        <button class="btn primary plan-btn" :disabled="!canUsePlayStore" @click="subscribe('monthly')">
          <span>{{ t('membership_page.google_play.monthly') }}</span>
          <strong>{{ monthlyPriceLabel }}</strong>
        </button>
        <button class="btn primary plan-btn" :disabled="!canUsePlayStore" @click="subscribe('lifetime')">
          <span>{{ t('membership_page.google_play.lifetime') }}</span>
          <strong>{{ lifetimePriceLabel }}</strong>
        </button>
      </div>
      <small v-if="loadingPrices" class="muted">{{ t('membership_page.google_play.loading_prices') }}</small>
      <small v-if="!playStoreSupported" class="muted">{{ t('membership_page.toast.billing_not_available') }}</small>
      <div class="secondary-actions">
        <button class="btn" :disabled="!canUsePlayStore" @click="restorePurchases">
          {{ t('membership_page.google_play.restore') }}
        </button>
        <button class="btn" :disabled="!canUsePlayStore" @click="openSubscriptionManagement">
          {{ t('membership_page.google_play.manage') }}
        </button>
      </div>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { getSharedLedgerSession, refreshSharedLedgerSession } from '@/services/shared-ledger/backend'
import {
  getMembershipProductDisplay,
  getMembershipProductDisplaySnapshot,
  getMembershipTier,
  isGooglePlayMembershipSupported,
  openGooglePlaySubscriptionManagement,
  redeemGooglePlayPromoCode,
  restoreGooglePlayMembership,
  subscribeGooglePlayMembership,
  syncMembershipEntitlements,
} from '@/core/services/membership.service'

const { t } = useI18n()
const uiStore = useUiStore()
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const currentTier = ref(getMembershipTier())
const loadingPrices = ref(false)
const submittingPlan = ref('')
const restoring = ref(false)
const openingManage = ref(false)
const redeeming = ref(false)
const redeemCode = ref('')
const priceDisplay = ref(getMembershipProductDisplaySnapshot())
const playStoreSupported = ref(true)

const compareTiers = ['free', 'premium', 'lifetime']

function compareCellText(row, tier) {
  if (tier === 'free') return t(row.freeKey, row.freeFallback)
  return t(row.memberKey, row.memberFallback)
}

function compareCellMode(row, tier) {
  const key = tier === 'free' ? row.freeKey : row.memberKey
  if (String(key).endsWith('.no')) return 'dash'
  if (String(key).endsWith('.yes') || String(key).endsWith('.unlimited')) return 'check'
  return 'text'
}

const compareRows = [
  {
    key: 'shared-ledgers',
    featureKey: 'membership_page.compare.shared_ledgers',
    featureFallback: '共同帳本',
    freeKey: 'membership_page.compare.free.no',
    freeFallback: '不可使用',
    memberKey: 'membership_page.compare.member.yes',
    memberFallback: '可使用',
  },
  {
    key: 'bank-sync',
    featureKey: 'membership_page.compare.bank_sync',
    featureFallback: '銀行同步',
    freeKey: 'membership_page.compare.free.no',
    freeFallback: '不可使用',
    memberKey: 'membership_page.compare.member.yes',
    memberFallback: '可使用',
  },
  {
    key: 'google-drive-ledger-sync',
    featureKey: 'membership_page.compare.google_drive_ledger_sync',
    featureFallback: '帳本同步',
    freeKey: 'membership_page.compare.free.no',
    freeFallback: '不可使用',
    memberKey: 'membership_page.compare.member.yes',
    memberFallback: '可使用',
  },
  {
    key: 'multi-ledger',
    featureKey: 'membership_page.compare.multi_ledger',
    featureFallback: '多帳本',
    freeKey: 'membership_page.compare.free.no',
    freeFallback: '不可使用',
    memberKey: 'membership_page.compare.member.yes',
    memberFallback: '可使用',
  },
  {
    key: 'ai-daily',
    featureKey: 'membership_page.compare.ai_daily',
    featureFallback: 'AI 記帳每日次數',
    freeKey: 'membership_page.compare.free.ai_daily',
    freeFallback: '每天 5 次',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
  {
    key: 'savings-jar-limit',
    featureKey: 'membership_page.compare.savings_jar_limit',
    featureFallback: '存錢罐數',
    freeKey: 'membership_page.compare.free.savings_jar_limit',
    freeFallback: '最多 1 個',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
  {
    key: 'account-limit',
    featureKey: 'membership_page.compare.account_limit',
    featureFallback: '帳戶數',
    freeKey: 'membership_page.compare.free.account_limit',
    freeFallback: '最多 3 個',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
  {
    key: 'loan-limit',
    featureKey: 'membership_page.compare.loan_limit',
    featureFallback: '借貸筆數',
    freeKey: 'membership_page.compare.free.loan_limit',
    freeFallback: '最多 5 筆',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
  {
    key: 'reimbursement-limit',
    featureKey: 'membership_page.compare.reimbursement_limit',
    featureFallback: '報銷筆數',
    freeKey: 'membership_page.compare.free.reimbursement_limit',
    freeFallback: '最多 5 筆',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
  {
    key: 'subscription-limit',
    featureKey: 'membership_page.compare.subscription_limit',
    featureFallback: '訂閱項目',
    freeKey: 'membership_page.compare.free.subscription_limit',
    freeFallback: '最多 1 個',
    memberKey: 'membership_page.compare.member.unlimited',
    memberFallback: '無限制',
  },
]

const isBusy = computed(() => Boolean(
  submittingPlan.value || restoring.value || openingManage.value || redeeming.value,
))
const showTrialNote = computed(() => !sessionUser.value || Boolean(sessionUser.value?.membership_trial_eligible))

const canUsePlayStore = computed(() => playStoreSupported.value && !isBusy.value)

const currentPlanLabel = computed(() => {
  if (currentTier.value === 'member') return t('membership_page.current_plan.member')
  return t('membership_page.current_plan.free')
})

function ensureDollarPrefix(priceText) {
  const text = String(priceText ?? '').trim()
  if (!text) return text
  if (text.includes('$')) return text
  return `$${text}`
}

const monthlyPriceLabel = computed(() => (
  ensureDollarPrefix(priceDisplay.value.monthly?.priceString || t('membership_page.google_play.monthly_price'))
))

const lifetimePriceLabel = computed(() => (
  ensureDollarPrefix(priceDisplay.value.lifetime?.priceString || t('membership_page.google_play.lifetime_price'))
))

function toErrorMessage(error, fallbackKey) {
  const code = String(error?.code ?? '').trim().toUpperCase()
  if (code === 'BILLING_NOT_AVAILABLE') return t('membership_page.toast.billing_not_available')
  if (code === 'USER_CANCELED') return t('membership_page.toast.user_canceled')
  if (code === 'STORE_UNAVAILABLE') return t('membership_page.toast.store_unavailable')
  if (code === 'PRODUCT_NOT_AVAILABLE') return t('membership_page.toast.product_unavailable')
  if (code === 'ITEM_ALREADY_OWNED') return t('membership_page.toast.already_owned')
  const fallback = error?.message ?? t(fallbackKey)
  if (code) {
    return `${fallback} (${code})`
  }
  return fallback
}

async function refreshMembershipState(reason) {
  const snapshot = await syncMembershipEntitlements(reason)
  currentTier.value = snapshot.tier
  return snapshot
}

async function loadProductPrices() {
  try {
    playStoreSupported.value = await isGooglePlayMembershipSupported({ forceRefresh: true })
  } catch (error) {
    playStoreSupported.value = true
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.store_unavailable'), 'error')
  }
  if (!playStoreSupported.value) {
    loadingPrices.value = false
    return
  }

  const hasCachedDisplay = Boolean(priceDisplay.value.monthly || priceDisplay.value.lifetime)
  loadingPrices.value = !hasCachedDisplay
  try {
    priceDisplay.value = await getMembershipProductDisplay()
  } catch (error) {
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.store_unavailable'), 'error')
  } finally {
    loadingPrices.value = false
  }
}

async function subscribe(plan) {
  if (!canUsePlayStore.value) {
    uiStore.pushToast(t('membership_page.toast.billing_not_available'), 'error')
    return
  }

  submittingPlan.value = plan
  try {
    await subscribeGooglePlayMembership(plan)
    await refreshMembershipState(`purchase_${plan}`)
    const toastKey = plan === 'lifetime'
      ? 'membership_page.toast.subscribed_lifetime'
      : 'membership_page.toast.subscribed_monthly'
    uiStore.pushToast(t(toastKey))
  } catch (error) {
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.subscribe_failed'), 'error')
  } finally {
    submittingPlan.value = ''
  }
}

async function restorePurchases() {
  if (!canUsePlayStore.value) {
    uiStore.pushToast(t('membership_page.toast.billing_not_available'), 'error')
    return
  }

  restoring.value = true
  try {
    await restoreGooglePlayMembership()
    await refreshMembershipState('restore')
    uiStore.pushToast(t('membership_page.toast.restore_success'))
  } catch (error) {
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.restore_failed'), 'error')
  } finally {
    restoring.value = false
  }
}

async function openSubscriptionManagement() {
  if (!canUsePlayStore.value) {
    uiStore.pushToast(t('membership_page.toast.billing_not_available'), 'error')
    return
  }

  openingManage.value = true
  try {
    await openGooglePlaySubscriptionManagement()
  } catch (error) {
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.manage_failed'), 'error')
  } finally {
    openingManage.value = false
  }
}

async function redeemPromoCode() {
  if (!canUsePlayStore.value) {
    uiStore.pushToast(t('membership_page.toast.billing_not_available'), 'error')
    return
  }

  const code = String(redeemCode.value ?? '').trim()
  if (!code) {
    uiStore.pushToast(t('membership_page.toast.redeem_code_required'), 'error')
    return
  }

  redeeming.value = true
  try {
    await redeemGooglePlayPromoCode(code)
    uiStore.pushToast(t('membership_page.toast.redeem_opened'))
  } catch (error) {
    uiStore.pushToast(toErrorMessage(error, 'membership_page.toast.manage_failed'), 'error')
  } finally {
    redeeming.value = false
  }
}

onMounted(async () => {
  await refreshSharedLedgerSession()
    .then((session) => {
      sessionUser.value = session?.user ?? getSharedLedgerSession()?.user ?? null
    })
    .catch(() => {
      sessionUser.value = getSharedLedgerSession()?.user ?? null
    })
  await refreshMembershipState('membership_page_open').catch(() => null)
  await loadProductPrices().catch(() => null)
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}
h2, h3 {
  margin: 0;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}
.subtitle {
  margin: 0;
}
.plan-row {
  margin-top: 2px;
}
.trial-note {
  margin-top: 4px;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary) 12%, var(--card));
  display: grid;
  gap: 6px;
}
.trial-login-btn {
  width: 100%;
  justify-content: center;
  text-decoration: none;
}
.compare-lead {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.45;
}

.membership-compare-matrix {
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 92%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  overflow: hidden;
}

.membership-compare-header,
.membership-compare-data-row {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) repeat(3, minmax(0, 0.62fr));
  align-items: center;
  column-gap: 8px;
  padding: 11px 12px;
}

.membership-compare-header {
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.membership-compare-header span:not(.col-feature) {
  text-align: center;
}

.membership-compare-data-row {
  border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}

.membership-compare-data-row:first-of-type {
  border-top: 0;
}

.membership-compare-feature {
  font-weight: 650;
  font-size: 13px;
  line-height: 1.35;
}

.compare-mark {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 22px;
}

.compare-check {
  color: #34d399;
  font-size: 15px;
}

.compare-dash {
  color: color-mix(in srgb, var(--muted) 85%, transparent);
  font-size: 16px;
  line-height: 1;
}

.compare-text {
  font-size: 10px;
  line-height: 1.25;
  text-align: center;
  color: var(--muted);
  font-weight: 600;
}
.plans-wrap {
  display: grid;
  gap: 8px;
}
.plan-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.secondary-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.redeem-wrap {
  display: grid;
  gap: 6px;
}
.redeem-label {
  font-size: 13px;
}
.redeem-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
</style>
