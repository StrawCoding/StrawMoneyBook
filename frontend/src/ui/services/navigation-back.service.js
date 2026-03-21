function toPathText(value) {
  return String(value ?? '').trim() || '/'
}

const TAB_ROOT_PATHS = new Set(['/analysis', '/assets', '/budget', '/settings'])

const FALLBACK_RULES = [
  { prefix: '/settings/', fallback: '/settings' },
  { prefix: '/analysis/', fallback: '/analysis' },
  { prefix: '/budget/', fallback: '/budget' },
  { prefix: '/assets/', fallback: '/assets' },
  { prefix: '/loans', fallback: '/features' },
  { prefix: '/reimbursements', fallback: '/features' },
  { prefix: '/invoice-carriers', fallback: '/features' },
  { prefix: '/transactions', fallback: '/' },
  { prefix: '/icons', fallback: '/' },
  { prefix: '/ai-auto-bookkeeping', fallback: '/features' },
  { prefix: '/features', fallback: '/' },
]

export function canNavigateBackInApp(currentPath = '/') {
  if (typeof window === 'undefined') return false
  const state = window.history?.state
  const back = toPathText(state?.back ?? '')
  const current = toPathText(state?.current ?? currentPath)
  if (!back) return false
  return back !== current
}

export function resolveBackFallback(path = '/') {
  const currentPath = toPathText(path)
  if (TAB_ROOT_PATHS.has(currentPath)) return '/'
  for (const rule of FALLBACK_RULES) {
    if (currentPath === rule.prefix || currentPath.startsWith(rule.prefix)) {
      return rule.fallback
    }
  }
  return '/'
}

export async function goBackOrFallback(router, fallback) {
  const currentPath = toPathText(router?.currentRoute?.value?.path)
  if (canNavigateBackInApp(currentPath)) {
    await router.back()
    return 'back'
  }

  const target = fallback ?? resolveBackFallback(currentPath)
  await router.replace(target)
  return 'fallback'
}

export function shouldConfirmExit(path = '/') {
  return toPathText(path) === '/'
}
