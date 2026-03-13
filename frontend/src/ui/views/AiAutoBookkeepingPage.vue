<template>
  <section class="stack ai-chat-page">
    <article v-if="!embedded" class="card panel page-header">
      <header class="row header-row">
        <div class="header-copy">
          <h2>AI 記帳助理</h2>
          <p class="muted header-subtitle">直接聊天記帳、補完欄位、看分析圖表。</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn" @click="goManualBookkeeping">手動新增</button>
          <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
        </div>
      </header>
    </article>

    <article class="card panel chat-panel" :class="{ busy: showAiStatus }">
      <header class="chat-hero">
        <div class="hero-copy">
          <small class="hero-eyebrow">AI Chat Bookkeeping</small>
          <h3>一句話記帳，資料不完整時我會一步步帶你補完。</h3>
        </div>
        <div class="hero-status">
          <span class="status-dot" :class="{ active: showAiStatus }"></span>
          <span>{{ aiStatusText || contextLabel }}</span>
        </div>
      </header>

      <div ref="messageListRef" class="message-list">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message-row"
          :class="`role-${message.role}`"
        >
          <div v-if="message.kind === 'text'" class="message-bubble" :class="bubbleClass(message)">
            <p>{{ message.text }}</p>
            <small>{{ message.timeLabel }}</small>
          </div>

          <article v-else-if="message.kind === 'draft'" class="assistant-card draft-card">
            <header class="card-head">
              <div>
                <small class="card-eyebrow">{{ message.payload.status === 'confirm' ? '待確認' : '資料補完' }}</small>
                <h4>{{ message.payload.title }}</h4>
              </div>
              <span class="state-pill" :class="message.payload.status">
                {{ message.payload.status === 'confirm' ? '可儲存' : `缺 ${message.payload.missingFields.length}` }}
              </span>
            </header>

            <div class="draft-summary">
              <div class="summary-line">
                <span class="summary-label">{{ message.payload.summaryLabel }}</span>
                <MoneyText
                  v-if="message.payload.amountMinor !== null"
                  :value-minor="message.payload.amountMinor"
                  :tone="message.payload.amountTone"
                  class="summary-money"
                />
                <span v-else class="muted summary-empty">未填金額</span>
              </div>
              <div class="summary-grid">
                <div class="summary-item">
                  <small>帳戶</small>
                  <span>{{ message.payload.accountLabel }}</span>
                </div>
                <div v-if="message.payload.peerAccountLabel" class="summary-item">
                  <small>轉入</small>
                  <span>{{ message.payload.peerAccountLabel }}</span>
                </div>
                <div class="summary-item">
                  <small>分類</small>
                  <span>{{ message.payload.categoryLabel }}</span>
                </div>
                <div class="summary-item">
                  <small>時間</small>
                  <span>{{ message.payload.timeLabel }}</span>
                </div>
              </div>
              <p v-if="message.payload.note" class="draft-note">備註：{{ message.payload.note }}</p>
            </div>

            <ul v-if="message.payload.warnings.length" class="warn-list">
              <li v-for="warning in message.payload.warnings" :key="warning">{{ warning }}</li>
            </ul>

            <div v-if="message.payload.missingFields.length" class="missing-wrap">
              <button
                v-for="field in message.payload.missingFields"
                :key="field.key"
                type="button"
                class="missing-field-btn"
                @click="beginFillField(field.key)"
              >
                <span class="missing-priority">{{ field.priority }}</span>
                <span class="missing-main">{{ field.label }}</span>
                <span class="missing-hint">{{ field.hint }}</span>
              </button>
            </div>

            <div v-if="message.payload.optionalFields.length" class="optional-wrap">
              <small class="muted optional-title">附加項目</small>
              <div class="option-chip-row">
                <button
                  v-for="field in message.payload.optionalFields"
                  :key="field.key"
                  type="button"
                  class="option-chip"
                  @click="beginFillField(field.key)"
                >
                  {{ field.label }}
                </button>
              </div>
            </div>

            <div v-if="message.payload.categoryCandidates.length" class="candidate-wrap">
              <small class="muted optional-title">分類候選</small>
              <div class="option-chip-row">
                <button
                  v-for="category in message.payload.categoryCandidates"
                  :key="category.id"
                  type="button"
                  class="option-chip"
                  @click="selectCategory(category.id)"
                >
                  {{ category.name }}
                </button>
                <button
                  v-if="message.payload.categoryHint"
                  type="button"
                  class="option-chip accent"
                  @click="createCategoryFromHint(message.payload.categoryHint)"
                >
                  新增分類「{{ message.payload.categoryHint }}」
                </button>
              </div>
            </div>

            <div v-if="message.payload.accountCandidates.length" class="candidate-wrap">
              <small class="muted optional-title">帳戶候選</small>
              <div class="option-chip-row">
                <button
                  v-for="account in message.payload.accountCandidates"
                  :key="account.id"
                  type="button"
                  class="option-chip"
                  @click="selectAccount(account.id, message.payload.accountFieldKey)"
                >
                  {{ account.name }}
                </button>
              </div>
            </div>

            <footer class="card-actions">
              <button
                v-if="message.payload.status === 'confirm'"
                type="button"
                class="btn primary"
                :class="{ busy: submitting }"
                :disabled="submitting || parsing"
                @click="saveDraft"
              >
                {{ persistedTransactionId ? '儲存修改' : '確認儲存' }}
              </button>
              <button
                v-else
                type="button"
                class="btn primary"
                :disabled="submitting || parsing"
                @click="focusFirstMissingField"
              >
                補齊欄位
              </button>
              <button type="button" class="btn" :disabled="submitting || parsing" @click="beginFillField('category')">修改分類</button>
              <button type="button" class="btn" :disabled="submitting || parsing" @click="beginFillField('note')">補充備註</button>
            </footer>
          </article>

          <article v-else-if="message.kind === 'analysis'" class="assistant-card analysis-card">
            <header class="card-head">
              <div>
                <small class="card-eyebrow">分析結果</small>
                <h4>{{ message.payload.title }}</h4>
              </div>
              <span class="state-pill neutral">{{ message.payload.rangeLabel }}</span>
            </header>

            <div class="summary-pill-grid">
              <div class="summary-pill">
                <small>收入</small>
                <MoneyText :value-minor="message.payload.summary.incomeMinor" tone="income" />
              </div>
              <div class="summary-pill">
                <small>支出</small>
                <MoneyText :value-minor="message.payload.summary.expenseMinor" tone="expense" />
              </div>
              <div class="summary-pill">
                <small>結餘</small>
                <MoneyText :value-minor="message.payload.summary.balanceMinor" />
              </div>
            </div>

            <div class="chart-toggle-row">
              <button
                type="button"
                class="btn"
                :class="{ primary: message.payload.chartType === 'pie' }"
                @click="rerunAnalysisWithChart(message.payload.queryText, 'pie')"
              >
                圓餅圖
              </button>
              <button
                type="button"
                class="btn"
                :class="{ primary: message.payload.chartType === 'bar' }"
                @click="rerunAnalysisWithChart(message.payload.queryText, 'bar')"
              >
                長條圖
              </button>
              <button
                type="button"
                class="btn"
                :class="{ primary: message.payload.chartType === 'trend' }"
                @click="rerunAnalysisWithChart(message.payload.queryText, 'trend')"
              >
                趨勢圖
              </button>
            </div>

            <div v-if="message.payload.chartType === 'pie'" class="pie-layout">
              <div class="pie-chart" :style="{ background: message.payload.pieStyle }">
                <div class="pie-hole">
                  <small>{{ message.payload.chartSubtitle }}</small>
                  <MoneyText :value-minor="message.payload.summary.chartTotalMinor" />
                </div>
              </div>
              <ul class="legend-list">
                <li v-for="row in message.payload.rows" :key="row.id">
                  <span class="legend-dot" :style="{ background: row.color }"></span>
                  <span class="legend-name">{{ row.label }}</span>
                  <span class="legend-value">{{ row.percent }}%</span>
                </li>
              </ul>
            </div>

            <ul v-else-if="message.payload.chartType === 'bar'" class="bar-chart-list">
              <li v-for="row in message.payload.rows" :key="row.id">
                <div class="bar-head">
                  <span>{{ row.label }}</span>
                  <div class="bar-stats">
                    <MoneyText :value-minor="row.amountMinor" />
                    <small>{{ row.percent }}%</small>
                  </div>
                </div>
                <div class="bar-track">
                  <span class="bar-fill" :style="{ width: `${row.barPercent}%`, background: row.color }"></span>
                </div>
              </li>
            </ul>

            <div v-else class="trend-chart">
              <button
                v-for="row in message.payload.rows"
                :key="row.id"
                type="button"
                class="trend-col"
                disabled
              >
                <div class="trend-value">
                  <MoneyText :value-minor="row.amountMinor" />
                </div>
                <div class="trend-track">
                  <span class="trend-fill" :style="{ height: `${row.barPercent}%`, background: row.color }"></span>
                </div>
                <div class="trend-label">{{ row.label }}</div>
              </button>
            </div>

            <div class="analysis-footer">
              <p>{{ message.payload.insight }}</p>
              <p v-if="message.payload.compareText" class="muted">{{ message.payload.compareText }}</p>
            </div>

            <div class="option-chip-row action-chips">
              <button
                v-for="action in message.payload.actions"
                :key="action.id"
                type="button"
                class="option-chip"
                @click="runQuickQuery(action.query)"
              >
                {{ action.label }}
              </button>
            </div>
          </article>

          <article v-else-if="message.kind === 'records'" class="assistant-card records-card">
            <header class="card-head">
              <div>
                <small class="card-eyebrow">最近紀錄</small>
                <h4>{{ message.payload.title }}</h4>
              </div>
              <span class="state-pill neutral">{{ message.payload.records.length }} 筆</span>
            </header>

            <div class="record-list">
              <article v-for="record in message.payload.records" :key="record.id" class="record-row">
                <div class="record-main">
                  <div class="record-line">
                    <span class="record-type">{{ typeLabel(record.type) }}</span>
                    <span class="record-name">{{ record.category_name || record.note || '未分類' }}</span>
                  </div>
                  <div class="record-meta">
                    <span>{{ record.account_name || '未指定帳戶' }}</span>
                    <span>{{ formatDateTimeLabel(record.occurred_at) }}</span>
                  </div>
                </div>
                <div class="record-side">
                  <MoneyText :value-minor="Math.abs(Number(record.amount_minor ?? 0))" :tone="record.type === 'expense' ? 'expense' : record.type === 'income' ? 'income' : ''" />
                  <div class="record-actions">
                    <button type="button" class="btn" @click="loadRecordForEditing(record)">編輯</button>
                    <button type="button" class="btn danger" @click="promptDeleteRecord(record)">刪除</button>
                  </div>
                </div>
              </article>
            </div>
          </article>

          <article v-else-if="message.kind === 'delete-confirm'" class="assistant-card delete-card">
            <header class="card-head">
              <div>
                <small class="card-eyebrow">刪除確認</small>
                <h4>{{ message.payload.title }}</h4>
              </div>
            </header>
            <p class="delete-copy">{{ message.payload.description }}</p>
            <footer class="card-actions">
              <button type="button" class="btn danger" :disabled="submitting || parsing" @click="confirmDeleteRecord(message.payload.recordId)">
                確認刪除
              </button>
              <button type="button" class="btn" :disabled="submitting || parsing" @click="pushAssistantText('已取消刪除。')">
                取消
              </button>
            </footer>
          </article>
        </div>
      </div>

      <footer class="composer-shell">
        <div class="composer-meta">
          <span>{{ contextLabel }}</span>
          <button
            v-if="hasDraft"
            type="button"
            class="composer-clear"
            :disabled="submitting || parsing"
            @click="cancelDraft"
          >
            清除草稿
          </button>
        </div>

        <div class="quick-chip-row">
          <button
            v-for="chip in visibleQuickChips"
            :key="chip.id"
            type="button"
            class="quick-chip"
            :class="chip.tone"
            @click="onQuickChipClick(chip)"
          >
            {{ chip.label }}
          </button>
        </div>

        <small v-if="speechListening && speechLiveText" class="muted voice-tip">語音辨識中：{{ speechLiveText }}</small>

        <div class="composer-row">
          <button
            v-if="speechSupported"
            type="button"
            class="btn icon-action-btn"
            :class="{ primary: speechListening }"
            :disabled="parsing || submitting"
            :aria-label="speechListening ? '停止語音輸入' : '語音輸入'"
            @click="toggleVoiceInput"
          >
            <font-awesome-icon icon="fa-solid fa-microphone" />
          </button>
          <textarea
            v-model.trim="composerText"
            class="composer-input"
            rows="1"
            :placeholder="composerPlaceholder"
            :disabled="submitting"
            @keydown.enter.exact.prevent="submitComposer"
          />
          <button
            type="button"
            class="btn primary icon-action-btn"
            :class="{ busy: parsing || submitting }"
            :disabled="parsing || submitting"
            aria-label="送出"
            @click="submitComposer"
          >
            <font-awesome-icon icon="fa-solid fa-paper-plane" />
          </button>
        </div>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { getAiBookkeepingWarningFallback, parseAutoBookkeepingText } from '@/core/services/ai-bookkeeping.service'
