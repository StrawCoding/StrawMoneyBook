let pendingScrollPosition = null
let restoreSequence = 0

function normalizeScrollPosition(position) {
  if (!position || typeof position !== 'object') return null
  return {
    left: Math.max(0, Number(position.left) || 0),
    top: Math.max(0, Number(position.top) || 0),
  }
}

function isScrollRestored(target) {
  return Math.abs(window.scrollX - target.left) <= 2 && Math.abs(window.scrollY - target.top) <= 2
}

function applyScrollPosition(sequenceId, target, retriesLeft) {
  if (typeof window === 'undefined' || sequenceId !== restoreSequence) return
  window.scrollTo(target.left, target.top)
  if (isScrollRestored(target) || retriesLeft <= 0) return
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      applyScrollPosition(sequenceId, target, retriesLeft - 1)
    })
  }, 60)
}

export function queueDeferredScrollRestore(position) {
  pendingScrollPosition = normalizeScrollPosition(position)
}

export function flushDeferredScrollRestore() {
  if (typeof window === 'undefined') return
  const target = pendingScrollPosition
  pendingScrollPosition = null
  if (!target) return
  const sequenceId = ++restoreSequence
  // Restore immediately so the new route renders at the intended position.
  window.scrollTo(target.left, target.top)
  window.requestAnimationFrame(() => {
    applyScrollPosition(sequenceId, target, 10)
  })
}
