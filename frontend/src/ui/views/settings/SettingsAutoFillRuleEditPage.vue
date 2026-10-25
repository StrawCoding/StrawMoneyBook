<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-wand-magic-sparkles" class="title-icon" />{{ pageTitle }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!ruleMissing" class="card panel">
      <header class="row">
        <h3>{{ pageTitle }}</h3>
        <button class="btn primary" :disabled="!canSave || saving || deleting" @click="submitRule">
          {{ saving ? t('settings_ledger_detail.saving') : t('common.save') }}
        </button>
      </header>

      <p class="muted">{{ t('settings_auto_fill.hint') }}</p>

      <label class="field">
        {{ t('settings_auto_fill.keyword') }}
        <input v-model.trim="form.keyword" class="input" type="text" maxlength="80" />
        <small class="muted">{{ t('settings_auto_fill.keyword_hint') }}</small>
      </label>

      <label class="field">
        {{ t('settings_auto_fill.type') }}
        <CustomSelect v-model="form.type" :options="typeOptions" />
      </label>

      <label class="field">
        {{ form.type === 'transfer' ? t('settings_auto_fill.from_account') : t('settings_auto_fill.account') }}
        <CustomSelect v-model="form.accountId" :groups="accountOptionGroups" :placeholder="t('settings_auto_fill.keep_current')" />
      </label>

      <label v-if="form.type === 'transfer'" class="field">
        {{ t('settings_auto_fill.to_account') }}
        <CustomSelect v-model="form.peerAccountId" :groups="accountOptionGroups" :placeholder="t('settings_auto_fill.keep_current')" />
      </label>

      <label v-if="form.type !== 'transfer'" class="field">
        {{ t('settings_auto_fill.category') }}
        <CustomSelect v-model="form.categoryId" :groups="categoryOptionGroups" :placeholder="t('settings_auto_fill.keep_current')" />
      </label>

      <label class="field">
        {{ t('settings_auto_fill.amount') }}
        <input v-model.trim="form.amountMajor" class="input" type="number" min="0" step="0.01" placeholder="0" />
      </label>

      <label class="field">
        {{ t('settings_auto_fill.note') }}
        <input v-model.trim="form.note" class="input" type="text" maxlength="40" />
      </label>

      <label v-if="form.type === 'expense'" class="check-row">
        <input v-model="form.isReimbursable" type="checkbox" />
        <span>{{ t('settings_auto_fill.reimbursable') }}</span>
      </label>

      <div class="field">
        <span>{{ t('settings_auto_fill.addon') }}</span>
        <div class="addon-list">
          <div v-for="(item, index) in form.addonItems" :key="item.id" class="addon-row">
            <div class="addon-grid">
              <CustomSelect v-model="item.label" :options="addonOptions" />
              <input
                v-model.trim="item.amountMajor"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
              />
            </div>
            <button class="btn danger addon-remove-btn" @click="removeAddonRow(index)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
        <button class="btn addon-add-btn" @click="addAddonRow">{{ t('common.add_addon_item') }}</button>
      </div>

      <div v-if="isEditMode" class="row action-row">
        <button class="btn danger" :disabled="saving || deleting" @click="removeCurrentRule">
          {{ deleting ? t('settings_bank_sync.actions.deleting') : t('common.delete') }}
        </button>
      </div>
    </article>

    <article v-else class="card panel">
      <p class="muted">{{ t('common.rule_not_found') }}</p>
    </article>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getAutoFillRules, removeAutoFillRule, upsertAutoFillRule } from '@/ui/services/auto-fill-rule.service'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const addonTemplateStore = useAddonTemplateStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const deleting = ref(false)
const ruleMissing = ref(false)
const editingId = ref('')
const form = reactive({
  keyword: '',
  type: 'expense',
  accountId: '',
  peerAccountId: '',
  categoryId: '',
  amountMajor: '',
  note: '',
  isReimbursable: false,
  addonItems: [],
})

const backLink = '/settings/auto-fill-rules'
const activeLedgerId = computed(() => ledgerStore.activeLedgerId)
const ruleId = computed(() => String(route.params.id ?? '').trim())
const isEditMode = computed(() => Boolean(ruleId.value))
const pageTitle = computed(() => (
  isEditMode.value
    ? t('settings_auto_fill.edit_rule')
    : t('settings_auto_fill.add_rule')
))
const typeOptions = computed(() => ([
  { value: 'expense', label: t('analysis_page.type.expense') },
  { value: 'income', label: t('analysis_page.type.income') },
  { value: 'transfer', label: t('transaction_about.type.transfer') },
]))
const accountOptionGroups = computed(() => accountStore.groupedAccounts)
const categoryOptionGroups = computed(() => (
  form.type === 'income'
    ? categoryStore.incomeCategoryGroups
    : categoryStore.expenseCategoryGroups
))
const addonOptions = computed(() => [
  { value: '', label: t('settings_auto_fill.keep_current') },
  ...addonTemplateStore.templates.map((item) => ({
    value: item.label,
    label: item.label,
  })),
])
const canSave = computed(() => Boolean(String(form.keyword ?? '').trim()))

