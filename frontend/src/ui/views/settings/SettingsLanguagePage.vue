<template>
  <HabitatPageShell
    :title="t('settings_language.title')"
    :kicker="t('settings_language.habitat_hello')"
    test-id="settings-language-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >
    <HabitatSection>
      <p class="muted current-line">{{ t('language_page.current') }}：{{ currentLabel }}</p>

      <h3 class="habitat-section-title">{{ t('language_page.select') }}</h3>
      <div class="language-grid">
          <button
            v-for="option in localeOptions"
            :key="option.value"
            type="button"
            class="language-btn"
            :data-testid="`language-option-${option.value}`"
            :class="{ active: option.value === locale }"
            @click="pickLanguage(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
    </HabitatSection>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import HabitatSection from '@/ui/components/layout/habitat/HabitatSection.vue'
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'

const uiStore = useUiStore()
const { t, locale, localeOptions, setLocale } = useI18n()

const currentLabel = computed(() => {
  return localeOptions.value.find((item) => item.value === locale.value)?.label ?? locale.value
})

function pickLanguage(localeValue) {
  const currentLocale = locale.value
  const nextLocale = setLocale(localeValue)
  if (nextLocale !== currentLocale) {
    uiStore.pushToast(t('personalization.language_saved'))
  }
}
</script>

<style scoped>
.current-line {
  margin: 0;
}
.language-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}
.language-btn {
  border: 1px solid var(--field-border);
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text);
  min-height: 38px;
  padding: 8px 10px;
  font-weight: 700;
  cursor: pointer;
}
.language-btn.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent) inset;
}
@media (max-width: 640px) {
  .language-grid {
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  }
}
</style>
