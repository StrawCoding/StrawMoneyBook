<template>
  <section class="stack qna-page" :class="{ embedded }">
    <article class="card panel">
      <header v-if="!embedded" class="row">
        <button
          type="button"
          class="btn back-btn"
          :aria-label="t('common.back')"
          :title="t('common.back')"
          @click="closePage"
        >
          <font-awesome-icon icon="fa-solid fa-chevron-left" />
        </button>
        <h2>{{ t('qna_bookkeeping.page_title', '問答記帳') }}</h2>
      </header>

      <p class="muted intro">{{ t('qna_bookkeeping.intro', '一步一步回答，就能建立交易。') }}</p>

      <section class="question-card">
        <Transition :name="stepTransitionName" mode="out-in">
          <div :key="currentStep" class="stack step-panel">
            <header class="stack question-head">
              <small class="muted">{{ t('qna_bookkeeping.step_count', { current: currentStepIndex + 1, total: steps.length }, '第 {current} / {total} 題') }}</small>
              <h3>{{ currentStepMeta.question }}</h3>
              <p class="muted">{{ currentStepMeta.hint }}</p>
            </header>

            <div v-if="currentStep === 'type'" class="type-grid">
              <button
                v-for="item in typeOptions"
                :key="item.value"
                type="button"
                class="btn type-btn"
                :class="{ primary: model.type === item.value }"
                @click="selectType(item.value)"
              >
                {{ item.label }}
              </button>
            </div>

            <label v-else-if="currentStep === 'amount'" class="field">
              {{ t('qna_bookkeeping.field.amount', '金額（元）') }}
              <input
                v-model.trim="model.amountInput"
                class="input"
                type="text"
                inputmode="decimal"
                :placeholder="t('qna_bookkeeping.placeholder.amount', '例如 120 或 399.5')"
                @keyup.enter="goNext"
              />
            </label>

            <div v-else-if="currentStep === 'account'" class="stack">
              <div v-if="model.type === 'transfer'" class="inline-grid">
                <label class="field">
                  {{ t('qna_bookkeeping.field.from_account', '轉出帳戶') }}
                  <CustomSelect v-model="model.accountId" :groups="transferAccountGroups" />
                </label>
                <label class="field">
                  {{ t('qna_bookkeeping.field.to_account', '轉入帳戶') }}
                  <CustomSelect v-model="model.peerAccountId" :groups="transferAccountGroups" />
                </label>
              </div>
              <label v-else class="field">
                {{ t('qna_bookkeeping.field.account', '帳戶') }}
                <CustomSelect v-model="model.accountId" :groups="directAccountGroups" />
              </label>

              <label v-if="transferNeedsExchangeRate" class="field">
                {{
                  t(
                    'qna_bookkeeping.field.exchange_rate',
                    {
                      from: transferFromCurrency,
                      to: transferToCurrency,
                    },
                    '匯率（1 {from} = ? {to}）',
                  )
                }}
                <input
                  v-model.trim="model.manualExchangeRateInput"
                  class="input"
                  type="text"
                  inputmode="decimal"
                  :placeholder="t('qna_bookkeeping.placeholder.exchange_rate', '例如 0.0318')"
                />
              </label>
            </div>

            <label v-else-if="currentStep === 'category'" class="field">
              {{ t('qna_bookkeeping.field.category', '分類') }}
              <CustomSelect v-model="model.categoryId" :groups="categoryGroupsByType" />
            </label>

            <div v-else-if="currentStep === 'time'" class="field">
              <span>{{ t('qna_bookkeeping.field.time', '交易時間') }}</span>
              <DateTimePickerField
                :date="model.occurredDate"
                :hour="model.occurredHour"
                :minute="model.occurredMinute"
                @update:date="model.occurredDate = $event"
                @update:hour="model.occurredHour = $event"
                @update:minute="model.occurredMinute = $event"
              />
            </div>

            <div v-else-if="currentStep === 'note'" class="stack">
              <label class="field">
                {{ t('qna_bookkeeping.field.note', '備註') }}
                <textarea
                  v-model.trim="model.note"
                  class="textarea"
                  rows="3"
                  :placeholder="t('qna_bookkeeping.placeholder.note', '例如 午餐、客戶會議、轉帳到旅遊帳戶')"
                />
              </label>

              <div v-if="model.type === 'expense'" class="switch-list">
                <button
                  type="button"
                  class="switch-row"
                  :class="{ active: model.isReimbursable }"
                  role="switch"
                  :aria-checked="model.isReimbursable ? 'true' : 'false'"
                  @click="model.isReimbursable = !model.isReimbursable"
                >
                  <span>{{ t('qna_bookkeeping.field.reimbursable', '這筆可報銷') }}</span>
                  <span class="switch-track"><span class="switch-thumb"></span></span>
                </button>
              </div>

              <div v-if="model.type !== 'transfer'" class="switch-grid">
                <button
                  type="button"
                  class="switch-row"
                  :class="{ active: model.includeInBudget }"
                  role="switch"
                  :aria-checked="model.includeInBudget ? 'true' : 'false'"
                  @click="model.includeInBudget = !model.includeInBudget"
                >
                  <span>{{ t('qna_bookkeeping.field.include_budget', '納入預算') }}</span>
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
                  <span>{{ t('qna_bookkeeping.field.include_analysis', '納入收支分析') }}</span>
                  <span class="switch-track"><span class="switch-thumb"></span></span>
                </button>
              </div>
            </div>

            <section v-else class="summary-card">
              <header class="stack summary-head">
                <h3>{{ t('qna_bookkeeping.review.title', '交易審核') }}</h3>
                <p class="muted">{{ t('qna_bookkeeping.review.hint', '確認以下資料後即可建立交易。') }}</p>
              </header>

              <dl class="summary-grid">
                <div v-for="item in summaryItems" :key="item.label" class="summary-item">
                  <dt>{{ item.label }}</dt>
                  <dd>{{ item.value }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </Transition>
      </section>

      <footer class="row action-row">
        <button type="button" class="btn" :disabled="submitting || currentStepIndex === 0" @click="goPrev">
          {{ t('qna_bookkeeping.action.prev', '上一題') }}
        </button>
        <template v-if="isLastStep">
          <button type="button" class="btn" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: false })">
            {{ t('qna_bookkeeping.action.save_and_continue', '建立後繼續') }}
          </button>
          <button type="button" class="btn primary" :class="{ busy: submitting }" :disabled="submitting" @click="submit({ closeAfterSuccess: true })">
            {{ t('qna_bookkeeping.action.save', '建立交易') }}
          </button>
        </template>
        <button v-else type="button" class="btn primary" :disabled="submitting" @click="goNext">
          {{ t('qna_bookkeeping.action.next', '下一題') }}
        </button>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { goBackOrFallback, returnHomeAfterBookkeeping } from '@/ui/services/navigation-back.service'
