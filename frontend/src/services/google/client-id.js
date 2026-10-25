import { translateMessage } from '@/ui/services/i18n.service'

const GOOGLE_WEB_CLIENT_ID_KEYS = [
  'VITE_GOOGLE_WEB_CLIENT_ID',
  'VITE_GOOGLE_OAUTH_CLIENT_ID',
  'VITE_GOOGLE_CLIENT_ID',
]

export function getConfiguredGoogleWebClientId() {
  for (const key of GOOGLE_WEB_CLIENT_ID_KEYS) {
    const value = String(import.meta.env[key] ?? '').trim()
    if (value) return value
  }
  return ''
}

export function getGoogleWebClientIdMissingMessage() {
  return translateMessage(
    'common.missing_google_web_client_id',
    '缺少 Google Web Client ID（請設定 VITE_GOOGLE_WEB_CLIENT_ID）',
  )
}