import { createId } from '@/core/utils/id'
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
import { mergeAddonItemsToNote } from '@/ui/utils/addon-note'
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
import {
  listAllTransactions,
  listRecentTransactions,
  listTransactionsByDay,
  listTransactionsByMonth,
} from '@/core/repositories/transaction.repo'

const props = defineProps({
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

const messageListRef = ref(null)
const messages = ref([])
const composerText = ref('')
const parsing = ref(false)
const submitting = ref(false)
const speechLiveText = ref('')
const pendingInputMode = ref('default')
const autoFillRules = ref([])
const persistedTransactionId = ref('')
const persistedTransactionType = ref('')
const latestLoanIntent = ref(null)
const exchangeRateSnapshot = ref({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})
const exchangeRateSyncing = ref(false)
let historyWarmupTask = null

const {
  isSupported: speechSupported,
  isListening: speechListening,
  lastError: speechLastError,
  start: startSpeech,
  stop: stopSpeech,
} = useSpeechInput()

const AI_SUBMIT_TIMEOUT_MS = 15000
const AI_HISTORY_WARMUP_TIMEOUT_MS = 1800
const TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS = 8000
const CHART_COLORS = [
  '#53E5C1',
  '#6CA8FF',
  '#FFB454',
  '#FF7D7D',
  '#AC8DFF',
  '#7EE787',
]

const draftState = reactive({
  sourceText: '',
  warnings: [],
  missingFields: [],
  categoryHint: '',
  categoryCandidates: [],
  recentIntent: 'create',
})

const model = reactive(createEmptyModel())

const aiParserAccounts = computed(() => {
  const groupNameMap = new Map(accountStore.groups.map((group) => [String(group?.id ?? ''), String(group?.name ?? '').trim()]))
  return accountStore.regularAccounts.map((account) => ({
    ...account,
    groupName: groupNameMap.get(String(account?.group_id ?? '')) ?? '',
  }))
})

const showAiStatus = computed(() => speechListening.value || parsing.value || submitting.value || exchangeRateSyncing.value)
const aiStatusText = computed(() => {
  if (submitting.value) return '儲存中...'
  if (parsing.value) return 'AI 解析中...'
  if (exchangeRateSyncing.value) return '同步匯率中...'
  if (speechListening.value) return 'AI 聆聽中...'
  return ''
})
const hasDraft = computed(() => draftState.recentIntent !== 'idle' && (draftState.sourceText || persistedTransactionId.value))
const currentMissingFields = computed(() => draftState.missingFields)
const composerPlaceholder = computed(() => {
  if (pendingInputMode.value === 'amount') return '輸入金額，例如 50 或 120+35'
  if (pendingInputMode.value === 'account') return '輸入帳戶，例如 現金、玉山、郵局'
  if (pendingInputMode.value === 'target_account') return '輸入轉入帳戶'
  if (pendingInputMode.value === 'category') return '輸入分類，例如 早餐、餐飲'
  if (pendingInputMode.value === 'note') return '輸入備註內容'
  if (pendingInputMode.value === 'person') return '輸入對象姓名'
  return '例如：早餐 50 現金 / 顯示本月支出圓餅圖 / 最近紀錄'
})
const contextLabel = computed(() => {
  if (pendingInputMode.value === 'amount') return '請先補上金額'
  if (pendingInputMode.value === 'account') return '請選擇付款帳戶'
  if (pendingInputMode.value === 'target_account') return '請選擇轉入帳戶'
  if (pendingInputMode.value === 'category') return '請選擇既有分類或新增分類'
  if (pendingInputMode.value === 'note') return '請輸入備註內容'
  if (pendingInputMode.value === 'person') return '請補上借貸對象'
  if (currentMissingFields.value.length) return `還差 ${currentMissingFields.value.length} 個欄位就能儲存`
  if (hasDraft.value) return persistedTransactionId.value ? '這筆紀錄已帶入，可修改後儲存' : '草稿已完整，可直接確認儲存'
  return '像聊天一樣輸入，我會自動辨識支出、收入、轉帳與分析查詢'
})
const speechLanguage = computed(() => (locale.value === 'en' ? 'en-US' : 'zh-TW'))
const transferFromCurrency = computed(() => accountCurrencyCode(model.accountId))
const transferToCurrency = computed(() => accountCurrencyCode(model.peerAccountId))
const transferNeedsExchangeRate = computed(() => model.type === 'transfer' && transferFromCurrency.value !== transferToCurrency.value)

const visibleQuickChips = computed(() => {
  if (pendingInputMode.value === 'amount' || hasMissingField('amount')) {
    return [50, 80, 100, 120, 150, 200].map((value) => ({
      id: `amount_${value}`,
      label: `${value}`,
      action: 'amount',
      value,
      tone: 'accent',
    }))
  }

  if (pendingInputMode.value === 'account' || hasMissingField('account')) {
    return accountStore.regularAccounts.slice(0, 6).map((account) => ({
      id: `account_${account.id}`,
      label: account.name,
      action: 'account',
      value: account.id,
      tone: '',
    }))
  }

  if (pendingInputMode.value === 'target_account' || hasMissingField('target_account')) {
    return accountStore.accounts
      .filter((account) => account.id !== model.accountId)
      .slice(0, 6)
      .map((account) => ({
        id: `peer_${account.id}`,
        label: account.name,
        action: 'target_account',
        value: account.id,
        tone: '',
      }))
  }

  if (pendingInputMode.value === 'category' || hasMissingField('category')) {
    const categories = draftState.categoryCandidates.length
      ? draftState.categoryCandidates
      : categoryListByType(model.type).slice(0, 6)
    const chips = categories.map((category) => ({
      id: `category_${category.id}`,
      label: category.name,
      action: 'category',
      value: category.id,
      tone: '',
    }))
    if (draftState.categoryHint) {
      chips.push({
        id: `category_new_${draftState.categoryHint}`,
        label: `新增 ${draftState.categoryHint}`,
        action: 'create_category',
        value: draftState.categoryHint,
        tone: 'accent',
      })
    }
    return chips
  }

  if (pendingInputMode.value === 'note') {
    return [
      { id: 'note_receipt', label: '附發票', action: 'note', value: '附發票', tone: '' },
      { id: 'note_reimb', label: '可報銷', action: 'note', value: '可報銷', tone: '' },
      { id: 'note_family', label: '家庭支出', action: 'note', value: '家庭支出', tone: '' },
    ]
  }

  return [
    { id: 'quick_expense', label: '新增支出', action: 'query', value: '早餐 50 現金', tone: '' },
    { id: 'quick_income', label: '新增收入', action: 'query', value: '薪水入帳 32000 玉山', tone: '' },
    { id: 'quick_transfer', label: '轉帳', action: 'query', value: '轉帳 1000 從郵局到玉山', tone: '' },
    { id: 'quick_today', label: '今日分析', action: 'query', value: '幫我分析今天收支', tone: 'accent' },
    { id: 'quick_month', label: '本月分析', action: 'query', value: '顯示本月支出圓餅圖', tone: 'accent' },
    { id: 'quick_recent', label: '最近紀錄', action: 'query', value: '列出最近紀錄', tone: '' },
  ]
})

watch(
  () => ledgerStore.activeLedgerId,
  async (ledgerId) => {
    if (!ledgerId) return
    await Promise.allSettled([
      accountStore.load(),
      categoryStore.load(),
      loadAutoFillRules(),
      loadExchangeRateSnapshot(),
    ])
    warmupRecentHistoryInBackground()
  },
  { immediate: true },
)

watch(
  () => [model.type, model.accountId, model.peerAccountId, ledgerStore.activeLedgerId],
  () => {
    if (!ledgerStore.activeLedgerId) return
    if (model.type !== 'transfer') return
    if (!transferNeedsExchangeRate.value) return
    if (!hasSystemExchangeRateReady()) {
      void loadExchangeRateSnapshot()
    }
  },
)

onMounted(() => {
  if (messages.value.length) return
  pushAssistantText('我是 AI 記帳助理。你可以直接說「早餐 50 現金」、「薪水入帳 32000」或「顯示本月支出圓餅圖」。')
  pushAssistantText('如果資料不完整，我會用卡片告訴你還缺什麼，點一點就能補完。')
})

function createEmptyModel() {
  const now = new Date()
  return {
    type: 'expense',
    amountMajor: 0,
    occurredDate: toDateInput(now),
    occurredHour: now.getHours(),
    occurredMinute: now.getMinutes(),
    accountId: '',
    peerAccountId: '',
    categoryId: '',
    note: '',
    isReimbursable: false,
    includeInBudget: true,
    includeInAnalysis: true,
    exchangeRateMode: 'system',
    manualExchangeRateInput: '',
    addonItems: [],
  }
}

function queueScrollToBottom() {
  nextTick(() => {
    const el = messageListRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  })
}

function pushMessage(input) {
  messages.value.push({
    id: createId('ai_msg'),
    role: input.role ?? 'assistant',
    kind: input.kind ?? 'text',
    text: input.text ?? '',
    payload: input.payload ?? null,
    timeLabel: formatClock(new Date()),
  })
  queueScrollToBottom()
}

function pushAssistantText(text) {
  pushMessage({ role: 'assistant', kind: 'text', text })
}

function pushUserText(text) {
  pushMessage({ role: 'user', kind: 'text', text })
}

function bubbleClass(message) {
  return message.role === 'user' ? 'bubble-user' : 'bubble-ai'
}

async function submitComposer() {
  if (parsing.value || submitting.value) return
  const text = String(composerText.value ?? '').trim()
  if (!text) return

  composerText.value = ''
  pushUserText(text)

  if (/^(取消|清除草稿|放棄)$/i.test(text) && hasDraft.value) {
    cancelDraft()
    return
  }

  if (shouldTreatAsDraftFollowUp()) {
    await handleDraftFollowUp(text)
    return
  }

  const intent = detectConversationIntent(text)
  if (intent.kind === 'help') {
    pushAssistantText('你可以新增支出、收入、轉帳、借貸，也可以問我今天、本週、本月分析，或叫我列出最近紀錄。')
    return
  }
  if (intent.kind === 'add_category') {
    await handleAddCategoryCommand(text)
    return
  }
  if (intent.kind === 'add_account') {
    await handleAddAccountCommand(text)
    return
  }
  if (intent.kind === 'analysis') {
    await handleAnalysisRequest(text, intent)
    return
  }
  if (intent.kind === 'records') {
    await handleRecentRecordsRequest(text, intent)
    return
  }

  await handleBookkeepingInput(text)
}

function shouldTreatAsDraftFollowUp() {
  return pendingInputMode.value !== 'default' || currentMissingFields.value.length > 0
}

function detectConversationIntent(text) {
  const source = String(text ?? '').trim()
  if (!source) return { kind: 'empty' }
  if (/^(help|幫助|你可以做什麼|可以做什麼)/i.test(source)) return { kind: 'help' }
  if (/(新增|建立).*(分類)/.test(source)) return { kind: 'add_category' }
  if (/(新增|建立).*(帳戶|帐户|account)/i.test(source)) return { kind: 'add_account' }

  const hasChartSignal = /(圓餅圖|长条图|長條圖|趨勢圖|走勢圖|排行|比較|分布)/.test(source)
  const hasAnalysisSignal = /(分析|收支|支出|收入|花最多|花多少|差額|圖表)/.test(source)
  if (hasChartSignal || hasAnalysisSignal) {
    return {
      kind: 'analysis',
      chartType: detectChartType(source),
      range: detectRange(source),
      scope: detectScope(source),
      focusType: detectFocusType(source),
    }
  }

  const hasRecordSignal = /(最近|列出|明細|紀錄|記錄)/.test(source)
  if (hasRecordSignal) {
    return {
      kind: 'records',
      range: detectRange(source),
    }
  }

  return { kind: 'bookkeeping' }
}

function detectChartType(text) {
  if (/圓餅圖/.test(text)) return 'pie'
  if (/(長條圖|排行|比較)/.test(text)) return 'bar'
  if (/(趨勢圖|走勢)/.test(text)) return 'trend'
  return ''
}

function detectScope(text) {
  if (/帳戶|帳號|现金|現金|郵局|玉山|台灣pay|台灣Pay/i.test(text)) return 'account'
  return 'category'
}

function detectFocusType(text) {
  if (/收入/.test(text) && !/支出|花費|花最多/.test(text)) return 'income'
  if (/支出|花費|花最多|花多少/.test(text)) return 'expense'
  return 'both'
}

function detectRange(text) {
  const explicit = parseExplicitDateRange(text)
  if (explicit) return explicit

  const recentMatch = text.match(/(?:最近|近)(\d{1,2})\s*[天日]/)
  if (recentMatch) {
    return { kind: 'recent_days', days: Number(recentMatch[1]), label: `最近 ${recentMatch[1]} 天` }
  }
  if (/(今天|今日)/.test(text)) return { kind: 'today', label: '今天' }
  if (/(本週|這週|本周|这周)/.test(text)) return { kind: 'week', label: '本週' }
  if (/(本月|這個月|这个月)/.test(text)) return { kind: 'month', label: '本月' }
  return { kind: 'month', label: '本月' }
}

function parseExplicitDateRange(text) {
  const matched = text.match(/(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*(?:到|至|\-|~)\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/)
  if (!matched) return null
  const start = parseLooseDate(matched[1])
  const end = parseLooseDate(matched[2])
  if (!start || !end) return null
  return {
    kind: 'custom',
    start,
    end,
    label: `${toDateInput(start)} ~ ${toDateInput(end)}`,
  }
}

async function handleBookkeepingInput(text, options = {}) {
  const preservePersisted = Boolean(options.preservePersisted)
  parsing.value = true
  try {
    warmupRecentHistoryInBackground()
    if (!preservePersisted) resetPersistedTransaction()

    const result = parseAutoBookkeepingText(text, buildAiParseContext())
    if (!result?.draft) {
      const warnings = resolveAiParserWarnings(result)
      pushAssistantText(warnings[0] || '我還沒有抓到可儲存的交易資訊，你可以再換個說法。')
      return
    }

    applyDraft(result.draft)
    draftState.sourceText = text
    draftState.warnings = resolveAiParserWarnings(result)
    draftState.categoryHint = !model.categoryId ? extractCategoryHint(text) : ''
    draftState.categoryCandidates = buildCategoryCandidates(draftState.categoryHint, model.type)
    draftState.recentIntent = 'create'
    refreshDraftState()
  } catch (error) {
    pushAssistantText(error?.message || 'AI 解析失敗，請稍後再試。')
  } finally {
    parsing.value = false
  }
}

async function handleDraftFollowUp(text) {
  if (pendingInputMode.value !== 'default') {
    const handled = await applyFocusedInput(text)
    if (handled) return
  }

  if (applyQuickDraftPatchFromText(text)) {
    refreshDraftState('已更新這筆草稿。')
    return
  }

  const combinedText = `${draftState.sourceText} ${text}`.trim()
  await handleBookkeepingInput(combinedText, { preservePersisted: true })
}

function applyQuickDraftPatchFromText(text) {
  if (!hasDraft.value) return false

  const noteMatched = text.match(/^(?:備註|加註)[:：]?\s*(.+)$/)
  if (noteMatched) {
    model.note = noteMatched[1].trim()
    pendingInputMode.value = 'default'
    return true
  }

  if (hasMissingField('amount')) {
    const value = parseAmountInput(text)
    if (value > 0) {
      model.amountMajor = value
      pendingInputMode.value = 'default'
      return true
    }
  }

  if (hasMissingField('account')) {
    const account = findAccountByText(text, { allowPeer: false })
    if (account) {
      model.accountId = account.id
      pendingInputMode.value = 'default'
      return true
    }
  }

  if (hasMissingField('target_account')) {
    const account = findAccountByText(text, { allowPeer: true, excludeId: model.accountId })
    if (account) {
      model.peerAccountId = account.id
      pendingInputMode.value = 'default'
      return true
    }
  }

  if (hasMissingField('category')) {
    const category = findCategoryByText(text, model.type)
    if (category) {
      model.categoryId = category.id
      pendingInputMode.value = 'default'
      return true
    }
  }

  if (hasMissingField('person') && latestLoanIntent.value) {
    latestLoanIntent.value = {
      ...latestLoanIntent.value,
      counterpartyName: text.trim(),
    }
    pendingInputMode.value = 'default'
    return true
  }

  return false
}

async function applyFocusedInput(text) {
  const value = String(text ?? '').trim()
  if (!value) return false

  if (pendingInputMode.value === 'amount') {
    const amountMajor = parseAmountInput(value)
    if (amountMajor <= 0) {
      pushAssistantText('我需要有效金額，例如 50 或 120+35。')
      return true
    }
    model.amountMajor = amountMajor
    pendingInputMode.value = 'default'
    refreshDraftState('已補上金額。')
    return true
  }

  if (pendingInputMode.value === 'account') {
    const account = findAccountByText(value, { allowPeer: false })
    if (!account) {
      pushAssistantText('找不到這個帳戶，請直接點下方帳戶晶片，或先輸入「新增帳戶：名稱」。')
      return true
    }
    model.accountId = account.id
    pendingInputMode.value = 'default'
    refreshDraftState('已補上帳戶。')
    return true
  }

  if (pendingInputMode.value === 'target_account') {
    const account = findAccountByText(value, { allowPeer: true, excludeId: model.accountId })
    if (!account) {
      pushAssistantText('找不到這個轉入帳戶，請再選一次。')
      return true
    }
    model.peerAccountId = account.id
    pendingInputMode.value = 'default'
    refreshDraftState('已補上轉入帳戶。')
    return true
  }

  if (pendingInputMode.value === 'category') {
    const category = findCategoryByText(value, model.type)
    if (category) {
      model.categoryId = category.id
      pendingInputMode.value = 'default'
      refreshDraftState('已套用分類。')
      return true
    }
    draftState.categoryHint = value
    draftState.categoryCandidates = buildCategoryCandidates(value, model.type)
    pushAssistantText(`找不到「${value}」這個分類，你可以改用候選分類，或直接建立新分類。`)
    emitDraftCard()
    return true
  }

  if (pendingInputMode.value === 'note') {
    model.note = value
    pendingInputMode.value = 'default'
    refreshDraftState('已補上備註。')
    return true
  }

  if (pendingInputMode.value === 'person' && latestLoanIntent.value) {
    latestLoanIntent.value = {
      ...latestLoanIntent.value,
      counterpartyName: value,
    }
    pendingInputMode.value = 'default'
    refreshDraftState('已補上對象。')
    return true
  }

  return false
}

function applyDraft(draft) {
  const date = new Date(draft.occurredAt || new Date().toISOString())
  model.type = draft.type
  model.amountMajor = Math.abs(Number(draft.amountMinor ?? 0)) / 100
  model.occurredDate = toDateInput(date)
  model.occurredHour = date.getHours()
  model.occurredMinute = date.getMinutes()
  model.accountId = draft.accountId ?? ''
  model.peerAccountId = draft.peerAccountId ?? ''
  model.categoryId = draft.categoryId ?? ''
  model.note = draft.note ?? ''
  model.isReimbursable = Boolean(draft.isReimbursable)
  model.includeInBudget = draft.includeInBudget !== false
  model.includeInAnalysis = draft.includeInAnalysis !== false
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
  model.addonItems = Array.isArray(draft.addonItems) ? draft.addonItems.map(cloneAddonItem) : []
  latestLoanIntent.value = draft.loanIntent
}

function refreshDraftState(prefixText = '') {
  draftState.missingFields = buildMissingFields()
  draftState.categoryCandidates = buildCategoryCandidates(draftState.categoryHint, model.type)
  if (draftState.missingFields.length) {
    pendingInputMode.value = draftState.missingFields[0].key
    const intro = prefixText || buildMissingIntroText()
    pushAssistantText(intro)
  } else {
    pendingInputMode.value = 'default'
    pushAssistantText(prefixText || buildConfirmIntroText())
  }
  emitDraftCard()
}

function emitDraftCard() {
  pushMessage({
    role: 'assistant',
    kind: 'draft',
    payload: buildDraftCardPayload(),
  })
}

function buildDraftCardPayload() {
  const amountMinor = Number(model.amountMajor) > 0 ? Math.round(Math.abs(Number(model.amountMajor)) * 100) : null
  const category = categoryListByType(model.type).find((item) => item.id === model.categoryId)
  const account = accountStore.accounts.find((item) => item.id === model.accountId)
  const peerAccount = accountStore.accounts.find((item) => item.id === model.peerAccountId)
  const status = draftState.missingFields.length ? 'missing_fields' : 'confirm'

  return {
    title: status === 'confirm' ? '我已整理好這筆記錄' : '我幫你先整理成這樣',
    status,
    summaryLabel: latestLoanIntent.value ? `${resolveLoanActionLabel(latestLoanIntent.value)}` : typeLabel(model.type),
    amountMinor,
    amountTone: model.type === 'income' ? 'income' : model.type === 'expense' ? 'expense' : '',
    accountLabel: account?.name || '未選擇',
    peerAccountLabel: model.type === 'transfer' ? (peerAccount?.name || '未選擇') : '',
    categoryLabel: latestLoanIntent.value
      ? resolveLoanActionLabel(latestLoanIntent.value)
      : category?.name || (draftState.categoryHint ? `待確認（${draftState.categoryHint}）` : '未選擇'),
    timeLabel: formatDateTimeLabel(toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)),
    note: model.note,
    warnings: draftState.warnings,
    missingFields: draftState.missingFields,
    optionalFields: [
      { key: 'note', label: '備註' },
      { key: 'amount', label: '改金額' },
      { key: 'account', label: model.type === 'transfer' ? '改轉出帳戶' : '改帳戶' },
    ],
    categoryCandidates: draftState.categoryCandidates,
    categoryHint: draftState.categoryHint,
    accountCandidates: buildAccountCandidates(),
    accountFieldKey: hasMissingField('target_account') ? 'target_account' : 'account',
  }
}

function buildMissingIntroText() {
  const missingCount = draftState.missingFields.length
  if (draftState.categoryHint && hasMissingField('category')) {
    return `找不到「${draftState.categoryHint}」這個分類，我先整理成草稿，還差 ${missingCount} 個欄位。`
  }
  if (latestLoanIntent.value) {
    return `我幫你辨識成一筆${resolveLoanActionLabel(latestLoanIntent.value)}，還差 ${missingCount} 個欄位就能儲存。`
  }
  return `我幫你辨識成一筆${typeLabel(model.type)}，但資料還不完整，還差 ${missingCount} 個欄位。`
}

function buildConfirmIntroText() {
  if (latestLoanIntent.value) {
    return `已辨識為${resolveLoanActionLabel(latestLoanIntent.value)}，是否儲存？`
  }
  const category = categoryListByType(model.type).find((item) => item.id === model.categoryId)
  const account = accountStore.accounts.find((item) => item.id === model.accountId)
  const amount = Number(model.amountMajor)
  if (model.type === 'transfer') {
    const toAccount = accountStore.accounts.find((item) => item.id === model.peerAccountId)
    return `已辨識為轉帳：${amount || 0} 元，從 ${account?.name || '未選擇'} 到 ${toAccount?.name || '未選擇'}。是否儲存？`
  }
  return `已辨識為${typeLabel(model.type)}：${category?.name || '未分類'} ${amount || 0} 元，帳戶為 ${account?.name || '未選擇'}。是否儲存？`
}

function buildMissingFields() {
  const fields = []
  if (!(Number(model.amountMajor) > 0)) {
    fields.push({ key: 'amount', label: '金額', priority: 'P1', hint: '輸入數字或點常用金額' })
  }
  if (!model.accountId) {
    fields.push({ key: 'account', label: model.type === 'transfer' ? '轉出帳戶' : '帳戶', priority: 'P2', hint: '選擇常用帳戶' })
  }
  if (model.type === 'transfer') {
    if (!model.peerAccountId || model.peerAccountId === model.accountId) {
      fields.push({ key: 'target_account', label: '轉入帳戶', priority: 'P2', hint: '選擇不同帳戶' })
    }
    return fields
  }
  if (latestLoanIntent.value) {
    if (!resolveLoanCounterpartyName(latestLoanIntent.value)) {
      fields.push({ key: 'person', label: '對象', priority: 'P2', hint: '補上借貸對象姓名' })
    }
    return fields
  }
  if (!model.categoryId) {
    fields.push({ key: 'category', label: '分類', priority: 'P0', hint: '選既有分類或新增分類' })
  }
  return fields
}

function hasMissingField(key) {
  return draftState.missingFields.some((item) => item.key === key)
}

function buildAccountCandidates() {
  if (hasMissingField('target_account')) {
    return accountStore.accounts.filter((item) => item.id !== model.accountId).slice(0, 6)
  }
  if (hasMissingField('account')) {
    return (model.type === 'transfer' ? accountStore.accounts : accountStore.regularAccounts).slice(0, 6)
  }
  return []
}

function beginFillField(fieldKey) {
  if (!hasDraft.value) return
  pendingInputMode.value = fieldKey
  if (fieldKey === 'category') {
    const hint = draftState.categoryHint || '這筆支出'
    pushAssistantText(`請選擇分類；如果沒有合適的，也可以直接建立新分類。${hint ? `目前辨識詞：${hint}` : ''}`)
    emitDraftCard()
    return
  }
  if (fieldKey === 'note') {
    pushAssistantText('請輸入備註內容，我會直接加到這筆記錄。')
    return
  }
  if (fieldKey === 'amount') {
    pushAssistantText('請補上金額。你可以直接輸入數字，或點下方常用金額。')
    return
  }
  if (fieldKey === 'account') {
    pushAssistantText('請選擇付款帳戶。')
    return
  }
  if (fieldKey === 'target_account') {
    pushAssistantText('請選擇轉入帳戶。')
    return
  }
  if (fieldKey === 'person') {
    pushAssistantText('請補上對象姓名，例如：小明。')
  }
}

function focusFirstMissingField() {
  const first = draftState.missingFields[0]
  if (!first) return
  beginFillField(first.key)
}

function onQuickChipClick(chip) {
  if (chip.action === 'query') {
    runQuickQuery(chip.value)
    return
  }
  if (chip.action === 'amount') {
    model.amountMajor = Number(chip.value)
    pendingInputMode.value = 'default'
    refreshDraftState('已補上金額。')
    return
  }
  if (chip.action === 'account') {
    selectAccount(chip.value, 'account')
    return
  }
  if (chip.action === 'target_account') {
    selectAccount(chip.value, 'target_account')
    return
  }
  if (chip.action === 'category') {
    selectCategory(chip.value)
    return
  }
  if (chip.action === 'create_category') {
    void createCategoryFromHint(chip.value)
    return
  }
  if (chip.action === 'note') {
    model.note = String(chip.value)
    pendingInputMode.value = 'default'
    refreshDraftState('已補上備註。')
  }
}

function runQuickQuery(text) {
  composerText.value = text
  void submitComposer()
}

function selectAccount(accountId, fieldKey = 'account') {
  if (fieldKey === 'target_account') {
    model.peerAccountId = accountId
    pendingInputMode.value = 'default'
    refreshDraftState('已補上轉入帳戶。')
    return
  }
  model.accountId = accountId
  pendingInputMode.value = 'default'
  refreshDraftState('已補上帳戶。')
}

function selectCategory(categoryId) {
  model.categoryId = categoryId
  draftState.categoryHint = ''
  draftState.categoryCandidates = []
  pendingInputMode.value = 'default'
  refreshDraftState('已套用分類。')
}

async function createCategoryFromHint(rawName) {
  const name = String(rawName ?? '').trim()
  if (!name) {
    pushAssistantText('請先輸入要建立的分類名稱。')
    return
  }

  try {
    const kind = model.type === 'income' ? 'income' : 'expense'
    const group = await ensureCategoryGroup(kind)
    const sortOrder = categoryStore.categories.filter((item) => item.group_id === group.id).length
    await categoryStore.addCategory({
      groupId: group.id,
      name,
      kind,
      sortOrder,
      isBudgetable: 1,
    })
    const created = categoryStore.categories.find((item) => item.name === name && item.group_id === group.id)
    if (created) {
      model.categoryId = created.id
    }
    draftState.categoryHint = ''
    draftState.categoryCandidates = []
    pendingInputMode.value = 'default'
    refreshDraftState(`已新增分類「${name}」並套用到這筆草稿。`)
  } catch (error) {
    pushAssistantText(error?.message || '新增分類失敗。')
  }
}

async function ensureCategoryGroup(kind) {
  let group = categoryStore.groups.find((item) => item.kind === kind || item.kind === 'both')
  if (group) return group

  await categoryStore.addGroup({
    name: kind === 'income' ? '收入' : '支出',
    kind,
    sortOrder: categoryStore.groups.length,
  })
  group = categoryStore.groups.find((item) => item.kind === kind || item.kind === 'both')
  if (!group) throw new Error('找不到可用分類群組')
  return group
}

async function handleAddCategoryCommand(text) {
  const rawName = text.replace(/^.*?(新增|建立)\s*分類[:：]?\s*/u, '').trim()
  if (!rawName) {
    pushAssistantText('請直接輸入「新增分類：宵夜」。')
    return
  }
  await createCategoryFromHint(rawName)
}

async function handleAddAccountCommand(text) {
  const name = text.replace(/^.*?(新增|建立)\s*(帳戶|帐户|account)[:：]?\s*/iu, '').trim()
  if (!name) {
    pushAssistantText('請直接輸入「新增帳戶：台灣Pay」或「新增帳戶：零用錢」。')
    return
  }

  try {
    let group = accountStore.groups[0]
    if (!group) {
      await accountStore.addGroup({
        name: '資產帳戶',
        type: 'asset',
      })
      group = accountStore.groups[0]
    }
    if (!group) throw new Error('找不到可用帳戶群組')

    await accountStore.addAccount({
      groupId: group.id,
      name,
      accountType: 'asset',
      allowNegative: false,
      openingBalanceMinor: 0,
    })

    const created = accountStore.accounts.find((item) => item.name === name)
    if (created && hasDraft.value && !model.accountId) {
      model.accountId = created.id
      refreshDraftState(`已新增帳戶「${name}」並套用到草稿。`)
      return
    }

    pushAssistantText(`已新增帳戶「${name}」。`)
  } catch (error) {
    pushAssistantText(error?.message || '新增帳戶失敗。')
  }
}

async function handleRecentRecordsRequest(text, intent) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    pushAssistantText('目前沒有可用帳本。')
    return
  }

  parsing.value = true
  try {
    const range = intent.range || detectRange(text)
    const limit = range.kind === 'recent_days' ? 24 : 8
    const records = await listRecentTransactions(ledgerId, limit)
    const nameMap = new Map(accountStore.accounts.map((item) => [item.id, item.name]))
    const filtered = records
      .filter((record) => matchesRange(record.occurred_at, range))
      .map((record) => ({
        ...record,
        account_name: nameMap.get(record.account_id) ?? '',
      }))
      .slice(0, 8)

    if (!filtered.length) {
      pushAssistantText('這個範圍內還沒有紀錄。')
      return
    }

    pushAssistantText(`這是${range.label}的最近紀錄。`)
    pushMessage({
      role: 'assistant',
      kind: 'records',
      payload: {
        title: range.label ? `${range.label}明細` : '最近紀錄',
        records: filtered,
      },
    })
  } catch (error) {
    pushAssistantText(error?.message || '載入最近紀錄失敗。')
  } finally {
    parsing.value = false
  }
}

