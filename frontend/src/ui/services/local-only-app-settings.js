const LOCAL_ONLY_APP_SETTING_KEY_RE = /^(?:backup\.|sync\.|shared_ledger_meta$|bank_sync\.credentials\.|invoice_carrier\.credentials\.)/i

export { LOCAL_ONLY_APP_SETTING_KEY_RE }

export function isLocalOnlyAppSettingKey(key) {
  return LOCAL_ONLY_APP_SETTING_KEY_RE.test(String(key ?? ''))
}
