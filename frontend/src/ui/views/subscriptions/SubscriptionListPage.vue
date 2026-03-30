<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('subscription_page.title') }}</h2>
        <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted subtitle">{{ t('subscription_page.subtitle') }}</p>
      <button class="btn primary" :disabled="!activeLedgerId" @click="openCreateDialog">
        {{ t('subscription_page.add') }}
      </button>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('subscription_page.list_title') }}</h3>
        <small v-if="isFreePlan" class="muted">{{ t('subscription_page.list_hint') }}</small>
      </header>

      <ul v-if="items.length" class="item-list">
        <li
          v-for="item in items"
          :key="item.id"
          class="item-card"
          :class="{ due: isDue(item), paused: isPaused(item) }"
        >
          <div class="item-head">
            <div class="item-icon" aria-hidden="true">
              <font-awesome-icon :icon="categoryIcon(item.categoryId)" />
            </div>
            <div class="item-copy">
              <div class="row title-row">
                <strong>{{ item.name }}</strong>
                <span class="badge" :class="{ due: isDue(item), paused: isPaused(item) }">
                  {{ statusLabel(item) }}
                </span>
              </div>
              <small class="muted meta-line">
                <span>{{ accountName(item.accountId) }}</span>
                <span>{{ t('settings_auto_fill.category') }} {{ categoryName(item.categoryId) }}</span>
              </small>
              <small class="muted meta-line amount-line">
                {{ t('subscription_page.amount') }}
                <MoneyText :value-minor="item.amountMinor" />
                <span class="meta-separator">·</span>
                <span>{{ t('subscription_page.interval_label') }} {{ describeSubscriptionInterval(item) }}</span>
              </small>
              <small class="muted meta-line">
                <span>{{ t('subscription_page.start_date') }} {{ formatDate(item.startDate) }}</span>
                <span>{{ t('subscription_page.next_due') }} {{ nextChargeLabel(item) }}</span>
              </small>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn" @click="openEditDialog(item)">{{ t('common.edit') }}</button>
            <button class="btn danger" @click="removeItem(item.id)">{{ t('common.delete') }}</button>
          </div>
        </li>
      </ul>

      <p v-else class="muted">{{ t('subscription_page.empty') }}</p>
    </article>

    <AppDialog
      :open="dialogOpen"
      :title="editingId ? t('subscription_page.edit') : t('subscription_page.add')"
      :confirm-disabled="!canSave"
      :loading="saving"
      loading-text="儲存中..."
      @close="closeDialog"
      @confirm="submit"
    >
      <label class="field">
        {{ t('subscription_page.name') }}
        <input v-model.trim="form.name" class="input" type="text" maxlength="60" />
      </label>

      <div class="interval-grid">
        <label class="field">
          {{ t('subscription_page.interval_value') }}
          <input v-model.number="form.intervalValue" class="input" type="number" min="1" step="1" />
        </label>
        <label class="field">
          {{ t('subscription_page.interval_unit') }}
          <CustomSelect v-model="form.intervalUnit" :options="intervalOptions" />
        </label>
      </div>

      <label class="field">
        {{ t('subscription_page.account') }}
        <CustomSelect v-model="form.accountId" :options="accountOptions" />
      </label>

      <label class="field">
        {{ t('settings_auto_fill.category') }}
        <CustomSelect v-model="form.categoryId" :groups="categoryOptionGroups" />
      </label>

      <label class="field">
        {{ t('subscription_page.amount') }}
        <input v-model.number="form.amountMajor" class="input" type="number" min="0" step="0.01" />
      </label>

      <div class="field">
        <span>{{ t('subscription_page.start_date') }}</span>
        <DateTimePickerField
          :date="form.startDate"
          :hour="0"
          :minute="0"
          :show-time="false"
          @update:date="form.startDate = $event"
        />
      </div>

      <div class="field">
        <button
          type="button"
          class="switch-row subscription-toggle"
          :class="{ active: form.paused }"
          role="checkbox"
          :aria-checked="form.paused ? 'true' : 'false'"
          @click="form.paused = !form.paused"
        >
          <span>{{ t('subscription_page.pause_label') }}</span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
      </div>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { getMembershipTierSnapshot, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import { resolveSubscriptionNextChargeDate, toSubscriptionDateInput } from '@/core/utils/subscription-schedule'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { buildCategorySelectGroups, ensureCategoryIdForType, getCategoryOptionsByType } from '@/ui/utils/category-options'
import {
  describeSubscriptionInterval,
  getSubscriptionItems,
  isSubscriptionDue,
  removeSubscriptionItem,
  upsertSubscriptionItem,
} from '@/core/services/subscription-tracker.service'

const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()
const DEFAULT_SUBSCRIPTION_ICON = 'fa-solid fa-calendar-days'

const items = ref([])
const dialogOpen = ref(false)
const saving = ref(false)
const editingId = ref('')
const membershipTier = ref(getMembershipTierSnapshot())
const form = reactive({
  name: '',
  intervalValue: 1,
  intervalUnit: 'month',
  accountId: '',
  categoryId: '',
  amountMajor: 0,
  startDate: toSubscriptionDateInput(new Date()),
  paused: false,
})

const activeLedgerId = computed(() => ledgerStore.activeLedgerId)
const isFreePlan = computed(() => membershipTier.value === 'free')
const accountOptions = computed(() => accountStore.accounts.map((item) => ({
  value: item.id,
  label: item.name,
})))
const categoryOptionGroups = computed(() => buildCategorySelectGroups(categoryStore, 'expense'))
const categoryOptions = computed(() => getCategoryOptionsByType(categoryStore, 'expense'))
const intervalOptions = computed(() => ([
  { value: 'year', label: t('subscription_page.interval.year') },
  { value: 'month', label: t('subscription_page.interval.month') },
  { value: 'day', label: t('subscription_page.interval.day') },
]))
const canSave = computed(() => {
  return Boolean(
    String(form.name ?? '').trim()
    && Math.max(1, Number(form.intervalValue) || 0) > 0
    && String(form.accountId ?? '').trim()
    && String(form.categoryId ?? '').trim()
    && String(form.startDate ?? '').trim()
  )
})

function toMinor(major) {
  const parsed = Number(major)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.max(0, Math.round(parsed * 100))
}

watch(
  () => activeLedgerId.value,
  () => {
    void loadItems()
  },
  { immediate: true },
)

async function loadItems() {
  const ledgerId = activeLedgerId.value
  if (!ledgerId) {
    items.value = []
    return
  }
  await Promise.all([
    accountStore.accounts.length ? Promise.resolve() : accountStore.load().catch(() => null),
    categoryStore.categories.length ? Promise.resolve() : categoryStore.load().catch(() => null),
  ])
  items.value = await getSubscriptionItems(ledgerId)
}

function resetForm() {
  editingId.value = ''
  form.name = ''
  form.intervalValue = 1
  form.intervalUnit = 'month'
  form.accountId = accountOptions.value[0]?.value ?? ''
  form.categoryId = ensureCategoryIdForType(categoryStore, 'expense', '')
  form.amountMajor = 0
  form.startDate = toSubscriptionDateInput(new Date())
  form.paused = false
}

watch(
  () => categoryOptions.value,
  () => {
    form.categoryId = ensureCategoryIdForType(categoryStore, 'expense', form.categoryId)
  },
  { deep: true },
)

function openCreateDialog() {
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(item) {
  editingId.value = String(item?.id ?? '')
  form.name = String(item?.name ?? '')
  form.intervalValue = Math.max(1, Number(item?.intervalValue ?? 1) || 1)
  form.intervalUnit = String(item?.intervalUnit ?? 'month')
  form.accountId = String(item?.accountId ?? '')
  form.categoryId = String(item?.categoryId ?? '')
  form.amountMajor = Math.abs(Number(item?.amountMinor ?? 0)) / 100
  form.startDate = String(item?.startDate ?? '') || toSubscriptionDateInput(new Date())
  form.paused = Boolean(item?.paused)
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  saving.value = false
}

function formatDate(value) {
  const text = String(value ?? '').trim()
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(text)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('zh-TW')
}

function accountName(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name ?? '-'
}

function categoryName(categoryId) {
  if (!categoryId) return '未分類'
  return categoryStore.categories.find((item) => item.id === categoryId)?.name ?? '未分類'
}

function categoryIcon(categoryId) {
  if (!categoryId) return DEFAULT_SUBSCRIPTION_ICON
  return categoryStore.categories.find((item) => item.id === categoryId)?.icon || DEFAULT_SUBSCRIPTION_ICON
}

function isDue(item) {
  return isSubscriptionDue(item)
}

function isPaused(item) {
  return Boolean(item?.paused)
}

function nextChargeLabel(item) {
  if (isPaused(item)) return t('subscription_page.next_due_paused')
  return formatDate(resolveSubscriptionNextChargeDate(item))
}

function statusLabel(item) {
  if (isPaused(item)) return t('subscription_page.status.paused')
  if (isDue(item)) return t('subscription_page.status.due')
  return t('subscription_page.status.tracking')
}

async function submit() {
  if (!activeLedgerId.value || !canSave.value || saving.value) return
  saving.value = true
  try {
    items.value = await upsertSubscriptionItem(activeLedgerId.value, {
      id: editingId.value,
      name: form.name,
      intervalValue: form.intervalValue,
      intervalUnit: form.intervalUnit,
      accountId: form.accountId,
      categoryId: form.categoryId,
      amountMinor: toMinor(form.amountMajor),
      startDate: form.startDate,
      paused: form.paused,
    })
    uiStore.pushToast(t('subscription_page.toast.saved'))
    closeDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.save_failed'), 'error')
    saving.value = false
  }
}

async function removeItem(itemId) {
  if (!activeLedgerId.value) return
  try {
    items.value = await removeSubscriptionItem(activeLedgerId.value, itemId)
    uiStore.pushToast(t('subscription_page.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('subscription_page.toast.delete_failed'), 'error')
  }
}

let unsubscribeMembership = null

onMounted(async () => {
  unsubscribeMembership = subscribeMembershipSnapshot((next) => {
    membershipTier.value = String(next?.tier ?? getMembershipTierSnapshot())
  }, { emitCurrent: true })
  await Promise.all([
    accountStore.accounts.length ? Promise.resolve() : accountStore.load().catch(() => null),
    categoryStore.categories.length ? Promise.resolve() : categoryStore.load().catch(() => null),
  ])
})

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') {
    unsubscribeMembership()
    unsubscribeMembership = null
  }
})
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

.subtitle {
  margin: 0;
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.item-card {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.item-card.due {
  border-color: color-mix(in srgb, var(--warning, #f59f00) 40%, var(--field-border) 60%);
  background: color-mix(in srgb, var(--warning, #f59f00) 6%, var(--card) 94%);
}

.item-card.paused {
  opacity: 0.82;
}

.title-row {
  align-items: center;
}

.item-head {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.item-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--field-border);
  font-size: 12px;
}

.badge.due {
  border-color: color-mix(in srgb, var(--warning, #f59f00) 40%, var(--field-border) 60%);
  color: color-mix(in srgb, var(--warning, #f59f00) 80%, var(--text) 20%);
}

.badge.paused {
  border-color: color-mix(in srgb, var(--muted) 30%, var(--field-border) 70%);
  color: var(--muted);
}

.item-copy {
  display: grid;
  gap: 3px;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.meta-separator {
  color: var(--muted);
}

.amount-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.item-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.interval-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.subscription-toggle {
  width: 100%;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--field-border);
  border-radius: 14px;
  background: var(--surface-popover);
  color: var(--text);
  text-align: left;
}

.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--field-border) 55%);
  background: color-mix(in srgb, var(--primary) 12%, var(--surface-popover) 88%);
}

.switch-track {
  position: relative;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 45%, transparent);
  transition: background 160ms ease;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: white;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  transition: transform 160ms ease;
}

.switch-row.active .switch-track {
  background: linear-gradient(120deg, color-mix(in srgb, var(--primary) 75%, var(--card) 25%), var(--primary));
}

.switch-row.active .switch-thumb {
  transform: translateX(18px);
}

@media (max-width: 640px) {
  .item-head {
    grid-template-columns: 1fr;
  }

  .item-icon {
    width: 36px;
    height: 36px;
  }
}

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}
</style>
