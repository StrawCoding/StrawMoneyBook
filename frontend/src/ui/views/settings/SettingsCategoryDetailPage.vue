<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-tag" class="title-icon" />{{ t('common.category_detail') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel" v-if="category">
      <header class="row">
        <h3 class="category-title">
          <font-awesome-icon v-if="editIcon" :icon="editIcon" class="category-icon" />
          <span>{{ category.name }}</span>
        </h3>
        <button class="btn primary" :disabled="!canSave || saving" @click="saveProfile">
          {{ saving ? t('settings_ledger_detail.saving') : t('settings_ledger_detail.save_changes') }}
        </button>
      </header>

      <label class="field">
        {{ t('common.category_name') }}
        <input v-model="editName" class="input" type="text" maxlength="40" :placeholder="t('common.please_enter_category_name')" />
      </label>

      <div class="field">
        <span>{{ t('common.category_icon') }}</span>
        <button class="icon-picker-btn" type="button" @click.stop.prevent="openIconPicker">
          <font-awesome-icon :icon="editIcon" />
          <span>{{ t('common.choose_icon') }}</span>
        </button>
      </div>

      <label class="field">
        {{ t('common.belonging_group') }}
        <CustomSelect v-model="editGroupId" :options="groupOptions" :placeholder="t('common.select_group')" />
      </label>

      <div class="defaults-section">
        <p class="defaults-hint">{{ t('settings_category_detail.defaults_hint') }}</p>
        <div class="switch-list">
          <button
            v-if="categoryKind === 'expense'"
            type="button"
            class="switch-row"
            :class="{ active: editDefaultIsReimbursable }"
            role="switch"
            :aria-checked="editDefaultIsReimbursable ? 'true' : 'false'"
            @click="editDefaultIsReimbursable = !editDefaultIsReimbursable"
          >
            <span>{{ t('settings_category_detail.default_is_reimbursable') }}</span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
          <button
            type="button"
            class="switch-row"
            :class="{ active: editDefaultIncludeInBudget }"
            role="switch"
            :aria-checked="editDefaultIncludeInBudget ? 'true' : 'false'"
            @click="editDefaultIncludeInBudget = !editDefaultIncludeInBudget"
          >
            <span>{{ t('settings_category_detail.default_include_in_budget') }}</span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
          <button
            type="button"
            class="switch-row"
            :class="{ active: editDefaultIncludeInAnalysis }"
            role="switch"
            :aria-checked="editDefaultIncludeInAnalysis ? 'true' : 'false'"
            @click="editDefaultIncludeInAnalysis = !editDefaultIncludeInAnalysis"
          >
            <span>{{ t('settings_category_detail.default_include_in_analysis') }}</span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
        </div>
      </div>

      <div class="row action-row">
        <button class="btn danger" :disabled="deleting" @click="removeCategoryRecord">
          {{ deleting ? t('common.processing') : t('category.delete_archive') }}
        </button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">{{ t('category.not_found') }}</p>
    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      :title="t('common.confirm_delete_archive')"
      :message="t('category.confirm_delete_name', { name: category?.name ?? '' })"
      :confirm-text="t('common.confirm_delete')"
      :loading="deleting"
      :loading-text="t('common.processing')"
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveCategoryRecord"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { defaultCategoryExpenseIcon, defaultCategoryIncomeIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'

const route = useRoute()
const router = useRouter()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const deleting = ref(false)
const editName = ref('')
const editGroupId = ref('')
const editIcon = ref(defaultCategoryExpenseIcon)
const editDefaultIncludeInAnalysis = ref(true)
const editDefaultIncludeInBudget = ref(true)
const editDefaultIsReimbursable = ref(false)
const deleteConfirmOpen = ref(false)
const initializedCategoryId = ref('')

const categoryId = computed(() => String(route.params.id ?? ''))
const category = computed(() => categoryStore.categories.find((item) => item.id === categoryId.value) ?? null)
const categoryKind = computed(() => {
  return String(category.value?.kind ?? queryText(route.query.activeKind) ?? 'expense')
})

const groupOptions = computed(() => {
  return categoryStore.groups
    .filter((group) => group.kind === categoryKind.value)
    .map((group) => ({
      value: group.id,
      label: group.name,
    }))
})

