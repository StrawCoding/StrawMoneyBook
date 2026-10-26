<template>
  <HabitatPageShell
    :title="t('reimbursement.list_title')"
    :kicker="t('reimbursement.habitat_hello')"
    test-id="reimbursement-list-view"
    back-to="/features"
  >

    <section class="habitat-flow-section summary">
      <div class="row">
        <span class="muted">{{ t('reimbursement.unsettled_amount') }}</span>
        <MoneyText :value-minor="reimbursementStore.pendingTotalMinor" />
      </div>
      <div class="row">
        <span class="muted">{{ t('reimbursement.settled_amount') }}</span>
        <MoneyText :value-minor="reimbursementStore.reimbursedTotalMinor" />
      </div>
      <div class="row">
        <span class="muted">{{ t('reimbursement.advance_available') }}</span>
        <MoneyText :value-minor="reimbursementStore.availableAdvanceTotalMinor" />
      </div>
      <div class="row summary-action-row">
        <RouterLink class="btn" :to="{ name: 'reimbursement-advance-manage' }">{{ t('reimbursement.manage_advances') }}</RouterLink>
        <RouterLink class="btn" :to="{ name: 'reimbursement-advance-usage-manage' }">{{ t('reimbursement.offset_records') }}</RouterLink>
        <button class="btn" @click="openAdvanceSheet">{{ t('reimbursement.add_advance') }}</button>
      </div>
    </section>

    <section class="habitat-flow-section">
      <div class="segment-pills tab-row">
        <button class="btn" :class="{ primary: tab === 'pending' }" @click="tab = 'pending'">{{ t('assets_page.unreimbursed') }}</button>
        <button class="btn" :class="{ primary: tab === 'reimbursed' }" @click="tab = 'reimbursed'">{{ t('reimbursement.already_reimbursed') }}</button>
      </div>

      <div class="row export-row">
        <small class="muted">{{ t('common.selected_of_total', { count: selectedActiveCount, total: activeList.length }) }}</small>
        <button class="btn" @click="openActionSheet">{{ t('common.actions') }}</button>
      </div>
      <p v-if="exportedFilename" class="muted file-note">{{ t('common.file_prefix') }}{{ exportedFilename }}</p>
      <p v-if="exportedLocation" class="muted file-note">{{ t('common.location_prefix') }}{{ exportedLocation }}</p>
      <div v-if="exportedUrl" class="row export-open-row">
        <button class="btn" @click="openExportLink">{{ exportedActionLabel }}</button>
      </div>

      <TransitionGroup name="motion-list" tag="ul" class="list">
        <li v-for="tx in activeList" :key="tx.id" class="entry">
          <label class="entry-select" :aria-label="t('reimbursement.select_tx', { id: tx.id })">
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
                <strong class="entry-name">{{ tx.category_name || noteTextOfTx(tx) || t('common.unnamed_category') }}</strong>
              </div>
              <MoneyText :value-minor="originalMinorOfTx(tx)" />
            </div>
            <div class="row muted">
              <span>{{ formatTime(tx.occurred_at) }}</span>
              <span>{{ noteTextOfTx(tx) || '-' }}</span>
            </div>
            <div v-if="hasAdvanceOffset(tx)" class="row offset-row">
              <small class="offset-pill">
                {{ t('reimbursement.advance_offset') }} <MoneyText :value-minor="tx.advance_used_minor" />
              </small>
              <button class="btn" @click.stop="openOffsetAbout(tx)">{{ t('reimbursement.offset_detail') }}</button>
            </div>
            <div v-if="hasCustomClaimAmount(tx)" class="row claim-row">
              <small class="claim-pill">
                {{ t('reimbursement.amount') }} <MoneyText :value-minor="claimableMinorOfTx(tx)" />
              </small>
            </div>
          </div>

          <div class="entry-actions">
            <button
              v-if="tab === 'pending'"
              class="btn entry-action-btn"
              @click.stop="openClaimAmountSheet(tx)"
            >
              {{ t('reimbursement.amount') }}
            </button>
            <button
              v-if="tab === 'pending'"
              class="btn entry-action-btn"
              @click.stop="openSingleSettle(tx)"
            >
              {{ t('feature_list.reimbursements') }}
            </button>
            <button
              v-else
              class="btn entry-action-btn"
              @click.stop="openReimbursementEdit(tx)"
            >
              {{ t('reimbursement.adjust') }}
            </button>
          </div>
        </li>
      </TransitionGroup>
      <p v-if="!activeList.length" class="muted list-empty-note">{{ t('reimbursement.empty_tab') }}</p>
    </section>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isActionSheetOpen" class="sheet-mask" @click.self="closeActionSheet">
          <article class="sheet card action-sheet app-bottom-sheet">
            <header class="row">
              <h3>{{ t('common.batch_actions') }}</h3>
              <button class="btn" @click="closeActionSheet">{{ t('common.close') }}</button>
            </header>
            <small class="muted action-hint">{{ t('reimbursement.operable_selected', { total: activeList.length, count: selectedActiveCount }) }}</small>
            <div class="stack action-list app-bottom-sheet-body">
              <button class="btn action-btn" :disabled="!activeList.length" @click="actionToggleSelectAll">
                {{ isAllActiveSelected ? t('claim_sheet.import.clear_all') : t('claim_sheet.import.select_all') }}
              </button>
              <div v-if="tab === 'pending'" class="action-pair-row">
                <button
                  class="btn action-btn income-action"
                  :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                  @click="actionOpenBatchSettle"
                >
                  <span>{{ t('reimbursement.batch_mark') }}</span>
                </button>
                <button
                  class="btn danger action-btn"
                  :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                  @click="actionMarkVoidSelected"
                >
                  <font-awesome-icon icon="fa-solid fa-ban" />
                  <span>{{ voidingBatch ? t('reimbursement.batch_voiding') : t('reimbursement.batch_void') }}</span>
                </button>
              </div>
              <button
                v-else
                class="btn action-btn"
                :disabled="selectedActiveCount !== 1 || settlingBatch || voidingBatch"
                @click="actionOpenSelectedAdjustment"
              >
                {{ t('reimbursement.adjust') }}
              </button>
              <button
                v-if="tab !== 'pending'"
                class="btn danger action-btn"
                :disabled="!selectedActiveCount || settlingBatch || voidingBatch"
                @click="actionMarkVoidSelected"
              >
                <font-awesome-icon icon="fa-solid fa-ban" />
                <span>{{ voidingBatch ? t('reimbursement.batch_voiding') : t('reimbursement.batch_void') }}</span>
              </button>
              <div class="action-pair-row">
                <button class="btn primary action-btn" :disabled="!canExportClaimSheet" @click="actionExportClaimSheetCsv">
                  {{ t('analysis_print.export_csv') }}
                </button>
              </div>
              <button v-if="exportedUrl" class="btn action-btn" @click="actionOpenExportLink">{{ exportedActionLabel }}</button>
              <div class="action-pair-row">
                <button class="btn action-btn" :disabled="!selectedActiveCount" @click="actionClearSelection">{{ t('settings_bank_sync.review.select_none') }}</button>
                <button class="btn action-btn" @click="closeActionSheet">{{ t('common.cancel') }}</button>
              </div>
            </div>
          </article>
        </section>
      </transition>
    </teleport>

    <InputBottomSheet
      :open="isSettleOpen"
      :title="settleMode === 'batch' ? t('reimbursement.batch_settle_title', { count: batchSettleItems.length }) : t('reimbursement.settle_title')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeSettle"
    >
              <label v-if="settleMode === 'single'">
                {{ t('reimbursement.amount_yuan') }}
                <input v-model.number="settleForm.amountMajor" type="number" min="0" step="1" class="input" />
              </label>
              <div v-if="settleMode === 'single'" class="copy-wrap">
                <p class="copy-title">{{ t('reimbursement.advance_multi') }}</p>
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
                        {{ advance.account_name || t('common.unknown_account') }}
                      </small>
                      <small class="muted copy-ledger-meta">
                        <MoneyText :value-minor="advance.available_minor" />
                      </small>
                    </span>
                  </label>
                </div>
                <p v-else class="muted">{{ t('reimbursement.no_advance') }}</p>
                <div v-if="selectedAdvanceCapacityMinor > 0" class="row advance-summary-row">
                  <span>{{ t('reimbursement.this_advance_offset') }}</span>
                  <MoneyText :value-minor="selectedAdvanceCapacityMinor" />
                </div>
                <p class="muted">{{ t('reimbursement.advance_cross_account_hint') }}</p>
                <p v-if="singleSettleCashMinor <= 0" class="muted">{{ t('reimbursement.full_advance_hint') }}</p>
              </div>
              <div v-else class="batch-settle-summary">
                <small class="muted">{{ t('reimbursement.remain_hint') }}</small>
                <div class="row">
                  <span>{{ t('reimbursement.pending_in') }}</span>
                  <MoneyText :value-minor="batchSettlePendingMinor" />
                </div>
              </div>

              <label v-if="settleMode === 'batch' || singleSettleCashMinor > 0">
                {{ t('claim_sheet.form.account') }}
                <CustomSelect v-model="settleForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>
              <div class="copy-wrap">
                <p class="copy-title">{{ t('reimbursement.copy_other_ledgers') }}</p>
                <div v-if="copyLedgerOptions.length" class="copy-ledger-list">
                  <label v-for="ledger in copyLedgerOptions" :key="ledger.id" class="copy-ledger-item">
                    <input v-model="settleForm.copyToLedgerIds" class="copy-ledger-check" type="checkbox" :value="ledger.id" />
                    <span class="copy-ledger-mark">✓</span>
                    <span class="copy-ledger-name">{{ ledger.name }}</span>
                  </label>
                </div>
                <p v-else class="muted">{{ t('reimbursement.no_other_ledger') }}</p>
              </div>
      <template #footer>
        <button class="btn" @click="closeSettle">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="settlingBatch" @click="confirmSettle">
          {{ settlingBatch ? t('common.processing') : t('common.confirm') }}
        </button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isAdvanceOpen"
      :title="t('reimbursement.add_advance')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeAdvanceSheet"
    >
              <label>
                {{ t('reimbursement.advance_amount_yuan') }}
                <input v-model.number="advanceForm.amountMajor" type="number" min="0" step="1" class="input" />
              </label>
              <label>
                {{ t('reimbursement.advance_account') }}
                <CustomSelect v-model="advanceForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>
              <label>
                {{ t('common.note') }}
                <input v-model="advanceForm.note" type="text" class="input" :placeholder="t('reimbursement.advance_note_example')" />
              </label>
      <template #footer>
        <button class="btn" @click="closeAdvanceSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="creatingAdvance || !canCreateAdvance" @click="submitAdvance">
          {{ creatingAdvance ? t('claim_sheet.creating') : t('common.confirm_add') }}
        </button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isClaimAmountOpen"
      :title="t('reimbursement.set_amount')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeClaimAmountSheet"
    >
      <p v-if="claimAmountTargetTx" class="muted claim-hint">
        {{ t('reimbursement.original_out') }} <MoneyText :value-minor="originalMinorOfTx(claimAmountTargetTx)" />{{ t('reimbursement.custom_claim_hint') }}
      </p>
      <label>
        {{ t('reimbursement.amount_yuan') }}
        <input v-model.number="claimAmountForm.amountMajor" type="number" min="0" step="1" class="input" />
      </label>
      <button class="btn claim-reset-btn" type="button" @click="useOriginalClaimAmount">
        {{ t('reimbursement.reset_original') }}
      </button>
      <template #footer>
        <button class="btn" :disabled="savingClaimAmount" @click="closeClaimAmountSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="savingClaimAmount" @click="confirmClaimAmount">
          {{ savingClaimAmount ? t('settings_account.saving') : t('common.confirm') }}
        </button>
      </template>
    </InputBottomSheet>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, TransitionGroup, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { isFreeTier } from '@/core/services/membership.service'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon } from '@/ui/utils/system-transaction-presenter'
