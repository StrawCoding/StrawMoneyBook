<template>
  <section class="stack">
    <article class="card panel summary">
      <header class="row">
        <h2>報銷統整</h2>
        <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
      </header>
      <div class="row">
        <span class="muted">未報銷金額</span>
        <MoneyText :value-minor="reimbursementStore.pendingTotalMinor" />
      </div>
      <div class="row">
        <span class="muted">已報銷金額</span>
        <MoneyText :value-minor="reimbursementStore.reimbursedTotalMinor" />
      </div>
      <div class="row">
        <span class="muted">代收可抵金額</span>
        <MoneyText :value-minor="reimbursementStore.availableAdvanceTotalMinor" />
      </div>
      <div class="row summary-action-row">
        <button class="btn" @click="openAdvanceSheet">新增代收</button>
      </div>
    </article>

    <article class="card panel">
      <div class="tab-row">
        <button class="btn" :class="{ primary: tab === 'pending' }" @click="tab = 'pending'">未報銷</button>
        <button class="btn" :class="{ primary: tab === 'reimbursed' }" @click="tab = 'reimbursed'">已報銷</button>
      </div>

      <div class="row export-row">
        <small class="muted">已選 {{ selectedActiveCount }} / {{ activeList.length }} 筆</small>
        <button class="btn" @click="openActionSheet">操作</button>
      </div>
      <p v-if="exportedFilename" class="muted file-note">檔案：{{ exportedFilename }}</p>
      <p v-if="exportedLocation" class="muted file-note">位置：{{ exportedLocation }}</p>
      <div v-if="exportedUrl" class="row export-open-row">
        <button class="btn" @click="openExportLink">{{ exportedActionLabel }}</button>
      </div>

      <ul class="list">
        <li v-for="tx in activeList" :key="tx.id" class="entry">
          <label class="entry-select" :aria-label="`選取交易 ${tx.id}`">
            <input v-model="selectedByTab[tab]" type="checkbox" :value="tx.id" />
            <span class="entry-select-mark">
              <font-awesome-icon icon="fa-solid fa-check" />
            </span>
          </label>

          <div
            class="entry-body"
            role="button"
            tabindex="0"
            @click="openTransactionAbout(tx)"
            @keydown.enter.prevent="openTransactionAbout(tx)"
            @keydown.space.prevent="openTransactionAbout(tx)"
          >
            <div class="row entry-head">
              <div class="entry-category">
                <span class="tx-icon-col">
                  <font-awesome-icon v-if="categoryIconOfTx(tx)" :icon="categoryIconOfTx(tx)" class="tx-icon" />
                </span>
                <strong class="entry-name">{{ tx.category_name || noteTextOfTx(tx) || '未命名分類' }}</strong>
              </div>
              <MoneyText :value-minor="originalMinorOfTx(tx)" />
            </div>
            <div class="row muted">
              <span>{{ formatTime(tx.occurred_at) }}</span>
              <span>{{ noteTextOfTx(tx) || '-' }}</span>
            </div>
          </div>
        </li>

        <li v-if="!activeList.length" class="muted">目前此分頁沒有資料</li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isActionSheetOpen" class="sheet-mask" @click.self="closeActionSheet">
          <article class="sheet card action-sheet">
            <header class="row">
              <h3>批量操作</h3>
              <button class="btn" @click="closeActionSheet">關閉</button>
            </header>
            <small class="muted action-hint">可操作 {{ activeList.length }} 筆，已選 {{ selectedActiveCount }} 筆</small>
            <div class="stack action-list">
              <button class="btn action-btn" :disabled="!activeList.length" @click="actionToggleSelectAll">
                {{ isAllActiveSelected ? '取消全選' : '全選' }}
              </button>
              <div v-if="tab === 'pending'" class="action-pair-row">
                <button
                  class="btn action-btn income-action"
                  :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                  @click="actionOpenBatchSettle"
                >
                  <span>批量標記報銷</span>
                </button>
                <button
                  class="btn danger action-btn"
                  :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                  @click="actionMarkVoidSelected"
                >
                  <font-awesome-icon icon="fa-solid fa-ban" />
                  <span>{{ voidingBatch ? '批量作廢中...' : '批量作廢' }}</span>
                </button>
              </div>
              <button
                v-else
                class="btn action-btn"
                :disabled="selectedActiveCount !== 1 || settlingBatch || voidingBatch"
                @click="actionOpenSelectedAdjustment"
              >
                調整
              </button>
              <button
                v-if="tab !== 'pending'"
                class="btn danger action-btn"
                :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                @click="actionMarkVoidSelected"
              >
                <font-awesome-icon icon="fa-solid fa-ban" />
                <span>{{ voidingBatch ? '批量作廢中...' : '批量作廢' }}</span>
              </button>
              <button class="btn primary action-btn" :disabled="!canExportClaimSheet" @click="actionExportClaimSheet">
                匯出請款單
              </button>
              <button v-if="exportedUrl" class="btn action-btn" @click="actionOpenExportLink">{{ exportedActionLabel }}</button>
              <div class="action-pair-row">
                <button class="btn action-btn" :disabled="!selectedActiveCount" @click="actionClearSelection">清除選取</button>
                <button class="btn action-btn" @click="closeActionSheet">取消</button>
              </div>
            </div>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isSettleOpen" class="sheet-mask" @click.self="closeSettle">
          <article class="sheet card">
            <header class="row">
              <h3>{{ settleMode === 'batch' ? `批量報銷設定（${batchSettleItems.length} 筆）` : '報銷完成設定' }}</h3>
              <button class="btn" @click="closeSettle">關閉</button>
            </header>

            <div class="stack form-wrap">
              <label v-if="settleMode === 'single'">
                報銷金額（元）
                <input v-model.number="settleForm.amountMajor" type="number" min="0" step="1" class="input" />
              </label>
              <div v-if="settleMode === 'single'" class="copy-wrap">
                <p class="copy-title">代收抵扣（可複選）</p>
                <div v-if="usableSingleAdvances.length" class="copy-ledger-list">
                  <label v-for="advance in usableSingleAdvances" :key="advance.id" class="copy-ledger-item">
                    <input v-model="settleForm.selectedAdvanceIds" class="copy-ledger-check" type="checkbox" :value="advance.id" />
                    <span class="copy-ledger-mark">✓</span>
                    <span class="copy-ledger-name">
                      <span class="advance-meta-line">
                        <font-awesome-icon
                          v-if="advanceCategoryIcon(advance)"
                          :icon="advanceCategoryIcon(advance)"
                          class="advance-category-icon"
                        />
                        <span>{{ advanceCategoryName(advance) }}</span>
                      </span>
                      <small class="muted copy-ledger-meta">
                        {{ advance.account_name || '未指定帳戶' }}
                      </small>
                      <small class="muted copy-ledger-meta">
                        <MoneyText :value-minor="advance.available_minor" />
                      </small>
                    </span>
                  </label>
                </div>
                <p v-else class="muted">目前沒有可用代收</p>
                <div v-if="selectedAdvanceCapacityMinor > 0" class="row advance-summary-row">
                  <span>本次代收抵扣</span>
                  <MoneyText :value-minor="selectedAdvanceCapacityMinor" />
                </div>
                <p v-if="singleSettleCashMinor <= 0" class="muted">本次將全額以代收抵扣，不再建立新的入帳交易。</p>
              </div>
              <div v-else class="batch-settle-summary">
                <small class="muted">將以每筆「剩餘未報銷金額」入帳</small>
                <div class="row">
                  <span>合計待入帳</span>
                  <MoneyText :value-minor="batchSettlePendingMinor" />
                </div>
              </div>

              <label v-if="settleMode === 'batch' || singleSettleCashMinor > 0">
                入帳帳戶
                <CustomSelect v-model="settleForm.accountId" :options="accountStore.accounts" />
              </label>
              <div class="copy-wrap">
                <p class="copy-title">同步複製到其他帳本（可複選）</p>
                <div v-if="copyLedgerOptions.length" class="copy-ledger-list">
                  <label v-for="ledger in copyLedgerOptions" :key="ledger.id" class="copy-ledger-item">
                    <input v-model="settleForm.copyToLedgerIds" class="copy-ledger-check" type="checkbox" :value="ledger.id" />
                    <span class="copy-ledger-mark">✓</span>
                    <span class="copy-ledger-name">{{ ledger.name }}</span>
                  </label>
                </div>
                <p v-else class="muted">目前沒有其他帳本可選</p>
              </div>
            </div>

            <footer class="row">
              <button class="btn" @click="closeSettle">取消</button>
              <button class="btn primary" :disabled="settlingBatch" @click="confirmSettle">
                {{ settlingBatch ? '處理中...' : '確認' }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isAdvanceOpen" class="sheet-mask" @click.self="closeAdvanceSheet">
          <article class="sheet card">
            <header class="row">
              <h3>新增代收</h3>
              <button class="btn" @click="closeAdvanceSheet">關閉</button>
            </header>

            <div class="stack form-wrap">
              <label>
                代收金額（元）
                <input v-model.number="advanceForm.amountMajor" type="number" min="0" step="1" class="input" />
              </label>
              <label>
                代收分類
                <CustomSelect v-model="advanceForm.categoryId" :options="advanceCategoryOptions" />
              </label>
              <div v-if="selectedAdvanceCategory" class="row advance-category-preview">
                <span class="muted">代收分類預覽</span>
                <span class="advance-preview-value">
                  <font-awesome-icon
                    v-if="selectedAdvanceCategory.icon"
                    :icon="selectedAdvanceCategory.icon"
                    class="advance-category-icon"
                  />
                  <span>{{ selectedAdvanceCategory.name }}</span>
                </span>
              </div>
              <label>
                代收帳戶
                <CustomSelect v-model="advanceForm.accountId" :options="accountStore.accounts" />
              </label>
              <label>
                備註
                <input v-model="advanceForm.note" type="text" class="input" placeholder="例如：公司先墊付報銷款" />
              </label>
            </div>

            <footer class="row">
              <button class="btn" @click="closeAdvanceSheet">取消</button>
              <button class="btn primary" :disabled="creatingAdvance || !canCreateAdvance" @click="submitAdvance">
                {{ creatingAdvance ? '建立中...' : '確認新增' }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { isFreeTier } from '@/core/services/membership.service'
import { useI18n } from '@/ui/services/i18n.service'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon } from '@/ui/utils/system-transaction-presenter'
import {
  reimbursementOriginalMinor,
  reimbursementPendingMinor,
  reimbursementReimbursedMinor,
} from '@/ui/utils/reimbursement-item'
import {
  createCsvBlobUrl,
  openFileUrl,
  revokeBlobUrl,
  saveCsvFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'

const reimbursementStore = useReimbursementStore()
const transactionStore = useTransactionStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const tab = ref(route.query.tab === 'reimbursed' ? 'reimbursed' : 'pending')
const isSettleOpen = ref(false)
const isActionSheetOpen = ref(false)
const isAdvanceOpen = ref(false)
const settleMode = ref('single')
const settleTargetTx = ref(null)
const settlingBatch = ref(false)
const voidingBatch = ref(false)
const creatingAdvance = ref(false)
const exportedUrl = ref('')
const exportedFilename = ref('')
const exportedLocation = ref('')
const exportedIsDeviceLink = ref(false)
const settleForm = reactive({
  amountMajor: 0,
  accountId: '',
  copyToLedgerIds: [],
  selectedAdvanceIds: [],
})
const advanceForm = reactive({
  amountMajor: 0,
  categoryId: '',
  accountId: '',
  note: '',
})
const selectedByTab = reactive({
  pending: [],
  reimbursed: [],
})

const activeList = computed(() => {
  return tab.value === 'pending' ? reimbursementStore.pendingItems : reimbursementStore.reimbursedItems
})
const selectedActiveIds = computed(() => selectedByTab[tab.value] ?? [])
const selectedActiveSet = computed(() => new Set(selectedActiveIds.value.map((id) => String(id ?? '').trim()).filter(Boolean)))
const selectedActiveCount = computed(() => selectedActiveIds.value.length)
const isAllActiveSelected = computed(() => {
  if (!activeList.value.length) return false
  return activeList.value.every((tx) => selectedActiveSet.value.has(String(tx.id)))
})
const selectedActiveItems = computed(() => {
  if (!selectedActiveSet.value.size) return []
  return activeList.value.filter((tx) => selectedActiveSet.value.has(String(tx.id)))
})
const batchSettleItems = computed(() => {
  if (tab.value !== 'pending') return []
  return selectedActiveItems.value
})
const batchSettlePendingMinor = computed(() => {
  return batchSettleItems.value.reduce((total, tx) => total + pendingMinorOfTx(tx), 0)
})
const selectedAdvanceIdSet = computed(() => {
  return new Set((settleForm.selectedAdvanceIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
})
const usableSingleAdvances = computed(() => {
  if (settleMode.value !== 'single') return []
  if (tab.value === 'pending') {
    return reimbursementStore.availableAdvances
  }
  return reimbursementStore.advances.filter((item) => {
    const availableMinor = Number(item.available_minor ?? 0)
    return availableMinor > 0 || selectedAdvanceIdSet.value.has(String(item.id))
  })
})
const singleSettleAmountMinor = computed(() => {
  return Math.max(0, Math.round(Number(settleForm.amountMajor ?? 0) * 100))
})
const selectedAdvanceCapacityMinor = computed(() => {
  if (settleMode.value !== 'single') return 0
  const advanceMap = new Map(usableSingleAdvances.value.map((item) => [String(item?.id ?? '').trim(), item]))
  let remainingMinor = singleSettleAmountMinor.value
  let totalMinor = 0

  for (const rawAdvanceId of settleForm.selectedAdvanceIds ?? []) {
    const advanceId = String(rawAdvanceId ?? '').trim()
    if (!advanceId || remainingMinor <= 0) continue
    const advance = advanceMap.get(advanceId)
    if (!advance) continue
    const availableMinor = Math.max(0, Math.round(Number(advance.available_minor ?? 0)))
    if (availableMinor <= 0) continue
    const appliedMinor = Math.min(availableMinor, remainingMinor)
    totalMinor += appliedMinor
    remainingMinor -= appliedMinor
  }

  return totalMinor
})
const singleSettleCashMinor = computed(() => {
  if (settleMode.value !== 'single') return 0
  return Math.max(0, singleSettleAmountMinor.value - selectedAdvanceCapacityMinor.value)
})
const canCreateAdvance = computed(() => {
  return Number.isFinite(Number(advanceForm.amountMajor))
    && Number(advanceForm.amountMajor) > 0
    && Boolean(String(advanceForm.categoryId ?? '').trim())
    && Boolean(String(advanceForm.accountId ?? '').trim())
})
const advanceCategoryOptions = computed(() => categoryStore.expenseCategories ?? [])
const selectedAdvanceCategory = computed(() => {
  const categoryId = String(advanceForm.categoryId ?? '').trim()
  if (!categoryId) return null
  return (categoryStore.categories ?? []).find((item) => String(item?.id ?? '').trim() === categoryId) ?? null
})
const categoryIconById = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories ?? []) {
    const id = String(category?.id ?? '').trim()
    const icon = String(category?.icon ?? '').trim()
    if (id && icon) map.set(id, icon)
  }
  return map
})
const exportTargetItems = computed(() => {
  if (selectedActiveItems.value.length) return selectedActiveItems.value
  if (tab.value === 'pending') return activeList.value
  return []
})
const canExportClaimSheet = computed(() => exportTargetItems.value.length > 0)
const exportedActionLabel = computed(() => (exportedIsDeviceLink.value ? '開啟檔案' : '再次下載'))
const copyLedgerOptions = computed(() => {
  if (isFreeTier()) return []
  return (ledgerStore.ledgers ?? []).filter((item) => item.id !== ledgerStore.activeLedgerId)
})

onMounted(() => {
  Promise.all([
    reimbursementStore.load(),
    categoryStore.load(),
    accountStore.load(),
  ]).then(() => {
    pruneSelectedIds()
  })
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

watch(
  () => [
    reimbursementStore.pendingItems.map((item) => String(item.id)).join(','),
    reimbursementStore.reimbursedItems.map((item) => String(item.id)).join(','),
  ],
  () => {
    pruneSelectedIds()
  },
)

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function categoryIconOfTx(tx) {
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx?.category_icon ?? '').trim()
  if (directIcon) return directIcon
  if (tx.type === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  if (tx.origin_type === 'reimbursement') return 'fa-solid fa-receipt'
  const byIdIcon = categoryIconById.value.get(String(tx?.category_id ?? '').trim())
  if (byIdIcon) return byIdIcon

  const categoryName = String(tx?.category_name ?? '').trim()
  if (categoryName) {
    const matched = (categoryStore.categories ?? []).find((item) => String(item?.name ?? '').trim() === categoryName)
    const fallbackIcon = String(matched?.icon ?? '').trim()
    if (fallbackIcon) return fallbackIcon
  }

  return ''
}

function openTransactionAbout(tx) {
  if (!tx?.id) return
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}

function advanceCategoryName(advance) {
  const name = String(advance?.category_name ?? '').trim()
  return name || '未指定分類'
}

function advanceCategoryIcon(advance) {
  return String(advance?.category_icon ?? '').trim()
}

function openActionSheet() {
  isActionSheetOpen.value = true
}

function closeActionSheet() {
  isActionSheetOpen.value = false
}

function openAdvanceSheet() {
  advanceForm.amountMajor = 0
  advanceForm.categoryId = String(categoryStore.expenseCategories[0]?.id ?? '')
  advanceForm.accountId = String(accountStore.accounts[0]?.id ?? '')
  advanceForm.note = ''
  isAdvanceOpen.value = true
}

function closeAdvanceSheet() {
  if (creatingAdvance.value) return
  isAdvanceOpen.value = false
}

async function submitAdvance() {
  if (!canCreateAdvance.value || creatingAdvance.value) return

  creatingAdvance.value = true
  try {
    await reimbursementStore.createAdvance({
      amountMinor: Math.round(Number(advanceForm.amountMajor ?? 0) * 100),
      categoryId: advanceForm.categoryId,
      accountId: advanceForm.accountId,
      note: advanceForm.note,
      receivedAt: new Date().toISOString(),
    })
    await accountStore.load()
    isAdvanceOpen.value = false
    uiStore.pushToast('代收已新增')
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增失敗', 'error')
  } finally {
    creatingAdvance.value = false
  }
}

function openSingleSettle(tx) {
  if (!tx?.id) return
  settleMode.value = 'single'
  settleTargetTx.value = tx
  settleForm.amountMajor = pendingMinorOfTx(tx) / 100
  settleForm.accountId = String(accountStore.accounts[0]?.id ?? tx.account_id ?? '')
  settleForm.copyToLedgerIds = []
  settleForm.selectedAdvanceIds = []
  isSettleOpen.value = true
}

function openReimbursementEdit(tx) {
  if (!tx?.id) return
  void router.push({ name: 'reimbursement-edit', params: { id: tx.id } })
}

function actionToggleSelectAll() {
  toggleSelectAllActive()
  closeActionSheet()
}

function actionClearSelection() {
  clearActiveSelection()
  closeActionSheet()
}

function actionOpenBatchSettle() {
  closeActionSheet()
  openBatchSettle()
}

function actionOpenSelectedAdjustment() {
  if (tab.value === 'pending') return
  if (selectedActiveItems.value.length !== 1) {
    uiStore.pushToast('請先勾選 1 筆要調整的項目', 'error')
    return
  }

  const target = selectedActiveItems.value[0]
  closeActionSheet()
  openReimbursementEdit(target)
}

async function actionMarkVoidSelected() {
  closeActionSheet()
  await markVoidSelected()
}

async function actionExportClaimSheet() {
  closeActionSheet()
  await exportClaimSheet()
}

function actionOpenExportLink() {
  closeActionSheet()
  openExportLink()
}

function openBatchSettle() {
  if (tab.value !== 'pending') return
  if (!batchSettleItems.value.length) {
    uiStore.pushToast('請先勾選要批量報銷的項目', 'error')
    return
  }

  settleMode.value = 'batch'
  settleTargetTx.value = null
  settleForm.amountMajor = 0
  settleForm.accountId = String(accountStore.accounts[0]?.id ?? '')
  settleForm.copyToLedgerIds = []
  settleForm.selectedAdvanceIds = []
  isSettleOpen.value = true
}

function closeSettle() {
  isSettleOpen.value = false
  settleMode.value = 'single'
  settleTargetTx.value = null
  settlingBatch.value = false
  settleForm.copyToLedgerIds = []
  settleForm.selectedAdvanceIds = []
}

function pruneSelectedIds() {
  const pendingSet = new Set(reimbursementStore.pendingItems.map((item) => String(item.id)))
  const reimbursedSet = new Set(reimbursementStore.reimbursedItems.map((item) => String(item.id)))
  selectedByTab.pending = selectedByTab.pending.filter((id) => pendingSet.has(String(id)))
  selectedByTab.reimbursed = selectedByTab.reimbursed.filter((id) => reimbursedSet.has(String(id)))
}

function toggleSelectAllActive() {
  if (!activeList.value.length) return
  if (isAllActiveSelected.value) {
    clearActiveSelection()
    return
  }
  selectedByTab[tab.value] = activeList.value.map((tx) => String(tx.id))
}

function clearActiveSelection() {
  selectedByTab[tab.value] = []
}

function toCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function rowsToCsv(rows, headers) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvValue(row[header])).join(','))
  }
  return lines.join('\r\n')
}

