<template>
  <section class="stack securities-detail-page" data-testid="securities-detail-page">
    <header class="row page-head">
      <h2 class="page-title">{{ detail?.security?.name || t('securities_page.detail_title') }}</h2>
      <RouterLink class="btn back-btn" to="/assets/securities">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="detail" class="card panel">
      <p class="muted symbol-line">
        {{ detail.security.symbol }} · {{ assetClassLabel(detail.security.asset_class) }}
        <template v-if="settlementLabel"> · {{ settlementLabel }}</template>
      </p>
      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.qty_label') }}</small>
          <strong>{{ detail.position.quantity }}</strong>
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.invested') }}</small>
          <MoneyText :value-minor="detail.position.investedMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.market_value') }}</small>
          <MoneyText :value-minor="detail.position.marketValueMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.delta') }}</small>
          <MoneyText :value-minor="detail.position.deltaMinor" />
        </div>
      </div>

      <label class="field mt">
        {{ t('securities_page.symbol') }}
        <input v-model.trim="profileForm.symbol" class="input" maxlength="20" data-testid="securities-edit-symbol" />
      </label>
      <label class="field mt">
        {{ t('securities_page.name') }}
        <input v-model.trim="profileForm.name" class="input" maxlength="80" data-testid="securities-edit-name" />
      </label>
      <label class="field mt">
        {{ t('securities_page.asset_class') }}
        <CustomSelect v-model="profileForm.assetClass" :options="assetClassOptions" />
      </label>

      <label class="field mt">
        {{ t('securities_page.manual_price') }}
        <div class="row price-row">
          <input v-model.number="priceMajor" class="input" type="number" min="0" step="0.01" />
          <button type="button" class="btn" :disabled="savingPrice" @click="savePrice">{{ t('common.save') }}</button>
        </div>
      </label>

      <label class="field mt" data-testid="securities-edit-settlement">
        {{ t('securities_page.settlement_account') }}
        <CustomSelect
          v-model="settlementAccountId"
          :groups="settlementAccountGroups"
          :placeholder="t('securities_page.settlement_account')"
        />
      </label>
      <button
        type="button"
        class="btn mt"
        data-testid="securities-save-profile"
        :disabled="savingProfile"
        @click="saveProfile"
      >{{ t('securities_page.save_profile') }}</button>

      <button
        type="button"
        class="switch-row mt"
        :class="{ active: includeInAssets }"
        role="checkbox"
        :aria-checked="includeInAssets ? 'true' : 'false'"
        @click="toggleInclude"
      >
        <span>{{ t('account.include_in_assets_label') }}</span>
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </button>

      <div class="row danger-row mt">
        <button type="button" class="btn danger" @click="deleteSecurity">{{ t('securities_page.delete_security') }}</button>
      </div>
    </article>

    <article v-if="detail" class="card panel">
      <header class="row panel-head">
        <h3>{{ t('securities_page.transactions') }}</h3>
        <div class="row actions">
          <button type="button" class="btn" data-testid="securities-open-buy" @click="openTx('buy')">{{ t('securities_page.buy') }}</button>
          <button type="button" class="btn primary" data-testid="securities-open-sell" @click="openTx('sell')">{{ t('securities_page.sell') }}</button>
        </div>
      </header>
      <ul v-if="detail.transactions.length" class="tx-list">
        <li v-for="tx in detail.transactions" :key="tx.id" class="tx-row">
          <div class="tx-icon-col" data-testid="securities-tx-icon">
            <font-awesome-icon :icon="txIcon(tx)" class="tx-icon" />
          </div>
          <div class="tx-main">
            <strong>{{ tx.type === 'sell' ? t('securities_page.sell') : t('securities_page.buy') }}</strong>
            <small class="muted">{{ formatWhen(tx.occurred_at) }}</small>
            <small class="muted">{{ t('securities_page.settle_at') }}：{{ formatWhen(tx.settle_at) }}</small>
            <small v-if="linkedBuyLabel(tx)" class="muted" data-testid="securities-sell-linked-buy">{{ linkedBuyLabel(tx) }}</small>
            <small class="status" :data-status="tx.settlement_status">{{ statusLabel(tx.settlement_status) }}</small>
          </div>
          <div class="tx-metrics">
            <span v-if="tx.quantity">{{ t('securities_page.qty', { count: tx.quantity }) }}</span>
            <MoneyText :value-minor="tx.type === 'sell' ? tx.proceeds_minor : tx.principal_minor" />
            <small class="muted">{{ t('securities_page.fee') }} <MoneyText :value-minor="tx.fee_minor" /></small>
            <div class="tx-actions">
              <button
                v-if="tx.settlement_status === 'scheduled'"
                type="button"
                class="btn tiny"
                @click="confirmEarly(tx)"
              >{{ t('securities_page.confirm_early') }}</button>
              <button
                v-if="tx.settlement_status === 'scheduled'"
                type="button"
                class="btn tiny"
                @click="openReschedule(tx)"
              >{{ t('securities_page.reschedule') }}</button>
              <button
                v-if="tx.settlement_status !== 'cancelled'"
                type="button"
                class="btn tiny"
                @click="cancelTx(tx)"
              >{{ t('securities_page.cancel_settlement') }}</button>
              <button
                v-if="tx.settlement_status !== 'confirmed'"
                type="button"
                class="btn tiny"
                @click="openEditTx(tx)"
              >{{ t('common.edit') }}</button>
              <button type="button" class="btn tiny danger" @click="deleteTx(tx)">{{ t('common.delete') }}</button>
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="muted">{{ t('securities_page.no_transactions') }}</p>
    </article>

    <InputBottomSheet
      :open="txOpen"
      :title="txSheetTitle"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet securities-sheet'"
      :show-footer="true"
      @close="txOpen = false"
    >
      <div class="mode-row">
        <span class="muted">{{ t('securities_page.record_mode') }}</span>
        <div class="seg">
          <button type="button" class="seg-btn" :class="{ active: txForm.recordMode === 'position' }" @click="txForm.recordMode = 'position'">
            {{ t('securities_page.record_position') }}
          </button>
          <button type="button" class="seg-btn" :class="{ active: txForm.recordMode === 'funds' }" @click="txForm.recordMode = 'funds'">
            {{ t('securities_page.record_funds') }}
          </button>
        </div>
      </div>

      <template v-if="txForm.recordMode === 'position'">
        <div v-if="isPositionSell" class="field-block" data-testid="securities-sell-source-buy">
          <span class="field-label">{{ t('securities_page.sell_source_buy') }}</span>
          <CustomSelect
            v-model="txForm.sourceBuyTxId"
            :options="sourceBuyOptions"
            :placeholder="t('securities_page.sell_source_buy')"
          />
          <small class="muted">{{ t('securities_page.sell_source_buy_hint') }}</small>
          <small v-if="!sourceBuyOptions.length" class="muted">{{ t('securities_page.sell_no_open_lots') }}</small>
        </div>
        <label>
          {{ t('securities_page.quantity') }}
          <input v-model.number="txForm.quantity" class="input" type="number" min="0" step="1" data-testid="securities-tx-quantity" />
        </label>
        <label v-if="!isLotMatchedSell" data-testid="securities-sell-unit-price">
          {{ t('securities_page.unit_price') }}
          <input v-model.number="txForm.priceMajor" class="input" type="number" min="0" step="0.01" />
        </label>
        <label v-if="isPositionSell" data-testid="securities-sell-proceeds">
          {{ t('securities_page.sell_proceeds') }}
          <input v-model.number="txForm.proceedsMajor" class="input" type="number" min="0" step="0.01" />
        </label>
        <div v-if="sellLotPreview" class="sell-preview" data-testid="securities-sell-preview">
          <small class="muted">{{ t('securities_page.sell_preview_cost') }}</small>
          <MoneyText :value-minor="sellLotPreview.principalMinor" />
          <small class="muted">{{ t('securities_page.sell_preview_pnl') }}</small>
          <MoneyText :value-minor="sellLotPreview.pnlMinor" />
        </div>
      </template>
      <template v-else>
        <label>
          {{ t('securities_page.principal') }}
          <input v-model.number="txForm.principalMajor" class="input" type="number" min="0" step="0.01" />
        </label>
        <label v-if="txForm.type === 'sell'">
          {{ t('securities_page.proceeds') }}
          <input v-model.number="txForm.proceedsMajor" class="input" type="number" min="0" step="0.01" />
        </label>
      </template>

      <label>
        {{ t('securities_page.fee') }}
        <input v-model.number="txForm.feeMajor" class="input" type="number" min="0" step="0.01" />
      </label>
      <label>
        {{ t('securities_page.fee_mode') }}
        <CustomSelect v-model="txForm.feeMode" :options="feeModeOptions" />
      </label>
      <div class="field-block">
        <span class="field-label">{{ t('securities_page.occurred_at') }}</span>
        <DateTimePickerField
          :date="txForm.date"
          :hour="txForm.hour"
          :minute="txForm.minute"
          @update:date="txForm.date = $event"
          @update:hour="txForm.hour = $event"
          @update:minute="txForm.minute = $event"
        />
      </div>
      <label>
        {{ t('common.note') }}
        <input v-model.trim="txForm.note" class="input" maxlength="120" />
      </label>
      <template #footer>
        <button type="button" class="btn" @click="txOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" data-testid="securities-tx-save" :disabled="savingTx || !canSaveTx" @click="submitTx">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="rescheduleOpen"
      :title="t('securities_page.reschedule')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet securities-sheet'"
      :show-footer="true"
      @close="rescheduleOpen = false"
    >
      <div class="field-block">
        <span class="field-label">{{ t('securities_page.settle_at') }}</span>
        <DateTimePickerField
          :date="rescheduleForm.date"
          :hour="rescheduleForm.hour"
          :minute="rescheduleForm.minute"
          @update:date="rescheduleForm.date = $event"
          @update:hour="rescheduleForm.hour = $event"
          @update:minute="rescheduleForm.minute = $event"
        />
      </div>
      <template #footer>
        <button type="button" class="btn" @click="rescheduleOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" @click="submitReschedule">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'
