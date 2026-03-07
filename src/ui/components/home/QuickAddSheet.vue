<template>
  <teleport to="body">
    <section v-if="open" class="sheet-mask" @click.self="$emit('close')">
      <article class="sheet card" :class="{ 'ai-mode': isAiMode }">
        <header class="row">
          <h3>{{ isAiMode ? 'AI 記帳' : '手動紀錄' }}</h3>
          <button class="btn" @click="$emit('close')">關閉</button>
        </header>

        <section v-if="isAiMode" class="ai-chat">
          <div class="chat-list">
            <article
              v-for="message in aiMessages"
              :key="message.id"
              class="chat-message"
              :class="message.role"
            >
              <p class="chat-text">{{ message.text }}</p>
              <div v-if="Array.isArray(message.uiBlocks) && message.uiBlocks.length" class="ai-block-list">
                <section
                  v-for="(block, blockIndex) in message.uiBlocks"
                  :key="`block-${message.id}-${blockIndex}`"
                  class="ai-ui-block"
                  :class="`kind-${block.kind || 'card'}`"
                >
                  <header
                    v-if="String(block.title ?? '').trim() || String(block.subtitle ?? '').trim()"
                    class="ai-ui-block-head"
                  >
                    <strong v-if="String(block.title ?? '').trim()">{{ block.title }}</strong>
                    <small v-if="String(block.subtitle ?? '').trim()" class="muted">{{ block.subtitle }}</small>
                  </header>

                  <div v-if="block.kind === 'table'" class="ai-table-wrap">
                    <table class="ai-table">
                      <thead v-if="Array.isArray(block.content?.columns) && block.content.columns.length">
                        <tr>
                          <th v-for="column in block.content.columns" :key="`col-${column}`">{{ column }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in block.content?.rows ?? []" :key="`row-${rowIndex}`">
                          <td v-for="(cell, cellIndex) in row" :key="`cell-${rowIndex}-${cellIndex}`">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div
                      v-if="String(block.content?.total_label ?? '').trim() || String(block.content?.total_value ?? '').trim()"
                      class="ai-table-total"
                    >
                      <span>{{ block.content?.total_label }}</span>
                      <strong>{{ block.content?.total_value }}</strong>
                    </div>
                  </div>

                  <div v-else-if="block.kind === 'chart'" class="ai-chart-wrap">
                    <small class="muted">{{ block.content?.chart_spec?.chart_type || 'bar' }}</small>
                    <ul class="ai-chart-bars">
                      <li
                        v-for="item in buildChartBarsFromBlock(block)"
                        :key="`bar-${item.label}`"
                        class="ai-chart-row"
                      >
                        <span class="ai-chart-label">{{ item.label }}</span>
                        <span class="ai-chart-track"><span class="ai-chart-fill" :style="{ width: `${item.ratio}%` }"></span></span>
                        <span class="ai-chart-value">{{ item.valueText }}</span>
                      </li>
                    </ul>
                    <p v-if="String(block.content?.summary_text ?? '').trim()" class="muted ai-chart-summary">{{ block.content.summary_text }}</p>
                  </div>

                  <div v-else-if="Array.isArray(block.content?.items) && block.content.items.length" class="ai-card-list">
                    <p v-for="(line, lineIndex) in block.content.items" :key="`line-${lineIndex}`" class="chat-text">{{ line }}</p>
                  </div>

                  <p v-else-if="String(block.content?.text ?? '').trim()" class="chat-text">{{ block.content.text }}</p>

                  <div v-if="Array.isArray(block.actions) && block.actions.length" class="ai-block-actions">
                    <button
                      v-for="(action, actionIndex) in block.actions"
                      :key="`action-${actionIndex}-${action.label}`"
                      type="button"
                      class="btn chat-action-btn"
                      :class="resolveActionBtnClass(action.style)"
                      @click="handleAiUiAction(action)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </section>
              </div>
              <button
                v-if="message.actionKey"
                type="button"
                class="btn chat-action-btn"
                @click="handleAiMessageAction(message.actionKey)"
              >
                {{ resolveAiMessageActionLabel(message.actionKey) }}
              </button>
            </article>
          </div>

          <article v-if="aiCreatedRecord" class="ai-result card">
            <div
              class="ai-tx-item"
              :class="{ clickable: aiCreatedRecord.canEdit }"
              role="button"
              tabindex="0"
              @click="goEditCreatedTransaction"
            >
              <span class="ai-tx-icon-wrap">
                <font-awesome-icon v-if="aiResultIcon" :icon="aiResultIcon" class="ai-tx-icon" />
              </span>
              <div class="ai-tx-main">
                <strong class="ai-tx-title">{{ aiResultTitle }}</strong>
                <small class="muted">{{ aiResultOccurredAtLabel }}</small>
              </div>
              <div class="ai-tx-side">
                <strong>{{ aiResultSignedAmount }}</strong>
                <small class="muted">{{ aiResultAccountText }}</small>
              </div>
            </div>
            <button v-if="aiCreatedRecord.canEdit" type="button" class="ai-edit-link" @click="goEditCreatedTransaction">
              可直接前往編輯
            </button>
          </article>

          <footer class="ai-input-row">
            <textarea
              v-model.trim="aiInput"
              class="textarea ai-input"
              rows="2"
              placeholder="像聊天一樣輸入，例如：昨天晚餐 350 元刷玉山卡，可報銷"
              :disabled="aiAutoCreating"
              @keydown.enter.exact.prevent="parseWithAi"
            />
            <div class="ai-action-col">
              <button
                v-if="!hasAiInputText && speechSupported"
                type="button"
                class="btn icon-action-btn"
                :class="{ primary: speechListening }"
                :disabled="aiAutoCreating"
                :aria-label="speechListening ? '停止語音輸入' : '語音輸入'"
                :title="speechListening ? '停止語音輸入' : '語音輸入'"
                @click="toggleAiVoiceInput"
              >
                <font-awesome-icon icon="fa-solid fa-microphone" />
              </button>
              <button
                v-else
                type="button"
                class="btn primary icon-action-btn"
                :disabled="aiAutoCreating"
                aria-label="送出 AI 記帳"
                title="送出 AI 記帳"
                @click="parseWithAi"
              >
                <font-awesome-icon icon="fa-solid fa-paper-plane" />
              </button>
            </div>
          </footer>
          <small v-if="speechListening && aiInterimSpeechText" class="muted">語音辨識中：{{ aiInterimSpeechText }}</small>
        </section>

        <template v-else>
          <div class="type-grid">
            <button
              v-for="item in types"
              :key="item.value"
              class="btn"
              :class="{ primary: model.type === item.value }"
              @click="model.type = item.value"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="stack form-wrap">
            <label>
              金額（元）
              <input
                v-model="model.amountInput"
                type="text"
                inputmode="none"
                readonly
                class="input"
                @input="handleAmountInput"
              />
            </label>

            <div class="date-extra-row">
              <div class="field-block">
                <span class="field-label">交易時間</span>
                <DateTimePickerField
                  :date="model.occurredDate"
                  :hour="model.occurredHour"
                  :minute="model.occurredMinute"
                  prefer-bottom-anchor
                  @update:date="model.occurredDate = $event"
                  @update:hour="model.occurredHour = $event"
                  @update:minute="model.occurredMinute = $event"
                />
              </div>

              <button type="button" class="btn extra-btn" :class="{ active: showExtra }" @click="showExtra = true">
                附加資訊
              </button>
            </div>

            <div v-if="model.type === 'transfer'" class="inline-grid">
              <label>
                帳戶
                <CustomSelect v-model="model.accountId" :options="transferAccountOptions" />
              </label>

              <label>
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
                <label v-if="model.exchangeRateMode === 'manual'">
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
              <label>
                帳戶
                <CustomSelect v-model="model.accountId" :options="directAccountOptions" />
              </label>

              <label>
                分類
                <button
                  type="button"
                  class="select category-trigger"
                  :class="{ placeholder: !selectedCategoryLabel }"
                  :disabled="!hasVisibleCategories"
                  @click="openCategoryPicker"
                >
                  <font-awesome-icon v-if="selectedCategoryIcon" :icon="selectedCategoryIcon" class="category-icon" />
                  <span class="category-value">{{ selectedCategoryLabel || '請選擇分類' }}</span>
                  <span class="category-arrow">›</span>
                </button>
              </label>
            </div>


            <section class="calc-panel">
              <div class="calc-grid">
                <button
                  v-for="key in calcKeys"
                  :key="key"
                  type="button"
                  class="calc-key btn"
                  :class="{ equal: key === '=' }"
                  @click="pressCalcKey(key)"
                >
                  {{ key === '=' && equalShowsDone ? '完成' : key }}
                </button>
              </div>
            </section>
          </div>
        </template>
      </article>
    </section>

    <section v-if="open && !isAiMode && showExtra" class="extra-mask" @click.self="showExtra = false">
      <article class="extra-sheet card">
        <header class="row">
          <h4>附加資訊</h4>
          <button class="btn" @click="showExtra = false">完成</button>
        </header>

        <div class="stack extra-content">
          <div class="addon-wrap">
            <div class="row">
              <span class="field-label">附加項目</span>
              <button type="button" class="btn" @click="addAddonRow()">新增項目</button>
            </div>

            <div v-for="item in addonRows" :key="item.id" class="addon-row">
              <CustomSelect
                v-model="item.optionId"
                class="addon-name"
                :options="addonTemplateOptions"
                @update:model-value="onAddonOptionChange(item, $event)"
              />
              <CustomSelect v-model="item.direction" class="addon-dir" :options="addonDirectionOptions" />
              <input v-model.number="item.amountMajor" class="input addon-amount" type="number" min="0" step="0.01" placeholder="0" />
              <button type="button" class="btn danger addon-remove" @click="removeAddonRow(item.id)">刪除</button>
            </div>

            <div class="row">
              <small class="addon-desc">可在設定中的附加項目清單更改</small>
            </div>
          </div>

          <label>
            備註
            <textarea v-model="model.note" class="textarea" rows="3" />
          </label>

          <div v-if="model.type !== 'transfer'" class="impact-wrap">
            <span class="field-label">附加條件</span>
            <div class="switch-list">
              <button
                v-if="model.type === 'expense'"
                type="button"
                class="switch-row"
                :class="{ active: model.isReimbursable }"
                role="switch"
                :aria-checked="model.isReimbursable ? 'true' : 'false'"
                @click="model.isReimbursable = !model.isReimbursable"
              >
                <span class="switch-copy">
                  <span class="switch-title">報銷</span>
                  <span class="switch-hint">這筆支出會進入待報銷流程</span>
                </span>
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </button>
              <div class="switch-grid">
                <button
                  type="button"
                  class="switch-row"
                  :class="{ active: model.includeInBudget }"
                  role="switch"
                  :aria-checked="model.includeInBudget ? 'true' : 'false'"
                  @click="model.includeInBudget = !model.includeInBudget"
                >
                  <span class="switch-copy">
                    <span class="switch-title">紀錄預算</span>
                    <span class="switch-hint">納入本期預算使用與超支提醒</span>
                  </span>
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
                  <span class="switch-copy">
                    <span class="switch-title">紀錄收支</span>
                    <span class="switch-hint">納入圖表、報表與統計分析</span>
                  </span>
                  <span class="switch-track"><span class="switch-thumb"></span></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <transition name="category-overlay">
      <section v-if="open && !isAiMode && showCategoryPicker" class="category-mask" @click.self="closeCategoryPicker">
        <article class="category-sheet card">
          <header class="row category-head">
            <button type="button" class="btn" @click="closeCategoryPicker">返回</button>
            <h4>選擇分類</h4>
            <button type="button" class="btn" @click="closeCategoryPicker">完成</button>
          </header>

          <section v-if="categoryPickerGroups.length" class="category-layout">
            <aside class="category-pane parent-pane">
              <button
                v-for="group in categoryPickerGroups"
                :key="group.id"
                type="button"
                class="category-item"
                :class="{ active: String(group.id) === String(categoryPickerParentId) }"
                @click="setCategoryPickerParent(group.id)"
              >
                {{ group.name }}
              </button>
            </aside>

            <section class="category-pane child-pane">
              <button
                v-for="category in categoryPickerChildren"
                :key="category.id"
                type="button"
                class="category-item"
                :class="{ active: category.id === model.categoryId }"
                @click="pickCategory(category.id)"
              >
                <font-awesome-icon v-if="category.icon" :icon="category.icon" class="category-item-icon" />
                <span>{{ category.name }}</span>
              </button>
              <p v-if="!categoryPickerChildren.length" class="category-empty">此母分類沒有可選子分類</p>
            </section>
          </section>

          <p v-else class="category-empty">目前沒有可用分類，請先到設定新增分類。</p>
          <p class="category-tip">可在設定中的分類管理做新增刪除</p>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { getAiBookkeepingWarningFallback, parseAutoBookkeepingText } from '@/core/services/ai-bookkeeping.service'
import { assertCanUseAiBookkeeping, recordAiBookkeepingUsage } from '@/core/services/membership.service'
import { useSpeechInput } from '@/ui/composables/use-speech-input'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { useI18n } from '@/ui/services/i18n.service'
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
  resolveLoanTransactionType,
} from '@/ui/services/ai-loan-intent.service'
import { listTransactionsByDay, listTransactionsByMonth } from '@/core/repositories/transaction.repo'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: 'manual',
  },
  initialType: {
    type: String,
    default: 'expense',
  },
  useStandaloneAi: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'switch-mode', 'open-ai-page'])

