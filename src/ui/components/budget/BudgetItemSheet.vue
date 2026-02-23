<template>
  <teleport to="body">
    <transition name="overlay-fade">
      <section v-if="open" class="sheet-mask" @click.self="$emit('close')">
        <article class="sheet card">
          <header class="row">
            <h3>{{ model.id ? t('budget_item_sheet.title_edit') : t('budget_item_sheet.title_add') }}</h3>
            <button class="btn" @click="$emit('close')">{{ t('common.close') }}</button>
          </header>

          <div class="stack form-wrap">
            <label>
              {{ t('budget_item_sheet.category') }}
              <button
                type="button"
                class="select category-trigger"
                :class="{ placeholder: !selectedCategoryLabel }"
                :disabled="!hasVisibleCategories"
                @click="openCategoryPicker"
              >
                <font-awesome-icon v-if="selectedCategoryIcon" :icon="selectedCategoryIcon" class="category-icon" />
                <span class="category-value">{{ selectedCategoryLabel || t('budget_item_sheet.category_placeholder') }}</span>
                <span class="category-arrow">›</span>
              </button>
            </label>

            <label>
              {{ t('budget_item_sheet.amount') }}
              <input v-model.number="model.amountMajor" class="input" type="number" min="0" step="1" />
            </label>
          </div>

          <footer class="row footer">
            <button class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
            <button class="btn primary" @click="onSave">{{ t('common.save') }}</button>
          </footer>
        </article>
      </section>
    </transition>

    <transition name="category-overlay">
      <section v-if="open && showCategoryPicker" class="category-mask" @click.self="closeCategoryPicker">
        <article class="category-sheet card">
          <header class="row category-head">
            <button type="button" class="btn" @click="closeCategoryPicker">{{ t('common.back') }}</button>
            <h4>{{ t('budget_item_sheet.picker_title') }}</h4>
            <button type="button" class="btn" @click="closeCategoryPicker">{{ t('date_time_picker.done') }}</button>
          </header>

          <section v-if="categoryPickerGroups.length" class="category-layout">
            <aside class="category-pane parent-pane">
              <button
                v-for="group in categoryPickerGroups"
                :key="group.id"
                type="button"
                class="category-item"
                :class="{ active: String(group.id) === String(categoryPickerParentId) }"
                @click="setCategoryPickerParent(group.id)"
              >
                {{ group.name }}
              </button>
            </aside>

            <section class="category-pane child-pane">
              <button
                v-for="category in categoryPickerChildren"
                :key="category.id"
                type="button"
                class="category-item"
                :class="{ active: category.id === model.categoryId }"
                @click="pickCategory(category.id)"
              >
                <font-awesome-icon v-if="category.icon" :icon="category.icon" class="category-item-icon" />
                <span>{{ category.name }}</span>
              </button>
              <p v-if="!categoryPickerChildren.length" class="category-empty">{{ t('budget_item_sheet.no_child') }}</p>
            </section>
          </section>

          <p v-else class="category-empty">{{ t('budget_item_sheet.no_category') }}</p>
          <p class="category-tip">{{ t('budget_item_sheet.category_tip') }}</p>
        </article>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  categoryGroups: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'save'])
const { t } = useI18n()

const model = reactive({
  id: '',
  categoryId: '',
  amountMajor: null,
})
const showCategoryPicker = ref(false)
const categoryPickerParentId = ref('')

const categoryOptions = computed(() => props.categories ?? [])
const categoryPickerGroups = computed(() => {
  if ((props.categoryGroups ?? []).length > 0) {
    return props.categoryGroups.filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
  }
  if (!categoryOptions.value.length) return []
  return [
    {
      id: '__default__',
      name: t('budget_item_sheet.default_group_name'),
      categories: categoryOptions.value,
    },
  ]
})
const categoryPickerChildren = computed(() => {
  const group = categoryPickerGroups.value.find((item) => String(item.id) === String(categoryPickerParentId.value))
  return group?.categories ?? []
})
const hasVisibleCategories = computed(() => categoryPickerGroups.value.length > 0)
const selectedCategoryLabel = computed(() => {
  if (!model.categoryId) return ''
  for (const group of categoryPickerGroups.value) {
    const matched = group.categories.find((item) => item.id === model.categoryId)
    if (matched) return `${group.name} / ${matched.name}`
  }
  return ''
})
const selectedCategoryIcon = computed(() => {
  if (!model.categoryId) return ''
  for (const group of categoryPickerGroups.value) {
    const matched = group.categories.find((item) => item.id === model.categoryId)
    if (matched?.icon) return matched.icon
  }
  return ''
})

