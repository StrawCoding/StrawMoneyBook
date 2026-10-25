<template>
  <HabitatPageShell
    :title="t('reimbursement.advance_manage_title')"
    :kicker="t('reimbursement.habitat_hello')"
    test-id="reimbursement-advance-view"
    back-to="/reimbursements"
  >

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('reimbursement.add_advance') }}</h3>
      </header>

      <div class="stack form-wrap">
        <label>
          {{ t('reimbursement.advance_amount_yuan') }}
          <input v-model.number="form.amountMajor" type="number" min="0" step="1" class="input" />
        </label>

        <label>
          {{ t('reimbursement.advance_account') }}
          <CustomSelect v-model="form.accountId" :groups="accountStore.groupedRegularAccounts" />
        </label>

        <label>
          {{ t('reimbursement.repay_amount_optional') }}
          <input v-model.number="form.returnAmountMajor" type="number" min="0" step="1" class="input" :placeholder="t('reimbursement.custom_repay_amount')" />
        </label>

        <label>
          {{ t('common.note') }}
          <input v-model.trim="form.note" type="text" class="input" :placeholder="t('reimbursement.advance_note_example')" />
        </label>
      </div>

      <footer class="row panel-actions">
        <button class="btn primary" :disabled="creating || !canCreateAdvance" @click="submitAdvance">
          {{ creating ? t('claim_sheet.creating') : t('reimbursement.add_advance') }}
        </button>
      </footer>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('reimbursement.available_advance') }}</h3>
        <small class="muted">{{ t('common.total_items', { count: visibleAdvances.length }) }}</small>
      </header>

      <ul class="advance-list">
        <li v-for="advance in visibleAdvances" :key="advance.id" class="advance-item">
          <div class="advance-main">
            <div class="row advance-title-row">
              <span class="advance-title">
                <font-awesome-icon
                  v-if="advanceCategoryIcon(advance)"
                  :icon="advanceCategoryIcon(advance)"
                  class="advance-category-icon"
                />
                <strong>{{ advanceCategoryName(advance) }}</strong>
              </span>
              <MoneyText :value-minor="advance.amount_minor" />
            </div>

            <div class="advance-meta">
              <small class="muted">{{ t('reimbursement_advance_usage.account_prefix') }}{{ advance.account_name || t('common.unknown_account') }}</small>
              <small v-if="advance.return_amount_minor != null" class="muted">{{ t('reimbursement.repay_prefix') }}<MoneyText :value-minor="advance.return_amount_minor" /></small>
              <small class="muted">{{ t('reimbursement.available_prefix') }}<MoneyText :value-minor="advance.available_minor" /></small>
              <small class="muted">{{ t('reimbursement.offset_prefix') }}<MoneyText :value-minor="advance.used_minor" /></small>
              <small class="muted">{{ t('common.date_prefix') }}{{ formatTime(advance.received_at) }}</small>
              <small v-if="advance.note" class="muted break-word">{{ advance.note }}</small>
            </div>
          </div>

          <div class="advance-actions">
            <button
              class="btn danger"
              :disabled="deletingAdvanceId === advance.id || !canDeleteAdvance(advance)"
              :title="canDeleteAdvance(advance) ? t('reimbursement.delete_advance') : t('reimbursement.delete_advance_blocked')"
              @click="openDeleteDialog(advance)"
            >
              {{ deletingAdvanceId === advance.id ? t('reimbursement_advance_usage.deleting') : t('common.delete') }}
            </button>
          </div>
        </li>

        <li v-if="!visibleAdvances.length" class="muted">{{ t('reimbursement.no_open_advance') }}</li>
      </ul>
      <p class="muted page-hint">{{ t('reimbursement.partial_advance_hint') }}</p>
    </article>

    <AppDialog
      :open="Boolean(deleteTarget)"
      :title="t('reimbursement.delete_advance')"
      :message="deleteDialogMessage"
      :confirm-text="t('common.confirm_delete')"
      :cancel-text="t('common.cancel')"
      :loading-text="t('reimbursement_advance_usage.deleting')"
      :loading="Boolean(deletingAdvanceId)"
      @close="closeDeleteDialog"
      @confirm="confirmDeleteAdvance"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'