const router = useRouter()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const budgetStore = useBudgetStore()
const loanStore = useLoanStore()
const ledgerStore = useLedgerStore()
const addonTemplateStore = useAddonTemplateStore()
const { t } = useI18n()

const types = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '轉帳' },
]

const model = reactive({
  type: 'expense',
  amount: null,
  amountInput: '',
  occurredDate: '',
  occurredHour: 0,
  occurredMinute: 0,
  accountId: '',
  peerAccountId: '',
  categoryId: '',
  isReimbursable: false,
  includeInBudget: true,
  includeInAnalysis: true,
  note: '',
  exchangeRateMode: 'system',
  manualExchangeRateInput: '',
})
const aiInput = ref('')
const aiInterimSpeechText = ref('')
const aiMessages = ref([])
const aiCreatedRecord = ref(null)
const aiAutoCreating = ref(false)
const AI_AUTOCREATE_TIMEOUT_MS = 15000
const AI_HISTORY_WARMUP_TIMEOUT_MS = 1800
const TRANSFER_RATE_AUTO_SYNC_TIMEOUT_MS = 8000
const AI_DIALOGUE_INTRO_STORAGE_KEY = 'strawmoneybook.ai-dialogue-intro.v1'
const AI_CONFIRM_TOKEN_PREFIX = 'ai-confirm'
const AI_ACTION_TYPE = Object.freeze({
  CREATE_TRANSACTION: 'CREATE_TRANSACTION',
  GENERATE_CHART: 'GENERATE_CHART',
  GENERATE_REPORT: 'GENERATE_REPORT',
  EXPORT_DATA: 'EXPORT_DATA',
  NAVIGATE: 'NAVIGATE',
  OPEN_MODAL: 'OPEN_MODAL',
  SHOW_TOAST: 'SHOW_TOAST',
})
const AI_BLOCK_KIND = Object.freeze({
  CARD: 'card',
  TABLE: 'table',
  CHART: 'chart',
  CHIPS: 'chips',
  CTA_ROW: 'cta_row',
  CONFIRM: 'confirm',
  EMPTY_STATE: 'empty_state',
  ERROR_STATE: 'error_state',
})
const {
  isSupported: speechSupported,
  isListening: speechListening,
  lastError: speechLastError,
  start: startSpeech,
  stop: stopSpeech,
} = useSpeechInput()
let aiMessageSeq = 1
let aiHistoryWarmupTask = null
const showExtra = ref(false)
const showCategoryPicker = ref(false)
const categoryPickerParentId = ref('')
const addonRows = ref([])
const exchangeRateSnapshot = ref({
  syncedAt: '',
  effectiveDate: '',
  rates: { USD: 1 },
})
const exchangeRateSyncing = ref(false)
const autoFillRules = ref([])
let addonSeq = 1

const calcKeys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '⌫', '+', 'C', '=']
const addonDirectionOptions = [
  { value: 'plus', label: '+' },
  { value: 'minus', label: '-' },
]
const isAiMode = computed(() => props.mode === 'ai')
const hasAiInputText = computed(() => String(aiInput.value ?? '').trim().length > 0)
const aiOccurredAtLabel = computed(() => {
  if (!model.occurredDate) return '-'
  const hour = String(Number(model.occurredHour ?? 0)).padStart(2, '0')
  const minute = String(Number(model.occurredMinute ?? 0)).padStart(2, '0')
  return `${model.occurredDate} ${hour}:${minute}`
})
const aiResultType = computed(() => aiCreatedRecord.value?.type ?? model.type)
const aiResultAmountMajor = computed(() => {
  if (aiCreatedRecord.value) return Math.abs(Number(aiCreatedRecord.value.amountMinor ?? 0)) / 100
  return Math.abs(Number(model.amount ?? 0))
})
const aiResultAccountId = computed(() => aiCreatedRecord.value?.accountId ?? model.accountId)
const aiResultPeerAccountId = computed(() => aiCreatedRecord.value?.peerAccountId ?? model.peerAccountId)
const aiResultCategoryId = computed(() => aiCreatedRecord.value?.categoryId ?? model.categoryId)
const aiResultOccurredAtLabel = computed(() => {
  if (aiCreatedRecord.value?.occurredAt) return formatOccurredAtLabel(aiCreatedRecord.value.occurredAt)
  return aiOccurredAtLabel.value
})
const aiResultTitle = computed(() => {
  if (aiCreatedRecord.value?.title) return aiCreatedRecord.value.title
  if (aiResultType.value === 'transfer') return '轉帳'
  return categoryNameById(aiResultCategoryId.value)
})
const aiResultIcon = computed(() => {
  if (aiCreatedRecord.value?.icon) return aiCreatedRecord.value.icon
  if (aiResultType.value === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  const category = categoryStore.categories.find((item) => item.id === aiResultCategoryId.value)
  return category?.icon ?? ''
})
const aiResultSignedAmount = computed(() => {
  const currencyCode = accountCurrencyCode(aiResultAccountId.value)
  const amountText = formatCurrencyMajor(aiResultAmountMajor.value, currencyCode)
  if (aiResultType.value === 'expense') return `-${amountText}`
  if (aiResultType.value === 'income') return `+${amountText}`
  return amountText
})
const aiResultAccountText = computed(() => {
  if (aiCreatedRecord.value?.accountText) return aiCreatedRecord.value.accountText
  if (aiResultType.value === 'transfer') {
    return `${accountNameById(aiResultAccountId.value)} → ${accountNameById(aiResultPeerAccountId.value)}`
  }
  return accountNameById(aiResultAccountId.value)
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

const visibleCategoryGroups = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})
const categoryPickerGroups = computed(() => {
  return (visibleCategoryGroups.value ?? []).filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
})
const categoryPickerChildren = computed(() => {
  const group = categoryPickerGroups.value.find((item) => String(item.id) === String(categoryPickerParentId.value))
  return group?.categories ?? []
})
const hasVisibleCategories = computed(() => categoryPickerGroups.value.length > 0)
const selectedCategoryLabel = computed(() => {
  if (!model.categoryId) return ''
  for (const group of categoryPickerGroups.value) {
    const matched = group.categories.find((item) => item.id === model.categoryId)
    if (matched) return `${group.name} / ${matched.name}`
  }
  return ''
})
const selectedCategoryIcon = computed(() => {
  if (!model.categoryId) return ''
  for (const group of categoryPickerGroups.value) {
    const matched = group.categories.find((item) => item.id === model.categoryId)
    if (matched?.icon) return matched.icon
  }
  return ''
})
const equalShowsDone = computed(() => {
  const input = String(model.amountInput ?? '').trim()
  if (!input || isFormulaExpression(input)) return false
  return Number.isFinite(evaluateExpression(input))
})
const addonTemplateItems = computed(() => addonTemplateStore.templates)
const addonTemplateOptions = computed(() => addonTemplateStore.options)

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
  const baseAmountMinor = Math.round(Math.abs(Number(model.amount ?? 0)) * 100)
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

function openAiMode() {
  if (props.useStandaloneAi) {
    emit('open-ai-page')
    return
  }
  emit('switch-mode', 'ai')
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      aiInput.value = ''
      aiInterimSpeechText.value = ''
      aiAutoCreating.value = false
      aiCreatedRecord.value = null
      showExtra.value = false
      showCategoryPicker.value = false
      stopSpeech()
      return
    }

    const defaults = defaultOccurredDateTime()
    model.type = normalizeType(props.initialType)
    model.amount = null
    model.amountInput = ''
    model.occurredDate = defaults.date
    model.occurredHour = defaults.hour
    model.occurredMinute = defaults.minute
    model.isReimbursable = false
    model.includeInBudget = true
    model.includeInAnalysis = true
    model.note = ''
    model.exchangeRateMode = 'system'
    model.manualExchangeRateInput = ''
    aiMessageSeq = 1
    aiInput.value = ''
    aiInterimSpeechText.value = ''
    aiCreatedRecord.value = null
    aiAutoCreating.value = false
    aiMessages.value = []
    showExtra.value = false
    showCategoryPicker.value = false
    model.accountId = defaultAccountId()
    model.peerAccountId = defaultPeerAccountId(model.accountId)
    model.categoryId = ensureCategoryIdByType(model.type, '')
    syncCategoryPickerParent(model.categoryId)
    addonRows.value = [createAddonRow()]
    void loadExchangeRateSnapshot()
    void loadAutoFillRules()
    if (isAiMode.value) {
      ensureAiConversationBootstrapped()
    }
  },
  { immediate: true },
)