watch(
  () => [props.open, props.item],
  () => {
    if (!props.open) return

    if (props.item) {
      model.id = props.item.id
      model.categoryId = props.item.category_id ?? ''
      model.amountMajor = Number(props.item.amount_minor ?? 0) / 100
      showCategoryPicker.value = false
      syncCategoryPickerParent(model.categoryId)
      return
    }

    model.id = ''
    model.categoryId = categoryOptions.value[0]?.id ?? ''
    model.amountMajor = null
    showCategoryPicker.value = false
    syncCategoryPickerParent(model.categoryId)
  },
  { immediate: true },
)

watch(
  () => categoryPickerGroups.value,
  () => {
    syncCategoryPickerParent(model.categoryId)
  },
  { deep: true },
)

function syncCategoryPickerParent(preferredCategoryId = '') {
  if (!categoryPickerGroups.value.length) {
    categoryPickerParentId.value = ''
    return
  }

  if (preferredCategoryId) {
    const matchedGroup = categoryPickerGroups.value.find((group) =>
      group.categories.some((category) => category.id === preferredCategoryId),
    )
    if (matchedGroup) {
      categoryPickerParentId.value = matchedGroup.id
      return
    }
  }

  const hasCurrentParent = categoryPickerGroups.value.some((group) => String(group.id) === String(categoryPickerParentId.value))
  if (hasCurrentParent) return
  categoryPickerParentId.value = categoryPickerGroups.value[0]?.id ?? ''
}

function openCategoryPicker() {
  if (!hasVisibleCategories.value) return
  syncCategoryPickerParent(model.categoryId)
  showCategoryPicker.value = true
}

function closeCategoryPicker() {
  showCategoryPicker.value = false
}

function setCategoryPickerParent(groupId) {
  categoryPickerParentId.value = groupId
}

function pickCategory(categoryId) {
  model.categoryId = categoryId
  syncCategoryPickerParent(categoryId)
  showCategoryPicker.value = false
}

function onSave() {
  emit('save', {
    id: model.id || undefined,
    categoryId: model.categoryId,
    amountMinor: Math.round(Number(model.amountMajor ?? 0) * 100),
  })
}
</script>

<style scoped>.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70
}
.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
h3 {
  margin: 0
}
.form-wrap {
  margin-top: 12px
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.category-trigger {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left
}
.category-icon {
  width: 14px;
  color: var(--primary-soft)
}
.category-trigger.placeholder {
  color: var(--muted)
}
.category-trigger:disabled {
  opacity: 0.65;
  cursor: not-allowed
}
.category-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}
.category-arrow {
  font-size: 15px;
  line-height: 1;
  opacity: 0.8
}
.footer {
  margin-top: 12px
}
.category-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-strong);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 90
}
.category-sheet {
  width: min(900px, 100vw);
  height: 100dvh;
  border-radius: 0;
  padding: calc(10px + var(--status-bar-height)) 12px calc(12px + var(--navigation-bar-height));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px
}
.category-overlay-enter-active, .category-overlay-leave-active {
  transition: opacity var(--anim-mid) ease
}
.category-overlay-enter-from, .category-overlay-leave-to {
  opacity: 0
}
.category-overlay-enter-active .category-sheet, .category-overlay-leave-active .category-sheet {
  transition:
    opacity var(--anim-mid) ease,
    transform var(--anim-mid) var(--anim-spring)
}
.category-overlay-enter-from .category-sheet, .category-overlay-leave-to .category-sheet {
  opacity: 0;
  transform: translateY(56px)
}
.category-head h4 {
  font-size: 17px;
  margin: 0
}
.category-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(124px, 42%) minmax(0, 1fr);
  gap: 10px
}
.category-pane {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface-popover);
  padding: 6px;
  overflow: auto
}
.parent-pane, .child-pane {
  display: grid;
  align-content: start;
  gap: 6px
}
.category-item {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 10px 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.category-item.active {
  background: color-mix(in srgb, var(--primary) 26%, transparent);
  color: var(--primary-soft);
  font-weight: 700
}
.category-item-icon {
  width: 14px;
  color: inherit
}
.category-empty {
  margin: 10px 2px 0;
  color: var(--muted);
  font-size: 13px
}
.category-tip {
  margin: 0 2px;
  color: var(--muted);
  font-size: 12px
}
</style>
