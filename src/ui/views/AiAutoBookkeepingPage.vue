<template>
  <section ref="pageRef" class="stack ai-page" :class="{ leaving: isPageLeaving }">
    <article class="card panel" :class="{ 'ai-busy-panel': speechListening || parsing || submitting }">
      <header v-if="!embedded" class="row">
        <h2>{{ t('ai_bookkeeping.page_title') }}</h2>
        <div class="header-actions">
          <button type="button" class="btn" @click="goManualBookkeeping">{{ t('ai_bookkeeping.action.switch_manual') }}</button>
          <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
        </div>
      </header>

      <label class="field">
        輸入一句話
        <textarea
          v-model.trim="sourceText"
          class="textarea"
          rows="4"
          placeholder="例如：昨天午餐 120 元用現金，可報銷"
        />
      </label>

      <small class="muted">可輸入金額、日期、帳戶名、分類名、報銷/轉帳等關鍵字。</small>
      <small v-if="speechListening && speechLiveText" class="muted">語音辨識中：{{ speechLiveText }}</small>
      <transition name="ai-status-fade">
        <div v-if="showAiStatus" class="ai-status-chip">
          <span class="ai-status-wave"></span>
          <span class="ai-status-wave"></span>
          <span class="ai-status-wave"></span>
          <span>{{ aiStatusText }}</span>
        </div>
      </transition>

      <div class="row action-row">
        <button
          v-if="speechSupported"
          class="btn icon-action-btn"
          :class="{ primary: speechListening, busy: speechListening }"
          :disabled="parsing || submitting"
          :aria-label="speechListening ? t('ai_bookkeeping.action.stop_voice_input') : t('ai_bookkeeping.action.voice_input')"
          :title="speechListening ? t('ai_bookkeeping.action.stop_voice_input') : t('ai_bookkeeping.action.voice_input')"
          @click="toggleVoiceInput"
        >
          <font-awesome-icon icon="fa-solid fa-microphone" />
        </button>
        <button
          class="btn primary icon-action-btn"
          :class="{ busy: parsing || submitting }"
          :disabled="parsing || submitting"
          :aria-label="t('ai_bookkeeping.action.submit')"
          :title="t('ai_bookkeeping.action.submit')"
          @click="parseText"
        >
          <font-awesome-icon icon="fa-solid fa-paper-plane" />
        </button>
      </div>
    </article>

    <transition name="ai-result-pop">
      <article v-if="hasDraft" class="card panel result-panel">
      <header class="row">
        <h3>{{ t('ai_bookkeeping.result.title') }}</h3>
        <small class="muted">{{ t('ai_bookkeeping.result.hint') }}</small>
      </header>

      <transition name="ai-warn-pop">
        <ul v-if="warnings.length" class="warn-list">
          <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
        </ul>
      </transition>

      <div class="type-grid">
        <button
          v-for="item in typeOptions"
          :key="item.value"
          class="btn"
          :class="{ primary: model.type === item.value }"
          @click="model.type = item.value"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="stack form-wrap">
        <label class="field">
          金額（元）
          <input v-model.number="model.amountMajor" class="input" type="number" min="0" step="0.01" />
        </label>

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
              <button
                type="button"
                class="btn"
                :class="{ primary: model.exchangeRateMode === 'system' }"
                @click="model.exchangeRateMode = 'system'"
              >
                系統同步（即時）
              </button>
              <button
                type="button"
                class="btn"
                :class="{ primary: model.exchangeRateMode === 'manual' }"
                @click="model.exchangeRateMode = 'manual'"
              >
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
              <button
                type="button"
                class="btn"
                :class="{ busy: exchangeRateSyncing }"
                :disabled="exchangeRateSyncing"
                @click="syncExchangeRateSnapshotNow"
              >
                {{ exchangeRateSyncing ? '同步中...' : '立即同步匯率' }}
              </button>
            </div>
            <p class="muted fx-note">換算匯率：1 {{ transferFromCurrency }} = {{ transferResolvedRateLabel }} {{ transferToCurrency }}</p>
            <p class="muted fx-note">預估轉入：{{ formatCurrencyMinor(transferEstimatedReceiveMinor, transferToCurrency) }}</p>
          </template>
          <p v-else class="muted fx-note">同幣別轉帳，匯率固定為 1</p>
        </section>

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

        <label class="field">
          備註
          <textarea v-model.trim="model.note" class="textarea" rows="3" />
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

      <footer class="row action-row result-action-row">
        <button class="btn" :disabled="parsing || submitting" @click="parseText">重新解析</button>
        <button class="btn primary" :class="{ busy: submitting }" :disabled="parsing || submitting" @click="submit">
          {{ t('ai_bookkeeping.action.edit_transaction') }}
        </button>
      </footer>
      </article>
    </transition>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { getAiBookkeepingWarningFallback, parseAutoBookkeepingText } from '@/core/services/ai-bookkeeping.service'
