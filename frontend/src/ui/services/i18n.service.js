import { computed, ref } from 'vue'
import { RUNTIME_EN_TEXT_EXACT_GENERATED } from './runtime-en-exact.generated.js'
import { RUNTIME_EN_TEXT_GENERATED } from './runtime-en-phrases.generated.js'
import { RUNTIME_EN_TEXT } from './i18n/runtime-en-text.js'
import { RUNTIME_JA_TEXT } from './i18n/runtime-ja-text.js'
import { RUNTIME_EN_REPLACEMENTS } from './i18n/runtime-en-replacements.js'
import { MESSAGES_ZH_TW } from './i18n/messages-zh-TW.js'
import { MESSAGES_EN } from './i18n/messages-en.js'
import { MESSAGES_JA } from './i18n/messages-ja.js'

const STORAGE_KEY = 'strawmoneybook.locale'
const DEFAULT_LOCALE = 'zh-TW'
const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja']

const translatableAttributeNames = ['placeholder', 'title', 'aria-label']
const ENABLE_RUNTIME_DOM_TRANSLATOR = true
let domTranslatorObserver = null
let isSyncingRuntimeDomTranslations = false
const originalTextByNode = new WeakMap()
const originalAttrsByElement = new WeakMap()

const MESSAGES = {
  'zh-TW': MESSAGES_ZH_TW,
  en: MESSAGES_EN,
  ja: MESSAGES_JA,
}

const runtimeLocaleDataCache = new Map()

function resolveRuntimeLocale(value) {
  const locale = String(value ?? '').trim()
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE
}

function getRuntimeLocaleOverrides(locale) {
  if (locale === 'en') {
    return {
      ...RUNTIME_EN_TEXT_EXACT_GENERATED,
      ...RUNTIME_EN_TEXT_GENERATED,
      ...RUNTIME_EN_REPLACEMENTS,
      ...RUNTIME_EN_TEXT,
    }
  }
  if (locale === 'ja') return RUNTIME_JA_TEXT
  return {}
}

function buildRuntimeLocaleData(locale) {
  const resolvedLocale = resolveRuntimeLocale(locale)
  const overrides = getRuntimeLocaleOverrides(resolvedLocale)
  const baseMessages = MESSAGES[DEFAULT_LOCALE] ?? {}
  const targetMessages = MESSAGES[resolvedLocale] ?? {}
  const exact = { ...overrides }

  for (const [key, baseValue] of Object.entries(baseMessages)) {
    const sourceText = String(baseValue ?? '').trim()
    const targetText = String(targetMessages[key] ?? '').trim()
    if (!sourceText || !targetText || sourceText === targetText) continue
    if (!(sourceText in exact)) {
      exact[sourceText] = targetText
    }
  }

  const replacements = Object.entries(overrides)
    .filter(([source]) => String(source ?? '').trim().length >= 2)
    .sort((a, b) => b[0].length - a[0].length)

  return {
    exact,
    replacements,
  }
}

function getRuntimeLocaleData(locale) {
  const resolvedLocale = resolveRuntimeLocale(locale)
  if (!runtimeLocaleDataCache.has(resolvedLocale)) {
    runtimeLocaleDataCache.set(resolvedLocale, buildRuntimeLocaleData(resolvedLocale))
  }
  return runtimeLocaleDataCache.get(resolvedLocale)
}

const localeRef = ref(DEFAULT_LOCALE)

function normalizeLocale(value) {
  const raw = String(value ?? '').trim()
  if (SUPPORTED_LOCALES.includes(raw)) return raw
  return DEFAULT_LOCALE
}

function applyDocumentLanguage(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

function readLocale() {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  const storedLocale = localStorage.getItem(STORAGE_KEY)
  if (storedLocale) {
    return normalizeLocale(storedLocale)
  }

  const detectedLocale = detectUserLocale()
  localStorage.setItem(STORAGE_KEY, detectedLocale)
  return detectedLocale
}

function writeLocale(locale) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, locale)
}

function detectUserLocale() {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE

  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ]

  for (const item of candidates) {
    const value = String(item ?? '').trim().toLowerCase()
    if (!value) continue
    if (value.startsWith('zh')) return 'zh-TW'
    if (value.startsWith('en')) return 'en'
    if (value.startsWith('ja')) return 'ja'
  }

  return DEFAULT_LOCALE
}

export function initLocalePreference() {
  const locale = readLocale()
  localeRef.value = locale
  applyDocumentLanguage(locale)
  safelyStartRuntimeDomTranslator()
  return locale
}

export function setLocale(locale) {
  const normalized = normalizeLocale(locale)
  localeRef.value = normalized
  writeLocale(normalized)
  applyDocumentLanguage(normalized)
  safelyStartRuntimeDomTranslator()
  return normalized
}

export function getCurrentLocale() {
  return localeRef.value
}

function translateRuntimeTextToLocale(text, locale) {
  const resolvedLocale = resolveRuntimeLocale(locale)
  if (resolvedLocale === DEFAULT_LOCALE) return text

  const { exact, replacements } = getRuntimeLocaleData(resolvedLocale)
  if (exact[text]) return exact[text]

  let output = text
  for (const [source, translated] of replacements) {
    if (!output.includes(source)) continue
    output = output.split(source).join(translated)
  }
  return output.replace(/\s{2,}/g, ' ').trim()
}

export function translateRuntimeText(input) {
  const text = String(input ?? '')
  if (!text) return ''
  if (localeRef.value !== DEFAULT_LOCALE) {
    return translateRuntimeTextToLocale(text, localeRef.value)
  }
  return text
}

function translateTextByLocale(text) {
  if (localeRef.value !== DEFAULT_LOCALE) return translateRuntimeText(text)
  return text
}

