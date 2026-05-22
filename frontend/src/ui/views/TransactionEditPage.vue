<template>
  <section class="stack transaction-edit-page">
    <header class="row page-head">
      <h2>{{ t('transaction_about.edit_transaction') }}</h2>
      <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
    </header>

    <article class="card panel">
      <div v-if="loading" class="muted">{{ t('app.loading') }}</div>
      <template v-else-if="transaction">
        <div class="type-grid">
          <button
            v-for="item in typeOptions"
            :key="item.value"
            type="button"
            class="btn"
            :class="{ primary: model.type === item.value }"
            @click="model.type = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="stack form-wrap">
          <label class="field">
            {{ amountFieldLabel }}
            <input
              v-model.number="model.amountMajor"
              class="input"
              type="number"
              :min="model.type === 'adjustment' ? undefined : 0"
              step="0.01"
            />
          </label>

          <div class="field">
            <div class="date-extra-row">
              <div class="field">
                <span>{{ t('common.transaction_time') }}</span>
                <DateTimePickerField
                  :date="model.occurredDate"
                  :hour="model.occurredHour"
                  :minute="model.occurredMinute"
                  @update:date="model.occurredDate = $event"
                  @update:hour="model.occurredHour = $event"
                  @update:minute="model.occurredMinute = $event"
                />
              </div>
              <button type="button" class="btn extra-btn" :class="{ active: showExtra }" @click="showExtra = true">
                {{ t('common.extra_info') }}
              </button>
            </div>
          </div>

          <div v-if="model.type === 'transfer'" class="inline-grid">
            <label class="field">
              {{ t('quick_add.field.from_account') }}
              <CustomSelect v-model="model.accountId" :groups="transferAccountGroups" />
            </label>
            <label class="field">
              {{ t('quick_add.field.to_account') }}
              <CustomSelect v-model="model.peerAccountId" :groups="transferAccountGroups" />
            </label>
          </div>
          <section v-if="model.type === 'transfer'" class="fx-panel">
            <div class="fx-row">
              <small class="muted">{{ t('quick_add.field.transfer_currencies') }}</small>
              <strong>{{ transferFromCurrency }} → {{ transferToCurrency }}</strong>
            </div>
            <template v-if="transferNeedsExchangeRate">
              <div class="fx-mode-grid">
                <button type="button" class="btn" :class="{ primary: model.exchangeRateMode === 'system' }" @click="model.exchangeRateMode = 'system'">
                  {{ t('quick_add.fx.mode.system') }}
                </button>
                <button type="button" class="btn" :class="{ primary: model.exchangeRateMode === 'manual' }" @click="model.exchangeRateMode = 'manual'">
                  {{ t('quick_add.fx.mode.manual') }}
                </button>
              </div>
              <label v-if="model.exchangeRateMode === 'manual'" class="field">
                {{ t('quick_add.field.manual_exchange_rate', { from: transferFromCurrency, to: transferToCurrency }) }}
                <input
                  v-model.trim="model.manualExchangeRateInput"
                  type="text"
                  inputmode="decimal"
                  class="input"
                  :placeholder="t('quick_add.placeholder.manual_exchange_rate')"
                />
              </label>
              <div v-else class="fx-system-row">
                <small class="muted">{{ t('quick_add.fx.snapshot_label', { label: transferSnapshotInfoLabel }) }}</small>
                <button type="button" class="btn" :class="{ busy: exchangeRateSyncing }" :disabled="exchangeRateSyncing" @click="syncExchangeRateSnapshotNow">
                  {{ exchangeRateSyncing ? t('quick_add.fx.syncing') : t('quick_add.fx.sync_now') }}
                </button>
              </div>
              <p class="muted fx-note">
                {{ t('quick_add.fx.resolved_rate', { from: transferFromCurrency, rate: transferResolvedRateLabel, to: transferToCurrency }) }}
              </p>
              <p class="muted fx-note">
                {{ t('quick_add.fx.estimate_receive', { amount: formatCurrencyMinor(transferEstimatedReceiveMinor, transferToCurrency) }) }}
              </p>
            </template>
            <p v-else class="muted fx-note">{{ t('quick_add.fx.same_currency') }}</p>
          </section>

          <label v-else-if="model.type === 'adjustment'" class="field">
            {{ t('common.account') }}
            <CustomSelect v-model="model.accountId" :groups="directAccountGroups" />
          </label>

          <div v-else class="inline-grid">
            <label class="field">
              {{ t('common.account') }}
              <CustomSelect v-model="model.accountId" :groups="directAccountGroups" />
            </label>
            <label class="field">
              {{ t('common.category') }}
              <CustomSelect v-model="model.categoryId" :groups="categoryGroupsByType" />
            </label>
          </div>
        </div>

        <footer class="row action-row">
          <button class="btn danger" :class="{ busy: deleting }" :disabled="deleting || submitting" @click="openDeleteConfirm">
            {{ t('common.delete') }}
          </button>
          <div class="footer-actions">
            <button class="btn" :disabled="submitting" @click="goBack">{{ t('common.cancel') }}</button>
            <button class="btn primary" :class="{ busy: submitting }" :disabled="submitting || isSubmitDisabled" @click="submit">
              {{ t('common.save') }}
            </button>
          </div>
        </footer>
      </template>
      <p v-else class="muted">{{ t('transaction_about.not_found') }}</p>
    </article>

    <InputBottomSheet
      :open="showExtra"
      :title="t('quick_add.extra.title')"
      :body-class="'stack extra-content'"
      :sheet-class="'extra-sheet'"
      :close-text="t('common.done')"
      @close="showExtra = false"
    >
      <div class="addon-wrap">
        <div class="row">
          <span class="field-label">{{ t('quick_add.extra.addon_title') }}</span>
          <button type="button" class="btn" @click="addAddonRow">{{ t('common.add_item') }}</button>
        </div>

        <div v-for="item in addonRows" :key="item.id" class="addon-row">
          <CustomSelect
            v-model="item.optionId"
            class="addon-name"
            :options="addonTemplateOptions"
            @update:model-value="onAddonOptionChange(item, $event)"
          />
          <CustomSelect v-model="item.direction" class="addon-dir" :options="addonDirectionOptions" />
          <input
            v-model.number="item.amountMajor"
            class="input addon-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
          />
          <button type="button" class="btn danger addon-remove" @click="removeAddonRow(item.id)">
            {{ t('common.delete') }}
          </button>
        </div>

        <div class="row">
          <small class="addon-desc">{{ t('quick_add.extra.manage_hint') }}</small>
        </div>
      </div>

      <label class="field">
        {{ t('common.note') }}
        <textarea v-model.trim="model.note" class="textarea" rows="3" />
      </label>

      <div v-if="model.type !== 'transfer' && model.type !== 'adjustment'" class="switch-list">
        <button
          v-if="model.type === 'expense'"
          type="button"
          class="switch-row"
          :class="{ active: model.isReimbursable }"
          role="switch"
          :aria-checked="model.isReimbursable ? 'true' : 'false'"
          @click="model.isReimbursable = !model.isReimbursable"
        >
          <span>{{ t('quick_add.extra.reimbursable') }}</span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
      </div>

      <div class="switch-grid">
        <button
          type="button"
          class="switch-row"
          :class="{ active: model.includeInBudget }"
          role="switch"
          :aria-checked="model.includeInBudget ? 'true' : 'false'"
          @click="model.includeInBudget = !model.includeInBudget"
        >
          <span>{{ t('quick_add.extra.include_budget') }}</span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
        <button
          type="button"
          class="switch-row"
          :class="{ active: model.includeInAnalysis }"
          role="switch"
          :aria-checked="model.includeInAnalysis ? 'true' : 'false'"
          @click="model.includeInAnalysis = !model.includeInAnalysis"
        >
          <span>{{ t('quick_add.extra.include_analysis') }}</span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
      </div>
    </InputBottomSheet>

    <AppDialog
      :open="deleteConfirmOpen"
      :title="t('transaction_edit.delete_title', '確認刪除')"
      :message="t('transaction_edit.delete_message', '確定要刪除這筆交易？')"
      :confirm-text="t('common.delete')"
      :loading="deleting"
      :loading-text="t('transaction_edit.deleting', '處理中...')"
      @close="closeDeleteConfirm"
      @confirm="confirmRemove"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { loadTransactionDetailContext } from '@/core/services/transaction-query.service'
