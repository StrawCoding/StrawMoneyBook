<template>
  <HabitatPageShell
    :title="t('settings_category.group_detail_title')"
    :kicker="t('settings_category.habitat_hello')"
    test-id="settings-category-group-view"
    back-to="/settings/categories"
    stack-class="settings-subpage"
  >

    <article v-if="group" class="card panel">
      <header class="row">
        <h3>{{ group.name }}</h3>
        <button class="btn primary" :disabled="!canSave || saving" @click="saveOrder">
          {{ saving ? t('settings_ledger_detail.saving') : t('common.save_sort') }}
        </button>
      </header>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">{{ t('common.current_sort') }}</small>
          <span>{{ currentOrder }}</span>
        </div>
      </div>

      <label class="field">
        {{ t('common.sort_number') }}
        <input v-model="orderInput" class="input" type="number" min="1" step="1" />
      </label>
      <p v-if="orderInvalid" class="error-text">{{ t('common.sort_number_invalid') }}</p>

      <div class="row action-row">
        <button class="btn danger" :disabled="deleting" @click="removeGroupRecord">
          {{ deleting ? t('common.processing') : t('category.delete_archive_group') }}
        </button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">{{ t('common.parent_group_missing') }}</p>
    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      :title="t('common.confirm_delete_archive')"
      :message="t('category.confirm_delete_group_name', { name: group?.name ?? '' })"
      :confirm-text="t('common.confirm_delete')"
      :loading="deleting"
      :loading-text="t('common.processing')"
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveGroupRecord"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const router = useRouter()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)
const orderInput = ref('1')

const groupId = computed(() => String(route.params.id ?? ''))
const group = computed(() => categoryStore.groups.find((item) => item.id === groupId.value) ?? null)
const groupKind = computed(() => String(group.value?.kind ?? queryText(route.query.activeKind) ?? 'expense'))
const groupsByKind = computed(() => categoryStore.groups.filter((item) => item.kind === groupKind.value))
const currentOrder = computed(() => {
  const index = groupsByKind.value.findIndex((item) => item.id === groupId.value)
  return index >= 0 ? index + 1 : 1
})

const backLink = computed(() => `/settings/categories?activeKind=${groupKind.value}`)

const parsedOrderInput = computed(() => {
  const value = Number(orderInput.value)
  if (!Number.isFinite(value)) return null
  if (!Number.isInteger(value)) return null
  if (value <= 0) return null
  return value
})

const orderInvalid = computed(() => parsedOrderInput.value == null)
const canSave = computed(() => {
  if (!group.value || orderInvalid.value) return false
  const nextOrder = clampOrder(parsedOrderInput.value ?? 1)
  return nextOrder !== currentOrder.value
})

watch(
  () => currentOrder.value,
  (value) => {
    orderInput.value = String(value)
  },
  { immediate: true },
)

async function saveOrder() {
  if (!group.value || !canSave.value) return

  saving.value = true
  try {
    const ids = groupsByKind.value.map((item) => item.id)
    const fromIndex = ids.indexOf(groupId.value)
    const toIndex = clampOrder((parsedOrderInput.value ?? 1)) - 1
    if (fromIndex < 0) return

    await categoryStore.reorderGroups(groupKind.value, moveItem(ids, fromIndex, toIndex))
    uiStore.pushToast(t('category.group_sort_updated'))
    await router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('category.group_sort_failed'), 'error')
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
    await categoryStore.removeGroup(groupId.value)
    uiStore.pushToast(t('category.group_processed'))
    deleteConfirmOpen.value = false
    await router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('category.group_process_failed'), 'error')
  } finally {
    deleting.value = false
  }
}

function clampOrder(order) {
  const max = Math.max(1, groupsByKind.value.length)
  return Math.min(Math.max(1, order), max)
}

function moveItem(list, fromIndex, toIndex) {
  const next = list.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

onMounted(async () => {
  if (!categoryStore.groups.length || !categoryStore.categories.length) {
    await categoryStore.load()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

h3 {
  margin: 0;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
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
