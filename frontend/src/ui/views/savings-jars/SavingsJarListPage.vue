<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('savings_jar.title') }}</h2>
      <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row panel-head">
        <div>
          <h3>{{ t('savings_jar.title') }}</h3>
          <p v-if="isFreePlan" class="muted limit-note">{{ t('savings_jar.limit_hint') }}</p>
        </div>
        <button class="btn primary" @click="openCreateDialog">{{ t('savings_jar.add_button') }}</button>
      </header>

      <div v-if="savingJarRows.length" class="jar-list">
        <article v-for="jar in savingJarRows" :key="jar.id" class="jar-card">
          <header class="row jar-head">
            <div class="jar-title-wrap">
              <span class="jar-icon-wrap">
                <font-awesome-icon :icon="jar.icon || 'fa-solid fa-piggy-bank'" class="jar-icon" />
              </span>
              <div>
                <h4 class="jar-title">{{ jar.name }}</h4>
                <p class="muted jar-meta">{{ jar.groupName }} · {{ jar.currencyCode }}</p>
              </div>
            </div>
            <span class="asset-chip" :class="{ excluded: !jar.includeInAssets }">
              {{ jar.includeInAssets ? t('account.include_in_assets_on') : t('account.include_in_assets_off') }}
            </span>
          </header>

          <div class="jar-grid">
            <div class="metric-card">
              <small class="muted">{{ t('savings_jar.current_balance') }}</small>
              <MoneyText :value-minor="jar.balanceMinor" :currency="jar.currencyCode" />
            </div>
            <div class="metric-card">
              <small class="muted">{{ t('savings_jar.goal_mode') }}</small>
              <strong>{{ jar.goalLabel }}</strong>
              <small v-if="jar.goalType === 'target'" class="muted">{{ t('savings_jar.goal_amount_label', { amount: jar.targetAmountLabel }) }}</small>
            </div>
          </div>

          <template v-if="jar.goalType === 'target'">
            <div class="progress-head">
              <small class="muted">{{ t('savings_jar.goal_progress') }}</small>
              <small class="muted">{{ jar.progressPercent }}%</small>
            </div>
            <div class="progress-track">
              <span class="progress-fill" :style="{ width: `${jar.progressPercent}%` }"></span>
            </div>
          </template>
          <p v-else class="muted unlimited-note">{{ t('savings_jar.goal_open') }}</p>

          <section class="auto-save-section">
            <div class="row auto-save-head">
              <strong>{{ t('savings_jar.auto_save.title') }}</strong>
              <span class="asset-chip" :class="{ excluded: jar.autoSaveStatusTone !== 'active' }">
                {{ jar.autoSaveStatusLabel }}
              </span>
            </div>
            <p class="muted auto-save-copy">{{ jar.autoSaveSummary }}</p>
            <p v-if="jar.autoSaveNextDueLabel" class="muted auto-save-copy">
              {{ t('savings_jar.auto_save.next_due') }} {{ jar.autoSaveNextDueLabel }}
            </p>
            <p v-if="jar.autoSaveInvalid" class="error-text">{{ t('savings_jar.auto_save.invalid') }}</p>
          </section>

          <div class="row jar-actions">
            <button class="btn" @click="openSavingsJarDetail(jar.id)">{{ t('savings_jar.activity.title') }}</button>
            <button class="btn" @click="openEditDialog(jar)">{{ t('savings_jar.action.edit') }}</button>
            <button class="btn" :disabled="!jar.canTransfer" @click="openFlowDialog('deposit', jar)">{{ t('savings_jar.action.deposit') }}</button>
            <button class="btn" :disabled="!jar.canTransfer" @click="openFlowDialog('withdraw', jar)">{{ t('savings_jar.action.withdraw') }}</button>
          </div>
          <p v-if="!jar.canTransfer" class="muted transfer-hint">{{ t('savings_jar.same_currency_required') }}</p>
        </article>
      </div>

      <p v-else class="muted empty-note">{{ t('savings_jar.empty') }}</p>
    </article>

    <AppDialog
      :open="jarDialogOpen"
      presentation="sheet"
      :title="editingJarId ? t('savings_jar.dialog.edit_title') : t('savings_jar.dialog.create_title')"
      :confirm-text="t('common.save')"
      :confirm-disabled="!canSaveJarForm || jarSaving"
      :loading="jarSaving"
      loading-text="..."
      @close="closeJarDialog"
      @confirm="submitJarDialog"
    >
      <label class="field">
        {{ t('savings_jar.field.name') }}
        <input v-model="jarForm.name" class="input" type="text" maxlength="40" />
      </label>

      <label class="field">
        {{ t('savings_jar.field.group') }}
        <CustomSelect v-model="jarForm.groupId" :options="groupOptions" />
      </label>

      <label class="field">
        {{ t('savings_jar.field.currency') }}
        <CustomSelect v-model="jarForm.currencyCode" :options="currencyOptions" />
      </label>

      <div class="field">
        <span>{{ t('savings_jar.goal_mode') }}</span>
        <div class="goal-type-row">
          <button type="button" class="btn" :class="{ primary: jarForm.goalType === 'target' }" @click="jarForm.goalType = 'target'">
            {{ t('savings_jar.goal_target') }}
          </button>
          <button type="button" class="btn" :class="{ primary: jarForm.goalType === 'open' }" @click="jarForm.goalType = 'open'">
            {{ t('savings_jar.goal_open') }}
          </button>
        </div>
      </div>

      <label v-if="jarForm.goalType === 'target'" class="field">
        {{ t('savings_jar.field.target_amount') }}
        <input v-model="jarForm.targetAmountInput" class="input" type="number" min="0" step="0.01" />
      </label>

      <div class="field">
        <span>{{ t('account.include_in_assets_label') }}</span>
        <button
          type="button"
          class="switch-row"
          :class="{ active: jarForm.includeInAssets }"
          :aria-pressed="jarForm.includeInAssets ? 'true' : 'false'"
          @click="jarForm.includeInAssets = !jarForm.includeInAssets"
        >
          <span class="switch-copy">
            <strong>{{ jarForm.includeInAssets ? t('account.include_in_assets_on') : t('account.include_in_assets_off') }}</strong>
            <small class="muted">{{ t('account.include_in_assets_hint') }}</small>
          </span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>
      </div>

      <div class="field">
        <span>{{ t('savings_jar.auto_save.title') }}</span>
        <button
          type="button"
          class="switch-row"
          :class="{ active: jarForm.autoSaveEnabled }"
          :aria-pressed="jarForm.autoSaveEnabled ? 'true' : 'false'"
          @click="jarForm.autoSaveEnabled = !jarForm.autoSaveEnabled"
        >
          <span class="switch-copy">
            <strong>{{ jarForm.autoSaveEnabled ? t('savings_jar.auto_save.enabled') : t('savings_jar.auto_save.disabled') }}</strong>
            <small class="muted">{{ t('savings_jar.auto_save.hint') }}</small>
          </span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>
      </div>

      <template v-if="jarForm.autoSaveEnabled">
        <label class="field">
          {{ t('savings_jar.auto_save.source_account') }}
          <CustomSelect v-model="jarForm.autoSaveSourceAccountId" :groups="autoSaveAccountGroups" />
        </label>

        <label class="field">
          {{ t('savings_jar.auto_save.amount') }}
          <input v-model="jarForm.autoSaveAmountInput" class="input" type="number" min="0" step="0.01" />
        </label>

        <div class="interval-grid">
          <label class="field">
            {{ t('subscription_page.interval_value') }}
            <input v-model.number="jarForm.autoSaveIntervalValue" class="input" type="number" min="1" step="1" />
          </label>
          <label class="field">
            {{ t('subscription_page.interval_unit') }}
            <CustomSelect v-model="jarForm.autoSaveIntervalUnit" :options="intervalOptions" />
          </label>
        </div>

        <label v-if="jarForm.autoSaveIntervalUnit === 'month'" class="field">
          {{ t('subscription_page.charge_day') }}
          <input v-model.number="jarForm.autoSaveChargeDay" class="input" type="number" min="1" max="31" step="1" />
          <small class="muted">{{ t('subscription_page.charge_day_help') }}</small>
        </label>

        <div class="field">
          <span>{{ t('savings_jar.auto_save.start_date') }}</span>
          <DateTimePickerField
            :date="jarForm.autoSaveStartDate"
            :hour="0"
            :minute="0"
            :show-time="false"
            @update:date="jarForm.autoSaveStartDate = $event"
          />
        </div>

        <div class="field">
          <button
            type="button"
            class="switch-row subscription-toggle"
            :class="{ active: jarForm.autoSavePaused }"
            role="checkbox"
            :aria-checked="jarForm.autoSavePaused ? 'true' : 'false'"
            @click="jarForm.autoSavePaused = !jarForm.autoSavePaused"
          >
            <span>{{ t('savings_jar.auto_save.pause_label') }}</span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
        </div>

        <p v-if="autoSaveInvalidReason" class="error-text">{{ autoSaveInvalidReason }}</p>
      </template>

      <div v-if="editingJarId && currentEditingJar?.autoSaveEnabled" class="field delete-field">
        <button type="button" class="btn" :disabled="jarSaving || jarDeleting || autoSaveDeleting" @click="removeAutoSaveSchedule">
          {{ autoSaveDeleting ? t('savings_jar.auto_save.deleting') : t('savings_jar.auto_save.delete') }}
        </button>
      </div>

      <div v-if="editingJarId" class="field delete-field">
        <button type="button" class="btn danger" :disabled="jarSaving || jarDeleting" @click="removeSavingsJar">
          {{ jarDeleting ? t('savings_jar.action.deleting') : t('common.delete') }}
        </button>
      </div>
    </AppDialog>

    <AppDialog
      :open="flowDialogOpen"
      presentation="sheet"
      :title="flowMode === 'withdraw' ? t('savings_jar.dialog.withdraw_title') : t('savings_jar.dialog.deposit_title')"
      :confirm-text="flowMode === 'withdraw' ? t('savings_jar.action.withdraw') : t('savings_jar.action.deposit')"
      :confirm-disabled="!canSubmitFlow || flowSaving"
      :loading="flowSaving"
      loading-text="..."
      @close="closeFlowDialog"
      @confirm="submitFlowDialog"
    >
      <p v-if="activeFlowJar" class="muted flow-jar-name">{{ activeFlowJar.name }} · {{ activeFlowJar.currencyCode }}</p>

      <label class="field">
        {{ t('savings_jar.field.source_account') }}
        <CustomSelect v-model="flowForm.accountId" :groups="flowAccountGroups" />
      </label>

      <label class="field">
        {{ t('savings_jar.field.amount') }}
        <input v-model="flowForm.amountInput" class="input" type="number" min="0" step="0.01" />
      </label>

      <p v-if="flowInsufficientBalance" class="error-text">{{ t('savings_jar.toast.insufficient_balance') }}</p>
      <p v-if="!flowAccountOptions.length" class="muted">{{ t('savings_jar.same_currency_required') }}</p>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { currencyOptions, normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { createSavingsJar, deleteSavingsJar, deleteSavingsJarAutoSave, updateSavingsJar } from '@/core/services/savings-jar.service'
import { isFreeTier } from '@/core/services/membership.service'
import { describeSubscriptionInterval } from '@/core/services/subscription-tracker.service'
import { resolveSubscriptionNextChargeDate, toSubscriptionDateInput } from '@/core/utils/subscription-schedule'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'

const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t } = useI18n()
const router = useRouter()

