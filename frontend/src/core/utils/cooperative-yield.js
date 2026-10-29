export async function yieldToMainThread() {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    return
  }

  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

/**
 * Wait until the browser reports idle time (or timeout) so heavy work can defer behind UI/paint.
 */
export function scheduleWhenUiIdle(timeoutMs = 2000) {
  const timeout = Math.max(0, Number(timeoutMs) || 0)
  const win = typeof globalThis.window !== 'undefined' ? globalThis.window : null
  if (win && typeof win.requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      win.requestIdleCallback(() => resolve(), { timeout })
    })
  }
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}
