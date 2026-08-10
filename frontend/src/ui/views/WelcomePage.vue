<template>
  <section class="stack welcome-root">
    <article class="card welcome-card">
      <header class="stack title-wrap">
        <p class="step-text">{{ t('welcome.step') }} {{ step }} / 3</p>
        <div class="step-dots" role="progressbar" :aria-valuenow="step" aria-valuemin="1" aria-valuemax="3">
          <span
            v-for="n in 3"
            :key="n"
            class="step-dot"
            :class="{ active: n === step, done: n < step }"
          />
        </div>
      </header>

      <transition name="wizard-slide" mode="out-in">
        <section v-if="step === 1" :key="'step-1'" class="step-panel">
          <img class="hero-logo" :src="BRAND_LOGO_URL" alt="StrawMoneyBook logo" />
          <h2>{{ t('welcome.title') }}</h2>
          <p class="muted intro-copy">
            {{ t('welcome.subtitle') }}
          </p>

          <div class="stack language-block">
            <h3>{{ t('welcome.choose_language') }}</h3>
            <div class="language-grid">
              <button
                v-for="option in localeOptions"
                :key="option.value"
                type="button"
                class="language-btn"
                :class="{ active: option.value === locale }"
                @click="pickLanguage(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="step === 2" :key="'step-2'" class="step-panel ledger-step">
          <h2>{{ t('welcome.create_ledger') }}</h2>
          <p class="muted intro-copy">
            {{
              hasLedgers
                ? t('welcome.ledger_ready')
                : t('welcome.ledger_required')
            }}
          </p>

          <aside
            v-if="!hasLedgers && emptyRestoreHint.shouldPrompt"
            class="empty-restore-banner"
            data-testid="welcome-empty-restore-hint"
          >
            <p class="empty-restore-title">
              {{ t('welcome.empty_restore.title', '偵測到本機還原備份') }}
            </p>
            <p class="muted empty-restore-copy">
              {{
                t(
                  'welcome.empty_restore.body',
                  { count: emptyRestoreHint.recoveryCount },
                  '目前帳本為空，但本機有 {count} 份 IndexedDB recovery 備份。請先還原，勿急著建立新帳本覆蓋可還原資料。',
                )
              }}
            </p>
            <RouterLink
              class="btn primary"
              to="/settings/data-management"
              data-testid="welcome-local-recovery-cta"
            >
              {{ t('welcome.local_recovery_action', '本機 recovery 還原') }}
            </RouterLink>
          </aside>

          <label class="field">
            {{ t('welcome.ledger_name') }}
            <input
              v-model.trim="ledgerNameInput"
              class="input"
              type="text"
              maxlength="40"
              :placeholder="t('welcome.ledger_name_placeholder')"
              autocomplete="off"
              :disabled="creatingLedger"
            />
          </label>

          <button
            v-if="!hasLedgers"
            class="btn primary create-btn"
            :disabled="creatingLedger || !ledgerNameInput"
            @click="createFirstLedger"
          >
            {{ creatingLedger ? t('welcome.creating') : t('welcome.create_ledger') }}
          </button>
          <RouterLink v-if="!hasLedgers" class="btn secondary-link" to="/settings/shared-ledgers">
            {{ t('welcome.join_shared_ledger', '已有共同帳本？登入並加入') }}
          </RouterLink>
          <RouterLink v-if="!hasLedgers" class="btn secondary-link" to="/settings/auto-backup">
            <font-awesome-icon icon="fa-solid fa-database" class="secondary-link-icon" />
            {{ t('welcome.restore_backup_action', '恢復備份') }}
          </RouterLink>
          <RouterLink v-if="!hasLedgers" class="btn secondary-link" to="/settings/google-drive-ledger-sync">
            <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="secondary-link-icon" />
            {{ t('welcome.ledger_sync_action', '帳本同步') }}
          </RouterLink>
          <RouterLink
            v-if="!hasLedgers"
            class="btn secondary-link"
            to="/settings/data-management"
            data-testid="welcome-local-recovery-link"
          >
            <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="secondary-link-icon" />
            {{ t('welcome.local_recovery_action', '本機 recovery 還原') }}
          </RouterLink>
        </section>

        <section v-else :key="'step-3'" class="step-panel">
          <h2>{{ t('welcome.create_account') }}</h2>
          <p class="muted intro-copy">
            {{
              hasAccounts
                ? t('welcome.account_ready')
                : t('welcome.account_required')
            }}
          </p>

          <label class="field">
            {{ t('welcome.group_name') }}
            <input
              v-model.trim="accountGroupNameInput"
              class="input"
              type="text"
              maxlength="40"
              :placeholder="t('welcome.group_name_placeholder')"
              autocomplete="off"
              :disabled="creatingAccount"
            />
          </label>

          <label class="field">
            {{ t('welcome.account_name') }}
            <input
              v-model.trim="accountNameInput"
              class="input"
              type="text"
              maxlength="40"
              :placeholder="t('welcome.account_name_placeholder')"
              autocomplete="off"
              :disabled="creatingAccount"
            />
          </label>

          <label class="field">
            {{ t('welcome.account_currency') }}
            <CustomSelect v-model="accountCurrencyCodeInput" :options="currencyOptions" :disabled="creatingAccount" />
          </label>

          <button
            v-if="!hasAccounts"
            class="btn primary create-btn"
            :disabled="creatingAccount || !canCreateAccount"
            @click="createFirstAccount"
          >
            {{ creatingAccount ? t('welcome.creating') : t('welcome.create_account') }}
          </button>
        </section>
      </transition>

      <footer class="wizard-actions">
        <button class="btn" :disabled="step === 1" @click="goPrevStep">
          {{ t('welcome.back') }}
        </button>
        <button class="btn primary" :disabled="!canGoNext" @click="goNextStep">
          {{ step === 3 ? t('welcome.start') : t('welcome.next') }}
        </button>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { BRAND_LOGO_URL } from '@/ui/constants/brand-assets'