function onRequestCloseOverlay(event) {
  if (!props.open) return
  if (showCategoryPicker.value) {
    showCategoryPicker.value = false
    event.preventDefault()
    return
  }
  if (showExtra.value) {
    showExtra.value = false
    event.preventDefault()
    return
  }
  emit('close')
  event.preventDefault()
}

onMounted(() => {
  void addonTemplateStore.load()
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
  stopSpeech()
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void loadAutoFillRules()
  },
  { immediate: true },
)

watch(
  () => model.type,
  (type) => {
    if (type === 'transfer') {
      model.categoryId = ''
      showCategoryPicker.value = false
      if (!model.exchangeRateMode) {
        model.exchangeRateMode = 'system'
      }
    } else {
      model.categoryId = ensureCategoryIdByType(type, model.categoryId)
    }
    if (type !== 'expense') {
      model.isReimbursable = false
    }
    ensureValidAccounts()
    syncCategoryPickerParent(model.categoryId)
    if (!addonRows.value.length) {
      addonRows.value = [createAddonRow()]
    }
  },
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
  () => visibleCategoryGroups.value,
  () => {
    if (model.type !== 'transfer') {
      model.categoryId = ensureCategoryIdByType(model.type, model.categoryId)
    }
    syncCategoryPickerParent(model.categoryId)
  },
  { deep: true },
)

watch(
  () => isAiMode.value,
  (next) => {
    if (!props.open || !next) return
    ensureAiConversationBootstrapped()
  },
)

watch(
  () => accountStore.accounts.map((item) => item.id),
  () => {
    ensureValidAccounts()
  },
)

watch(
  () => [model.type, model.accountId, model.peerAccountId, model.exchangeRateMode],
  () => {
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

function buildAssistantResponse({ user_message = '', ui_blocks = [], actions = [] } = {}) {
  return {
    user_message: String(user_message ?? '').trim(),
    ui_blocks: Array.isArray(ui_blocks) ? ui_blocks : [],
    actions: Array.isArray(actions) ? actions : [],
  }
}

function pushAssistantResponse(response) {
  const normalized = buildAssistantResponse(response)
  if (!normalized.user_message) return
  pushAiMessage('assistant', normalized.user_message, {
    uiBlocks: normalized.ui_blocks,
    actions: normalized.actions,
  })
}

function resolveActionBtnClass(style) {
  const normalized = String(style ?? '').trim()
  if (normalized === 'primary') return 'primary'
  if (normalized === 'danger') return 'danger'
  if (normalized === 'ghost') return 'ghost'
  return ''
}

function buildChartBarsFromBlock(block) {
  const labels = block?.content?.chart_spec?.labels ?? []
  const seriesData = block?.content?.chart_spec?.series?.[0]?.data ?? []
  const unit = String(block?.content?.chart_spec?.unit ?? '').trim()
  const values = seriesData.map((item) => Number(item) || 0)
  const max = Math.max(1, ...values)
  return labels.map((label, index) => {
    const value = Number(values[index] ?? 0)
    return {
      label,
      ratio: Math.max(0, Math.min(100, (value / max) * 100)),
      valueText: unit && /^[A-Za-z]{3}$/.test(unit)
        ? formatCurrencyMajor(value, unit)
        : `${new Intl.NumberFormat('zh-TW').format(value)}${unit ? ` ${unit}` : ''}`,
    }
  })
}

function createConfirmToken(scope) {
  const normalizedScope = String(scope ?? '').trim() || 'default'
  return `${AI_CONFIRM_TOKEN_PREFIX}-${normalizedScope}-${Date.now()}`
}

function hasSeenAiDialogueIntro() {
  try {
    return localStorage.getItem(AI_DIALOGUE_INTRO_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markAiDialogueIntroSeen() {
  try {
    localStorage.setItem(AI_DIALOGUE_INTRO_STORAGE_KEY, '1')
  } catch {
    // Ignore local storage failures.
  }
}

function buildAiFirstUseGuideResponse() {
  const ctaActions = [
    { label: '新增支出', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'expense' }, style: 'primary' },
    { label: '新增收入', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'income' }, style: 'secondary' },
    { label: '轉帳', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'transfer' }, style: 'secondary' },
    { label: '本月圖表', action_type: AI_ACTION_TYPE.GENERATE_CHART, action_payload: { preset: 'month_expense_category', metric: 'expense' }, style: 'ghost' },
    { label: '列出今天', action_type: AI_ACTION_TYPE.GENERATE_REPORT, action_payload: { preset: 'today_transactions' }, style: 'ghost' },
    { label: '匯出', action_type: AI_ACTION_TYPE.EXPORT_DATA, action_payload: { preset: 'export_transactions' }, style: 'ghost' },
  ]
  return buildAssistantResponse({
    user_message: '你可以直接用一句話記帳、查詢、計算與產生圖表。我會先回覆結果，再附上可點擊下一步。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CARD,
        title: '第一次使用說明',
        content: {
          items: [
            '例：晚餐 180',
            '例：列出今天交易',
            '例：本月支出圖表',
            '例：匯出CSV',
            '提醒：刪除與覆蓋匯入會二次確認',
          ],
        },
      },
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        title: '快速開始',
        actions: ctaActions,
      },
    ],
    actions: ctaActions.map((item) => ({
      type: item.action_type,
      payload: item.action_payload,
      requires_confirm: false,
    })),
  })
}

function buildAiReadyResponse() {
  return buildAssistantResponse({
    user_message: 'AI 會計對話模式已開啟。直接輸入一句話，例如：今天午餐 120。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CHIPS,
        title: '常用指令',
        actions: [
          { label: '列出今天', action_type: AI_ACTION_TYPE.GENERATE_REPORT, action_payload: { preset: 'today_transactions' }, style: 'ghost' },
          { label: '本月圖表', action_type: AI_ACTION_TYPE.GENERATE_CHART, action_payload: { preset: 'month_expense_category', metric: 'expense' }, style: 'ghost' },
          { label: '切換手動', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'expense' }, style: 'secondary' },
        ],
      },
    ],
  })
}

function ensureAiConversationBootstrapped() {
  if (aiMessages.value.length) return
  if (!hasSeenAiDialogueIntro()) {
    pushAssistantResponse(buildAiFirstUseGuideResponse())
    markAiDialogueIntroSeen()
    return
  }
  pushAssistantResponse(buildAiReadyResponse())
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => {
    const cloned = new RegExp(pattern.source, pattern.flags)
    return cloned.test(text)
  })
}

function parseLooseAmountText(rawValue) {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/,/g, '')
    .toLowerCase()
  if (!normalized) return NaN
  const isK = normalized.endsWith('k')
  const numeric = Number(isK ? normalized.slice(0, -1) : normalized)
  if (!Number.isFinite(numeric)) return NaN
  return isK ? numeric * 1000 : numeric
}

function formatCalcResult(value) {
  const safeValue = Number(value)
  if (!Number.isFinite(safeValue)) return ''
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeValue)
}

function tryResolveSimpleCalculation(text) {
  const source = String(text ?? '').trim()
  if (!source) return null

  const splitMatch = source.match(/([0-9][0-9,.kK]*)\s*(?:分|÷|\/)\s*([0-9][0-9,.kK]*)\s*(?:人|位|個|个)?/)
  if (splitMatch) {
    const total = parseLooseAmountText(splitMatch[1])
    const people = parseLooseAmountText(splitMatch[2])
    if (Number.isFinite(total) && Number.isFinite(people) && people > 0) {
      return {
        kind: 'split',
        expression: `${splitMatch[1]} ÷ ${splitMatch[2]}`,
        result: Math.round((total / people) * 100) / 100,
      }
    }
  }

  const discountByFold = source.match(/([0-9][0-9,.kK]*)\s*打\s*([0-9](?:\.\d+)?)\s*折/)
  if (discountByFold) {
    const base = parseLooseAmountText(discountByFold[1])
    const fold = Number(discountByFold[2])
    if (Number.isFinite(base) && Number.isFinite(fold) && fold >= 0) {
      return {
        kind: 'discount',
        expression: `${discountByFold[1]} 打 ${discountByFold[2]} 折`,
        result: Math.round((base * (fold / 10)) * 100) / 100,
      }
    }
  }

  const discountByPercent = source.match(/([0-9][0-9,.kK]*)\s*(?:折扣|discount|off)\s*([0-9](?:\.\d+)?)\s*%/i)
  if (discountByPercent) {
    const base = parseLooseAmountText(discountByPercent[1])
    const pct = Number(discountByPercent[2])
    if (Number.isFinite(base) && Number.isFinite(pct)) {
      return {
        kind: 'discount',
        expression: `${discountByPercent[1]} 折扣 ${discountByPercent[2]}%`,
        result: Math.round((base * (1 - (pct / 100))) * 100) / 100,
      }
    }
  }

  if (/%/.test(source) && includesAny(source, [/折扣/, /discount/i, /off/i]) && (source.match(/\d+(?:\.\d+)?/g)?.length ?? 0) < 2) {
    return {
      kind: 'discount_missing_base',
      percentText: source.match(/\d+(?:\.\d+)?%/)?.[0] ?? '',
    }
  }

  const expression = source.replace(/[=？?]/g, '').trim()
  if (/^[0-9+\-×÷*/.\s]+$/.test(expression) && /[+\-×÷*/]/.test(expression)) {
    const result = evaluateExpression(expression)
    if (Number.isFinite(result)) {
      return {
        kind: 'expression',
        expression,
        result,
      }
    }
  }

  return null
}

function buildCalculationResponse(sourceText, calcResult) {
  if (calcResult?.kind === 'discount_missing_base') {
    return buildAssistantResponse({
      user_message: '折扣計算還差一個原價金額。請補上原價，例如：1200 折扣 10%。',
      ui_blocks: [
        {
          kind: AI_BLOCK_KIND.CHIPS,
          title: '快速填法',
          actions: [
            { label: '1200 折扣 10%', action_type: AI_ACTION_TYPE.SHOW_TOAST, action_payload: { message: '請直接輸入：1200 折扣 10%' }, style: 'ghost' },
            { label: '5000 打 9 折', action_type: AI_ACTION_TYPE.SHOW_TOAST, action_payload: { message: '請直接輸入：5000 打 9 折' }, style: 'ghost' },
          ],
        },
      ],
    })
  }

  const resultValue = Number(calcResult?.result)
  if (!Number.isFinite(resultValue)) {
    return buildAssistantResponse({
      user_message: '這句話看起來像計算題，但我目前無法穩定解析。你可以改成純算式，例如：5000 ÷ 3。',
      ui_blocks: [{ kind: AI_BLOCK_KIND.ERROR_STATE, title: '無法計算', content: { text: sourceText } }],
    })
  }

  const resultText = formatCalcResult(resultValue)
  const expenseAmount = Math.max(0, Math.round(resultValue * 100) / 100)
  return buildAssistantResponse({
    user_message: `${calcResult.expression} = ${resultText}`,
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CARD,
        title: '計算結果',
        content: {
          items: [
            `${calcResult.expression}`,
            `結果：${resultText}`,
          ],
        },
      },
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: [
          {
            label: '記為支出',
            action_type: AI_ACTION_TYPE.OPEN_MODAL,
            action_payload: {
              target: 'quick_add_manual',
              type: 'expense',
              amountMajor: expenseAmount,
              note: `AI 計算：${calcResult.expression} = ${resultText}`,
            },
            style: 'primary',
          },
          {
            label: '不記錄',
            action_type: AI_ACTION_TYPE.SHOW_TOAST,
            action_payload: { message: '已略過記帳' },
            style: 'ghost',
          },
        ],
      },
    ],
  })
}

