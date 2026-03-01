<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('settings_auto_fill.title') }}</h2>
        <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted">{{ t('settings_auto_fill.hint') }}</p>
      <button class="btn primary" :disabled="!activeLedgerId" @click="openCreateDialog">
        {{ t('settings_auto_fill.add_rule') }}
      </button>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('settings_auto_fill.list_title') }}</h3>
        <small class="muted">{{ t('settings_auto_fill.list_hint') }}</small>
      </header>

      <ul v-if="rules.length" class="rule-list">
        <li v-for="rule in rules" :key="rule.id" class="rule-item">
          <div class="rule-copy">
            <strong>{{ rule.keyword }}</strong>
            <small class="muted">{{ describeRule(rule) }}</small>
          </div>
          <div class="rule-actions">
            <button class="btn" @click="openEditDialog(rule)">{{ t('common.edit') }}</button>
            <button class="btn danger" @click="removeRule(rule.id)">{{ t('common.delete') }}</button>
          </div>
        </li>
      </ul>

      <p v-else class="muted">{{ t('settings_auto_fill.empty') }}</p>
    </article>

    <AppDialog
      :open="dialogOpen"
      :title="editingId ? t('settings_auto_fill.edit_rule') : t('settings_auto_fill.add_rule')"
      :confirm-disabled="!canSave"
      :loading="saving"
      loading-text="儲存中..."
      @close="closeDialog"
      @confirm="submitRule"
    >
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
        <CustomSelect v-model="form.accountId" :options="accountOptions" />
      </label>

      <label v-if="form.type === 'transfer'" class="field">
        {{ t('settings_auto_fill.to_account') }}
        <CustomSelect v-model="form.peerAccountId" :options="accountOptions" />
      </label>

      <label v-if="form.type !== 'transfer'" class="field">
        {{ t('settings_auto_fill.category') }}
        <CustomSelect v-model="form.categoryId" :options="categoryOptions" />
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
        <div class="addon-grid">
          <CustomSelect v-model="form.addonLabel" :options="addonOptions" />
          <input
            v-model.trim="form.addonAmountMajor"
            class="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
          />
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getAutoFillRules, removeAutoFillRule, upsertAutoFillRule } from '@/ui/services/auto-fill-rule.service'

const accountStore = useAccountStore()
const addonTemplateStore = useAddonTemplateStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const rules = ref([])
const dialogOpen = ref(false)
const saving = ref(false)
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
  addonLabel: '',
  addonAmountMajor: '',
})

const activeLedgerId = computed(() => ledgerStore.activeLedgerId)
const typeOptions = computed(() => ([
  { value: 'expense', label: t('analysis_page.type.expense') },
  { value: 'income', label: t('analysis_page.type.income') },
  { value: 'transfer', label: t('transaction_about.type.transfer') },
]))
const accountOptions = computed(() => [
  { value: '', label: t('settings_auto_fill.keep_current') },
  ...accountStore.accounts.map((item) => ({
    value: item.id,
    label: item.name,
  })),
])
const categoryOptions = computed(() => {
  const categories = form.type === 'income'
    ? categoryStore.incomeCategories
    : categoryStore.expenseCategories
  return [
    { value: '', label: t('settings_auto_fill.keep_current') },
    ...categories.map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ]
})
const addonOptions = computed(() => [
  { value: '', label: t('settings_auto_fill.keep_current') },
  ...addonTemplateStore.templates.map((item) => ({
    value: item.label,
    label: item.label,
  })),
])
const canSave = computed(() => Boolean(String(form.keyword ?? '').trim()))

const loadingState = ref(false)

watch(
  () => activeLedgerId.value,
  () => {
    void loadState()
  },
  { immediate: true },
)

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

