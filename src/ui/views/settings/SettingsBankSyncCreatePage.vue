<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_bank_sync_create.title') }}</h2>
      <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!bankSyncApiReady" class="card panel warning-panel">
      <h3>{{ t('settings_bank_sync_create.api_unavailable_title') }}</h3>
      <p class="muted">{{ bankSyncApiMessage }}</p>
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('settings_bank_sync_create.form_title') }}</h3>
        <button class="btn primary" :disabled="!canSubmit || submitting || !bankSyncApiReady" @click="submit">
          {{ submitting ? t('settings_bank_sync_create.creating') : t('settings_bank_sync_create.create') }}
        </button>
      </header>

      <label class="field">
        {{ t('settings_bank_sync_create.bank_provider') }}
        <CustomSelect v-model="form.providerId" :options="providerOptions" />
      </label>

      <p v-if="isMockProviderSelected" class="muted mock-hint">
        {{ t('settings_bank_sync_create.mock_hint') }}
      </p>

      <div class="field">
        <span>{{ t('settings_bank_sync_create.account_mode') }}</span>
        <div class="mode-row">
          <button
            type="button"
            class="btn"
            :class="{ primary: form.accountMode === 'existing' }"
            @click="form.accountMode = 'existing'"
          >
            {{ t('settings_bank_sync_create.account_mode_existing') }}
          </button>
          <button
            type="button"
            class="btn"
            :class="{ primary: form.accountMode === 'create' }"
            @click="form.accountMode = 'create'"
          >
            {{ t('settings_bank_sync_create.account_mode_create') }}
          </button>
        </div>
      </div>

      <label v-if="form.accountMode === 'existing'" class="field">
        {{ t('settings_bank_sync_create.existing_account') }}
        <CustomSelect
          v-model="form.existingAccountId"
          :options="assetAccountOptions"
          :disabled="!assetAccountOptions.length"
          :placeholder="t('settings_bank_sync_create.existing_account_placeholder')"
        />
        <small v-if="!assetAccountOptions.length" class="muted">{{ t('settings_bank_sync_create.no_asset_accounts') }}</small>
      </label>

      <label v-else class="field">
        {{ t('settings_bank_sync_create.new_account_name') }}
        <input v-model.trim="form.newAccountName" class="input" type="text" maxlength="40" :placeholder="t('settings_bank_sync_create.new_account_name_placeholder')" />
        <small class="muted">{{ t('settings_bank_sync_create.new_account_hint') }}</small>
      </label>

      <template v-if="isFirstBankSelected">
        <label class="field">
          {{ t('settings_bank_sync_create.account_number') }}
          <input v-model.trim="form.accountNumber" class="input" type="text" inputmode="numeric" maxlength="16" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.initial_sync_start_date') }}
          <input v-model="form.initialSyncStartDate" class="input" type="date" />
          <small class="muted">{{ t('settings_bank_sync_create.initial_sync_start_date_hint') }}</small>
        </label>
      </template>

      <template v-if="!isMockProviderSelected">
        <label class="field">
          {{ t('settings_bank_sync_create.national_id') }}
          <input id="loginCustIdFake" v-model.trim="form.nationalId" class="input" type="text" maxlength="12" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.user_code') }}
          <input id="usrIdInput" v-model.trim="form.code" class="input" type="text" maxlength="20" />
        </label>

        <label class="field">
          {{ t('settings_bank_sync_create.password') }}
          <input id="pwd" v-model="form.password" class="input" type="password" maxlength="40" />
        </label>

        <div class="field">
          <div class="row captcha-head">
            <span>{{ t('settings_bank_sync_create.captcha_image') }}</span>
            <button type="button" class="btn" :disabled="refreshingCaptcha || preparingSession" @click="refreshCaptchaImage">
              {{ refreshingCaptcha ? t('settings_bank_sync_create.refreshing_captcha') : t('settings_bank_sync_create.refresh_captcha') }}
            </button>
          </div>
          <div id="code_verify" class="captcha-preview">
            <img v-if="captchaImageSrc" :src="captchaImageSrc" :alt="t('settings_bank_sync_create.captcha_image')" class="captcha-image" />
            <span v-else>{{ captchaStatusText }}</span>
          </div>
        </div>

        <label class="field">
          {{ t('settings_bank_sync_create.captcha_code') }}
          <input id="vrfyCode" v-model.trim="form.captchaCode" class="input" type="text" maxlength="12" />
        </label>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import {
  connectBankProvider,
  getBankProviderOptions,
  prepareBankProviderLink,
  saveBankAccountSettings,
} from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage, isBankSyncApiConfigured } from '@/services/bank-sync/backend'
import { setEncryptedSetting } from '@/ui/services/secure-setting.service'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const router = useRouter()
const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()
const bankSyncApiReady = isBankSyncApiConfigured()
const bankSyncApiMessage = computed(() => getBankSyncApiUnavailableMessage())

