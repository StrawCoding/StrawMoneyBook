<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('claim_sheet.title') }}</h2>
        <div class="row header-actions">
          <button class="btn primary" @click="openCreateSheet">{{ t('claim_sheet.create') }}</button>
          <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
        </div>
      </header>

      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.count') }}</small>
          <strong>{{ dashboard.claims.length }}</strong>
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.pending') }}</small>
          <MoneyText :value-minor="pendingClaimMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.importable') }}</small>
          <MoneyText :value-minor="reimbursementStore.pendingTotalMinor" />
        </div>
      </div>
    </article>

    <article class="card panel">
      <div class="row claim-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeClaimPage === 'active' }"
          @click="activeClaimPage = 'active'"
        >
          {{ t('claim_sheet.tab.active') }} ({{ activeClaims.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeClaimPage === 'completed' }"
          @click="activeClaimPage = 'completed'"
        >
          {{ t('claim_sheet.tab.completed') }} ({{ completedClaims.length }})
        </button>
      </div>

      <ul class="claim-list">
        <li v-for="claim in visibleClaims" :key="claim.id" class="claim-item">
          <div class="row claim-head">
            <div class="claim-info">
              <strong>{{ claim.title || t('claim_sheet.unnamed') }}</strong>
              <small class="muted">{{ statusLabel(claim.status) }}</small>
            </div>
            <MoneyText :value-minor="claim.total_minor" />
          </div>
          <div class="row claim-meta muted">
            <span>{{ t('claim_sheet.item_count', { count: claim.item_count }) }}</span>
            <span>{{ formatTime(claim.updated_at) }}</span>
          </div>
          <div class="row claim-actions">
            <button class="btn" @click="openDetail(claim)">{{ t('claim_sheet.view') }}</button>
            <button class="btn" @click="exportClaim(claim)">{{ t('claim_sheet.export') }}</button>
            <button
              class="btn primary"
              :disabled="isClaimCompleteDisabled(claim)"
              @click="openCompleteSheet(claim)"
            >
              {{ t('claim_sheet.complete') }}
            </button>
            <button
              class="btn danger"
              :disabled="isClaimVoidDisabled(claim)"
              @click="openDeleteDialog(claim)"
            >
              {{ t('common.delete') }}
            </button>
          </div>
        </li>

        <li v-if="!visibleClaims.length" class="muted">{{ t(visibleClaimEmptyKey) }}</li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isCreateOpen" class="sheet-mask" @click.self="closeCreateSheet">
          <article class="sheet card">
            <header class="row">
              <h3>{{ t('claim_sheet.create') }}</h3>
              <button class="btn" @click="closeCreateSheet">{{ t('common.cancel') }}</button>
            </header>

            <div class="stack form-wrap">
              <label>
                {{ t('claim_sheet.form.title') }}
                <input
                  v-model="createForm.title"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.title_placeholder')"
                />
              </label>
              <label>
                {{ t('claim_sheet.form.note') }}
                <input
                  v-model="createForm.note"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.note_placeholder')"
                />
              </label>

              <div class="stack sub-section">
                <div class="row sub-head">
                  <strong>{{ t('claim_sheet.form.manual_items') }}</strong>
                  <button class="btn" @click="addManualItem">{{ t('claim_sheet.form.add_item') }}</button>
                </div>
                <div v-for="item in createForm.manualItems" :key="item.id" class="manual-item">
                  <CustomSelect
                    v-model="item.entryType"
                    :options="entryTypeOptions"
                    @update:model-value="onManualEntryTypeChange(item, $event)"
                  />
                  <CustomSelect
                    v-model="item.categoryId"
                    :groups="categoryGroupsByEntryType(item.entryType)"
                    :placeholder="t('claim_sheet.form.choose_category')"
                  />
                  <input
                    v-model="item.description"
                    class="input"
                    type="text"
                    :placeholder="t('claim_sheet.form.item_description')"
                  />
                  <input
                    v-model.number="item.amountMajor"
                    class="input"
                    type="number"
                    min="0"
                    step="1"
                    :placeholder="t('claim_sheet.form.amount')"
                  />
                  <button class="btn danger" @click="removeManualItem(item.id)">{{ t('common.delete') }}</button>
                </div>
              </div>

              <div class="stack sub-section">
                <div class="row sub-head">
                  <strong>{{ t('claim_sheet.form.import_reimbursements') }}</strong>
                  <small class="muted">{{ t('claim_sheet.form.import_hint') }}</small>
                </div>
                <div v-if="reimbursementStore.pendingItems.length" class="import-list">
                  <label v-for="tx in reimbursementStore.pendingItems" :key="tx.id" class="import-item">
                    <input v-model="createForm.importTxIds" type="checkbox" :value="tx.id" />
                    <span class="import-item-text">
                      <span>{{ tx.category_name || tx.note_plain || tx.id }}</span>
                      <small class="muted">{{ formatTime(tx.occurred_at) }}</small>
                    </span>
                    <MoneyText :value-minor="pendingMinorOfTx(tx)" />
                  </label>
                </div>
                <p v-else class="muted">{{ t('claim_sheet.form.no_importable') }}</p>
              </div>

              <div class="row total-row">
                <span>{{ t('claim_sheet.form.net_total') }}</span>
                <MoneyText :value-minor="draftTotalMinor" />
              </div>
            </div>

            <footer class="row">
              <button class="btn" @click="closeCreateSheet">{{ t('common.cancel') }}</button>
              <button class="btn primary" :disabled="creating || !canCreateClaim" @click="submitCreateSheet">
                {{ creating ? t('claim_sheet.creating') : t('claim_sheet.create') }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="detailClaim" class="sheet-mask" @click.self="closeDetail">
          <article class="sheet card">
            <header class="row">
              <h3>{{ detailClaim.title || t('claim_sheet.detail_title') }}</h3>
              <button class="btn" @click="closeDetail">{{ t('common.cancel') }}</button>
            </header>

            <div class="stack form-wrap">
              <div class="row">
                <span class="muted">{{ t('claim_sheet.status_label') }}</span>
                <span>{{ statusLabel(detailClaim.status) }}</span>
              </div>
              <div class="row">
                <span class="muted">{{ t('claim_sheet.net_amount') }}</span>
                <MoneyText :value-minor="detailClaim.total_minor" />
              </div>
              <ul class="detail-list">
                <li v-for="item in detailItems" :key="item.id" class="detail-item">
                  <div class="row">
                    <strong>{{ item.description || t('claim_sheet.form.unnamed_item') }}</strong>
                    <MoneyText :value-minor="signedMinorOfItem(item)" />
                  </div>
                  <div class="row muted detail-meta">
                    <span>{{ item.entry_type === 'income' ? t('claim_sheet.entry_type.income') : t('claim_sheet.entry_type.expense') }}</span>
                    <span>{{ item.transaction_id ? t('claim_sheet.item_source.imported') : t('claim_sheet.item_source.manual') }}</span>
                    <span>{{ categoryName(item.category_id) }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="completeTarget" class="sheet-mask" @click.self="closeCompleteSheet">
          <article class="sheet card">
            <header class="row">
              <h3>{{ t('claim_sheet.complete') }}</h3>
              <button class="btn" @click="closeCompleteSheet">{{ t('common.cancel') }}</button>
            </header>

            <div class="stack form-wrap">
              <div class="row">
                <span>{{ t('claim_sheet.sheet_label') }}</span>
                <strong>{{ completeTarget.title }}</strong>
              </div>
              <div class="row">
                <span>{{ t('claim_sheet.net_amount') }}</span>
                <MoneyText :value-minor="completeTarget.total_minor" />
              </div>
              <label>
                {{ t('claim_sheet.form.account') }}
                <CustomSelect v-model="completeForm.accountId" :options="claimAccountOptions" />
              </label>
              <label>
                {{ t('claim_sheet.form.complete_note') }}
                <input
                  v-model="completeForm.note"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.complete_note_placeholder')"
                />
              </label>
            </div>

            <footer class="row">
              <button class="btn" @click="closeCompleteSheet">{{ t('common.cancel') }}</button>
              <button class="btn primary" :disabled="completing || !canCompleteClaim" @click="submitCompleteSheet">
                {{ completing ? t('claim_sheet.processing') : t('claim_sheet.confirm_complete') }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>

    <AppDialog
      :open="Boolean(deleteTarget)"
      :title="t('claim_sheet.delete_dialog.title')"
      :message="deleteTarget ? t('claim_sheet.confirm_void', { title: deleteTarget.title || deleteTarget.id }) : ''"
      :confirm-text="t('common.delete')"
      :confirm-disabled="deletingClaim"
      :loading="deletingClaim"
      :loading-text="t('claim_sheet.processing')"
      @close="closeDeleteDialog"
      @confirm="confirmDeleteClaim"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { reimbursementPendingMinor } from '@/ui/utils/reimbursement-item'
import {
  createCsvBlobUrl,
  revokeBlobUrl,
  saveCsvFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import {
  createReimbursementDraft,
  deleteReimbursement,
  getReimbursementDetail,
  loadReimbursementDashboard,
  markReimbursementPaid,
  transitionReimbursementStatus,
} from '@/core/services/reimbursement.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'

const { t, locale } = useI18n()
const uiStore = useUiStore()
const reimbursementStore = useReimbursementStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()

const dashboard = ref({
  claims: [],
  summary: { pendingCount: 0, pendingTotal: 0 },
})
const isCreateOpen = ref(false)
const creating = ref(false)
const detailClaim = ref(null)
const detailItems = ref([])
const completeTarget = ref(null)
const completing = ref(false)
const activeClaimPage = ref('active')
const deleteTarget = ref(null)
const deletingClaim = ref(false)
const createForm = reactive({
  title: '',
  note: '',
  importTxIds: [],
  manualItems: [],
})
const completeForm = reactive({
  accountId: '',
  note: '',
})
let exportUrl = ''

const entryTypeOptions = computed(() => [
  { label: t('claim_sheet.entry_type.expense'), value: 'expense' },
  { label: t('claim_sheet.entry_type.income'), value: 'income' },
])

const claimAccountOptions = computed(() => {
  return accountStore.regularAccounts.map((account) => ({
    value: account.id,
    label: account.name,
  }))
})

const pendingClaimMinor = computed(() => {
  return dashboard.value.claims
    .filter((item) => item.status !== 'paid' && item.status !== 'rejected')
    .reduce((sum, item) => sum + Math.max(0, Number(item.total_minor ?? 0)), 0)
})

const activeClaims = computed(() => {
  return dashboard.value.claims.filter((item) => String(item?.status ?? '') !== 'paid')
})

const completedClaims = computed(() => {
  return dashboard.value.claims.filter((item) => String(item?.status ?? '') === 'paid')
})

const visibleClaims = computed(() => {
  return activeClaimPage.value === 'completed' ? completedClaims.value : activeClaims.value
})

const visibleClaimEmptyKey = computed(() => {
  return activeClaimPage.value === 'completed' ? 'claim_sheet.empty_completed' : 'claim_sheet.empty'
})

const importedItems = computed(() => {
  const idSet = new Set(createForm.importTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return reimbursementStore.pendingItems.filter((tx) => idSet.has(String(tx.id)))
})

const draftTotalMinor = computed(() => {
  let totalMinor = 0
  for (const tx of importedItems.value) {
    totalMinor += pendingMinorOfTx(tx)
  }
  for (const item of createForm.manualItems) {
    const amountMinor = Math.max(0, Math.round(Number(item.amountMajor ?? 0) * 100))
    if (amountMinor <= 0) continue
    totalMinor += item.entryType === 'income' ? amountMinor * -1 : amountMinor
  }
  return totalMinor
})

const canCreateClaim = computed(() => {
  const hasTitle = Boolean(String(createForm.title ?? '').trim())
  const hasImported = importedItems.value.length > 0
  const manualItemsWithAmount = createForm.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0)
  const hasManual = manualItemsWithAmount.length > 0
  const manualCategoriesReady = manualItemsWithAmount.every((item) => Boolean(String(item.categoryId ?? '').trim()))
  return hasTitle && (hasImported || hasManual) && manualCategoriesReady
})

const canCompleteClaim = computed(() => {
  return Boolean(completeTarget.value)
    && Number(completeTarget.value?.total_minor ?? 0) > 0
    && claimAccountOptions.value.some((item) => item.value === String(completeForm.accountId ?? '').trim())
})

onMounted(async () => {
  await Promise.all([reloadDashboard(), reimbursementStore.load(), accountStore.load(), categoryStore.load()])
  resetCreateForm()
})

function resetCreateForm() {
  createForm.title = ''
  createForm.note = ''
  createForm.importTxIds = []
  createForm.manualItems = []
  addManualItem()
}

function createManualItem() {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryType: 'expense',
    categoryId: firstCategoryIdByEntryType('expense'),
    description: '',
    amountMajor: 0,
  }
}

function addManualItem() {
  createForm.manualItems.push(createManualItem())
}

function removeManualItem(itemId) {
  createForm.manualItems = createForm.manualItems.filter((item) => item.id !== itemId)
  if (!createForm.manualItems.length) addManualItem()
}

function categoriesByEntryType(entryType) {
  return entryType === 'income' ? categoryStore.incomeCategories : categoryStore.expenseCategories
}

function categoryGroupsByEntryType(entryType) {
  return entryType === 'income' ? categoryStore.incomeCategoryGroups : categoryStore.expenseCategoryGroups
}

function firstCategoryIdByEntryType(entryType) {
  return String(categoriesByEntryType(entryType)[0]?.id ?? '')
}

function ensureCategoryIdByEntryType(entryType, categoryId) {
  const nextCategoryId = String(categoryId ?? '').trim()
  if (!nextCategoryId) {
    return firstCategoryIdByEntryType(entryType)
  }

  if (categoriesByEntryType(entryType).some((item) => item.id === nextCategoryId)) {
    return nextCategoryId
  }

  return firstCategoryIdByEntryType(entryType)
}

function onManualEntryTypeChange(item, nextType) {
  item.entryType = nextType === 'income' ? 'income' : 'expense'
  item.categoryId = ensureCategoryIdByEntryType(item.entryType, item.categoryId)
}

async function reloadDashboard() {
  if (!ledgerStore.activeLedgerId) return
  dashboard.value = await loadReimbursementDashboard(ledgerStore.activeLedgerId)
}

function pendingMinorOfTx(tx) {
  return reimbursementPendingMinor(tx)
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(locale.value || 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status) {
  if (status === 'paid') return t('claim_sheet.status.paid')
  if (status === 'rejected') return t('claim_sheet.status.rejected')
  if (status === 'approved') return t('claim_sheet.status.approved')
  if (status === 'in_review') return t('claim_sheet.status.in_review')
  if (status === 'submitted') return t('claim_sheet.status.submitted')
  return t('claim_sheet.status.draft')
}

function openCreateSheet() {
  resetCreateForm()
  isCreateOpen.value = true
}

function closeCreateSheet() {
  if (creating.value) return
  isCreateOpen.value = false
}

async function submitCreateSheet() {
  if (!canCreateClaim.value || creating.value || !ledgerStore.activeLedgerId) return

  creating.value = true
  try {
    const manualItems = createForm.manualItems
      .map((item) => ({
        entryType: item.entryType === 'income' ? 'income' : 'expense',
        sourceType: 'manual',
        description:
          String(item.description ?? '').trim()
          || (item.entryType === 'income'
            ? t('claim_sheet.form.default_income_item')
            : t('claim_sheet.form.default_expense_item')),
        categoryId: ensureCategoryIdByEntryType(item.entryType, item.categoryId) || null,
        amountMinor: Math.round(Number(item.amountMajor ?? 0) * 100),
        occurredAt: new Date().toISOString(),
      }))
      .filter((item) => item.amountMinor > 0)

    const imported = importedItems.value.map((tx) => ({
      entryType: 'expense',
      sourceType: 'transaction',
      transactionId: tx.id,
      categoryId: tx.category_id ?? null,
      accountId: tx.account_id ?? null,
      description: tx.category_name || tx.note_plain || t('claim_sheet.form.imported_reimbursement_item', { id: tx.id }),
      amountMinor: pendingMinorOfTx(tx),
      occurredAt: tx.occurred_at,
    }))

    await createReimbursementDraft(ledgerStore.activeLedgerId, {
      title: createForm.title,
      note: createForm.note,
      items: [...imported, ...manualItems],
    })

    await reloadDashboard()
    isCreateOpen.value = false
    uiStore.pushToast(t('claim_sheet.toast.created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.create_failed'), 'error')
  } finally {
    creating.value = false
  }
}

async function openDetail(claim) {
  if (!ledgerStore.activeLedgerId || !claim?.id) return
  try {
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claim.id)
    detailClaim.value = detail.claim
    detailItems.value = detail.items
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  }
}

function closeDetail() {
  detailClaim.value = null
  detailItems.value = []
}

function isClaimCompleteDisabled(claim) {
  return Number(claim?.total_minor ?? 0) <= 0 || ['paid', 'rejected'].includes(String(claim?.status ?? ''))
}

function isClaimVoidDisabled(claim) {
  return false
}

function openCompleteSheet(claim) {
  if (isClaimCompleteDisabled(claim)) return
  completeTarget.value = claim
  completeForm.accountId = String(claimAccountOptions.value[0]?.value ?? '')
  completeForm.note = String(claim?.title ?? '').trim()
    ? t('claim_sheet.default_complete_note_named', { title: claim.title })
    : t('claim_sheet.default_complete_note')
}

function closeCompleteSheet() {
  if (completing.value) return
  completeTarget.value = null
}

function openDeleteDialog(claim) {
  if (!claim) return
  deleteTarget.value = claim
}

function closeDeleteDialog(force = false) {
  if (!force && deletingClaim.value) return
  deleteTarget.value = null
}

async function ensureClaimReadyForPayment(claim) {
  const status = String(claim?.status ?? 'draft')
  if (!ledgerStore.activeLedgerId) return claim
  let current = claim

  if (status === 'draft') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'submitted')
  }
  if (String(current?.status ?? '') === 'submitted') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'approved')
  }
  if (String(current?.status ?? '') === 'in_review') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'approved')
  }

  return current
}