import {
  derivePositionSellFromBuyLot,
  findBuyLotOrThrow,
  listOpenBuyLots,
} from '@/core/utils/securities-sell-lot'

const props = defineProps({
  id: { type: String, required: true },
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const securityStore = useSecurityStore()
const uiStore = useUiStore()
const savingPrice = ref(false)
const savingProfile = ref(false)
const savingTx = ref(false)
const txOpen = ref(false)
const editingTxId = ref('')
const rescheduleOpen = ref(false)
const rescheduleTxId = ref('')
const priceMajor = ref(0)
const includeInAssets = ref(true)
const settlementAccountId = ref('')
const profileForm = reactive({
  symbol: '',
  name: '',
  assetClass: 'stock',
})
const txForm = reactive({
  type: 'buy',
  recordMode: 'position',
  quantity: 1,
  priceMajor: 0,
  feeMajor: 0,
  feeMode: 'into_cost',
  principalMajor: 0,
  proceedsMajor: 0,
  date: '',
  hour: 9,
  minute: 0,
  note: '',
  sourceBuyTxId: '',
})
const rescheduleForm = reactive({
  date: '',
  hour: 10,
  minute: 0,
})

const detail = computed(() => securityStore.detail)
const securityId = computed(() => String(props.id || route.params.id || '').trim())
const settlementAccountGroups = computed(() => buildAccountOptionGroups(
  accountStore.groups,
  securityStore.candidateAccounts || [],
))
const settlementLabel = computed(() => {
  const id = detail.value?.security?.settlement_account_id
  const found = (securityStore.candidateAccounts || []).find((acc) => acc.id === id)
  return found?.name || ''
})
const feeModeOptions = computed(() => [
  { value: 'into_cost', label: t('securities_page.fee_into_cost') },
  { value: 'from_proceeds', label: t('securities_page.fee_from_proceeds') },
])
const assetClassOptions = computed(() => [
  { value: 'stock', label: t('securities_page.class.stock') },
  { value: 'etf', label: t('securities_page.class.etf') },
])
const txSheetTitle = computed(() => {
  const base = txForm.type === 'sell' ? t('securities_page.sell') : t('securities_page.buy')
  return editingTxId.value ? `${t('common.edit')} ${base}` : base
})
const isPositionSell = computed(() => txForm.type === 'sell' && txForm.recordMode === 'position')
const isLotMatchedSell = computed(() => isPositionSell.value && Boolean(String(txForm.sourceBuyTxId || '').trim()))
const openBuyLots = computed(() => listOpenBuyLots(detail.value?.transactions || [], {
  excludeSellId: editingTxId.value,
  securityId: securityId.value,
}))
const sourceBuyOptions = computed(() => openBuyLots.value.map((lot) => ({
  value: lot.buyId,
  label: t('securities_page.sell_lot_option', {
    when: formatWhen(lot.occurredAt),
    qty: lot.remainingQty,
    cost: formatMajor(lot.remainingPrincipalMinor),
  }),
})))
const sellLotPreview = computed(() => {
  if (!isLotMatchedSell.value) return null
  try {
    const buy = findBuyLotOrThrow(detail.value?.transactions || [], txForm.sourceBuyTxId, {
      securityId: securityId.value,
    })
    return derivePositionSellFromBuyLot({
      buy,
      transactions: detail.value?.transactions || [],
      sellQty: txForm.quantity,
      proceedsGrossMinor: Math.round(Number(txForm.proceedsMajor || 0) * 100),
      feeMinor: Math.round(Number(txForm.feeMajor || 0) * 100),
      feeMode: txForm.feeMode,
      excludeSellId: editingTxId.value,
    })
  } catch {
    return null
  }
})
const canSaveTx = computed(() => {
  if (!isPositionSell.value) return true
  if (isLotMatchedSell.value) {
    return Number(txForm.quantity) > 0 && Number(txForm.proceedsMajor) > 0
  }
  if (editingTxId.value) return Number(txForm.quantity) > 0
  return false
})

function assetClassLabel(value) {
  return value === 'etf' ? t('securities_page.class.etf') : t('securities_page.class.stock')
}

function statusLabel(status) {
  if (status === 'confirmed') return t('securities_page.status_confirmed')
  if (status === 'cancelled') return t('securities_page.status_cancelled')
  return t('securities_page.status_scheduled')
}

function txIcon(tx) {
  return tx?.type === 'sell' ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'
}

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value ?? '')
  }
}