import {
  detectEmptyLedgerRestoreHint,
  EMPTY_LEDGER_RESTORE_HINT_EVENT,
} from '@/core/services/empty-ledger-restore-hint.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { currencyOptions, normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { markPostSetupIntroPending } from '@/ui/services/post-setup-intro.service'

const router = useRouter()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t, locale, localeOptions, setLocale } = useI18n()

const step = ref(1)
const creatingLedger = ref(false)
const creatingAccount = ref(false)
const ledgerNameInput = ref('')
const accountGroupNameInput = ref('')
const accountNameInput = ref('')
const accountCurrencyCodeInput = ref('TWD')
const emptyRestoreHint = reactive({
  shouldPrompt: false,
  recoveryCount: 0,
})

const hasLedgers = computed(() => ledgerStore.ledgers.length > 0)
const hasAccounts = computed(() => accountStore.accounts.length > 0)
const canCreateAccount = computed(() => hasLedgers.value && accountGroupNameInput.value && accountNameInput.value)
const canGoNext = computed(() => {
  if (step.value === 1) return true
  if (step.value === 2) return hasLedgers.value
  return hasAccounts.value
})

function applyEmptyRestoreHint(detail = {}) {
  emptyRestoreHint.shouldPrompt = Boolean(detail.shouldPrompt)
  emptyRestoreHint.recoveryCount = Number(detail.recoveryCount) || 0
}

async function refreshEmptyRestoreHint() {
  const hint = await detectEmptyLedgerRestoreHint({
    hasLedgers: hasLedgers.value,
    hasAccounts: hasAccounts.value,
  })
  applyEmptyRestoreHint(hint)
}

function onEmptyRestoreHintEvent(event) {
  applyEmptyRestoreHint(event?.detail || {})
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener(EMPTY_LEDGER_RESTORE_HINT_EVENT, onEmptyRestoreHintEvent)
  }
  void refreshEmptyRestoreHint()
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(EMPTY_LEDGER_RESTORE_HINT_EVENT, onEmptyRestoreHintEvent)
  }
})

watch(
  hasLedgers,
  (value) => {
    if (value && step.value < 3) {
      step.value = 3
    }
    void refreshEmptyRestoreHint()
  },
  { immediate: true },
)

watch(
  hasAccounts,
  async (value) => {
    if (value && step.value === 3) {
      await goToPostSetupIntro()
    }
  },
  { immediate: true },
)

function pickLanguage(localeValue) {
  const currentLocale = locale.value
  const nextLocale = setLocale(localeValue)
  if (nextLocale !== currentLocale) {
    uiStore.pushToast(t('welcome.toast.language_switched'))
  }
}

