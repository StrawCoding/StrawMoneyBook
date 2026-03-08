<template>
  <div class="view-root">
    <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>分類管理</h2>
        <div class="btn-wrap">
          <button class="btn mini-btn" @click="addGroup">新增群組</button>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </div>
      </header>
      <p class="muted">L2 分類若已被交易引用，刪除時會自動轉為封存（archive only）。</p>
      <div class="kind-tabs">
        <button class="btn" :class="{ primary: activeKind === 'expense' }" @click="activeKind = 'expense'">支出</button>
        <button class="btn" :class="{ primary: activeKind === 'income' }" @click="activeKind = 'income'">收入</button>
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
              aria-label="母分類設定"
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
                <font-awesome-icon icon="fa-solid fa-bars" class="drag-handle child-drag-bar" aria-label="拖動排序" />
              </li>
            </template>
            <template #footer>
              <li class="row category-row add-category-row">
                <button class="item-name add-category-btn" type="button" @click="addCategoryForGroup(group.id)">
                  <font-awesome-icon icon="fa-solid fa-circle-plus" class="item-icon" />
                  <span>新增分類</span>
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
      title="新增分類群組"
      :confirm-disabled="!groupNameInput.trim()"
      confirm-text="儲存"
      @close="closeGroupDialog"
      @confirm="submitGroupDialog"
    >
      <label class="field">
        群組名稱
        <input v-model="groupNameInput" class="input" type="text" maxlength="40" placeholder="請輸入群組名稱" />
      </label>
    </AppDialog>

    <AppDialog
      :open="categoryDialogOpen"
      title="新增分類"
      :confirm-disabled="!categoryNameInput.trim() || !categoryGroupIdInput"
      confirm-text="儲存"
      @close="closeCategoryDialog"
      @confirm="submitCategoryDialog"
    >
      <label class="field">
        分類名稱
        <input v-model="categoryNameInput" class="input" type="text" maxlength="40" placeholder="請輸入分類名稱" />
      </label>
      <div class="field">
        <span>分類 Icon</span>
        <button class="icon-picker-btn" type="button" @click.stop.prevent="openCategoryIconPicker">
          <font-awesome-icon :icon="categoryIconInput" />
          <span>選擇 icon</span>
        </button>
      </div>
      <label class="field">
        所屬群組
        <template v-if="categoryGroupLockedId">
          <div class="fixed-group">{{ groupNameById(categoryGroupIdInput) }}</div>
        </template>
        <template v-else>
          <CustomSelect v-model="categoryGroupIdInput" :options="groupOptions" placeholder="請選擇群組" />
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

async function addGroup() {
  groupNameInput.value = ''
  groupDialogOpen.value = true
}

async function addCategory() {
  if (filteredGroups.value.length === 0) {
    uiStore.pushToast(`請先在「${activeKind.value === 'expense' ? '支出' : '收入'}」新增分類群組`, 'error')
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
    uiStore.pushToast('找不到對應群組', 'error')
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
    uiStore.pushToast('分類群組已新增')
    closeGroupDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增群組失敗', 'error')
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
    uiStore.pushToast(error?.message ?? '開啟 icon 選擇器失敗', 'error')
  }
}

async function submitCategoryDialog() {
  const name = categoryNameInput.value.trim()
  const groupId = String(categoryGroupLockedId.value || categoryGroupIdInput.value || '').trim()
  if (!name || !groupId) return
  const group = filteredGroups.value.find((item) => item.id === groupId)
  if (!group) {
    uiStore.pushToast('找不到對應群組', 'error')
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
    uiStore.pushToast('分類已新增')
    closeCategoryDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增分類失敗', 'error')
  }
}

function clearCategoryDialogQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.openCategoryDialog
  delete nextQuery.activeKind
  delete nextQuery.categoryName
  delete nextQuery.categoryGroupId
  delete nextQuery.categoryIcon
  delete nextQuery.current
  delete nextQuery.from
  delete nextQuery.scope
  void router.replace({ query: nextQuery })
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