async function handleAnalysisRequest(text, intent) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    pushAssistantText('目前沒有可用帳本。')
    return
  }

  parsing.value = true
  try {
    const range = intent.range || detectRange(text)
    const transactions = await loadTransactionsForRange(ledgerId, range)
    const analysisTx = transactions.filter((tx) => Number(tx?.include_in_analysis ?? 1) !== 0 && tx.type !== 'transfer')
    const filtered = filterTransactionsByText(analysisTx, text)
    if (!filtered.length) {
      pushAssistantText(`這個範圍內沒有符合條件的收支資料。`)
      return
    }

    const summary = buildSummary(filtered)
    const chartType = resolveAnalysisChartType(text, intent)
    const rows = buildChartRows(filtered, {
      chartType,
      scope: intent.scope,
      focusType: intent.focusType,
      range,
    })
    const compareText = await buildCompareText(ledgerId, filtered, range, intent.focusType)
    const insight = buildAnalysisInsight(rows, intent.focusType, range)

    pushAssistantText(`這是你${range.label}的收支分析。`)
    pushMessage({
      role: 'assistant',
      kind: 'analysis',
      payload: {
        title: buildAnalysisTitle(intent, range),
        queryText: text,
        rangeLabel: range.label,
        chartType,
        chartSubtitle: intent.scope === 'account' ? '帳戶分布' : '分類分布',
        summary: {
          ...summary,
          chartTotalMinor: resolveChartTotal(rows),
        },
        rows,
        pieStyle: buildPieStyle(rows),
        insight,
        compareText,
        actions: buildAnalysisActions(text, range),
      },
    })
  } catch (error) {
    pushAssistantText(error?.message || '分析失敗，請稍後再試。')
  } finally {
    parsing.value = false
  }
}

