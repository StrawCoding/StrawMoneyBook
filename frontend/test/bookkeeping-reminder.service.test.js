import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getBookkeepingAchievement,
  resetBookkeepingReminderDependenciesForTest,
  saveBookkeepingReminderSettings,
  setBookkeepingReminderDependenciesForTest,
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
