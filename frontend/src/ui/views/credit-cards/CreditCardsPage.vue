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
        <label class="habitat-switch">
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

    <section v-if="creditStore.reminders.length" class="habitat-flow-section warn-section" data-testid="credit-reminders">
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
          <label class="habitat-switch compact">
            <input
              type="checkbox"
              data-testid="credit-show-archived"
              :checked="creditStore.showArchived"
              @change="onToggleArchived($event.target.checked)"
            />
            <span>{{ t('credit_cards_page.show_archived') }}</span>
          </label>
          <RouterLink class="btn" to="/settings/credit-due-reminder" data-testid="credit-due-reminder-settings">
            {{ t('credit_cards_page.due_reminder_settings') }}
          </RouterLink>
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

      <p v-if="!visibleCards.length" class="muted" data-testid="credit-cards-empty">
        {{ t('credit_cards_page.empty') }}
      </p>

      <div
        v-for="card in visibleCards"
        :key="card.account.id"
        class="card-block"
        :class="{ archived: card.account.is_archived }"
        :data-testid="'credit-card-item'"
        :id="'credit-card-' + card.account.id"
      >
        <div class="row">
          <div>
            <strong>{{ card.account.name }}</strong>
            <small v-if="card.account.card_last4" class="muted"> ···· {{ card.account.card_last4 }}</small>
            <span v-if="card.account.is_archived" class="badge muted">{{ t('credit_cards_page.archived_badge') }}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn" data-testid="credit-edit-open" @click="openEdit(card)">
              {{ t('common.edit') }}
            </button>
            <button
              v-if="!card.account.is_archived"
              type="button"
              class="btn"
              data-testid="credit-repay-open"
              @click="openRepay(card)"
            >
              {{ t('credit_cards_page.repay') }}
            </button>
            <button type="button" class="btn danger" data-testid="credit-delete-open" @click="openDelete(card)">
              {{ t('common.delete') }}
            </button>
          </div>
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
          <div>
            <small class="muted">{{ t('credit_cards_page.utilization') }}</small>
            <span>{{ utilizationLabel(card) }}</span>
          </div>
          <div v-if="nearestDue(card)">
            <small class="muted">{{ t('credit_cards_page.nearest_due') }}</small>
            <span>{{ nearestDue(card) }}</span>
          </div>
        </div>
        <p v-if="card.nearLimit" class="warn-text" data-testid="credit-limit-warn">
          {{ t('credit_cards_page.near_limit') }}
        </p>
        <div v-if="card.statements.length" class="stmt-list">
          <button
            v-for="st in card.statements"
            :key="st.id"
            type="button"
            class="stmt-row stmt-link"
            data-testid="credit-statement-row"
            @click="goStatement(card.account.id, st.id)"
          >
            <span>{{ formatPeriod(st) }}</span>
            <span class="muted">{{ statusLabel(st.status) }}</span>
            <span v-if="st.due_on" class="muted">{{ t('credit_cards_page.due_on') }} {{ st.due_on }}</span>
            <MoneyText :value-minor="st.remaining_minor" />
          </button>
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
      :open="editOpen"
      :title="t('credit_cards_page.edit_card')"
      :close-text="t('common.close')"
      sheet-class="sheet credit-sheet"
      @close="editOpen = false"
    >
      <label class="field">
        {{ t('credit_cards_page.card_name') }}
        <input v-model="editForm.name" class="input" maxlength="40" data-testid="credit-edit-name" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.limit') }}
        <input v-model="editForm.creditLimit" class="input" inputmode="decimal" data-testid="credit-edit-limit" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.close_day') }}（1-31）
        <input v-model="editForm.closeDay" class="input" type="number" min="1" max="31" data-testid="credit-edit-close-day" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.due_day') }}（1-31）
        <input v-model="editForm.dueDay" class="input" type="number" min="1" max="31" data-testid="credit-edit-due-day" />
      </label>
      <label class="field">
        {{ t('credit_cards_page.last4') }}
        <input v-model="editForm.cardLast4" class="input" maxlength="4" inputmode="numeric" data-testid="credit-edit-last4" />
      </label>
      <button v-if="!editForm.isArchived" type="button" class="btn" data-testid="credit-archive-btn" @click="submitArchive">
        {{ t('credit_cards_page.archive_card') }}
      </button>
      <button v-else type="button" class="btn" data-testid="credit-restore-btn" @click="submitRestore">
        {{ t('credit_cards_page.restore_card') }}
      </button>
      <button type="button" class="btn primary" data-testid="credit-edit-submit" @click="submitEditCard">
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
        <select v-model="repayForm.mode" class="input" data-testid="credit-repay-mode" @change="refreshRepayPreview">
          <option value="full">{{ t('credit_cards_page.mode_full') }}</option>
          <option value="custom">{{ t('credit_cards_page.mode_custom') }}</option>
        </select>
      </label>
      <label class="field">
        {{ t('credit_cards_page.amount') }}
        <input
          v-model="repayForm.amount"
          class="input"
          inputmode="decimal"
          data-testid="credit-repay-amount"
          @input="refreshRepayPreview"
        />
      </label>
      <div v-if="repayPreview.length" class="alloc-preview" data-testid="credit-repay-preview">
        <small class="muted">{{ t('credit_cards_page.repay_preview') }}</small>
        <ul>
          <li v-for="(row, idx) in repayPreview" :key="idx">
            <span>{{ formatPeriod(row.statement || row) }}</span>
            <MoneyText :value-minor="row.amountMinor" />
          </li>
        </ul>
      </div>
      <button type="button" class="btn primary" data-testid="credit-repay-submit" @click="submitRepay">
        {{ t('common.save') }}
      </button>
    </InputBottomSheet>

    <AppDialog
      :open="deleteOpen"
      :title="t('credit_cards_page.delete_title')"
      :message="deleteMessage"
      :confirm-text="t('common.confirm_delete')"
      :loading="deleting"
      :loading-text="t('common.processing')"
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const creditStore = useCreditStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const router = useRouter()
const route = useRoute()