function buildAnalysisTitle(intent, range) {
  if (intent.chartType === 'pie') return `${range.label}支出圓餅圖`
  if (intent.chartType === 'bar') return `${range.label}比較`
  if (intent.chartType === 'trend') return `${range.label}趨勢`
  return `${range.label}收支分析`
}

function buildAnalysisActions(text, range) {
  return [
    { id: 'detail', label: '查看明細', query: range.kind === 'today' ? '列出今天的收入支出' : '列出最近紀錄' },
    { id: 'month', label: '切換本月', query: '幫我分析本月收支' },
    { id: 'pie', label: '改看圓餅圖', query: `${text.replace(/長條圖|趨勢圖/g, '').trim()} 圓餅圖` },
    { id: 'bar', label: '改看長條圖', query: `${text.replace(/圓餅圖|趨勢圖/g, '').trim()} 長條圖` },
  ]
}

function resolveAnalysisChartType(text, intent) {
  if (intent.chartType) return intent.chartType
  if (/(每天|每日|走勢|趨勢)/.test(text)) return 'trend'
  if (/(排行|比較)/.test(text)) return 'bar'
  return 'pie'
}

function filterTransactionsByText(transactions, text) {
  let items = [...transactions]
  const account = findAccountByText(text, { allowPeer: true })
  const category = findCategoryByText(text, 'expense') || findCategoryByText(text, 'income')
  const noteMatch = extractLooseKeyword(text)

  if (account) {
    items = items.filter((tx) => tx.account_id === account.id || tx.peer_account_id === account.id)
  }
  if (category) {
    items = items.filter((tx) => tx.category_id === category.id)
  }
  if (noteMatch) {
    const keyword = compactText(noteMatch)
    items = items.filter((tx) => compactText(tx.note).includes(keyword))
  }
  return items
}

