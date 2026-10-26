<template>
  <HabitatPageShell
    :title="t('credit_cards_page.title')"
    :kicker="t('credit_cards_page.habitat_hello')"
    test-id="credit-cards-page"
    hello-test-id="credit-cards-page-title"
    back-to="/features"
    stack-class="credit-cards-page"
  >

    <section class="habitat-flow-section" data-testid="credit-home-card-toggle">
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
    </section>

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
    </section>

    <section class="habitat-flow-section">
      <header class="row panel-head">
        <h3>{{ t('credit_cards_page.cards') }}</h3>
        <div class="header-actions">
          <button type="button" class="btn primary" data-testid="credit-add-open" @click="openAddCard">
            {{ t('credit_cards_page.add_card') }}
          </button>
        </div>
      </header>

      <p class="muted tip" data-testid="credit-bookkeeping-hint">
        {{ t('credit_cards_page.bookkeeping_hint') }}
      </p>
      <p class="bookkeeping-link-row">
        <RouterLink class="btn" to="/transactions/quick-add?type=expense" data-testid="credit-goto-quick-add">
          {{ t('credit_cards_page.goto_quick_add') }}
        </RouterLink>
      </p>

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
    </section>

    <InputBottomSheet
      :open="addOpen"
      :title="t('credit_cards_page.add_card')"
      :close-text="t('common.close')"
      sheet-class="sheet credit-sheet"
      @close="addOpen = false"
    >
      <label class="field">
        {{ t('credit_cards_page.card_name') }}
        <input v-model="addForm.name" class="input" maxlength="40" data-testid="credit-add-name" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.limit') }}
        <input v-model="addForm.creditLimit" class="input" inputmode="decimal" data-testid="credit-add-limit" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.current_debt') }}
        <input v-model="addForm.currentDebt" class="input" inputmode="decimal" data-testid="credit-add-debt" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.close_day') }}（1-31）
        <input v-model="addForm.closeDay" class="input" type="number" min="1" max="31" data-testid="credit-add-close-day" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.due_day') }}（1-31）
        <input v-model="addForm.dueDay" class="input" type="number" min="1" max="31" data-testid="credit-add-due-day" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.last4') }}
        <input v-model="addForm.cardLast4" class="input" maxlength="4" inputmode="numeric" data-testid="credit-add-last4" />
      </label>
      <button type="button" class="btn primary" data-testid="credit-add-submit" @click="submitAddCard">
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
        <CustomSelect
          v-model="repayForm.sourceAccountId"
          class="input-select"
          :groups="cashAccountGroups"
          :placeholder="t('credit_cards_page.source_account')"
          data-testid="credit-repay-source"
        />
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
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const creditStore = useCreditStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

const repayOpen = ref(false)
const addOpen = ref(false)
const activeCardId = ref('')

const addForm = reactive({
  name: '',
  creditLimit: '0',
  currentDebt: '0',
  closeDay: '25',
  dueDay: '15',
  cardLast4: '',
})

const repayForm = reactive({
  sourceAccountId: '',
  mode: 'full',
  amount: '',
})

const cashAccounts = computed(() =>
  (accountStore.accounts || []).filter((a) => String(a.account_kind) !== 'credit' && !a.is_archived),
)
const cashAccountGroups = computed(() => accountStore.groupedAccounts)

function formatPeriod(st) {
  return `${String(st.period_start_inclusive).slice(0, 10)} → ${String(st.period_end_exclusive).slice(0, 10)}`
}

function openAddCard() {
  addForm.name = ''
  addForm.creditLimit = '0'
  addForm.currentDebt = '0'
  addForm.closeDay = '25'
  addForm.dueDay = '15'
  addForm.cardLast4 = ''
  addOpen.value = true
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

async function submitAddCard() {
  try {
    const name = String(addForm.name || '').trim()
    if (!name) {
      uiStore.pushToast(t('credit_cards_page.card_name_required'), 'error')
      return
    }
    await creditStore.createCard({
      name,
      creditLimitMajor: Number(addForm.creditLimit),
      currentDebtMajor: Number(addForm.currentDebt),
      statementCloseDay: Number(addForm.closeDay),
      paymentDueDay: Number(addForm.dueDay),
      cardLast4: addForm.cardLast4,
    })
    await accountStore.load?.()
    addOpen.value = false
    uiStore.pushToast(t('credit_cards_page.add_ok'), 'success')
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
.header-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; }
.tip { margin: 4px 0 0; font-size: 12px; }
.bookkeeping-link-row { margin: 8px 0 12px; }
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
.input-select { width: 100%; }
.toggle { display: flex; align-items: center; gap: 8px; }
.credit-cards-page { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
</style>