import { resolveBookkeepingSubmitErrorMessage } from '@/ui/utils/bookkeeping-submit-error'
import { convertAmountMinorByRate } from '@/ui/services/exchange-rate.service'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()

const currentStepIndex = ref(0)
const submitting = ref(false)
const stepTransitionName = ref('step-slide-forward')

const model = reactive({
  type: resolveType(String(route.query.type ?? '')),
  amountInput: '',
  accountId: '',
  peerAccountId: '',
  categoryId: '',
  occurredDate: '',
  occurredHour: 0,
  occurredMinute: 0,
  note: '',
  isReimbursable: false,
  includeInBudget: true,
  includeInAnalysis: true,
  manualExchangeRateInput: '',
})

const typeOptions = computed(() => [
  { value: 'expense', label: t('transaction.type.expense') },
  { value: 'income', label: t('transaction.type.income') },
  { value: 'transfer', label: t('transaction.type.transfer') },
])

const directAccountOptions = computed(() => accountStore.regularAccounts)
const transferAccountOptions = computed(() => accountStore.accounts)
const directAccountGroups = computed(() => accountStore.groupedRegularAccounts)
const transferAccountGroups = computed(() => accountStore.groupedAccounts)
const categoryGroupsByType = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})

const steps = computed(() => {
  const base = [
    { key: 'type', shortLabel: t('qna_bookkeeping.step.type', '類型') },
    { key: 'amount', shortLabel: t('qna_bookkeeping.step.amount', '金額') },
    { key: 'account', shortLabel: t('qna_bookkeeping.step.account', '帳戶') },
  ]
  if (model.type !== 'transfer') {
    base.push({ key: 'category', shortLabel: t('qna_bookkeeping.step.category', '分類') })
  }
  base.push(
    { key: 'time', shortLabel: t('qna_bookkeeping.step.time', '時間') },
    { key: 'note', shortLabel: t('qna_bookkeeping.step.note', '備註') },
    { key: 'review', shortLabel: t('qna_bookkeeping.step.review', '審核') },
  )
  return base
})

