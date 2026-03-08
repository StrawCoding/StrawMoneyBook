<template>
  <section class="stack">
    <article class="card panel">
      <header class="row header-row">
        <h2>{{ t('bookkeeping.page_title') }}</h2>
        <div class="header-actions">
          <button
            type="button"
            class="btn"
            :class="{ primary: mode === 'ai' }"
            @click="switchMode('ai')"
          >
            {{ t('bookkeeping.mode.ai') }}
          </button>
          <button
            type="button"
            class="btn"
            :class="{ primary: mode === 'manual' }"
            @click="switchMode('manual')"
          >
            {{ t('bookkeeping.mode.quick_add') }}
          </button>
          <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
        </div>
      </header>
    </article>

    <AiAutoBookkeepingPage v-if="mode === 'ai'" embedded />
    <QuickAddPage v-else embedded />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import AiAutoBookkeepingPage from '@/ui/views/AiAutoBookkeepingPage.vue'
import QuickAddPage from '@/ui/views/QuickAddPage.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const mode = computed(() => (route.path === '/ai-auto-bookkeeping' ? 'ai' : 'manual'))

async function switchMode(nextMode) {
  const target = nextMode === 'ai' ? '/ai-auto-bookkeeping' : '/transactions/quick-add'
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
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