const repayOpen = ref(false)
const addOpen = ref(false)
const editOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const activeCardId = ref('')
const deleteTarget = ref(null)
const repayPreview = ref([])

const addForm = reactive({
  name: '',
  creditLimit: '0',
  currentDebt: '0',
  closeDay: '25',
  dueDay: '15',
  cardLast4: '',
})

const editForm = reactive({
  accountId: '',
  name: '',
  creditLimit: '0',
  closeDay: '25',
  dueDay: '15',
  cardLast4: '',
  isArchived: false,
})

const repayForm = reactive({
  sourceAccountId: '',
  mode: 'full',
  amount: '',
})

const visibleCards = computed(() => {
  const cards = creditStore.cards || []
  if (creditStore.showArchived) return cards
  return cards.filter((c) => !c.account?.is_archived)
})

const cashAccounts = computed(() =>
  (accountStore.accounts || []).filter((a) => String(a.account_kind) !== 'credit' && !a.is_archived),
)
const cashAccountGroups = computed(() => accountStore.groupedAccounts)

const deleteMessage = computed(() => {
  const name = deleteTarget.value?.account?.name ?? ''
  return t('credit_cards_page.delete_confirm', { name })
})

function formatPeriod(st) {
  return `${String(st.period_start_inclusive).slice(0, 10)} → ${String(st.period_end_exclusive).slice(0, 10)}`
}

function statusLabel(status) {
  if (status === 'closed') return t('credit_cards_page.status_closed')
  if (status === 'open') return t('credit_cards_page.status_open')
  return String(status ?? '')
}

function utilizationLabel(card) {
  const pct = Math.round(Number(card.utilization ?? 0) * 100)
  return `${pct}%`
}

function nearestDue(card) {
  const withDue = (card.statements || []).filter((s) => s.due_on && Number(s.remaining_minor) > 0)
  if (!withDue.length) return ''
  withDue.sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))
  return withDue[0].due_on
}

function goStatement(accountId, statementId) {
  router.push({
    name: 'credit-statement-detail',
    params: { accountId, statementId },
  })
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

function openEdit(card) {
  editForm.accountId = card.account.id
  editForm.name = card.account.name
  editForm.creditLimit = String((card.creditLimitMinor || 0) / 100)
  editForm.closeDay = String(card.account.statement_close_day ?? 25)
  editForm.dueDay = String(card.account.payment_due_day ?? 15)
  editForm.cardLast4 = card.account.card_last4 ?? ''
  editForm.isArchived = Boolean(card.account.is_archived)
  editOpen.value = true
}

function openDelete(card) {
  deleteTarget.value = card
  deleteOpen.value = true
}

function closeDelete() {
  if (deleting.value) return
  deleteOpen.value = false
  deleteTarget.value = null
}

async function confirmDelete() {
  const card = deleteTarget.value
  if (!card?.account?.id) return
  deleting.value = true
  try {
    const result = await creditStore.removeCard(card.account.id)
    await accountStore.load?.()
    const msg = result?.deleted
      ? t('credit_cards_page.delete_ok_removed')
      : t('credit_cards_page.delete_ok_archived')
    uiStore.pushToast(msg, 'success')
    closeDelete()
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    deleting.value = false
  }
}

function openRepay(card) {
  activeCardId.value = card.account.id
  repayForm.sourceAccountId = cashAccounts.value[0]?.id || ''
  repayForm.mode = 'full'
  repayForm.amount = String((card.debtMinor || card.openRemainingMinor || 0) / 100)
  repayOpen.value = true
  refreshRepayPreview()
}

async function refreshRepayPreview() {
  if (!activeCardId.value || !repayOpen.value) {
    repayPreview.value = []
    return
  }
  const amountMinor = Math.round(Math.abs(Number(repayForm.amount)) * 100)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    repayPreview.value = []
    return
  }
  try {
    repayPreview.value = await creditStore.previewRepay({
      accountId: activeCardId.value,
      amountMinor,
    })
  } catch {
    repayPreview.value = []
  }
}

