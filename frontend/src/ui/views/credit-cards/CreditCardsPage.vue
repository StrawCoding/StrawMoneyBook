<template>
  <section class="stack credit-cards-page" data-testid="credit-cards-page">
    <header class="row page-head">
      <h2 class="page-title" data-testid="credit-cards-page-title">
        <font-awesome-icon icon="fa-solid fa-credit-card" class="title-icon" />
        {{ t('credit_cards_page.title') }}
      </h2>
      <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel" data-testid="credit-home-card-toggle">
      <div class="row panel-head">
        <div>
          <h3>{{ t('credit_cards_page.home_card') }}</h3>
          <p class="muted tip">{{ t('credit_cards_page.home_card_hint') }}</p>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            data-testid="credit-home-card-enabled"
            :checked="creditStore.homeCardEnabled"
            @change="onToggleHome($event.target.checked)"
          />
          <span>{{ creditStore.homeCardEnabled ? t('common.on') : t('common.off') }}</span>
        </label>
      </div>
    </article>

    <article v-if="creditStore.reminders.length" class="card panel warn" data-testid="credit-reminders">
      <h3>{{ t('credit_cards_page.reminders') }}</h3>
      <ul class="remind-list">
        <li v-for="item in creditStore.reminders" :key="`${item.accountId}-${item.statementId}`">
          <strong>{{ item.accountName }}</strong>
          <span v-if="item.overdue" class="badge danger">{{ t('credit_cards_page.overdue') }}</span>
          <span class="muted">{{ t('credit_cards_page.due_on') }}：{{ item.dueOn || '—' }}</span>
          <MoneyText :value-minor="item.remainingMinor" />
        </li>
      </ul>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('credit_cards_page.cards') }}</h3>
        <button type="button" class="btn primary" data-testid="credit-purchase-open" @click="openPurchase">
          {{ t('credit_cards_page.purchase') }}
        </button>
      </header>

      <p v-if="!creditStore.cards.length" class="muted" data-testid="credit-cards-empty">
        {{ t('credit_cards_page.empty') }}
      </p>

      <div v-for="card in creditStore.cards" :key="card.account.id" class="card-block" data-testid="credit-card-item">
        <div class="row">
          <div>
            <strong>{{ card.account.name }}</strong>
            <small v-if="card.account.card_last4" class="muted"> ···· {{ card.account.card_last4 }}</small>
          </div>
          <button type="button" class="btn" data-testid="credit-repay-open" @click="openRepay(card)">
            {{ t('credit_cards_page.repay') }}
          </button>
        </div>
        <div class="summary-grid">
          <div>
            <small class="muted">{{ t('credit_cards_page.open_remaining') }}</small>
            <MoneyText :value-minor="card.openRemainingMinor" />
          </div>
          <div>
            <small class="muted">{{ t('credit_cards_page.limit') }}</small>
            <MoneyText :value-minor="card.creditLimitMinor" />
          </div>
        </div>
        <p v-if="card.nearLimit" class="warn-text" data-testid="credit-limit-warn">
          {{ t('credit_cards_page.near_limit') }}
        </p>
        <div v-if="card.statements.length" class="stmt-list">
          <div v-for="st in card.statements" :key="st.id" class="stmt-row">
            <span>{{ formatPeriod(st) }}</span>
            <span class="muted">{{ st.status }}</span>
            <span v-if="st.due_on">{{ t('credit_cards_page.due_on') }} {{ st.due_on }}</span>
            <MoneyText :value-minor="st.remaining_minor" />
          </div>
        </div>
      </div>
    </article>

    <InputBottomSheet
      :open="purchaseOpen"
      :title="t('credit_cards_page.purchase')"
      :close-text="t('common.close')"
      sheet-class="sheet credit-sheet"
      @close="purchaseOpen = false"
    >
      <label class="field">
        {{ t('credit_cards_page.card') }}
        <select v-model="purchaseForm.accountId" class="input" data-testid="credit-purchase-account">
          <option v-for="card in creditStore.cards" :key="card.account.id" :value="card.account.id">
            {{ card.account.name }}
          </option>
        </select>
      </label>
      <label class="field">
        {{ t('credit_cards_page.category') }}
        <select v-model="purchaseForm.categoryId" class="input" data-testid="credit-purchase-category">
          <option v-for="cat in expenseCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </label>
      <label class="field">
        {{ t('credit_cards_page.amount') }}
        <input v-model="purchaseForm.amount" class="input" inputmode="decimal" data-testid="credit-purchase-amount" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.occurred_at') }}
        <input v-model="purchaseForm.occurredAt" type="datetime-local" class="input" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.posted_at') }}
        <input v-model="purchaseForm.postedAt" type="datetime-local" class="input" data-testid="credit-purchase-posted-at" />
      </label>
      <button type="button" class="btn primary" data-testid="credit-purchase-submit" @click="submitPurchase">
        {{ t('common.save') }}
      </button>
    </InputBottomSheet>

    <InputBottomSheet
      :open="repayOpen"
      :title="t('credit_cards_page.repay')"
      :close-text="t('common.close')"
      sheet-class="sheet credit-sheet"
      @close="repayOpen = false"
    >
      <label class="field">
        {{ t('credit_cards_page.source_account') }}
        <select v-model="repayForm.sourceAccountId" class="input" data-testid="credit-repay-source">
          <option v-for="acc in cashAccounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
        </select>
      </label>
      <label class="field">
        {{ t('credit_cards_page.mode') }}
        <select v-model="repayForm.mode" class="input" data-testid="credit-repay-mode">
          <option value="full">{{ t('credit_cards_page.mode_full') }}</option>
          <option value="custom">{{ t('credit_cards_page.mode_custom') }}</option>
        </select>
      </label>
      <label class="field">
        {{ t('credit_cards_page.amount') }}
        <input v-model="repayForm.amount" class="input" inputmode="decimal" data-testid="credit-repay-amount" />
      </label>
      <button type="button" class="btn primary" data-testid="credit-repay-submit" @click="submitRepay">
        {{ t('common.save') }}
      </button>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const creditStore = useCreditStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()