const currentStep = computed(() => steps.value[currentStepIndex.value]?.key ?? 'type')
const isLastStep = computed(() => currentStepIndex.value >= steps.value.length - 1)
const transferFromCurrency = computed(() => accountCurrencyCode(model.accountId))
const transferToCurrency = computed(() => accountCurrencyCode(model.peerAccountId))
const transferNeedsExchangeRate = computed(() => {
  return model.type === 'transfer' && transferFromCurrency.value !== transferToCurrency.value
})

const currentStepMeta = computed(() => {
  if (currentStep.value === 'type') {
    return {
      question: t('qna_bookkeeping.question.type', '這筆是支出、收入，還是轉帳？'),
      hint: t('qna_bookkeeping.hint.type', '先決定交易類型，後面的問題會跟著調整。'),
    }
  }
  if (currentStep.value === 'amount') {
    return {
      question: t('qna_bookkeeping.question.amount', '金額是多少？'),
      hint: t('qna_bookkeeping.hint.amount', '支援整數與小數，例如 120、399.5。'),
    }
  }
  if (currentStep.value === 'account') {
    return {
      question: model.type === 'transfer'
        ? t('qna_bookkeeping.question.transfer_accounts', '從哪個帳戶轉出？要轉到哪個帳戶？')
        : t('qna_bookkeeping.question.account', '這筆要記在哪個帳戶？'),
      hint: transferNeedsExchangeRate.value
        ? t('qna_bookkeeping.hint.exchange_rate', '若是不同幣別，請補上匯率。')
        : t('qna_bookkeeping.hint.account', '選對帳戶，後續餘額與報表才會正確。'),
    }
  }
  if (currentStep.value === 'category') {
    return {
      question: t('qna_bookkeeping.question.category', '這筆屬於哪個分類？'),
      hint: t('qna_bookkeeping.hint.category', '分類會影響預算、分析與搜尋。'),
    }
  }
  if (currentStep.value === 'time') {
    return {
      question: t('qna_bookkeeping.question.time', '這筆是什麼時候發生的？'),
      hint: t('qna_bookkeeping.hint.time', '預設是現在，也可以改成昨天或補登時間。'),
    }
  }
  if (currentStep.value === 'review') {
    return {
      question: t('qna_bookkeeping.question.review', '最後審核這筆交易，確認後建立。'),
      hint: t('qna_bookkeeping.hint.review', '檢查金額、帳戶、分類和其他設定，沒問題就送出。'),
    }
  }
  return {
    question: t('qna_bookkeeping.question.note', '需要備註或其他設定嗎？'),
    hint: t('qna_bookkeeping.hint.note', '補上備註與其他設定，下一題會進入最後審核。'),
  }
})

const summaryItems = computed(() => {
  const items = [
    {
      label: t('qna_bookkeeping.summary.type', '類型'),
      value: typeOptions.value.find((item) => item.value === model.type)?.label ?? '-',
    },
    {
      label: t('qna_bookkeeping.summary.amount', '金額'),
      value: formatAmountSummary(),
    },
    {
      label: t('qna_bookkeeping.summary.account', '帳戶'),
      value: formatAccountSummary(),
    },
  ]
  if (model.type !== 'transfer') {
    items.push({
      label: t('qna_bookkeeping.summary.category', '分類'),
      value: categoryNameOf(model.categoryId) || '-',
    })
  }
  if (model.type === 'transfer' && transferNeedsExchangeRate.value) {
    items.push({
      label: t('qna_bookkeeping.summary.exchange_rate', '匯率'),
      value: String(model.manualExchangeRateInput ?? '').trim() || '-',
    })
  }
  items.push(
    {
      label: t('qna_bookkeeping.summary.time', '時間'),
      value: formatTimeSummary(),
    },
    {
      label: t('qna_bookkeeping.summary.note', '備註'),
      value: model.note || t('qna_bookkeeping.empty', '未填寫'),
    },
  )
  if (model.type === 'expense') {
    items.push({
      label: t('qna_bookkeeping.summary.reimbursable', '可報銷'),
      value: formatToggleSummary(model.isReimbursable),
    })
  }
  if (model.type !== 'transfer') {
    items.push(
      {
        label: t('qna_bookkeeping.summary.include_budget', '納入預算'),
        value: formatToggleSummary(model.includeInBudget),
      },
      {
        label: t('qna_bookkeeping.summary.include_analysis', '納入分析'),
        value: formatToggleSummary(model.includeInAnalysis),
      },
    )
  }
  return items
})

