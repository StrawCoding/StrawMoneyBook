<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-receipt" class="title-icon" />{{ t('settings_addon_template.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <p class="muted">{{ t('settings_addon_template.description') }}</p>

      <div class="list-wrap">
        <div v-for="item in draftItems" :key="item.id" class="item-row">
          <input v-model.trim="item.label" class="input item-label" type="text" maxlength="20" :placeholder="t('settings_addon_template.item_name_placeholder')" />
          <CustomSelect v-model="item.defaultDirection" class="item-dir" :options="directionOptions" />
          <button type="button" class="btn danger-btn item-remove" @click="removeItem(item.id)">{{ t('settings_addon_template.delete') }}</button>
        </div>
      </div>

      <div class="row action-row">
        <button class="btn" @click="addItem">{{ t('settings_addon_template.add_item') }}</button>
        <button class="btn" @click="resetDefaults">{{ t('common.reset_default') }}</button>
        <button class="btn primary" :disabled="saving" @click="saveItems">{{ saving ? t('settings_addon_template.saving') : t('common.save') }}</button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { getDefaultAddonTemplatesByLedger } from '@/ui/services/addon-template.service'
import { useI18n } from '@/ui/services/i18n.service'

const addonTemplateStore = useAddonTemplateStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const draftItems = ref([])
const saving = ref(false)
const seq = ref(1)

const directionOptions = [
  { value: 'plus', label: '+' },
  { value: 'minus', label: '-' },
]

function cloneItems(items) {
  return (items || []).map((item, index) => ({
    id: String(item.id || `addon-${Date.now()}-${index}`),
    label: String(item.label || '').trim(),
    defaultDirection: item.defaultDirection === 'minus' ? 'minus' : 'plus',
  }))
}

function syncDraftFromStore() {
  draftItems.value = cloneItems(addonTemplateStore.templates)
}

function addItem() {
  draftItems.value.push({
    id: `addon-custom-${Date.now()}-${seq.value++}`,
    label: '',
    defaultDirection: 'plus',
  })
}

function removeItem(itemId) {
  draftItems.value = draftItems.value.filter((item) => item.id !== itemId)
}

async function resetDefaults() {
  draftItems.value = cloneItems(await getDefaultAddonTemplatesByLedger(ledgerStore.activeLedgerId))
}

async function saveItems() {
  const cleaned = draftItems.value
    .map((item) => ({
      id: String(item.id || '').trim(),
      label: String(item.label || '').trim(),
      defaultDirection: item.defaultDirection === 'minus' ? 'minus' : 'plus',
    }))
    .filter((item) => item.id && item.label)

  if (!cleaned.length) {
    uiStore.pushToast(t('settings_addon_template.toast.keep_one'), 'error')
    return
  }

  saving.value = true
  try {
    await addonTemplateStore.save(cleaned)
    syncDraftFromStore()
    uiStore.pushToast(t('settings_addon_template.toast.saved'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.save_failed'), 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await addonTemplateStore.load()
  syncDraftFromStore()
})
</script>

<style scoped>.page-head {
  align-items: center
}
h2 {
  margin: 0
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}
.panel {
  padding: 14px;
  display: grid;
  gap: 12px
}
.list-wrap {
  display: grid;
  gap: 8px
}
.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px auto;
  gap: 6px;
  align-items: center
}
.item-remove {
  height: 40px
}
.action-row {
  flex-wrap: wrap
}
@media (max-width: 640px) {
  .item-row {
    grid-template-columns: minmax(0, 1fr) 52px auto;
    gap: 4px;
  }
}
</style>