function extractLooseKeyword(text) {
  const matched = text.match(/(?:對象|標籤|tag|person)[:：]?\s*([^\s]+)/i)
  return matched?.[1] ?? ''
}

async function loadTransactionsForRange(ledgerId, range) {
  if (range.kind === 'today') {
    return listTransactionsByDay(ledgerId, toDateInput(new Date()))
  }
  if (range.kind === 'month') {
    return listTransactionsByMonth(ledgerId, monthKeyFromDate(new Date()))
  }
  if (range.kind === 'custom' || range.kind === 'week' || range.kind === 'recent_days') {
    const all = await listAllTransactions(ledgerId)
    return all.filter((tx) => matchesRange(tx.occurred_at, range))
  }
  return listTransactionsByMonth(ledgerId, monthKeyFromDate(new Date()))
}

function matchesRange(occurredAt, range) {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) return false
  if (range.kind === 'today') {
    return isSameLocalDay(date, new Date())
  }
  if (range.kind === 'month') {
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  if (range.kind === 'week') {
    const start = startOfWeek(new Date())
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return date >= start && date < end
  }
  if (range.kind === 'recent_days') {
    const days = Math.max(1, Number(range.days) || 1)
    const start = startOfDay(new Date())
    start.setDate(start.getDate() - (days - 1))
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    return date >= start && date <= end
  }
  if (range.kind === 'custom') {
    const start = startOfDay(range.start)
    const end = endOfDay(range.end)
    return date >= start && date <= end
  }
  return true
}