const submitting = ref(false)
const preparingSession = ref(false)
const refreshingCaptcha = ref(false)
const preparedSessionId = ref('')
const preparedSessionCode = ref('')
const captchaImageSrc = ref('')
const captchaStatusText = ref(t('settings_bank_sync_create.captcha.loading'))

function defaultInitialSyncStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const form = reactive({
  providerId: '',
  accountMode: 'existing',
  existingAccountId: '',
  newAccountName: '',
  accountNumber: '',
  initialSyncStartDate: defaultInitialSyncStartDate(),
  nationalId: '',
  code: '',
  password: '',
  captchaCode: '',
})

const backLink = { name: 'settings-bank-sync' }
const providerOptions = computed(() => {
  return getBankProviderOptions().map((item) => ({
    value: item.id,
    label: item.country ? `${item.name} (${item.country})` : item.name,
  }))
})
const assetAccounts = computed(() => {
  return accountStore.regularAccounts.filter((item) => String(item?.account_type ?? '').trim().toLowerCase() === 'asset')
})
const assetAccountOptions = computed(() => {
  return assetAccounts.value.map((item) => ({
    value: item.id,
    label: item.name,
  }))
})
const defaultAssetGroupId = computed(() => {
  return String(accountStore.groups[0]?.id ?? '')
})
const isMockProviderSelected = computed(() => {
  const providerId = String(form.providerId ?? '').trim().toLowerCase()
  return providerId === 'mock' || providerId === 'mock_bank_tw'
})
const isFirstBankSelected = computed(() => {
  return String(form.providerId ?? '').trim().toLowerCase() === 'first_bank_tw'
})
const canSubmit = computed(() => {
  if (!ledgerStore.activeLedgerId || !String(form.providerId ?? '').trim()) return false
  if (isFirstBankSelected.value) {
    if (!String(form.accountNumber ?? '').trim()) return false
    if (!String(form.initialSyncStartDate ?? '').trim()) return false
  }
  if (!isMockProviderSelected.value) {
    if (!String(form.nationalId ?? '').trim()) return false
    if (!String(form.code ?? '').trim()) return false
    if (!String(form.password ?? '').trim()) return false
    if (!String(form.captchaCode ?? '').trim()) return false
  }
  if (form.accountMode === 'existing') {
    return Boolean(String(form.existingAccountId ?? '').trim())
  }
  return Boolean(String(form.newAccountName ?? '').trim())
})

onMounted(async () => {
  await accountStore.load().catch(() => null)
  if (!form.providerId) {
    form.providerId = providerOptions.value[0]?.value ?? ''
  }
  if (!form.existingAccountId) {
    form.existingAccountId = assetAccountOptions.value[0]?.value ?? ''
  }
  if (!bankSyncApiReady) {
    captchaStatusText.value = bankSyncApiMessage.value
    return
  }
  await prepareLinkSession()
})

watch(
  () => form.providerId,
  () => {
    if (!bankSyncApiReady) return
    preparedSessionId.value = ''
    preparedSessionCode.value = ''
    captchaImageSrc.value = ''
    captchaStatusText.value = t('settings_bank_sync_create.captcha.loading')
    void prepareLinkSession()
  },
)

function resolveCreateErrorMessage(error, fallbackKey) {
  if (error?.code === 'bank_sync_api_unavailable') return bankSyncApiMessage.value
  const rawMessage = String(error?.message ?? '').trim()
  if (rawMessage === 'First Bank national ID is required') return t('settings_bank_sync_create.error.first_bank_national_id_required')
  if (rawMessage === 'First Bank account number is required') return t('settings_bank_sync_create.error.first_bank_account_number_required')
  if (rawMessage === 'First Bank credentials and CAPTCHA are required') return t('settings_bank_sync_create.error.first_bank_credentials_required')
  if (rawMessage === 'First Bank login failed. Please verify your credentials, account number, and CAPTCHA') {
    return t('settings_bank_sync_create.error.first_bank_login_failed')
  }
  if (rawMessage === 'First Bank session expired, please reconnect and complete CAPTCHA login again') {
    return t('settings_bank_sync_create.error.first_bank_session_expired')
  }
  if (rawMessage === 'First Bank sync requires a valid session token. Please reconnect and complete CAPTCHA login again') {
    return t('settings_bank_sync_create.error.first_bank_session_expired')
  }
  return rawMessage || t(fallbackKey)
}