const jarDialogOpen = ref(false)
const editingJarId = ref('')
const jarSaving = ref(false)
const jarDeleting = ref(false)
const autoSaveDeleting = ref(false)
const flowDialogOpen = ref(false)
const flowSaving = ref(false)
const flowMode = ref('deposit')
const flowJarId = ref('')
const jarForm = reactive({
  name: '',
  groupId: '',
  currencyCode: 'TWD',
  goalType: 'open',
  targetAmountInput: '',
  includeInAssets: false,
  autoSaveEnabled: false,
  autoSaveSourceAccountId: '',
  autoSaveAmountInput: '',
  autoSaveIntervalValue: 1,
  autoSaveIntervalUnit: 'month',
  autoSaveChargeDay: new Date().getDate(),
  autoSaveStartDate: toSubscriptionDateInput(new Date()),
  autoSavePaused: false,
})
const flowForm = reactive({
  accountId: '',
  amountInput: '',
})

function toMinorFromMajor(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.max(0, Math.round(parsed * 100))
}

function formatDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(text)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('zh-TW')
}

function readAutoSaveConfig(raw = {}) {
  const sourceAccountId = String(raw.savings_jar_auto_save_source_account_id ?? '').trim()
  const amountMinor = Math.round(Number(raw.savings_jar_auto_save_amount_minor) || 0)
  const startDate = String(raw.savings_jar_auto_save_start_date ?? '').trim()
  if (!sourceAccountId || amountMinor <= 0 || !startDate) {
    return null
  }

  const intervalUnit = String(raw.savings_jar_auto_save_interval_unit ?? 'month').trim().toLowerCase()
  return {
    sourceAccountId,
    amountMinor,
    intervalValue: Math.max(1, Number(raw.savings_jar_auto_save_interval_value ?? 1) || 1),
    intervalUnit: ['day', 'month', 'year'].includes(intervalUnit) ? intervalUnit : 'month',
    chargeDay: Math.min(31, Math.max(1, Number(raw.savings_jar_auto_save_charge_day ?? String(startDate).slice(-2) ?? 1) || 1)),
    startDate,
    paused: Number(raw.savings_jar_auto_save_paused ?? 0) === 1,
  }
}