function buildSummary(transactions) {
  let incomeMinor = 0
  let expenseMinor = 0
  for (const tx of transactions) {
    if (tx.type === 'income') incomeMinor += Math.abs(Number(tx.amount_minor ?? 0))
    if (tx.type === 'expense') expenseMinor += Math.abs(Number(tx.amount_minor ?? 0))
  }
  return {
    incomeMinor,
    expenseMinor,
    balanceMinor: incomeMinor - expenseMinor,
  }
}

function buildChartRows(transactions, options) {
  const chartType = options.chartType || 'pie'
  if (chartType === 'trend') {
    return buildTimeRows(transactions, options.focusType)
  }
  if (options.scope === 'account') {
    return buildBreakdownRows(transactions, 'account', options.focusType)
  }
  return buildBreakdownRows(transactions, 'category', options.focusType)
}

function buildBreakdownRows(transactions, scope, focusType) {
  const type = focusType === 'income' ? 'income' : 'expense'
  const accountNameMap = new Map(accountStore.accounts.map((item) => [item.id, item.name]))
  const categoryNameMap = new Map(categoryStore.categories.map((item) => [item.id, item.name]))
  const map = new Map()

  for (const tx of transactions) {
    if (tx.type !== type) continue
    const key = scope === 'account'
      ? String(tx.account_id || tx.peer_account_id || '__none__')
      : String(tx.category_id || '__none__')
    const label = scope === 'account'
      ? accountNameMap.get(key) || '未指定帳戶'
      : categoryNameMap.get(key) || '未分類'
    const amountMinor = Math.abs(Number(tx.amount_minor ?? 0))
    const current = map.get(key) || { id: key, label, amountMinor: 0, count: 0 }
    current.amountMinor += amountMinor
    current.count += 1
    map.set(key, current)
  }

  const rows = Array.from(map.values()).sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 6)
  const totalMinor = rows.reduce((total, item) => total + item.amountMinor, 0)
  const maxMinor = Math.max(...rows.map((item) => item.amountMinor), 0)

  return rows.map((row, index) => ({
    ...row,
    color: CHART_COLORS[index % CHART_COLORS.length],
    percent: totalMinor > 0 ? Math.round((row.amountMinor / totalMinor) * 100) : 0,
    barPercent: maxMinor > 0 ? Math.max(12, Math.round((row.amountMinor / maxMinor) * 100)) : 0,
  }))
}

function buildTimeRows(transactions, focusType) {
  const targetType = focusType === 'income' ? 'income' : 'expense'
  const map = new Map()
  for (const tx of transactions) {
    if (tx.type !== targetType) continue
    const date = toDateInput(new Date(tx.occurred_at))
    const current = map.get(date) || { id: date, label: date.slice(5), amountMinor: 0, count: 0 }
    current.amountMinor += Math.abs(Number(tx.amount_minor ?? 0))
    current.count += 1
    map.set(date, current)
  }

  const rows = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id)).slice(-7)
  const maxMinor = Math.max(...rows.map((item) => item.amountMinor), 0)
  return rows.map((row, index) => ({
    ...row,
    color: CHART_COLORS[index % CHART_COLORS.length],
    percent: 0,
    barPercent: maxMinor > 0 ? Math.max(12, Math.round((row.amountMinor / maxMinor) * 100)) : 0,
  }))
}

function resolveChartTotal(rows) {
  return rows.reduce((total, row) => total + Number(row.amountMinor ?? 0), 0)
}

function buildPieStyle(rows) {
  if (!rows.length) return 'conic-gradient(#6CA8FF 0 100%)'
  let start = 0
  const segments = rows.map((row) => {
    const end = start + row.percent
    const segment = `${row.color} ${start}% ${end}%`
    start = end
    return segment
  })
  if (start < 100) {
    segments.push(`color-mix(in srgb, var(--card) 72%, black) ${start}% 100%`)
  }
  return `conic-gradient(${segments.join(', ')})`
}

function buildAnalysisInsight(rows, focusType, range) {
  if (!rows.length) return `${range.label}暫時沒有可分析資料。`
  const top = rows[0]
  const label = focusType === 'income' ? '收入' : '支出'
  return `${range.label}${label}最高的是「${top.label}」，共 ${top.percent}% 。`
}

async function buildCompareText(ledgerId, currentTransactions, range, focusType) {
  if (range.kind !== 'month') return ''
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevRows = await listTransactionsByMonth(ledgerId, monthKeyFromDate(prev))
  const type = focusType === 'income' ? 'income' : 'expense'
  const currentMinor = currentTransactions
    .filter((item) => item.type === type)
    .reduce((total, item) => total + Math.abs(Number(item.amount_minor ?? 0)), 0)
  const prevMinor = prevRows
    .filter((item) => item.type === type && Number(item?.include_in_analysis ?? 1) !== 0)
    .reduce((total, item) => total + Math.abs(Number(item.amount_minor ?? 0)), 0)
  if (prevMinor <= 0) return '上月沒有可比較資料。'
  const diff = currentMinor - prevMinor
  const direction = diff === 0 ? '持平' : diff > 0 ? '增加' : '減少'
  const absDiff = Math.abs(diff)
  return `與上月相比${direction} ${formatMinor(absDiff)}。`
}

function rerunAnalysisWithChart(text, chartType) {
  const normalized = String(text ?? '').replace(/圓餅圖|長條圖|趨勢圖/g, '').trim()
  runQuickQuery(`${normalized} ${chartType === 'pie' ? '圓餅圖' : chartType === 'bar' ? '長條圖' : '趨勢圖'}`)
}

function buildAiParseContext() {
  return {
    accounts: aiParserAccounts.value,
    expenseCategories: categoryStore.expenseCategories,
    incomeCategories: categoryStore.incomeCategories,
    historyTransactions: transactionStore.recent,
    autoFillRules: autoFillRules.value,
    now: new Date(),
  }
}

function resolveAiParserWarnings(result) {
  const warningKeys = Array.isArray(result?.warningKeys) ? result.warningKeys : []
  if (warningKeys.length) {
    return warningKeys.map((key) => getAiBookkeepingWarningFallback(key))
  }
  return (result?.warnings ?? []).map((warning) => String(warning ?? '').trim()).filter(Boolean)
}

function cloneAddonItem(item) {
  return {
    label: String(item?.label ?? '').trim(),
    deltaMajor: Number(item?.deltaMajor ?? 0),
    direction: item?.direction === 'plus' ? 'plus' : 'minus',
  }
}

async function saveDraft() {
  const wasEditing = Boolean(persistedTransactionId.value)
  const loanActionLabel = latestLoanIntent.value ? resolveLoanActionLabel(latestLoanIntent.value) : ''
  const created = await submitCurrentDraft()
  if (!created) return

  const successText = loanActionLabel
    ? `已完成${loanActionLabel}。`
    : wasEditing
      ? '已儲存修改。'
      : '這筆記錄已儲存。'

  pushAssistantText(successText)
  clearDraftState()
}