watch(
  () => route.query.type,
  (nextType) => {
    model.type = resolveType(String(nextType ?? ''))
  },
)

watch(
  () => model.type,
  () => {
    ensureSelections()
    syncStepIndex()
    if (model.type === 'transfer') {
      model.categoryId = ''
      model.isReimbursable = false
      return
    }
    model.peerAccountId = ''
    model.manualExchangeRateInput = ''
  },
  { immediate: true },
)

watch(
  () => directAccountOptions.value.map((item) => item.id).join('|'),
  ensureSelections,
  { immediate: true },
)

watch(
  () => transferAccountOptions.value.map((item) => item.id).join('|'),
  ensureSelections,
  { immediate: true },
)

watch(
  () => categoryGroupsByType.value.map((group) => `${group.id}:${(group.categories ?? []).length}`).join('|'),
  ensureSelections,
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

function resolveType(value) {
  const type = String(value ?? '').trim()
  if (type === 'income' || type === 'transfer') return type
  return 'expense'
}

function fillDefaultOccurredAt() {
  const now = new Date()
  model.occurredDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  model.occurredHour = now.getHours()
  model.occurredMinute = now.getMinutes()
}

function ensureSelections() {
  if (model.type === 'transfer') {
    if (!transferAccountOptions.value.some((item) => item.id === model.accountId)) {
      model.accountId = transferAccountOptions.value[0]?.id ?? ''
    }
    if (!transferAccountOptions.value.some((item) => item.id === model.peerAccountId) || model.peerAccountId === model.accountId) {
      model.peerAccountId = transferAccountOptions.value.find((item) => item.id !== model.accountId)?.id ?? ''
    }
    return
  }

  if (!directAccountOptions.value.some((item) => item.id === model.accountId)) {
    model.accountId = directAccountOptions.value[0]?.id ?? ''
  }

  const categoryIds = categoryGroupsByType.value.flatMap((group) => group.categories ?? []).map((item) => item.id)
  if (!categoryIds.includes(model.categoryId)) {
    model.categoryId = categoryIds[0] ?? ''
  }
}

function syncStepIndex() {
  const maxIndex = steps.value.length - 1
  if (currentStepIndex.value > maxIndex) {
    setStepIndex(maxIndex, { direction: 'backward' })
  }
}

function selectType(type) {
  model.type = resolveType(type)
  if (currentStep.value === 'type') {
    setStepIndex(Math.min(1, steps.value.length - 1), { direction: 'forward' })
  }
}

function goPrev() {
  setStepIndex(Math.max(0, currentStepIndex.value - 1), { direction: 'backward' })
}

function goNext() {
  const validationMessage = validateStep(currentStep.value)
  if (validationMessage) {
    uiStore.pushToast(validationMessage, 'error')
    return
  }
  setStepIndex(Math.min(steps.value.length - 1, currentStepIndex.value + 1), { direction: 'forward' })
}

function setStepIndex(nextIndex, options = {}) {
  const boundedIndex = Math.min(Math.max(Number(nextIndex) || 0, 0), steps.value.length - 1)
  const nextDirection = options.direction
    || (boundedIndex >= currentStepIndex.value ? 'forward' : 'backward')
  stepTransitionName.value = nextDirection === 'backward' ? 'step-slide-back' : 'step-slide-forward'
  currentStepIndex.value = boundedIndex
}

function validateStep(stepKey) {
  if (stepKey === 'amount') {
    if (!Number.isFinite(parseAmountMajor()) || parseAmountMajor() <= 0) {
      return t('qna_bookkeeping.error.amount', '請輸入有效金額')
    }
  }

  if (stepKey === 'account') {
    if (!model.accountId) {
      return t('qna_bookkeeping.error.account', '請先選擇帳戶')
    }
    if (model.type === 'transfer') {
      if (!model.peerAccountId) {
        return t('qna_bookkeeping.error.to_account', '請先選擇轉入帳戶')
      }
      if (model.peerAccountId === model.accountId) {
        return t('qna_bookkeeping.error.same_account', '轉出與轉入帳戶不可相同')
      }
      if (transferNeedsExchangeRate.value) {
        const rate = Number(model.manualExchangeRateInput)
        if (!Number.isFinite(rate) || rate <= 0) {
          return t('qna_bookkeeping.error.exchange_rate', '不同幣別轉帳請輸入有效匯率')
        }
      }
    }
  }

  if (stepKey === 'category' && model.type !== 'transfer' && !model.categoryId) {
    return t('qna_bookkeeping.error.category', '請先選擇分類')
  }

  if (stepKey === 'time' && !toOccurredAtIso()) {
    return t('qna_bookkeeping.error.time', '請選擇有效時間')
  }

  return ''
}

function parseAmountMajor() {
  const parsed = Number(String(model.amountInput ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(parsed)) return NaN
  return parsed
}

function accountCurrencyCode(accountId) {
  const account = accountStore.accounts.find((item) => item.id === accountId)
  return normalizeCurrencyCode(account?.currency_code)
}

function categoryNameOf(categoryId) {
  const groups = model.type === 'income' ? categoryStore.incomeCategoryGroups : categoryStore.expenseCategoryGroups
  return groups.flatMap((group) => group.categories ?? []).find((item) => item.id === categoryId)?.name ?? ''
}

function accountNameOf(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? ''
}

function formatAmountSummary() {
  const amount = parseAmountMajor()
  if (!Number.isFinite(amount) || amount <= 0) return '-'
  return amount.toLocaleString(resolveIntlLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatAccountSummary() {
  if (model.type === 'transfer') {
    const fromName = accountNameOf(model.accountId)
    const toName = accountNameOf(model.peerAccountId)
    if (!fromName && !toName) return '-'
    const baseText = `${fromName || '-'} -> ${toName || '-'}`
    if (!transferNeedsExchangeRate.value) return baseText
    const rate = String(model.manualExchangeRateInput ?? '').trim() || '-'
    return `${baseText} @ ${rate}`
  }
  return accountNameOf(model.accountId) || '-'
}

function formatTimeSummary() {
  const occurredAt = toOccurredAtIso()
  if (!occurredAt) return '-'
  return new Date(occurredAt).toLocaleString(resolveIntlLocale())
}

function formatToggleSummary(enabled) {
  return enabled
    ? t('common.yes', '是')
    : t('common.no', '否')
}

function toOccurredAtIso() {
  const dateText = String(model.occurredDate ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return ''
  const hour = Number(model.occurredHour)
  const minute = Number(model.occurredMinute)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return ''
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return ''
  const parsed = new Date(`${dateText}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

async function closePage() {
  await goBackOrFallback(router, props.embedded ? '/features' : '/')
}

function resetForm() {
  model.type = 'expense'
  model.amountInput = ''
  model.accountId = ''
  model.peerAccountId = ''
  model.categoryId = ''
  model.note = ''
  model.isReimbursable = false
  model.includeInBudget = true
  model.includeInAnalysis = true
  model.manualExchangeRateInput = ''
  fillDefaultOccurredAt()
  ensureSelections()
  currentStepIndex.value = 0
}

async function submit(options = {}) {
  const closeAfterSuccess = options.closeAfterSuccess !== false
  if (submitting.value) return

  for (const step of steps.value) {
    const validationMessage = validateStep(step.key)
    if (validationMessage) {
      setStepIndex(steps.value.findIndex((item) => item.key === step.key), { direction: 'backward' })
      uiStore.pushToast(validationMessage, 'error')
      return
    }
  }

  const amountMajor = parseAmountMajor()
  const amountMinor = Math.round(Math.abs(amountMajor) * 100)
  const occurredAt = toOccurredAtIso()

  submitting.value = true
  try {
    if (model.type === 'expense') {
      await transactionStore.addExpense({
        amountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        note: model.note,
        isReimbursable: model.isReimbursable,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
      })
    } else if (model.type === 'income') {
      await transactionStore.addIncome({
        amountMinor,
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        note: model.note,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
      })
    } else {
      const rate = transferNeedsExchangeRate.value
        ? Number(model.manualExchangeRateInput)
        : 1
      const toAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(amountMinor, rate)
        : amountMinor
      if (!Number.isFinite(toAmountMinor) || toAmountMinor <= 0) {
        throw new Error(t('qna_bookkeeping.error.transfer_receive', '轉入金額需大於 0，請調整匯率'))
      }
      await transactionStore.addTransfer({
        amountMinor,
        toAmountMinor,
        sourceExtraMinor: 0,
        occurredAt,
        fromAccountId: model.accountId,
        toAccountId: model.peerAccountId,
        note: model.note,
      })
    }

    uiStore.pushToast(t('qna_bookkeeping.toast.saved', '問答記帳已建立交易'))
    if (closeAfterSuccess) {
      await returnHomeAfterBookkeeping(router)
      return
    }
    resetForm()
  } catch (error) {
    uiStore.pushToast(resolveBookkeepingSubmitErrorMessage(error, t), 'error')
  } finally {
    submitting.value = false
  }
}

fillDefaultOccurredAt()
ensureSelections()
onMounted(() => {
  void Promise.all([
    accountStore.accounts.length ? Promise.resolve() : accountStore.load(),
    categoryStore.categories.length ? Promise.resolve() : categoryStore.load(),
  ])
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

.intro {
  margin: 10px 0 0;
}

.step-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.step-chip {
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 700;
}

.step-chip.active {
  background: color-mix(in srgb, var(--primary) 16%, var(--card) 84%);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  color: var(--primary-soft);
}

.step-chip.done {
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
}

.question-card {
  margin-top: 14px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-popover) 70%, var(--card) 30%);
  border: 1px solid color-mix(in srgb, var(--field-border) 85%, transparent);
  overflow: hidden;
}

.question-head h3,
.summary-card h3 {
  margin: 0;
}

.summary-head p,
.question-head p,
.question-head small {
  margin: 0;
}

.step-panel {
  min-height: 292px;
}

.field {
  display: grid;
  gap: 6px;
}

.type-grid,
.inline-grid,
.switch-grid {
  display: grid;
  gap: 10px;
}

.type-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 12px;
}

.type-btn {
  min-height: 48px;
}

.inline-grid,
.switch-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-card {
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-popover) 12%);
  border: 1px solid var(--field-border);
}

.summary-grid {
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
}

.summary-item {
  display: grid;
  gap: 4px;
}

.summary-item dt {
  color: var(--text-muted);
  font-size: 12px;
}

.summary-item dd {
  margin: 0;
  font-weight: 700;
  word-break: break-word;
}

.action-row {
  margin-top: 14px;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: var(--navigation-bar-height);
  flex-wrap: wrap;
}

.switch-list {
  display: grid;
  gap: 10px;
}

.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  color: var(--text);
  border-radius: 14px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 700;
}

.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
}

.switch-track {
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 75%, #000 0%);
  position: relative;
  flex: 0 0 auto;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.18s ease;
}

.switch-row.active .switch-thumb {
  transform: translateX(18px);
}

.step-slide-forward-enter-active,
.step-slide-forward-leave-active,
.step-slide-back-enter-active,
.step-slide-back-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.step-slide-forward-enter-from,
.step-slide-back-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

.step-slide-forward-leave-to,
.step-slide-back-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}

@media (prefers-reduced-motion: reduce) {
  .step-slide-forward-enter-active,
  .step-slide-forward-leave-active,
  .step-slide-back-enter-active,
  .step-slide-back-leave-active,
  .switch-thumb {
    transition: none;
  }
}

@media (max-width: 720px) {
  .step-panel {
    min-height: 0;
  }

  .type-grid,
  .inline-grid,
  .switch-grid {
    grid-template-columns: 1fr;
  }
}
</style>
