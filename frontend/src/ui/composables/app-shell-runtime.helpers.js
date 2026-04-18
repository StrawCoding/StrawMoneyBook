export function isAppShellBooting({
  ledgerReady,
  hasLedgers,
  accountReady,
}) {
  return !ledgerReady || (hasLedgers && !accountReady)
}

export function resolveRouteTransitionKey(targetRoute) {
  const stableKey = String(targetRoute?.meta?.transitionKey ?? '').trim()
  return stableKey || String(targetRoute?.fullPath ?? '')
}

export function buildAppUpdateDialogMessage(updateInfo, t) {
  if (updateInfo?.checkFailed) {
    const detail = String(updateInfo?.message ?? '').trim()
    return detail
      ? `${t('app_update.check_failed_prompt')}\n${detail}`
      : t('app_update.check_failed_prompt')
  }
  const summary = t('app_update.message_no_version')
  const note = String(updateInfo?.message ?? '').trim()
  return note ? `${summary}\n${note}` : summary
}

export function setRouteStageMinHeight(stageRef, heightPx = 0) {
  const stage = stageRef?.value
  if (!stage) return
  const nextHeight = Math.max(0, Math.ceil(Number(heightPx) || 0))
  stage.style.minHeight = nextHeight > 0 ? `${nextHeight}px` : ''
}

export function resolveElementHeight(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return 0
  return element.getBoundingClientRect().height
}
