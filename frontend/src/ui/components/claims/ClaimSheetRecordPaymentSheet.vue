<template>
  <InputBottomSheet
    :open="open"
    :title="t('claim_sheet.record_payment')"
    size="form"
    :header-close="false"
    close-variant="icon"
    :body-class="'stack form-wrap'"
    :sheet-class="'sheet'"
    :show-footer="true"
    @close="requestClose"
  >
    <template v-if="targetClaim">
      <div class="row">
        <span>{{ t('claim_sheet.sheet_label') }}</span>
        <strong>{{ targetClaim.title }}</strong>
      </div>
      <div v-if="targetClaim.counterparty_name" class="row">
        <span>{{ t('claim_sheet.form.counterparty') }}</span>
        <strong>{{ targetClaim.counterparty_name }}</strong>
      </div>
      <div class="row">
        <span>{{ t('claim_sheet.net_amount') }}</span>
        <MoneyText :value-minor="targetClaim.total_minor" />
      </div>
      <div class="row">
        <span>{{ t('claim_sheet.paid_amount') }}</span>
        <MoneyText :value-minor="claimPaidMinorOf(targetClaim)" />
      </div>
      <div class="row">
        <span>{{ t('claim_sheet.remaining_amount') }}</span>
        <MoneyText :value-minor="completeRemainingMinor" />
      </div>
      <label>
        {{ t('claim_sheet.form.payment_amount') }}
        <input
          v-model.number="completeForm.amountMajor"
          class="input"
          data-testid="claim-payment-amount"
          type="number"
          min="0"
          step="1"
        />
      </label>
      <div class="copy-wrap">
        <p class="copy-title">代收抵扣（可複選）</p>
        <div v-if="usableCompleteAdvances.length" class="copy-ledger-list">
          <label v-for="advance in usableCompleteAdvances" :key="advance.id" class="copy-ledger-item">
            <input v-model="completeForm.selectedAdvanceIds" class="copy-ledger-check" type="checkbox" :value="advance.id" />
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
        <div v-if="selectedCompleteAdvanceCapacityMinor > 0" class="row advance-summary-row">
          <span>本次代收抵扣</span>
          <MoneyText :value-minor="selectedCompleteAdvanceCapacityMinor" />
        </div>
        <p class="muted">代收只是可抵金額紀錄，可跨不同帳戶抵消；從 A 收，也可以從 B 出。</p>
        <p v-if="completeAdvanceOffsettableMinor <= 0" class="muted">這張請款單沒有可供代收抵扣的匯入報銷項目。</p>
        <p v-else class="muted">代收會優先抵扣匯入的報銷項目，剩餘金額才建立新的入帳交易。</p>
        <p v-if="completeCashMinor <= 0" class="muted">本次將全額以代收抵扣，不再建立新的入帳交易。</p>
      </div>
      <label v-if="completeRequiresAccount">
        {{ t('claim_sheet.form.account') }}
        <CustomSelect v-model="completeForm.accountId" :groups="accountStore.groupedRegularAccounts" />
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
    </template>
    <template #footer>
      <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
      <button
        class="btn primary"
        data-testid="claim-payment-submit"
        :disabled="completing || !canCompleteClaim"
        @click="submitCompleteSheet"
      >
        {{ completing ? t('claim_sheet.processing') : (isCompleteFullRemaining ? t('claim_sheet.confirm_complete') : t('claim_sheet.confirm_payment')) }}
      </button>
    </template>
  </InputBottomSheet>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { getReimbursementDetail, markReimbursementPaid } from '@/core/services/reimbursement.service'
import {
  allocateClaimPaymentFifo,
  claimPaidMinorOf,
  claimRemainingMinor,
  isAdvanceClaimItem,
  isBorrowLoanClaimItem,
} from '@/core/utils/claim-sheet-payment'

const props = defineProps({
  open: { type: Boolean, default: false },
  claim: { type: Object, default: null },
})

const emit = defineEmits(['close', 'recorded'])

const { t } = useI18n()
const uiStore = useUiStore()
const reimbursementStore = useReimbursementStore()
const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()

const targetClaim = ref(null)
const completeItems = ref([])
const completing = ref(false)
const completeForm = reactive({
  accountId: '',
  note: '',
  amountMajor: 0,
  selectedAdvanceIds: [],
})

