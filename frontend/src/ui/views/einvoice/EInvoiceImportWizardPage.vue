<template>
  <section class="stack wizard-page">
    <header class="wizard-header row">
      <button class="btn back-btn" type="button" @click="handleBack">
        <font-awesome-icon icon="fa-solid fa-chevron-left" />
      </button>
      <h1 class="wizard-title">{{ t('einvoice.title') }}</h1>
      <span />
    </header>

    <div class="stage-track">
      <template v-for="(stageKey, i) in STAGE_KEYS" :key="i">
        <div
          class="stage-step"
          :class="{ done: currentStep > i + 1, current: currentStep === i + 1 }"
        >
          <div class="stage-circle">
            <font-awesome-icon
              v-if="currentStep > i + 1"
              icon="fa-solid fa-check"
              class="stage-check"
            />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="stage-name">{{ t(stageKey) }}</span>
        </div>
        <div v-if="i < 3" class="stage-connector" :class="{ done: currentStep > i + 1 }" />
      </template>
    </div>

    <transition :name="transitionName" mode="out-in">
      <component :is="currentStepComponent" :key="currentStep" />
    </transition>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { useI18n } from '@/ui/services/i18n.service'
import EInvoiceStep1Account from './EInvoiceStep1Account.vue'
import EInvoiceStep2Query from './EInvoiceStep2Query.vue'
import EInvoiceStep3Select from './EInvoiceStep3Select.vue'
import EInvoiceStep4Confirm from './EInvoiceStep4Confirm.vue'

const { t } = useI18n()
const router = useRouter()
const store = useEInvoiceImportStore()

const STAGE_KEYS = [
  'einvoice.stage1',
  'einvoice.stage2',
  'einvoice.stage3',
  'einvoice.stage4',
]

const transitionName = ref('slide-left')

watch(
  () => store.currentStep,
  (next, prev) => {
    transitionName.value = next > prev ? 'slide-left' : 'slide-right'
  },
)

const currentStep = computed(() => store.currentStep)
const STEP_COMPONENTS = [EInvoiceStep1Account, EInvoiceStep2Query, EInvoiceStep3Select, EInvoiceStep4Confirm]
const currentStepComponent = computed(() => STEP_COMPONENTS[currentStep.value - 1])

function handleBack() {
  if (store.currentStep === 1) {
    store.reset()
    router.back()
  } else if (store.currentStep === 3) {
    store.clearScrapeResults()
    store.currentStep = 2
  } else if (store.currentStep === 4) {
    store.importResult = null
    store.currentStep = 3
  } else {
    store.currentStep--
  }
}
</script>

<style scoped>
.wizard-page {
  min-height: 100dvh;
  background: var(--surface);
  display: flex;
  flex-direction: column;
}
.wizard-header {
  padding: 16px;
  gap: 0;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.wizard-title {
  font-size: 17px;
  margin: 0;
  font-weight: 700;
}

/* Named stage track */
.stage-track {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 14px 12px 10px;
}
.stage-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.stage-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  transition: all 0.2s;
}
.stage-check {
  font-size: 11px;
}
.stage-step.current .stage-circle {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
}
.stage-step.done .stage-circle {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface) 86%);
  color: var(--primary);
}
.stage-name {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: color 0.2s;
  text-align: center;
}
.stage-step.current .stage-name {
  color: var(--primary);
  font-weight: 600;
}
.stage-connector {
  flex: 1;
  height: 2px;
  background: var(--border);
  margin-top: 12px;
  min-width: 6px;
  transition: background 0.2s;
}
.stage-connector.done {
  background: var(--primary);
}

/* Slide transitions */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.22s ease;
}
.slide-left-enter-from { transform: translateX(40px); opacity: 0; }
.slide-left-leave-to  { transform: translateX(-40px); opacity: 0; }
.slide-right-enter-from { transform: translateX(-40px); opacity: 0; }
.slide-right-leave-to  { transform: translateX(40px); opacity: 0; }
</style>
