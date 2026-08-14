import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const servicesRoot = resolve(import.meta.dirname, '../../src/ui/services')

const I18N_BUNDLE_RELATIVE_PATHS = [
  'i18n.service.js',
  'i18n/messages-zh-TW.js',
  'i18n/messages-en.js',
  'i18n/messages-ja.js',
  'i18n/runtime-en-text.js',
  'i18n/runtime-en-replacements.js',
  'i18n/runtime-ja-text.js',
]

/** Concatenated i18n sources for ART-i18n-SPLIT source-gate tests. */
export function readI18nBundleSource(root = servicesRoot) {
  return I18N_BUNDLE_RELATIVE_PATHS.map((relativePath) =>
    readFileSync(resolve(root, relativePath), 'utf8'),
  ).join('\n')
}

export function resolveI18nServicePath(root = servicesRoot) {
  return resolve(root, 'i18n.service.js')
}

export { I18N_BUNDLE_RELATIVE_PATHS }