async function ensureTargetAccountId() {
  if (form.accountMode === 'existing') {
    return String(form.existingAccountId ?? '').trim()
  }

  const name = String(form.newAccountName ?? '').trim()
  if (!name) throw new Error(t('settings_bank_sync_create.error.new_account_name_required'))

  const existingIds = new Set(accountStore.accounts.map((item) => String(item?.id ?? '').trim()).filter(Boolean))
  let groupId = defaultAssetGroupId.value
  if (!groupId) {
    await accountStore.addGroup({
      name: t('settings_bank_sync_create.asset_group_name'),
      type: 'other',
      sortOrder: accountStore.groups.length,
    })
    groupId = String(accountStore.groups[0]?.id ?? '')
  }
  if (!groupId) throw new Error(t('settings_bank_sync_create.error.asset_group_missing'))

  await accountStore.addAccount({
    groupId,
    name,
    accountType: 'asset',
    allowNegative: true,
    openingBalanceMinor: 0,
    includeInAssets: true,
    currencyCode: String(ledgerStore.activeLedger?.currency_code ?? 'TWD'),
  })

  const created = accountStore.regularAccounts.find((item) => {
    const accountId = String(item?.id ?? '').trim()
    const isAsset = String(item?.account_type ?? '').trim().toLowerCase() === 'asset'
    return accountId && !existingIds.has(accountId) && isAsset
  })
  const createdId = String(created?.id ?? '').trim()
  if (!createdId) {
    throw new Error(t('settings_bank_sync_create.error.account_create_failed'))
  }
  return createdId
}

async function prepareLinkSession({ refreshCaptcha = false } = {}) {
  if (!bankSyncApiReady) {
    captchaImageSrc.value = ''
    captchaStatusText.value = bankSyncApiMessage.value
    return
  }
  if (!ledgerStore.activeLedgerId || !String(form.providerId ?? '').trim()) {
    captchaImageSrc.value = ''
    captchaStatusText.value = t('settings_bank_sync_create.captcha.choose_bank')
    return
  }

  if (refreshCaptcha) {
    refreshingCaptcha.value = true
  } else {
    preparingSession.value = true
  }

  try {
    const linkSession = await prepareBankProviderLink(ledgerStore.activeLedgerId, form.providerId, {
      sessionId: refreshCaptcha ? preparedSessionId.value : '',
      refreshCaptcha,
    })
    preparedSessionId.value = String(linkSession?.session_id ?? '').trim()
    preparedSessionCode.value = String(linkSession?.mock_code ?? '').trim()
    if (isMockProviderSelected.value) {
      captchaImageSrc.value = ''
      captchaStatusText.value = t('settings_bank_sync_create.mock_ready')
      return
    }
    captchaImageSrc.value = String(linkSession?.captcha_image_data_url ?? linkSession?.captcha_image_src ?? '').trim()
    captchaStatusText.value = captchaImageSrc.value
      ? t('settings_bank_sync_create.captcha.loaded')
      : t('settings_bank_sync_create.captcha.empty')
  } catch (error) {
    captchaImageSrc.value = ''
    captchaStatusText.value = resolveCreateErrorMessage(error, 'settings_bank_sync_create.captcha.load_failed')
  } finally {
    preparingSession.value = false
    refreshingCaptcha.value = false
  }
}

async function refreshCaptchaImage() {
  await prepareLinkSession({ refreshCaptcha: true })
}

async function submit() {
  if (!bankSyncApiReady) {
    uiStore.pushToast(bankSyncApiMessage.value, 'error')
    return
  }
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const connection = await connectBankProvider(ledgerStore.activeLedgerId, form.providerId, {
      sessionId: preparedSessionId.value,
      sessionCode: preparedSessionCode.value,
      accountNumber: form.accountNumber,
      initialSyncStartDate: form.initialSyncStartDate,
      nationalId: form.nationalId,
      code: form.code,
      password: form.password,
      captchaCode: form.captchaCode,
    })

    const targetAccountId = await ensureTargetAccountId()
    const firstBankAccountId = String(connection?.accounts?.[0]?.id ?? '').trim()
    if (firstBankAccountId && targetAccountId) {
      await saveBankAccountSettings(ledgerStore.activeLedgerId, firstBankAccountId, {
        enabled: true,
        mappedAccountId: targetAccountId,
      })
    }

    if (!isMockProviderSelected.value) {
      await setEncryptedSetting(ledgerStore.activeLedgerId, `bank_sync.credentials.${connection.id}`, {
        provider: String(form.providerId ?? '').trim(),
        sessionToken: String(connection?.providerAccess?.sessionToken || connection?.providerAccess?.accessTokenRef || '').trim(),
        accessTokenRef: String(connection?.providerAccess?.accessTokenRef || connection?.providerAccess?.sessionToken || '').trim(),
        updatedAt: new Date().toISOString(),
      })
    }

    uiStore.pushToast(t('settings_bank_sync_create.toast.created'))
    await router.push(backLink)
  } catch (error) {
    uiStore.pushToast(resolveCreateErrorMessage(error, 'settings_bank_sync_create.toast.create_failed'), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.warning-panel {
  gap: 8px;
}

.page-head,
.panel-head {
  align-items: center;
  justify-content: space-between;
}

h2,
h3 {
  margin: 0;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mock-hint {
  margin: -2px 0 0;
}

.captcha-head {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.captcha-preview {
  min-height: 84px;
  border: 1px dashed var(--field-border);
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  text-align: center;
  padding: 12px;
}

.captcha-image {
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
}
</style>
