<template>
  <section class="stack">
    <header class="row">
      <h2>{{ t('claim_sheet.detail_title') }}</h2>
      <button class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
    </header>

    <article v-if="claim" class="card panel">
      <header class="row claim-head">
        <div class="claim-title">
          <h3>{{ claim.title || t('claim_sheet.detail_title') }}</h3>
          <small class="muted">{{ statusLabel(claim.status) }}</small>
        </div>
        <MoneyText :value-minor="claim.total_minor" />
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">{{ t('claim_sheet.net_amount') }}</small>
          <span><MoneyText :value-minor="claim.total_minor" /></span>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('claim_sheet.item_count_label') }}</small>
          <span>{{ items.length }}</span>
        </div>
        <div v-if="claim.counterparty_name" class="detail-row">
          <small class="muted">{{ t('claim_sheet.form.counterparty') }}</small>
          <span>{{ claim.counterparty_name }}</span>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('transaction_about.detail.updated_at') }}</small>
          <span>{{ formatTime(claim.updated_at) }}</span>
        </div>
      </div>

      <p v-if="claim.note" class="note">{{ claim.note }}</p>

      <div class="row action-row">
        <button class="btn" :disabled="!isClaimEditable(claim)" @click="openEdit">
          {{ t('common.edit') }}
        </button>
        <button
          v-if="isClaimRestorable(claim)"
          class="btn"
          :disabled="restoring"
          @click="openRestoreDialog"
        >
          {{ restoring ? t('claim_sheet.processing') : t('claim_sheet.restore') }}
        </button>
        <button class="btn" :disabled="exporting" @click="exportClaim">
          {{ exporting ? t('claim_sheet.processing') : t('claim_sheet.export') }}
        </button>
        <button class="btn danger" :disabled="deleting" @click="openDeleteDialog">
          {{ t('common.delete') }}
        </button>
      </div>

      <p v-if="exportedFilename" class="muted file-note">{{ exportedFilename }}</p>
      <p v-if="exportedLocation" class="muted file-note">{{ exportedLocation }}</p>
      <div v-if="exportedUrl" class="row export-open-row">
        <button class="btn" @click="openExportLink">{{ t('analysis_print.open_link') }}</button>
      </div>
    </article>

    <article v-if="claim" class="card panel">
      <header class="row">
        <h3>{{ t('claim_sheet.item_count', { count: items.length }) }}</h3>
      </header>

      <ul class="detail-list">
        <li v-for="item in items" :key="item.id" class="detail-item">
          <div class="row detail-item-head">
            <div class="detail-item-title">
              <font-awesome-icon
                v-if="itemPresentation(item).icon"
                :icon="itemPresentation(item).icon"
                class="detail-item-icon"
              />
              <strong>{{ itemPresentation(item).title }}</strong>
            </div>
            <MoneyText :value-minor="signedMinorOfItem(item)" />
          </div>
          <div class="detail-meta">
            <span class="detail-badge muted">{{ itemPresentation(item).entryLabel }}</span>
            <span class="detail-badge muted">{{ itemPresentation(item).sourceLabel }}</span>
            <span class="detail-badge muted">{{ itemPresentation(item).categoryName || t('analysis_page.uncategorized') }}</span>
          </div>
          <p v-if="itemPresentation(item).note" class="muted detail-note">{{ itemPresentation(item).note }}</p>
        </li>
      </ul>
    </article>

    <article v-if="!claim && !loading" class="card panel">
      <p class="muted">{{ t('claim_sheet.not_found') }}</p>
    </article>

    <AppDialog
      :open="restoreDialogOpen"
      :title="t('claim_sheet.restore_dialog.title')"
      :message="claim ? t('claim_sheet.confirm_restore', { title: claim.title || claim.id }) : ''"
      :confirm-text="t('claim_sheet.restore')"
      :confirm-disabled="restoring"
      :loading="restoring"
      :loading-text="t('claim_sheet.processing')"
      @close="closeRestoreDialog"
      @confirm="confirmRestoreClaim"
    />

    <AppDialog
      :open="deleteDialogOpen"
      :title="t('claim_sheet.delete_dialog.title')"
      :message="claim ? t('claim_sheet.confirm_void', { title: claim.title || claim.id }) : ''"
      :confirm-text="t('common.delete')"
      :confirm-disabled="deleting"
      :loading="deleting"
      :loading-text="t('claim_sheet.processing')"
      @close="closeDeleteDialog"
      @confirm="confirmDeleteClaim"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import {
  buildClaimCategoryLookup,
  presentClaimDetailItem,
} from '@/ui/utils/claim-sheet-presentation'
import {
  createPdfBlobUrl,
  openFileUrl,
  revokeBlobUrl,
  savePdfFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import { buildClaimSheetPdfFile } from '@/core/services/claim-sheet-pdf.service'
import {
  deleteReimbursement,
  getReimbursementDetail,
  transitionReimbursementStatus,
} from '@/core/services/reimbursement.service'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const reimbursementStore = useReimbursementStore()

const loading = ref(false)
const exporting = ref(false)
const deleting = ref(false)
const restoring = ref(false)
const deleteDialogOpen = ref(false)
const restoreDialogOpen = ref(false)
const claim = ref(null)
const items = ref([])
const exportedUrl = ref('')
const exportedFilename = ref('')
const exportedLocation = ref('')

const claimId = computed(() => String(route.params.id ?? '').trim())
const claimCategoryLookup = computed(() => buildClaimCategoryLookup(categoryStore.categories))
const backTab = computed(() => {
  const queryTab = String(route.query.tab ?? '').trim()
  if (queryTab === 'completed') return 'completed'
  if (queryTab === 'active') return 'active'
  return String(claim.value?.status ?? '').trim() === 'paid' ? 'completed' : 'active'
})
const backLink = computed(() => (
  backTab.value === 'completed'
    ? { name: 'claim-sheets', query: { tab: 'completed' } }
    : { name: 'claim-sheets' }
))

onMounted(async () => {
  await categoryStore.load()
  await reimbursementStore.load()
})

onBeforeUnmount(() => {
  revokeExportUrl()
})

watch(
  [claimId, () => ledgerStore.activeLedgerId],
  () => {
    void loadDetail()
  },
  { immediate: true },
)

function revokeExportUrl() {
  if (!exportedUrl.value.startsWith('blob:')) return
  revokeBlobUrl(exportedUrl.value)
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

function isClaimEditable(value) {
  return String(value?.status ?? 'draft') === 'draft'
}

function isClaimRestorable(value) {
  return String(value?.status ?? '').trim() === 'paid'
}

function signedMinorOfItem(item) {
  return Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
}

function categoryName(categoryId) {
  const normalized = String(categoryId ?? '').trim()
  if (!normalized) return t('analysis_page.uncategorized')
  return categoryStore.categories.find((item) => item.id === normalized)?.name ?? t('analysis_page.uncategorized')
}

function itemPresentation(item) {
  return presentClaimDetailItem(item, claimCategoryLookup.value, t)
}

async function loadDetail() {
  if (!ledgerStore.activeLedgerId || !claimId.value) {
    claim.value = null
    items.value = []
    return
  }

  loading.value = true
  try {
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claimId.value)
    if (claimId.value !== String(route.params.id ?? '').trim()) return
    claim.value = detail.claim ?? null
    items.value = Array.isArray(detail.items) ? detail.items : []
  } catch (error) {
    claim.value = null
    items.value = []
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

function openEdit() {
  if (!claim.value?.id || !isClaimEditable(claim.value)) return
  void router.push({
    name: 'claim-sheet-edit',
    params: { id: claimId.value },
    query: backTab.value === 'completed' ? { tab: 'completed' } : {},
  })
}

async function exportClaim() {
  if (!claim.value || exporting.value) return

  exporting.value = true
  try {
    const pdfFile = await buildClaimSheetPdfFile(
      { claim: claim.value, items: items.value },
      {
        locale: locale.value || 'zh-TW',
        title: t('claim_sheet.title'),
        detailTitle: t('claim_sheet.detail_title'),
        totalLabel: t('claim_sheet.form.net_total'),
        statusLabel: t('claim_sheet.status_label'),
        counterpartyLabel: t('claim_sheet.form.counterparty'),
        noteLabel: t('claim_sheet.form.note'),
        updatedAtLabel: t('transaction_about.detail.updated_at'),
        itemCountLabel: t('claim_sheet.item_count_label'),
        categoryLabel: t('transaction_about.detail.category'),
        descriptionLabel: t('claim_sheet.export_headers.description'),
        amountLabel: t('claim_sheet.export_headers.amount'),
        dateLabel: t('claim_sheet.export_headers.date'),
        sourceLabel: t('claim_sheet.export_headers.source'),
        importedNoteLabel: t('claim_sheet.form.import_note'),
        incomeType: t('claim_sheet.entry_type.income'),
        expenseType: t('claim_sheet.entry_type.expense'),
        advanceType: t('claim_sheet.entry_type.advance'),
        manualSource: t('claim_sheet.item_source.manual'),
        importedSource: t('claim_sheet.item_source.imported'),
        advanceSource: t('claim_sheet.item_source.advance'),
        emptyDescription: t('claim_sheet.form.unnamed_item'),
        uncategorized: t('analysis_page.uncategorized'),
        statusValue: statusLabel(claim.value?.status),
        categoryName: (categoryId) => categoryName(categoryId),
        summaryHint: t('claim_sheet.export_pdf_hint'),
      },
    )

    revokeExportUrl()
    exportedFilename.value = pdfFile.filename
    exportedLocation.value = ''

    if (Capacitor.isNativePlatform()) {
      const saved = await savePdfFileToDevice(pdfFile.filename, pdfFile.blob, { category: 'claim-sheets' })
      if (saved?.saved) {
        exportedFilename.value = String(saved.filename ?? pdfFile.filename)
        exportedLocation.value = String(saved.location || t('claim_sheet.device_files'))
        exportedUrl.value = String(saved.uri ?? '').trim()
          || String(saved.openUrl ?? '').trim()
          || createPdfBlobUrl(pdfFile.blob)
        uiStore.pushToast(
          t('claim_sheet.toast.exported_saved', { location: saved.location || t('claim_sheet.device_files') }),
        )
        return
      }
    }

    exportedUrl.value = createPdfBlobUrl(pdfFile.blob)
    uiStore.pushToast(t('claim_sheet.toast.exported'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.export_failed'), 'error')
  } finally {
    exporting.value = false
  }
}

function openExportLink() {
  if (!exportedUrl.value) return
  const opened = openFileUrl(exportedUrl.value)
  if (!opened && exportedFilename.value) {
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  }
}

function openDeleteDialog() {
  if (!claim.value) return
  deleteDialogOpen.value = true
}

function openRestoreDialog() {
  if (!claim.value || !isClaimRestorable(claim.value)) return
  restoreDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleting.value) return
  deleteDialogOpen.value = false
}

function closeRestoreDialog() {
  if (restoring.value) return
  restoreDialogOpen.value = false
}

async function confirmRestoreClaim() {
  if (!ledgerStore.activeLedgerId || !claim.value?.id || restoring.value) return

  restoring.value = true
  try {
    const restored = await transitionReimbursementStatus(ledgerStore.activeLedgerId, claim.value.id, 'draft')
    claim.value = restored
    await reimbursementStore.load()
    uiStore.pushToast(t('claim_sheet.toast.restored'))
    await router.replace({
      name: 'claim-sheet-detail',
      params: { id: claim.value.id },
    })
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.restore_failed'), 'error')
  } finally {
    restoring.value = false
    restoreDialogOpen.value = false
  }
}

async function confirmDeleteClaim() {
  if (!ledgerStore.activeLedgerId || !claim.value?.id || deleting.value) return

  deleting.value = true
  try {
    await deleteReimbursement(ledgerStore.activeLedgerId, claim.value.id)
    await reimbursementStore.load()
    uiStore.pushToast(t('claim_sheet.toast.voided'))
    await router.replace(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.void_failed'), 'error')
  } finally {
    deleting.value = false
    deleteDialogOpen.value = false
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

.claim-head,
.action-row,
.detail-item-head {
  align-items: center;
}

.claim-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.detail-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-row {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.note {
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 92%, var(--primary) 8%);
  white-space: pre-wrap;
  line-height: 1.5;
}

.action-row {
  margin-top: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.file-note {
  margin: 10px 0 0;
}

.export-open-row {
  margin-top: 10px;
}

.detail-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.detail-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.detail-item-head {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.detail-item-title {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.detail-item-icon {
  width: 16px;
  color: var(--primary);
  flex: 0 0 auto;
}

.detail-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--card) 90%, var(--primary) 10%);
}

.detail-note {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.claim-title h3,
.detail-row span,
.detail-item-title strong {
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .claim-head,
  .detail-item-head {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
