const STORAGE_KEY = 'strawmoneybook.theme.preference'
const LEGACY_PRIMARY_KEY = 'strawmoneybook.theme.primary'
const DEFAULT_SCHEME_ID = 'charcoal'

const THEME_SCHEMES = {
  'morning-dew': {
    id: 'morning-dew',
    name: '晨露青禾',
    description: '淺色模式，青藍與嫩綠的清新風格',
    palette: {
      mode: 'light',
      bg: '#f0f9ff',
      bgSoft: '#f5fcf8',
      card: '#ffffff',
      primary: '#14b8a6',
      secondary: '#84cc16',
      text: '#334155',
      muted: '#64748b',
      danger: '#dc2626',
      ok: '#16a34a',
      border: 'rgba(51, 65, 85, 0.12)',
      fieldBorder: 'rgba(51, 65, 85, 0.22)',
      btnBg: '#ffffff',
      inputBg: '#ffffff',
      badgeBg: 'rgba(20, 184, 166, 0.14)',
      badgeText: '#0f766e',
      incomeLight: '#dcfce7',
      incomeDark: '#2e7d32',
      expenseLight: '#fee2e2',
      expenseDark: '#c62828',
    },
  },
  'sunny-harvest': {
    id: 'sunny-harvest',
    name: '日暖豐收',
    description: '淺色模式，溫暖稻穗金與翡翠綠',
    palette: {
      mode: 'light',
      bg: '#fefce8',
      bgSoft: '#fffdf2',
      card: '#ffffff',
      primary: '#f59e0b',
      secondary: '#10b981',
      text: '#1f2937',
      muted: '#6b7280',
      danger: '#dc2626',
      ok: '#16a34a',
      border: 'rgba(31, 41, 55, 0.12)',
      fieldBorder: 'rgba(31, 41, 55, 0.22)',
      btnBg: '#ffffff',
      inputBg: '#ffffff',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeText: '#92400e',
      incomeLight: '#dcfce7',
      incomeDark: '#2e7d32',
      expenseLight: '#fee2e2',
      expenseDark: '#c62828',
    },
  },
  'modern-mint': {
    id: 'modern-mint',
    name: '科技森綠',
    description: '淺色模式，極簡留白與清爽藍綠',
    palette: {
      mode: 'light',
      bg: '#f3f4f6',
      bgSoft: '#f8fafc',
      card: '#ffffff',
      primary: '#0ea5e9',
      secondary: '#22c55e',
      text: '#111827',
      muted: '#6b7280',
      danger: '#dc2626',
      ok: '#16a34a',
      border: 'rgba(17, 24, 39, 0.12)',
      fieldBorder: 'rgba(17, 24, 39, 0.22)',
      btnBg: '#ffffff',
      inputBg: '#ffffff',
      badgeBg: 'rgba(14, 165, 233, 0.14)',
      badgeText: '#0c4a6e',
      incomeLight: '#dcfce7',
      incomeDark: '#2e7d32',
      expenseLight: '#fee2e2',
      expenseDark: '#c62828',
    },
  },
  'deep-ocean': {
    id: 'deep-ocean',
    name: '深海靜謐',
    description: '科技金融感，青藍主調',
    palette: {
      mode: 'dark',
      bg: '#0f172a',
      bgSoft: '#111f36',
      card: '#1e293b',
      primary: '#38bdf8',
      secondary: '#facc15',
      text: '#f1f5f9',
      muted: '#94a3b8',
      danger: '#ff8a80',
      ok: '#4ade80',
      border: 'rgba(148, 163, 184, 0.28)',
      fieldBorder: 'rgba(148, 163, 184, 0.36)',
      btnBg: '#1b2b47',
      inputBg: '#162338',
      badgeBg: 'rgba(56, 189, 248, 0.2)',
      badgeText: '#c7efff',
    },
  },
  'midnight-forest': {
    id: 'midnight-forest',
    name: '森林暗夜',
    description: '有機成長感，深綠主調',
    palette: {
      mode: 'dark',
      bg: '#051814',
      bgSoft: '#0a201b',
      card: '#112520',
      primary: '#66d9a6',
      secondary: '#ffd54f',
      text: '#e0f2f1',
      muted: '#9dc5be',
      danger: '#ff8a80',
      ok: '#66d9a6',
      border: 'rgba(157, 197, 190, 0.28)',
      fieldBorder: 'rgba(157, 197, 190, 0.38)',
      btnBg: '#14312a',
      inputBg: '#0f2923',
      badgeBg: 'rgba(102, 217, 166, 0.2)',
      badgeText: '#d4f8ea',
    },
  },
  charcoal: {
    id: 'charcoal',
    name: '高級炭灰',
    description: '穩定耐看，暖金點綴',
    palette: {
      mode: 'dark',
      bg: '#121212',
      bgSoft: '#1a1a1a',
      card: '#242424',
      primary: '#ffc107',
      secondary: '#81c784',
      text: '#eeeeee',
      muted: '#b0b0b0',
      danger: '#ef9a9a',
      ok: '#81c784',
      border: 'rgba(255, 255, 255, 0.2)',
      fieldBorder: 'rgba(255, 255, 255, 0.28)',
      btnBg: '#303030',
      inputBg: '#1f1f1f',
      badgeBg: 'rgba(255, 193, 7, 0.2)',
      badgeText: '#ffe28a',
    },
  },
}

