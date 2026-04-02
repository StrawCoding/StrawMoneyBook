<template>
  <div class="view-root">
    <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('settings_category_page.title') }}</h2>
        <div class="btn-wrap">
          <button class="btn mini-btn" @click="addGroup">{{ t('settings_category_page.add_group') }}</button>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </div>
      </header>
      <p class="muted">{{ t('settings_category_page.archive_hint') }}</p>
      <div class="kind-tabs">
        <button class="btn" :class="{ primary: activeKind === 'expense' }" @click="setActiveKind('expense')">{{ t('transaction.type.expense') }}</button>
        <button class="btn" :class="{ primary: activeKind === 'income' }" @click="setActiveKind('income')">{{ t('transaction.type.income') }}</button>
      </div>
      <ul class="group-list">
        <li v-for="group in filteredGroups" :key="group.id" class="group-item">
          <div class="row group-head">
            <div class="group-title">
              <span>{{ group.name }}</span>
            </div>
            <RouterLink
              class="btn mini-btn icon-btn"
              :to="{ name: 'settings-category-group-detail', params: { id: group.id }, query: { activeKind } }"
              :aria-label="t('settings_category_page.group_settings')"
            >
              <font-awesome-icon icon="fa-solid fa-gear" />
            </RouterLink>
          </div>
          <draggable
            :model-value="categoryItemsByGroup(group.id)"
            item-key="id"
            handle=".drag-handle"
            ghost-class="drag-ghost"
            :force-fallback="true"
            :delay-on-touch-only="true"
            :delay="120"
            class="category-list"
            @update:model-value="(items) => setCategoryItems(group.id, items)"
            @end="onCategorySortEnd(group.id)"
          >
            <template #item="{ element: category }">
              <li class="row category-row">
                <RouterLink :to="`/settings/categories/${category.id}?activeKind=${activeKind}`" class="item-name item-link">
                  <font-awesome-icon v-if="category.icon" :icon="category.icon" class="item-icon" />
                  <span>{{ category.name }}</span>
                </RouterLink>
                <font-awesome-icon icon="fa-solid fa-bars" class="drag-handle child-drag-bar" :aria-label="t('common.drag_sort')" />
              </li>
            </template>
            <template #footer>
              <li class="row category-row add-category-row">
                <button class="item-name add-category-btn" type="button" @click="addCategoryForGroup(group.id)">
                  <font-awesome-icon icon="fa-solid fa-circle-plus" class="item-icon" />
                  <span>{{ t('settings_category_page.add_category') }}</span>
                </button>
              </li>
            </template>
          </draggable>
        </li>
      </ul>
    </article>
    </section>

    <AppDialog
      :open="groupDialogOpen"
      presentation="sheet"
      :title="t('settings_category_page.dialog.group_title')"
      :confirm-disabled="!groupNameInput.trim()"
      :confirm-text="t('common.save')"
      @close="closeGroupDialog"
      @confirm="submitGroupDialog"
    >
      <label class="field">
        {{ t('common.group_name') }}
        <input v-model="groupNameInput" class="input" type="text" maxlength="40" :placeholder="t('common.group_name')" />
      </label>
    </AppDialog>

    <AppDialog
      :open="categoryDialogOpen"
      presentation="sheet"
      :title="t('settings_category_page.dialog.category_title')"
      :confirm-disabled="!categoryNameInput.trim() || !categoryGroupIdInput"
      :confirm-text="t('common.save')"
      @close="closeCategoryDialog"
      @confirm="submitCategoryDialog"
    >
      <label class="field">
        {{ t('common.category_name') }}
        <input v-model="categoryNameInput" class="input" type="text" maxlength="40" :placeholder="t('common.category_name')" />
      </label>
      <div class="field">
        <span>{{ t('settings_category_page.icon_label') }}</span>
        <button class="icon-picker-btn" type="button" @click.stop.prevent="openCategoryIconPicker">
          <font-awesome-icon :icon="categoryIconInput" />
          <span>{{ t('common.choose_icon') }}</span>
        </button>
      </div>
      <label class="field">
        {{ t('common.group') }}
        <template v-if="categoryGroupLockedId">
          <div class="fixed-group">{{ groupNameById(categoryGroupIdInput) }}</div>
        </template>
        <template v-else>
          <CustomSelect v-model="categoryGroupIdInput" :options="groupOptions" :placeholder="t('common.select_group')" />
        </template>
      </label>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { defaultCategoryExpenseIcon, defaultCategoryIncomeIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'

const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const activeKind = ref('expense')
const groupDialogOpen = ref(false)
const categoryDialogOpen = ref(false)
const groupNameInput = ref('')
const categoryNameInput = ref('')
const categoryGroupIdInput = ref('')
const categoryIconInput = ref(defaultCategoryExpenseIcon)
const categoryGroupLockedId = ref('')
const categoryItemsMap = ref({})

watch(
  () => route.query,
  (query) => {
    const queryKind = queryText(query.activeKind)
    if (queryKind === 'income' || queryKind === 'expense') {
      activeKind.value = queryKind
    }

    if (queryText(query.openCategoryDialog) !== '1') return
    categoryNameInput.value = queryText(query.categoryName)
    categoryGroupIdInput.value = queryText(query.categoryGroupId) || filteredGroups.value[0]?.id || ''
    categoryIconInput.value = normalizeFaIcon(
      queryText(query.categoryIcon),
      activeKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon,
    )
    categoryDialogOpen.value = true
  },
  { immediate: true },
)

watch(
  () => activeKind.value,
  (kind) => {
    void syncActiveKindQuery(kind)
  },
  { immediate: true },
)

const filteredGroups = computed(() => {
  return categoryStore.groups.filter((group) => group.kind === activeKind.value)
})

const filteredCategories = computed(() => {
  return categoryStore.categories.filter((category) => category.kind === activeKind.value)
})

function categoryItemsByGroup(groupId) {
  return categoryItemsMap.value[groupId] ?? []
}

function setCategoryItems(groupId, items) {
  categoryItemsMap.value = {
    ...categoryItemsMap.value,
    [groupId]: items,
  }
}

function categoriesByGroup(groupId) {
  return filteredCategories.value.filter((category) => category.group_id === groupId)
}

watch(
  () => filteredCategories.value,
  (categories) => {
    const nextMap = {}
    for (const category of categories) {
      if (!nextMap[category.group_id]) nextMap[category.group_id] = []
      nextMap[category.group_id].push(category)
    }
    categoryItemsMap.value = nextMap
  },
  { immediate: true },
)

const groupOptions = computed(() => {
  return filteredGroups.value.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})

async function setActiveKind(kind) {
  if (kind !== 'expense' && kind !== 'income') return
  activeKind.value = kind
  await syncActiveKindQuery(kind)
}

async function addGroup() {
  groupNameInput.value = ''
  groupDialogOpen.value = true
}

async function addCategory() {
  if (filteredGroups.value.length === 0) {
    uiStore.pushToast(
      t('settings_category_page.error.add_group_first', {
        kind: activeKind.value === 'expense' ? t('transaction.type.expense') : t('transaction.type.income'),
      }),
      'error',
    )
    return
  }

  categoryNameInput.value = ''
  categoryGroupIdInput.value = filteredGroups.value[0]?.id ?? ''
  categoryGroupLockedId.value = ''
  categoryIconInput.value = activeKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
  categoryDialogOpen.value = true
}

function addCategoryForGroup(groupId) {
  const group = filteredGroups.value.find((item) => item.id === groupId)
  if (!group) {
    uiStore.pushToast(t('settings_category_page.group_not_found'), 'error')
    return
  }

  categoryNameInput.value = ''
  categoryGroupIdInput.value = group.id
  categoryGroupLockedId.value = group.id
  categoryIconInput.value = activeKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
  categoryDialogOpen.value = true
}

function closeGroupDialog() {
  groupDialogOpen.value = false
  groupNameInput.value = ''
}

async function submitGroupDialog() {
  const name = groupNameInput.value.trim()
  if (!name) return
  try {
    await categoryStore.addGroup({
      name,
      kind: activeKind.value,
      sortOrder: filteredGroups.value.length,
    })
    uiStore.pushToast(t('settings_category_page.toast.group_created'))
    closeGroupDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_category_page.toast.group_create_failed'), 'error')
  }
}

function closeCategoryDialog() {
  categoryDialogOpen.value = false
  categoryNameInput.value = ''
  categoryGroupIdInput.value = ''
  categoryGroupLockedId.value = ''
  categoryIconInput.value = activeKind.value === 'income' ? defaultCategoryIncomeIcon : defaultCategoryExpenseIcon
  clearCategoryDialogQuery()
}

async function openCategoryIconPicker() {
  try {
    await router.push({
      name: 'icon-picker',
      query: {
        ...route.query,
        from: 'settings-categories',
        scope: 'category',
        current: categoryIconInput.value,
        openCategoryDialog: '1',
        activeKind: activeKind.value,
        categoryName: categoryNameInput.value,
        categoryGroupId: categoryGroupIdInput.value,
        categoryIcon: categoryIconInput.value,
      },
    })
  } catch (error) {
    uiStore.pushToast(error?.message ?? t('settings_category_page.toast.open_icon_failed'), 'error')
  }
}

async function submitCategoryDialog() {
  const name = categoryNameInput.value.trim()
  const groupId = String(categoryGroupLockedId.value || categoryGroupIdInput.value || '').trim()
  if (!name || !groupId) return
  const group = filteredGroups.value.find((item) => item.id === groupId)
  if (!group) {
    uiStore.pushToast(t('settings_category_page.group_not_found'), 'error')
    return
  }
  try {
    const sortOrder = categoriesByGroup(group.id).length
    await categoryStore.addCategory({
      groupId: group.id,
      name,
      kind: activeKind.value,
      icon: normalizeFaIcon(categoryIconInput.value),
      sortOrder,
    })
    uiStore.pushToast(t('settings_category_page.toast.category_created'))
    closeCategoryDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_category_page.toast.category_create_failed'), 'error')
  }
}

function clearCategoryDialogQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.openCategoryDialog
  delete nextQuery.categoryName
  delete nextQuery.categoryGroupId
  delete nextQuery.categoryIcon
  delete nextQuery.current
  delete nextQuery.from
  delete nextQuery.scope
  void router.replace({ query: nextQuery })
}