watch(
  () => ledgerStore.activeLedgerId,
  async (ledgerId) => {
    if (!ledgerId) return
    await accountStore.load()
  },
  { immediate: true },
)

watch(
  () => jarForm.autoSaveStartDate,
  (value) => {
    if (jarForm.autoSaveIntervalUnit !== 'month') return
    const parsed = Math.trunc(Number(String(value ?? '').slice(-2)))
    if (parsed >= 1 && parsed <= 31 && !editingJarId.value) {
      jarForm.autoSaveChargeDay = parsed
    }
  },
)

watch(
  () => jarForm.autoSaveIntervalUnit,
  (value, previous) => {
    if (value !== 'month') return
    if (previous === 'month') return
    const parsed = Math.trunc(Number(String(jarForm.autoSaveStartDate ?? '').slice(-2)))
    jarForm.autoSaveChargeDay = Math.min(31, Math.max(1, parsed || jarForm.autoSaveChargeDay || 1))
  },
)

const groupOptions = computed(() => {
  return accountStore.groups.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})

const intervalOptions = computed(() => ([
  { value: 'year', label: t('subscription_page.interval.year') },
  { value: 'month', label: t('subscription_page.interval.month') },
  { value: 'day', label: t('subscription_page.interval.day') },
]))

const savingJarRows = computed(() => {
  return accountStore.savingsJarAccounts.map((account) => {
    const balanceMinor = Number(accountStore.balances.find((item) => item.id === account.id)?.balance_minor ?? account.opening_balance_minor ?? 0)
    const goalType = String(account.savings_jar_goal_type ?? 'open') === 'target' ? 'target' : 'open'
    const targetAmountMinor = Math.max(0, Number(account.savings_jar_target_amount_minor ?? 0))
    const progressPercent = goalType === 'target' && targetAmountMinor > 0
      ? Math.min(100, Math.round((Math.max(0, balanceMinor) / targetAmountMinor) * 100))
      : 0
    const currencyCode = normalizeCurrencyCode(account.currency_code, ledgerStore.activeLedger?.currency_code || 'TWD')
    const groupName = accountStore.groups.find((item) => item.id === account.group_id)?.name ?? '-'
    const eligibleAccounts = accountStore.regularAccounts.filter(
      (item) => normalizeCurrencyCode(item.currency_code, currencyCode) === currencyCode,
    )
    const autoSave = readAutoSaveConfig(account)
    const autoSaveSourceAccount = autoSave
      ? accountStore.regularAccounts.find((item) => String(item.id ?? '') === autoSave.sourceAccountId) ?? null
      : null
    const autoSaveInvalid = Boolean(autoSave && !autoSaveSourceAccount)
    const autoSaveEnabled = Boolean(autoSave)
    const autoSaveStatusTone = !autoSaveEnabled
      ? 'off'
      : autoSaveInvalid
        ? 'invalid'
        : autoSave.paused
          ? 'paused'
          : 'active'
    const autoSaveStatusLabel = !autoSaveEnabled
      ? t('savings_jar.auto_save.status.off')
      : autoSaveInvalid
        ? t('savings_jar.auto_save.status.invalid')
        : autoSave.paused
          ? t('savings_jar.auto_save.status.paused')
          : t('savings_jar.auto_save.status.active')
    const autoSaveSummary = !autoSaveEnabled
      ? t('savings_jar.auto_save.summary_off')
      : t('savings_jar.auto_save.summary', {
        amount: formatCurrencyMajor((autoSave?.amountMinor ?? 0) / 100, currencyCode),
        sourceAccount: autoSaveSourceAccount?.name ?? t('savings_jar.activity.unknown_account'),
        interval: describeSubscriptionInterval(autoSave),
      })
    const autoSaveNextDueLabel = autoSaveEnabled && !autoSaveInvalid && !autoSave.paused
      ? formatDate(resolveSubscriptionNextChargeDate(autoSave))
      : ''

    return {
      ...account,
      balanceMinor,
      currencyCode,
      groupName,
      includeInAssets: Number(account.include_in_assets ?? 1) === 1,
      goalType,
      goalLabel: goalType === 'target' ? t('savings_jar.goal_target') : t('savings_jar.goal_open'),
      targetAmountMinor,
      targetAmountLabel: formatCurrencyMajor(targetAmountMinor / 100, currencyCode),
      progressPercent,
      canTransfer: eligibleAccounts.length > 0,
      autoSaveEnabled,
      autoSave,
      autoSaveInvalid,
      autoSaveStatusTone,
      autoSaveStatusLabel,
      autoSaveSummary,
      autoSaveNextDueLabel,
    }
  })
})