function normalizeHex(input) {
  const raw = String(input ?? '').trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return `#${hex.toLowerCase()}`
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const value = normalized.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  const toPart = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`
}

function tint(hex, ratio = 0.45) {
  const rgb = hexToRgb(hex)
  if (!rgb) return DEFAULT_PRIMARY
  return rgbToHex(
    rgb.r + (255 - rgb.r) * ratio,
    rgb.g + (255 - rgb.g) * ratio,
    rgb.b + (255 - rgb.b) * ratio,
  )
}

function contrastText(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#1a1207'
  // Perceived brightness (YIQ) to choose readable text color on primary surfaces.
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return yiq >= 150 ? '#1a1207' : '#f6fbff'
}

function getScheme(schemeId) {
  return THEME_SCHEMES[schemeId] ?? THEME_SCHEMES[DEFAULT_SCHEME_ID]
}

function applyPalette(palette) {
  const root = document.documentElement
  root.dataset.themeMode = palette.mode === 'light' ? 'light' : 'dark'
  root.style.colorScheme = palette.mode === 'light' ? 'light' : 'dark'
  root.style.setProperty('--bg', palette.bg)
  root.style.setProperty('--bg-soft', palette.bgSoft)
  root.style.setProperty('--card', palette.card)
  root.style.setProperty('--text', palette.text)
  root.style.setProperty('--muted', palette.muted)
  root.style.setProperty('--danger', palette.danger)
  root.style.setProperty('--ok', palette.ok)
  root.style.setProperty('--border', palette.border)
  root.style.setProperty('--field-border', palette.fieldBorder)
  root.style.setProperty('--btn-bg', palette.btnBg)
  root.style.setProperty('--input-bg', palette.inputBg)
  root.style.setProperty('--badge-bg', palette.badgeBg)
  root.style.setProperty('--badge-text', palette.badgeText)
  root.style.setProperty('--secondary', palette.secondary)
  root.style.setProperty('--income-light', palette.incomeLight ?? '#E8F5E9')
  root.style.setProperty('--income-dark', palette.incomeDark ?? '#2E7D32')
  root.style.setProperty('--expense-light', palette.expenseLight ?? '#FFEBEE')
  root.style.setProperty('--expense-dark', palette.expenseDark ?? '#C62828')
  if (palette.mode === 'light') {
    root.style.setProperty('--home-income-card-bg', 'linear-gradient(135deg, #DCFCE7 0%, #F0FDF4 100%)')
    root.style.setProperty('--home-income-card-border', 'rgba(46, 125, 50, 0.36)')
    root.style.setProperty('--home-income-card-value', '#2E7D32')
    root.style.setProperty('--home-expense-card-bg', 'linear-gradient(135deg, #FEE2E2 0%, #FEF2F2 100%)')
    root.style.setProperty('--home-expense-card-border', 'rgba(198, 40, 40, 0.36)')
    root.style.setProperty('--home-expense-card-value', '#C62828')
  } else {
    root.style.setProperty('--home-income-card-bg', '#1B2E1D')
    root.style.setProperty('--home-income-card-border', '#4CAF50')
    root.style.setProperty('--home-income-card-value', '#81C784')
    root.style.setProperty('--home-expense-card-bg', '#321F1F')
    root.style.setProperty('--home-expense-card-border', '#F44336')
    root.style.setProperty('--home-expense-card-value', '#E57373')
  }
}

function applyPrimary(primaryHex) {
  const primary = normalizeHex(primaryHex) ?? getScheme(DEFAULT_SCHEME_ID).palette.primary
  const root = document.documentElement
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-soft', tint(primary, 0.45))
  root.style.setProperty('--primary-contrast', contrastText(primary))
  return primary
}

function readPreference() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          schemeId: getScheme(parsed.schemeId)?.id ?? DEFAULT_SCHEME_ID,
          primaryOverride: normalizeHex(parsed.primaryOverride),
        }
      }
    } catch {
      // ignore invalid json
    }
  }

  const legacy = normalizeHex(localStorage.getItem(LEGACY_PRIMARY_KEY))
  return {
    schemeId: DEFAULT_SCHEME_ID,
    primaryOverride: legacy,
  }
}

function writePreference(preference) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schemeId: preference.schemeId,
      primaryOverride: preference.primaryOverride ?? null,
    }),
  )
}

function applyPreference(preference) {
  const scheme = getScheme(preference?.schemeId)
  applyPalette(scheme.palette)
  const primary = applyPrimary(preference?.primaryOverride ?? scheme.palette.primary)
  return {
    schemeId: scheme.id,
    primary,
    schemePrimary: scheme.palette.primary,
  }
}

export function listThemeSchemes() {
  return Object.values(THEME_SCHEMES).map((scheme) => ({
    id: scheme.id,
    name: scheme.name,
    description: scheme.description,
    mode: scheme.palette.mode ?? 'dark',
    primary: scheme.palette.primary,
    background: scheme.palette.bg,
    card: scheme.palette.card,
    text: scheme.palette.text,
    secondary: scheme.palette.secondary,
  }))
}

export function getCurrentThemePreference() {
  const preference = readPreference()
  const scheme = getScheme(preference.schemeId)
  return {
    schemeId: scheme.id,
    primary: preference.primaryOverride ?? scheme.palette.primary,
    schemePrimary: scheme.palette.primary,
  }
}

export function applyThemeScheme(schemeId) {
  return applyPreference({
    schemeId: getScheme(schemeId).id,
    primaryOverride: null,
  })
}

export function saveThemeScheme(schemeId) {
  const preference = {
    schemeId: getScheme(schemeId).id,
    primaryOverride: null,
  }
  const applied = applyPreference(preference)
  writePreference(preference)
  localStorage.removeItem(LEGACY_PRIMARY_KEY)
  return applied
}

export function applyThemeColor(primaryHex) {
  return applyPrimary(primaryHex)
}

export function saveThemeColor(primaryHex) {
  const preference = readPreference()
  const normalized = normalizeHex(primaryHex)
  preference.primaryOverride = normalized
  const applied = applyPreference(preference)
  writePreference(preference)
  localStorage.removeItem(LEGACY_PRIMARY_KEY)
  return applied.primary
}

export function resetThemeColor() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_PRIMARY_KEY)
  const applied = applyPreference({
    schemeId: DEFAULT_SCHEME_ID,
    primaryOverride: null,
  })
  return applied.primary
}

export function loadThemeColor() {
  const applied = applyPreference(readPreference())
  return applied.primary
}

export function getDefaultThemeColor() {
  return getScheme(DEFAULT_SCHEME_ID).palette.primary
}