import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { getCurrentLocale, useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import {
  addonDeltaMajorFromNote,
  mergeAddonItemsToNote,
  parseAddonItemsFromNote,
  stripAddonSummaryFromNote,
} from '@/ui/utils/addon-note'
import {
  convertAmountMinorByRate,
  getExchangeRateSnapshot,
  resolveCrossExchangeRate,
  syncCbcExchangeRateSnapshot,
} from '@/ui/services/exchange-rate.service'

const TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS = 8000

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const addonTemplateStore = useAddonTemplateStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()

const loading = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const showExtra = ref(false)
const applyingCategoryDefaults = ref(false)
const hydratingTransactionModel = ref(false)
const deleteConfirmOpen = ref(false)
const transaction = ref(null)
const allTransactions = ref([])
const addonRows = ref([])
const exchangeRateSyncing = ref(false)
const exchangeRateSnapshot = ref({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})
let addonSeq = 1

const model = reactive({
  type: 'expense',
  amountMajor: 0,
  occurredDate: '',
  occurredHour: 0,
  occurredMinute: 0,
  accountId: '',
  peerAccountId: '',
  categoryId: '',
  note: '',
  isReimbursable: false,
  includeInBudget: true,
  includeInAnalysis: true,
  exchangeRateMode: 'system',
  manualExchangeRateInput: '',
})

const txId = computed(() => String(route.params.id ?? '').trim())
const directAccountGroups = computed(() => accountStore.groupedRegularAccounts)
const transferAccountGroups = computed(() => accountStore.groupedAccounts)
const categoryGroupsByType = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})
const addonDirectionOptions = [
  { value: 'plus', label: '+' },
  { value: 'minus', label: '-' },
]
const addonTemplateItems = computed(() => addonTemplateStore.templates)
const addonTemplateOptions = computed(() => addonTemplateItems.value.map((item) => ({
  value: item.id,
  label: item.label,
})))
const typeOptions = computed(() => {
  if (transaction.value?.type === 'transfer' || transaction.value?.transfer_group_id) {
    return [{ value: 'transfer', label: t('transaction.type.transfer') }]
  }
  if (String(transaction.value?.origin_type ?? '').trim() === 'refund') {
    return [{ value: 'adjustment', label: t('transaction.type.adjustment', '結餘') }]
  }
  const options = [
    { value: 'expense', label: t('transaction.type.expense') },
    { value: 'income', label: t('transaction.type.income') },
  ]
  if (transaction.value?.type === 'adjustment') {
    options.push({ value: 'adjustment', label: t('transaction.type.adjustment', '結餘') })
  }
  return options
})
const amountFieldLabel = computed(() => {
  return model.type === 'adjustment'
    ? t('transaction_edit.amount_adjustment', '結餘金額（元，可正負）')
    : t('common.amount_yuan')
})
const transferPeerTransaction = computed(() => {
  const current = transaction.value
  if (!current?.transfer_group_id) return null
  return allTransactions.value.find((item) => item.id !== current.id && item.transfer_group_id === current.transfer_group_id) ?? null
})
const transferOutTransaction = computed(() => {
  if (!transaction.value?.transfer_group_id) return null
  return [transaction.value, transferPeerTransaction.value].find((item) => Number(item?.amount_minor ?? 0) < 0) ?? transaction.value
})
const transferInTransaction = computed(() => {
  if (!transaction.value?.transfer_group_id) return null
  return [transaction.value, transferPeerTransaction.value].find((item) => item && item.id !== transferOutTransaction.value?.id) ?? transferPeerTransaction.value
})
const transferFromCurrency = computed(() => accountCurrencyCode(model.accountId))
const transferToCurrency = computed(() => accountCurrencyCode(model.peerAccountId))
const transferNeedsExchangeRate = computed(() => model.type === 'transfer' && transferFromCurrency.value !== transferToCurrency.value)
const transferResolvedRate = computed(() => {
  if (!transferNeedsExchangeRate.value) return 1
  if (model.exchangeRateMode === 'manual') {
    const manualRate = Number(model.manualExchangeRateInput)
    if (!Number.isFinite(manualRate) || manualRate <= 0) return null
    return manualRate
  }
  return resolveCrossExchangeRate(
    exchangeRateSnapshot.value?.rates,
    transferFromCurrency.value,
    transferToCurrency.value,
  )
})
const transferResolvedRateLabel = computed(() => {
  if (!transferNeedsExchangeRate.value) return '1'
  const rate = Number(transferResolvedRate.value)
  if (!Number.isFinite(rate) || rate <= 0) return '-'
  return rate.toFixed(6)
})
const isManualTransferRateInvalid = computed(() => {
  if (model.type !== 'transfer' || !transferNeedsExchangeRate.value || model.exchangeRateMode !== 'manual') return false
  const rate = Number(model.manualExchangeRateInput)
  return !Number.isFinite(rate) || rate <= 0
})
const isSubmitDisabled = computed(() => isManualTransferRateInvalid.value)
const transferEstimatedReceiveMinor = computed(() => {
  const baseAmountMinor = Math.round(Math.abs(Number(model.amountMajor ?? 0)) * 100)
  if (baseAmountMinor <= 0) return 0
  const rate = Number(transferResolvedRate.value)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return convertAmountMinorByRate(baseAmountMinor, rate)
})
const transferSnapshotInfoLabel = computed(() => {
  if (!exchangeRateSnapshot.value?.syncedAt) return t('quick_add.fx.not_synced')
  const parsed = new Date(exchangeRateSnapshot.value.syncedAt)
  if (Number.isNaN(parsed.getTime())) return t('quick_add.fx.not_synced')
  return `${parsed.toLocaleString(getCurrentLocale())}（資料日期 ${exchangeRateSnapshot.value.effectiveDate || '-'}）`
})

