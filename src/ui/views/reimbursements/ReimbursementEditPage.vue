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

      <label class="field">
        入帳帳戶
        <CustomSelect v-model="form.accountId" :options="accountStore.accounts" />
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
})

const txId = computed(() => String(route.params.id ?? ''))
const targetTx = computed(() => reimbursementStore.reimbursedItems.find((item) => item.id === txId.value) ?? null)

const backLink = computed(() => ({
  name: 'reimbursements',
  query: { tab: 'reimbursed' },
}))

const canSave = computed(() => {
  return Number.isFinite(Number(form.amountMajor)) && Number(form.amountMajor) > 0 && !!String(form.accountId ?? '').trim()
})

watch(
  () => targetTx.value,
  (tx) => {
    if (!tx) return
    const defaultMinor = reimbursedMinorOfTx(tx) || originalMinorOfTx(tx)
    form.amountMajor = defaultMinor / 100
    form.accountId = String(tx.reimbursed_account_id ?? accountStore.accounts[0]?.id ?? tx.account_id ?? '')
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

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

async function save() {
  if (!targetTx.value || !canSave.value || saving.value) return

  saving.value = true
  try {
    await reimbursementStore.settle(targetTx.value.id, {
      amountMinor: Math.round(Number(form.amountMajor ?? 0) * 100),
      accountId: form.accountId,
      occurredAt: new Date().toISOString(),
      note: `報銷入帳（來源交易：${targetTx.value.id}）`,
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

.action-row {
  margin-top: 12px;
  justify-content: flex-end;
  gap: 8px;
}
</style>