async function submitCurrentDraft() {
  if (parsing.value || submitting.value) return false
  const fail = (message) => {
    pushAssistantText(message || '儲存失敗。')
    return false
  }

  draftState.missingFields = buildMissingFields()
  if (draftState.missingFields.length) {
    pendingInputMode.value = draftState.missingFields[0].key
    emitDraftCard()
    return fail('這筆草稿還沒補齊，先把缺的欄位填完。')
  }

  const baseAmountMinor = Math.round(Math.abs(Number(model.amountMajor ?? 0)) * 100)
  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  if (baseAmountMinor <= 0) return fail('請輸入有效金額。')
  if (!occurredAt) return fail('請選擇有效時間。')
  if (!model.accountId) return fail('請選擇帳戶。')

  const usage = getAiBookkeepingDailyUsage()
  if (Number.isFinite(usage.limit) && usage.used >= usage.limit) {
    return fail('免費版 AI 記帳每日最多 5 次，可改用手動新增。')
  }

  submitting.value = true
  try {
    if (latestLoanIntent.value) {
      const noteText = mergeAddonItemsToNote(String(model.note ?? '').trim(), model.addonItems)

      if (latestLoanIntent.value.mode === 'create') {
        const counterpartyName = resolveLoanCounterpartyName(latestLoanIntent.value)
        if (!counterpartyName) return fail('請補上借貸對象。')
        await withTimeout(
          loanStore.create({
            direction: latestLoanIntent.value.direction === 'borrow' ? 'borrow' : 'lend',
            counterpartyName,
            principalMinor: baseAmountMinor,
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
        await withTimeout(loanStore.load(), AI_SUBMIT_TIMEOUT_MS, 'AI 記帳逾時，請稍後再試')
        const matched = pickLoanForAiRepayment(loanStore.items, latestLoanIntent.value)
        if (!matched.loan) return fail(matched.warning || '找不到可操作的借貸紀錄')
        await withTimeout(
          loanStore.repay({
            loanId: matched.loan.id,
            accountId: model.accountId,
            amountMinor: baseAmountMinor,
            note: noteText,
            paidAt: resolveLoanOccurredAtIso(occurredAt),
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
      }

      await withTimeout(refreshLinkedDataAfterLoanWrite(), AI_SUBMIT_TIMEOUT_MS, 'AI 記帳逾時，請稍後再試')
      recordAiBookkeepingUsage()
      return true
    }

    const noteText = mergeAddonItemsToNote(String(model.note ?? '').trim(), model.addonItems)
    if (model.type === 'transfer') {
      if (!model.peerAccountId || model.accountId === model.peerAccountId) {
        return fail('請選擇不同的轉出與轉入帳戶。')
      }
      const transferRate = await resolveTransferRateOrThrow()
      const toAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(baseAmountMinor, transferRate)
        : baseAmountMinor

      if (persistedTransactionId.value) {
        await withTimeout(
          transactionStore.updateTransaction(persistedTransactionId.value, {
            type: 'transfer',
            amountMinor: baseAmountMinor,
            toAmountMinor,
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
      } else {
        const transferResult = await withTimeout(
          transactionStore.addTransfer({
            amountMinor: baseAmountMinor,
            toAmountMinor,
            sourceExtraMinor: 0,
            occurredAt,
            fromAccountId: model.accountId,
            toAccountId: model.peerAccountId,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        )
        persistedTransactionId.value = String(transferResult?.outTxId ?? transferResult?.inTxId ?? '').trim()
      }
      persistedTransactionType.value = 'transfer'
    } else if (model.type === 'income') {
      if (!model.categoryId) return fail('請先選擇分類。')
      if (persistedTransactionId.value) {
        await withTimeout(
          transactionStore.updateTransaction(persistedTransactionId.value, {
            type: 'income',
            amountMinor: baseAmountMinor,
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
      } else {
        persistedTransactionId.value = String(await withTimeout(
          transactionStore.addIncome({
            amountMinor: baseAmountMinor,
            occurredAt,
            accountId: model.accountId,
            categoryId: model.categoryId,
            includeInBudget: model.includeInBudget,
            includeInAnalysis: model.includeInAnalysis,
            note: noteText,
          }),
          AI_SUBMIT_TIMEOUT_MS,
          'AI 記帳逾時，請稍後再試',
        ) ?? '')
      }
      persistedTransactionType.value = 'income'
    } else {
      if (!model.categoryId) return fail('請先選擇分類。')
      if (persistedTransactionId.value) {
        await withTimeout(
          transactionStore.updateTransaction(persistedTransactionId.value, {
            type: 'expense',
            amountMinor: baseAmountMinor,
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
      } else {
        persistedTransactionId.value = String(await withTimeout(
          transactionStore.addExpense({
            amountMinor: baseAmountMinor,
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
        ) ?? '')
      }
      persistedTransactionType.value = 'expense'
    }

    recordAiBookkeepingUsage()
    await transactionStore.refreshAfterWriteSafe()
    return true
  } catch (error) {
    return fail(error?.message || '儲存交易失敗')
  } finally {
    submitting.value = false
  }
}

function cancelDraft() {
  clearDraftState()
  pushAssistantText('已清除目前草稿。你可以直接開始新的一筆。')
}

function clearDraftState() {
  Object.assign(model, createEmptyModel())
  draftState.sourceText = ''
  draftState.warnings = []
  draftState.missingFields = []
  draftState.categoryHint = ''
  draftState.categoryCandidates = []
  draftState.recentIntent = 'idle'
  latestLoanIntent.value = null
  pendingInputMode.value = 'default'
  resetPersistedTransaction()
}

function resetPersistedTransaction() {
  persistedTransactionId.value = ''
  persistedTransactionType.value = ''
}

async function promptDeleteRecord(record) {
  pushAssistantText('這筆紀錄要刪除嗎？')
  pushMessage({
    role: 'assistant',
    kind: 'delete-confirm',
    payload: {
      recordId: record.id,
      title: `${typeLabel(record.type)} ${formatMinor(Math.abs(Number(record.amount_minor ?? 0)))}`,
      description: `${record.category_name || record.note || '未分類'} / ${record.account_name || '未指定帳戶'} / ${formatDateTimeLabel(record.occurred_at)}`,
    },
  })
}

async function confirmDeleteRecord(recordId) {
  if (!recordId) return
  try {
    await transactionStore.deleteTransaction(recordId)
    if (persistedTransactionId.value === recordId) {
      clearDraftState()
    }
    pushAssistantText('這筆紀錄已刪除。')
  } catch (error) {
    pushAssistantText(error?.message || '刪除失敗。')
  }
}

function loadRecordForEditing(record) {
  const date = new Date(record.occurred_at)
  model.type = record.type
  model.amountMajor = Math.abs(Number(record.amount_minor ?? 0)) / 100
  model.occurredDate = toDateInput(date)
  model.occurredHour = date.getHours()
  model.occurredMinute = date.getMinutes()
  model.accountId = record.account_id ?? ''
  model.peerAccountId = record.peer_account_id ?? ''
  model.categoryId = record.category_id ?? ''
  model.note = record.note ?? ''
  model.isReimbursable = Boolean(record.is_reimbursable)
  model.includeInBudget = Number(record.include_in_budget ?? 1) !== 0
  model.includeInAnalysis = Number(record.include_in_analysis ?? 1) !== 0
  model.exchangeRateMode = 'system'
  model.manualExchangeRateInput = ''
  model.addonItems = []

  persistedTransactionId.value = String(record.id ?? '').trim()
  persistedTransactionType.value = String(record.type ?? '').trim()
  latestLoanIntent.value = null
  draftState.sourceText = record.note || record.category_name || typeLabel(record.type)
  draftState.warnings = []
  draftState.categoryHint = ''
  draftState.categoryCandidates = []
  draftState.recentIntent = 'edit'
  refreshDraftState('已帶入這筆紀錄，你可以直接修改後儲存。')
}

function buildCategoryCandidates(rawHint, type) {
  const hint = compactText(rawHint)
  if (!hint) return []
  return categoryListByType(type)
    .filter((item) => {
      const name = compactText(item.name)
      return name.includes(hint) || hint.includes(name)
    })
    .slice(0, 6)
}

function categoryListByType(type) {
  return type === 'income' ? categoryStore.incomeCategories : categoryStore.expenseCategories
}

function findCategoryByText(text, type) {
  const target = compactText(text)
  if (!target) return null
  return categoryListByType(type).find((item) => {
    const name = compactText(item.name)
    return name === target || name.includes(target) || target.includes(name)
  }) ?? null
}

function findAccountByText(text, options = {}) {
  const target = compactText(text)
  if (!target) return null
  const excludeId = String(options.excludeId ?? '')
  const list = options.allowPeer ? accountStore.accounts : accountStore.regularAccounts
  return list.find((item) => {
    if (excludeId && item.id === excludeId) return false
    const name = compactText(item.name)
    return name === target || name.includes(target) || target.includes(name)
  }) ?? null
}

function extractCategoryHint(text) {
  let cleaned = String(text ?? '')
  for (const account of accountStore.accounts) {
    if (account?.name) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(account.name), 'ig'), ' ')
    }
  }
  cleaned = cleaned
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/今天|今日|昨天|本月|本週|這週|收入|支出|轉帳|從|到|現金|元|塊|幫我|分析|顯示|列出|最近/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.split(' ')[0] || ''
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

function parseAmountInput(value) {
  return evaluateExpression(value) ?? parseLooseNumber(value) ?? 0
}

function evaluateExpression(input) {
  const source = String(input ?? '').trim()
  if (!source) return null
  if (!/^[0-9+\-×÷*/.\s]+$/.test(source)) return null
  const normalized = source.replaceAll('×', '*').replaceAll('÷', '/').replace(/\s+/g, '')
  const tokens = normalized.match(/(\d+(?:\.\d+)?)|[+\-*/]/g)
  if (!tokens?.length) return null

  const nums = []
  const ops = []
  let expectingNumber = true
  for (const token of tokens) {
    if (['+', '-', '*', '/'].includes(token)) {
      if (expectingNumber) {
        if (token === '-' && nums.length === 0) {
          nums.push(0)
        } else {
          return null
        }
      }
      while (ops.length && precedence(ops.at(-1)) >= precedence(token)) {
        if (!applyOperator(nums, ops.pop())) return null
      }
      ops.push(token)
      expectingNumber = true
      continue
    }
    const num = Number(token)
    if (!Number.isFinite(num)) return null
    nums.push(num)
    expectingNumber = false
  }
  if (expectingNumber) return null
  while (ops.length) {
    if (!applyOperator(nums, ops.pop())) return null
  }
  const result = nums[0]
  return Number.isFinite(result) ? round2(result) : null
}

function precedence(op) {
  if (op === '+' || op === '-') return 1
  if (op === '*' || op === '/') return 2
  return 0
}

function applyOperator(nums, op) {
  if (nums.length < 2) return false
  const b = nums.pop()
  const a = nums.pop()
  if (op === '/' && b === 0) return false
  const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  nums.push(value)
  return true
}

function parseLooseNumber(rawValue) {
  const normalized = String(rawValue ?? '').trim().replace(/[,\s]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

async function goBack() {
  await goBackOrFallback(router, '/features')
}

async function goManualBookkeeping() {
  await router.push('/transactions/quick-add').catch(() => {})
}

async function toggleVoiceInput() {
  if (parsing.value || submitting.value) return
  if (speechListening.value) {
    stopSpeech()
    return
  }

  speechLiveText.value = ''
  let finalText = ''
  const started = await startSpeech({
    lang: speechLanguage.value,
    interimResults: true,
    onResult: ({ finalText: nextFinalText, interimText }) => {
      if (nextFinalText) {
        finalText = `${finalText} ${nextFinalText}`.trim()
        speechLiveText.value = ''
      } else if (interimText) {
        speechLiveText.value = interimText
      }
    },
    onError: (message) => {
      uiStore.pushToast(message || '語音辨識失敗，請改用手動輸入', 'error')
    },
    onEnd: () => {
      const resolved = finalText || speechLiveText.value
      speechLiveText.value = ''
      if (!resolved) return
      composerText.value = resolved
      void submitComposer()
    },
  })

  if (!started && !speechLastError.value) {
    uiStore.pushToast('語音啟動失敗，請稍後再試', 'error')
  }
}

async function loadAutoFillRules() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    autoFillRules.value = []
    return
  }
  autoFillRules.value = await getAutoFillRules(ledgerId).catch(() => [])
}

function warmupRecentHistoryInBackground() {
  if (historyWarmupTask || transactionStore.recent.length) return
  historyWarmupTask = withTimeout(
    transactionStore.loadRecent(120),
    AI_HISTORY_WARMUP_TIMEOUT_MS,
    'AI 歷史資料預載逾時',
  )
    .catch((error) => {
      console.warn('[ai-chat] warmup recent failed', error)
    })
    .finally(() => {
      historyWarmupTask = null
    })
}

async function refreshLinkedDataAfterLoanWrite() {
  await Promise.all([
    loanStore.load(),
    transactionStore.loadRecent(),
    budgetStore.loadMonth(budgetStore.monthKey),
    accountStore.load(),
  ])
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  const safeTimeoutMs = Math.max(0, Number(timeoutMs) || 0)
  if (safeTimeoutMs === 0) return Promise.resolve(task)
  let timeoutId = 0
  const timeoutTask = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), safeTimeoutMs)
  })
  return Promise.race([Promise.resolve(task), timeoutTask]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId)
  })
}

async function loadExchangeRateSnapshot() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  try {
    exchangeRateSnapshot.value = await getExchangeRateSnapshot(ledgerId)
  } catch (error) {
    console.warn('[ai-chat] load exchange snapshot failed', error)
  }
}

function accountCurrencyCode(accountId) {
  const raw = accountStore.accounts.find((item) => item.id === accountId)?.currency_code
  return normalizeCurrencyCode(raw, 'TWD')
}

function hasSystemExchangeRateReady() {
  if (!transferNeedsExchangeRate.value) return true
  const rate = resolveCrossExchangeRate(exchangeRateSnapshot.value?.rates, transferFromCurrency.value, transferToCurrency.value)
  return Number.isFinite(rate) && rate > 0
}

async function syncExchangeRateSnapshotNow(options = {}) {
  const silent = Boolean(options?.silent)
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || exchangeRateSyncing.value) return false
  exchangeRateSyncing.value = true
  try {
    exchangeRateSnapshot.value = await syncCbcExchangeRateSnapshot(ledgerId)
    if (!silent) {
      uiStore.pushToast(`匯率同步完成（資料日期：${exchangeRateSnapshot.value.effectiveDate || '-'}）`)
    }
    return true
  } catch (error) {
    if (!silent) {
      uiStore.pushToast(error?.message || '匯率同步失敗', 'error')
    }
    return false
  } finally {
    exchangeRateSyncing.value = false
  }
}

async function resolveTransferRateOrThrow() {
  if (!transferNeedsExchangeRate.value) return 1
  if (!hasSystemExchangeRateReady()) {
    await loadExchangeRateSnapshot()
  }
  if (!hasSystemExchangeRateReady()) {
    const synced = await withTimeout(
      syncExchangeRateSnapshotNow({ silent: true }),
      TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS,
      '系統匯率同步逾時，請稍後再試',
    )
    if (!synced && !hasSystemExchangeRateReady()) {
      throw new Error('找不到可用匯率，請稍後再試')
    }
  }
  const rate = resolveCrossExchangeRate(exchangeRateSnapshot.value?.rates, transferFromCurrency.value, transferToCurrency.value)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('找不到可用匯率，請稍後再試')
  }
  return rate
}

function toDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toOccurredAtIso(dateInput, hourInput, minuteInput) {
  if (!dateInput) return ''
  const local = `${dateInput}T${String(Number(hourInput)).padStart(2, '0')}:${String(Number(minuteInput)).padStart(2, '0')}:00`
  const parsed = new Date(local)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

function formatClock(date) {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateTimeLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function typeLabel(type) {
  if (type === 'income') return '收入'
  if (type === 'transfer') return '轉帳'
  return '支出'
}

function formatMinor(minor) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD'),
    maximumFractionDigits: 0,
  }).format(Number(minor ?? 0) / 100)
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseLooseDate(value) {
  const normalized = String(value ?? '').replace(/\//g, '-')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfWeek(date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  return next
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
</script>

<style scoped>
.page-header {
  padding: 14px;
}

.header-row {
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-copy h2,
.hero-copy h3 {
  margin: 0;
}

.header-subtitle {
  margin: 4px 0 0;
}

.header-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-panel {
  padding: 0;
  overflow: hidden;
  min-height: min(78dvh, 820px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 16%, transparent), transparent 36%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--ok) 12%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, #06101c), color-mix(in srgb, var(--card) 96%, #02070f));
}

.chat-hero {
  padding: 18px 18px 14px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
}

.hero-eyebrow,
.card-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--primary) 68%, white);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 52%, transparent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 26%, transparent);
}

.status-dot.active {
  background: var(--primary);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 18%, transparent);
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow: auto;
}

.message-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-user {
  align-items: flex-end;
}

.role-assistant {
  align-items: flex-start;
}

.message-bubble {
  width: min(88%, 520px);
  padding: 12px 14px;
  border-radius: 18px;
  box-shadow: var(--shadow-card);
  animation: bubble-in 180ms var(--anim-spring);
}

.message-bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.message-bubble small {
  display: block;
  margin-top: 6px;
  color: color-mix(in srgb, var(--muted) 82%, transparent);
}

.bubble-ai {
  border: 1px solid color-mix(in srgb, var(--field-border) 84%, transparent);
  background: color-mix(in srgb, var(--card) 78%, #0b1424);
}

.bubble-user {
  color: #07131d;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 72%, white), color-mix(in srgb, var(--ok) 52%, white));
}

.assistant-card {
  width: min(100%, 620px);
  padding: 14px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--field-border) 84%, transparent);
  background: color-mix(in srgb, var(--card) 90%, #08111e);
  box-shadow: var(--shadow-card);
  animation: card-in 180ms var(--anim-spring);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-head h4 {
  margin: 4px 0 0;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--warn) 20%, transparent);
  color: color-mix(in srgb, var(--warn) 74%, white);
}

.state-pill.confirm {
  background: color-mix(in srgb, var(--ok) 18%, transparent);
  color: color-mix(in srgb, var(--ok) 74%, white);
}

.state-pill.neutral {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: color-mix(in srgb, var(--primary) 76%, white);
}

.draft-summary {
  margin-top: 14px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--primary) 8%, transparent), color-mix(in srgb, var(--card) 82%, black));
  display: grid;
  gap: 12px;
}

.summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-label {
  font-size: 16px;
  font-weight: 700;
}

.summary-money {
  font-size: 20px;
  font-weight: 800;
}

.summary-empty {
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  display: grid;
  gap: 4px;
}

.summary-item small {
  color: var(--muted);
}

.draft-note {
  margin: 0;
  color: var(--muted);
}

.warn-list {
  margin: 12px 0 0;
  padding-left: 18px;
  color: color-mix(in srgb, var(--warn) 72%, white);
}

.missing-wrap,
.candidate-wrap,
.optional-wrap {
  margin-top: 12px;
}

.missing-wrap {
  display: grid;
  gap: 10px;
}

.missing-field-btn {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--field-border) 74%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--card) 84%, #0d1524);
  color: inherit;
  text-align: left;
}

