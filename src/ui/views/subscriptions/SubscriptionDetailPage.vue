<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ isCreateMode ? t('subscription_page.form.create') : t('subscription_page.form.edit') }}</h2>
        <RouterLink class="btn back-btn" to="/subscriptions">{{ t('common.back') }}</RouterLink>
      </header>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('subscription_page.form.name') }}</h3>
        <button class="btn" type="button" @click="resetForm">{{ t('subscription_page.form.clear') }}</button>
      </header>

      <div class="stack">
        <label>
          {{ t('subscription_page.form.name') }}
          <input v-model.trim="form.name" class="input" :placeholder="t('subscription_page.form.name_placeholder')" />
        </label>

        <label>
          {{ t('subscription_page.form.amount') }}
          <input v-model.number="form.amountMajor" class="input" type="number" min="0" step="1" />
        </label>

        <div class="inline-grid">
          <label>
            {{ t('subscription_page.form.account') }}
            <CustomSelect v-model="form.accountId" :options="accountStore.accounts" />
          </label>
          <label>
            {{ t('subscription_page.form.category') }}
            <CustomSelect
              v-model="form.categoryId"
              :groups="expenseCategoryGroups"
              :placeholder="
                expenseCategoryGroups.length
                  ? t('subscription_page.form.category_placeholder')
                  : t('subscription_page.form.category_empty')
              "
            />
            <small v-if="selectedCategoryPath" class="muted selected-path">{{ selectedCategoryPath }}</small>
          </label>
        </div>

        <div class="inline-grid">
          <label>
            {{ t('subscription_page.form.interval_value') }}
            <input v-model.number="form.intervalValue" class="input" type="number" min="1" step="1" />
          </label>
          <label>
            {{ t('subscription_page.form.interval_unit') }}
            <CustomSelect v-model="form.intervalUnit" :options="intervalOptions" />
          </label>
        </div>

        <label>
          {{ t('subscription_page.form.next_charge_date') }}
          <DateTimePickerField
            class="picker-field"
            :date="form.nextChargeDate"
            :hour="form.nextChargeHour"
            :minute="form.nextChargeMinute"
            @update:date="onNextChargeDateChange"
            @update:hour="onNextChargeHourChange"
            @update:minute="onNextChargeMinuteChange"
          />
        </label>

        <label>
          {{ t('subscription_page.form.note') }}
          <textarea v-model.trim="form.note" class="textarea" rows="2" />
        </label>

        <label class="enabled-toggle-row">
          <span>{{ t('subscription_page.form.enabled_label') }}</span>
          <button
            type="button"
            class="btn"
            :class="{ primary: form.enabled }"
            @click="form.enabled = !form.enabled"
          >
            {{ form.enabled ? t('subscription_page.status.enabled') : t('subscription_page.status.disabled') }}
          </button>
        </label>

        <div class="row action-row">
          <button class="btn primary" :disabled="saving" @click="saveSubscription">
            {{ saving ? t('subscription_page.form.saving') : t('subscription_page.form.save') }}
          </button>
          <button v-if="!isCreateMode" class="btn" type="button" @click="chargeNow">{{ t('subscription_page.actions.charge_now') }}</button>
          <button v-if="!isCreateMode" class="btn danger" type="button" @click="deleteItem">{{ t('subscription_page.actions.delete') }}</button>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  chargeSubscriptionNow,
  deleteSubscription,
  listSubscriptions,
  upsertSubscription,
} from '@/core/services/subscription.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()

const saving = ref(false)
const form = reactive({
  id: '',
  name: '',
  amountMajor: null,
  accountId: '',
  categoryId: '',
  intervalValue: 1,
  intervalUnit: 'month',
  nextChargeDate: todayDateKey(),
  nextChargeHour: 9,
  nextChargeMinute: 0,
  note: '',
  enabled: true,
})

const subscriptionId = computed(() => String(route.params.id ?? '').trim())
const isCreateMode = computed(() => !subscriptionId.value || subscriptionId.value === 'new')
const intervalOptions = computed(() => [
  { value: 'day', label: t('subscription_page.interval.day') },
  { value: 'month', label: t('subscription_page.interval.month') },
  { value: 'year', label: t('subscription_page.interval.year') },
])

const expenseCategoryGroups = computed(() => {
  return (categoryStore.expenseCategoryGroups ?? [])
    .filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
})

const selectedCategoryPath = computed(() => categoryPathName(form.categoryId))

onMounted(async () => {
  await loadAll()
})

watch(
  () => ledgerStore.activeLedgerId,
  async () => {
    await loadAll()
  },
)

watch(
  () => subscriptionId.value,
  async () => {
    await loadAll()
  },
)

watch(
  () => expenseCategoryGroups.value,
  () => {
    syncFormCategory()
  },
  { deep: true },
)