import { getAiBookkeepingDailyUsage, recordAiBookkeepingUsage } from '@/core/services/membership.service'
import { useSpeechInput } from '@/ui/composables/use-speech-input'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import {
  convertAmountMinorByRate,
  getExchangeRateSnapshot,
  resolveCrossExchangeRate,
  syncCbcExchangeRateSnapshot,
} from '@/ui/services/exchange-rate.service'
import { getAutoFillRules } from '@/ui/services/auto-fill-rule.service'
import {
  formatLoanStartDateTime,
  pickLoanForAiRepayment,
  resolveLoanActionLabel,
  resolveLoanCounterpartyName,
  resolveLoanOccurredAtIso,
} from '@/ui/services/ai-loan-intent.service'

defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const loanStore = useLoanStore()
const budgetStore = useBudgetStore()
const ledgerStore = useLedgerStore()
const router = useRouter()
const { locale, t } = useI18n()

const sourceText = ref('')
const warnings = ref([])
const hasDraft = ref(false)
const pageRef = ref(null)
const isPageLeaving = ref(false)
const latestLoanIntent = ref(null)
const speechLiveText = ref('')
const parsing = ref(false)
const submitting = ref(false)
const persistedTransactionId = ref('')
const persistedTransactionType = ref('')
const AI_SUBMIT_TIMEOUT_MS = 15000
const AI_HISTORY_WARMUP_TIMEOUT_MS = 1800
const {
  isSupported: speechSupported,
  isListening: speechListening,
  lastError: speechLastError,
  start: startSpeech,
  stop: stopSpeech,
} = useSpeechInput()
let historyWarmupTask = null

const showAiStatus = computed(() => speechListening.value || parsing.value || submitting.value)
const aiStatusText = computed(() => {
  if (submitting.value) return t('ai_bookkeeping.status.saving', 'AI 編輯交易中...')
  if (parsing.value) return t('ai_bookkeeping.status.parsing', 'AI 解析中...')
  if (speechListening.value) return t('ai_bookkeeping.status.listening', 'AI 聆聽中...')
  return ''
})
const speechLanguage = computed(() => (locale.value === 'en' ? 'en-US' : 'zh-TW'))
const TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS = 8000

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

async function goBack() {
  await goBackOrFallback(router, '/features')
}

async function goManualBookkeeping() {
  await router.push({
    path: '/transactions/quick-add',
    query: { type: model.type },
  }).catch(() => {})
}

const exchangeRateSnapshot = ref({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})
const exchangeRateSyncing = ref(false)
const autoFillRules = ref([])

const typeOptions = computed(() => [
  { value: 'expense', label: t('transaction.type.expense') },
  { value: 'income', label: t('transaction.type.income') },
  { value: 'transfer', label: t('transaction.type.transfer') },
])

