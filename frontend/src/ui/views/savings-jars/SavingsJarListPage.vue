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

          <div class="row jar-actions">
            <button class="btn" @click="openEditDialog(jar)">{{ t('savings_jar.action.edit') }}</button>
            <button class="btn" :disabled="!jar.canTransfer" @click="openFlowDialog('deposit', jar)">{{ t('savings_jar.action.deposit') }}</button>
            <button class="btn" :disabled="!jar.canTransfer" @click="openFlowDialog('withdraw', jar)">{{ t('savings_jar.action.withdraw') }}</button>
          </div>
          <p v-if="!jar.canTransfer" class="muted transfer-hint">{{ t('savings_jar.same_currency_required') }}</p>

          <section class="activity-section">
            <div class="row activity-head">
              <strong>{{ t('savings_jar.activity.title') }}</strong>
            </div>
            <div v-if="jar.activityRows.length" class="activity-list">
              <button
                v-for="activity in jar.activityRows"
                :key="activity.id"
                type="button"
                class="activity-item"
                @click="openTransactionEdit(activity.id)"
              >
                <div class="activity-copy">
                  <div class="row activity-title-row">
                    <strong>{{ activity.directionLabel }}</strong>
                    <MoneyText :value-minor="activity.amountMinor" :currency="activity.currencyCode" tone="transfer" />
                  </div>
                  <p class="muted activity-meta">{{ activity.counterpartyLabel }}</p>
                  <p v-if="activity.note" class="muted activity-note">{{ activity.note }}</p>
                  <small class="muted">{{ formatActivityTime(activity.occurredAt) }}</small>
                </div>
                <span class="muted activity-action">{{ t('common.edit') }}</span>
              </button>
            </div>
            <p v-else class="muted activity-empty">{{ t('savings_jar.activity.empty') }}</p>
          </section>
        </article>
      </div>

      <p v-else class="muted empty-note">{{ t('savings_jar.empty') }}</p>
    </article>

    <AppDialog
      :open="jarDialogOpen"
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

      <div v-if="editingJarId" class="field delete-field">
        <button type="button" class="btn danger" :disabled="jarSaving || jarDeleting" @click="removeSavingsJar">
          {{ jarDeleting ? t('savings_jar.action.deleting') : t('common.delete') }}
        </button>
      </div>
    </AppDialog>

    <AppDialog
      :open="flowDialogOpen"
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
        <CustomSelect v-model="flowForm.accountId" :options="flowAccountOptions" />
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
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { currencyOptions, normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { listTransactionsByAccount } from '@/core/repositories/transaction.repo'
import { createSavingsJar, deleteSavingsJar, updateSavingsJar } from '@/core/services/savings-jar.service'
import { isFreeTier } from '@/core/services/membership.service'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

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
const flowDialogOpen = ref(false)
const flowSaving = ref(false)
const flowMode = ref('deposit')
const flowJarId = ref('')
const jarActivityRowsById = ref({})
const jarForm = reactive({
  name: '',
  groupId: '',
  currencyCode: 'TWD',
  goalType: 'open',
  targetAmountInput: '',
  includeInAssets: false,
})
const flowForm = reactive({
  accountId: '',
  amountInput: '',
})

watch(
  () => ledgerStore.activeLedgerId,
  async (ledgerId) => {
    if (!ledgerId) {
      jarActivityRowsById.value = {}
      return
    }
    await accountStore.load()
    await loadSavingsJarActivity()
  },
  { immediate: true },
)

const groupOptions = computed(() => {
  return accountStore.groups.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})

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
      activityRows: jarActivityRowsById.value[String(account.id ?? '')] ?? [],
    }
  })
})

const activeFlowJar = computed(() => savingJarRows.value.find((item) => item.id === flowJarId.value) ?? null)
const flowAccountOptions = computed(() => {
  const jar = activeFlowJar.value
  if (!jar) return []
  return accountStore.regularAccounts
    .filter((item) => normalizeCurrencyCode(item.currency_code, jar.currencyCode) === jar.currencyCode)
    .map((item) => ({
      value: item.id,
      label: item.name,
      icon: item.icon || 'fa-solid fa-wallet',
    }))
})
const isFreePlan = computed(() => isFreeTier())

