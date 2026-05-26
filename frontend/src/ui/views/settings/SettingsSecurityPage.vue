<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-shield-halved" class="title-icon" />{{ t('settings_security.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <div class="row switch-row">
        <div class="switch-text">
          <strong>{{ t('settings_security.toggle_label') }}</strong>
          <small class="muted">{{ t('settings_security.description') }}</small>
        </div>
        <button
          type="button"
          class="btn"
          :class="{ primary: securityLockEnabled }"
          :disabled="busy"
          @click="toggleSecurityLock"
        >
          {{ securityLockEnabled ? t('common.on') : t('common.off') }}
        </button>
      </div>

      <div class="detail-list">
        <div class="detail-item">
          <small class="muted">{{ t('settings_security.status') }}</small>
          <strong>{{ supportLabel }}</strong>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  authenticateSecurityLock,
  getSecurityLockAvailability,
  setSecurityLockEnabled,
  useSecurityLockEnabled,
} from '@/ui/services/security-lock.service'

const { t } = useI18n()
const uiStore = useUiStore()
const securityLockEnabled = useSecurityLockEnabled()
const busy = ref(false)

const supportState = reactive({
  checked: false,
  available: false,
  message: '',
})

const supportLabel = computed(() => {
  if (!supportState.checked) return t('settings_security.status_checking')
  if (supportState.available) return t('settings_security.status_ready')
  return supportState.message || t('settings_security.status_unavailable')
})

async function loadSupportState() {
  const availability = await getSecurityLockAvailability(t('settings_security.only_android'))
  supportState.checked = true
  supportState.available = availability.available
  supportState.message = availability.message
}

async function toggleSecurityLock() {
  if (busy.value) return
  busy.value = true

  try {
    if (securityLockEnabled.value) {
      setSecurityLockEnabled(false)
      uiStore.pushToast(t('settings_security.toast.disabled'))
      return
    }

    const availability = await getSecurityLockAvailability(t('settings_security.only_android'))
    supportState.checked = true
    supportState.available = availability.available
    supportState.message = availability.message

    if (!availability.available) {
      uiStore.pushToast(availability.message || t('settings_security.toast.not_supported'), 'error')
      return
    }

    const unlocked = await authenticateSecurityLock({
      title: t('settings_security.title'),
      reason: t('settings_security.enable_prompt'),
      unsupportedMessage: t('settings_security.toast.not_supported'),
      failureMessage: t('settings_security.toast.unlock_failed'),
    })

    if (!unlocked) return

    setSecurityLockEnabled(true)
    uiStore.pushToast(t('settings_security.toast.enabled'))
  } catch (error) {
    if (String(error?.code ?? '') === 'auth_canceled') {
      uiStore.pushToast(t('settings_security.toast.unlock_canceled'), 'error')
      return
    }
    uiStore.pushToast(error?.message || t('settings_security.toast.unlock_failed'), 'error')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void loadSupportState()
})
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

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.page-header {
  align-items: center;
}

.switch-row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.switch-text {
  display: grid;
  gap: 4px;
}

.detail-list {
  display: grid;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
