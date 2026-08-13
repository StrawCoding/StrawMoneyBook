<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">代收管理</h2>
      <div class="row header-actions">
        <RouterLink class="btn" :to="{ name: 'reimbursement-advance-usage-manage' }">抵扣紀錄</RouterLink>
        <RouterLink class="btn back-btn" :to="{ name: 'reimbursements' }">返回</RouterLink>
      </div>
    </header>

    <article class="card panel">
      <header class="row panel-head">
        <h3>新增代收</h3>
      </header>

      <div class="stack form-wrap">
        <label>
          代收金額（元）
          <input v-model.number="form.amountMajor" type="number" min="0" step="1" class="input" />
        </label>

        <label>
          代收帳戶
          <CustomSelect v-model="form.accountId" :groups="accountStore.groupedRegularAccounts" />
        </label>

        <label>
          歸還金額（元，留空則同代收金額）
          <input v-model.number="form.returnAmountMajor" type="number" min="0" step="1" class="input" placeholder="可自訂歸還金額" />
        </label>

        <label>
          備註
          <input v-model.trim="form.note" type="text" class="input" placeholder="例如：公司先墊付報銷款" />
        </label>
      </div>

      <footer class="row panel-actions">
        <button class="btn primary" :disabled="creating || !canCreateAdvance" @click="submitAdvance">
          {{ creating ? '建立中...' : '新增代收' }}
        </button>
      </footer>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>可用代收</h3>
        <small class="muted">共 {{ visibleAdvances.length }} 筆</small>
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
              <small class="muted">帳戶：{{ advance.account_name || '未指定帳戶' }}</small>
              <small v-if="advance.return_amount_minor != null" class="muted">歸還：<MoneyText :value-minor="advance.return_amount_minor" /></small>
              <small class="muted">可用：<MoneyText :value-minor="advance.available_minor" /></small>
              <small class="muted">已抵：<MoneyText :value-minor="advance.used_minor" /></small>
              <small class="muted">日期：{{ formatTime(advance.received_at) }}</small>
              <small v-if="advance.note" class="muted break-word">{{ advance.note }}</small>
            </div>
          </div>

          <div class="advance-actions">
            <button
              class="btn danger"
              :disabled="deletingAdvanceId === advance.id || !canDeleteAdvance(advance)"
              :title="canDeleteAdvance(advance) ? '刪除代收' : '已有抵扣紀錄，需先刪除抵扣紀錄才能刪除代收'"
              @click="openDeleteDialog(advance)"
            >
              {{ deletingAdvanceId === advance.id ? '刪除中...' : '刪除' }}
            </button>
          </div>
        </li>

        <li v-if="!visibleAdvances.length" class="muted">目前沒有尚可抵扣的代收資料</li>
      </ul>
      <p class="muted page-hint">部分抵扣但仍有餘額的代收會保留在此；完全抵扣的紀錄可到「抵扣紀錄」查看。</p>
    </article>

    <AppDialog
      :open="Boolean(deleteTarget)"
      title="刪除代收"
      :message="deleteDialogMessage"
      confirm-text="確認刪除"
      cancel-text="取消"
      loading-text="刪除中..."
      :loading="Boolean(deletingAdvanceId)"
      @close="closeDeleteDialog"
      @confirm="confirmDeleteAdvance"
    />
  </section>
</template>

<script setup>
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
  return `確定要刪除這筆代收？\n${advanceCategoryName(deleteTarget.value)} / ${deleteTarget.value.account_name || '未指定帳戶'}`
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
    uiStore.pushToast('代收已新增')
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增代收失敗', 'error')
  } finally {
    creating.value = false
  }
}

function openDeleteDialog(advance) {
  const advanceId = String(advance?.id ?? '').trim()
  if (!advanceId || deletingAdvanceId.value) return
  if (!canDeleteAdvance(advance)) {
    uiStore.pushToast('已有抵扣紀錄的代收需先刪除抵扣紀錄', 'error')
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
    uiStore.pushToast('代收已刪除')
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除代收失敗', 'error')
  } finally {
    deletingAdvanceId.value = ''
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

function canDeleteAdvance(advance) {
  return Math.max(0, Math.round(Number(advance?.used_minor ?? 0))) <= 0
}

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
