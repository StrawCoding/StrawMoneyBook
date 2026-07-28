let pendingScrollPosition = null
let nextForcedScrollPosition = null
let homeScrollMemory = null
let restoreSequence = 0

export function normalizeScrollPosition(position) {
  if (!position || typeof position !== 'object') return null
  return {
    left: Math.max(0, Number(position.left) || 0),
    top: Math.max(0, Number(position.top) || 0),
  }
}

export function clampScrollPosition(position, maxLeft = 0, maxTop = 0) {
  const normalized = normalizeScrollPosition(position) ?? { left: 0, top: 0 }
  return {
    left: Math.min(normalized.left, Math.max(0, Number(maxLeft) || 0)),
    top: Math.min(normalized.top, Math.max(0, Number(maxTop) || 0)),
  }
}

export function captureWindowScrollPosition() {
  if (typeof window === 'undefined') return { left: 0, top: 0 }
  return {
    left: Math.max(0, Number(window.scrollX) || 0),
    top: Math.max(0, Number(window.scrollY) || 0),
  }
}

export function rememberHomeScrollPosition(position = captureWindowScrollPosition()) {
  const normalized = normalizeScrollPosition(position)
  if (!normalized) return null
  homeScrollMemory = normalized
  return homeScrollMemory
}

export function getRememberedHomeScrollPosition() {
  return homeScrollMemory
}

export function clearRememberedHomeScrollPosition() {
  homeScrollMemory = null
}

export function setNextScrollRestore(position) {
  nextForcedScrollPosition = normalizeScrollPosition(position)
  return nextForcedScrollPosition
}

export function peekNextScrollRestore() {
  return nextForcedScrollPosition
}

function resolveMaxScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { maxLeft: 0, maxTop: 0 }
  }
  const doc = document.documentElement
  const body = document.body
  const viewportWidth = Number(window.innerWidth) || 0
  const viewportHeight = Number(window.innerHeight) || 0
  const maxLeft = Math.max(
    0,
    (Number(doc?.scrollWidth) || 0) - viewportWidth,
    (Number(body?.scrollWidth) || 0) - viewportWidth,
  )
  const maxTop = Math.max(
    0,
    (Number(doc?.scrollHeight) || 0) - viewportHeight,
    (Number(body?.scrollHeight) || 0) - viewportHeight,
  )
  return { maxLeft, maxTop }
}

function isScrollRestored(target) {
  return Math.abs(window.scrollX - target.left) <= 2 && Math.abs(window.scrollY - target.top) <= 2
}

function applyScrollPosition(sequenceId, target, retriesLeft) {
  if (typeof window === 'undefined' || sequenceId !== restoreSequence) return
  const { maxLeft, maxTop } = resolveMaxScroll()
  const clamped = clampScrollPosition(target, maxLeft, maxTop)
  window.scrollTo(clamped.left, clamped.top)
  if (isScrollRestored(clamped) || retriesLeft <= 0) return
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      applyScrollPosition(sequenceId, target, retriesLeft - 1)
    })
  }, 60)
}

export function queueDeferredScrollRestore(position) {
  if (nextForcedScrollPosition) {
    pendingScrollPosition = nextForcedScrollPosition
    nextForcedScrollPosition = null
    return pendingScrollPosition
  }
  pendingScrollPosition = normalizeScrollPosition(position)
  return pendingScrollPosition
}

export function flushDeferredScrollRestore() {
  const target = pendingScrollPosition
  pendingScrollPosition = null
  if (typeof window === 'undefined' || !target) return null
  const sequenceId = ++restoreSequence
  const { maxLeft, maxTop } = resolveMaxScroll()
  const clamped = clampScrollPosition(target, maxLeft, maxTop)
  // Restore immediately so the new route renders at the intended position.
  window.scrollTo(clamped.left, clamped.top)
  window.requestAnimationFrame(() => {
    applyScrollPosition(sequenceId, target, 10)
  })
  return clamped
}

export function resetRouteScrollStateForTests() {
  pendingScrollPosition = null
  nextForcedScrollPosition = null
  homeScrollMemory = null
  restoreSequence = 0
}

if (typeof window !== 'undefined') {
  window.__STRAWMB_ROUTE_SCROLL__ = {
    rememberHomeScrollPosition,
    getRememberedHomeScrollPosition,
    setNextScrollRestore,
    queueDeferredScrollRestore,
    flushDeferredScrollRestore,
  }
}
