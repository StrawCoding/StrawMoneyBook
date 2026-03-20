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