.missing-priority {
  grid-row: 1 / span 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: color-mix(in srgb, var(--primary) 78%, white);
}

.missing-main {
  font-weight: 700;
}

.missing-hint,
.optional-title {
  color: var(--muted);
}

.option-chip-row,
.quick-chip-row,
.chart-toggle-row,
.card-actions,
.record-actions,
.action-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.option-chip,
.quick-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--field-border) 74%, transparent);
  background: color-mix(in srgb, var(--card) 78%, black);
  color: inherit;
}

.option-chip.accent,
.quick-chip.accent {
  border-color: color-mix(in srgb, var(--primary) 48%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
}

.card-actions {
  margin-top: 14px;
}

.summary-pill-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.summary-pill {
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--card) 80%, black);
  display: grid;
  gap: 4px;
}

.summary-pill small {
  color: var(--muted);
}

.chart-toggle-row {
  margin-top: 12px;
}

.pie-layout {
  display: grid;
  grid-template-columns: minmax(0, 180px) 1fr;
  gap: 14px;
  align-items: center;
  margin-top: 14px;
}

.pie-chart {
  width: 180px;
  height: 180px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  margin: 0 auto;
}

.pie-hole {
  width: 98px;
  height: 98px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
  background: color-mix(in srgb, var(--card) 92%, black);
}

.pie-hole small {
  color: var(--muted);
}

.legend-list,
.bar-chart-list {
  list-style: none;
  padding: 0;
  margin: 14px 0 0;
  display: grid;
  gap: 10px;
}

.legend-list li,
.bar-chart-list li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-name {
  flex: 1;
}

.bar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.bar-stats {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.bar-track,
.trend-track {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--card) 70%, black);
}

.bar-track {
  height: 12px;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.trend-col {
  min-height: 180px;
  border: none;
  background: transparent;
  color: inherit;
  display: grid;
  gap: 8px;
  align-items: end;
}

.trend-value {
  min-height: 36px;
  font-size: 12px;
  color: var(--muted);
}

.trend-track {
  height: 110px;
  display: flex;
  align-items: flex-end;
}

.trend-fill {
  width: 100%;
  border-radius: 16px 16px 6px 6px;
}

.trend-label {
  font-size: 12px;
}

.analysis-footer {
  margin-top: 14px;
}

.analysis-footer p {
  margin: 0;
}

.analysis-footer p + p {
  margin-top: 6px;
}

.record-list {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.record-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--card) 86%, black);
}

.record-main,
.record-side {
  display: grid;
  gap: 8px;
}

.record-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.record-type {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.record-name {
  font-weight: 700;
}

.record-meta {
  color: var(--muted);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.record-side {
  justify-items: end;
}

.delete-copy {
  margin: 14px 0 0;
  color: var(--muted);
}

.composer-shell {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--card) 56%, transparent), color-mix(in srgb, var(--card) 94%, black));
  display: grid;
  gap: 10px;
}

.composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}

.composer-clear {
  padding: 0;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--warn) 74%, white);
}

.voice-tip {
  display: block;
}

.composer-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: end;
}

.composer-input {
  width: 100%;
  min-height: 48px;
  max-height: 140px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--field-border) 74%, transparent);
  color: inherit;
  resize: vertical;
  background: color-mix(in srgb, var(--card) 82%, black);
}

.icon-action-btn {
  width: 46px;
  height: 46px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (max-width: 720px) {
  .chat-panel {
    min-height: calc(100dvh - 180px);
  }

  .chat-hero,
  .composer-row {
    grid-template-columns: 1fr;
  }

  .hero-status {
    white-space: normal;
  }

  .message-bubble,
  .assistant-card {
    width: 100%;
  }

  .summary-grid,
  .summary-pill-grid,
  .pie-layout,
  .record-row {
    grid-template-columns: 1fr;
  }

  .record-side {
    justify-items: start;
  }

  .composer-row {
    display: flex;
  }

  .composer-input {
    min-height: 46px;
  }
}
</style>
