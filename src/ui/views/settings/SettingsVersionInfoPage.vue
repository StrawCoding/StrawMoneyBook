<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('settings_version.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <div class="detail-row">
        <small class="muted version-label">
          <font-awesome-icon icon="fa-solid fa-circle-info" class="version-icon" />
          <span>{{ t('settings_version.app_version') }}</span>
        </small>
        <strong>{{ version }}</strong>
      </div>
      <div class="detail-row">
        <small class="muted version-label">
          <font-awesome-icon icon="fa-solid fa-circle-info" class="version-icon" />
          <span>{{ t('settings_version.latest_version') }}</span>
        </small>
        <strong>{{ latestVersionLabel }}</strong>
      </div>
      <p v-if="updateMessage" class="muted update-message">{{ updateMessage }}</p>
      <div class="actions">
        <button class="btn" :class="{ busy: checkingUpdate }" @click="checkUpdate">
          {{ checkingUpdate ? t('settings_version.checking') : t('settings_version.check_update') }}
        </button>
        <button class="btn primary" @click="openGooglePlay">
          {{ t('settings_version.google_play') }}
        </button>
        <RouterLink class="btn" to="/settings/developer-debug">{{ t('settings_version.developer') }}</RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import appPackage from '../../../../package.json'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { checkForAppUpdate, getGooglePlayAppUrl, openGooglePlayStore } from '@/ui/services/app-update.service'

const { t } = useI18n()
const uiStore = useUiStore()
const version = computed(() => String(appPackage?.version ?? '0.0.0'))
const checkingUpdate = ref(false)
const latestVersion = ref('')
const hasUpdate = ref(false)
const updateMessage = ref('')

const latestVersionLabel = computed(() => {
  if (!latestVersion.value) return t('settings_version.no_update_data')
  if (hasUpdate.value) {
    return t('settings_version.latest_available', { version: latestVersion.value })
  }
  return latestVersion.value
})

async function checkUpdate(options = {}) {
  const silent = Boolean(options?.silent)
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    const result = await checkForAppUpdate({ force: true })
    latestVersion.value = String(result.latestVersion ?? '').trim()
    hasUpdate.value = Boolean(result.hasUpdate)
    if (result.checkFailed) {
      updateMessage.value = t('app_update.check_failed_prompt')
      if (!silent) {
        uiStore.pushToast(t('settings_version.toast.check_failed'), 'error')
      }
      return
    }

    updateMessage.value = String(result.message ?? '').trim()
    if (hasUpdate.value && !silent) {
      uiStore.pushToast(t('settings_version.toast.update_available', { version: latestVersion.value }))
    } else if (!silent) {
      uiStore.pushToast(t('settings_version.toast.up_to_date'))
    }
  } catch (error) {
    if (!silent) {
      uiStore.pushToast(error.message ?? t('settings_version.toast.check_failed'), 'error')
    }
  } finally {
    checkingUpdate.value = false
  }
}

function openGooglePlay() {
  const opened = openGooglePlayStore(getGooglePlayAppUrl())
  if (!opened) {
    uiStore.pushToast(t('settings_version.toast.open_play_failed'), 'error')
  }
}

onMounted(() => {
  void checkUpdate({ silent: true })
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 8px;
}

.page-title {
  margin: 0;
}

.page-header {
  align-items: center;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.version-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.version-icon {
  color: var(--primary-soft);
}

.actions {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.update-message {
  margin: 0;
}
</style>
