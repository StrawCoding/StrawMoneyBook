<template>
  <section class="stack">
    <article class="card panel">
      <header class="row header-row">
        <h2>{{ t('bookkeeping.page_title') }}</h2>
        <div class="header-actions">
          <div class="mode-toggle">
            <button
              type="button"
              class="btn"
              :class="{ primary: topMode === 'ai' }"
              @click="switchTopMode('ai')"
            >
              {{ t('bookkeeping.mode.ai') }}
            </button>
            <button
              type="button"
              class="btn"
              :class="{ primary: topMode === 'manual' }"
              @click="switchTopMode('manual')"
            >
              {{ t('bookkeeping.mode.manual', '手動記帳') }}
            </button>
          </div>
          <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
        </div>
      </header>

      <div v-if="topMode === 'manual'" class="manual-switch-row">
        <span class="muted manual-switch-label">{{ t('bookkeeping.manual.label', '手動模式') }}</span>
        <div class="manual-switch-actions">
          <button
            type="button"
            class="btn"
            :class="{ primary: manualMode === 'quick' }"
            @click="switchManualMode('quick')"
          >
            {{ t('bookkeeping.manual.quick_add', '快速新增') }}
          </button>
          <button
            type="button"
            class="btn"
            :class="{ primary: manualMode === 'qna' }"
            @click="switchManualMode('qna')"
          >
            {{ t('bookkeeping.manual.qna', '問答記帳') }}
          </button>
        </div>
      </div>
    </article>

    <AiAutoBookkeepingPage v-if="topMode === 'ai'" embedded />
    <QnaBookkeepingPage v-else-if="manualMode === 'qna'" embedded />
    <QuickAddPage v-else embedded />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getLastManualBookkeepingPath,
  isBookkeepingPath,
  isManualBookkeepingPath,
  AI_BOOKKEEPING_PATH,
  QNA_BOOKKEEPING_PATH,
  QUICK_ADD_BOOKKEEPING_PATH,
  rememberBookkeepingPath,
} from '@/ui/services/bookkeeping-mode.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import AiAutoBookkeepingPage from '@/ui/views/AiAutoBookkeepingPage.vue'
import QnaBookkeepingPage from '@/ui/views/QnaBookkeepingPage.vue'
import QuickAddPage from '@/ui/views/QuickAddPage.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const lastManualPath = ref(getLastManualBookkeepingPath())

const topMode = computed(() => {
  return route.path === AI_BOOKKEEPING_PATH ? 'ai' : 'manual'
})

const manualMode = computed(() => {
  return route.path === QNA_BOOKKEEPING_PATH ? 'qna' : 'quick'
})

watch(
  () => route.path,
  (path) => {
    if (!isBookkeepingPath(path)) return

    if (isManualBookkeepingPath(path)) {
      lastManualPath.value = rememberBookkeepingPath(path)
      return
    }
    rememberBookkeepingPath(path)
  },
  { immediate: true },
)

async function switchTopMode(nextMode) {
  const target = nextMode === 'ai'
    ? AI_BOOKKEEPING_PATH
    : lastManualPath.value
  if (route.path === target) return
  await router.replace(target).catch(() => {})
}

async function switchManualMode(nextMode) {
  const target = nextMode === 'qna'
    ? QNA_BOOKKEEPING_PATH
    : QUICK_ADD_BOOKKEEPING_PATH
  if (route.path === target) return
  await router.replace(target).catch(() => {})
}

async function goBack() {
  await goBackOrFallback(router, '/features')
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2 {
  margin: 0;
}

.header-row {
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  align-items: center;
  overflow-x: auto;
  max-width: 100%;
  scrollbar-width: none;
}

.header-actions::-webkit-scrollbar {
  display: none;
}

.mode-toggle,
.manual-switch-actions {
  display: flex;
  gap: 8px;
}

.mode-toggle {
  flex-wrap: nowrap;
  flex: 0 0 auto;
}

.mode-toggle .btn {
  white-space: nowrap;
}

.manual-switch-actions {
  flex-wrap: wrap;
}

.manual-switch-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--field-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.manual-switch-label {
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .manual-switch-actions {
    width: 100%;
  }

  .manual-switch-actions .btn {
    flex: 1 1 0;
  }
}
</style>
