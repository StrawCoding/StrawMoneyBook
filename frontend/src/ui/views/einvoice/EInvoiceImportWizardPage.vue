<template>
  <section class="stack wizard-page">
    <header class="wizard-header row">
      <button class="btn back-btn" type="button" @click="handleBack">
        <font-awesome-icon icon="fa-solid fa-chevron-left" />
      </button>
      <h1 class="wizard-title">{{ t('einvoice.title') }}</h1>
      <span />
    </header>

    <div class="step-indicator row">
      <div
        v-for="n in 4"
        :key="n"
        class="step-dot"
        :class="{ active: currentStep >= n, current: currentStep === n }"
      />
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

const prevStep = ref(store.currentStep)
const transitionName = ref('slide-left')

watch(
  () => store.currentStep,
  (next, prev) => {
    transitionName.value = next > prev ? 'slide-left' : 'slide-right'
    prevStep.value = prev
  },
)

const currentStep = computed(() => store.currentStep)

const STEP_COMPONENTS = [EInvoiceStep1Account, EInvoiceStep2Query, EInvoiceStep3Select, EInvoiceStep4Confirm]
const currentStepComponent = computed(() => STEP_COMPONENTS[currentStep.value - 1])

function handleBack() {
  if (store.currentStep > 1) {
    store.currentStep--
  } else {
    store.reset()
    router.back()
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
.step-indicator {
  justify-content: center;
  gap: 8px;
  padding: 12px;
}
.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.2s;
}
.step-dot.active {
  background: var(--primary);
}
.step-dot.current {
  width: 20px;
  border-radius: 4px;
}
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
