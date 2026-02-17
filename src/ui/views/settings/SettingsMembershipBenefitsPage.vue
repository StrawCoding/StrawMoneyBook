<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('membership_page.title') }}</h2>
        <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted subtitle">{{ t('membership_page.subtitle') }}</p>
      <div class="row plan-row">
        <span class="muted">{{ t('membership_page.current_plan') }}</span>
        <span class="badge">{{ currentPlanLabel }}</span>
      </div>
    </article>

    <article class="card panel">
      <h3>{{ t('membership_page.compare.title') }}</h3>
      <div class="compare-grid">
        <div class="compare-head muted">{{ t('membership_page.compare.feature') }}</div>
        <div class="compare-head">{{ t('membership_page.compare.free') }}</div>
        <div class="compare-head">{{ t('membership_page.compare.member') }}</div>

        <template v-for="item in compareRows" :key="item.key">
          <div class="compare-cell feature">{{ t(item.featureKey) }}</div>
          <div class="compare-cell">{{ t(item.freeKey) }}</div>
          <div class="compare-cell">{{ t(item.memberKey) }}</div>
        </template>
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
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
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
const currentTier = ref(getMembershipTier())
const loadingPrices = ref(false)
const submittingPlan = ref('')
const restoring = ref(false)
const openingManage = ref(false)
const redeeming = ref(false)
const redeemCode = ref('')
const priceDisplay = ref(getMembershipProductDisplaySnapshot())
const playStoreSupported = ref(true)

const compareRows = [
  {
    key: 'multi-ledger',
    featureKey: 'membership_page.compare.multi_ledger',
    freeKey: 'membership_page.compare.free.no',
    memberKey: 'membership_page.compare.member.yes',
  },
  {
    key: 'ai-daily',
    featureKey: 'membership_page.compare.ai_daily',
    freeKey: 'membership_page.compare.free.ai_daily',
    memberKey: 'membership_page.compare.member.unlimited',
  },
  {
    key: 'account-limit',
    featureKey: 'membership_page.compare.account_limit',
    freeKey: 'membership_page.compare.free.account_limit',
    memberKey: 'membership_page.compare.member.unlimited',
  },
  {
    key: 'loan-limit',
    featureKey: 'membership_page.compare.loan_limit',
    freeKey: 'membership_page.compare.free.loan_limit',
    memberKey: 'membership_page.compare.member.unlimited',
  },
  {
    key: 'reimbursement-limit',
    featureKey: 'membership_page.compare.reimbursement_limit',
    freeKey: 'membership_page.compare.free.reimbursement_limit',
    memberKey: 'membership_page.compare.member.unlimited',
  },
]

const isBusy = computed(() => Boolean(
  submittingPlan.value || restoring.value || openingManage.value || redeeming.value,
))

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
.subtitle {
  margin: 0;
}
.plan-row {
  margin-top: 2px;
}
.compare-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid var(--field-border);
  border-radius: 12px;
  overflow: hidden;
}
.compare-head,
.compare-cell {
  padding: 10px 12px;
  border-bottom: 1px solid var(--field-border);
  border-right: 1px solid var(--field-border);
  background: var(--surface-soft-accent);
}
.compare-head:nth-child(3n),
.compare-cell:nth-child(3n) {
  border-right: 0;
}
.compare-grid > :nth-last-child(-n + 3) {
  border-bottom: 0;
}
.feature {
  font-weight: 700;
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
