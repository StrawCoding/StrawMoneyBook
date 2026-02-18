<template>
  <section class="stack">
    <header class="row">
      <h2>{{ t('personalization.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>
    <article class="card panel">
      <div class="stack section-block">
        <h3>{{ t('personalization.theme_scheme') }}</h3>
        <div class="scheme-grid">
          <button
            v-for="scheme in schemes"
            :key="scheme.id"
            type="button"
            class="scheme-btn"
            :class="{ active: scheme.id === selectedSchemeId }"
            @click="pickScheme(scheme.id)"
          >
            <div class="scheme-preview" :style="previewStyleOf(scheme)">
              <span class="dot primary" :style="{ background: scheme.primary }"></span>
              <span class="dot secondary" :style="{ background: scheme.secondary }"></span>
            </div>
            <div class="scheme-name-row">
              <strong>{{ schemeName(scheme) }}</strong>
              <small class="mode-chip">{{ scheme.mode === 'light' ? t('common.light') : t('common.dark') }}</small>
            </div>
            <small>{{ schemeDescription(scheme) }}</small>
          </button>
        </div>
      </div>

      <label>
        {{ t('personalization.primary_color') }}
        <input v-model="primary" class="color-input" type="color" @input="applyColor" />
      </label>

      <div class="preset-wrap">
        <button
          v-for="color in presets"
          :key="color"
          class="preset-btn"
          :style="{ background: color }"
          :aria-label="`${t('personalization.apply_color')} ${color}`"
          @click="pickPreset(color)"
        ></button>
      </div>

      <div class="row action-row">
        <button class="btn primary" @click="saveTheme">{{ t('personalization.save_theme') }}</button>
        <button class="btn" @click="resetColor">{{ t('common.reset_default') }}</button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  applyThemeColor,
  applyThemeScheme,
  getCurrentThemePreference,
  listThemeSchemes,
  resetThemeColor,
  saveThemeScheme,
  saveThemeColor,
} from '@/ui/services/theme.service'

const uiStore = useUiStore()
const { t } = useI18n()
const schemes = listThemeSchemes()
const initialTheme = getCurrentThemePreference()
const primary = ref(initialTheme.primary)
const selectedSchemeId = ref(initialTheme.schemeId)
const presets = ['#14b8a6', '#84cc16', '#fbbf24', '#0ea5e9', '#22c55e', '#ffc107', '#3498db', '#e74c3c']

function applyColor() {
  primary.value = applyThemeColor(primary.value)
}

function pickScheme(schemeId) {
  const applied = applyThemeScheme(schemeId)
  selectedSchemeId.value = applied.schemeId
  primary.value = applied.primary
}

function pickPreset(color) {
  primary.value = color
  applyColor()
}

function saveTheme() {
  const customPrimary = primary.value
  const applied = saveThemeScheme(selectedSchemeId.value)
  selectedSchemeId.value = applied.schemeId
  primary.value = applied.primary

  const schemePrimary = schemePrimaryOf(selectedSchemeId.value)
  if (normalizeHex(customPrimary) !== normalizeHex(schemePrimary)) {
    primary.value = saveThemeColor(customPrimary)
  }
  uiStore.pushToast(t('personalization.theme_saved'))
}

function resetColor() {
  primary.value = resetThemeColor()
  const currentTheme = getCurrentThemePreference()
  selectedSchemeId.value = currentTheme.schemeId
  primary.value = currentTheme.primary
  uiStore.pushToast(t('personalization.theme_reset'))
}

function previewStyleOf(scheme) {
  return {
    background: `linear-gradient(140deg, ${scheme.background}, ${scheme.card})`,
    borderColor: scheme.primary,
  }
}

function schemePrimaryOf(schemeId) {
  return schemes.find((item) => item.id === schemeId)?.primary ?? primary.value
}

function normalizeHex(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  return raw.startsWith('#') ? raw : `#${raw}`
}

function schemeName(scheme) {
  return t(`theme_scheme.${scheme.id}.name`, scheme.name)
}

function schemeDescription(scheme) {
  return t(`theme_scheme.${scheme.id}.description`, scheme.description)
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0
}
h3 {
  margin: 0;
  font-size: 14px;
  color: var(--muted)
}
label {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 13px
}
.section-block {
  gap: 10px
}
.scheme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px
}
.scheme-btn {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--bg-soft);
  color: var(--text);
  text-align: left;
  padding: 10px;
  display: grid;
  gap: 6px;
  cursor: pointer
}
.scheme-btn.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent) inset
}
.scheme-preview {
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%
}
.scheme-btn small {
  color: var(--muted);
  font-size: 11px
}
.scheme-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mode-chip {
  border: 1px solid var(--field-border);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--muted);
}
.color-input {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  border: 1px solid var(--field-border);
  background: var(--input-bg);
  padding: 6px
}
.preset-wrap {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px
}
.preset-btn {
  border: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 10px;
  height: 28px;
  cursor: pointer
}
.action-row {
  margin-top: 4px
}
@media (max-width: 640px) {
  .scheme-grid {
    grid-template-columns: 1fr
  }
}</style>
