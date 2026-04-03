import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getBookkeepingAchievement,
  resetBookkeepingReminderDependenciesForTest,
  saveBookkeepingReminderSettings,
  setBookkeepingReminderDependenciesForTest,
  syncBookkeepingReminderForLedger,
  syncBookkeepingRemindersForAllLedgers,
} from '../src/ui/services/bookkeeping-reminder.service.js'

test.afterEach(() => {
  resetBookkeepingReminderDependenciesForTest()
})

test('bookkeeping achievement counts consecutive days by ledger timezone', async () => {
  setBookkeepingReminderDependenciesForTest({
    async getLedger() {
      return { timezone: 'Asia/Taipei' }
    },
    async listTransactionOccurredAtValues() {
      return [
        '2026-04-02T13:00:00.000Z',
        '2026-04-01T13:00:00.000Z',
        '2026-03-31T13:00:00.000Z',
        '2026-03-29T13:00:00.000Z',
        '2026-03-29T01:00:00.000Z',
      ]
    },
  })

  const stats = await getBookkeepingAchievement('ledger_alpha', {
    now: new Date('2026-04-03T04:00:00.000Z'),
  })

  assert.equal(stats.currentStreak, 3)
  assert.equal(stats.bestStreak, 3)
  assert.equal(stats.totalBookkeepingDays, 4)
  assert.equal(stats.lastBookkeepingDate, '2026-04-02')
})

test('syncBookkeepingRemindersForAllLedgers cancels stale reminders and schedules enabled ledgers', async () => {
  const savedSettings = new Map()
  const canceledIds = []
  const scheduledNotifications = []
  const createdChannels = []

  setBookkeepingReminderDependenciesForTest({
    getPlatform() {
      return 'android'
    },
    async getSetting(ledgerId) {
      return savedSettings.get(ledgerId) ?? null
    },
    async setSetting(ledgerId, _key, value) {
      savedSettings.set(ledgerId, value)
    },
    async listLedgers() {
      return [
        { id: 'ledger_alpha', name: '個人帳本', is_archived: 0 },
        { id: 'ledger_beta', name: '家庭帳本', is_archived: 0 },
      ]
    },
    async getLedger(ledgerId) {
      return { id: ledgerId, name: ledgerId === 'ledger_alpha' ? '個人帳本' : '家庭帳本', timezone: 'Asia/Taipei' }
    },
    async listTransactionOccurredAtValues() {
      return []
    },
    async getLocalNotifications() {
      return {
        async checkPermissions() {
          return { display: 'granted' }
        },
        async requestPermissions() {
          return { display: 'granted' }
        },
        async getPending() {
          return {
            notifications: [
              { id: 11, extra: { type: 'bookkeeping_reminder', ledgerId: 'removed_ledger' } },
            ],
          }
        },
        async cancel({ notifications }) {
          canceledIds.push(...notifications.map((item) => item.id))
        },
        async schedule({ notifications }) {
          scheduledNotifications.push(...notifications)
        },
        async createChannel(channel) {
          createdChannels.push(channel.id)
        },
      }
    },
  })

  await saveBookkeepingReminderSettings('ledger_alpha', { enabled: true, hour: 20, minute: 30 })
  await saveBookkeepingReminderSettings('ledger_beta', { enabled: false, hour: 9, minute: 0 })
  const summary = await syncBookkeepingRemindersForAllLedgers()

  assert.equal(summary.permission, 'granted')
  assert.equal(summary.canceledCount, 1)
  assert.equal(summary.scheduledCount, 1)
  assert.equal(canceledIds[0], 11)
  assert.equal(canceledIds.length, 3)
  assert.equal(createdChannels.includes('bookkeeping-reminder'), true)
  assert.equal(scheduledNotifications.length, 1)
  assert.equal(scheduledNotifications[0].title, '記帳提醒')
  assert.deepEqual(scheduledNotifications[0].schedule.on, { hour: 20, minute: 30 })
  assert.deepEqual(summary.results.map((item) => item.status), ['scheduled', 'disabled'])
})

test('syncBookkeepingReminderForLedger fails fast when the local notification plugin does not respond', async () => {
  setBookkeepingReminderDependenciesForTest({
    notificationTimeoutMs: 10,
    getPlatform() {
      return 'android'
    },
    async getSetting() {
      return { enabled: true, hour: 21, minute: 0 }
    },
    async getLedger() {
      return { id: 'ledger_alpha', name: '個人帳本', timezone: 'Asia/Taipei' }
    },
    async getLocalNotifications() {
      return {
        checkPermissions() {
          return new Promise(() => {})
        },
        cancel() {
          return Promise.resolve()
        },
        schedule() {
          return Promise.resolve()
        },
        createChannel() {
          return Promise.resolve()
        },
      }
    },
  })

  await assert.rejects(
    () => syncBookkeepingReminderForLedger('ledger_alpha', { requestPermission: true }),
    /檢查記帳提醒權限逾時，請稍後再試/,
  )
})