async function loadAll() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    resetForm()
    return
  }

  await Promise.all([accountStore.load(), categoryStore.load()])

  if (isCreateMode.value) {
    resetForm()
    return
  }

  const items = await listSubscriptions(ledgerId)
  const target = items.find((item) => item.id === subscriptionId.value)
  if (!target) {
    uiStore.pushToast('找不到訂閱項目', 'error')
    await router.replace({ name: 'subscriptions' })
    return
  }
  applyFormByItem(target)
}

function syncFormCategory() {
  const categoryId = String(form.categoryId ?? '')
  const inGroups = expenseCategoryGroups.value.some((group) => group.categories.some((item) => item.id === categoryId))
  if (inGroups) return
  form.categoryId = String(expenseCategoryGroups.value[0]?.categories?.[0]?.id ?? '')
}

function resetForm() {
  form.id = ''
  form.name = ''
  form.amountMajor = null
  form.accountId = String(accountStore.accounts[0]?.id ?? '')
  form.categoryId = ''
  syncFormCategory()
  form.intervalValue = 1
  form.intervalUnit = 'month'
  form.nextChargeDate = todayDateKey()
  form.nextChargeHour = 9
  form.nextChargeMinute = 0
  form.note = ''
  form.enabled = true
}

function applyFormByItem(item) {
  form.id = item.id
  form.name = item.name
  form.amountMajor = Number(item.amountMinor ?? 0) / 100
  form.accountId = item.accountId
  form.categoryId = item.categoryId
  form.intervalValue = item.intervalValue
  form.intervalUnit = item.intervalUnit
  form.nextChargeDate = item.nextChargeDate || todayDateKey()
  form.nextChargeHour = 9
  form.nextChargeMinute = 0
  form.note = item.note
  form.enabled = item.enabled !== false
  syncFormCategory()
}

function onNextChargeDateChange(value) {
  form.nextChargeDate = String(value ?? '')
}

function onNextChargeHourChange(value) {
  form.nextChargeHour = clampHourMinute(value, 0, 23)
}

function onNextChargeMinuteChange(value) {
  form.nextChargeMinute = clampHourMinute(value, 0, 59)
}

function clampHourMinute(value, min, max) {
  const numeric = Math.floor(Number(value) || 0)
  return Math.max(min, Math.min(max, numeric))
}

function categoryPathName(categoryId) {
  const id = String(categoryId ?? '')
  if (!id) return '-'
  for (const group of expenseCategoryGroups.value) {
    const matched = group.categories.find((item) => item.id === id)
    if (matched) return `${group.name} / ${matched.name}`
  }
  return categoryStore.categories.find((item) => item.id === id)?.name ?? '-'
}

async function saveSubscription() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return

  const amountMinor = Math.round(Number(form.amountMajor ?? 0) * 100)
  if (!form.name.trim()) {
    uiStore.pushToast(t('subscription_page.toast.name_required'), 'error')
    return
  }
  if (amountMinor <= 0) {
    uiStore.pushToast(t('subscription_page.toast.amount_required'), 'error')
    return
  }
  if (!form.accountId || !form.categoryId) {
    uiStore.pushToast(t('subscription_page.toast.account_category_required'), 'error')
    return
  }
  if (!form.nextChargeDate) {
    uiStore.pushToast(t('subscription_page.toast.next_charge_required'), 'error')
    return
  }

  saving.value = true
  try {
    const saved = await upsertSubscription(
      ledgerId,
      {
        name: form.name,
        amountMinor,
        accountId: form.accountId,
        categoryId: form.categoryId,
        intervalValue: Math.max(1, Math.floor(Number(form.intervalValue) || 1)),
        intervalUnit: form.intervalUnit,
        nextChargeDate: form.nextChargeDate,
        note: form.note,
        enabled: form.enabled,
      },
      isCreateMode.value ? '' : form.id,
    )
    applyFormByItem(saved)
    uiStore.pushToast(t('subscription_page.toast.saved'))
    if (isCreateMode.value) {
      await router.replace({ name: 'subscription-detail', params: { id: saved.id } })
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.save_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function chargeNow() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || isCreateMode.value) return
  try {
    await chargeSubscriptionNow(ledgerId, form.id)
    await Promise.all([accountStore.load(), transactionStore.loadRecent(), loadAll()])
    uiStore.pushToast(t('subscription_page.toast.charged_one', { name: form.name || '-' }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.charge_failed'), 'error')
  }
}

async function deleteItem() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || isCreateMode.value) return
  const ok = window.confirm(t('subscription_page.confirm_delete', { name: form.name }))
  if (!ok) return
  try {
    await deleteSubscription(ledgerId, form.id)
    uiStore.pushToast(t('subscription_page.toast.deleted'))
    await router.replace({ name: 'subscriptions' })
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.delete_failed'), 'error')
  }
}

function todayDateKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.inline-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.selected-path {
  margin-top: -1px;
  font-size: 12px;
}

.enabled-toggle-row {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.picker-field :deep(.trigger) {
  min-height: 42px;
}

.action-row {
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .inline-grid {
    grid-template-columns: 1fr;
  }
}
</style>
