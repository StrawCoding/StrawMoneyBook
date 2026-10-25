<template>
  <section class="stack bookkeeping-page">
    <header class="bookkeeping-chrome" data-testid="bookkeeping-page-header">
      <div class="bookkeeping-top-row">
        <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
        <h2>{{ t('bookkeeping.page_title') }}</h2>
      </div>
      <div class="bookkeeping-mode-stack">
        <div class="segment-pills mode-toggle-row" data-testid="bookkeeping-mode-toggle">
          <button
            type="button"
            class="btn tab-btn"
            data-testid="bookkeeping-mode-ai"
            :class="{ primary: topMode === 'ai' }"
            @click="switchTopMode('ai')"
          >
            {{ t('bookkeeping.mode.ai') }}
          </button>
          <button
            type="button"
            class="btn tab-btn"
            data-testid="bookkeeping-mode-manual"
            :class="{ primary: topMode === 'manual' }"
            @click="switchTopMode('manual')"
          >
            {{ t('bookkeeping.mode.manual', '手動記帳') }}
          </button>
        </div>
        <div v-if="topMode === 'manual'" class="segment-pills manual-switch-actions" data-testid="bookkeeping-manual-toggle">
          <button
            type="button"
            class="btn tab-btn"
            data-testid="bookkeeping-manual-quick"
            :class="{ primary: manualMode === 'quick' }"
            @click="switchManualMode('quick')"
          >
            {{ t('bookkeeping.manual.quick_add', '快速新增') }}
          </button>
          <button
            type="button"
            class="btn tab-btn"
            data-testid="bookkeeping-manual-qna"
            :class="{ primary: manualMode === 'qna' }"
            @click="switchManualMode('qna')"
          >
            {{ t('bookkeeping.manual.qna', '問答記帳') }}
          </button>
        </div>
      </div>
    </header>

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
.stack {
  padding-bottom: calc(12px + var(--navigation-bar-height));
}

.bookkeeping-chrome {
  display: grid;
  gap: 10px;
}

.bookkeeping-top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

h2 {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  font-size: clamp(20px, 5vw, 24px);
  font-weight: 750;
  letter-spacing: -0.03em;
}

.bookkeeping-mode-stack {
  display: grid;
  gap: 6px;
}

.segment-pills {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.segment-pills .tab-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 8px 6px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--bg-soft);
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  box-shadow: none;
}

.segment-pills .tab-btn.primary {
  background: color-mix(in srgb, var(--primary) 16%, var(--card) 84%);
  color: var(--text);
  border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
}
</style>