function buildDangerousCommandResponse(text) {
  const confirmToken = createConfirmToken('danger')
  return buildAssistantResponse({
    user_message: '這是高風險操作，我不會直接執行。請先確認影響範圍後再繼續。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CONFIRM,
        title: '需要二次確認',
        subtitle: '刪除/覆蓋類操作',
        content: {
          items: [
            `你輸入：${text}`,
            '這類操作不可逆，建議先備份資料。',
          ],
        },
        actions: [
          {
            label: '前往資料管理',
            action_type: AI_ACTION_TYPE.NAVIGATE,
            action_payload: { routeName: 'settings-data-management', closeSheet: true },
            style: 'danger',
          },
          {
            label: '取消',
            action_type: AI_ACTION_TYPE.SHOW_TOAST,
            action_payload: { message: '已取消高風險操作' },
            style: 'ghost',
          },
        ],
      },
    ],
    actions: [
      {
        type: 'APPLY_IMPORT',
        payload: { raw_text: text },
        requires_confirm: true,
        confirm_token: confirmToken,
      },
    ],
  })
}

function buildExitAiResponse() {
  return buildAssistantResponse({
    user_message: '可以，已準備切換模式。你可以回到手動新增，或直接回列表瀏覽交易。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: [
          { label: '切換手動', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'expense' }, style: 'primary' },
          { label: '回到列表', action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'home', closeSheet: true }, style: 'secondary' },
          { label: '關閉視窗', action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'home', closeSheet: true }, style: 'ghost' },
        ],
      },
    ],
    actions: [
      {
        type: AI_ACTION_TYPE.NAVIGATE,
        payload: { routeName: 'home' },
        requires_confirm: false,
      },
    ],
  })
}

function buildCategoryHelpResponse() {
  return buildAssistantResponse({
    user_message: '分類相關操作我可以先幫你導到分類管理。建立後回來直接輸入「今天午餐 120」即可快速記帳。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: [
          { label: t('settings.category_management'), action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'settings-categories', closeSheet: true }, style: 'primary' },
        ],
      },
    ],
  })
}

function buildErrorResponse(message) {
  const text = String(message ?? '').trim() || '處理失敗，請稍後再試'
  return buildAssistantResponse({
    user_message: text,
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.ERROR_STATE,
        title: '處理失敗',
        content: { text },
      },
    ],
  })
}

function resolveTypeLabel(type) {
  if (type === 'income') return '收入'
  if (type === 'transfer') return '轉帳'
  return '支出'
}

function formatTxTime(occurredAt) {
  const parsed = new Date(occurredAt)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatSignedAmountByTx(tx) {
  const amountMinor = Math.abs(Number(tx?.amount_minor ?? 0))
  const currencyCode = normalizeCurrencyCode(tx?.account_currency_code, 'TWD')
  const amountText = formatCurrencyMinor(amountMinor, currencyCode)
  if (tx?.type === 'expense') return `-${amountText}`
  if (tx?.type === 'income') return `+${amountText}`
  return amountText
}

async function replyTodayTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    pushAssistantResponse(buildErrorResponse('目前沒有啟用帳本，無法查詢今天交易。'))
    return
  }
  const dayKey = dateKeyFromDate(new Date())
  const rows = await listTransactionsByDay(ledgerId, dayKey).catch(() => [])
  if (!rows.length) {
    pushAssistantResponse(buildAssistantResponse({
      user_message: '今天還沒有交易紀錄。',
      ui_blocks: [
        { kind: AI_BLOCK_KIND.EMPTY_STATE, title: '今天 0 筆', content: { text: '要不要現在新增一筆？' } },
        {
          kind: AI_BLOCK_KIND.CTA_ROW,
          actions: [
            { label: '新增支出', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'expense' }, style: 'primary' },
            { label: '新增收入', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'income' }, style: 'secondary' },
          ],
        },
      ],
    }))
    return
  }

  const incomeMinor = rows.reduce((sum, tx) => sum + (tx.type === 'income' ? Number(tx.amount_minor ?? 0) : 0), 0)
  const expenseMinor = rows.reduce((sum, tx) => sum + (tx.type === 'expense' ? Number(tx.amount_minor ?? 0) : 0), 0)
  const netMinor = incomeMinor - expenseMinor
  const baseCurrency = normalizeCurrencyCode(rows[0]?.account_currency_code, 'TWD')
  const summaryLines = [
    `筆數：${rows.length} 筆`,
    `收入：${formatCurrencyMinor(incomeMinor, baseCurrency)}`,
    `支出：${formatCurrencyMinor(expenseMinor, baseCurrency)}`,
    `淨額：${netMinor >= 0 ? '+' : '-'}${formatCurrencyMinor(Math.abs(netMinor), baseCurrency)}`,
  ]
  const tableRows = rows.slice(0, 8).map((tx) => [
    formatTxTime(tx.occurred_at),
    resolveTypeLabel(tx.type),
    tx.category_name || '-',
    formatSignedAmountByTx(tx),
  ])

  pushAssistantResponse(buildAssistantResponse({
    user_message: `已列出今天交易，共 ${rows.length} 筆。`,
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CARD,
        title: '今天交易摘要',
        content: { items: summaryLines },
      },
      {
        kind: AI_BLOCK_KIND.TABLE,
        title: '交易列表（前 8 筆）',
        content: {
          columns: ['時間', '類型', '分類', '金額'],
          rows: tableRows,
          total_label: '今天淨額',
          total_value: `${netMinor >= 0 ? '+' : '-'}${formatCurrencyMinor(Math.abs(netMinor), baseCurrency)}`,
        },
      },
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: [
          { label: '本月圖表', action_type: AI_ACTION_TYPE.GENERATE_CHART, action_payload: { preset: 'month_expense_category', metric: 'expense' }, style: 'secondary' },
          { label: '交易搜尋', action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'transaction-search', closeSheet: true }, style: 'ghost' },
          { label: '匯出', action_type: AI_ACTION_TYPE.EXPORT_DATA, action_payload: { preset: 'export_transactions' }, style: 'ghost' },
        ],
      },
    ],
    actions: [
      {
        type: AI_ACTION_TYPE.GENERATE_REPORT,
        payload: {
          metric: 'cashflow',
          group_by: 'day',
          time_range: { from: dayKey, to: dayKey },
        },
        requires_confirm: false,
      },
    ],
  }))
}

async function replyMonthCategoryChart(metric = 'expense') {
  const normalizedMetric = metric === 'income' ? 'income' : 'expense'
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    pushAssistantResponse(buildErrorResponse('目前沒有啟用帳本，無法產生圖表。'))
    return
  }

  const monthKey = monthKeyFromDate(new Date())
  const rows = await listTransactionsByMonth(ledgerId, monthKey).catch(() => [])
  const targetRows = rows.filter((tx) => tx.type === normalizedMetric)
  if (!targetRows.length) {
    pushAssistantResponse(buildAssistantResponse({
      user_message: normalizedMetric === 'income' ? '本月尚無收入資料可繪圖。' : '本月尚無支出資料可繪圖。',
      ui_blocks: [
        {
          kind: AI_BLOCK_KIND.EMPTY_STATE,
          title: '暫無圖表資料',
          content: { text: '先記錄幾筆交易後，我就能產生分類圖表。' },
        },
      ],
    }))
    return
  }

  const grouped = new Map()
  for (const tx of targetRows) {
    const key = String(tx.category_name ?? '').trim() || '未分類'
    grouped.set(key, (grouped.get(key) ?? 0) + (Math.abs(Number(tx.amount_minor ?? 0)) / 100))
  }
  const ranking = Array.from(grouped.entries())
    .map(([name, amountMajor]) => ({ name, amountMajor: Math.round(amountMajor * 100) / 100 }))
    .sort((a, b) => b.amountMajor - a.amountMajor)

  const labels = ranking.slice(0, 8).map((item) => item.name)
  const data = ranking.slice(0, 8).map((item) => item.amountMajor)
  const totalMajor = Math.round(ranking.reduce((sum, item) => sum + item.amountMajor, 0) * 100) / 100
  const unit = normalizeCurrencyCode(targetRows[0]?.account_currency_code, 'TWD')
  const summaryText = `總額 ${formatCurrencyMajor(totalMajor, unit)}，最高為 ${ranking[0]?.name || '-'}.`
  const tableRows = ranking.slice(0, 8).map((item, index) => [
    `${index + 1}`,
    item.name,
    formatCurrencyMajor(item.amountMajor, unit),
  ])

  pushAssistantResponse(buildAssistantResponse({
    user_message: normalizedMetric === 'income' ? '這是本月收入分類圖表。' : '這是本月支出分類圖表。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CHART,
        title: normalizedMetric === 'income' ? '本月收入分類（長條）' : '本月支出分類（長條）',
        content: {
          chart_spec: {
            chart_type: 'bar',
            title: normalizedMetric === 'income' ? '本月收入分類' : '本月支出分類',
            unit,
            labels,
            series: [{ name: normalizedMetric === 'income' ? '收入' : '支出', data }],
            summary: {
              total: totalMajor,
              top_item: ranking[0]?.name || '',
              change_pct: null,
            },
          },
          summary_text: summaryText,
        },
      },
      {
        kind: AI_BLOCK_KIND.TABLE,
        title: '分類排行',
        content: {
          columns: ['#', '分類', '金額'],
          rows: tableRows,
          total_label: '總額',
          total_value: formatCurrencyMajor(totalMajor, unit),
        },
      },
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: [
          {
            label: normalizedMetric === 'income' ? '看支出圖表' : '看收入圖表',
            action_type: AI_ACTION_TYPE.GENERATE_CHART,
            action_payload: { preset: 'month_expense_category', metric: normalizedMetric === 'income' ? 'expense' : 'income' },
            style: 'secondary',
          },
          { label: '列出今天', action_type: AI_ACTION_TYPE.GENERATE_REPORT, action_payload: { preset: 'today_transactions' }, style: 'ghost' },
          { label: '匯出', action_type: AI_ACTION_TYPE.EXPORT_DATA, action_payload: { preset: 'export_transactions' }, style: 'ghost' },
        ],
      },
    ],
    actions: [
      {
        type: AI_ACTION_TYPE.GENERATE_CHART,
        payload: {
          chart_type: 'bar',
          metric: normalizedMetric,
          group_by: 'category',
          time_range: {
            from: `${monthKey}-01`,
            to: `${monthKey}-31`,
          },
          filters: {},
        },
        requires_confirm: false,
      },
    ],
  }))
}

