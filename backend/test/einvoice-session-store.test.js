import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearAllSessions,
  createSessionRecord,
  deleteSessionRecord,
  getSessionRecord,
  releaseSessionRecord,
} from '../src/einvoice/session-store.js'

test.afterEach(() => {
  clearAllSessions()
})

test('SMB-265: deleting a captcha session releases attached resources', async () => {
  const cleanupCalls = []
  createSessionRecord('session-cleanup-delete', {
    cleanup: async (_record, reason) => {
      cleanupCalls.push(reason)
    },
  })

  await releaseSessionRecord('session-cleanup-delete', 'cancelled')

  assert.deepEqual(cleanupCalls, ['cancelled'])
  assert.equal(getSessionRecord('session-cleanup-delete'), null)
})

test('SMB-265: TTL purge releases attached resources', async () => {
  const cleanupCalls = []
  createSessionRecord('session-cleanup-ttl', {
    ttlMs: 1,
    cleanup: async (_record, reason) => {
      cleanupCalls.push(reason)
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(getSessionRecord('session-cleanup-ttl'), null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(cleanupCalls, ['expired'])
})

test('SMB-265: legacy synchronous delete still triggers cleanup', async () => {
  const cleanupCalls = []
  createSessionRecord('session-cleanup-sync-delete', {
    cleanup: async (_record, reason) => {
      cleanupCalls.push(reason)
    },
  })

  assert.equal(deleteSessionRecord('session-cleanup-sync-delete'), true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(cleanupCalls, ['deleted'])
})