function formatMajor(minor) {
  return (Math.max(0, Number(minor) || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function linkedBuyLabel(tx) {
  const buyId = String(tx?.source_buy_tx_id ?? '').trim()
  if (!buyId || tx?.type !== 'sell') return ''
  const buy = (detail.value?.transactions || []).find((row) => String(row.id) === buyId)
  if (!buy) return ''
  return t('securities_page.sell_linked_buy', { when: formatWhen(buy.occurred_at) })
}

function applySelectedLotDefaults({ resetQuantity = false } = {}) {
  if (!isPositionSell.value) return
  const lots = openBuyLots.value
  if (!lots.length) {
    txForm.sourceBuyTxId = ''
    return
  }
  const selected = lots.find((lot) => lot.buyId === txForm.sourceBuyTxId) || lots[0]
  txForm.sourceBuyTxId = selected.buyId
  if (resetQuantity || Number(txForm.quantity) <= 0 || Number(txForm.quantity) > selected.remainingQty) {
    txForm.quantity = selected.remainingQty
  }
}

function toDateInput(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function syncFromDetail() {
  if (!detail.value?.security) return
  priceMajor.value = Number(detail.value.security.manual_price_minor ?? 0) / 100
  includeInAssets.value = Number(detail.value.security.include_in_assets ?? 1) === 1
  settlementAccountId.value = String(detail.value.security.settlement_account_id ?? '')
  profileForm.symbol = String(detail.value.security.symbol ?? '')
  profileForm.name = String(detail.value.security.name ?? '')
  profileForm.assetClass = detail.value.security.asset_class === 'etf' ? 'etf' : 'stock'
}

async function reload() {
  await Promise.all([
    accountStore.load?.() || Promise.resolve(),
    securityStore.loadAccounts(),
  ])
  await securityStore.loadDetail(securityId.value)
  syncFromDetail()
}

async function savePrice() {
  if (savingPrice.value || !securityId.value) return
  savingPrice.value = true
  try {
    await securityStore.update(securityId.value, {
      manualPriceMinor: Math.round(Number(priceMajor.value || 0) * 100),
    })
    uiStore.pushToast(t('securities_page.price_saved'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    savingPrice.value = false
  }
}

async function saveProfile() {
  if (savingProfile.value || !securityId.value) return
  savingProfile.value = true
  try {
    await securityStore.update(securityId.value, {
      symbol: profileForm.symbol,
      name: profileForm.name || profileForm.symbol,
      assetClass: profileForm.assetClass,
      settlementAccountId: settlementAccountId.value,
      includeInAssets: includeInAssets.value,
      manualPriceMinor: Math.round(Number(priceMajor.value || 0) * 100),
    })
    uiStore.pushToast(t('securities_page.profile_saved'))
    await reload()
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    savingProfile.value = false
  }
}

async function toggleInclude() {
  includeInAssets.value = !includeInAssets.value
  try {
    await securityStore.update(securityId.value, { includeInAssets: includeInAssets.value })
  } catch (error) {
    includeInAssets.value = !includeInAssets.value
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function deleteSecurity() {
  if (!window.confirm(t('securities_page.delete_security_confirm'))) return
  try {
    await securityStore.remove(securityId.value)
    uiStore.pushToast(t('securities_page.deleted'))
    router.replace('/assets/securities')
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

function openTx(type) {
  const now = new Date()
  editingTxId.value = ''
  txForm.type = type
  txForm.recordMode = 'position'
  txForm.quantity = 1
  txForm.priceMajor = priceMajor.value || 0
  txForm.feeMajor = 0
  txForm.feeMode = 'into_cost'
  txForm.principalMajor = 0
  txForm.proceedsMajor = 0
  txForm.sourceBuyTxId = ''
  txForm.date = toDateInput(now)
  txForm.hour = now.getHours()
  txForm.minute = now.getMinutes()
  txForm.note = ''
  if (type === 'sell') applySelectedLotDefaults({ resetQuantity: true })
  txOpen.value = true
}

function openEditTx(tx) {
  editingTxId.value = tx.id
  txForm.type = tx.type === 'sell' ? 'sell' : 'buy'
  txForm.recordMode = tx.record_mode === 'funds' ? 'funds' : 'position'
  txForm.quantity = Number(tx.quantity || 0)
  txForm.priceMajor = Number(tx.price_minor || 0) / 100
  txForm.feeMajor = Number(tx.fee_minor || 0) / 100
  txForm.feeMode = tx.fee_mode === 'from_proceeds' ? 'from_proceeds' : 'into_cost'
  txForm.principalMajor = Number(tx.principal_minor || 0) / 100
  const bookedProceeds = Number(tx.proceeds_minor || 0)
  const feeMinor = Number(tx.fee_minor || 0)
  txForm.proceedsMajor = (
    tx.type === 'sell' && tx.fee_mode === 'from_proceeds'
      ? bookedProceeds + feeMinor
      : bookedProceeds
  ) / 100
  txForm.sourceBuyTxId = String(tx.source_buy_tx_id ?? '')
  const when = new Date(tx.occurred_at)
  txForm.date = toDateInput(when)
  txForm.hour = when.getHours()
  txForm.minute = when.getMinutes()
  txForm.note = tx.note || ''
  txOpen.value = true
}

function buildTxPayload() {
  const occurred = new Date(`${txForm.date}T${String(txForm.hour).padStart(2, '0')}:${String(txForm.minute).padStart(2, '0')}:00`)
  const payload = {
    securityId: securityId.value,
    type: txForm.type,
    recordMode: txForm.recordMode,
    feeMode: txForm.feeMode,
    feeMinor: Math.round(Number(txForm.feeMajor || 0) * 100),
    occurredAt: occurred.toISOString(),
    note: txForm.note,
  }
  if (txForm.recordMode === 'position') {
    payload.quantity = Math.trunc(Number(txForm.quantity || 0))
    payload.priceMinor = Math.round(Number(txForm.priceMajor || 0) * 100)
    if (txForm.type === 'sell') {
      payload.sourceBuyTxId = String(txForm.sourceBuyTxId || '').trim() || null
      payload.proceedsMinor = Math.round(Number(txForm.proceedsMajor || 0) * 100)
    }
  } else {
    payload.quantity = 0
    payload.priceMinor = 0
    payload.principalMinor = Math.round(Number(txForm.principalMajor || 0) * 100)
    if (txForm.type === 'sell') {
      payload.proceedsMinor = Math.round(Number(txForm.proceedsMajor || 0) * 100)
    }
  }
  return payload
}

async function submitTx() {
  if (savingTx.value || !securityId.value) return
  savingTx.value = true
  try {
    const payload = buildTxPayload()
    if (editingTxId.value) {
      await securityStore.updateEvent(editingTxId.value, payload, securityId.value)
    } else if (txForm.type === 'sell') {
      await securityStore.sell(payload)
    } else {
      await securityStore.buy(payload)
    }
    txOpen.value = false
    uiStore.pushToast(t('securities_page.tx_saved'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    savingTx.value = false
  }
}

async function confirmEarly(tx) {
  try {
    await securityStore.confirmSettlement(tx.id, securityId.value, { force: true })
    uiStore.pushToast(t('securities_page.confirmed'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function cancelTx(tx) {
  if (!window.confirm(t('securities_page.cancel_confirm'))) return
  try {
    await securityStore.cancelSettlement(tx.id, securityId.value)
    uiStore.pushToast(t('securities_page.cancelled'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

async function deleteTx(tx) {
  if (!window.confirm(t('securities_page.delete_tx_confirm'))) return
  try {
    await securityStore.removeTransaction(tx.id, securityId.value)
    uiStore.pushToast(t('securities_page.tx_deleted'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

function openReschedule(tx) {
  rescheduleTxId.value = tx.id
  const when = new Date(tx.settle_at || Date.now())
  rescheduleForm.date = toDateInput(when)
  rescheduleForm.hour = when.getHours()
  rescheduleForm.minute = when.getMinutes()
  rescheduleOpen.value = true
}

async function submitReschedule() {
  try {
    const when = new Date(`${rescheduleForm.date}T${String(rescheduleForm.hour).padStart(2, '0')}:${String(rescheduleForm.minute).padStart(2, '0')}:00`)
    await securityStore.rescheduleSettlement(rescheduleTxId.value, when.toISOString(), securityId.value)
    rescheduleOpen.value = false
    uiStore.pushToast(t('securities_page.rescheduled'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

watch(securityId, () => { void reload() }, { immediate: true })
watch(
  () => [txForm.type, txForm.recordMode, txForm.sourceBuyTxId, txOpen.value],
  () => {
    if (!txOpen.value) return
    applySelectedLotDefaults()
  },
)
onMounted(() => { void reload() })
</script>

<style scoped>
.securities-detail-page {
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px) + var(--bottom-nav-height, 64px));
  overflow-x: hidden;
}
.page-head { align-items: center; justify-content: space-between; gap: 12px; }
.page-title { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.panel { padding: 14px; overflow: hidden; }
.symbol-line { margin: 0 0 10px; overflow-wrap: anywhere; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: var(--input-bg);
  display: grid;
  gap: 4px;
  min-width: 0;
}
.field { display: grid; gap: 6px; }
.mt { margin-top: 12px; }
.price-row { gap: 8px; align-items: center; }
.panel-head { align-items: center; justify-content: space-between; gap: 8px; }
.actions { gap: 8px; flex-wrap: wrap; }
.tx-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.tx-row {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  background: var(--input-bg);
  min-width: 0;
}
.tx-icon-col {
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 2px;
}
.tx-icon { font-size: 16px; color: var(--primary); }
.tx-main { display: grid; gap: 2px; min-width: 0; flex: 1; }
.tx-metrics { display: grid; gap: 2px; justify-items: end; text-align: right; }
.tx-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; margin-top: 6px; }
.btn.tiny { padding: 4px 8px; font-size: 12px; }
.btn.danger { color: var(--danger, #c0392b); }
.status[data-status='confirmed'] { color: var(--primary); }
.status[data-status='cancelled'] { color: var(--muted); }
.status[data-status='scheduled'] { color: #b7791f; }
.form-wrap { gap: 12px; }
.field-block { display: grid; gap: 6px; }
.field-label { font-size: 13px; font-weight: 600; }
.mode-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--input-bg);
}
.seg-btn {
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}
.seg-btn.active {
  background: color-mix(in srgb, var(--primary) 22%, transparent);
  color: var(--primary);
  font-weight: 600;
}
.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text);
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.switch-track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 35%, transparent);
  position: relative;
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 150ms ease;
}
.switch-row.active .switch-track { background: color-mix(in srgb, var(--primary) 70%, transparent); }
.switch-row.active .switch-thumb { transform: translateX(18px); }
.danger-row { justify-content: flex-end; }
.sell-preview {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input-bg);
}
</style>
