<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">變更報銷金額</h2>
      <RouterLink class="btn back-btn" :to="backLink">返回</RouterLink>
    </header>

    <article v-if="targetTx" class="card panel">
      <header class="row">
        <h3>{{ targetTx.category_name || noteTextOfTx(targetTx) || '未命名分類' }}</h3>
        <MoneyText :value-minor="originalMinorOfTx(targetTx)" />
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">原交易時間</small>
          <span>{{ formatTime(targetTx.occurred_at) }}</span>
        </div>
        <div class="detail-row">
          <small class="muted">目前已報銷</small>
          <MoneyText :value-minor="reimbursedMinorOfTx(targetTx)" />
        </div>
      </div>

      <label class="field">
        報銷金額（元）
        <input v-model.number="form.amountMajor" class="input" type="number" min="0" step="1" />
      </label>

      <div class="field">
        <span>代收抵扣（可複選）</span>
        <div v-if="usableAdvances.length" class="advance-list">
          <label v-for="advance in usableAdvances" :key="advance.id" class="advance-item">
            <input v-model="form.selectedAdvanceIds" type="checkbox" :value="advance.id" />
            <span class="advance-item-main">
              <span class="advance-item-category">
                <font-awesome-icon
                  v-if="advanceCategoryIcon(advance)"
                  :icon="advanceCategoryIcon(advance)"
                  class="advance-category-icon"
                />
                <span>{{ advanceCategoryName(advance) }}</span>
              </span>
              <small class="muted">{{ advance.account_name || '未指定帳戶' }}</small>
            </span>
            <MoneyText :value-minor="advanceUsableMinor(advance)" />
          </label>
        </div>
        <small v-else class="muted">目前沒有可用代收</small>
        <small v-if="selectedAdvanceCapacityMinor > 0" class="muted">
          本次代收抵扣 <MoneyText :value-minor="selectedAdvanceCapacityMinor" />
        </small>
        <small class="muted">可跨不同帳戶抵消，僅扣代收額度，不另建轉帳。</small>
        <small v-if="cashSettleMinor <= 0" class="muted">本次將全額以代收抵扣，不再建立新的入帳交易。</small>
      </div>

      <label v-if="cashSettleMinor > 0" class="field">
        入帳帳戶
        <CustomSelect v-model="form.accountId" :groups="accountStore.groupedRegularAccounts" />
      </label>

      <div class="row action-row">
        <button class="btn" :disabled="saving" @click="goBack">取消</button>
        <button class="btn primary" :disabled="saving || !canSave" @click="save">{{ saving ? '儲存中...' : '儲存變更' }}</button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">找不到這筆報銷資料，可能已被移除。</p>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { reimbursementOriginalMinor, reimbursementReimbursedMinor } from '@/ui/utils/reimbursement-item'

const route = useRoute()
const router = useRouter()
const reimbursementStore = useReimbursementStore()
const accountStore = useAccountStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()

const saving = ref(false)
const form = reactive({
  amountMajor: 0,
  accountId: '',
  selectedAdvanceIds: [],
})

const txId = computed(() => String(route.params.id ?? ''))
const targetTx = computed(() => reimbursementStore.reimbursedItems.find((item) => item.id === txId.value) ?? null)

const backLink = computed(() => ({
  name: 'reimbursements',
  query: { tab: 'reimbursed' },
}))

const canSave = computed(() => {
  if (!Number.isFinite(Number(form.amountMajor)) || Number(form.amountMajor) <= 0) return false
  if (cashSettleMinor.value > 0) {
    return Boolean(String(form.accountId ?? '').trim())
  }
  return true
})
const selectedAdvanceIdSet = computed(() => {
  return new Set((form.selectedAdvanceIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
})
const usableAdvances = computed(() => {
  return reimbursementStore.advances.filter((item) => {
    const availableMinor = Number(item.available_minor ?? 0)
    return availableMinor > 0 || selectedAdvanceIdSet.value.has(String(item.id))
  })
})
const settleAmountMinor = computed(() => Math.max(0, Math.round(Number(form.amountMajor ?? 0) * 100)))
const selectedAdvanceCapacityMinor = computed(() => {
  const advanceMap = new Map(usableAdvances.value.map((item) => [String(item?.id ?? '').trim(), item]))
  let remainingMinor = settleAmountMinor.value
  let totalMinor = 0
  for (const rawAdvanceId of form.selectedAdvanceIds ?? []) {
    const advanceId = String(rawAdvanceId ?? '').trim()
    if (!advanceId || remainingMinor <= 0) continue
    const advance = advanceMap.get(advanceId)
    if (!advance) continue
    const availableMinor = advanceUsableMinor(advance)
    if (availableMinor <= 0) continue
    const appliedMinor = Math.min(availableMinor, remainingMinor)
    totalMinor += appliedMinor
    remainingMinor -= appliedMinor
  }
  return totalMinor
})
const cashSettleMinor = computed(() => Math.max(0, settleAmountMinor.value - selectedAdvanceCapacityMinor.value))

watch(
  () => targetTx.value,
  (tx) => {
    if (!tx) return
    const defaultMinor = reimbursedMinorOfTx(tx) || originalMinorOfTx(tx)
    form.amountMajor = defaultMinor / 100
    form.accountId = String(tx.reimbursed_account_id ?? accountStore.accounts[0]?.id ?? tx.account_id ?? '')
    form.selectedAdvanceIds = Array.isArray(tx.advance_ids) ? [...tx.advance_ids] : []
  },
  { immediate: true },
)

onMounted(async () => {
  await Promise.all([reimbursementStore.load(), accountStore.load()])
})

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

function advanceCategoryName(advance) {
  const name = String(advance?.category_name ?? '').trim()
  if (name) return name
  const note = String(advance?.note ?? '').trim()
  return note || '代收'
}

function advanceCategoryIcon(advance) {
  return String(advance?.category_icon ?? '').trim()
}

function advanceUsableMinor(advance) {
  const advanceId = String(advance?.id ?? '').trim()
  const availableMinor = Math.max(0, Math.round(Number(advance?.available_minor ?? 0)))
  const usedMap = targetTx.value?.advance_usage_map ?? {}
  const currentUsedMinor = Math.max(0, Math.round(Number(usedMap?.[advanceId] ?? 0)))
  return availableMinor + currentUsedMinor
}

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

async function save() {
  if (!targetTx.value || !canSave.value || saving.value) return

  saving.value = true
  try {
    await reimbursementStore.settle(targetTx.value.id, {
      amountMinor: settleAmountMinor.value,
      accountId: cashSettleMinor.value > 0 ? form.accountId : '',
      occurredAt: new Date().toISOString(),
      note: `報銷入帳（來源交易：${targetTx.value.id}）`,
      selectedAdvanceIds: form.selectedAdvanceIds,
      allowUpdate: true,
    })
    await Promise.all([transactionStore.loadRecent(), accountStore.load()])
    uiStore.pushToast('報銷金額已更新')
    goBack()
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新失敗', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-header {
  align-items: center;
}

.page-title,
h3 {
  margin: 0;
}

.detail-grid {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.field {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.advance-list {
  display: grid;
  gap: 8px;
}

.advance-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  color: var(--text);
}

.advance-item-main {
  display: grid;
  gap: 2px;
}

.advance-item-category {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.advance-category-icon {
  width: 14px;
  text-align: center;
}

.action-row {
  margin-top: 12px;
  justify-content: flex-end;
  gap: 8px;
}
</style>