const purchaseOpen = ref(false)
const repayOpen = ref(false)
const activeCardId = ref('')

const purchaseForm = reactive({
  accountId: '',
  categoryId: '',
  amount: '',
  occurredAt: '',
  postedAt: '',
})

const repayForm = reactive({
  sourceAccountId: '',
  mode: 'full',
  amount: '',
})

const expenseCategories = computed(() =>
  (categoryStore.categories || []).filter((c) => ['expense', 'both'].includes(String(c.kind))),
)

const cashAccounts = computed(() =>
  (accountStore.accounts || []).filter((a) => String(a.account_kind) !== 'credit' && !a.is_archived),
)

function toLocalInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatPeriod(st) {
  return `${String(st.period_start_inclusive).slice(0, 10)} → ${String(st.period_end_exclusive).slice(0, 10)}`
}

function openPurchase() {
  purchaseForm.accountId = creditStore.cards[0]?.account?.id || ''
  purchaseForm.categoryId = expenseCategories.value[0]?.id || ''
  purchaseForm.amount = ''
  purchaseForm.occurredAt = toLocalInputValue()
  purchaseForm.postedAt = purchaseForm.occurredAt
  purchaseOpen.value = true
}

function openRepay(card) {
  activeCardId.value = card.account.id
  repayForm.sourceAccountId = cashAccounts.value[0]?.id || ''
  repayForm.mode = 'full'
  repayForm.amount = String((card.openRemainingMinor || 0) / 100)
  repayOpen.value = true
}

async function onToggleHome(enabled) {
  await creditStore.setHomeCardEnabled(enabled)
}

async function submitPurchase() {
  try {
    const amountMinor = Math.round(Math.abs(Number(purchaseForm.amount)) * 100)
    await creditStore.purchase({
      accountId: purchaseForm.accountId,
      categoryId: purchaseForm.categoryId,
      amountMinor,
      occurredAt: new Date(purchaseForm.occurredAt).toISOString(),
      postedAt: new Date(purchaseForm.postedAt).toISOString(),
    })
    purchaseOpen.value = false
    uiStore.pushToast(t('credit_cards_page.purchase_ok'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function submitRepay() {
  try {
    const amountMinor = Math.round(Math.abs(Number(repayForm.amount)) * 100)
    await creditStore.repay({
      accountId: activeCardId.value,
      sourceAccountId: repayForm.sourceAccountId,
      amountMinor,
      mode: repayForm.mode,
    })
    repayOpen.value = false
    uiStore.pushToast(t('credit_cards_page.repay_ok'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

onMounted(async () => {
  await Promise.all([
    accountStore.load?.() || Promise.resolve(),
    categoryStore.load?.() || Promise.resolve(),
    creditStore.load(),
  ])
})
</script>

<style scoped>
.page-head { align-items: center; gap: 8px; }
.page-title { margin: 0; font-size: 20px; display: flex; align-items: center; gap: 8px; }
.title-icon { opacity: 0.85; }
.panel { padding: 14px; }
.panel-head { align-items: center; justify-content: space-between; gap: 8px; }
.tip { margin: 4px 0 0; font-size: 12px; }
.card-block { padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.card-block:first-of-type { border-top: 0; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.stmt-list { margin-top: 10px; display: grid; gap: 6px; }
.stmt-row { display: grid; grid-template-columns: 1.4fr 0.5fr 1fr auto; gap: 6px; font-size: 12px; }
.warn { border-color: color-mix(in srgb, #f59e0b 40%, var(--border)); }
.warn-text { color: #b45309; font-size: 13px; }
.remind-list { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 8px; }
.badge.danger { color: #b91c1c; font-size: 12px; margin-left: 6px; }
.field { display: grid; gap: 6px; margin-bottom: 10px; }
.toggle { display: flex; align-items: center; gap: 8px; }
.credit-cards-page { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
</style>