async function replyExportPlan() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    pushAssistantResponse(buildErrorResponse('目前沒有啟用帳本，無法產生匯出預覽。'))
    return
  }
  const monthKey = monthKeyFromDate(new Date())
  const rows = await listTransactionsByMonth(ledgerId, monthKey).catch(() => [])
  const incomeMinor = rows.reduce((sum, tx) => sum + (tx.type === 'income' ? Number(tx.amount_minor ?? 0) : 0), 0)
  const expenseMinor = rows.reduce((sum, tx) => sum + (tx.type === 'expense' ? Number(tx.amount_minor ?? 0) : 0), 0)
  const currency = normalizeCurrencyCode(rows[0]?.account_currency_code, 'TWD')
  const confirmToken = createConfirmToken('export')

  pushAssistantResponse(buildAssistantResponse({
    user_message: '已準備匯出交易資料，先提供預覽讓你確認。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CARD,
        title: '匯出預覽',
        content: {
          items: [
            `期間：${monthKey}`,
            `筆數：${rows.length} 筆`,
            `收入：${formatCurrencyMinor(incomeMinor, currency)}`,
            `支出：${formatCurrencyMinor(expenseMinor, currency)}`,
            '格式：可於下一頁選擇 CSV / Excel / JSON',
          ],
        },
      },
      {
        kind: AI_BLOCK_KIND.CONFIRM,
        title: '確認匯出',
        content: {
          text: '確認後將前往匯出頁，可再調整欄位與格式。',
        },
        actions: [
          { label: '前往匯出', action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'analysis-print', closeSheet: true }, style: 'primary' },
          { label: '取消', action_type: AI_ACTION_TYPE.SHOW_TOAST, action_payload: { message: '已取消匯出' }, style: 'ghost' },
        ],
      },
    ],
    actions: [
      {
        type: AI_ACTION_TYPE.EXPORT_DATA,
        payload: {
          format: 'csv',
          time_range: { from: `${monthKey}-01`, to: `${monthKey}-31` },
        },
        requires_confirm: true,
        confirm_token: confirmToken,
      },
    ],
  }))
}

async function tryHandleAiDialogueCommand(userText) {
  const text = String(userText ?? '').trim()
  if (!text) return false

  if (includesAny(text, [/刪除所有/, /刪除全部/, /清空交易/, /覆蓋匯入/, /覆盖导入/, /delete all/i])) {
    pushAssistantResponse(buildDangerousCommandResponse(text))
    return true
  }
  if (includesAny(text, [/切換手動/, /切到手動/, /回到列表/, /^退出$/, /^離開$/, /^关闭$/, /^關閉$/, /\bmanual\b/i])) {
    pushAssistantResponse(buildExitAiResponse())
    return true
  }
  if (includesAny(text, [/新增分類/, /分類管理/, /category/i])) {
    pushAssistantResponse(buildCategoryHelpResponse())
    return true
  }
  if (includesAny(text, [/列出.*今天/, /今天.*交易/, /today/i])) {
    await replyTodayTransactions()
    return true
  }
  if (includesAny(text, [/(本月|這個月|这个月).*(圖|图|chart|分析)/i, /chart/i, /圖表/, /条图/, /條圖/])) {
    const metric = includesAny(text, [/收入/, /income/i]) ? 'income' : 'expense'
    await replyMonthCategoryChart(metric)
    return true
  }
  if (includesAny(text, [/匯出/, /导出/, /\bexport\b/i, /csv/i, /xlsx/i, /excel/i, /pdf/i, /json/i])) {
    await replyExportPlan()
    return true
  }

  const calcResult = tryResolveSimpleCalculation(text)
  if (calcResult) {
    pushAssistantResponse(buildCalculationResponse(text, calcResult))
    return true
  }

  return false
}

async function handleAiUiAction(action) {
  const actionType = String(action?.action_type ?? '').trim()
  const payload = action?.action_payload ?? {}
  if (!actionType) return

  if (actionType === AI_ACTION_TYPE.SHOW_TOAST) {
    uiStore.pushToast(String(payload?.message ?? '').trim() || '已執行')
    return
  }

  if (actionType === AI_ACTION_TYPE.OPEN_MODAL) {
    if (payload?.target === 'quick_add_manual') {
      const targetType = normalizeType(payload?.type)
      const amountMajor = Number(payload?.amountMajor)
      model.type = targetType
      if (Number.isFinite(amountMajor) && amountMajor > 0) {
        model.amount = amountMajor
        model.amountInput = formatAmountInput(amountMajor)
      }
      const noteText = String(payload?.note ?? '').trim()
      if (noteText) {
        model.note = noteText
      }
      emit('switch-mode', 'manual')
      return
    }
  }

  if (actionType === AI_ACTION_TYPE.NAVIGATE) {
    const closeSheet = payload?.closeSheet !== false
    if (closeSheet) emit('close')
    if (String(payload?.routeName ?? '').trim()) {
      await router.push({
        name: payload.routeName,
        params: payload.params ?? {},
        query: payload.query ?? {},
      }).catch(() => {})
      return
    }
    if (String(payload?.routePath ?? '').trim()) {
      await router.push({
        path: payload.routePath,
        query: payload.query ?? {},
      }).catch(() => {})
    }
    return
  }

  if (actionType === AI_ACTION_TYPE.GENERATE_REPORT) {
    if (payload?.preset === 'today_transactions') {
      await replyTodayTransactions()
    }
    return
  }

  if (actionType === AI_ACTION_TYPE.GENERATE_CHART) {
    const metric = payload?.metric === 'income' ? 'income' : 'expense'
    await replyMonthCategoryChart(metric)
    return
  }

  if (actionType === AI_ACTION_TYPE.EXPORT_DATA) {
    await replyExportPlan()
    return
  }
}

function buildCreateSuccessResponse(createdRecord, draft) {
  const kindLabel = resolveTypeLabel(createdRecord?.type ?? draft?.type)
  const amountMinor = Math.abs(Number(createdRecord?.amountMinor ?? draft?.amountMinor ?? 0))
  const currency = accountCurrencyCode(createdRecord?.accountId ?? draft?.accountId ?? model.accountId)
  const amountText = formatCurrencyMinor(amountMinor, currency)
  const detailItems = [
    `類型：${kindLabel}`,
    `金額：${amountText}`,
    `時間：${formatOccurredAtLabel(createdRecord?.occurredAt ?? draft?.occurredAt ?? new Date().toISOString())}`,
    `帳戶：${accountNameById(createdRecord?.accountId ?? draft?.accountId ?? model.accountId)}`,
  ]
  if ((createdRecord?.type ?? draft?.type) === 'transfer') {
    detailItems.push(`轉入：${accountNameById(createdRecord?.peerAccountId ?? draft?.peerAccountId ?? model.peerAccountId)}`)
  } else {
    detailItems.push(`分類：${categoryNameById(createdRecord?.categoryId ?? draft?.categoryId ?? model.categoryId)}`)
  }

  const ctaActions = []
  if (String(createdRecord?.txId ?? '').trim()) {
    ctaActions.push({
      label: '查看明細',
      action_type: AI_ACTION_TYPE.NAVIGATE,
      action_payload: { routeName: 'transaction-about', params: { id: createdRecord.txId }, closeSheet: true },
      style: 'primary',
    })
  }
  ctaActions.push(
    { label: '再記一筆', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: draft?.type ?? 'expense' }, style: 'secondary' },
    { label: '本月圖表', action_type: AI_ACTION_TYPE.GENERATE_CHART, action_payload: { preset: 'month_expense_category', metric: 'expense' }, style: 'ghost' },
  )

  return buildAssistantResponse({
    user_message: '記帳完成，已建立交易。',
    ui_blocks: [
      {
        kind: AI_BLOCK_KIND.CARD,
        title: '建立成功',
        content: { items: detailItems },
      },
      {
        kind: AI_BLOCK_KIND.CTA_ROW,
        actions: ctaActions,
      },
    ],
    actions: [
      {
        type: AI_ACTION_TYPE.CREATE_TRANSACTION,
        payload: {
          txn_type: draft?.type,
          amount: amountMinor / 100,
          currency,
          datetime: createdRecord?.occurredAt ?? draft?.occurredAt,
          account_id: createdRecord?.accountId ?? draft?.accountId,
          to_account_id: createdRecord?.peerAccountId ?? draft?.peerAccountId,
          category_id: createdRecord?.categoryId ?? draft?.categoryId,
          note: draft?.note ?? '',
        },
        requires_confirm: false,
        undo_hint: String(createdRecord?.txId ?? '').trim()
          ? { type: 'DELETE_TRANSACTION', payload: { tx_id: createdRecord.txId } }
          : null,
      },
    ],
  })
}