import {
  reimbursementClaimableMinor,
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
const isClaimAmountOpen = ref(false)
const savingClaimAmount = ref(false)
const claimAmountTargetTx = ref(null)
const claimAmountForm = reactive({
  amountMajor: 0,
})
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
    && Boolean(String(advanceForm.accountId ?? '').trim())
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
const exportedActionLabel = computed(() => t('analysis_print.open_link'))
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
  return new Date(iso).toLocaleString(resolveIntlLocale(), {
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

function openOffsetAbout(tx) {
  if (!tx?.id) return
  void router.push({
    name: 'reimbursement-offset-about',
    params: { id: tx.id },
    query: { tab: tab.value },
  })
}

function advanceCategoryName(advance) {
  const name = String(advance?.category_name ?? '').trim()
  if (name) return name
  const note = String(advance?.note ?? '').trim()
  return note || t('reimbursement_advance_usage.default_advance_name')
}

function advanceCategoryIcon(advance) {
  return String(advance?.category_icon ?? '').trim()
}

function hasAdvanceOffset(tx) {
  return Math.max(0, Math.round(Number(tx?.advance_used_minor ?? 0))) > 0
}

function openActionSheet() {
  isActionSheetOpen.value = true
}

function closeActionSheet() {
  isActionSheetOpen.value = false
}

function openAdvanceSheet() {
  advanceForm.amountMajor = 0
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
      accountId: advanceForm.accountId,
      note: advanceForm.note,
      receivedAt: new Date().toISOString(),
    })
    await accountStore.load()
    isAdvanceOpen.value = false
    uiStore.pushToast(t('reimbursement.advance_created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('quick_add.toast.create_failed'), 'error')
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
    uiStore.pushToast(t('reimbursement.pick_one_adjust'), 'error')
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

async function actionExportClaimSheetCsv() {
  closeActionSheet()
  await exportClaimSheetCsv()
}

function actionOpenExportLink() {
  closeActionSheet()
  openExportLink()
}

function openBatchSettle() {
  if (tab.value !== 'pending') return
  if (!batchSettleItems.value.length) {
    uiStore.pushToast(t('reimbursement.pick_batch'), 'error')
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

function claimableMinorOfTx(tx) {
  return reimbursementClaimableMinor(tx)
}

function hasCustomClaimAmount(tx) {
  const raw = tx?.reimburse_target_minor
  if (raw === null || raw === undefined || raw === '') return false
  return Math.round(Number(raw)) !== originalMinorOfTx(tx)
}

function openClaimAmountSheet(tx) {
  if (!tx?.id) return
  claimAmountTargetTx.value = tx
  claimAmountForm.amountMajor = claimableMinorOfTx(tx) / 100
  isClaimAmountOpen.value = true
}

function closeClaimAmountSheet() {
  if (savingClaimAmount.value) return
  isClaimAmountOpen.value = false
  claimAmountTargetTx.value = null
}

function useOriginalClaimAmount() {
  if (!claimAmountTargetTx.value) return
  claimAmountForm.amountMajor = originalMinorOfTx(claimAmountTargetTx.value) / 100
}

async function confirmClaimAmount() {
  const target = claimAmountTargetTx.value
  if (!target?.id || savingClaimAmount.value) return

  const amountMinor = Math.max(0, Math.round(Number(claimAmountForm.amountMajor ?? 0) * 100))
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    uiStore.pushToast(t('reimbursement.amount_gt_zero'), 'error')
    return
  }

  savingClaimAmount.value = true
  try {
    // Storing the original amount means "use original" -> reset to null so future
    // edits to the original expense keep tracking it.
    const targetMinor = amountMinor === originalMinorOfTx(target) ? null : amountMinor
    await reimbursementStore.setClaimAmount(target.id, targetMinor)
    pruneSelectedIds()
    uiStore.pushToast(t('reimbursement.amount_updated'))
    isClaimAmountOpen.value = false
    claimAmountTargetTx.value = null
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.update_failed'), 'error')
  } finally {
    savingClaimAmount.value = false
  }
}

function reimbursedMinorOfTx(tx) {
  return reimbursementReimbursedMinor(tx)
}

function noteTextOfTx(tx) {
  const fromDerived = String(tx?.note_plain ?? '').trim()
  if (fromDerived) return fromDerived
  return stripAddonSummaryFromNote(tx?.note)
}

function buildClaimSheetExportPayload() {
  const rowsSource = exportTargetItems.value
  if (!rowsSource.length) {
    return null
  }

  const statusLabel = tab.value === 'pending' ? t('assets_page.unreimbursed') : t('reimbursement.already_reimbursed')
  const headerStatus = t('claim_sheet.status_label')
  const headerDate = t('reimbursement.tx_date')
  const headerCategory = t('common.category')
  const headerNote = t('common.note')
  const headerOriginal = t('reimbursement.original_out')
  const headerAmount = t('reimbursement.amount')
  const headerReimbursed = t('reimbursement.already_reimbursed')
  const headerClaim = t('reimbursement.this_claim')
  const rows = rowsSource.map((tx) => {
    const amountMinor = originalMinorOfTx(tx)
    const claimableMinor = claimableMinorOfTx(tx)
    const reimbursedMinor = reimbursedMinorOfTx(tx)
    const claimMinor = claimMinorOfTx(tx)
    return {
      [headerStatus]: statusLabel,
      [headerDate]: toDateText(tx.occurred_at),
      [headerCategory]: tx.category_name || '',
      [headerNote]: noteTextOfTx(tx),
      [headerOriginal]: toAmountMajorText(amountMinor),
      [headerAmount]: toAmountMajorText(claimableMinor),
      [headerReimbursed]: toAmountMajorText(reimbursedMinor),
      [headerClaim]: toAmountMajorText(claimMinor),
    }
  })

  const totalAmountMinor = rowsSource.reduce((sum, tx) => sum + originalMinorOfTx(tx), 0)
  const totalClaimableMinor = rowsSource.reduce((sum, tx) => sum + claimableMinorOfTx(tx), 0)
  const totalReimbursedMinor = rowsSource.reduce((sum, tx) => sum + reimbursedMinorOfTx(tx), 0)
  const totalClaimMinor = rowsSource.reduce((sum, tx) => sum + claimMinorOfTx(tx), 0)
  rows.push({
    [headerStatus]: t('claim_sheet.export_total'),
    [headerDate]: '',
    [headerCategory]: '',
    [headerNote]: '',
    [headerOriginal]: toAmountMajorText(totalAmountMinor),
    [headerAmount]: toAmountMajorText(totalClaimableMinor),
    [headerReimbursed]: toAmountMajorText(totalReimbursedMinor),
    [headerClaim]: toAmountMajorText(totalClaimMinor),
  })

  const headers = [headerStatus, headerDate, headerCategory, headerNote, headerOriginal, headerAmount, headerReimbursed, headerClaim]
  const csvText = rowsToCsv(rows, headers)
  return {
    rowsSource,
    statusLabel,
    rows,
    headers,
    csvText,
    csvFilename: `${t('claim_sheet.title')}_${statusLabel}_${timestampForFilename()}.csv`,
  }
}

async function exportClaimSheetCsv() {
  const payload = buildClaimSheetExportPayload()
  if (!payload) {
    uiStore.pushToast(t('reimbursement.export_empty'), 'error')
    return
  }

  const { rowsSource, csvText, csvFilename } = payload
  const filename = csvFilename
  exportedFilename.value = filename
  let exportLocation = Capacitor.isNativePlatform() ? t('reimbursement.in_app_preview') : t('reimbursement.browser_download')

  if (Capacitor.isNativePlatform()) {
    const saved = await saveCsvFileToDevice(filename, csvText, { category: 'reimbursements' })
    if (saved?.saved) {
      exportedFilename.value = String(saved.filename ?? filename)
      exportLocation = saved.location || t('claim_sheet.device_files')
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = String(saved.uri ?? '').trim()
        || String(saved.openUrl ?? '').trim()
        || createCsvBlobUrl(csvText)
      exportedIsDeviceLink.value = Boolean(String(saved.uri ?? '').trim() || String(saved.openUrl ?? '').trim())
      exportedLocation.value = exportLocation
      uiStore.pushToast(t('reimbursement.exported', { count: rowsSource.length, location: exportLocation }))
      return
    } else {
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = createCsvBlobUrl(csvText)
      exportedIsDeviceLink.value = false
      exportedLocation.value = exportLocation
      openExportLink()
      uiStore.pushToast(t('reimbursement.exported', { count: rowsSource.length, location: exportLocation }))
      return
    }
  }

  revokeBlobUrl(exportedUrl.value)
  exportedUrl.value = createCsvBlobUrl(csvText)
  exportedIsDeviceLink.value = false
  exportedLocation.value = ''
  openExportLink()
  uiStore.pushToast(t('reimbursement.exported', { count: rowsSource.length, location: exportLocation }))
}

function openExportLink() {
  if (!exportedUrl.value) return
  const opened = openFileUrl(exportedUrl.value)
  if (!opened && exportedFilename.value) {
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  }
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
    uiStore.pushToast(t('reimbursement.amount_gt_zero'), 'error')
    return
  }
  if (singleSettleCashMinor.value > 0 && !String(settleForm.accountId ?? '').trim()) {
    uiStore.pushToast(t('reimbursement.pick_settle_account'), 'error')
    return
  }

  try {
    const result = await reimbursementStore.settle(settleTargetTx.value.id, {
      amountMinor: singleSettleAmountMinor.value,
      accountId: singleSettleCashMinor.value > 0 ? settleForm.accountId : '',
      occurredAt: new Date().toISOString(),
      note: t('reimbursement.settle_note', { id: settleTargetTx.value.id }),
      copyToLedgerIds: settleForm.copyToLedgerIds,
      selectedAdvanceIds: settleForm.selectedAdvanceIds,
      allowUpdate: tab.value === 'reimbursed',
    })
    await Promise.all([transactionStore.loadRecent(), accountStore.load()])
    const copiedInfo = Number(result?.copiedLedgers ?? 0) > 0 ? t('reimbursement.copied_ledgers', { count: result.copiedLedgers }) : ''
    const advanceInfo = Number(result?.usedAdvanceMinor ?? 0) > 0 ? t('reimbursement.applied_advance') : ''
    if (result?.updatedIncome) {
      uiStore.pushToast(`${t('reimbursement.updated_settle')}${advanceInfo}${copiedInfo}`)
    } else if (result?.alreadyExists) {
      uiStore.pushToast(`${t('reimbursement.already_settled')}${advanceInfo}${copiedInfo}`)
    } else {
      uiStore.pushToast(`${t('reimbursement.marked_and_posted')}${advanceInfo}${copiedInfo}`)
    }
    pruneSelectedIds()
    closeSettle()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.update_failed'), 'error')
  }
}

async function confirmBatchSettle() {
  if (settlingBatch.value) return
  const targets = batchSettleItems.value
  if (!targets.length) {
    uiStore.pushToast(t('reimbursement.pick_batch'), 'error')
    return
  }
  if (!String(settleForm.accountId ?? '').trim()) {
    uiStore.pushToast(t('reimbursement.pick_settle_account'), 'error')
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
          note: t('reimbursement.settle_note', { id: tx.id }),
          copyToLedgerIds: settleForm.copyToLedgerIds,
          allowUpdate: false,
        }, {
          skipReload: true,
        })
        success += 1
      } catch (error) {
        failed += 1
        if (errorMessages.length < 3) {
          errorMessages.push(String(error?.message ?? error ?? t('common.unknown_error')))
        }
      }
    }

    await Promise.all([reimbursementStore.load(), transactionStore.loadRecent(), accountStore.load()])
    pruneSelectedIds()
    closeSettle()

    const summaryParts = [t('reimbursement.batch_done', { count: success })]
    if (failed > 0) summaryParts.push(t('reimbursement.failed_n', { count: failed }))
    if (skipped > 0) summaryParts.push(t('reimbursement.skipped_n', { count: skipped }))
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
    uiStore.pushToast(t('reimbursement.pick_void'), 'error')
    return
  }

  const ok = window.confirm(t('reimbursement.confirm_batch_void', { count: targets.length }))
  if (!ok) return

  voidingBatch.value = true
  try {
    const result = await transactionStore.deleteTransactionsBatch(targets.map((tx) => tx.id))
    await reimbursementStore.load()
    pruneSelectedIds()

    const failedCount = Number(result?.failed?.length ?? 0)
    if (failedCount > 0) {
      const firstError = String(result.failed?.[0]?.message ?? t('reimbursement.partial_void_failed'))
      uiStore.pushToast(t('reimbursement.batch_void_done', { ok: result.deleted, fail: failedCount, error: firstError }), 'error')
      return
    }
    uiStore.pushToast(t('reimbursement.batch_void_done_ok', { count: result.deleted }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('reimbursement.batch_void_failed'), 'error')
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
  if (isClaimAmountOpen.value) {
    closeClaimAmountSheet()
    event.preventDefault()
    return
  }
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
  gap: 8px;
  position: relative;
}

.list-empty-note {
  margin: 8px 0 0;
}
.summary-action-row {
  justify-content: flex-end;
  flex-wrap: wrap;
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
.offset-row {
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap
}
.offset-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--text);
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