const selectedCompleteAdvanceIdSet = computed(() => {
  return new Set((completeForm.selectedAdvanceIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
})

const usableCompleteAdvances = computed(() => {
  return reimbursementStore.advances.filter((item) => {
    const advanceId = String(item?.id ?? '').trim()
    const availableMinor = Math.max(0, Math.round(Number(item?.available_minor ?? 0)))
    return Boolean(advanceId) && (availableMinor > 0 || selectedCompleteAdvanceIdSet.value.has(advanceId))
  })
})

const completeRemainingMinor = computed(() => claimRemainingMinor(targetClaim.value))

const completePaymentMinor = computed(() => {
  return Math.max(0, Math.round(Number(completeForm.amountMajor ?? 0) * 100))
})

const completePaymentAllocations = computed(() => {
  return allocateClaimPaymentFifo(completeItems.value, completePaymentMinor.value).allocations
})

const isCompleteFullRemaining = computed(() => {
  return completePaymentMinor.value > 0 && completePaymentMinor.value === completeRemainingMinor.value
})

const completeAdvanceOffsettableMinor = computed(() => {
  return completePaymentAllocations.value.reduce((sum, row) => {
    if (isBorrowLoanClaimItem(row.item) || isAdvanceClaimItem(row.item)) return sum
    const txId = String(row.item?.transaction_id ?? '').trim()
    if (!txId || String(row.item?.entry_type ?? '') === 'income') return sum
    return sum + row.amountMinor
  }, 0)
})

const selectedCompleteAdvanceCapacityMinor = computed(() => {
  let remainingMinor = completeAdvanceOffsettableMinor.value
  if (remainingMinor <= 0) return 0

  const advanceMap = new Map(usableCompleteAdvances.value.map((item) => [String(item?.id ?? '').trim(), item]))
  let totalMinor = 0

  for (const rawAdvanceId of completeForm.selectedAdvanceIds ?? []) {
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

const completeCashMinor = computed(() => {
  const paymentMinor = completePaymentMinor.value
  return Math.max(
    0,
    paymentMinor
      - selectedCompleteAdvanceCapacityMinor.value
      - completeClaimAdvanceMinor.value
      - completeBorrowLoanMinor.value,
  )
})

const completeClaimAdvanceMinor = computed(() => {
  return completePaymentAllocations.value.reduce((sum, row) => {
    if (!isAdvanceClaimItem(row.item)) return sum
    return sum + row.amountMinor
  }, 0)
})

const completeBorrowLoanMinor = computed(() => {
  return completePaymentAllocations.value.reduce((sum, row) => {
    if (!isBorrowLoanClaimItem(row.item)) return sum
    return sum + row.amountMinor
  }, 0)
})

const completeRequiresAccount = computed(() => (
  completeCashMinor.value > 0
  || completeClaimAdvanceMinor.value > 0
  || completeBorrowLoanMinor.value > 0
))

const canCompleteClaim = computed(() => {
  if (!targetClaim.value) return false
  if (completePaymentMinor.value <= 0) return false
  if (completePaymentMinor.value > completeRemainingMinor.value) return false
  if (allocateClaimPaymentFifo(completeItems.value, completePaymentMinor.value).leftoverMinor > 0) return false
  if (!completeRequiresAccount.value) return true
  return accountStore.accounts.some((item) => item.id === String(completeForm.accountId ?? '').trim())
})

function setCompleteAmountToRemaining(claim) {
  completeForm.amountMajor = claimRemainingMinor(claim) / 100
}

function resetCompleteForm(claim) {
  completeForm.accountId = String(accountStore.accounts[0]?.id ?? '')
  completeForm.note = String(claim?.title ?? '').trim()
    ? t('claim_sheet.default_complete_note_named', { title: claim.title })
    : t('claim_sheet.default_complete_note')
  completeForm.selectedAdvanceIds = []
  setCompleteAmountToRemaining(claim)
}

function requestClose() {
  if (completing.value) return
  emit('close')
}

async function loadCompleteItems(claimId) {
  if (!ledgerStore.activeLedgerId || !claimId) return
  try {
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claimId)
    if (String(targetClaim.value?.id ?? '') !== String(claimId)) return
    targetClaim.value = detail.claim ?? targetClaim.value
    completeItems.value = Array.isArray(detail.items) ? detail.items : []
    setCompleteAmountToRemaining(targetClaim.value)
  } catch (error) {
    emit('close')
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  }
}

function advanceCategoryName(advance) {
  const name = String(advance?.category_name ?? '').trim()
  if (name) return name
  const note = String(advance?.note ?? '').trim()
  return note || '代收'
}

function advanceCategoryIcon(advance) {
  return String(advance?.category_icon ?? '').trim()
}

async function submitCompleteSheet() {
  if (!canCompleteClaim.value || completing.value || !ledgerStore.activeLedgerId || !targetClaim.value) return

  completing.value = true
  try {
    const result = await markReimbursementPaid(ledgerStore.activeLedgerId, {
      reimbursementId: targetClaim.value.id,
      accountId: completeRequiresAccount.value ? completeForm.accountId : '',
      note: completeForm.note,
      selectedAdvanceIds: completeForm.selectedAdvanceIds,
      amountMinor: completePaymentMinor.value,
    })
    await Promise.all([accountStore.load(), reimbursementStore.load()])
    const remainingMinor = Math.max(0, Math.round(Number(result?.remainingMinor ?? 0)))
    if (remainingMinor > 0) {
      uiStore.pushToast(t('claim_sheet.toast.recorded_remaining', { amount: remainingMinor / 100 }))
    } else {
      uiStore.pushToast(t('claim_sheet.toast.completed'))
    }
    emit('recorded', { result, claim: targetClaim.value })
    emit('close')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.complete_failed'), 'error')
  } finally {
    completing.value = false
  }
}

watch(
  () => [props.open, props.claim?.id, props.claim?.updated_at],
  ([isOpen, claimId]) => {
    if (!isOpen || !claimId) {
      targetClaim.value = null
      completeItems.value = []
      completeForm.selectedAdvanceIds = []
      return
    }
    targetClaim.value = props.claim ? { ...props.claim } : null
    completeItems.value = []
    resetCompleteForm(targetClaim.value)
    void loadCompleteItems(claimId)
  },
  { immediate: true },
)
</script>

<style scoped>
.copy-wrap {
  display: grid;
  gap: 10px;
}

.copy-title {
  margin: 0;
  font-weight: 600;
}

.copy-ledger-list {
  display: grid;
  gap: 8px;
}

.copy-ledger-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.copy-ledger-check {
  position: absolute;
  opacity: 0;
}

.copy-ledger-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 12px;
}

.copy-ledger-item:has(.copy-ledger-check:checked) .copy-ledger-mark {
  background: var(--primary);
  color: var(--on-primary);
  border-color: transparent;
}

.copy-ledger-name {
  display: grid;
  gap: 4px;
}

.advance-meta-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.advance-category-icon {
  opacity: 0.85;
}

.advance-summary-row {
  justify-content: space-between;
}
</style>
