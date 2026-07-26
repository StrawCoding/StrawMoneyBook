/**
 * Print/export analysis reports must stay light regardless of App theme.
 * Tokens are solid hex (no color-mix / var(--card)) so html2canvas can rasterize reliably.
 */
export const ANALYSIS_REPORT_LIGHT_THEME = Object.freeze({
  colorScheme: 'light',
  background: '#ffffff',
  text: '#0f172a',
  vars: Object.freeze({
    '--bg': '#ffffff',
    '--bg-soft': '#f8fafc',
    '--card': '#ffffff',
    '--card-elevated': '#ffffff',
    '--text': '#0f172a',
    '--text-soft': '#334155',
    '--muted': '#64748b',
    '--field-border': '#dbe3f0',
    '--border': '#dbe3f0',
    '--border-strong': '#cbd5e1',
    '--surface-soft-accent': '#eef4ff',
    '--surface-muted': '#f1f5f9',
    '--chart-track': '#e2e8f0',
    '--income-dark': '#059669',
    '--expense-dark': '#dc2626',
    '--income-light': '#d1fae5',
    '--expense-light': '#fee2e2',
    '--primary': '#2563eb',
    '--btn-bg': '#ffffff',
    '--input-bg': '#ffffff',
  }),
})

export function buildAnalysisReportLightThemeCssText(selector = ':root, html, body') {
  const declarations = [
    `color-scheme: ${ANALYSIS_REPORT_LIGHT_THEME.colorScheme} !important`,
    `background: ${ANALYSIS_REPORT_LIGHT_THEME.background} !important`,
    `color: ${ANALYSIS_REPORT_LIGHT_THEME.text} !important`,
    ...Object.entries(ANALYSIS_REPORT_LIGHT_THEME.vars).map(
      ([name, value]) => `${name}: ${value} !important`,
    ),
  ]
  return `${selector} {\n  ${declarations.join(';\n  ')};\n}`
}

export function applyAnalysisReportLightThemeInline(target, { important = true } = {}) {
  if (!target?.style?.setProperty) return target
  const priority = important ? 'important' : undefined
  target.style.setProperty('color-scheme', ANALYSIS_REPORT_LIGHT_THEME.colorScheme, priority)
  target.style.setProperty('background', ANALYSIS_REPORT_LIGHT_THEME.background, priority)
  target.style.setProperty('color', ANALYSIS_REPORT_LIGHT_THEME.text, priority)
  for (const [name, value] of Object.entries(ANALYSIS_REPORT_LIGHT_THEME.vars)) {
    target.style.setProperty(name, value, priority)
  }
  if (target.dataset) {
    target.dataset.exportColorScheme = 'light'
  }
  return target
}

export function isLightRgbColor(color, { minLuminance = 0.72 } = {}) {
  const match = String(color ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) {
    const hex = String(color ?? '').trim()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
      const raw = hex.slice(1)
      const full = raw.length === 3
        ? raw.split('').map((part) => part + part).join('')
        : raw
      const r = Number.parseInt(full.slice(0, 2), 16)
      const g = Number.parseInt(full.slice(2, 4), 16)
      const b = Number.parseInt(full.slice(4, 6), 16)
      return relativeLuminance(r, g, b) >= minLuminance
    }
    return false
  }
  return relativeLuminance(Number(match[1]), Number(match[2]), Number(match[3])) >= minLuminance
}

export function isDarkRgbColor(color, { maxLuminance = 0.45 } = {}) {
  const match = String(color ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) {
    const hex = String(color ?? '').trim()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
      const raw = hex.slice(1)
      const full = raw.length === 3
        ? raw.split('').map((part) => part + part).join('')
        : raw
      const r = Number.parseInt(full.slice(0, 2), 16)
      const g = Number.parseInt(full.slice(2, 4), 16)
      const b = Number.parseInt(full.slice(4, 6), 16)
      return relativeLuminance(r, g, b) <= maxLuminance
    }
    return false
  }
  return relativeLuminance(Number(match[1]), Number(match[2]), Number(match[3])) <= maxLuminance
}

function relativeLuminance(r, g, b) {
  const toLinear = (channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return (0.2126 * toLinear(r)) + (0.7152 * toLinear(g)) + (0.0722 * toLinear(b))
}