function isInRuntimeTranslateExcludedZone(element) {
  if (!element || typeof element.closest !== 'function') return false
  if (element.closest('[data-no-runtime-translate]')) return true
  if (element.closest('.custom-select')) return true
  const tagName = String(element.tagName ?? '').toUpperCase()
  return tagName === 'SELECT' || tagName === 'OPTION'
}

function shouldSkipTextNode(node) {
  const parentElement = node?.parentElement
  const parentTag = parentElement?.tagName
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE') return true
  return isInRuntimeTranslateExcludedZone(parentElement)
}

function shouldRefreshOriginalValue(currentValue, originalValue) {
  const current = String(currentValue ?? '')
  const original = String(originalValue ?? '')
  if (!current) return false
  if (!original) return true
  if (current === original) return false
  if (localeRef.value === DEFAULT_LOCALE) return true
  return current !== translateRuntimeText(original)
}

function processTextNode(node) {
  if (!node || shouldSkipTextNode(node)) return
  const current = String(node.textContent ?? '')
  if (!originalTextByNode.has(node)) {
    originalTextByNode.set(node, current)
  } else if (shouldRefreshOriginalValue(current, originalTextByNode.get(node))) {
    originalTextByNode.set(node, current)
  }
  const original = originalTextByNode.get(node)
  const translated = translateTextByLocale(original)
  if (current === translated) return
  node.textContent = translated
}

function processElementAttributes(element) {
  if (!element) return
  if (isInRuntimeTranslateExcludedZone(element)) return
  if (!originalAttrsByElement.has(element)) {
    const snapshot = {}
    for (const name of translatableAttributeNames) {
      if (!element.hasAttribute(name)) continue
      snapshot[name] = element.getAttribute(name) ?? ''
    }
    originalAttrsByElement.set(element, snapshot)
  }

  const original = originalAttrsByElement.get(element) ?? {}
  for (const name of translatableAttributeNames) {
    if (element.hasAttribute(name) && !(name in original)) {
      original[name] = element.getAttribute(name) ?? ''
    }
    if (!(name in original)) continue
    const current = element.getAttribute(name) ?? ''
    if (shouldRefreshOriginalValue(current, original[name])) {
      original[name] = current
    }
    const translated = translateTextByLocale(original[name])
    if (current === translated) continue
    element.setAttribute(name, translated)
  }
}

function processNodeTree(rootNode) {
  if (typeof document === 'undefined' || !rootNode) return
  if (rootNode.nodeType === Node.ELEMENT_NODE && isInRuntimeTranslateExcludedZone(rootNode)) return

  const textWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT)
  let textNode = textWalker.nextNode()
  while (textNode) {
    processTextNode(textNode)
    textNode = textWalker.nextNode()
  }

  if (rootNode.nodeType === Node.ELEMENT_NODE) {
    processElementAttributes(rootNode)
  }
  if (rootNode.querySelectorAll) {
    for (const element of rootNode.querySelectorAll('*')) {
      processElementAttributes(element)
    }
  }
}

function syncRuntimeDomTranslations() {
  if (typeof document === 'undefined' || !document.body) return
  isSyncingRuntimeDomTranslations = true
  try {
    processNodeTree(document.body)
  } finally {
    isSyncingRuntimeDomTranslations = false
  }
}

function startRuntimeDomTranslator() {
  if (typeof document === 'undefined' || domTranslatorObserver || !document.body) return
  domTranslatorObserver = new MutationObserver((mutations) => {
    if (isSyncingRuntimeDomTranslations) return
    isSyncingRuntimeDomTranslations = true
    try {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          processNodeTree(node)
        }
        if (mutation.type === 'characterData') {
        processTextNode(mutation.target)
      }
        if (mutation.type === 'attributes' && mutation.target?.nodeType === Node.ELEMENT_NODE) {
          processElementAttributes(mutation.target)
        }
      }
    } finally {
      isSyncingRuntimeDomTranslations = false
    }
  })
  domTranslatorObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatableAttributeNames,
  })
}

function safelyStartRuntimeDomTranslator() {
  if (!ENABLE_RUNTIME_DOM_TRANSLATOR) return
  if (typeof document === 'undefined') return
  startRuntimeDomTranslator()
  syncRuntimeDomTranslations()
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      syncRuntimeDomTranslations()
    })
  }
}

function applyTemplateParams(template, params = {}) {
  if (!params || typeof params !== 'object') return template
  let output = String(template ?? '')
  for (const [name, value] of Object.entries(params)) {
    const token = `{${name}}`
    output = output.split(token).join(String(value ?? ''))
  }
  return output
}

export function translateMessage(key, paramsOrFallback = {}, explicitFallback) {
  const hasParamsObject = paramsOrFallback && typeof paramsOrFallback === 'object' && !Array.isArray(paramsOrFallback)
  const params = hasParamsObject ? paramsOrFallback : {}
  const fallback = hasParamsObject ? explicitFallback : paramsOrFallback

  const primary = MESSAGES[localeRef.value]?.[key]
  const secondary = MESSAGES[DEFAULT_LOCALE]?.[key]
  const raw = primary ?? secondary ?? (fallback === undefined ? key : fallback)
  return applyTemplateParams(raw, params)
}

export function useI18n() {
  const locale = computed(() => localeRef.value)

  function t(key, paramsOrFallback = {}, explicitFallback) {
    return translateMessage(key, paramsOrFallback, explicitFallback)
  }

  const localeOptions = computed(() =>
    SUPPORTED_LOCALES.map((item) => ({
      value: item,
      label: t(`language.${item}`, item),
    })),
  )

  return {
    locale,
    localeOptions,
    t,
    setLocale,
  }
}