async function onToggleHome(enabled) {
  await creditStore.setHomeCardEnabled(enabled)
}

async function onToggleArchived(enabled) {
  await creditStore.setShowArchived(enabled)
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

async function submitEditCard() {
  try {
    const name = String(editForm.name || '').trim()
    if (!name) {
      uiStore.pushToast(t('credit_cards_page.card_name_required'), 'error')
      return
    }
    await creditStore.updateCard(editForm.accountId, {
      name,
      creditLimitMajor: Number(editForm.creditLimit),
      statementCloseDay: Number(editForm.closeDay),
      paymentDueDay: Number(editForm.dueDay),
      cardLast4: editForm.cardLast4,
    })
    await accountStore.load?.()
    editOpen.value = false
    uiStore.pushToast(t('credit_cards_page.edit_ok'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function submitArchive() {
  try {
    await creditStore.archiveCard(editForm.accountId)
    await accountStore.load?.()
    editOpen.value = false
    uiStore.pushToast(t('credit_cards_page.archive_ok'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function submitRestore() {
  try {
    await creditStore.restoreCard(editForm.accountId)
    await accountStore.load?.()
    editForm.isArchived = false
    uiStore.pushToast(t('credit_cards_page.restore_ok'), 'success')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function submitRepay() {
  try {
    const amountMinor = Math.round(Math.abs(Number(repayForm.amount)) * 100)
    const result = await creditStore.repay({
      accountId: activeCardId.value,
      sourceAccountId: repayForm.sourceAccountId,
      amountMinor,
      mode: repayForm.mode,
    })
    repayOpen.value = false
    const n = Array.isArray(result?.allocations) ? result.allocations.length : repayPreview.value.length
    uiStore.pushToast(
      n > 0 ? t('credit_cards_page.repay_ok_alloc', { count: n }) : t('credit_cards_page.repay_ok'),
      'success',
    )
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

onMounted(async () => {
  await Promise.all([
    accountStore.load?.() || Promise.resolve(),
    creditStore.load(),
  ])
  const anchor = String(route.query.account ?? '').trim()
  if (anchor) {
    requestAnimationFrame(() => {
      document.getElementById(`credit-card-${anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
})

watch(() => repayForm.mode, refreshRepayPreview)
</script>

<style scoped>
.panel-head { align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.header-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.habitat-switch.compact { font-size: 12px; }
.tip { margin: 4px 0 0; font-size: 12px; }
.bookkeeping-link-row { margin: 8px 0 12px; }
.card-block { padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.card-block.archived { opacity: 0.75; }
.card-block:first-of-type { border-top: 0; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.stmt-list { margin-top: 10px; display: grid; gap: 6px; }
.stmt-row { display: grid; grid-template-columns: 1.4fr 0.5fr 1fr auto; gap: 6px; font-size: 12px; text-align: left; width: 100%; background: transparent; border: 0; padding: 6px 0; cursor: pointer; color: inherit; }
.stmt-link:hover { background: color-mix(in srgb, var(--border) 35%, transparent); border-radius: 6px; }
.warn-section { border-left: 3px solid #f59e0b; padding-left: 10px; }
.warn-text { color: #b45309; font-size: 13px; }
.remind-list { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 8px; }
.badge.danger { color: #b91c1c; font-size: 12px; margin-left: 6px; }
.field { display: grid; gap: 6px; margin-bottom: 10px; }
.input-select { width: 100%; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.alloc-preview ul { list-style: none; padding: 0; margin: 4px 0 0; display: grid; gap: 4px; font-size: 12px; }
.alloc-preview li { display: flex; justify-content: space-between; gap: 8px; }
.credit-cards-page { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
</style>