const backLink = computed(() => `/settings/categories?activeKind=${categoryKind.value}`)
const canSave = computed(() => {
  if (!category.value) return false
  const name = editName.value.trim()
  const groupId = String(editGroupId.value ?? '').trim()
  const fallback = categoryKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
  const icon = normalizeFaIcon(editIcon.value, fallback)

  if (!name || !groupId) return false

  return (
    name !== String(category.value.name ?? '') ||
    groupId !== String(category.value.group_id ?? '') ||
    icon !== normalizeFaIcon(category.value.icon, fallback) ||
    editDefaultIncludeInAnalysis.value !== Boolean(category.value.default_include_in_analysis ?? 1) ||
    editDefaultIncludeInBudget.value !== Boolean(category.value.default_include_in_budget ?? 1) ||
    editDefaultIsReimbursable.value !== Boolean(category.value.default_is_reimbursable ?? 0)
  )
})

watch(
  () => category.value,
  (next) => {
    if (!next) return
    const nextId = String(next.id ?? '')
    if (!nextId) return
    if (initializedCategoryId.value === nextId) return

    const fallback = next.kind === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
    editName.value = String(next.name ?? '')
    editGroupId.value = String(next.group_id ?? '')
    editIcon.value = normalizeFaIcon(next.icon, fallback)
    editDefaultIncludeInAnalysis.value = Boolean(next.default_include_in_analysis ?? 1)
    editDefaultIncludeInBudget.value = Boolean(next.default_include_in_budget ?? 1)
    editDefaultIsReimbursable.value = Boolean(next.default_is_reimbursable ?? 0)
    initializedCategoryId.value = nextId
  },
  { immediate: true },
)

async function openIconPicker() {
  try {
    await router.push({
      name: 'icon-picker',
      query: {
        ...route.query,
        from: 'settings-category-detail',
        scope: 'category',
        current: editIcon.value,
        categoryId: categoryId.value,
        activeKind: categoryKind.value,
      },
    })
  } catch (error) {
    uiStore.pushToast(error?.message ?? t('settings_category_page.toast.open_icon_failed'), 'error')
  }
}

async function saveProfile() {
  if (!category.value || !canSave.value) return

  saving.value = true
  try {
    const fallback = categoryKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
    await categoryStore.updateCategoryProfile(categoryId.value, {
      name: editName.value.trim(),
      groupId: String(editGroupId.value ?? '').trim(),
      icon: normalizeFaIcon(editIcon.value, fallback),
      defaultIncludeInAnalysis: editDefaultIncludeInAnalysis.value,
      defaultIncludeInBudget: editDefaultIncludeInBudget.value,
      defaultIsReimbursable: editDefaultIsReimbursable.value,
    })
    uiStore.pushToast(t('category.data_updated'))
    await router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('category.data_update_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeCategoryRecord() {
  if (!category.value) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemoveCategoryRecord() {
  if (!category.value) return
  deleting.value = true
  try {
    await categoryStore.removeCategory(categoryId.value)
    uiStore.pushToast(t('common.category_processed'))
    deleteConfirmOpen.value = false
    await router.push(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('category.process_failed'), 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  if (!categoryStore.categories.length || !categoryStore.groups.length) {
    await categoryStore.load()
  }
})

watch(
  () => route.query,
  (query) => {
    const pickedIcon = queryText(query.categoryIcon)
    if (!pickedIcon) return
    const fallback = categoryKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
    editIcon.value = normalizeFaIcon(pickedIcon, fallback)
  },
  { immediate: true },
)

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}
</script>

<style scoped>.panel {
  padding: 14px
}
.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
h3 {
  margin: 0
}
.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}
.page-header {
  align-items: center
}
.category-title {
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.category-icon {
  width: 16px;
  color: var(--primary-soft)
}
.field {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.icon-picker-btn {
  width: 100%;
  justify-content: space-between;
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  border-radius: 10px;
  color: var(--text);
  min-height: 40px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center
}
.defaults-section {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}
.defaults-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.switch-list {
  display: grid;
  gap: 8px;
}
.switch-row {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
}
.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 52%, var(--border) 48%);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-soft) 90%);
}
.switch-track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 32%, transparent);
  position: relative;
  display: inline-block;
  transition: background-color var(--anim-fast) var(--anim-standard);
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transform: translate3d(0, 0, 0);
  transition: transform var(--anim-mid) var(--anim-spring);
  will-change: transform;
}
.switch-row.active .switch-thumb {
  transform: translate3d(18px, 0, 0);
}
.action-row {
  margin-top: 12px
}
.danger {
  background: var(--surface-danger);
  color: var(--danger-text)
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  touch-action: pan-y;
}
.icon-btn {
  border: 1px solid var(--field-border);
  background: color-mix(in srgb, var(--card) 85%, var(--surface-popover) 15%);
  border-radius: 14px;
  color: var(--text);
  height: 50px;
  font-size: 20px
}
.icon-btn.active {
  color: var(--primary-soft);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  background: color-mix(in srgb, var(--primary) 16%, var(--card) 84%)
}
</style>