function normalizeMajorInput(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

async function ensureStoresReady() {
  if (!activeLedgerId.value) return
  await Promise.all([
    accountStore.load().catch(() => null),
    categoryStore.load().catch(() => null),
    addonTemplateStore.load().catch(() => null),
  ])
}

async function loadState() {
  if (loadingState.value) return
  if (!activeLedgerId.value) {
    rules.value = []
    return
  }

  loadingState.value = true
  try {
    await ensureStoresReady()
    rules.value = await getAutoFillRules(activeLedgerId.value)
  } finally {
    loadingState.value = false
  }
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
  form.addonLabel = ''
  form.addonAmountMajor = ''
}

function openCreateDialog() {
  if (!activeLedgerId.value) return
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(rule) {
  editingId.value = String(rule?.id ?? '')
  form.keyword = String(rule?.keyword ?? '')
  form.type = String(rule?.type ?? 'expense')
  form.accountId = String(rule?.accountId ?? '')
  form.peerAccountId = String(rule?.peerAccountId ?? '')
  form.categoryId = String(rule?.categoryId ?? '')
  form.amountMajor = rule?.amountMajor ? String(rule.amountMajor) : ''
  form.note = String(rule?.note ?? '')
  form.isReimbursable = Boolean(rule?.isReimbursable)
  form.addonLabel = String(rule?.addonItems?.[0]?.label ?? '')
  form.addonAmountMajor = rule?.addonItems?.[0]?.deltaMajor ? String(rule.addonItems[0].deltaMajor) : ''
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  saving.value = false
}

function accountNameOf(accountId) {
  if (!accountId) return t('settings_auto_fill.keep_current')
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '-'
}

function categoryNameOf(categoryId) {
  if (!categoryId) return ''
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? ''
}

function describeRule(rule) {
  const parts = []
  const typeLabel = rule.type === 'income'
    ? t('analysis_page.type.income')
    : rule.type === 'transfer'
      ? t('transaction_about.type.transfer')
      : t('analysis_page.type.expense')

  parts.push(typeLabel)
  if (rule.type === 'transfer') {
    parts.push(`${accountNameOf(rule.accountId)} → ${accountNameOf(rule.peerAccountId)}`)
  } else if (rule.accountId) {
    parts.push(accountNameOf(rule.accountId))
  }

  if (rule.categoryId) {
    parts.push(categoryNameOf(rule.categoryId))
  }
  if (rule.amountMajor) {
    parts.push(`${t('settings_auto_fill.amount')} ${rule.amountMajor}`)
  }
  if (rule.note) {
    parts.push(`${t('settings_auto_fill.note')} ${rule.note}`)
  }
  if (rule.isReimbursable) {
    parts.push(t('settings_auto_fill.reimbursable'))
  }
  if (Array.isArray(rule.addonItems) && rule.addonItems.length) {
    const firstAddon = rule.addonItems[0]
    parts.push(`${t('settings_auto_fill.addon')} ${firstAddon.label}+${firstAddon.deltaMajor}`)
  }

  return parts.join(' / ')
}

async function submitRule() {
  if (!activeLedgerId.value || !canSave.value || saving.value) return
  saving.value = true
  try {
    const addonAmountMajor = normalizeMajorInput(form.addonAmountMajor)
    rules.value = await upsertAutoFillRule(activeLedgerId.value, {
      id: editingId.value,
      keyword: form.keyword,
      type: form.type,
      accountId: form.accountId,
      peerAccountId: form.type === 'transfer' ? form.peerAccountId : '',
      categoryId: form.type === 'transfer' ? '' : form.categoryId,
      amountMajor: normalizeMajorInput(form.amountMajor),
      note: form.note,
      isReimbursable: form.type === 'expense' ? form.isReimbursable : false,
      addonItems: form.addonLabel && addonAmountMajor
        ? [{
          label: form.addonLabel,
          deltaMajor: addonAmountMajor,
        }]
        : [],
    })
    uiStore.pushToast(t('settings_auto_fill.toast.saved'))
    closeDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_auto_fill.toast.save_failed'), 'error')
    saving.value = false
  }
}

async function removeRule(ruleId) {
  if (!activeLedgerId.value) return
  try {
    rules.value = await removeAutoFillRule(activeLedgerId.value, ruleId)
    uiStore.pushToast(t('settings_auto_fill.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_auto_fill.toast.delete_failed'), 'error')
  }
}

</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

h2,
h3 {
  margin: 0;
}

.rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.rule-item {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rule-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.rule-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
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
</style>