async function parseWithAi() {
  if (aiAutoCreating.value) return

  const userText = String(aiInput.value ?? '').trim()
  if (!userText) {
    uiStore.pushToast('請先輸入 AI 記帳內容', 'error')
    return
  }

  aiCreatedRecord.value = null
  pushAiMessage('user', userText)
  warmupRecentHistoryInBackground()

  if (await tryHandleAiDialogueCommand(userText)) {
    aiInput.value = ''
    return
  }

  let result = null
  try {
    result = parseAutoBookkeepingText(userText, {
      accounts: aiParserAccounts.value,
      expenseCategories: categoryStore.expenseCategories,
      incomeCategories: categoryStore.incomeCategories,
      historyTransactions: transactionStore.recent,
      autoFillRules: autoFillRules.value,
      now: new Date(),
    })
  } catch (error) {
    const message = String(error?.message ?? 'AI 解析失敗，請稍後再試')
    pushAssistantResponse(buildErrorResponse(message))
    uiStore.pushToast(message, 'error')
    aiInput.value = ''
    return
  }
  const warnings = resolveAiParserWarnings(result)

  if (!result.draft) {
    const warningText = warnings[0] ?? t('ai_bookkeeping.warning.no_draft', '我沒有抓到可用交易資訊，請再描述一次')
    pushAssistantResponse(buildErrorResponse(warningText))
    uiStore.pushToast(warningText, 'error')
    aiInput.value = ''
    return
  }

  if (
    result.draft.type === 'transfer'
    && (!String(result.draft.accountId ?? '').trim() || !String(result.draft.peerAccountId ?? '').trim())
  ) {
    const warningText = warnings[0] ?? t('ai_bookkeeping.warning.transfer_accounts_insufficient')
    pushAssistantResponse(buildAssistantResponse({
      user_message: warningText,
      ui_blocks: [
        {
          kind: AI_BLOCK_KIND.CONFIRM,
          title: '轉帳資訊不足',
          content: { text: '請確認轉出帳戶與轉入帳戶。' },
          actions: [
            { label: '切換手動轉帳', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: 'transfer' }, style: 'primary' },
          ],
        },
      ],
    }))
    uiStore.pushToast(warningText, 'error')
    aiInput.value = ''
    return
  }

  applyAiDraft(result.draft)
  aiInput.value = ''
  const loanIntent = result.draft.loanIntent ?? null

  if (!loanIntent && result.draft.type !== 'transfer' && !result.draft.categoryId) {
    pushAssistantResponse(buildAssistantResponse({
      user_message: t('ai_bookkeeping.warning.no_category'),
      ui_blocks: [
        {
          kind: AI_BLOCK_KIND.ERROR_STATE,
          title: '缺少分類',
          content: { text: '你可以先到分類管理新增，或切換手動挑選分類。' },
          actions: [
            { label: t('settings.category_management'), action_type: AI_ACTION_TYPE.NAVIGATE, action_payload: { routeName: 'settings-categories', closeSheet: true }, style: 'primary' },
            { label: '切換手動', action_type: AI_ACTION_TYPE.OPEN_MODAL, action_payload: { target: 'quick_add_manual', type: result.draft.type }, style: 'secondary' },
          ],
        },
      ],
    }))
    return
  }

  if (loanIntent && !resolveLoanCounterpartyName(loanIntent)) {
    const warningText = '沒有辨識到借貸對象，請補上名字後再試'
    pushAssistantResponse(buildErrorResponse(warningText))
    uiStore.pushToast(warningText, 'error')
    return
  }

  try {
    assertCanUseAiBookkeeping()
  } catch (error) {
    const message = error.message ?? '免費版 AI 記帳每日最多 5 次'
    pushAssistantResponse(buildErrorResponse(message))
    uiStore.pushToast(message, 'error')
    return
  }

  aiAutoCreating.value = true
  let createdRecord = null
  try {
    createdRecord = await withTimeout(
      loanIntent
        ? submitLoanByAi(result.draft, {
          closeAfterSuccess: false,
          successMessage: 'AI 已自動記錄借貸',
        })
        : submit({
          closeAfterSuccess: false,
          successMessage: 'AI 已自動記錄交易',
        }),
      AI_AUTOCREATE_TIMEOUT_MS,
      'AI 記帳逾時，請稍後再試',
    )
  } catch (error) {
    const message = String(error?.message ?? error ?? '').trim() || 'AI 記帳失敗，請稍後再試'
    pushAssistantResponse(buildErrorResponse(message))
    uiStore.pushToast(message, 'error')
    return
  } finally {
    aiAutoCreating.value = false
  }

  if (!createdRecord) {
    pushAssistantResponse(buildErrorResponse(loanIntent ? '借貸記錄失敗，請重試' : '記帳失敗，請重試'))
    return
  }

  recordAiBookkeepingUsage()
  aiCreatedRecord.value = createdRecord
  pushAssistantResponse(buildCreateSuccessResponse(createdRecord, result.draft))
}

