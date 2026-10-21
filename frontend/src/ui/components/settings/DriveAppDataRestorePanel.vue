<template>
  <article
    id="drive-appdata-browser"
    class="card panel drive-appdata-panel"
    data-testid="drive-appdata-browser"
    :class="{ working: busy }"
  >
    <h3>{{ t('settings_auto_backup.drive_browser.title', 'Drive appData 檔案與舊版還原') }}</h3>
    <p class="muted">
      {{
        t(
          'settings_auto_backup.drive_browser.desc',
          '列出 Google Drive appDataFolder 全部檔案（含 all_ledgers、sync_* 與其他），可預覽摘要後選檔或展開 revision 還原。還原前會建立 durable recovery；失敗則中止、不清空本機。',
        )
      }}
    </p>

    <div class="row backup-action-row">
      <button
        class="btn"
        data-testid="drive-appdata-refresh"
        :class="{ busy: listing }"
        :aria-busy="listing"
        :disabled="listing || restoring"
        @click="refreshFiles"
      >
        {{ listing ? t('settings_auto_backup.drive_browser.listing', '讀取中...') : t('settings_auto_backup.drive_browser.refresh', '重新整理檔案列表') }}
      </button>
    </div>

    <p v-if="!canUseBrowser" class="muted compact" data-testid="drive-appdata-need-connect">
      {{ t('settings_auto_backup.drive_browser.need_connect', '請先登入 Google 備份後，才能列出 appDataFolder 檔案。') }}
    </p>
    <p v-else-if="listError" class="warn compact" data-testid="drive-appdata-list-error">{{ listError }}</p>
    <p v-else-if="!files.length && listedOnce" class="muted compact" data-testid="drive-appdata-empty">
      {{ t('settings_auto_backup.drive_browser.empty', 'appDataFolder 目前沒有可列出的檔案。') }}
    </p>

    <ul v-if="files.length" class="drive-file-list" data-testid="drive-appdata-file-list">
      <li
        v-for="file in files"
        :key="file.id"
        class="drive-file-item"
        :data-file-id="file.id"
        :data-file-kind="file.kind"
      >
        <div class="drive-file-meta">
          <strong>{{ file.name || file.id }}</strong>
          <span class="muted compact">{{ formatFileMeta(file) }}</span>
        </div>
        <div class="drive-file-actions">
          <button
            class="btn"
            data-testid="drive-appdata-preview"
            :disabled="busy"
            @click="previewTarget({ fileId: file.id, filename: file.name, modifiedTime: file.modifiedTime })"
          >
            {{ t('settings_auto_backup.drive_browser.preview', '預覽摘要') }}
          </button>
          <button
            class="btn"
            data-testid="drive-appdata-toggle-revisions"
            :disabled="busy"
            @click="toggleRevisions(file)"
          >
            {{
              expandedFileId === file.id
                ? t('settings_auto_backup.drive_browser.hide_revisions', '收合舊版')
                : t('settings_auto_backup.drive_browser.show_revisions', '展開舊版')
            }}
          </button>
          <button
            class="btn danger-btn"
            data-testid="drive-appdata-restore-file"
            :disabled="busy"
            @click="openRestoreConfirm({ fileId: file.id, filename: file.name, modifiedTime: file.modifiedTime })"
          >
            {{ t('settings_auto_backup.drive_browser.restore_file', '選此檔還原') }}
          </button>
        </div>

        <div
          v-if="expandedFileId === file.id"
          class="drive-revision-block"
          data-testid="drive-appdata-revision-list"
        >
          <p v-if="revisionErrorByFile[file.id]" class="warn compact">{{ revisionErrorByFile[file.id] }}</p>
          <p v-else-if="revisionLoadingId === file.id" class="muted compact">
            {{ t('settings_auto_backup.drive_browser.revisions_loading', '讀取舊版中...') }}
          </p>
          <p
            v-else-if="!(revisionsByFile[file.id] || []).length"
            class="muted compact"
            data-testid="drive-appdata-revisions-empty"
          >
            {{ t('settings_auto_backup.drive_browser.revisions_empty', '此檔沒有可列出的 Drive revision。') }}
          </p>
          <ul v-else class="drive-revision-list">
            <li
              v-for="rev in revisionsByFile[file.id]"
              :key="rev.id"
              class="drive-revision-item"
              :data-revision-id="rev.id"
            >
              <div class="drive-file-meta">
                <strong>{{ formatRevisionLabel(rev) }}</strong>
                <span class="muted compact">{{ formatRevisionMeta(rev) }}</span>
              </div>
              <div class="drive-file-actions">
                <button
                  class="btn"
                  data-testid="drive-appdata-preview-revision"
                  :disabled="busy"
                  @click="previewTarget({
                    fileId: file.id,
                    filename: file.name,
                    modifiedTime: rev.modifiedTime || file.modifiedTime,
                    revisionId: rev.id,
                  })"
                >
                  {{ t('settings_auto_backup.drive_browser.preview', '預覽摘要') }}
                </button>
                <button
                  class="btn danger-btn"
                  data-testid="drive-appdata-restore-revision"
                  :disabled="busy"
                  @click="openRestoreConfirm({
                    fileId: file.id,
                    filename: file.name,
                    modifiedTime: rev.modifiedTime || file.modifiedTime,
                    revisionId: rev.id,
                  })"
                >
                  {{ t('settings_auto_backup.drive_browser.restore_revision', '還原此舊版') }}
                </button>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <teleport to="body">
      <transition name="overlay-fade">
        <section
          v-if="previewOpen"
          class="sheet-mask restore-mask"
          data-testid="drive-appdata-preview-dialog"
          @click.self="closePreview"
        >
          <article class="card restore-dialog">
            <header class="row">
              <h3>{{ t('settings_auto_backup.drive_browser.preview_title', '備份預覽摘要') }}</h3>
            </header>
            <p class="muted compact">{{ previewTargetLabel }}</p>
            <ul v-if="previewPayload" class="preview-meta-list">
              <li>
                <span class="muted">{{ t('settings_auto_backup.drive_browser.preview_ledgers', '帳本') }}</span>
                <strong>{{ previewLedgerLabel }}</strong>
              </li>
              <li>
                <span class="muted">{{ t('settings_auto_backup.drive_browser.preview_tx_count', '有效交易筆數') }}</span>
                <strong>{{ previewPayload.remoteSummary?.transactionCount ?? 0 }}</strong>
              </li>
              <li>
                <span class="muted">{{ t('settings_auto_backup.drive_browser.preview_months', '交易月份分佈') }}</span>
                <strong>{{ previewMonthsLabel }}</strong>
              </li>
            </ul>
            <p v-if="previewPayload && !previewImportable" class="warn compact" data-testid="drive-appdata-preview-not-importable">
              {{
                previewGateError
                  || t('settings_auto_backup.drive_browser.not_importable', '此檔／版本無法匯入（內容無法解析為帳本備份）。請另選檔或舊版。')
              }}
            </p>
            <p v-if="previewAgeWarn" class="warn compact" data-testid="drive-appdata-age-warn">{{ previewAgeWarn }}</p>
            <p v-if="previewCoverageWarn" class="warn compact" data-testid="drive-appdata-coverage-warn">{{ previewCoverageWarn }}</p>
            <footer class="row action-row">
              <button class="btn" @click="closePreview">{{ t('common.close', '關閉') }}</button>
              <button
                class="btn danger-btn"
                data-testid="drive-appdata-preview-then-restore"
                :disabled="busy || !previewImportable"
                @click="confirmPreviewThenRestore"
              >
                {{ t('settings_auto_backup.drive_browser.preview_then_restore', '以此內容還原') }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section
          v-if="restoreConfirmOpen"
          class="sheet-mask restore-mask"
          data-testid="drive-appdata-restore-confirm"
          @click.self="closeRestoreConfirm"
        >
          <article class="card restore-dialog">
            <header class="row">
              <h3>{{ t('settings_auto_backup.restore.confirm_title', '確認還原並清空本機資料') }}</h3>
            </header>
            <p class="muted">
              {{
                t(
                  'settings_auto_backup.drive_browser.restore_confirm_desc',
                  '還原前會先建立本機 durable recovery 備份；失敗會中止、不清空本機。成功後才清空並以選定的 Drive 檔／舊版還原。若雲端檔較舊或月份較少，請先確認預覽警告。',
                )
              }}
            </p>
            <p class="muted compact">{{ pendingRestoreLabel }}</p>
            <p v-if="pendingPreviewLoading" class="muted compact" data-testid="drive-appdata-confirm-preview-loading">
              {{ t('settings_auto_backup.drive_browser.preview_preparing', '正在預覽並檢查可否匯入...') }}
            </p>
            <p v-else-if="pendingPreviewError" class="warn compact" data-testid="drive-appdata-confirm-preview-error">
              {{ pendingPreviewError }}
            </p>
            <p v-if="pendingAgeWarn" class="warn compact" data-testid="drive-appdata-confirm-age-warn">{{ pendingAgeWarn }}</p>
            <p v-if="pendingCoverageWarn" class="warn compact" data-testid="drive-appdata-confirm-coverage-warn">{{ pendingCoverageWarn }}</p>
            <footer class="row action-row">
              <button class="btn" :disabled="restoring" @click="closeRestoreConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button
                class="btn danger-btn"
                data-testid="drive-appdata-restore-confirm-button"
                :disabled="!canConfirmRestore"
                @click="confirmRestore"
              >
                {{ restoreConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  listGoogleAppDataFileRevisions,
  listGoogleAppDataFiles,
  previewGoogleAppDataBackup,
  restoreGoogleBackupJsonByTarget,
} from '@/ui/services/google-backup.service'
import { formatMonthDistributionLabel } from '@/core/services/backup-json-preview.service'
import { importBackupJsonAsNewLedgers } from '@/core/services/import.service'
import {
  DATA_WIPE_REASON,
  LEDGER_REPAIR_REASON,
  RECOVERY_BACKUP_REQUIRED_CODE,
} from '@/core/services/data-wipe-guard.service'
import {
  createVerifiedRecoveryBackupBeforeWipe,
  loadRecoveryBackupJsonText,
} from '@/core/services/recovery-backup.service'
import {
  DRIVE_RESTORE_NOT_IMPORTABLE_CODE,
  DRIVE_RESTORE_PREVIEW_REQUIRED_CODE,
  assertDriveRestorePreviewReady,
  describeDriveRestorePreviewGateError,
  isDriveRestorePreviewReady,
  runConfirmedDriveAppDataRestore,
} from '@/core/services/drive-appdata-restore.service'
import {
  downloadJsonFile,
  exportAllLedgersJson,
  saveJsonFileToDevice,
} from '@/core/services/export.service'
import { resetDatabase } from '@/core/db/sqlite'

const props = defineProps({
  connected: { type: Boolean, default: false },
  ledgerId: { type: String, default: '' },
})

const { t, locale } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()

const files = ref([])
const listedOnce = ref(false)
const listing = ref(false)
const listError = ref('')
const expandedFileId = ref('')
const revisionsByFile = ref({})
const revisionErrorByFile = ref({})
const revisionLoadingId = ref('')
const previewOpen = ref(false)
const previewPayload = ref(null)
const previewTargetMeta = ref(null)
const restoreConfirmOpen = ref(false)
const restoreCountdown = ref(0)
const restoring = ref(false)
const pendingTarget = ref(null)
const pendingPreview = ref(null)
const pendingPreviewLoading = ref(false)
const pendingPreviewError = ref('')
let restoreTimerId = null

const hasTestMock = computed(() => detectDriveAppDataMock())
const canUseBrowser = computed(() => Boolean(props.connected || hasTestMock.value))
const busy = computed(() => listing.value || restoring.value || Boolean(revisionLoadingId.value) || pendingPreviewLoading.value)
const previewImportable = computed(() => isDriveRestorePreviewReady(previewPayload.value))
const previewGateError = computed(() => (
  previewPayload.value && !previewImportable.value
    ? describeDriveRestorePreviewGateError(previewPayload.value)
    : ''
))
const pendingImportable = computed(() => isDriveRestorePreviewReady(pendingPreview.value))
const canConfirmRestore = computed(() => (
  !restoring.value
  && !pendingPreviewLoading.value
  && !pendingPreviewError.value
  && restoreCountdown.value <= 0
  && pendingImportable.value
))

function detectDriveAppDataMock() {
  if (typeof window === 'undefined') return false
  return Boolean(window.__SMB_DRIVE_APPDATA_MOCK__)
}

const restoreConfirmLabel = computed(() => {
  if (restoring.value) return t('settings_auto_backup.restoring', '還原中...')
  if (restoreCountdown.value > 0) {
    return t('settings_auto_backup.restore.confirm_countdown', { count: restoreCountdown.value }, `確認還原（${restoreCountdown.value}）`)
  }
  return t('settings_auto_backup.restore.confirm', '確認還原並清空本機')
})

const previewTargetLabel = computed(() => describeTarget(previewTargetMeta.value))
const pendingRestoreLabel = computed(() => describeTarget(pendingTarget.value))

const previewLedgerLabel = computed(() => {
  const names = previewPayload.value?.remoteSummary?.ledgerNames || []
  if (!names.length) return '-'
  return names.join('、')
})

const previewMonthsLabel = computed(() => {
  const label = formatMonthDistributionLabel(previewPayload.value?.remoteSummary?.monthDistribution || {})
  return label || t('settings_auto_backup.drive_browser.no_months', '無交易月份')
})

const previewAgeWarn = computed(() => buildAgeWarn(previewPayload.value?.comparison))
const previewCoverageWarn = computed(() => buildCoverageWarn(previewPayload.value?.comparison))
const pendingAgeWarn = computed(() => buildAgeWarn(pendingPreview.value?.comparison))
const pendingCoverageWarn = computed(() => buildCoverageWarn(pendingPreview.value?.comparison))

function resolveLedgerId() {
  return String(props.ledgerId || ledgerStore.activeLedgerId || '').trim()
}

function describeTarget(target) {
  if (!target) return ''
  const name = String(target.filename || target.fileId || '').trim()
  const rev = String(target.revisionId || '').trim()
  if (rev) {
    return t(
      'settings_auto_backup.drive_browser.target_with_revision',
      { name, revisionId: rev },
      `${name}（revision ${rev}）`,
    )
  }
  return name
}

function buildAgeWarn(comparison) {
  if (!comparison) return ''
  if (comparison.warnOlderRemote) {
    return t(
      'settings_auto_backup.drive_browser.warn_older',
      '此檔／版本可能比本機資料更舊。還原會以雲端內容覆寫本機，請確認。',
    )
  }
  if (comparison.warnNewerRemote) {
    return t(
      'settings_auto_backup.drive_browser.warn_newer',
      '此檔／版本可能比本機更新；若本機較完整，請先對照月份分佈再決定是否還原。',
    )
  }
  return ''
}

function buildCoverageWarn(comparison) {
  if (!comparison?.warnIncompleteRemote) return ''
  const missing = Array.isArray(comparison.monthsOnlyInLocal) ? comparison.monthsOnlyInLocal.join(', ') : ''
  return t(
    'settings_auto_backup.drive_browser.warn_incomplete',
    {
      localTx: comparison.localTxCount,
      remoteTx: comparison.remoteTxCount,
      missingMonths: missing || '-',
    },
    `雲端檔可能較不完整（本機 ${comparison.localTxCount} 筆／雲端 ${comparison.remoteTxCount} 筆；本機有而雲端沒有的月份：${missing || '-'}）。禁止在未確認下覆寫較完整本機資料。`,
  )
}

function formatBytes(size) {
  const n = Number(size)
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return raw
  try {
    return new Intl.DateTimeFormat(resolveIntlLocale(locale.value), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return raw
  }
}

function kindLabel(kind) {
  if (kind === 'all_ledgers') return t('settings_auto_backup.drive_browser.kind_all', '全部帳本備份')
  if (kind === 'ledger_sync') return t('settings_auto_backup.drive_browser.kind_sync', '帳本同步檔')
  if (kind === 'other_json') return t('settings_auto_backup.drive_browser.kind_other_json', '其他 JSON')
  return t('settings_auto_backup.drive_browser.kind_other', '其他檔案')
}

function formatFileMeta(file) {
  return [
    kindLabel(file.kind),
    formatTime(file.modifiedTime),
    formatBytes(file.size),
  ].join(' · ')
}

function formatRevisionLabel(rev) {
  return t(
    'settings_auto_backup.drive_browser.revision_label',
    { id: rev.id },
    `舊版 ${rev.id}`,
  )
}

function formatRevisionMeta(rev) {
  const keep = rev.keepForever
    ? t('settings_auto_backup.drive_browser.keep_forever', '永久保留')
    : t('settings_auto_backup.drive_browser.keep_auto', '自動保留')
  return [formatTime(rev.modifiedTime), formatBytes(rev.size), keep].join(' · ')
}

function errorMessage(error, fallback) {
  const detail = String(error?.message ?? error ?? '').trim()
  return detail || fallback
}

async function refreshFiles() {
  const ledgerId = resolveLedgerId()
  if (!ledgerId) return
  if (!props.connected && !detectDriveAppDataMock()) {
    listError.value = ''
    files.value = []
    listedOnce.value = false
    return
  }
  listing.value = true
  listError.value = ''
  try {
    files.value = await listGoogleAppDataFiles(ledgerId)
    listedOnce.value = true
  } catch (error) {
    listError.value = errorMessage(error, t('settings_auto_backup.drive_browser.list_failed', '讀取 Drive appData 檔案失敗'))
    files.value = []
    listedOnce.value = true
  } finally {
    listing.value = false
  }
}

async function toggleRevisions(file) {
  if (expandedFileId.value === file.id) {
    expandedFileId.value = ''
    return
  }
  expandedFileId.value = file.id
  if (revisionsByFile.value[file.id]) return
  const ledgerId = resolveLedgerId()
  if (!ledgerId) return
  revisionLoadingId.value = file.id
  revisionErrorByFile.value = { ...revisionErrorByFile.value, [file.id]: '' }
  try {
    const revisions = await listGoogleAppDataFileRevisions(ledgerId, file.id)
    revisionsByFile.value = { ...revisionsByFile.value, [file.id]: revisions }
  } catch (error) {
    revisionErrorByFile.value = {
      ...revisionErrorByFile.value,
      [file.id]: errorMessage(error, t('settings_auto_backup.drive_browser.revisions_failed', '讀取舊版失敗')),
    }
  } finally {
    revisionLoadingId.value = ''
  }
}

async function previewTarget(target) {
  const ledgerId = resolveLedgerId()
  if (!ledgerId) return
  listing.value = true
  try {
    const preview = await previewGoogleAppDataBackup(ledgerId, target)
    previewTargetMeta.value = target
    previewPayload.value = preview
    previewOpen.value = true
    if (!isDriveRestorePreviewReady(preview)) {
      uiStore.pushToast(
        t('settings_auto_backup.drive_browser.not_importable', '此檔／版本無法匯入（內容無法解析為帳本備份）。請另選檔或舊版。'),
        'error',
      )
    }
  } catch (error) {
    uiStore.pushToast(
      errorMessage(error, t('settings_auto_backup.drive_browser.preview_failed', '預覽備份失敗')),
      'error',
    )
  } finally {
    listing.value = false
  }
}

function closePreview() {
  previewOpen.value = false
}

function confirmPreviewThenRestore() {
  const target = previewTargetMeta.value
  const preview = previewPayload.value
  try {
    assertDriveRestorePreviewReady(preview)
  } catch (error) {
    uiStore.pushToast(
      errorMessage(error, t('settings_auto_backup.drive_browser.preview_required', '請先完成可匯入的備份預覽後再還原。')),
      'error',
    )
    return
  }
  previewOpen.value = false
  void openRestoreConfirm(target, preview)
}

function clearRestoreTimer() {
  if (restoreTimerId) {
    window.clearInterval(restoreTimerId)
    restoreTimerId = null
  }
}

function startRestoreCountdown() {
  restoreCountdown.value = 3
  clearRestoreTimer()
  restoreTimerId = window.setInterval(() => {
    if (restoreCountdown.value <= 1) {
      restoreCountdown.value = 0
      clearRestoreTimer()
      return
    }
    restoreCountdown.value -= 1
  }, 1000)
}

async function openRestoreConfirm(target, existingPreview = null) {
  const ledgerId = resolveLedgerId()
  if (!ledgerId || !target?.fileId) return

  pendingTarget.value = { ...target }
  pendingPreview.value = null
  pendingPreviewError.value = ''
  pendingPreviewLoading.value = true
  restoreConfirmOpen.value = false
  restoreCountdown.value = 0
  clearRestoreTimer()

  try {
    let preview = existingPreview
    if (!isDriveRestorePreviewReady(preview)) {
      preview = await previewGoogleAppDataBackup(ledgerId, target)
    }
    assertDriveRestorePreviewReady(preview)
    pendingPreview.value = preview
    pendingPreviewError.value = ''
    restoreConfirmOpen.value = true
    startRestoreCountdown()
  } catch (error) {
    console.warn('[drive-appdata] preview before confirm failed', error)
    pendingPreview.value = null
    pendingPreviewError.value = errorMessage(
      error,
      t('settings_auto_backup.drive_browser.preview_required', '請先完成可匯入的備份預覽後再還原。'),
    )
    restoreConfirmOpen.value = false
    uiStore.pushToast(pendingPreviewError.value, 'error')
  } finally {
    pendingPreviewLoading.value = false
  }
}

function closeRestoreConfirm(options = {}) {
  if (restoring.value && !options.force) return
  restoreConfirmOpen.value = false
  restoreCountdown.value = 0
  pendingTarget.value = null
  pendingPreview.value = null
  pendingPreviewLoading.value = false
  pendingPreviewError.value = ''
  clearRestoreTimer()
}

async function createRestoreRecoveryBackup() {
  // smb297/smb299: must pass exporter + durable persist helpers — missing exporter always fails the gate.
  return createVerifiedRecoveryBackupBeforeWipe({
    purpose: 'restore',
    source: 'DriveAppDataRestorePanel.confirmRestore',
    category: 'auto-backup',
    exportAllLedgersJson,
    saveJsonFileToDevice,
    downloadJsonFile,
  })
}

async function confirmRestore() {
  if (!canConfirmRestore.value) return
  const ledgerId = resolveLedgerId()
  const target = pendingTarget.value
  const preview = pendingPreview.value
  if (!ledgerId || !target?.fileId) return

  restoring.value = true
  try {
    assertDriveRestorePreviewReady(preview)
    const { backup, imported } = await runConfirmedDriveAppDataRestore({
      preview,
      downloadBackup: () => restoreGoogleBackupJsonByTarget(ledgerId, target),
      createRecoveryBackup: createRestoreRecoveryBackup,
      source: 'DriveAppDataRestorePanel.confirmRestore',
      i18nKey: 'settings_auto_backup.toast.recovery_backup_required',
      wipeFn: () => resetDatabase({
        confirmed: true,
        reason: DATA_WIPE_REASON.USER_RESTORE_GOOGLE_BACKUP,
        source: 'DriveAppDataRestorePanel.confirmRestore',
      }),
      importBackupJson: (jsonText) => importBackupJsonAsNewLedgers(jsonText, {
        ledgerNameSuffix: '',
        runIntegrityRepair: true,
        integrityRepairReason: LEDGER_REPAIR_REASON.USER_RESTORE_BACKUP,
        integrityRepairSource: 'DriveAppDataRestorePanel.confirmRestore',
      }),
      // smb299 tick13: if import still fails after wipe, rehydrate from durable recovery.
      restoreFromRecovery: async (proof) => {
        const loaded = await loadRecoveryBackupJsonText(proof?.backupId)
        if (!loaded?.jsonText) {
          throw new Error('recovery rollback payload missing')
        }
        await importBackupJsonAsNewLedgers(loaded.jsonText, {
          ledgerNameSuffix: '',
          runIntegrityRepair: true,
          integrityRepairReason: LEDGER_REPAIR_REASON.USER_RESTORE_BACKUP,
          integrityRepairSource: 'DriveAppDataRestorePanel.restoreFromRecovery',
        })
      },
    })
    await ledgerStore.refresh()
    if (imported.firstLedgerId) {
      await ledgerStore.switchLedger(imported.firstLedgerId)
    }
    const restoredCount = Number(imported.importedLedgers?.length ?? 0)
    const restoredName = imported.firstLedgerName || imported.importedLedgers?.[0]?.ledgerName || ''
    const restoredLabel =
      restoredCount > 1
        ? t('settings_auto_backup.restore.multiple_ledgers', { count: restoredCount })
        : restoredName
    const usedFilename = backup.filename
      ? t('settings_auto_backup.restore.filename_suffix', { filename: backup.filename })
      : ''
    uiStore.pushToast(
      t('settings_auto_backup.toast.google_restore_done', {
        restoredLabel,
        hint: '',
        fileSuffix: usedFilename,
      }),
    )
    closeRestoreConfirm({ force: true })
    await refreshFiles()
  } catch (error) {
    console.error('[drive-appdata-restore] failed', error)
    const toastKey =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? 'settings_auto_backup.toast.recovery_backup_required'
        : error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE
          ? 'settings_auto_backup.drive_browser.preview_required'
          : error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
            || error?.code === 'DRIVE_RESTORE_IMPORT_FAILED_RESTORED'
            ? 'settings_auto_backup.drive_browser.not_importable'
            : 'settings_auto_backup.toast.google_restore_failed'
    uiStore.pushToast(errorMessage(error, t(toastKey)), 'error')
  } finally {
    restoring.value = false
  }
}

watch(
  () => [props.connected, props.ledgerId, hasTestMock.value],
  ([connected]) => {
    if (connected || hasTestMock.value) {
      void refreshFiles()
    } else {
      files.value = []
      listedOnce.value = false
      listError.value = ''
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearRestoreTimer()
})
</script>

<style scoped>
.drive-appdata-panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}
.drive-file-list,
.drive-revision-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.drive-file-item,
.drive-revision-item {
  display: grid;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid color-mix(in srgb, var(--border, #ccc) 70%, transparent);
}
.drive-file-item:first-child {
  border-top: 0;
  padding-top: 0;
}
.drive-file-meta {
  display: grid;
  gap: 2px;
}
.drive-file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.drive-revision-block {
  margin-left: 4px;
  padding: 8px 10px;
  border-left: 3px solid color-mix(in srgb, var(--primary) 45%, transparent);
  display: grid;
  gap: 8px;
}
.preview-meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.preview-meta-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.warn {
  color: var(--danger, #b42318);
}
.compact {
  margin: 0;
  font-size: 13px;
}
.backup-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: color-mix(in srgb, #000 42%, transparent);
  display: grid;
  place-items: end center;
  padding: 16px;
}
.restore-dialog {
  width: min(520px, 100%);
  padding: 16px;
  display: grid;
  gap: 10px;
}
.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.16s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