async function syncActiveKindQuery(kind) {
  if (kind !== 'expense' && kind !== 'income') return

  const queryKind = queryText(route.query.activeKind)
  if (queryKind === kind) return

  try {
    await router.replace({
      query: {
        ...route.query,
        activeKind: kind,
      },
    })
  } catch {
    // Ignore navigation races caused by simultaneous route updates.
  }
}

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function groupNameById(groupId) {
  return filteredGroups.value.find((group) => group.id === groupId)?.name ?? '-'
}

async function onCategorySortEnd(groupId) {
  await categoryStore.reorderCategories(groupId, categoryItemsByGroup(groupId).map((item) => item.id))
}
</script>

<style scoped>
.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 22px
}
.group-list, .category-list {
  list-style: none;
  padding: 0
}
.group-list {
  margin: 12px 0 0;
  display: grid;
  gap: 12px
}
.group-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 18px
}
.group-head {
  margin-bottom: 10px
}

.icon-btn {
  text-decoration: none;
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.category-list {
  margin: 0;
  display: grid;
  gap: 8px
}
.category-row {
  justify-content: space-between;
  min-height: 52px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  gap: 8px;
}
.item-name {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600
}
.item-link {
  color: var(--text);
  text-decoration: none;
  width: 100%;
  flex: 1
}
.item-icon {
  width: 18px;
  font-size: 18px;
  color: var(--primary-soft)
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
.btn-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end
}
.danger {
  background: var(--surface-danger);
  color: var(--danger-text)
}
.mini-btn {
  padding: 12px 14px;
  font-size: inherit;
  border-radius: 12px
}
.drag-handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
}

.child-drag-bar {
  margin-left: auto;
  font-size: 16px;
  padding: 4px 2px;
}

.drag-ghost {
  opacity: 0.55;
}
.kind-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}

.add-category-row {
  justify-content: flex-start;
}

.add-category-btn {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0;
  text-align: left;
  cursor: pointer;
  justify-content: flex-start;
}

.fixed-group {
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  border-radius: 10px;
  min-height: 40px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  color: var(--text);
}
</style>