function warmupRecentHistoryInBackground() {
  if (aiHistoryWarmupTask || transactionStore.recent.length) return
  aiHistoryWarmupTask = withTimeout(
    transactionStore.loadRecent(120),
    AI_HISTORY_WARMUP_TIMEOUT_MS,
    'AI 歷史資料預載逾時',
  )
    .catch((error) => {
      console.warn('[quick-add] recent history warmup failed', error)
    })
    .finally(() => {
      aiHistoryWarmupTask = null
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

async function toggleAiVoiceInput() {
  if (aiAutoCreating.value) return
  if (speechListening.value) {
    stopSpeech()
    return
  }

  aiInterimSpeechText.value = ''
  let heardFinal = false
  let lastInterimText = ''
  let finalSegmentsText = ''
  const started = await startSpeech({
    lang: 'zh-TW',
    interimResults: true,
    onResult: ({ finalText, interimText }) => {
      if (finalText) {
        heardFinal = true
        lastInterimText = ''
        finalSegmentsText = `${finalSegmentsText} ${finalText}`.trim()
        aiInput.value = finalSegmentsText
      } else if (interimText) {
        lastInterimText = interimText
        aiInterimSpeechText.value = interimText
      }
    },
    onError: (message) => {
      uiStore.pushToast(message || '語音辨識失敗，請改用手動輸入', 'error')
    },
    onEnd: () => {
      aiInterimSpeechText.value = ''
      if (!heardFinal && lastInterimText) {
        aiInput.value = lastInterimText
      }
      if (!heardFinal && !lastInterimText) return
      void parseWithAi()
    },
  })

  if (!started && !speechLastError.value) {
    uiStore.pushToast('語音啟動失敗，請稍後再試', 'error')
  }
}

function pushAiMessage(role, text, options = {}) {
  const content = String(text ?? '').trim()
  if (!content) return
  const actionKey = String(options?.actionKey ?? '').trim()
  const uiBlocks = Array.isArray(options?.uiBlocks) ? options.uiBlocks : []
  const actions = Array.isArray(options?.actions) ? options.actions : []
  aiMessages.value.push({
    id: `ai-${aiMessageSeq++}`,
    role: role === 'user' ? 'user' : 'assistant',
    text: content,
    actionKey,
    uiBlocks,
    actions,
  })
}

function resolveAiMessageActionLabel(actionKey) {
  if (actionKey === 'open-category-management') {
    return t('settings.category_management')
  }
  return ''
}

function handleAiMessageAction(actionKey) {
  if (actionKey !== 'open-category-management') return
  void handleAiUiAction({
    action_type: AI_ACTION_TYPE.NAVIGATE,
    action_payload: { routeName: 'settings-categories', closeSheet: true },
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

function goEditCreatedTransaction() {
  if (!aiCreatedRecord.value?.canEdit) {
    uiStore.pushToast('目前不支援編輯此類交易')
    return
  }
  const txId = String(aiCreatedRecord.value?.txId ?? '').trim()
  if (!txId) return
  emit('close')
  void router.push({ name: 'transaction-about', params: { id: txId } })
}

function applyAiDraft(draft) {
  const parsedDate = new Date(draft.occurredAt)
  const amountMajor = Math.abs(Number(draft.amountMinor ?? 0)) / 100
  const loanIntent = draft?.loanIntent ?? null

  model.type = draft.type
  if (!Number.isNaN(parsedDate.getTime())) {
    model.occurredDate = formatDateInput(parsedDate)
    model.occurredHour = parsedDate.getHours()
    model.occurredMinute = parsedDate.getMinutes()
  }

  model.amount = Number.isFinite(amountMajor) ? amountMajor : null
  model.amountInput = Number.isFinite(amountMajor) ? formatAmountInput(amountMajor) : ''
  model.accountId = draft.accountId ?? defaultAccountId()
  model.peerAccountId =
    draft.peerAccountId ?? defaultPeerAccountId(model.accountId)

  if (draft.type === 'transfer' || loanIntent) {
    model.categoryId = ''
    model.isReimbursable = false
  } else {
    model.categoryId = draft.categoryId ?? ''
    model.isReimbursable = Boolean(draft.isReimbursable) && draft.type === 'expense'
  }

  model.includeInBudget = Boolean(draft.includeInBudget)
  model.includeInAnalysis = Boolean(draft.includeInAnalysis)
  model.note = String(draft.note ?? '')
  addonRows.value = parseAddonRowsFromAiDraft(draft)
  syncCategoryPickerParent(model.categoryId)
}

function accountNameById(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '未指定'
}

function categoryNameById(categoryId) {
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? '未指定'
}

function syncCategoryPickerParent(preferredCategoryId = '') {
  if (!categoryPickerGroups.value.length) {
    categoryPickerParentId.value = ''
    return
  }

  if (preferredCategoryId) {
    const matchedGroup = categoryPickerGroups.value.find((group) =>
      group.categories.some((category) => category.id === preferredCategoryId),
    )
    if (matchedGroup) {
      categoryPickerParentId.value = matchedGroup.id
      return
    }
  }

  const hasCurrentParent = categoryPickerGroups.value.some((group) => String(group.id) === String(categoryPickerParentId.value))
  if (hasCurrentParent) return
  categoryPickerParentId.value = categoryPickerGroups.value[0]?.id ?? ''
}

function openCategoryPicker() {
  if (!hasVisibleCategories.value) {
    uiStore.pushToast('目前沒有可用分類，請先到設定新增分類', 'error')
    return
  }
  syncCategoryPickerParent(model.categoryId)
  showCategoryPicker.value = true
}

function closeCategoryPicker() {
  showCategoryPicker.value = false
}

function setCategoryPickerParent(groupId) {
  categoryPickerParentId.value = groupId
}

function pickCategory(categoryId) {
  model.categoryId = categoryId
  syncCategoryPickerParent(categoryId)
  showCategoryPicker.value = false
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
    console.warn('[quick-add] load exchange rate snapshot failed', error)
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

async function submit(options = {}) {
  const closeAfterSuccess = options.closeAfterSuccess !== false
  const successMessage = options.successMessage ?? '交易已新增'
  const flowType = resolveTypeByCategory(model.type, model.categoryId)
  const baseAmountMajor = Number(model.amount ?? 0)
  const appliedAddonItems = collectAppliedAddonItems()
  const addonDeltaMajor = appliedAddonItems.reduce((total, item) => {
    return total + (item.direction === 'plus' ? item.deltaMajor : -item.deltaMajor)
  }, 0)
  const baseAmountMinor = Math.round(baseAmountMajor * 100)
  const sourceExtraMinor = Math.round(addonDeltaMajor * 100)
  const settledAmountMajor = round2(baseAmountMajor + addonDeltaMajor)
  const rawAmountMinor = Math.round(settledAmountMajor * 100)
  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  const noteText = mergeAddonItemsToNote(String(model.note ?? ''), appliedAddonItems)

  if (flowType === 'transfer') {
    if (baseAmountMinor <= 0) {
      uiStore.pushToast('請輸入有效金額（主轉帳金額需大於 0）', 'error')
      return
    }
    if (baseAmountMinor + sourceExtraMinor <= 0) {
      uiStore.pushToast('轉出金額（含附加項目）需大於 0', 'error')
      return
    }
  } else if (rawAmountMinor < 0) {
    uiStore.pushToast('請輸入有效金額（含附加項目後不可小於 0）', 'error')
    return
  }
  if (!occurredAt) {
    uiStore.pushToast('請選擇有效時間', 'error')
    return
  }
  if (!model.accountId) {
    uiStore.pushToast('請先選擇帳戶', 'error')
    return
  }
  if (flowType === 'transfer' && !model.peerAccountId) {
    uiStore.pushToast('請先選擇轉入帳戶', 'error')
    return
  }
  if (flowType === 'transfer' && model.accountId === model.peerAccountId) {
    uiStore.pushToast('轉出與轉入帳戶不可相同', 'error')
    return
  }
  if (flowType !== 'transfer' && !model.categoryId) {
    uiStore.pushToast('請先選擇分類', 'error')
    return
  }

  try {
    let txId = ''
    let canEdit = true

    if (flowType === 'expense') {
      txId = await transactionStore.addExpense({
        amountMinor: Math.abs(rawAmountMinor),
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        isReimbursable: model.isReimbursable,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else if (flowType === 'income') {
      txId = await transactionStore.addIncome({
        amountMinor: Math.abs(rawAmountMinor),
        occurredAt,
        accountId: model.accountId,
        categoryId: model.categoryId,
        includeInBudget: model.includeInBudget,
        includeInAnalysis: model.includeInAnalysis,
        note: noteText,
      })
    } else {
      const transferRate = await resolveTransferRateOrThrow()
      const transferToAmountMinor = transferNeedsExchangeRate.value
        ? convertAmountMinorByRate(Math.abs(baseAmountMinor), transferRate)
        : Math.abs(baseAmountMinor)
      if (transferToAmountMinor <= 0) {
        uiStore.pushToast('轉入金額需大於 0，請調整匯率', 'error')
        return null
      }
      const transferResult = await transactionStore.addTransfer({
        amountMinor: Math.abs(baseAmountMinor),
        toAmountMinor: transferToAmountMinor,
        sourceExtraMinor,
        occurredAt,
        fromAccountId: model.accountId,
        toAccountId: model.peerAccountId,
        note: noteText,
      })
      txId = transferResult?.outTxId ?? ''
    }

    uiStore.pushToast(successMessage)
    if (closeAfterSuccess) {
      emit('close')
    }
    return {
      txId,
      canEdit,
      type: flowType,
      amountMinor: Math.abs(rawAmountMinor),
      occurredAt,
      accountId: model.accountId,
      peerAccountId: model.peerAccountId,
      categoryId: model.categoryId,
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增失敗', 'error')
    return null
  }
}

function loanIntentIcon(loanIntent) {
  if (loanIntent?.mode === 'repay') {
    return loanIntent?.direction === 'borrow' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-hand-holding-dollar'
  }
  return loanIntent?.direction === 'borrow' ? 'fa-solid fa-arrow-down' : 'fa-solid fa-arrow-up'
}

async function refreshLinkedDataAfterLoanWrite() {
  await Promise.all([
    transactionStore.loadRecent(),
    accountStore.load(),
    budgetStore.loadMonth(budgetStore.monthKey),
    loanStore.load(),
  ])
}

async function submitLoanByAi(draft, options = {}) {
  const closeAfterSuccess = options.closeAfterSuccess !== false
  const successMessage = options.successMessage ?? 'AI 已自動記錄借貸'
  const loanIntent = draft?.loanIntent ?? null

  if (!loanIntent) {
    uiStore.pushToast('找不到可執行的借貸指令', 'error')
    return null
  }
  if (!model.accountId) {
    uiStore.pushToast('請先選擇帳戶', 'error')
    return null
  }

  const actionLabel = resolveLoanActionLabel(loanIntent)
  const txType = resolveLoanTransactionType(loanIntent)
  const counterpartyName = resolveLoanCounterpartyName(loanIntent)
  const amountMinor = Math.round(Math.abs(Number(draft?.amountMinor ?? 0)))
  const occurredAt = resolveLoanOccurredAtIso(draft?.occurredAt)
  const noteText = String(draft?.note ?? '').trim()

  if (amountMinor <= 0) {
    uiStore.pushToast('請輸入有效金額（需大於 0）', 'error')
    return null
  }

  try {
    if (loanIntent.mode === 'create') {
      if (!counterpartyName) {
        uiStore.pushToast('沒有辨識到借貸對象，請補上名字後再試', 'error')
        return null
      }
      const createdLoan = await loanStore.create({
        direction: loanIntent.direction === 'borrow' ? 'borrow' : 'lend',
        counterpartyName,
        principalMinor: amountMinor,
        interestMinor: 0,
        startDate: formatLoanStartDateTime(occurredAt),
        dueDate: null,
        occurredAt,
        accountId: model.accountId,
        note: noteText,
      })

      await refreshLinkedDataAfterLoanWrite()
      uiStore.pushToast(successMessage)
      if (closeAfterSuccess) {
        emit('close')
      }

      return {
        txId: String(createdLoan?.setup_tx_id ?? ''),
        canEdit: Boolean(createdLoan?.setup_tx_id),
        type: txType,
        amountMinor,
        occurredAt,
        accountId: model.accountId,
        peerAccountId: '',
        categoryId: '',
        title: `${actionLabel}：${counterpartyName}`,
        icon: loanIntentIcon(loanIntent),
        accountText: accountNameById(model.accountId),
      }
    }

    await loanStore.load()
    const matched = pickLoanForAiRepayment(loanStore.items, loanIntent)
    if (!matched.loan) {
      uiStore.pushToast(matched.warning || '找不到可歸還/收回的借貸紀錄', 'error')
      return null
    }
    if (matched.warning) {
      uiStore.pushToast(matched.warning)
    }

    const repaymentResult = await loanStore.repay({
      loanId: matched.loan.id,
      accountId: model.accountId,
      amountMinor,
      note: noteText,
      paidAt: occurredAt,
    })

    await refreshLinkedDataAfterLoanWrite()
    uiStore.pushToast(successMessage)
    if (closeAfterSuccess) {
      emit('close')
    }

    const targetName = String(matched.loan.counterparty_name ?? counterpartyName ?? '').trim() || '未指定對象'
    return {
      txId: String(repaymentResult?.txId ?? ''),
      canEdit: Boolean(repaymentResult?.txId),
      type: txType,
      amountMinor,
      occurredAt,
      accountId: model.accountId,
      peerAccountId: '',
      categoryId: '',
      title: `${actionLabel}：${targetName}`,
      icon: loanIntentIcon(loanIntent),
      accountText: accountNameById(model.accountId),
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? '借貸記錄失敗', 'error')
    return null
  }
}

function handleAmountInput() {
  syncAmountFromInput()
}

function createAddonRow() {
  const defaultTemplate = defaultAddonTemplate()
  return {
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: defaultTemplate.id,
    direction: defaultTemplate.defaultDirection,
    amountMajor: null,
  }
}

function defaultAddonTemplate() {
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

function addonOptionIdByLabel(label) {
  const normalizedLabel = String(label ?? '').trim().toLowerCase()
  if (!normalizedLabel) return defaultAddonTemplate().id
  const exact = addonTemplateItems.value.find((item) => String(item.label ?? '').trim().toLowerCase() === normalizedLabel)
  if (exact) return exact.id
  const fuzzy = addonTemplateItems.value.find((item) => {
    const target = String(item.label ?? '').trim().toLowerCase()
    return target.includes(normalizedLabel) || normalizedLabel.includes(target)
  })
  return fuzzy?.id ?? defaultAddonTemplate().id
}

function addonDirectionByOptionId(optionId) {
  const matched = addonTemplateItems.value.find((item) => String(item.id) === String(optionId))
  if (!matched) return defaultAddonTemplate().defaultDirection === 'minus' ? 'minus' : 'plus'
  return matched.defaultDirection === 'minus' ? 'minus' : 'plus'
}

function parseAddonRowsFromAiDraft(draft) {
  const parsedItems = Array.isArray(draft?.addonItems) ? draft.addonItems : []
  const rows = parsedItems
    .map((item) => {
      const deltaMajor = round2(Math.abs(Number(item?.deltaMajor ?? item?.amountMajor ?? 0)))
      if (!(deltaMajor > 0)) return null
      const optionId = addonOptionIdByLabel(item?.label)
      return {
        id: `addon-${Date.now()}-${addonSeq++}`,
        optionId,
        // Direction should follow addon template default, not parsed text sign.
        direction: addonDirectionByOptionId(optionId),
        amountMajor: deltaMajor,
      }
    })
    .filter(Boolean)

  if (rows.length) return rows
  return [createAddonRow()]
}

async function pressCalcKey(key) {
  if (key === 'C') {
    model.amountInput = ''
    model.amount = null
    return
  }

  if (key === '⌫') {
    model.amountInput = model.amountInput.slice(0, -1)
    syncAmountFromInput()
    return
  }

  if (key === '=') {
    if (!isFormulaExpression(model.amountInput)) {
      await submit()
      return
    }

    const value = evaluateExpression(model.amountInput)
    if (Number.isFinite(value)) {
      model.amount = value
      model.amountInput = formatAmountInput(value)
    }
    return
  }

  if (isOperator(key)) {
    const last = model.amountInput.slice(-1)
    if (!model.amountInput && key !== '-') return
    if (isOperator(last)) {
      model.amountInput = `${model.amountInput.slice(0, -1)}${key}`
    } else {
      model.amountInput += key
    }
  } else {
    model.amountInput += key
  }

  syncAmountFromInput()
}

function syncAmountFromInput() {
  const value = evaluateExpression(model.amountInput)
  model.amount = Number.isFinite(value) ? value : null
}

function isOperator(char) {
  return ['+', '-', '×', '÷', '*', '/'].includes(char)
}

function isFormulaExpression(input) {
  const source = String(input ?? '').trim().replaceAll('×', '*').replaceAll('÷', '/').replace(/\s+/g, '')
  if (!source) return false
  let operatorCount = 0
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (!['+', '-', '*', '/'].includes(ch)) continue
    if (i === 0 && ch === '-') continue
    operatorCount += 1
  }
  return operatorCount > 0
}

function evaluateExpression(input) {
  const source = String(input ?? '').trim()
  if (!source) return null
  if (!/^[0-9+\-×÷*/.\s]+$/.test(source)) return null

  const normalized = source.replaceAll('×', '*').replaceAll('÷', '/').replace(/\s+/g, '')
  const tokens = normalized.match(/(\d+(?:\.\d+)?)|[+\-*/]/g)
  if (!tokens || !tokens.length) return null

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
  if (!Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
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
  const result = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  if (!Number.isFinite(result)) return false
  nums.push(result)
  return true
}

function formatAmountInput(value) {
  const rounded = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(rounded)) return ''
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function formatCurrencyMajor(valueMajor, currencyCode = 'TWD') {
  const major = Number(valueMajor)
  if (!Number.isFinite(major)) return ''
  const safeCurrency = normalizeCurrencyCode(currencyCode, 'TWD')
  const minor = Math.round(Math.abs(major) * 100)
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(major))
}

function formatCurrencyMinor(valueMinor, currencyCode = 'TWD') {
  const minor = Math.abs(Math.round(Number(valueMinor) || 0))
  return formatCurrencyMajor(minor / 100, currencyCode)
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function defaultOccurredDateTime() {
  const currentMonth = monthKeyFromDate(new Date())
  if (budgetStore.monthKey && budgetStore.monthKey !== currentMonth) {
    return { date: `${budgetStore.monthKey}-01`, hour: 12, minute: 0 }
  }
  const now = new Date()
  return {
    date: formatDateInput(now),
    hour: now.getHours(),
    minute: now.getMinutes(),
  }
}

function toOccurredAtIso(dateInput, hourInput, minuteInput) {
  if (!dateInput) return ''
  const hour = Number(hourInput)
  const minute = Number(minuteInput)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ''
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''

  const dateTime = `${dateInput}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  const parsed = new Date(dateTime)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

function formatOccurredAtLabel(occurredAt) {
  const parsed = new Date(occurredAt)
  if (Number.isNaN(parsed.getTime())) return '-'
  const hour = String(parsed.getHours()).padStart(2, '0')
  const minute = String(parsed.getMinutes()).padStart(2, '0')
  return `${formatDateInput(parsed)} ${hour}:${minute}`
}

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKeyFromDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function defaultAccountId() {
  return directAccountOptions.value[0]?.id ?? ''
}

function defaultPeerAccountId(baseAccountId = '') {
  const accounts = transferAccountOptions.value
  const fallback = baseAccountId || accounts[0]?.id || ''
  return accounts.find((item) => item.id !== fallback)?.id ?? fallback
}

function ensureValidAccounts() {
  const accounts = model.type === 'transfer' ? transferAccountOptions.value : directAccountOptions.value
  if (!accounts.length) {
    model.accountId = ''
    model.peerAccountId = ''
    return
  }

  const hasAccount = accounts.some((item) => item.id === model.accountId)
  if (!hasAccount) {
    model.accountId = accounts[0]?.id ?? ''
  }

  if (model.type === 'transfer') {
    const hasPeer = accounts.some((item) => item.id === model.peerAccountId)
    if (!hasPeer || model.peerAccountId === model.accountId) {
      model.peerAccountId = defaultPeerAccountId(model.accountId)
    }
  }
}

function ensureCategoryIdByType(type, currentCategoryId = '') {
  if (type === 'transfer') return ''
  const categories = type === 'income' ? categoryStore.incomeCategories : categoryStore.expenseCategories
  if (!categories.length) return ''
  if (categories.some((item) => item.id === currentCategoryId)) {
    return currentCategoryId
  }
  return categories[0]?.id ?? ''
}

function resolveTypeByCategory(fallbackType, categoryId) {
  if (fallbackType !== 'expense' && fallbackType !== 'income') return fallbackType
  if (!categoryId) return fallbackType
  const kind = categoryStore.categories.find((item) => item.id === categoryId)?.kind
  if (kind === 'income') return 'income'
  if (kind === 'expense') return 'expense'
  return fallbackType
}

function normalizeType(value) {
  if (value === 'income' || value === 'transfer') return value
  return 'expense'
}

</script>

<style scoped>.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70;
}
.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
  animation: slide-in 180ms ease;
}
.sheet.ai-mode {
  min-height: min(86dvh, 740px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}
h3 {
  margin: 0;
}
.type-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.form-wrap {
  margin-top: 12px;
}
.ai-chat {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: 10px;
}
.chat-list {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  display: grid;
  align-content: start;
  gap: 8px;
}
.chat-message {
  max-width: 88%;
  border-radius: 14px;
  padding: 10px 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  display: grid;
  gap: 8px;
}
.chat-text {
  margin: 0;
}
.chat-message.assistant {
  justify-self: start;
  background: var(--surface-soft-accent);
  color: var(--text-soft);
  border: 1px solid color-mix(in srgb, var(--field-border) 80%, var(--primary) 20%);
}
.chat-message.user {
  justify-self: end;
  background: var(--surface-ok);
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--ok) 55%, var(--field-border) 45%);
}
.chat-action-btn {
  width: fit-content;
}
.ai-block-list {
  display: grid;
  gap: 8px;
}
.ai-ui-block {
  border: 1px solid color-mix(in srgb, var(--field-border) 84%, var(--primary) 16%);
  background: color-mix(in srgb, var(--card) 86%, var(--bg) 14%);
  border-radius: 10px;
  padding: 8px;
  display: grid;
  gap: 8px;
}
.ai-ui-block.kind-confirm,
.ai-ui-block.kind-error_state {
  border-color: color-mix(in srgb, var(--danger) 36%, var(--field-border) 64%);
}
.ai-ui-block-head {
  display: grid;
  gap: 2px;
}
.ai-card-list {
  display: grid;
  gap: 4px;
}
.ai-table-wrap {
  display: grid;
  gap: 6px;
}
.ai-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ai-table th,
.ai-table td {
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--field-border) 78%, transparent 22%);
  padding: 4px 0;
}
.ai-table-total {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.ai-chart-wrap {
  display: grid;
  gap: 6px;
}
.ai-chart-bars {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.ai-chart-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.6fr auto;
  gap: 6px;
  align-items: center;
}
.ai-chart-label {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-chart-track {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 85%, var(--bg) 15%);
  overflow: hidden;
}
.ai-chart-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 68%, var(--ok) 32%) 100%);
}
.ai-chart-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.ai-chart-summary {
  margin: 0;
}
.ai-block-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ai-result {
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--field-border));
  background: var(--surface-soft-accent);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 10px;
}
.ai-tx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--field-border) 85%, var(--primary) 15%);
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--card) 88%, var(--bg) 12%);
}
.ai-tx-item.clickable {
  cursor: pointer;
}
.ai-tx-icon-wrap {
  width: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ai-tx-icon {
  font-size: 17px;
  color: var(--primary-soft);
}
.ai-tx-main {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}
.ai-tx-title {
  font-size: 15px;
  line-height: 1.2;
}
.ai-tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  text-align: right;
}
.ai-edit-link {
  justify-self: start;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.ai-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.ai-input {
  min-height: 72px;
  resize: none;
}
.ai-action-col {
  display: grid;
  gap: 8px;
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
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.field-block {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.field-label {
  font-size: 13px;
  color: var(--muted);
}
.calc-panel {
  margin-top: -2px;
  margin-bottom: 10px;
}
.calc-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.calc-key {
  padding: 12px 0;
  font-size: 16px;
  font-weight: 700;
}
.calc-key.equal {
  grid-column: 3 / span 2;
  background: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 70%, black);
  color: var(--primary-contrast);
}
.inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.fx-panel {
  border: 1px solid var(--field-border);
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fx-note {
  margin: 0;
}
.category-trigger {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
}
.category-icon {
  width: 14px;
  color: var(--primary-soft);
}
.category-trigger.placeholder {
  color: var(--muted);
}
.category-trigger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.category-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-arrow {
  font-size: 15px;
  line-height: 1;
  opacity: 0.8;
}
.date-extra-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin-top: 8px;
}
.impact-wrap {
  display: grid;
  gap: 6px;
}
.switch-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.switch-row {
  border: 1px solid var(--field-border);
  border-radius: 16px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--surface-soft-accent) 76%, var(--card) 24%), color-mix(in srgb, var(--surface-muted) 82%, var(--card) 18%));
  color: var(--text-soft);
  padding: 12px 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--shadow-color, #000) 8%, transparent);
  will-change: transform;
  transition:
    transform 120ms ease-out,
    border-color 120ms ease-out,
    box-shadow 120ms ease-out;
}
.switch-row:hover {
  transform: translate3d(0, -1px, 0);
  border-color: color-mix(in srgb, var(--primary) 26%, var(--field-border) 74%);
  box-shadow: 0 14px 30px color-mix(in srgb, var(--shadow-color, #000) 12%, transparent);
}
.switch-copy {
  display: grid;
  gap: 4px;
  text-align: left;
}
.switch-title {
  color: var(--text);
  font-size: 0.96rem;
  line-height: 1.2;
}
.switch-hint {
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.35;
  font-weight: 500;
}
.switch-track {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--surface-muted);
  padding: 2px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  margin-top: 2px;
  transition: background-color 120ms ease-out;
}
.switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--surface-highlight);
  transform: translate3d(0, 0, 0);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--shadow-color, #000) 18%, transparent);
  will-change: transform;
  transition: transform 160ms cubic-bezier(.22, .8, .28, 1), background-color 120ms ease-out;
}
.switch-row.active {
  border-color: color-mix(in srgb, var(--ok) 64%, var(--primary) 36%);
  background: linear-gradient(135deg, color-mix(in srgb, var(--ok) 18%, var(--bg) 82%), color-mix(in srgb, var(--primary) 20%, var(--card) 80%));
  color: var(--text);
  box-shadow: 0 16px 32px color-mix(in srgb, var(--ok) 14%, transparent);
}
.switch-row.active .switch-hint {
  color: color-mix(in srgb, var(--text) 70%, var(--muted) 30%);
}
.switch-row.active .switch-track {
  background: var(--surface-ok-strong);
}
.switch-row.active .switch-thumb {
  transform: translate3d(20px, 0, 0);
  background: color-mix(in srgb, white 78%, var(--surface-highlight) 22%);
}
.extra-btn {
  white-space: nowrap;
  min-height: 42px;
  align-self: end;
  justify-content: center;
}
.extra-btn.active {
  border-color: color-mix(in srgb, var(--ok) 64%, var(--primary) 36%);
  background: linear-gradient(120deg, color-mix(in srgb, var(--ok) 35%, var(--bg) 65%), color-mix(in srgb, var(--ok) 55%, var(--card) 45%));
  color: var(--text);
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
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
  animation: extra-slide-up 180ms ease;
}
.category-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-strong);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 90;
}
.category-sheet {
  width: min(900px, 100vw);
  height: 100dvh;
  border-radius: 0;
  padding: calc(10px + var(--status-bar-height)) 12px calc(12px + var(--navigation-bar-height));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}
.category-overlay-enter-active, .category-overlay-leave-active {
  transition: opacity var(--anim-mid) ease;
}
.category-overlay-enter-from, .category-overlay-leave-to {
  opacity: 0;
}
.category-overlay-enter-active .category-sheet, .category-overlay-leave-active .category-sheet {
  transition:
    opacity var(--anim-mid) ease,
    transform var(--anim-mid) var(--anim-spring);
}
.category-overlay-enter-from .category-sheet, .category-overlay-leave-to .category-sheet {
  opacity: 0;
  transform: translateY(56px);
}
.category-head h4 {
  font-size: 17px;
}
.category-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(124px, 42%) minmax(0, 1fr);
  gap: 10px;
}
.category-pane {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface-popover);
  padding: 6px;
  overflow: auto;
}
.parent-pane, .child-pane {
  display: grid;
  align-content: start;
  gap: 6px;
}
.category-item {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 10px 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.category-item.active {
  background: color-mix(in srgb, var(--primary) 26%, transparent);
  color: var(--primary-soft);
  font-weight: 700;
}
.category-item-icon {
  width: 14px;
  color: inherit;
}
.category-empty {
  margin: 10px 2px 0;
  color: var(--muted);
  font-size: 13px;
}
.category-tip {
  margin: 0 2px;
  color: var(--muted);
  font-size: 12px;
}
h4 {
  margin: 0;
  font-size: 16px;
}
.extra-content {
  margin-top: 10px;
}
.addon-wrap {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.addon-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: end;
  min-width: 420px;
  overflow-x: auto;
}
.addon-name {
  flex: 1 1 0;
  min-width: 0;
}
.addon-dir {
  flex: 0 0 74px;
  min-width: 0;
}
.addon-amount {
  flex: 0 0 96px;
  min-width: 0;
}
.addon-remove {
  flex: 0 0 68px;
  padding: 10px 0;
  white-space: nowrap;
}
.addon-desc {
  color: var(--muted);
}
@keyframes extra-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes slide-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}</style>
