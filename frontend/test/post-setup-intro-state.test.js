import test from 'node:test'
import assert from 'node:assert/strict'

import {
  completePostSetupIntro,
  isPostSetupIntroPending,
  markPostSetupIntroPending,
  POST_SETUP_INTRO_STATE_COMPLETED,
  POST_SETUP_INTRO_STORAGE_KEY,
  readPostSetupIntroState,
} from '../src/ui/services/post-setup-intro.service.js'

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('marks post-setup intro as pending after setup completion', () => {
  const storageRef = createStorage()

  markPostSetupIntroPending({ storageRef })

  assert.equal(isPostSetupIntroPending({ storageRef }), true)
})

test('completes the intro after the user finishes onboarding', () => {
  const storageRef = createStorage()

  markPostSetupIntroPending({ storageRef })
  completePostSetupIntro({ storageRef })

  assert.equal(readPostSetupIntroState({ storageRef }), POST_SETUP_INTRO_STATE_COMPLETED)
  assert.equal(isPostSetupIntroPending({ storageRef }), false)
  assert.equal(storageRef.getItem(POST_SETUP_INTRO_STORAGE_KEY), POST_SETUP_INTRO_STATE_COMPLETED)
})