test('syncBookkeepingReminderForLedger fails fast when loading the local notification plugin stalls', async () => {
  setBookkeepingReminderDependenciesForTest({
    operationTimeoutMs: 10,
    getPlatform() {
      return 'android'
    },
    async getSetting() {
      return { enabled: true, hour: 21, minute: 0 }
    },
    getLocalNotifications() {
      return new Promise(() => {})
    },
  })

  await assert.rejects(
    () => syncBookkeepingReminderForLedger('ledger_alpha', { requestPermission: true }),
    /同步記帳提醒逾時，請稍後再試/,
  )
})

test('syncBookkeepingReminderForLedger does not treat the local notification plugin proxy as a thenable', async () => {
  let cancelCalled = false

  setBookkeepingReminderDependenciesForTest({
    getPlatform() {
      return 'android'
    },
    async getSetting() {
      return { enabled: false, hour: 21, minute: 0 }
    },
    async getLocalNotifications() {
      return {
        plugin: {
        then() {
          throw new Error('LocalNotifications.then() is not implemented on android')
        },
        async cancel() {
          cancelCalled = true
        },
      }
      }
    },
  })

  const result = await syncBookkeepingReminderForLedger('ledger_alpha')

  assert.equal(result.status, 'disabled')
  assert.equal(cancelCalled, true)
})

test('syncBookkeepingReminderForLedger serializes concurrent reminder syncs', async () => {
  const createdChannels = []
  const cancelOrder = []
  let notifyFirstCancelStarted = null
  const firstCancelStarted = new Promise((resolve) => {
    notifyFirstCancelStarted = resolve
  })
  let releaseFirstCancel = null
  const firstCancelPending = new Promise((resolve) => {
    releaseFirstCancel = resolve
  })

  setBookkeepingReminderDependenciesForTest({
    getPlatform() {
      return 'android'
    },
    async getSetting(ledgerId) {
      return ledgerId === 'ledger_alpha'
        ? { enabled: true, hour: 21, minute: 0 }
        : { enabled: true, hour: 22, minute: 30 }
    },
    async getLedger(ledgerId) {
      return { id: ledgerId, name: ledgerId, timezone: 'Asia/Taipei' }
    },
    async getLocalNotifications() {
      return {
        async checkPermissions() {
          return { display: 'granted' }
        },
        async requestPermissions() {
          return { display: 'granted' }
        },
        async cancel({ notifications }) {
          cancelOrder.push(notifications[0]?.id)
          if (cancelOrder.length === 1) {
            notifyFirstCancelStarted()
            await firstCancelPending
          }
        },
        async schedule() {
          return undefined
        },
        async createChannel(channel) {
          createdChannels.push(channel.id)
        },
      }
    },
  })

  const firstSync = syncBookkeepingReminderForLedger('ledger_alpha', { requestPermission: true })
  const secondSync = syncBookkeepingReminderForLedger('ledger_beta', { requestPermission: true })
  await firstCancelStarted

  assert.equal(cancelOrder.length, 1)

  releaseFirstCancel()
  const results = await Promise.all([firstSync, secondSync])

  assert.equal(cancelOrder.length, 2)
  assert.deepEqual(results.map((item) => item.status), ['scheduled', 'scheduled'])
  assert.equal(createdChannels.every((id) => id === 'bookkeeping-reminder'), true)
})

test('syncBookkeepingRemindersForAllLedgers reuses the in-flight full sync task', async () => {
  let pendingCalls = 0
  let releasePending = null
  const pendingGate = new Promise((resolve) => {
    releasePending = resolve
  })

  setBookkeepingReminderDependenciesForTest({
    getPlatform() {
      return 'android'
    },
    async getSetting() {
      return { enabled: false, hour: 21, minute: 0 }
    },
    async listLedgers() {
      return [
        { id: 'ledger_alpha', name: '個人帳本', is_archived: 0 },
      ]
    },
    async getLedger(ledgerId) {
      return { id: ledgerId, name: '個人帳本', timezone: 'Asia/Taipei' }
    },
    async getLocalNotifications() {
      return {
        async checkPermissions() {
          return { display: 'granted' }
        },
        async requestPermissions() {
          return { display: 'granted' }
        },
        async getPending() {
          pendingCalls += 1
          await pendingGate
          return { notifications: [] }
        },
        async cancel() {
          return undefined
        },
        async schedule() {
          return undefined
        },
        async createChannel() {
          return undefined
        },
      }
    },
  })

  const firstSync = syncBookkeepingRemindersForAllLedgers()
  const secondSync = syncBookkeepingRemindersForAllLedgers()

  await new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (pendingCalls === 1) {
        clearInterval(timer)
        resolve()
        return
      }
      if (Date.now() - startedAt > 200) {
        clearInterval(timer)
        reject(new Error(`expected pendingCalls to reach 1, got ${pendingCalls}`))
      }
    }, 0)
  })
  assert.equal(pendingCalls, 1)

  releasePending()
  const [firstResult, secondResult] = await Promise.all([firstSync, secondSync])

  assert.equal(pendingCalls, 1)
  assert.deepEqual(firstResult, secondResult)
  assert.equal(firstResult.scheduledCount, 0)
  assert.equal(firstResult.status, 'scheduled')
})
