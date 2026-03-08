<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">母分類設定</h2>
      <RouterLink class="btn back-btn" to="/assets/accounts">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="group" class="card panel">
      <header class="row">
        <h3>{{ group.name }}</h3>
        <button class="btn primary" :disabled="!canSave || saving" @click="saveGroupProfile">
          {{ saving ? '儲存中...' : '儲存變更' }}
        </button>
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">目前排序</small>
          <span>{{ currentOrder }}</span>
        </div>
      </div>

      <label class="field">
        群組名稱
        <input v-model="nameInput" class="input" type="text" maxlength="40" placeholder="請輸入群組名稱" />
      </label>

      <label class="field">
        排序數字（1 開始）
        <input v-model="orderInput" class="input" type="number" min="1" step="1" />
      </label>
      <p v-if="nameInvalid" class="error-text">群組名稱不可為空</p>
      <p v-if="orderInvalid" class="error-text">排序數字需為大於 0 的整數</p>

      <div class="row action-row">
        <button class="btn danger" :disabled="deleting" @click="removeGroupRecord">
          {{ deleting ? '處理中...' : '刪除母分類' }}
        </button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">找不到此母分類，可能已刪除。</p>
    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      title="確認刪除"
      :message="`確定刪除母分類「${group?.name ?? ''}」？`"
      confirm-text="確認刪除"
      :loading="deleting"
      loading-text="處理中..."
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveGroupRecord"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)
const nameInput = ref('')
const orderInput = ref('1')

const groupId = computed(() => String(route.params.id ?? ''))
const group = computed(() => accountStore.groups.find((item) => item.id === groupId.value) ?? null)
const currentOrder = computed(() => {
  const index = accountStore.groups.findIndex((item) => item.id === groupId.value)
  return index >= 0 ? index + 1 : 1
})

const parsedOrderInput = computed(() => {
  const value = Number(orderInput.value)
  if (!Number.isFinite(value)) return null
  if (!Number.isInteger(value)) return null
  if (value <= 0) return null
  return value
})

const nameInvalid = computed(() => !String(nameInput.value ?? '').trim())
const orderInvalid = computed(() => parsedOrderInput.value == null)
const canSave = computed(() => {
  if (!group.value || orderInvalid.value || nameInvalid.value) return false
  const nextName = String(nameInput.value ?? '').trim()
  const nextOrder = clampOrder(parsedOrderInput.value ?? 1)
  return nextName !== String(group.value.name ?? '') || nextOrder !== currentOrder.value
})

watch(
  () => [currentOrder.value, group.value?.name],
  ([value, groupName]) => {
    nameInput.value = String(groupName ?? '')
    orderInput.value = String(value)
  },
  { immediate: true },
)

async function saveGroupProfile() {
  if (!group.value || !canSave.value) return

  saving.value = true
  try {
    const nextName = String(nameInput.value ?? '').trim()
    if (nextName !== String(group.value.name ?? '')) {
      await accountStore.updateAccountGroupProfile(groupId.value, { name: nextName })
    }

    const ids = accountStore.groups.map((item) => item.id)
    const fromIndex = ids.indexOf(groupId.value)
    const toIndex = clampOrder(parsedOrderInput.value ?? 1) - 1
    if (fromIndex < 0) return

    const movedIds = moveItem(ids, fromIndex, toIndex)
    const isOrderChanged = movedIds.some((id, index) => id !== ids[index])
    if (isOrderChanged) {
      await accountStore.reorderGroups(movedIds)
    }

    uiStore.pushToast('帳戶群組資料已更新')
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新帳戶群組失敗', 'error')
  } finally {
    saving.value = false
  }
}

async function removeGroupRecord() {
  if (!group.value) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemoveGroupRecord() {
  if (!group.value) return
  deleting.value = true
  try {
    await accountStore.removeGroup(groupId.value)
    uiStore.pushToast('母分類已刪除')
    deleteConfirmOpen.value = false
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除母分類失敗', 'error')
  } finally {
    deleting.value = false
  }
}

function clampOrder(order) {
  const max = Math.max(1, accountStore.groups.length)
  return Math.min(Math.max(1, order), max)
}

function moveItem(list, fromIndex, toIndex) {
  const next = list.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

onMounted(async () => {
  if (!accountStore.groups.length || !accountStore.accounts.length) {
    await accountStore.load()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-title,
h3 {
  margin: 0;
}

.page-header {
  align-items: center;
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

.error-text {
  margin: 4px 0 0;
  color: var(--danger-text);
  font-size: 12px;
}

.action-row {
  margin-top: 12px;
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}
</style>
