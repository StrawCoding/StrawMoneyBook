export const POST_SETUP_INTRO_STORAGE_KEY = 'straw.post_setup_intro'
export const POST_SETUP_INTRO_STATE_PENDING = 'pending'
export const POST_SETUP_INTRO_STATE_COMPLETED = 'completed'

function getStorage(storageRef) {
  if (storageRef) return storageRef
  if (typeof window === 'undefined') return null
  return window.localStorage ?? null
}

export function readPostSetupIntroState({ storageRef } = {}) {
  try {
    const storage = getStorage(storageRef)
    if (!storage) return ''
    const value = String(storage.getItem(POST_SETUP_INTRO_STORAGE_KEY) ?? '').trim()
    if (value === POST_SETUP_INTRO_STATE_PENDING || value === POST_SETUP_INTRO_STATE_COMPLETED) {
      return value
    }
    return ''
  } catch {
    return ''
  }
}

export function isPostSetupIntroPending(options = {}) {
  return readPostSetupIntroState(options) === POST_SETUP_INTRO_STATE_PENDING
}

export function markPostSetupIntroPending({ storageRef } = {}) {
  try {
    const storage = getStorage(storageRef)
    if (!storage) return POST_SETUP_INTRO_STATE_PENDING
    storage.setItem(POST_SETUP_INTRO_STORAGE_KEY, POST_SETUP_INTRO_STATE_PENDING)
    return POST_SETUP_INTRO_STATE_PENDING
  } catch {
    return POST_SETUP_INTRO_STATE_PENDING
  }
}

export function completePostSetupIntro({ storageRef } = {}) {
  try {
    const storage = getStorage(storageRef)
    if (!storage) return POST_SETUP_INTRO_STATE_COMPLETED
    storage.setItem(POST_SETUP_INTRO_STORAGE_KEY, POST_SETUP_INTRO_STATE_COMPLETED)
    return POST_SETUP_INTRO_STATE_COMPLETED
  } catch {
    return POST_SETUP_INTRO_STATE_COMPLETED
  }
}
