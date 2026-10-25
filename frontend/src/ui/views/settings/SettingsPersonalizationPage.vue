<template>
  <HabitatPageShell
    :title="t('personalization.title')"
    :kicker="t('settings_page.habitat_hello')"
    test-id="settings-personalization-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >
    <article class="card panel">
      <div class="stack section-block">
        <h3>{{ t('personalization.ui_layout') }}</h3>
        <div class="layout-switch" role="group" :aria-label="t('personalization.ui_layout')">
          <button
            v-for="item in layouts"
            :key="item.id"
            type="button"
            class="layout-btn"
            :class="{ active: item.id === selectedLayoutId }"
            :data-testid="`ui-layout-${item.id}`"
            @click="pickLayout(item.id)"
          >
            <strong>{{ t(item.nameKey) }}</strong>
            <small>{{ t(item.descriptionKey) }}</small>
          </button>
        </div>
      </div>

      <div class="stack section-block">
        <h3>{{ t('personalization.theme_scheme') }}</h3>
        <div class="scheme-grid">
          <button
            v-for="scheme in schemes"
            :key="scheme.id"
            type="button"
            class="scheme-btn"
            :class="{ active: scheme.id === selectedSchemeId }"
            :data-testid="`theme-scheme-${scheme.id}`"
            :data-theme-mode="scheme.mode"
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

      <label class="color-field">
        {{ t('personalization.primary_color') }}
      </label>

      <div class="palette-wrap">
        <button
          v-for="color in paletteColors"
          :key="color"
          class="palette-btn"
          :class="{ active: normalizeHex(primary) === normalizeHex(color) }"
          :style="{ background: color }"
          :aria-label="`${t('personalization.apply_color')} ${color}`"
          @click="pickPaletteColor(color)"
        ></button>
      </div>

      <label class="color-field">
        {{ t('personalization.apply_color') }}
        <input v-model="primary" class="color-input" type="color" @input="applyColor" />
      </label>

      <div class="row action-row">
        <button class="btn primary" data-testid="theme-save" @click="saveTheme">{{ t('personalization.save_theme') }}</button>
        <button class="btn" @click="resetColor">{{ t('common.reset_default') }}</button>
      </div>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
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
import { listUiLayouts } from '@/ui/services/ui-layout.service'
import { useUiLayout } from '@/ui/composables/useUiLayout'
const uiStore = useUiStore()
const { t } = useI18n()
const { layout, setLayout } = useUiLayout()
const layouts = listUiLayouts()
const selectedLayoutId = layout
const schemes = listThemeSchemes()
const initialTheme = getCurrentThemePreference()
const primary = ref(initialTheme.primary)
const selectedSchemeId = ref(initialTheme.schemeId)
const paletteColors = buildPaletteColors()

function pickLayout(layoutId) {
  const applied = setLayout(layoutId)
  uiStore.pushToast(t('personalization.layout_saved'))
  return applied
}

function applyColor() {
  primary.value = applyThemeColor(primary.value)
}

function pickScheme(schemeId) {
  const applied = applyThemeScheme(schemeId)
  selectedSchemeId.value = applied.schemeId
  primary.value = applied.primary
}

function pickPaletteColor(color) {
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

function buildPaletteColors() {
  const colors = []
  const saturations = [70, 82]
  const lights = [42, 52, 62]

  for (let hue = 0; hue < 360; hue += 24) {
    for (const saturation of saturations) {
      for (const light of lights) {
        colors.push(hslToHex(hue, saturation, light))
      }
    }
  }
  return colors
}

function hslToHex(h, s, l) {
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = h / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))

  let red = 0
  let green = 0
  let blue = 0

  if (segment >= 0 && segment < 1) {
    red = chroma
    green = x
  } else if (segment < 2) {
    red = x
    green = chroma
  } else if (segment < 3) {
    green = chroma
    blue = x
  } else if (segment < 4) {
    green = x
    blue = chroma
  } else if (segment < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  const m = lightness - chroma / 2
  const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
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
.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
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
.color-field {
  margin-top: 2px;
}
.section-block {
  gap: 10px
}
.layout-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.layout-btn {
  border: 1px solid var(--field-border);
  border-radius: 16px;
  background: var(--bg-soft);
  color: var(--text);
  text-align: left;
  padding: 10px;
  display: grid;
  gap: 4px;
  cursor: pointer;
}
.layout-btn.active {
  border-color: var(--primary);
}
.layout-btn small {
  color: var(--muted);
  font-size: 11px;
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
.palette-wrap {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 6px
}
.palette-btn {
  border: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 999px;
  aspect-ratio: 1 / 1;
  width: 100%;
  padding: 0;
  cursor: pointer
}
.palette-btn.active {
  border-color: var(--text);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 30%, transparent);
}
.action-row {
  margin-top: 4px
}
@media (max-width: 640px) {
  .scheme-grid {
    grid-template-columns: 1fr
  }
  .palette-wrap {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}</style>