function toAmountMajorText(amountMinor) {
  const major = Math.abs(Math.round(Number(amountMinor) || 0)) / 100
  return major.toFixed(2)
}

function toDateText(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timestampForFilename(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hour}${minute}${second}`
}

function claimMinorOfTx(tx) {
  const pendingMinor = pendingMinorOfTx(tx)
  if (tab.value === 'pending') return pendingMinor
  const originalMinor = originalMinorOfTx(tx)
  const reimbursedMinor = reimbursedMinorOfTx(tx)
  return reimbursedMinor > 0 ? reimbursedMinor : originalMinor
}

function pendingMinorOfTx(tx) {
  return reimbursementPendingMinor(tx)
}

function originalMinorOfTx(tx) {
  return reimbursementOriginalMinor(tx)
}

function reimbursedMinorOfTx(tx) {
  return reimbursementReimbursedMinor(tx)
}

function noteTextOfTx(tx) {
  const fromDerived = String(tx?.note_plain ?? '').trim()
  if (fromDerived) return fromDerived
  return stripAddonSummaryFromNote(tx?.note)
}

async function exportClaimSheet() {
  const rowsSource = exportTargetItems.value
  if (!rowsSource.length) {
    uiStore.pushToast('沒有可匯出的請款資料', 'error')
    return
  }

  const statusLabel = tab.value === 'pending' ? '未報銷' : '已報銷'
  const rows = rowsSource.map((tx) => {
    const amountMinor = originalMinorOfTx(tx)
    const reimbursedMinor = reimbursedMinorOfTx(tx)
    const claimMinor = claimMinorOfTx(tx)
    return {
      狀態: statusLabel,
      交易日期: toDateText(tx.occurred_at),
      分類: tx.category_name || '',
      備註: noteTextOfTx(tx),
      原始支出: toAmountMajorText(amountMinor),
      已報銷: toAmountMajorText(reimbursedMinor),
      本次請款: toAmountMajorText(claimMinor),
    }
  })

  const totalAmountMinor = rowsSource.reduce((sum, tx) => sum + originalMinorOfTx(tx), 0)
  const totalReimbursedMinor = rowsSource.reduce((sum, tx) => sum + reimbursedMinorOfTx(tx), 0)
  const totalClaimMinor = rowsSource.reduce((sum, tx) => sum + claimMinorOfTx(tx), 0)
  rows.push({
    狀態: '合計',
    交易日期: '',
    分類: '',
    備註: '',
    原始支出: toAmountMajorText(totalAmountMinor),
    已報銷: toAmountMajorText(totalReimbursedMinor),
    本次請款: toAmountMajorText(totalClaimMinor),
  })

  const headers = ['狀態', '交易日期', '分類', '備註', '原始支出', '已報銷', '本次請款']
  const csvText = rowsToCsv(rows, headers)
  const filename = `請款單_${statusLabel}_${timestampForFilename()}.csv`
  exportedFilename.value = filename
  let exportLocation = '瀏覽器下載'

  if (Capacitor.isNativePlatform()) {
    const saved = await saveCsvFileToDevice(filename, csvText)
    if (saved?.saved) {
      exportedFilename.value = String(saved.filename ?? filename)
      exportLocation = saved.location || '裝置檔案'
      revokeBlobUrl(exportedUrl.value)
      if (saved.openUrl) {
        exportedUrl.value = saved.openUrl
        exportedIsDeviceLink.value = true
      } else {
        exportedUrl.value = createCsvBlobUrl(csvText)
        exportedIsDeviceLink.value = false
      }
      exportedLocation.value = exportLocation
      uiStore.pushToast(`請款單已匯出（${rowsSource.length} 筆，${exportLocation}）`)
      if (exportedIsDeviceLink.value) {
        openExportLink()
      }
      return
    } else {
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = createCsvBlobUrl(csvText)
      exportedIsDeviceLink.value = false
      exportedLocation.value = ''
      triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
      uiStore.pushToast(`請款單已匯出（${rowsSource.length} 筆，${exportLocation}）`)
      return
    }
  }

  revokeBlobUrl(exportedUrl.value)
  exportedUrl.value = createCsvBlobUrl(csvText)
  exportedIsDeviceLink.value = false
  exportedLocation.value = ''
  triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  uiStore.pushToast(`請款單已匯出（${rowsSource.length} 筆，${exportLocation}）`)
}

function openExportLink() {
  if (!exportedUrl.value) return
  if (exportedIsDeviceLink.value) {
    const opened = openFileUrl(exportedUrl.value)
    if (!opened && exportedFilename.value) {
      triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
    }
    return
  }
  if (!exportedFilename.value) return
  triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
}

async function confirmSettle() {
  if (settleMode.value === 'batch') {
    await confirmBatchSettle()
    return
  }
  await confirmSingleSettle()
}

async function confirmSingleSettle() {
  if (!settleTargetTx.value?.id) return
  if (singleSettleAmountMinor.value <= 0) {
    uiStore.pushToast('報銷金額必須大於 0', 'error')
    return
  }
  if (singleSettleCashMinor.value > 0 && !String(settleForm.accountId ?? '').trim()) {
    uiStore.pushToast('請選擇入帳帳戶', 'error')
    return
  }

  try {
    const result = await reimbursementStore.settle(settleTargetTx.value.id, {
      amountMinor: singleSettleAmountMinor.value,
      accountId: singleSettleCashMinor.value > 0 ? settleForm.accountId : '',
      occurredAt: new Date().toISOString(),
      note: `報銷入帳（來源交易：${settleTargetTx.value.id}）`,
      copyToLedgerIds: settleForm.copyToLedgerIds,
      selectedAdvanceIds: settleForm.selectedAdvanceIds,
      allowUpdate: tab.value === 'reimbursed',
    })
    await Promise.all([transactionStore.loadRecent(), accountStore.load()])
    const copiedInfo = Number(result?.copiedLedgers ?? 0) > 0 ? `，並複製到 ${result.copiedLedgers} 個帳本` : ''
    const advanceInfo = Number(result?.usedAdvanceMinor ?? 0) > 0 ? '，已套用代收抵扣' : ''
    if (result?.updatedIncome) {
      uiStore.pushToast(`已更新報銷入帳${advanceInfo}${copiedInfo}`)
    } else if (result?.alreadyExists) {
      uiStore.pushToast(`已標記為報銷，且已有入帳交易${advanceInfo}${copiedInfo}`)
    } else {
      uiStore.pushToast(`已標記報銷並完成入帳${advanceInfo}${copiedInfo}`)
    }
    pruneSelectedIds()
    closeSettle()
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新失敗', 'error')
  }
}

async function confirmBatchSettle() {
  if (settlingBatch.value) return
  const targets = batchSettleItems.value
  if (!targets.length) {
    uiStore.pushToast('請先勾選要批量報銷的項目', 'error')
    return
  }
  if (!String(settleForm.accountId ?? '').trim()) {
    uiStore.pushToast('請選擇入帳帳戶', 'error')
    return
  }

  settlingBatch.value = true
  let success = 0
  let failed = 0
  let skipped = 0
  const errorMessages = []
  const occurredAt = new Date().toISOString()

  try {
    for (const tx of targets) {
      const pendingMinor = pendingMinorOfTx(tx)
      if (pendingMinor <= 0) {
        skipped += 1
        continue
      }
      try {
        await reimbursementStore.settle(tx.id, {
          amountMinor: pendingMinor,
          accountId: settleForm.accountId,
          occurredAt,
          note: `報銷入帳（來源交易：${tx.id}）`,
          copyToLedgerIds: settleForm.copyToLedgerIds,
          allowUpdate: false,
        }, {
          skipReload: true,
        })
        success += 1
      } catch (error) {
        failed += 1
        if (errorMessages.length < 3) {
          errorMessages.push(String(error?.message ?? error ?? '未知錯誤'))
        }
      }
    }

    await Promise.all([reimbursementStore.load(), transactionStore.loadRecent(), accountStore.load()])
    pruneSelectedIds()
    closeSettle()

    const summaryParts = [`批量報銷完成：成功 ${success} 筆`]
    if (failed > 0) summaryParts.push(`失敗 ${failed} 筆`)
    if (skipped > 0) summaryParts.push(`略過 ${skipped} 筆`)
    const summary = summaryParts.join('，')
    if (failed > 0 && errorMessages.length) {
      uiStore.pushToast(`${summary}（${errorMessages.join('；')}）`, 'error')
    } else {
      uiStore.pushToast(summary)
    }
  } finally {
    settlingBatch.value = false
  }
}

async function markVoidSelected() {
  if (voidingBatch.value) return
  const targets = selectedActiveItems.value
  if (!targets.length) {
    uiStore.pushToast('請先勾選要作廢的項目', 'error')
    return
  }

  const ok = window.confirm(`確定要批量作廢 ${targets.length} 筆報銷交易？`)
  if (!ok) return

  voidingBatch.value = true
  try {
    const result = await transactionStore.deleteTransactionsBatch(targets.map((tx) => tx.id))
    await reimbursementStore.load()
    pruneSelectedIds()

    const failedCount = Number(result?.failed?.length ?? 0)
    if (failedCount > 0) {
      const firstError = String(result.failed?.[0]?.message ?? '部分交易作廢失敗')
      uiStore.pushToast(`批量作廢完成：成功 ${result.deleted} 筆，失敗 ${failedCount} 筆（${firstError}）`, 'error')
      return
    }
    uiStore.pushToast(`已批量作廢 ${result.deleted} 筆報銷交易`)
  } catch (error) {
    uiStore.pushToast(error.message ?? '批量作廢失敗', 'error')
  } finally {
    voidingBatch.value = false
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
  revokeBlobUrl(exportedUrl.value)
})

watch(tab, () => {
  closeActionSheet()
})

function onRequestCloseOverlay(event) {
  if (isAdvanceOpen.value) {
    closeAdvanceSheet()
    event.preventDefault()
    return
  }
  if (isSettleOpen.value) {
    closeSettle()
    event.preventDefault()
    return
  }
  if (isActionSheetOpen.value) {
    closeActionSheet()
    event.preventDefault()
  }
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0
}
.tab-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px
}
.export-row {
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap
}
.file-note {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  word-break: break-word
}
.export-open-row {
  margin-top: 8px;
  justify-content: flex-start
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.summary-action-row {
  justify-content: flex-end;
  margin-top: 6px
}
.entry {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center
}
.entry-body {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
  cursor: pointer;
  transition: border-color var(--anim-fast) ease, box-shadow var(--anim-fast) ease
}
.entry-body:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 24%, transparent)
}
.entry-head {
  align-items: center;
  gap: 8px
}
.entry-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end
}
.entry-action-btn {
  min-width: 72px
}
.entry-category {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1
}
.tx-icon-col {
  height: 22px;
  width: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0
}
.tx-icon {
  font-size: 22px;
  margin-top: 1px;
  color: var(--primary-soft);
  flex-shrink: 0
}
.entry-name {
  min-width: 0
}
.entry-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-top: 0;
  cursor: pointer;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent
}
.entry-select input {
  position: absolute;
  opacity: 0;
  pointer-events: none
}
.entry-select:focus,
.entry-select:focus-visible,
.entry-select:active {
  outline: none;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent
}
.entry-select-mark {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--field-border);
  background: color-mix(in srgb, var(--card) 92%, transparent);
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: border-color var(--anim-fast) ease, background-color var(--anim-fast) ease, color var(--anim-fast) ease
}
.entry-select:has(input:checked) .entry-select-mark {
  background: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 70%, black 30%);
  color: var(--primary-contrast)
}
.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70
}
.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
.action-sheet {
  width: min(560px, 100vw)
}
.action-hint {
  margin-top: 8px
}
.action-list {
  margin-top: 12px;
  gap: 8px
}
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: flex-start
}
.btn.income-action {
  background: var(--home-income-card-bg);
  border-color: var(--home-income-card-border);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--home-income-card-border) 38%, transparent);
  color: var(--home-income-card-value);
  font-weight: 700;
}
.action-pair-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.form-wrap {
  margin-top: 12px
}
.batch-settle-summary {
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px
}
.advance-summary-row {
  align-items: center
}
.copy-wrap {
  display: grid;
  gap: 8px
}
.copy-title {
  margin: 0;
  font-size: 13px;
  color: var(--muted)
}
.copy-ledger-list {
  display: grid;
  gap: 8px;
  max-height: 128px;
  overflow: auto;
  padding-right: 2px
}
.copy-ledger-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  padding: 10px 12px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  cursor: pointer;
  transition: border-color var(--anim-fast) ease, background-color var(--anim-fast) ease, box-shadow var(--anim-fast) ease
}
.copy-ledger-item:has(.copy-ledger-check:checked) {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--field-border) 45%);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 24%, transparent) inset;
}
.copy-ledger-check {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.copy-ledger-mark {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--field-border);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.copy-ledger-item:has(.copy-ledger-check:checked) .copy-ledger-mark {
  background: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 70%, black 30%);
  color: var(--primary-contrast);
}
.copy-ledger-name {
  display: grid;
  gap: 2px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.copy-ledger-meta {
  white-space: normal
}
.advance-meta-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.advance-category-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.advance-category-preview {
  align-items: center;
}
.advance-preview-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sheet label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