const currentEditingJar = computed(() => savingJarRows.value.find((item) => String(item.id ?? '') === String(editingJarId.value ?? '')) ?? null)
const activeFlowJar = computed(() => savingJarRows.value.find((item) => item.id === flowJarId.value) ?? null)
const flowAccountGroups = computed(() => {
  const jar = activeFlowJar.value
  if (!jar) return []
  return buildAccountOptionGroups(accountStore.groups, accountStore.regularAccounts, {
    currencyCode: jar.currencyCode,
  })
})
const flowAccountOptions = computed(() => flowAccountGroups.value.flatMap((group) => group.options ?? []))
const autoSaveAccountGroups = computed(() => {
  const currencyCode = normalizeCurrencyCode(jarForm.currencyCode, ledgerStore.activeLedger?.currency_code || 'TWD')
  return buildAccountOptionGroups(accountStore.groups, accountStore.regularAccounts, { currencyCode })
})
const autoSaveAccountOptions = computed(() => autoSaveAccountGroups.value.flatMap((group) => group.options ?? []))

// smb298: watch MUST sit after autoSaveAccountOptions — earlier placement caused TDZ
// (Cannot access 'autoSaveAccountOptions' before initialization) on Android client_error_logs.
watch(
  () => autoSaveAccountOptions.value,
  (options) => {
    const currentValue = String(jarForm.autoSaveSourceAccountId ?? '')
    if (!jarForm.autoSaveEnabled) return
    if (options.some((item) => String(item.value ?? '') === currentValue)) return
    jarForm.autoSaveSourceAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

const isFreePlan = computed(() => isFreeTier())

const jarTargetInvalid = computed(() => {
  if (jarForm.goalType !== 'target') return false
  return !Number.isFinite(Number(jarForm.targetAmountInput)) || Number(jarForm.targetAmountInput) <= 0
})

const autoSaveInvalidReason = computed(() => {
  if (!jarForm.autoSaveEnabled) return ''
  if (!autoSaveAccountOptions.value.length) return t('savings_jar.auto_save.invalid')
  if (!String(jarForm.autoSaveSourceAccountId ?? '').trim()) return t('savings_jar.auto_save.source_required')
  if (toMinorFromMajor(jarForm.autoSaveAmountInput) <= 0) return t('savings_jar.auto_save.amount_required')
  if (!String(jarForm.autoSaveStartDate ?? '').trim()) return t('savings_jar.auto_save.start_date_required')
  return ''
})

const canSaveJarForm = computed(() => {
  return Boolean(
    jarForm.name.trim()
    && jarForm.groupId
    && jarForm.currencyCode
    && !jarTargetInvalid.value
    && !autoSaveInvalidReason.value
  )
})

const flowAmountMinor = computed(() => Math.round((Number(flowForm.amountInput) || 0) * 100))
const flowInsufficientBalance = computed(() => {
  if (flowMode.value !== 'withdraw') return false
  const jar = activeFlowJar.value
  if (!jar) return false
  return flowAmountMinor.value > Math.max(0, Number(jar.balanceMinor ?? 0))
})
const canSubmitFlow = computed(() => {
  return Boolean(flowForm.accountId && flowAmountMinor.value > 0 && !flowInsufficientBalance.value && flowAccountOptions.value.length)
})

function formatCurrencyMajor(valueMajor, currencyCode = 'TWD') {
  const major = Number(valueMajor) || 0
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: normalizeCurrencyCode(currencyCode, 'TWD'),
    minimumFractionDigits: Math.abs(Math.round(major * 100)) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major)
}

function openSavingsJarDetail(accountId) {
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedAccountId) return
  void router.push({ name: 'account-detail', params: { id: normalizedAccountId } }).catch(() => {})
}