const reimbursementStore = useReimbursementStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()

const creating = ref(false)
const deletingAdvanceId = ref('')
const deleteTarget = ref(null)
const form = reactive({
  amountMajor: 0,
  returnAmountMajor: null,
  accountId: '',
  note: '',
})

const visibleAdvances = computed(() => {
  return reimbursementStore.advances.filter((item) => Math.max(0, Math.round(Number(item?.available_minor ?? 0))) > 0)
})
const deleteDialogMessage = computed(() => {
  if (!deleteTarget.value) return ''
  return t('reimbursement.confirm_delete_advance', {
    name: advanceCategoryName(deleteTarget.value),
    account: deleteTarget.value.account_name || t('common.unknown_account'),
  })
})
const canCreateAdvance = computed(() => {
  return Number.isFinite(Number(form.amountMajor))
    && Number(form.amountMajor) > 0
    && Boolean(String(form.accountId ?? '').trim())
})

onMounted(async () => {
  await Promise.all([
    reimbursementStore.load(),
    accountStore.load(),
  ])
  resetForm()
})

function resetForm() {
  form.amountMajor = 0
  form.returnAmountMajor = null
  form.accountId = String(accountStore.accounts[0]?.id ?? '')
  form.note = ''
}

async function submitAdvance() {
  if (creating.value || !canCreateAdvance.value) return
  creating.value = true
  try {
    const returnAmountMinorRaw = Number(form.returnAmountMajor ?? '')
    await reimbursementStore.createAdvance({
      amountMinor: Math.round(Number(form.amountMajor ?? 0) * 100),
      returnAmountMinor: Number.isFinite(returnAmountMinorRaw) && returnAmountMinorRaw > 0
        ? Math.round(returnAmountMinorRaw * 100)
        : null,
      accountId: form.accountId,
      note: form.note,
      receivedAt: new Date().toISOString(),
    })
    resetForm()
    uiStore.pushToast(t('reimbursement.advance_created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('reimbursement.add_advance_failed'), 'error')
  } finally {
    creating.value = false
  }
}

function openDeleteDialog(advance) {
  const advanceId = String(advance?.id ?? '').trim()
  if (!advanceId || deletingAdvanceId.value) return
  if (!canDeleteAdvance(advance)) {
    uiStore.pushToast(t('reimbursement.delete_advance_need_offsets'), 'error')
    return
  }
  deleteTarget.value = advance
}

function closeDeleteDialog() {
  if (deletingAdvanceId.value) return
  deleteTarget.value = null
}

async function confirmDeleteAdvance() {
  const advanceId = String(deleteTarget.value?.id ?? '').trim()
  if (!advanceId || deletingAdvanceId.value) return

  deletingAdvanceId.value = advanceId
  try {
    await reimbursementStore.deleteAdvance(advanceId)
    deleteTarget.value = null
    uiStore.pushToast(t('reimbursement.advance_deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('reimbursement.delete_advance_failed'), 'error')
  } finally {
    deletingAdvanceId.value = ''
  }
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

function canDeleteAdvance(advance) {
  return Math.max(0, Math.round(Number(advance?.used_minor ?? 0))) <= 0
}

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
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-header,
.panel-head,
.panel-actions,
.advance-title-row {
  align-items: center;
}

.header-actions {
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.page-title,
h3 {
  margin: 0;
}

.form-wrap {
  margin-top: 12px;
}

.panel-actions {
  justify-content: flex-end;
  margin-top: 12px;
}

.advance-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.advance-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.advance-main,
.advance-meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.advance-title {
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

.advance-actions {
  display: flex;
  justify-content: flex-end;
}

.page-hint {
  margin: 12px 0 0;
}
</style>