async function submitCompleteSheet() {
  if (!canCompleteClaim.value || completing.value || !ledgerStore.activeLedgerId || !completeTarget.value) return

  completing.value = true
  try {
    const readyClaim = await ensureClaimReadyForPayment(completeTarget.value)
    await markReimbursementPaid(ledgerStore.activeLedgerId, {
      reimbursementId: readyClaim.id,
      accountId: completeForm.accountId,
      note: completeForm.note,
    })
    await Promise.all([reloadDashboard(), reimbursementStore.load(), accountStore.load()])
    closeCompleteSheet()
    uiStore.pushToast(t('claim_sheet.toast.completed'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.complete_failed'), 'error')
  } finally {
    completing.value = false
  }
}

async function confirmDeleteClaim() {
  const claim = deleteTarget.value
  if (!claim || isClaimVoidDisabled(claim) || !ledgerStore.activeLedgerId || deletingClaim.value) return

  deletingClaim.value = true
  try {
    await deleteReimbursement(ledgerStore.activeLedgerId, claim.id)
    await Promise.all([reloadDashboard(), reimbursementStore.load(), accountStore.load()])
    closeDeleteDialog(true)
    uiStore.pushToast(t('claim_sheet.toast.voided'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.void_failed'), 'error')
  } finally {
    deletingClaim.value = false
  }
}

function signedMinorOfItem(item) {
  const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  return String(item?.entry_type ?? '') === 'income' ? amountMinor * -1 : amountMinor
}

function categoryName(categoryId) {
  const normalized = String(categoryId ?? '').trim()
  if (!normalized) return t('analysis_page.uncategorized')
  return categoryStore.categories.find((item) => item.id === normalized)?.name ?? t('analysis_page.uncategorized')
}

function toCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

async function exportClaim(claim) {
  if (!ledgerStore.activeLedgerId || !claim?.id) return

  try {
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claim.id)
    const categoryHeader = t('transaction_about.detail.category')
    const rows = detail.items.map((item) => ({
      [t('claim_sheet.export_headers.type')]:
        item.entry_type === 'income' ? t('claim_sheet.entry_type.income') : t('claim_sheet.entry_type.expense'),
      [t('claim_sheet.export_headers.source')]:
        item.transaction_id ? t('claim_sheet.item_source.imported') : t('claim_sheet.item_source.manual'),
      [categoryHeader]: categoryName(item.category_id),
      [t('claim_sheet.export_headers.description')]: item.description || '',
      [t('claim_sheet.export_headers.amount')]: (Math.abs(signedMinorOfItem(item)) / 100).toFixed(2),
      [t('claim_sheet.export_headers.date')]: item.occurred_at ? String(item.occurred_at).slice(0, 10) : '',
    }))
    rows.push({
      [t('claim_sheet.export_headers.type')]: t('claim_sheet.export_total'),
      [t('claim_sheet.export_headers.source')]: '',
      [categoryHeader]: '',
      [t('claim_sheet.export_headers.description')]: '',
      [t('claim_sheet.export_headers.amount')]: (Math.abs(Number(detail.claim.total_minor ?? 0)) / 100).toFixed(2),
      [t('claim_sheet.export_headers.date')]: '',
    })

    const headers = [
      t('claim_sheet.export_headers.type'),
      t('claim_sheet.export_headers.source'),
      categoryHeader,
      t('claim_sheet.export_headers.description'),
      t('claim_sheet.export_headers.amount'),
      t('claim_sheet.export_headers.date'),
    ]
    const csvText = [headers.join(',')]
      .concat(rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')))
      .join('\r\n')
    const filename = `${detail.claim.title || t('claim_sheet.title')}_${String(detail.claim.id)}.csv`

    revokeBlobUrl(exportUrl)
    if (Capacitor.isNativePlatform()) {
      const saved = await saveCsvFileToDevice(filename, csvText)
      if (saved?.saved) {
        uiStore.pushToast(
          t('claim_sheet.toast.exported_saved', { location: saved.location || t('claim_sheet.device_files') }),
        )
        return
      }
    }

    exportUrl = createCsvBlobUrl(csvText)
    triggerDownloadFromUrl(exportUrl, filename)
    uiStore.pushToast(t('claim_sheet.toast.exported'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.export_failed'), 'error')
  }
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

.header-actions {
  gap: 8px;
}

.summary-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.claim-list,
.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.claim-tabs {
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--card);
  color: var(--text);
}

.tab-btn.active {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border) 52%);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
}

.claim-item,
.detail-item,
.manual-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.claim-head,
.claim-meta,
.claim-actions,
.sub-head,
.total-row,
.detail-meta {
  align-items: center;
}

.claim-info {
  display: grid;
  gap: 4px;
}

.claim-actions {
  gap: 8px;
  flex-wrap: wrap;
}

.sheet-mask {
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
}

.form-wrap,
.sub-section {
  margin-top: 12px;
}

.sub-section {
  display: grid;
  gap: 8px;
}

.manual-item {
  grid-template-columns: 120px 180px minmax(0, 1fr) 120px auto;
  align-items: center;
}

.import-list {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.import-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.import-item-text {
  display: grid;
  min-width: 0;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .manual-item {
    grid-template-columns: 1fr;
  }
}
</style>