const categoryGroupsByType = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})
const directAccountOptions = computed(() => accountStore.regularAccounts)
const transferAccountOptions = computed(() => accountStore.accounts)
const aiParserAccounts = computed(() => {
  const groupNameMap = new Map(
    (accountStore.groups ?? []).map((group) => [String(group?.id ?? ''), String(group?.name ?? '').trim()]),
  )
  return directAccountOptions.value.map((account) => ({
    ...account,
    groupName: groupNameMap.get(String(account?.group_id ?? '')) ?? '',
  }))
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
const transferEstimatedReceiveMinor = computed(() => {
  const baseMinor = Math.round(Math.abs(Number(model.amountMajor ?? 0)) * 100)
  if (baseMinor <= 0) return 0
  const rate = Number(transferResolvedRate.value)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return convertAmountMinorByRate(baseMinor, rate)
})
const transferSnapshotInfoLabel = computed(() => {
  if (!exchangeRateSnapshot.value?.syncedAt) return '尚未同步'
  const parsed = new Date(exchangeRateSnapshot.value.syncedAt)
  if (Number.isNaN(parsed.getTime())) return '尚未同步'
  return `${parsed.toLocaleString('zh-TW')}（資料日期 ${exchangeRateSnapshot.value.effectiveDate || '-'}）`
})

watch(
  () => model.type,
  (type) => {
    if (type === 'transfer') {
      model.categoryId = ''
      model.isReimbursable = false
      if (!model.exchangeRateMode) {
        model.exchangeRateMode = 'system'
      }
      return
    }
    const categoryList = type === 'income' ? categoryStore.incomeCategories : categoryStore.expenseCategories
    const hasCurrent = categoryList.some((item) => item.id === model.categoryId)
    if (!hasCurrent) {
      model.categoryId = ''
    }
    if (type !== 'expense') {
      model.isReimbursable = false
    }
  },
)

watch(
  () => [ledgerStore.activeLedgerId, model.type, model.accountId, model.peerAccountId, model.exchangeRateMode],
  () => {
    if (!ledgerStore.activeLedgerId) return
    if (model.type !== 'transfer') return
    if (!transferNeedsExchangeRate.value) {
      model.exchangeRateMode = 'system'
      model.manualExchangeRateInput = ''
      return
    }
    if (model.exchangeRateMode === 'system' && !hasSystemExchangeRateReady()) {
      void loadExchangeRateSnapshot()
    }
  },
  { immediate: true },
)

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void loadAutoFillRules()
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

async function parseText(options = {}) {
  const fromSpeech = Boolean(options.fromSpeech)
  if (parsing.value || submitting.value) return
  const text = String(sourceText.value ?? '').trim()
  if (!text) {
    hasDraft.value = false
    uiStore.pushToast('請先輸入內容', 'error')
    return
  }

  const startedAt = Date.now()
  parsing.value = true
  let shouldAutoSubmit = false

  try {
    warmupRecentHistoryInBackground()

    let result = null
    try {
      result = parseAutoBookkeepingText(text, {
        accounts: aiParserAccounts.value,
        expenseCategories: categoryStore.expenseCategories,
        incomeCategories: categoryStore.incomeCategories,
        historyTransactions: transactionStore.recent,
        autoFillRules: autoFillRules.value,
        now: new Date(),
      })
    } catch (error) {
      warnings.value = []
      hasDraft.value = false
      latestLoanIntent.value = null
      uiStore.pushToast(error?.message || 'AI 解析失敗，請稍後再試', 'error')
      return
    }

    warnings.value = resolveAiParserWarnings(result)

    if (!result.draft) {
      hasDraft.value = false
      latestLoanIntent.value = null
      const warningMessage = warnings.value[0] || t('ai_bookkeeping.warning.no_draft', '我沒有抓到可用交易資訊，請再描述一次')
      uiStore.pushToast(warningMessage, 'error')
      return
    }

    applyDraft(result.draft)
    latestLoanIntent.value = result.draft.loanIntent ?? null
    if (fromSpeech) {
      model.note = ''
    }
    hasDraft.value = true
    shouldAutoSubmit = Boolean(options.autoCreate)
    if (!warnings.value.length) {
      uiStore.pushToast('解析完成，請確認後儲存')
    } else {
      uiStore.pushToast('解析完成，請先確認警示項目')
    }
  } finally {
    const elapsed = Date.now() - startedAt
    if (elapsed < 260) {
      await waitFor(260 - elapsed)
    }
    parsing.value = false
  }

  if (shouldAutoSubmit) {
    const created = await submit({
      autoCreated: true,
      keepDraft: true,
      preserveSourceText: true,
    })
    if (created) {
      uiStore.pushToast(t('ai_bookkeeping.toast.auto_applied_editable', '已先套用交易，下方可再編輯'))
    }
  }
}

async function toggleVoiceInput() {
  if (parsing.value || submitting.value) return
  if (speechListening.value) {
    stopSpeech()
    return
  }

  speechLiveText.value = ''
  let heardFinal = false
  let lastInterimText = ''
  let finalSegmentsText = ''
  let autoStopped = false
  const started = await startSpeech({
    lang: speechLanguage.value,
    interimResults: true,
    onResult: ({ finalText, interimText }) => {
      if (finalText) {
        heardFinal = true
        lastInterimText = ''
        finalSegmentsText = `${finalSegmentsText} ${finalText}`.trim()
        sourceText.value = finalSegmentsText
        speechLiveText.value = ''
        if (!autoStopped) {
          autoStopped = true
          void stopSpeech()
        }
      } else if (interimText) {
        lastInterimText = interimText
        speechLiveText.value = interimText
      }
    },
    onError: (message) => {
      uiStore.pushToast(message || '語音辨識失敗，請改用手動輸入', 'error')
    },
    onEnd: () => {
      if (heardFinal) {
        void parseText({ fromSpeech: true })
      } else if (lastInterimText) {
        sourceText.value = lastInterimText
        void parseText({ fromSpeech: true })
      }
      speechLiveText.value = ''
    },
  })

  if (!started && !speechLastError.value) {
    uiStore.pushToast('語音啟動失敗，請稍後再試', 'error')
  }
}

function applyDraft(draft) {
  model.type = draft.type
  model.amountMajor = Math.abs(Number(draft.amountMinor ?? 0)) / 100
  const date = new Date(draft.occurredAt)
  model.occurredDate = toDateInput(date)
  model.occurredHour = date.getHours()
  model.occurredMinute = date.getMinutes()
  model.accountId = draft.accountId ?? directAccountOptions.value[0]?.id ?? ''
  model.peerAccountId = draft.peerAccountId ?? transferAccountOptions.value.find((item) => item.id !== model.accountId)?.id ?? ''
  model.categoryId = draft.categoryId ?? ''
  model.note = draft.note ?? ''
  model.isReimbursable = Boolean(draft.isReimbursable) && draft.type === 'expense'
  model.includeInBudget = Boolean(draft.includeInBudget)
  model.includeInAnalysis = Boolean(draft.includeInAnalysis)
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
}

function resetPersistedTransaction() {
  persistedTransactionId.value = ''
  persistedTransactionType.value = ''
}

function resolveAiLimitWithManualHint(message) {
  const baseMessage = String(message ?? '').trim() || '免費版 AI 記帳每日最多 5 次'
  const manualHint = t('ai_bookkeeping.toast.limit_manual_hint', '可改用手動記帳（快速新增）')
  if (baseMessage.includes(manualHint)) return baseMessage
  return `${baseMessage}，${manualHint}`
}

async function refreshLinkedDataAfterLoanWrite() {
  await Promise.all([
    loanStore.load(),
    transactionStore.loadRecent(),
    budgetStore.loadMonth(budgetStore.monthKey),
    accountStore.load(),
  ])
}

async function submit(options = {}) {
  const autoCreated = Boolean(options.autoCreated)
  const keepDraft = Boolean(options.keepDraft)
  const preserveSourceText = Boolean(options.preserveSourceText)
  if (parsing.value || submitting.value) return
  const amountMinor = Math.round(Math.abs(Number(model.amountMajor ?? 0)) * 100)
  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  const loanIntent = latestLoanIntent.value

  if (amountMinor <= 0) {
    uiStore.pushToast('請輸入有效金額（需大於 0）', 'error')
    return
  }
  if (!occurredAt) {
    uiStore.pushToast('請選擇有效時間', 'error')
    return
  }
  if (!model.accountId) {
    uiStore.pushToast('請選擇帳戶', 'error')
    return
  }
  if (!loanIntent && model.type !== 'transfer' && !model.categoryId) {
    uiStore.pushToast('沒有分類，請在設定中新增後再試，未建立交易紀錄', 'error')
    return
  }

  const usage = getAiBookkeepingDailyUsage()
  if (Number.isFinite(usage.limit) && usage.used >= usage.limit) {
    uiStore.pushToast(resolveAiLimitWithManualHint('免費版 AI 記帳每日最多 5 次'), 'error')
    return
  }

  submitting.value = true
  try {
    if (loanIntent) {
      const actionLabel = resolveLoanActionLabel(loanIntent)
      const noteText = String(model.note ?? '').trim()

      if (loanIntent.mode === 'create') {
        const counterpartyName = resolveLoanCounterpartyName(loanIntent)
        if (!counterpartyName) {
          uiStore.pushToast('沒有辨識到借貸對象，請補上名字後再試', 'error')
          return
        }
        await withTimeout(
          loanStore.create({
            direction: loanIntent.direction === 'borrow' ? 'borrow' : 'lend',
            counterpartyName,
            principalMinor: amountMinor,
            interestMinor: 0,
            startDate: formatLoanStartDateTime(occurredAt),
            dueDate: null,
            occurredAt: resolveLoanOccurredAtIso(occurredAt),
            accountId: model.accountId,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
      } else {
        await withTimeout(
          loanStore.load(),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        const matched = pickLoanForAiRepayment(loanStore.items, loanIntent)
        if (!matched.loan) {
          uiStore.pushToast(matched.warning || '找不到可歸還/收回的借貸紀錄', 'error')
          return
        }
        if (matched.warning) {
          uiStore.pushToast(matched.warning)
        }
        await withTimeout(
          loanStore.repay({
            loanId: matched.loan.id,
            accountId: model.accountId,
            amountMinor,
            note: noteText,
            paidAt: resolveLoanOccurredAtIso(occurredAt),
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
      }

      await withTimeout(
        refreshLinkedDataAfterLoanWrite(),
        AI_SUBMIT_TIMEOUT_MS,
        'AI 記帳逾時，請稍後再試',
      )
      recordAiBookkeepingUsage()
      uiStore.pushToast(autoCreated ? `已先完成${actionLabel}` : `AI 自動記帳已完成${actionLabel}`)
      if (!keepDraft) {
        hasDraft.value = false
        warnings.value = []
        latestLoanIntent.value = null
        resetPersistedTransaction()
      }
      if (!preserveSourceText) {
        sourceText.value = ''
        speechLiveText.value = ''
      }
      return true
    }

    const noteText = String(model.note ?? '').trim()
    const currentPersistedTxId = String(persistedTransactionId.value ?? '').trim()
    const currentPersistedType = String(persistedTransactionType.value ?? '').trim()
    const switchingTransferBoundary = Boolean(currentPersistedTxId) && (
      (currentPersistedType === 'transfer' && model.type !== 'transfer')
      || (currentPersistedType !== 'transfer' && model.type === 'transfer')
    )
    if (switchingTransferBoundary) {
      await withTimeout(
        transactionStore.deleteTransaction(currentPersistedTxId),
        AI_SUBMIT_TIMEOUT_MS,
        'AI 記帳逾時，請稍後再試',
      )
      resetPersistedTransaction()
    }

    let updatedExisting = false
    const targetTxId = String(persistedTransactionId.value ?? '').trim()
    if (model.type === 'transfer') {
      if (!model.peerAccountId || model.accountId === model.peerAccountId) {
        uiStore.pushToast('請選擇不同的轉出/轉入帳戶', 'error')
        return
      }
      const transferRate = await resolveTransferRateOrThrow()
      const transferToAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(amountMinor, transferRate)
        : amountMinor
      if (transferToAmountMinor <= 0) {
        uiStore.pushToast('轉入金額需大於 0，請調整匯率', 'error')
        return
      }
      if (targetTxId) {
        await withTimeout(
          transactionStore.updateTransaction(targetTxId, {
            type: 'transfer',
            amountMinor,
            toAmountMinor: transferToAmountMinor,
            sourceExtraMinor: 0,
            occurredAt,
            accountId: model.accountId,
            peerAccountId: model.peerAccountId,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionType.value = 'transfer'
        updatedExisting = true
      } else {
        const transferResult = await withTimeout(
          transactionStore.addTransfer({
            amountMinor,
            toAmountMinor: transferToAmountMinor,
            occurredAt,
            fromAccountId: model.accountId,
            toAccountId: model.peerAccountId,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionId.value = String(transferResult?.outTxId ?? transferResult?.inTxId ?? '').trim()
        persistedTransactionType.value = 'transfer'
      }
    } else if (model.type === 'income') {
      if (targetTxId) {
        await withTimeout(
          transactionStore.updateTransaction(targetTxId, {
            type: 'income',
            amountMinor,
            occurredAt,
            accountId: model.accountId,
            categoryId: model.categoryId,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionType.value = 'income'
        updatedExisting = true
      } else {
        const createdTxId = await withTimeout(
          transactionStore.addIncome({
            amountMinor,
            occurredAt,
            accountId: model.accountId,
            categoryId: model.categoryId,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionId.value = String(createdTxId ?? '').trim()
        persistedTransactionType.value = 'income'
      }
    } else {
      if (targetTxId) {
        await withTimeout(
          transactionStore.updateTransaction(targetTxId, {
            type: 'expense',
            amountMinor,
            occurredAt,
            accountId: model.accountId,
            categoryId: model.categoryId,
            isReimbursable: model.isReimbursable,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionType.value = 'expense'
        updatedExisting = true
      } else {
        const createdTxId = await withTimeout(
          transactionStore.addExpense({
            amountMinor,
            occurredAt,
            accountId: model.accountId,
            categoryId: model.categoryId,
            isReimbursable: model.isReimbursable,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionId.value = String(createdTxId ?? '').trim()
        persistedTransactionType.value = 'expense'
      }
    }

    recordAiBookkeepingUsage()
    if (!autoCreated) {
      uiStore.pushToast(
        updatedExisting
          ? t('ai_bookkeeping.toast.updated', 'AI 記帳已更新交易')
          : t('ai_bookkeeping.toast.saved', 'AI 記帳已儲存交易'),
      )
    }
    if (!keepDraft) {
      hasDraft.value = false
      warnings.value = []
      latestLoanIntent.value = null
      resetPersistedTransaction()
    }
    if (!preserveSourceText) {
      sourceText.value = ''
      speechLiveText.value = ''
    }
    return true
  } catch (error) {
    uiStore.pushToast(error.message ?? t('ai_bookkeeping.toast.save_failed', '儲存交易失敗'), 'error')
    return false
  } finally {
    submitting.value = false
  }
}

function warmupRecentHistoryInBackground() {
  if (historyWarmupTask || transactionStore.recent.length) return
  historyWarmupTask = withTimeout(
    transactionStore.loadRecent(120),
    AI_HISTORY_WARMUP_TIMEOUT_MS,
    'AI 歷史資料預載逾時',
  )
    .catch((error) => {
      console.warn('[ai-page] recent history warmup failed', error)
    })
    .finally(() => {
      historyWarmupTask = null
    })
}

async function loadAutoFillRules() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    autoFillRules.value = []
    return
  }
  autoFillRules.value = await getAutoFillRules(ledgerId).catch(() => [])
}

function waitFor(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  const safeTimeoutMs = Math.max(0, Number(timeoutMs) || 0)
  if (safeTimeoutMs === 0) return Promise.resolve(task)

  let timeoutId = 0
  const timeoutTask = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, safeTimeoutMs)
  })

  return Promise.race([Promise.resolve(task), timeoutTask]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function resolveAiParserWarnings(result) {
  const warningKeys = Array.isArray(result?.warningKeys) ? result.warningKeys : []
  if (warningKeys.length) {
    return warningKeys.map((key, index) => {
      const fallbackByKey = getAiBookkeepingWarningFallback(key)
      const fallbackByPayload = String(result?.warnings?.[index] ?? '').trim()
      return t(key, fallbackByPayload || fallbackByKey || key)
    })
  }
  return (result?.warnings ?? []).map((warning) => t(warning, warning))
}

onBeforeRouteLeave((_to, _from, next) => {
  if (isPageLeaving.value) {
    next()
    return
  }
  isPageLeaving.value = true

  let done = false
  const finish = () => {
    if (done) return
    done = true
    next()
  }

  pageRef.value?.addEventListener('animationend', finish, { once: true })
  setTimeout(finish, 260)
})

function toDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toOccurredAtIso(dateInput, hourInput, minuteInput) {
  if (!dateInput) return ''
  const hour = Number(hourInput)
  const minute = Number(minuteInput)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ''
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''

  const local = `${dateInput}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  const parsed = new Date(local)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

function accountCurrencyCode(accountId) {
  const raw = accountStore.accounts.find((item) => item.id === accountId)?.currency_code
  return normalizeCurrencyCode(raw, 'TWD')
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

async function loadExchangeRateSnapshot() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  try {
    const snapshot = await getExchangeRateSnapshot(ledgerId)
    exchangeRateSnapshot.value = snapshot
  } catch (error) {
    console.warn('[ai-page] load exchange rate snapshot failed', error)
  }
}

async function syncExchangeRateSnapshotNow(options = {}) {
  const silent = Boolean(options?.silent)
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || exchangeRateSyncing.value) return false

  exchangeRateSyncing.value = true
  try {
    const snapshot = await syncCbcExchangeRateSnapshot(ledgerId)
    exchangeRateSnapshot.value = snapshot
    if (!silent) {
      uiStore.pushToast(`匯率同步完成（資料日期：${snapshot.effectiveDate || '-'}）`)
    }
    return true
  } catch (error) {
    if (!silent) {
      uiStore.pushToast(error.message ?? '匯率同步失敗', 'error')
    }
    return false
  } finally {
    exchangeRateSyncing.value = false
  }
}

async function resolveTransferRateOrThrow() {
  if (!transferNeedsExchangeRate.value) {
    return 1
  }

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
    const synced = await withTimeout(
      syncExchangeRateSnapshotNow({ silent: true }),
      TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS,
      '系統匯率同步逾時，請改用手動輸入或稍後再試',
    )
    if (!synced && !hasSystemExchangeRateReady()) {
      throw new Error('找不到可用的系統匯率，請改用手動輸入')
    }
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

function formatCurrencyMinor(valueMinor, currencyCode = 'TWD') {
  const minor = Math.abs(Math.round(Number(valueMinor) || 0))
  const major = minor / 100
  const safeCurrency = normalizeCurrencyCode(currencyCode, 'TWD')
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major)
}
</script>

<style scoped>.panel {
  padding: 14px
}
.ai-page {
  position: relative;
  isolation: isolate;
  animation: ai-page-enter var(--anim-mid) var(--anim-spring) both;
}
.ai-page.leaving {
  animation: ai-page-leave 220ms ease forwards;
}
.ai-page::before {
  content: '';
  position: absolute;
  top: -24px;
  left: -10px;
  right: -10px;
  height: 220px;
  background:
    radial-gradient(circle at 10% 20%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 48%),
    radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--ok) 18%, transparent), transparent 44%);
  filter: blur(10px);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
  animation: ai-bg-drift 8s ease-in-out infinite alternate;
}
.ai-page > * {
  position: relative;
  z-index: 1;
}
h2, h3 {
  margin: 0
}
.field {
  display: grid;
  gap: 6px
}
.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.action-row {
  margin-top: 10px
}
.result-action-row {
  margin-top: 12px;
  justify-content: flex-end;
}
.icon-action-btn {
  min-width: 40px;
  width: 40px;
  height: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-action-btn.busy {
  animation: ai-btn-pulse 1.2s ease-in-out infinite;
}
.ai-busy-panel {
  position: relative;
  overflow: hidden;
}
.ai-busy-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    120deg,
    transparent 0%,
    color-mix(in srgb, var(--primary) 14%, transparent) 42%,
    transparent 72%
  );
  transform: translateX(-130%);
  animation: ai-panel-scan 1.7s ease-in-out infinite;
  pointer-events: none;
}
.ai-status-chip {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 38%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-soft);
}
.ai-status-wave {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--primary);
  opacity: 0.35;
  animation: ai-wave-dot 900ms ease-in-out infinite;
}
.ai-status-wave:nth-child(2) {
  animation-delay: 120ms;
}
.ai-status-wave:nth-child(3) {
  animation-delay: 240ms;
}
.warn-list {
  margin: 10px 0 0;
  padding-left: 18px;
  color: var(--danger-text)
}
.result-panel {
  border: 1px solid var(--border);
}
.type-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px
}
.form-wrap {
  margin-top: 14px
}
.inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fx-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.fx-system-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fx-note {
  margin: 0;
}
.switch-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px
}
.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.switch-row {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.switch-track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 32%, transparent);
  position: relative;
  display: inline-block;
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 180ms ease;
}
.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 52%, var(--border) 48%);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-soft) 90%);
}
.switch-row.active .switch-thumb {
  transform: translateX(18px);
}
.ai-status-fade-enter-active,
.ai-status-fade-leave-active {
  transition: opacity var(--anim-fast) ease, transform var(--anim-fast) ease;
}
.ai-status-fade-enter-from,
.ai-status-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.ai-result-pop-enter-active,
.ai-result-pop-leave-active {
  transition: opacity var(--anim-mid) ease, transform var(--anim-mid) var(--anim-spring);
}
.ai-result-pop-enter-from,
.ai-result-pop-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.985);
}
.ai-action-swap-enter-active,
.ai-action-swap-leave-active {
  transition: opacity var(--anim-fast) ease, transform var(--anim-fast) ease;
}
.ai-action-swap-enter-from,
.ai-action-swap-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}
.ai-warn-pop-enter-active,
.ai-warn-pop-leave-active {
  transition: opacity var(--anim-mid) ease, transform var(--anim-mid) ease;
}
.ai-warn-pop-enter-from,
.ai-warn-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@keyframes ai-btn-pulse {
  0%, 100% {
    transform: scale(1);
    filter: brightness(1);
  }
  50% {
    transform: scale(1.04);
    filter: brightness(1.1);
  }
}
@keyframes ai-wave-dot {
  0%, 100% {
    opacity: 0.32;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
@keyframes ai-panel-scan {
  0% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(130%);
  }
}
@keyframes ai-bg-drift {
  0% {
    transform: translate3d(-4px, 0, 0);
  }
  100% {
    transform: translate3d(8px, -6px, 0);
  }
}
@keyframes ai-page-enter {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.99);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes ai-page-leave {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(10px) scale(0.992);
  }
}
@media (max-width: 520px) {
  .inline-grid,
  .switch-grid,
  .fx-mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