watch(
  () => model.type,
  (type) => {
    if (type === 'transfer') {
      model.categoryId = ''
      model.isReimbursable = false
      return
    }
    if (type === 'adjustment') {
      model.categoryId = ''
      model.isReimbursable = false
      return
    }
    model.categoryId = ensureCategoryIdByType(type, model.categoryId)
    if (type !== 'expense') {
      model.isReimbursable = false
    }
  },
)

watch(
  () => model.isReimbursable,
  (next, prev) => {
    if (applyingCategoryDefaults.value || hydratingTransactionModel.value) return
    if (next && !prev) {
      model.includeInBudget = false
      model.includeInAnalysis = false
    }
  },
)

watch(
  () => model.categoryId,
  (categoryId) => {
    if (hydratingTransactionModel.value) return
    if (!categoryId || model.type === 'transfer' || model.type === 'adjustment') return
    void applyCategoryDefaults(categoryId)
  },
)

watch(
  () => showExtra.value,
  (open) => {
    if (!open) return
    if (!addonRows.value.length) {
      addonRows.value = [createAddonRow()]
    }
  },
)

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void load()
    void loadExchangeRateSnapshot()
  },
  { immediate: true },
)

watch(
  () => txId.value,
  () => {
    void load()
  },
)

function toDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toOccurredAtIso(dateInput, hourInput, minuteInput) {
  const dateText = String(dateInput ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return ''
  const hour = Number(hourInput)
  const minute = Number(minuteInput)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return ''
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return ''
  const parsed = new Date(`${dateText}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

function ensureCategoryIdByType(type, currentCategoryId) {
  const groups = type === 'income' ? categoryStore.incomeCategoryGroups : categoryStore.expenseCategoryGroups
  const ids = groups.flatMap((group) => group.categories ?? []).map((item) => item.id)
  if (ids.includes(currentCategoryId)) return currentCategoryId
  return ids[0] ?? ''
}

async function applyCategoryDefaults(categoryId) {
  const cat = categoryStore.categories.find((c) => c.id === categoryId)
  if (!cat) return
  applyingCategoryDefaults.value = true
  model.isReimbursable = model.type === 'expense' && Boolean(cat.default_is_reimbursable)
  model.includeInBudget = Boolean(cat.default_include_in_budget ?? 1)
  model.includeInAnalysis = Boolean(cat.default_include_in_analysis ?? 1)
  await nextTick()
  applyingCategoryDefaults.value = false
}

function accountCurrencyCode(accountId) {
  const raw = accountStore.accounts.find((item) => item.id === accountId)?.currency_code
  return normalizeCurrencyCode(raw, 'TWD')
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function formatAmountInput(value) {
  const rounded = round2(value)
  if (!Number.isFinite(rounded)) return ''
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function formatCurrencyMinor(amountMinor, currencyCode = 'TWD') {
  const value = Number(amountMinor || 0) / 100
  return new Intl.NumberFormat(getCurrentLocale(), {
    style: 'currency',
    currency: normalizeCurrencyCode(currencyCode),
    maximumFractionDigits: 2,
  }).format(value)
}

function createAddonRow() {
  const defaultOption = addonTemplateItems.value[0] ?? { id: 'addon-default', label: t('quick_add.extra.addon_title'), defaultDirection: 'plus' }
  return {
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: defaultOption.id,
    direction: defaultOption.defaultDirection === 'minus' ? 'minus' : 'plus',
    amountMajor: null,
  }
}

function addAddonRow() {
  addonRows.value.push(createAddonRow())
}

function removeAddonRow(rowId) {
  addonRows.value = addonRows.value.filter((item) => item.id !== rowId)
}

function onAddonOptionChange(row, optionId) {
  if (!row) return
  row.optionId = optionId
  const matched = addonTemplateItems.value.find((item) => String(item.id) === String(optionId))
  if (!matched) return
  row.direction = matched.defaultDirection === 'minus' ? 'minus' : 'plus'
}

function addonLabelOf(optionId) {
  return addonTemplateItems.value.find((item) => item.id === optionId)?.label ?? t('quick_add.extra.addon_title')
}

function collectAppliedAddonItems() {
  return addonRows.value
    .map((item) => ({
      label: addonLabelOf(item.optionId),
      direction: item.direction === 'minus' ? 'minus' : 'plus',
      deltaMajor: round2(Math.abs(Number(item.amountMajor ?? 0))),
    }))
    .filter((item) => item.deltaMajor > 0)
}

function parseAddonRowsFromNote(note) {
  return parseAddonItemsFromNote(note).map((item) => ({
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: findAddonOptionId(item.label),
    direction: item.direction === 'minus' ? 'minus' : 'plus',
    amountMajor: round2(Math.abs(Number(item.deltaMajor ?? 0))),
  }))
}

function findAddonOptionId(label) {
  const normalizedLabel = String(label ?? '').trim().toLowerCase()
  const exact = addonTemplateItems.value.find((item) => String(item.label ?? '').trim().toLowerCase() === normalizedLabel)
  if (exact) return exact.id
  return addonTemplateItems.value[0]?.id ?? 'addon-default'
}

async function loadExchangeRateSnapshot() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) return
  try {
    exchangeRateSnapshot.value = await getExchangeRateSnapshot(ledgerId)
  } catch {
    // Ignore snapshot failures on page load.
  }
}

function hasSystemExchangeRateReady() {
  if (!transferNeedsExchangeRate.value) return true
  const rate = resolveCrossExchangeRate(
    exchangeRateSnapshot.value?.rates,
    transferFromCurrency.value,
    transferToCurrency.value,
  )
  return Number.isFinite(rate) && rate > 0
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer != null) {
      globalThis.clearTimeout(timer)
    }
  })
}

async function syncExchangeRateSnapshotNow() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId || exchangeRateSyncing.value) return false
  exchangeRateSyncing.value = true
  try {
    exchangeRateSnapshot.value = await syncCbcExchangeRateSnapshot(ledgerId)
    uiStore.pushToast(t('quick_add.toast.rate_synced', { date: exchangeRateSnapshot.value.effectiveDate || '-' }))
    return true
  } catch (error) {
    uiStore.pushToast(error.message ?? t('quick_add.toast.rate_sync_failed'), 'error')
    return false
  } finally {
    exchangeRateSyncing.value = false
  }
}

async function resolveTransferRateOrThrow() {
  if (!transferNeedsExchangeRate.value) return 1

  if (model.exchangeRateMode === 'manual') {
    const manualRate = Number(model.manualExchangeRateInput)
    if (!Number.isFinite(manualRate) || manualRate <= 0) {
      throw new Error(t('quick_add.error.invalid_rate'))
    }
    return manualRate
  }

  if (!hasSystemExchangeRateReady()) {
    await loadExchangeRateSnapshot()
  }
  if (!hasSystemExchangeRateReady()) {
    await withTimeout(
      syncExchangeRateSnapshotNow(),
      TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS,
      t('quick_add.error.rate_sync_timeout'),
    )
  }

  const rate = resolveCrossExchangeRate(
    exchangeRateSnapshot.value?.rates,
    transferFromCurrency.value,
    transferToCurrency.value,
  )
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(t('quick_add.error.rate_unavailable'))
  }
  return rate
}

async function load() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId || !txId.value) {
    transaction.value = null
    return
  }

  loading.value = true
  try {
    await Promise.all([
      accountStore.load(),
      categoryStore.load(),
      addonTemplateStore.load(),
    ])
    const detailContext = await loadTransactionDetailContext(ledgerId, txId.value)
    allTransactions.value = detailContext.allTransactions
    transaction.value = detailContext.transaction
    hydrateModelFromTransaction()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_about.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function hydrateModelFromTransaction() {
  const tx = transaction.value
  if (!tx) return

  hydratingTransactionModel.value = true
  showExtra.value = false
  deleteConfirmOpen.value = false

  if (tx.transfer_group_id) {
    const outTx = transferOutTransaction.value ?? tx
    const inTx = transferInTransaction.value ?? tx
    const occurred = new Date(outTx.occurred_at)
    const addonDeltaMajor = addonDeltaMajorFromNote(outTx.note)
    const outgoingMajor = Math.abs(Number(outTx.amount_minor ?? 0)) / 100
    const baseMajor = round2(outgoingMajor - addonDeltaMajor)
    const incomingMajor = Math.abs(Number(inTx?.amount_minor ?? 0)) / 100
    const manualRate = baseMajor > 0 ? round2(incomingMajor / baseMajor) : 0

    model.type = 'transfer'
    model.amountMajor = Math.max(0, baseMajor)
    model.occurredDate = toDateInput(occurred)
    model.occurredHour = occurred.getHours()
    model.occurredMinute = occurred.getMinutes()
    model.accountId = outTx.account_id ?? ''
    model.peerAccountId = inTx?.account_id ?? ''
    model.categoryId = ''
    model.note = stripAddonSummaryFromNote(outTx.note)
    model.isReimbursable = false
    model.includeInBudget = Boolean(Number(outTx.include_in_budget ?? 1))
    model.includeInAnalysis = Boolean(Number(outTx.include_in_analysis ?? 1))
    model.exchangeRateMode = transferNeedsExchangeRate.value && manualRate > 0 ? 'manual' : 'system'
    model.manualExchangeRateInput = transferNeedsExchangeRate.value && manualRate > 0 ? formatAmountInput(manualRate) : ''
    addonRows.value = parseAddonRowsFromNote(outTx.note)
    void nextTick(() => {
      hydratingTransactionModel.value = false
    })
    return
  }

  const occurred = new Date(tx.occurred_at)
  const amountMinor = Number(tx.amount_minor ?? 0)
  model.type = tx.type === 'income' ? 'income' : tx.type === 'adjustment' ? 'adjustment' : 'expense'
  model.amountMajor = model.type === 'adjustment' ? amountMinor / 100 : Math.abs(amountMinor) / 100
  model.occurredDate = toDateInput(occurred)
  model.occurredHour = occurred.getHours()
  model.occurredMinute = occurred.getMinutes()
  model.accountId = tx.account_id ?? ''
  model.peerAccountId = ''
  model.categoryId = model.type === 'adjustment' ? '' : tx.category_id ?? ensureCategoryIdByType(model.type, '')
  model.note = stripAddonSummaryFromNote(tx.note)
  model.isReimbursable = Boolean(tx.is_reimbursable) && model.type === 'expense'
  model.includeInBudget = Boolean(Number(tx.include_in_budget ?? 1))
  model.includeInAnalysis = Boolean(Number(tx.include_in_analysis ?? 1))
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
  addonRows.value = parseAddonRowsFromNote(tx.note)
  void nextTick(() => {
    hydratingTransactionModel.value = false
  })
}

async function submit() {
  if (!transaction.value || submitting.value) return

  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  if (!occurredAt) {
    uiStore.pushToast(t('quick_add.error.invalid_occurred_at'), 'error')
    return
  }

  const appliedAddonItems = collectAppliedAddonItems()
  const addonDeltaMajor = appliedAddonItems.reduce((total, item) => (
    total + (item.direction === 'plus' ? item.deltaMajor : -item.deltaMajor)
  ), 0)
  const baseAmountMajor = Number(model.amountMajor ?? 0)
  const baseAmountMinor = Math.round(Math.abs(baseAmountMajor) * 100)
  const sourceExtraMinor = Math.round(addonDeltaMajor * 100)
  const settledAmountMajor = round2(baseAmountMajor + addonDeltaMajor)
  const settledAmountMinorRaw = Math.round(settledAmountMajor * 100)
  const settledAmountMinor = Math.round(Math.abs(settledAmountMajor) * 100)
  const noteText = mergeAddonItemsToNote(String(model.note ?? '').trim(), appliedAddonItems)

  if (!model.accountId) {
    uiStore.pushToast(t('quick_add.error.account_required'), 'error')
    return
  }
  if (model.type !== 'transfer' && model.type !== 'adjustment' && !model.categoryId) {
    uiStore.pushToast(t('quick_add.error.category_required'), 'error')
    return
  }

  if (model.type === 'transfer') {
    if (baseAmountMinor <= 0) {
      uiStore.pushToast(t('quick_add.error.transfer_base_amount_invalid'), 'error')
      return
    }
    if (baseAmountMinor + sourceExtraMinor <= 0) {
      uiStore.pushToast(t('quick_add.error.transfer_total_amount_invalid'), 'error')
      return
    }
    if (!model.peerAccountId) {
      uiStore.pushToast(t('quick_add.error.to_account_required'), 'error')
      return
    }
    if (model.peerAccountId === model.accountId) {
      uiStore.pushToast(t('quick_add.error.same_account'), 'error')
      return
    }
    if (isManualTransferRateInvalid.value) {
      uiStore.pushToast(t('quick_add.error.invalid_rate'), 'error')
      return
    }
  } else if (model.type === 'adjustment') {
    if (!settledAmountMinorRaw) {
      uiStore.pushToast(t('transaction_edit.amount_adjustment_invalid', '調整金額不可為 0'), 'error')
      return
    }
  } else if (settledAmountMinorRaw < 0) {
    uiStore.pushToast(t('quick_add.error.amount_required'), 'error')
    return
  }

  submitting.value = true
  try {
    if (model.type === 'transfer') {
      const transferRate = await resolveTransferRateOrThrow()
      const toAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(baseAmountMinor, transferRate)
        : baseAmountMinor
      await transactionStore.updateTransaction(transaction.value.id, {
        type: 'transfer',
        amountMinor: baseAmountMinor,
        toAmountMinor,
        sourceExtraMinor,
        occurredAt,
        accountId: model.accountId,
        peerAccountId: model.peerAccountId,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else if (model.type === 'income') {
      await transactionStore.updateTransaction(transaction.value.id, {
        type: 'income',
        amountMinor: settledAmountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else if (model.type === 'adjustment') {
      await transactionStore.updateTransaction(transaction.value.id, {
        type: 'adjustment',
        amountMinor: settledAmountMinorRaw,
        occurredAt,
        accountId: model.accountId,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else {
      await transactionStore.updateTransaction(transaction.value.id, {
        type: 'expense',
        amountMinor: settledAmountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        isReimbursable: model.isReimbursable,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    }

    uiStore.pushToast(t('ai_bookkeeping.toast.updated', 'AI 記帳已更新交易'))
    await router.replace({ name: 'transaction-about', params: { id: transaction.value.id } })
  } catch (error) {
    uiStore.pushToast(error.message ?? t('ai_bookkeeping.toast.save_failed', '儲存交易失敗'), 'error')
  } finally {
    submitting.value = false
  }
}

function openDeleteConfirm() {
  if (submitting.value || deleting.value) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemove() {
  if (!transaction.value || deleting.value) return
  deleting.value = true
  try {
    await transactionStore.deleteTransaction(transaction.value.id)
    uiStore.pushToast(t('claim_sheet.toast.voided', '已刪除'))
    deleteConfirmOpen.value = false
    await goBackOrFallback(router, '/')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_edit.delete_failed', '刪除失敗'), 'error')
  } finally {
    deleting.value = false
  }
}

async function goBack() {
  if (txId.value) {
    await goBackOrFallback(router, `/transactions/${txId.value}`)
    return
  }
  await goBackOrFallback(router, '/')
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

.type-grid {
  margin-top: 12px;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-wrap {
  margin-top: 14px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--muted);
}

.inline-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.date-extra-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  min-width: 0;
}

.extra-btn {
  white-space: nowrap;
  min-height: 42px;
  align-self: end;
  justify-content: center;
  max-width: 100%;
}

.extra-btn.active {
  border-color: color-mix(in srgb, var(--ok) 64%, var(--primary) 36%);
  background: linear-gradient(120deg, color-mix(in srgb, var(--ok) 35%, var(--bg) 65%), color-mix(in srgb, var(--ok) 55%, var(--card) 45%));
  color: var(--text);
}

.fx-panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.fx-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fx-mode-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fx-system-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.fx-note {
  margin: 0;
}

.switch-list,
.switch-grid {
  display: grid;
  gap: 8px;
}

.switch-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.switch-row {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
}

.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 52%, var(--border) 48%);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-soft) 90%);
}

.switch-track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 32%, transparent);
  position: relative;
  display: inline-block;
  transition: background-color var(--anim-fast) var(--anim-standard);
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transform: translate3d(0, 0, 0);
  transition: transform var(--anim-mid) var(--anim-spring);
  will-change: transform;
}

.switch-row.active .switch-thumb {
  transform: translate3d(18px, 0, 0);
}

.action-row {
  margin-top: 12px;
  justify-content: space-between;
  align-items: center;
}

.footer-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.extra-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-soft);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 80;
}

.extra-sheet {
  width: min(900px, 100vw);
  max-width: 100vw;
  box-sizing: border-box;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
}

.extra-content {
  margin-top: 10px;
  min-width: 0;
  overflow-x: hidden;
}

.addon-wrap {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.addon-wrap > .row {
  flex-wrap: wrap;
}

.addon-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px 72px auto;
  gap: 6px;
  align-items: end;
  min-width: 0;
}

.addon-name,
.addon-dir,
.addon-amount {
  min-width: 0;
}

.addon-remove {
  padding: 10px 6px;
  white-space: nowrap;
  min-width: 0;
}

.addon-wrap .field-label,
.addon-desc {
  overflow-wrap: anywhere;
}

.addon-desc {
  color: var(--muted);
}

@media (max-width: 620px) {
  .addon-row {
    grid-template-columns: minmax(0, 1fr) 52px 64px auto;
  }
}

@media (max-width: 520px) {
  .inline-grid,
  .switch-grid,
  .fx-mode-grid {
    grid-template-columns: 1fr;
  }

  .addon-row {
    grid-template-columns: minmax(0, 1fr) 48px 58px auto;
    gap: 4px;
  }

  .action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .footer-actions {
    width: 100%;
  }

  .footer-actions .btn {
    flex: 1 1 0;
  }
}
</style>
