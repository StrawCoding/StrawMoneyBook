<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('settings_version.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <div class="tab-row">
      <button class="btn" :class="{ primary: activeTab === 'version' }" @click="activeTab = 'version'">
        {{ t('settings_version.tab.version', '版本資訊') }}
      </button>
      <button class="btn" :class="{ primary: activeTab === 'progress' }" @click="openProgressTab">
        {{ t('settings_version.tab.progress', '開發進度') }}
      </button>
    </div>

    <article class="card panel">
      <template v-if="activeTab === 'version'">
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
      </template>

      <template v-else>
        <header class="progress-head">
          <div>
            <h3>{{ t('settings_version.progress.title', '目前開發進度') }}</h3>
            <p class="muted progress-desc">
              {{ t('settings_version.progress.desc', '只有在打開這個分頁時才會載入 Linear issue 標題與狀態。') }}
            </p>
          </div>
          <button class="btn" :disabled="progressLoading" :aria-busy="progressLoading" @click="loadProgress({ force: true })">
            {{ progressLoading ? t('settings_version.progress.loading', '載入中...') : t('settings_version.progress.refresh', '重新整理') }}
          </button>
        </header>

        <p v-if="progressError" class="muted progress-error">{{ progressError }}</p>
        <p v-else-if="progressLoading && !progressItems.length" class="muted">
          {{ t('settings_version.progress.loading', '載入中...') }}
        </p>
        <p v-else-if="!progressItems.length" class="muted">
          {{ t('settings_version.progress.empty', '目前沒有可顯示的開發進度。') }}
        </p>

        <ul v-else class="progress-list">
          <li v-for="(item, index) in progressItems" :key="`${item.title}-${index}`" class="progress-item">
            <strong>{{ item.title }}</strong>
            <span class="status-chip">{{ item.status }}</span>
          </li>
        </ul>
      </template>
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
import { listVersionProgressItems } from '@/ui/services/version-progress.service'

const { t } = useI18n()
const uiStore = useUiStore()
const version = computed(() => String(appPackage?.version ?? '0.0.0'))
const checkingUpdate = ref(false)
const hasUpdate = ref(false)
const updateMessage = ref('')
const activeTab = ref('version')
const progressItems = ref([])
const progressLoading = ref(false)
const progressLoaded = ref(false)
const progressError = ref('')

const latestVersionLabel = computed(() => {
  if (hasUpdate.value) return t('settings_version.update_available_no_version')
  return t('settings_version.no_update_data')
})

async function checkUpdate(options = {}) {
  const silent = Boolean(options?.silent)
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    const result = await checkForAppUpdate({ force: true })
    hasUpdate.value = Boolean(result.hasUpdate)
    if (result.checkFailed) {
      const detail = String(result.message ?? '').trim()
      updateMessage.value = detail
        ? `${t('app_update.check_failed_prompt')}\n${detail}`
        : t('app_update.check_failed_prompt')
      if (!silent) {
        uiStore.pushToast(t('settings_version.toast.check_failed'), 'error')
      }
      return
    }

    updateMessage.value = String(result.message ?? '').trim()
    if (hasUpdate.value && !silent) {
      uiStore.pushToast(t('settings_version.toast.update_available_no_version'))
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

function openProgressTab() {
  activeTab.value = 'progress'
  void loadProgress()
}

async function loadProgress(options = {}) {
  const force = Boolean(options?.force)
  if (progressLoading.value) return
  if (progressLoaded.value && !force) return

  progressLoading.value = true
  progressError.value = ''
  try {
    progressItems.value = await listVersionProgressItems()
    progressLoaded.value = true
  } catch (error) {
    progressError.value = String(error?.message ?? '').trim() || t('settings_version.progress.load_failed', '載入開發進度失敗')
  } finally {
    progressLoading.value = false
  }
}

onMounted(() => {
  void checkUpdate({ silent: true })
})
</script>

<style scoped>
.tab-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

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
  white-space: pre-line;
}

.progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.progress-head h3,
.progress-desc {
  margin: 0;
}

.progress-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.progress-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.status-chip {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
}

.progress-error {
  color: var(--danger, #b3261e);
}
</style>
