export function resolveAndroidBackDecision({
  currentPath,
  lastBackPressedAt = 0,
  now = Date.now(),
  confirmWindowMs = 1600,
  canNavigateBack = () => false,
  resolveFallback = () => '/',
  shouldConfirmExit = () => false,
}) {
  const normalizedPath = String(currentPath ?? '/')
  if (canNavigateBack(normalizedPath)) {
    return { type: 'back' }
  }

  const fallbackPath = resolveFallback(normalizedPath)
  if (fallbackPath !== normalizedPath) {
    return {
      type: 'replace',
      path: fallbackPath,
    }
  }

  if (shouldConfirmExit(normalizedPath)) {
    if (now - lastBackPressedAt <= confirmWindowMs) {
      return { type: 'exit' }
    }
    return {
      type: 'confirm_exit',
      nextLastBackPressedAt: now,
    }
  }

  return { type: 'exit' }
}
