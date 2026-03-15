<template>
  <section class="stack quick-add-page" :class="{ embedded }">
    <article class="card panel">
      <header v-if="!embedded" class="row">
        <h2>{{ t('quick_add.page_title') }}</h2>
        <button type="button" class="btn back-btn" @click="closePage">{{ t('common.back') }}</button>
      </header>

      <div class="type-grid">
        <button v-if="!embedded" type="button" class="btn" @click="openAiPage">{{ t('quick_add.action.open_ai') }}</button>
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
          {{ t('common.amount_yuan') }}
          <input v-model.number="model.amountMajor" class="input" type="number" min="0" step="0.01" />
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
            <CustomSelect v-model="model.accountId" :options="transferAccountOptions" />
          </label>
          <label class="field">
            {{ t('quick_add.field.to_account') }}
            <CustomSelect v-model="model.peerAccountId" :options="transferAccountOptions" />
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

        <div v-else class="inline-grid">
          <label class="field">
            {{ t('common.account') }}
            <CustomSelect v-model="model.accountId" :options="directAccountOptions" />
          </label>
          <label class="field">
            {{ t('common.category') }}
            <CustomSelect v-model="model.categoryId" :groups="categoryGroupsByType" />
          </label>
        </div>

      </div>

      <footer class="row action-row">
        <button class="btn" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: false })">
          {{ t('quick_add.action.save_and_add') }}
        </button>
        <button class="btn primary" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: true })">
          {{ t('quick_add.action.create_transaction') }}
        </button>
      </footer>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="showExtra" class="extra-mask" @click.self="showExtra = false">
          <article class="extra-sheet card">
            <header class="row">
              <h3>{{ t('quick_add.extra.title') }}</h3>
              <button class="btn" @click="showExtra = false">{{ t('common.done') }}</button>
            </header>

            <div class="stack extra-content">
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

              <div v-if="model.type !== 'transfer'" class="switch-list">
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
            </div>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { getCurrentLocale, useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { mergeAddonItemsToNote } from '@/ui/utils/addon-note'
import {
  convertAmountMinorByRate,
  getExchangeRateSnapshot,
  resolveCrossExchangeRate,
  syncCbcExchangeRateSnapshot,
} from '@/ui/services/exchange-rate.service'

const TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS = 8000
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const addonTemplateStore = useAddonTemplateStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const { t } = useI18n()

const submitting = ref(false)
const exchangeRateSyncing = ref(false)
const showExtra = ref(false)
const addonRows = ref([])
const exchangeRateSnapshot = ref({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})
let addonSeq = 1

const typeOptions = computed(() => [
  { value: 'expense', label: t('transaction.type.expense') },
  { value: 'income', label: t('transaction.type.income') },
  { value: 'transfer', label: t('transaction.type.transfer') },
])

const model = reactive({
  type: resolveType(String(route.query.type ?? '')),
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

const directAccountOptions = computed(() => accountStore.regularAccounts)
const transferAccountOptions = computed(() => accountStore.accounts)
const addonDirectionOptions = [
  { value: 'plus', label: '+' },
  { value: 'minus', label: '-' },
]
const addonTemplateItems = computed(() => addonTemplateStore.templates)
const addonTemplateOptions = computed(() => addonTemplateItems.value.map((item) => ({
  value: item.id,
  label: item.label,
})))

const categoryGroupsByType = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})

const transferFromCurrency = computed(() => accountCurrencyCode(model.accountId))
const transferToCurrency = computed(() => accountCurrencyCode(model.peerAccountId))
const transferNeedsExchangeRate = computed(() => {
  return model.type === 'transfer' && transferFromCurrency.value !== transferToCurrency.value
})
const transferResolvedRate = computed(() => {
  if (!transferNeedsExchangeRate.value) return 1
  if (model.exchangeRateMode === 'manual') {
    const manualRate = Number(model.manualExchangeRateInput)
    if (!Number.isFinite(manualRate) || manualRate <= 0) return null
    return manualRate
  }
  return resolveCrossExchangeRate(
    exchangeRateSnapshot.value.rates,
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
  () => route.query.type,
  (nextType) => {
    model.type = resolveType(String(nextType ?? ''))
  },
)

watch(
  () => directAccountOptions.value.map((item) => item.id).join('|'),
  () => {
    if (model.type !== 'transfer') {
      ensureDirectAccount()
    }
  },
  { immediate: true },
)

watch(
  () => transferAccountOptions.value.map((item) => item.id).join('|'),
  () => {
    if (model.type === 'transfer') {
      ensureTransferAccounts()
    }
  },
  { immediate: true },
)

watch(
  () => categoryGroupsByType.value.map((group) => `${group.id}:${(group.categories ?? []).length}`).join('|'),
  () => {
    if (model.type !== 'transfer') {
      model.categoryId = ensureCategoryIdByType(model.type, model.categoryId)
    }
  },
  { immediate: true },
)

watch(
  () => model.type,
  (type) => {
    if (type === 'transfer') {
      model.categoryId = ''
      model.isReimbursable = false
      model.exchangeRateMode = model.exchangeRateMode === 'manual' ? 'manual' : 'system'
      ensureTransferAccounts()
      return
    }
    if (!model.isReimbursable && !model.includeInBudget && !model.includeInAnalysis) {
      model.includeInBudget = true
      model.includeInAnalysis = true
    }
    model.categoryId = ensureCategoryIdByType(type, model.categoryId)
    ensureDirectAccount()
  },
  { immediate: true },
)

watch(
  () => model.isReimbursable,
  (next, prev) => {
    if (next && !prev) {
      model.includeInBudget = false
      model.includeInAnalysis = false
    }
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
  () => transferNeedsExchangeRate.value,
  (needs) => {
    if (!needs) {
      model.exchangeRateMode = 'system'
      model.manualExchangeRateInput = ''
    }
  },
)

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void loadExchangeRateSnapshot()
  },
  { immediate: true },
)

function resolveType(value) {
  const type = String(value ?? '').trim()
  if (type === 'income' || type === 'transfer') return type
  return 'expense'
}

function ensureDirectAccount() {
  const options = directAccountOptions.value
  if (!options.some((item) => item.id === model.accountId)) {
    model.accountId = options[0]?.id ?? ''
  }
}

function ensureTransferAccounts() {
  const options = transferAccountOptions.value
  if (!options.some((item) => item.id === model.accountId)) {
    model.accountId = options[0]?.id ?? ''
  }
  if (!options.some((item) => item.id === model.peerAccountId) || model.peerAccountId === model.accountId) {
    model.peerAccountId = options.find((item) => item.id !== model.accountId)?.id ?? ''
  }
}

function ensureCategoryIdByType(type, currentCategoryId) {
  const groups = type === 'income' ? categoryStore.incomeCategoryGroups : categoryStore.expenseCategoryGroups
  const ids = groups.flatMap((group) => group.categories ?? []).map((item) => item.id)
  if (ids.includes(currentCategoryId)) return currentCategoryId
  return ids[0] ?? ''
}

function accountCurrencyCode(accountId) {
  const account = accountStore.accounts.find((item) => item.id === accountId)
  return normalizeCurrencyCode(account?.currency_code)
}

function formatCurrencyMinor(amountMinor, currencyCode = 'TWD') {
  const value = Number(amountMinor || 0) / 100
  return new Intl.NumberFormat(getCurrentLocale(), {
    style: 'currency',
    currency: normalizeCurrencyCode(currencyCode),
    maximumFractionDigits: 2,
  }).format(value)
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

async function loadExchangeRateSnapshot() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) return
  try {
    exchangeRateSnapshot.value = await getExchangeRateSnapshot(ledgerId)
  } catch (_error) {
    // Ignore snapshot read failures here.
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

function fillDefaultOccurredAt() {
  const now = new Date()
  model.occurredDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  model.occurredHour = now.getHours()
  model.occurredMinute = now.getMinutes()
}

async function closePage() {
  await goBackOrFallback(router, props.embedded ? '/features' : '/')
}

async function openAiPage() {
  await router.push('/ai-auto-bookkeeping').catch(() => {})
}

function resetFormForNextEntry() {
  model.amountMajor = 0
  fillDefaultOccurredAt()
  model.note = ''
  model.isReimbursable = false
  model.includeInBudget = true
  model.includeInAnalysis = true
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
  showExtra.value = false
  addonRows.value = []
  if (model.type === 'transfer') {
    ensureTransferAccounts()
    return
  }
  ensureDirectAccount()
  model.categoryId = ensureCategoryIdByType(model.type, model.categoryId)
}

async function submit(options = {}) {
  const closeAfterSuccess = options.closeAfterSuccess !== false
  if (submitting.value) return
  const baseAmountMajor = Number(model.amountMajor ?? 0)
  const appliedAddonItems = collectAppliedAddonItems()
  const addonDeltaMajor = appliedAddonItems.reduce((total, item) => {
    return total + (item.direction === 'plus' ? item.deltaMajor : -item.deltaMajor)
  }, 0)
  const baseAmountMinor = Math.round(Math.abs(baseAmountMajor) * 100)
  const sourceExtraMinor = Math.round(addonDeltaMajor * 100)
  const settledAmountMajor = round2(baseAmountMajor + addonDeltaMajor)
  const settledAmountMinor = Math.round(Math.abs(settledAmountMajor) * 100)
  const noteText = mergeAddonItemsToNote(String(model.note ?? '').trim(), appliedAddonItems)

  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  if (!occurredAt) {
    uiStore.pushToast(t('quick_add.error.invalid_occurred_at'), 'error')
    return
  }

  if (!model.accountId) {
    uiStore.pushToast(t('quick_add.error.account_required'), 'error')
    return
  }

  if (model.type !== 'transfer' && !model.categoryId) {
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
  } else if (settledAmountMinor <= 0) {
    uiStore.pushToast(t('quick_add.error.amount_required'), 'error')
    return
  }

  submitting.value = true
  try {
    if (model.type === 'expense') {
      await transactionStore.addExpense({
        amountMinor: settledAmountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        isReimbursable: model.isReimbursable,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else if (model.type === 'income') {
      await transactionStore.addIncome({
        amountMinor: settledAmountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else {
      const transferRate = await resolveTransferRateOrThrow()
      const toAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(baseAmountMinor, transferRate)
        : baseAmountMinor
      if (!Number.isFinite(toAmountMinor) || toAmountMinor <= 0) {
        throw new Error(t('quick_add.error.receive_amount_invalid'))
      }
      await transactionStore.addTransfer({
        amountMinor: baseAmountMinor,
        toAmountMinor,
        sourceExtraMinor,
        occurredAt,
        fromAccountId: model.accountId,
        toAccountId: model.peerAccountId,
        note: noteText,
      })
    }

    uiStore.pushToast(t('quick_add.toast.created'))
    if (closeAfterSuccess) {
      await closePage()
      return
    }
    resetFormForNextEntry()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('quick_add.toast.create_failed'), 'error')
  } finally {
    submitting.value = false
  }
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function createAddonRow() {
  const defaultOption = defaultAddonOption()
  return {
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: defaultOption.id,
    direction: defaultOption.defaultDirection,
    amountMajor: null,
  }
}

function defaultAddonOption() {
  return addonTemplateItems.value[0] ?? { id: 'addon-default', label: t('quick_add.extra.addon_title'), defaultDirection: 'plus' }
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

function collectAppliedAddonItems() {
  return addonRows.value
    .map((item) => ({
      label: addonLabelOf(item.optionId),
      direction: item.direction === 'minus' ? 'minus' : 'plus',
      deltaMajor: round2(Math.abs(Number(item.amountMajor ?? 0))),
    }))
    .filter((item) => item.deltaMajor > 0)
}

function addonLabelOf(optionId) {
  return addonTemplateItems.value.find((item) => item.id === optionId)?.label ?? t('quick_add.extra.addon_title')
}

fillDefaultOccurredAt()
void addonTemplateStore.load()
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2 {
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
}
</style>