function goPrevStep() {
  if (step.value <= 1) return
  step.value -= 1
}

async function goNextStep() {
  if (!canGoNext.value) return
  if (step.value >= 3) {
    await goToPostSetupIntro()
    return
  }
  if (step.value === 1 && hasLedgers.value) {
    step.value = 3
    return
  }
  step.value += 1
}

async function createFirstLedger() {
  if (creatingLedger.value || !ledgerNameInput.value) return

  creatingLedger.value = true
  try {
    await ledgerStore.addLedger({
      name: ledgerNameInput.value,
      currencyCode: 'TWD',
      timezone: 'Asia/Taipei',
    })
    uiStore.pushToast(t('welcome.toast.ledger_created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('welcome.toast.create_ledger_failed'), 'error')
  } finally {
    creatingLedger.value = false
  }
}

async function goToPostSetupIntro() {
  markPostSetupIntroPending()
  await router.replace('/welcome/intro')
}

async function createFirstAccount() {
  if (creatingAccount.value || !canCreateAccount.value) return

  creatingAccount.value = true
  try {
    let groupId = accountStore.groups[0]?.id ?? ''
    if (!groupId) {
      await accountStore.addGroup({
        name: accountGroupNameInput.value,
        type: 'other',
        sortOrder: accountStore.groups.length,
      })
      groupId = accountStore.groups[0]?.id ?? ''
    }

    if (!groupId) {
      throw new Error(t('welcome.toast.create_group_failed'))
    }

    await accountStore.addAccount({
      groupId,
      name: accountNameInput.value,
      accountType: 'asset',
      allowNegative: true,
      currencyCode: normalizeCurrencyCode(accountCurrencyCodeInput.value, 'TWD'),
      openingBalanceMinor: 0,
      icon: 'fa-solid fa-wallet',
    })
    uiStore.pushToast(t('welcome.toast.account_created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('welcome.toast.create_account_failed'), 'error')
  } finally {
    creatingAccount.value = false
  }
}
</script>

<style scoped>
.welcome-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  align-items: center;
  overflow: hidden;
}

.welcome-card {
  padding: 20px;
  display: grid;
  gap: 16px;
  width: min(760px, 100%);
  max-width: 760px;
  margin: 0 auto;
  max-height: 100%;
  overflow: visible;
}

.title-wrap {
  gap: 4px;
}

.step-text {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.step-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--border);
  transition: width 220ms ease, background-color 220ms ease;
}

.step-dot.active {
  width: 24px;
  background: var(--primary);
}

.step-dot.done {
  background: color-mix(in srgb, var(--primary) 60%, transparent);
}

.step-panel {
  display: grid;
  gap: 12px;
  will-change: transform, opacity;
}
.wizard-slide-enter-active,
.wizard-slide-leave-active {
  transition:
    opacity var(--anim-mid) var(--anim-standard),
    transform var(--anim-mid) var(--anim-spring);
  backface-visibility: hidden;
}
.wizard-slide-enter-from {
  opacity: 0;
  transform: translate3d(14px, 0, 0) scale(0.995);
}
.wizard-slide-leave-to {
  opacity: 0;
  transform: translate3d(-10px, 0, 0) scale(0.995);
}
.ledger-step {
  width: min(640px, 100%);
  justify-self: center;
}

.hero-logo {
  width: 92px;
  height: 92px;
  border-radius: 18px;
  justify-self: center;
}

h2,
h3,
p {
  margin: 0;
}

h2,
.intro-copy {
  text-align: center;
}

.language-block {
  gap: 10px;
}

.language-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.language-btn {
  border: 1px solid var(--field-border);
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text);
  min-height: 40px;
  padding: 8px 10px;
  font-weight: 700;
  cursor: pointer;
}

.language-btn.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent) inset;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.create-btn {
  width: 100%;
}

.empty-restore-banner {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border));
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-soft));
}

.empty-restore-title {
  margin: 0;
  font-weight: 700;
  color: var(--text);
}

.empty-restore-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.secondary-link {
  width: 100%;
  justify-content: center;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.secondary-link-icon {
  flex: 0 0 auto;
}

.wizard-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 640px) {
  .language-grid {
    grid-template-columns: 1fr;
  }
}
</style>
