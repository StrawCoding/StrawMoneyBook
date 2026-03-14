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
          {{ model.type === 'adjustment' ? '結餘金額（元，可正負）' : '金額（元）' }}
          <input v-model.number="model.amountMajor" class="input" type="number" :min="model.type === 'adjustment' ? undefined : 0" step="0.01" />
        </label>

        <div class="field">
          <div class="date-extra-row">
            <div class="field">
              <span>交易時間</span>
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
              附加資訊
            </button>
          </div>
        </div>

        <div v-if="model.type === 'transfer'" class="inline-grid">
          <label class="field">
            轉出帳戶
            <CustomSelect v-model="model.accountId" :options="transferAccountOptions" />
          </label>
          <label class="field">
            轉入帳戶
            <CustomSelect v-model="model.peerAccountId" :options="transferAccountOptions" />
          </label>
        </div>
        <section v-if="model.type === 'transfer'" class="fx-panel">
          <div class="fx-row">
            <small class="muted">轉帳幣別</small>
            <strong>{{ transferFromCurrency }} → {{ transferToCurrency }}</strong>
          </div>
          <template v-if="transferNeedsExchangeRate">
            <div class="fx-mode-grid">
              <button type="button" class="btn" :class="{ primary: model.exchangeRateMode === 'system' }" @click="model.exchangeRateMode = 'system'">
                系統同步（即時）
              </button>
              <button type="button" class="btn" :class="{ primary: model.exchangeRateMode === 'manual' }" @click="model.exchangeRateMode = 'manual'">
                自行輸入
              </button>
            </div>
            <label v-if="model.exchangeRateMode === 'manual'" class="field">
              匯率（1 {{ transferFromCurrency }} = ? {{ transferToCurrency }}）
              <input
                v-model.trim="model.manualExchangeRateInput"
                type="text"
                inputmode="decimal"
                class="input"
                placeholder="例如 0.0318"
              />
            </label>
            <div v-else class="fx-system-row">
              <small class="muted">系統匯率快照：{{ transferSnapshotInfoLabel }}</small>
              <button type="button" class="btn" :class="{ busy: exchangeRateSyncing }" :disabled="exchangeRateSyncing" @click="syncExchangeRateSnapshotNow">
                {{ exchangeRateSyncing ? '同步中...' : '立即同步匯率' }}
              </button>
            </div>
            <p class="muted fx-note">換算匯率：1 {{ transferFromCurrency }} = {{ transferResolvedRateLabel }} {{ transferToCurrency }}</p>
            <p class="muted fx-note">預估轉入：{{ formatCurrencyMinor(transferEstimatedReceiveMinor, transferToCurrency) }}</p>
          </template>
          <p v-else class="muted fx-note">同幣別轉帳，匯率固定為 1</p>
        </section>

        <label v-else-if="model.type === 'adjustment'" class="field">
          帳戶
          <CustomSelect v-model="model.accountId" :options="directAccountOptions" />
        </label>

        <div v-else class="inline-grid">
          <label class="field">
            帳戶
            <CustomSelect v-model="model.accountId" :options="directAccountOptions" />
          </label>
          <label class="field">
            分類
            <CustomSelect v-model="model.categoryId" :groups="categoryGroupsByType" />
          </label>
        </div>

      </div>

      <footer class="row action-row">
        <button class="btn" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: false })">再記</button>
        <button class="btn primary" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: true })">建立交易</button>
      </footer>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="showExtra" class="extra-mask" @click.self="showExtra = false">
          <article class="extra-sheet card">
            <header class="row">
              <h3>附加資訊</h3>
              <button class="btn" @click="showExtra = false">完成</button>
            </header>

            <div class="stack extra-content">
              <div class="addon-wrap">
                <div class="row">
                  <span class="field-label">附加項目</span>
                  <button type="button" class="btn" @click="addAddonRow">新增項目</button>
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
                    刪除
                  </button>
                </div>

                <div class="row">
                  <small class="addon-desc">可在設定中的附加項目清單更改</small>
                </div>
              </div>

              <label class="field">
                備註
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
                  <span>報銷</span>
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
                  <span>紀錄預算</span>
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
                  <span>紀錄收支</span>
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
import { useI18n } from '@/ui/services/i18n.service'
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
  { value: 'adjustment', label: '結餘' },
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
  if (!exchangeRateSnapshot.value?.syncedAt) return '尚未同步'
  const parsed = new Date(exchangeRateSnapshot.value.syncedAt)
  if (Number.isNaN(parsed.getTime())) return '尚未同步'
  return `${parsed.toLocaleString('zh-TW')}（資料日期 ${exchangeRateSnapshot.value.effectiveDate || '-'}）`
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
    if (model.type !== 'transfer' && model.type !== 'adjustment') {
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
    if (type === 'adjustment') {
      model.categoryId = ''
      model.isReimbursable = false
      model.includeInBudget = false
      model.includeInAnalysis = false
      ensureDirectAccount()
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
  if (type === 'income' || type === 'transfer' || type === 'adjustment') return type
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
  return new Intl.NumberFormat('zh-TW', {
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
    uiStore.pushToast(`匯率同步完成（資料日期：${exchangeRateSnapshot.value.effectiveDate || '-'}）`)
    return true
  } catch (error) {
    uiStore.pushToast(error.message ?? '匯率同步失敗', 'error')
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
      throw new Error('請輸入有效匯率')
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
      '系統匯率同步逾時，請改用手動輸入或稍後再試',
    )
  }

  const rate = resolveCrossExchangeRate(
    exchangeRateSnapshot.value?.rates,
    transferFromCurrency.value,
    transferToCurrency.value,
  )
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('找不到可用的系統匯率，請改用手動輸入')
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
  model.includeInBudget = model.type === 'adjustment' ? false : true
  model.includeInAnalysis = model.type === 'adjustment' ? false : true
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
  showExtra.value = false
  addonRows.value = []
  if (model.type === 'transfer') {
    ensureTransferAccounts()
    return
  }
  if (model.type === 'adjustment') {
    model.categoryId = ''
    ensureDirectAccount()
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
  const settledAmountMinorRaw = Math.round(settledAmountMajor * 100)
  const settledAmountMinor = Math.round(Math.abs(settledAmountMajor) * 100)
  const noteText = mergeAddonItemsToNote(String(model.note ?? '').trim(), appliedAddonItems)

  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  if (!occurredAt) {
    uiStore.pushToast('請選擇有效時間', 'error')
    return
  }

  if (!model.accountId) {
    uiStore.pushToast('請先選擇帳戶', 'error')
    return
  }

  if (model.type !== 'transfer' && model.type !== 'adjustment' && !model.categoryId) {
    uiStore.pushToast('請先選擇分類', 'error')
    return
  }

  if (model.type === 'transfer') {
    if (baseAmountMinor <= 0) {
      uiStore.pushToast('請輸入有效金額（主轉帳金額需大於 0）', 'error')
      return
    }
    if (baseAmountMinor + sourceExtraMinor <= 0) {
      uiStore.pushToast('轉出金額（含附加項目）需大於 0', 'error')
      return
    }
    if (!model.peerAccountId) {
      uiStore.pushToast('請先選擇轉入帳戶', 'error')
      return
    }
    if (model.peerAccountId === model.accountId) {
      uiStore.pushToast('轉出與轉入帳戶不可相同', 'error')
      return
    }
  } else if (model.type === 'adjustment') {
    if (!settledAmountMinorRaw) {
      uiStore.pushToast('請輸入有效結餘金額（不可為 0）', 'error')
      return
    }
  } else if (settledAmountMinor <= 0) {
    uiStore.pushToast('請輸入有效金額（需大於 0）', 'error')
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
    } else if (model.type === 'adjustment') {
      await transactionStore.addAdjustment({
        amountMinor: settledAmountMinorRaw,
        occurredAt,
        accountId: model.accountId,
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
        throw new Error('轉入金額需大於 0，請調整匯率')
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

    uiStore.pushToast('交易已新增')
    if (closeAfterSuccess) {
      await closePage()
      return
    }
    resetFormForNextEntry()
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增失敗', 'error')
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
  return addonTemplateItems.value[0] ?? { id: 'addon-default', label: '附加項目', defaultDirection: 'plus' }
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
  return addonTemplateItems.value.find((item) => item.id === optionId)?.label ?? '附加項目'
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