function resetJarForm() {
  jarForm.name = ''
  jarForm.groupId = String(accountStore.groups[0]?.id ?? '')
  jarForm.currencyCode = normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD')
  jarForm.goalType = 'open'
  jarForm.targetAmountInput = ''
  jarForm.includeInAssets = false
  jarForm.autoSaveEnabled = false
  jarForm.autoSaveSourceAccountId = ''
  jarForm.autoSaveAmountInput = ''
  jarForm.autoSaveIntervalValue = 1
  jarForm.autoSaveIntervalUnit = 'month'
  jarForm.autoSaveChargeDay = new Date().getDate()
  jarForm.autoSaveStartDate = toSubscriptionDateInput(new Date())
  jarForm.autoSavePaused = false
}

function openCreateDialog() {
  if (!accountStore.groups.length) {
    uiStore.pushToast(t('savings_jar.toast.no_group'), 'error')
    return
  }
  editingJarId.value = ''
  resetJarForm()
  jarDialogOpen.value = true
}

function openEditDialog(jar) {
  if (!jar) return
  editingJarId.value = String(jar.id ?? '')
  jarForm.name = String(jar.name ?? '')
  jarForm.groupId = String(jar.group_id ?? '')
  jarForm.currencyCode = String(jar.currencyCode ?? normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD'))
  jarForm.goalType = jar.goalType
  jarForm.targetAmountInput = jar.goalType === 'target' ? String(Number(jar.targetAmountMinor ?? 0) / 100) : ''
  jarForm.includeInAssets = Boolean(jar.includeInAssets)
  jarForm.autoSaveEnabled = Boolean(jar.autoSaveEnabled)
  jarForm.autoSaveSourceAccountId = String(jar.autoSave?.sourceAccountId ?? '')
  jarForm.autoSaveAmountInput = jar.autoSave ? String(Number(jar.autoSave.amountMinor ?? 0) / 100) : ''
  jarForm.autoSaveIntervalValue = Math.max(1, Number(jar.autoSave?.intervalValue ?? 1) || 1)
  jarForm.autoSaveIntervalUnit = String(jar.autoSave?.intervalUnit ?? 'month')
  jarForm.autoSaveChargeDay = Math.min(31, Math.max(1, Number(jar.autoSave?.chargeDay ?? String(jar.autoSave?.startDate ?? '').slice(-2) ?? 1) || 1))
  jarForm.autoSaveStartDate = String(jar.autoSave?.startDate ?? '') || toSubscriptionDateInput(new Date())
  jarForm.autoSavePaused = Boolean(jar.autoSave?.paused)
  jarDialogOpen.value = true
}

function closeJarDialog(force = false) {
  if (!force && (jarSaving.value || jarDeleting.value || autoSaveDeleting.value)) return
  jarDialogOpen.value = false
  editingJarId.value = ''
}

async function submitJarDialog() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !canSaveJarForm.value || jarSaving.value) return

  jarSaving.value = true
  try {
    const payload = {
      name: jarForm.name.trim(),
      groupId: jarForm.groupId,
      currencyCode: jarForm.currencyCode,
      goalType: jarForm.goalType,
      targetAmountMinor: jarForm.goalType === 'target' ? Math.round(Number(jarForm.targetAmountInput || 0) * 100) : null,
      includeInAssets: jarForm.includeInAssets,
      autoSave: jarForm.autoSaveEnabled
        ? {
          sourceAccountId: jarForm.autoSaveSourceAccountId,
          amountMinor: toMinorFromMajor(jarForm.autoSaveAmountInput),
          intervalValue: jarForm.autoSaveIntervalValue,
          intervalUnit: jarForm.autoSaveIntervalUnit,
          chargeDay: jarForm.autoSaveChargeDay,
          startDate: jarForm.autoSaveStartDate,
          paused: jarForm.autoSavePaused,
        }
        : null,
    }

    if (editingJarId.value) {
      await updateSavingsJar(ledgerId, editingJarId.value, payload)
      uiStore.pushToast(t('savings_jar.toast.updated'))
    } else {
      await createSavingsJar(ledgerId, payload)
      uiStore.pushToast(t('savings_jar.toast.created'))
    }

    await accountStore.load()
    closeJarDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('savings_jar.toast.failed'), 'error')
  } finally {
    jarSaving.value = false
  }
}

