import {
  flushDeferredScrollRestore,
  getRememberedHomeScrollPosition,
  queueDeferredScrollRestore,
  setNextScrollRestore,
} from './route-scroll.service.js'

function toPathText(value) {
  return String(value ?? '').trim() || '/'
}

const TAB_ROOT_PATHS = new Set(['/analysis', '/assets', '/budget', '/settings'])
const TRANSACTION_TOOL_SEGMENTS = new Set(['search', 'quick-add', 'qna', 'calendar'])

const FALLBACK_RULES = [
  { prefix: '/settings/', fallback: '/settings' },
  { prefix: '/analysis/', fallback: '/analysis' },
  { prefix: '/budget/', fallback: '/budget' },
  { prefix: '/assets/securities/', fallback: '/assets/securities' },
  { prefix: '/assets/', fallback: '/assets' },
  { prefix: '/loans', fallback: '/features' },
  { prefix: '/reimbursements', fallback: '/features' },
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

export function isHomeRoute(routeOrPath) {
  if (routeOrPath && typeof routeOrPath === 'object') {
    const name = String(routeOrPath.name ?? '')
    const path = toPathText(routeOrPath.path)
    return name === 'home' || path === '/'
  }
  return toPathText(routeOrPath) === '/'
}

export function isTransactionDetailOrEditPath(path = '/') {
  const currentPath = toPathText(path).split('?')[0]
  if (!currentPath.startsWith('/transactions/')) return false
  const rest = currentPath.slice('/transactions/'.length)
  if (!rest) return false
  const parts = rest.split('/').filter(Boolean)
  if (parts.length === 1) {
    return !TRANSACTION_TOOL_SEGMENTS.has(parts[0])
  }
  if (parts.length === 2 && parts[1] === 'edit') {
    return !TRANSACTION_TOOL_SEGMENTS.has(parts[0])
  }
  return false
}

/**
 * After a successful bookkeeping save or transaction delete: always land on home
 * with BottomNav home tab, restoring the remembered home scroll (clamped by
 * route-scroll flush). Never router.back() into edit/detail, and never fall
 * back to /features.
 */
export async function returnHomeWithRememberedScroll(router) {
  const remembered = getRememberedHomeScrollPosition() ?? { left: 0, top: 0 }
  setNextScrollRestore(remembered)

  const current = router?.currentRoute?.value
  if (isHomeRoute(current)) {
    queueDeferredScrollRestore(remembered)
    flushDeferredScrollRestore()
    return 'home'
  }

  await router.replace({ name: 'home' })
  return 'replaced'
}

export const returnHomeAfterTransactionDelete = returnHomeWithRememberedScroll
export const returnHomeAfterBookkeeping = returnHomeWithRememberedScroll

function resolveFallbackTarget(fallback, currentPath) {
  const explicit = toPathText(fallback)
  if (explicit) return explicit
  return resolveBackFallback(currentPath)
}

export async function goBackOrFallback(router, fallback) {
  const currentPath = toPathText(router?.currentRoute?.value?.path)
  const target = resolveFallbackTarget(fallback, currentPath)

  if (canNavigateBackInApp(currentPath)) {
    try {
      await router.back()
    } catch {
      // History may be empty despite vue-router state.back — fall through to explicit target.
    }
    const afterPath = toPathText(router?.currentRoute?.value?.path)
    if (afterPath && afterPath !== currentPath) {
      return 'back'
    }
  }

  await router.replace(target)
  return 'fallback'
}

/** Parse pathname from an in-app back anchor href (absolute or root-relative). */
export function resolveBackAnchorFallback(anchor, currentPath = '/') {
  if (!anchor) return resolveBackFallback(currentPath)
  const href = String(anchor.getAttribute('href') ?? '').trim()
  if (!href || href === '#') return resolveBackFallback(currentPath)
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return toPathText(url.pathname)
  } catch {
    return toPathText(href.split('?')[0]) || resolveBackFallback(currentPath)
  }
}

export function shouldConfirmExit(path = '/') {
  return toPathText(path) === '/'
}