const jarTargetInvalid = computed(() => {
  if (jarForm.goalType !== 'target') return false
  return !Number.isFinite(Number(jarForm.targetAmountInput)) || Number(jarForm.targetAmountInput) <= 0
})

const canSaveJarForm = computed(() => {
  return Boolean(jarForm.name.trim() && jarForm.groupId && jarForm.currencyCode && !jarTargetInvalid.value)
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

function formatActivityTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openTransactionEdit(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-edit', params: { id: txId } }).catch(() => {})
}

function buildActivityCounterpartyLabel(tx) {
  const accountId = String(tx?.peer_account_id ?? '').trim()
  const accountName = accountStore.accounts.find((item) => String(item.id ?? '') === accountId)?.name
    || t('savings_jar.activity.unknown_account')
  const labelKey = Number(tx?.amount_minor ?? 0) >= 0
    ? 'savings_jar.activity.from_account'
    : 'savings_jar.activity.to_account'
  return t(labelKey, { account: accountName })
}

async function loadSavingsJarActivity() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  const savingsJarAccounts = accountStore.savingsJarAccounts
  if (!ledgerId || !savingsJarAccounts.length) {
    jarActivityRowsById.value = {}
    return
  }

  const rowsById = {}
  const accountCurrencyFallback = normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD')

  await Promise.all(savingsJarAccounts.map(async (account) => {
    const jarId = String(account.id ?? '').trim()
    if (!jarId) return

    const activityRows = await listTransactionsByAccount(ledgerId, jarId)
    rowsById[jarId] = activityRows
      .filter((item) => String(item.account_id ?? '').trim() === jarId)
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id ?? ''),
        amountMinor: Number(item.amount_minor ?? 0),
        currencyCode: normalizeCurrencyCode(item.account_currency_code, account.currency_code || accountCurrencyFallback),
        occurredAt: String(item.occurred_at ?? ''),
        note: String(item.note ?? '').trim(),
        directionLabel: Number(item.amount_minor ?? 0) >= 0
          ? t('savings_jar.activity.deposit')
          : t('savings_jar.activity.withdraw'),
        counterpartyLabel: buildActivityCounterpartyLabel(item),
      }))
  }))

  jarActivityRowsById.value = rowsById
}

function resetJarForm() {
  jarForm.name = ''
  jarForm.groupId = String(accountStore.groups[0]?.id ?? '')
  jarForm.currencyCode = normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD')
  jarForm.goalType = 'open'
  jarForm.targetAmountInput = ''
  jarForm.includeInAssets = false
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
  jarDialogOpen.value = true
}

function closeJarDialog(force = false) {
  if (!force && (jarSaving.value || jarDeleting.value)) return
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
    }

    if (editingJarId.value) {
      await updateSavingsJar(ledgerId, editingJarId.value, payload)
      uiStore.pushToast(t('savings_jar.toast.updated'))
    } else {
      await createSavingsJar(ledgerId, payload)
      uiStore.pushToast(t('savings_jar.toast.created'))
    }

    await accountStore.load()
    await loadSavingsJarActivity()
    closeJarDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('savings_jar.toast.failed'), 'error')
  } finally {
    jarSaving.value = false
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
    await loadSavingsJarActivity()
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
    await loadSavingsJarActivity()
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
.activity-empty,
.activity-meta,
.activity-note {
  margin: 0;
}

.activity-section {
  display: grid;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--field-border) 72%, transparent);
}

.activity-head {
  align-items: center;
}

.activity-list {
  display: grid;
  gap: 8px;
}

.activity-item {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--card) 94%, var(--surface-soft-accent) 6%);
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}

.activity-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.activity-title-row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.activity-meta,
.activity-note,
.activity-copy small {
  overflow-wrap: anywhere;
}

.activity-action {
  flex: 0 0 auto;
  white-space: nowrap;
}

.goal-type-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
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
  .goal-type-row {
    grid-template-columns: 1fr;
  }

  .jar-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .activity-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .activity-action {
    align-self: flex-end;
  }
}
</style>