async function removeAutoSaveSchedule() {
  const ledgerId = ledgerStore.activeLedgerId
  const accountId = String(editingJarId.value ?? '').trim()
  if (!ledgerId || !accountId || jarSaving.value || jarDeleting.value || autoSaveDeleting.value) return

  const jar = savingJarRows.value.find((item) => String(item.id) === accountId)
  if (!jar?.autoSaveEnabled) return

  const ok = window.confirm(t('savings_jar.auto_save.confirm_delete', { name: jar?.name || accountId }))
  if (!ok) return

  autoSaveDeleting.value = true
  try {
    await deleteSavingsJarAutoSave(ledgerId, accountId)
    await accountStore.load()
    openEditDialog(savingJarRows.value.find((item) => String(item.id) === accountId) ?? jar)
    uiStore.pushToast(t('savings_jar.toast.auto_save_deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('savings_jar.toast.failed'), 'error')
  } finally {
    autoSaveDeleting.value = false
  }
}

async function removeSavingsJar() {
  const ledgerId = ledgerStore.activeLedgerId
  const accountId = String(editingJarId.value ?? '').trim()
  if (!ledgerId || !accountId || jarSaving.value || jarDeleting.value) return

  const jar = savingJarRows.value.find((item) => String(item.id) === accountId)
  const ok = window.confirm(t('savings_jar.confirm_delete', { name: jar?.name || accountId }))
  if (!ok) return

  jarDeleting.value = true
  try {
    await deleteSavingsJar(ledgerId, accountId)
    await accountStore.load()
    closeJarDialog(true)
    uiStore.pushToast(t('savings_jar.toast.deleted'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('savings_jar.toast.failed'), 'error')
  } finally {
    jarDeleting.value = false
  }
}

function openFlowDialog(mode, jar) {
  if (!jar?.canTransfer) {
    uiStore.pushToast(t('savings_jar.same_currency_required'), 'error')
    return
  }
  flowMode.value = mode === 'withdraw' ? 'withdraw' : 'deposit'
  flowJarId.value = String(jar.id ?? '')
  flowForm.accountId = String(
    accountStore.regularAccounts.find((item) => normalizeCurrencyCode(item.currency_code, jar.currencyCode) === jar.currencyCode)?.id ?? '',
  )
  flowForm.amountInput = ''
  flowDialogOpen.value = true
}

function closeFlowDialog() {
  flowDialogOpen.value = false
  flowJarId.value = ''
  flowForm.accountId = ''
  flowForm.amountInput = ''
}

async function submitFlowDialog() {
  const jar = activeFlowJar.value
  if (!jar || !canSubmitFlow.value || flowSaving.value) return

  flowSaving.value = true
  try {
    const isWithdraw = flowMode.value === 'withdraw'
    await transactionStore.addTransfer({
      amountMinor: flowAmountMinor.value,
      occurredAt: new Date().toISOString(),
      fromAccountId: isWithdraw ? jar.id : flowForm.accountId,
      toAccountId: isWithdraw ? flowForm.accountId : jar.id,
      note: `${t('savings_jar.title')}：${jar.name} ${t(isWithdraw ? 'savings_jar.action.withdraw' : 'savings_jar.action.deposit')}`,
    })

    uiStore.pushToast(t(isWithdraw ? 'savings_jar.toast.withdrawn' : 'savings_jar.toast.deposited'))
    closeFlowDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('savings_jar.toast.failed'), 'error')
  } finally {
    flowSaving.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3,
h4,
p {
  margin: 0;
}

.page-header,
.panel-head {
  align-items: flex-start;
  gap: 10px;
}

.limit-note {
  margin-top: 4px;
}

.jar-list {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.jar-card {
  border: 1px solid var(--field-border);
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
}

.jar-head {
  gap: 10px;
}

.jar-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.jar-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
  color: var(--primary);
  flex: 0 0 auto;
}

.jar-icon {
  width: 18px;
}

.jar-title {
  font-size: 16px;
}

.jar-meta {
  margin-top: 4px;
}

.asset-chip {
  border: 1px solid color-mix(in srgb, var(--ok) 40%, var(--field-border) 60%);
  color: var(--ok);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  white-space: nowrap;
}

.asset-chip.excluded {
  border-color: color-mix(in srgb, var(--warning) 40%, var(--field-border) 60%);
  color: var(--warning);
}

.jar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.progress-head,
.jar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 72%, var(--card) 28%);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 72%, var(--ok) 28%), var(--ok));
}

.unlimited-note,
.transfer-hint,
.empty-note,
.flow-jar-name,
.auto-save-copy {
  margin: 0;
}

.auto-save-section {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--field-border) 78%, transparent);
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}

.auto-save-head {
  align-items: center;
}

.goal-type-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.interval-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 16px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.switch-copy {
  display: grid;
  gap: 4px;
  text-align: left;
}

.switch-track {
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 72%, var(--card) 28%);
  padding: 4px;
  transition: background-color var(--anim-fast) var(--anim-standard);
  flex: 0 0 auto;
}

.switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transform: translate3d(0, 0, 0);
  transition: transform var(--anim-mid) var(--anim-spring);
  will-change: transform;
}

.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--field-border) 54%);
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
}

.switch-row.active .switch-track {
  background: var(--primary);
}

.switch-row.active .switch-thumb {
  transform: translate3d(20px, 0, 0);
}

.delete-field {
  padding-top: 4px;
}

@media (max-width: 640px) {
  .jar-grid,
  .goal-type-row,
  .interval-grid {
    grid-template-columns: 1fr;
  }

  .jar-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
