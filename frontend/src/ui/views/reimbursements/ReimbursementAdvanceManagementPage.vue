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
          <CustomSelect v-model="form.accountId" :options="accountStore.accounts" />
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
        <h3>未抵扣代收</h3>
        <small class="muted">共 {{ deletableAdvances.length }} 筆</small>
      </header>

      <ul class="advance-list">
        <li v-for="advance in deletableAdvances" :key="advance.id" class="advance-item">
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
              <small class="muted">可用：<MoneyText :value-minor="advance.available_minor" /></small>
              <small class="muted">已抵：<MoneyText :value-minor="advance.used_minor" /></small>
              <small class="muted">日期：{{ formatTime(advance.received_at) }}</small>
              <small v-if="advance.note" class="muted break-word">{{ advance.note }}</small>
            </div>
          </div>

          <div class="advance-actions">
            <button
              class="btn danger"
              :disabled="deletingAdvanceId === advance.id"
              @click="openDeleteDialog(advance)"
            >
              {{ deletingAdvanceId === advance.id ? '刪除中...' : '刪除' }}
            </button>
          </div>
        </li>

        <li v-if="!deletableAdvances.length" class="muted">目前沒有可直接管理的代收資料</li>
      </ul>
      <p class="muted page-hint">已有抵扣紀錄的代收已移到「抵扣紀錄」頁管理。</p>
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
  accountId: '',
  note: '',
})

const deletableAdvances = computed(() => {
  return reimbursementStore.advances.filter((item) => Math.max(0, Math.round(Number(item?.used_minor ?? 0))) <= 0)
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
  form.accountId = String(accountStore.accounts[0]?.id ?? '')
  form.note = ''
}

async function submitAdvance() {
  if (creating.value || !canCreateAdvance.value) return
  creating.value = true
  try {
    await reimbursementStore.createAdvance({
      amountMinor: Math.round(Number(form.amountMajor ?? 0) * 100),
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