watch(
  () => form.type,
  () => {
    if (form.type !== 'transfer') {
      form.peerAccountId = ''
    }
    if (form.type === 'transfer') {
      form.categoryId = ''
      form.isReimbursable = false
    }
  },
)

watch([activeLedgerId, ruleId], () => {
  void loadPageState()
}, { immediate: true })

function normalizeMajorInput(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

let addonDraftId = 0

function createAddonRow(input = {}) {
  addonDraftId += 1
  return {
    id: `addon-row-${addonDraftId}`,
    label: String(input.label ?? '').trim(),
    amountMajor: input.deltaMajor != null ? String(input.deltaMajor) : String(input.amountMajor ?? '').trim(),
  }
}

function replaceAddonRows(nextRows = []) {
  form.addonItems.splice(0, form.addonItems.length, ...nextRows)
}

function resetForm() {
  editingId.value = ''
  form.keyword = ''
  form.type = 'expense'
  form.accountId = ''
  form.peerAccountId = ''
  form.categoryId = ''
  form.amountMajor = ''
  form.note = ''
  form.isReimbursable = false
  replaceAddonRows([])
}

function patchForm(rule) {
  editingId.value = String(rule?.id ?? '')
  form.keyword = String(rule?.keyword ?? '')
  form.type = String(rule?.type ?? 'expense')
  form.accountId = String(rule?.accountId ?? '')
  form.peerAccountId = String(rule?.peerAccountId ?? '')
  form.categoryId = String(rule?.categoryId ?? '')
  form.amountMajor = rule?.amountMajor ? String(rule.amountMajor) : ''
  form.note = String(rule?.note ?? '')
  form.isReimbursable = Boolean(rule?.isReimbursable)
  replaceAddonRows(
    Array.isArray(rule?.addonItems)
      ? rule.addonItems.map((item) => createAddonRow(item))
      : [],
  )
}

function addAddonRow() {
  form.addonItems.push(createAddonRow())
}

function removeAddonRow(index) {
  form.addonItems.splice(index, 1)
}

function serializeAddonItems() {
  return form.addonItems
    .map((item) => {
      const label = String(item?.label ?? '').trim()
      const deltaMajor = normalizeMajorInput(item?.amountMajor)
      if (!label || !deltaMajor) return null
      return {
        label,
        deltaMajor,
      }
    })
    .filter(Boolean)
}

async function ensureStoresReady() {
  if (!activeLedgerId.value) return
  await Promise.all([
    accountStore.load().catch(() => null),
    categoryStore.load().catch(() => null),
    addonTemplateStore.load().catch(() => null),
  ])
}

async function loadPageState() {
  resetForm()
  ruleMissing.value = false

  if (!activeLedgerId.value) {
    return
  }

  await ensureStoresReady()

  if (!isEditMode.value) {
    return
  }

  const rules = await getAutoFillRules(activeLedgerId.value)
  const targetRule = rules.find((item) => item.id === ruleId.value) ?? null
  if (!targetRule) {
    ruleMissing.value = true
    return
  }

  patchForm(targetRule)
}

async function submitRule() {
  if (!activeLedgerId.value || !canSave.value || saving.value || deleting.value || ruleMissing.value) return
  saving.value = true
  try {
    await upsertAutoFillRule(activeLedgerId.value, {
      id: editingId.value,
      keyword: form.keyword,
      type: form.type,
      accountId: form.accountId,
      peerAccountId: form.type === 'transfer' ? form.peerAccountId : '',
      categoryId: form.type === 'transfer' ? '' : form.categoryId,
      amountMajor: normalizeMajorInput(form.amountMajor),
      note: form.note,
      isReimbursable: form.type === 'expense' ? form.isReimbursable : false,
      addonItems: serializeAddonItems(),
    })
    uiStore.pushToast(t('settings_auto_fill.toast.saved'))
    await router.push(backLink)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_auto_fill.toast.save_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeCurrentRule() {
  if (!activeLedgerId.value || !editingId.value || saving.value || deleting.value) return
  deleting.value = true
  try {
    await removeAutoFillRule(activeLedgerId.value, editingId.value)
    uiStore.pushToast(t('settings_auto_fill.toast.deleted'))
    await router.push(backLink)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_auto_fill.toast.delete_failed'), 'error')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
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

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
}

.check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
}

.addon-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 8px;
}

.addon-list {
  display: grid;
  gap: 8px;
}

.addon-row {
  display: grid;
  gap: 8px;
}

.addon-add-btn,
.addon-remove-btn {
  justify-self: start;
}

.action-row {
  margin-top: 4px;
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}
</style>
