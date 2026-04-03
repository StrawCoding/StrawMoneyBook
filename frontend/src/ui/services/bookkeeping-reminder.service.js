import { Capacitor } from '@capacitor/core'

const BOOKKEEPING_REMINDER_KEY = 'bookkeeping.reminder.settings.v1'
const BOOKKEEPING_REMINDER_CHANNEL_ID = 'bookkeeping-reminder'
const DEFAULT_REMINDER_HOUR = 21
const DEFAULT_REMINDER_MINUTE = 0
const FALLBACK_LEDGER_TIME_ZONE = 'Asia/Taipei'
const DEFAULT_REMINDER_PLUGIN_TIMEOUT_MS = 8000
const DEFAULT_REMINDER_OPERATION_TIMEOUT_MS = 12000

const defaultDependencies = {
  async getSetting(...args) {
    const mod = await import('../../core/repositories/settings.repo.js')
    return mod.getSetting(...args)
  },
  async setSetting(...args) {
    const mod = await import('../../core/repositories/settings.repo.js')
    return mod.setSetting(...args)
  },
  async getLedger(...args) {
    const mod = await import('../../core/repositories/ledger.repo.js')
    return mod.getLedger(...args)
  },
  async listLedgers(...args) {
    const mod = await import('../../core/repositories/ledger.repo.js')
    return mod.listLedgers(...args)
  },
  async listTransactionOccurredAtValues(...args) {
    const mod = await import('../../core/repositories/transaction.repo.js')
    return mod.listTransactionOccurredAtValues(...args)
  },
  getPlatform() {
    return Capacitor.getPlatform()
  },
  async getLocalNotifications() {
    const mod = await import('@capacitor/local-notifications')
    return mod.LocalNotifications
  },
  notificationTimeoutMs: DEFAULT_REMINDER_PLUGIN_TIMEOUT_MS,
  operationTimeoutMs: DEFAULT_REMINDER_OPERATION_TIMEOUT_MS,
}

const dependencies = { ...defaultDependencies }

export function setBookkeepingReminderDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetBookkeepingReminderDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

function assertLedgerId(ledgerId) {
  if (!String(ledgerId ?? '').trim()) {
    throw new Error('缺少帳本 ID')
  }
}

function normalizeHour(value) {
  const hour = Math.trunc(Number(value))
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return DEFAULT_REMINDER_HOUR
  return hour
}

function normalizeMinute(value) {
  const minute = Math.trunc(Number(value))
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return DEFAULT_REMINDER_MINUTE
  return minute
}

function normalizeTimeZone(value) {
  const timeZone = String(value ?? '').trim()
  if (!timeZone) return FALLBACK_LEDGER_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return FALLBACK_LEDGER_TIME_ZONE
  }
}

function toDateKeyInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

function toDayNumber(dateKey) {
  const matched = String(dateKey ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  return Math.trunc(Date.UTC(year, month - 1, day) / 86400000)
}

function countLeadingStreak(dateKeys = []) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0
  let streak = 1
  let previousDayNumber = toDayNumber(dateKeys[0])
  if (previousDayNumber == null) return 0

  for (let index = 1; index < dateKeys.length; index += 1) {
    const currentDayNumber = toDayNumber(dateKeys[index])
    if (currentDayNumber == null) break
    if (previousDayNumber - currentDayNumber !== 1) break
    streak += 1
    previousDayNumber = currentDayNumber
  }

  return streak
}

function countBestStreak(dateKeys = []) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0
  let best = 0
  let current = 0
  let previousDayNumber = null

  for (const dateKey of dateKeys) {
    const dayNumber = toDayNumber(dateKey)
    if (dayNumber == null) continue
    if (previousDayNumber == null || previousDayNumber - dayNumber === 1) {
      current += 1
    } else {
      current = 1
    }
    if (current > best) best = current
    previousDayNumber = dayNumber
  }

  return best
}

function buildReminderBody(ledgerName) {
  const resolvedLedgerName = String(ledgerName ?? '').trim() || '目前帳本'
  return `別忘了為「${resolvedLedgerName}」補上今天的收支。`
}

function buildReminderNotificationId(ledgerId) {
  const source = String(ledgerId ?? '')
  let hash = 0
  for (const char of source) {
    hash = ((hash * 31) + char.charCodeAt(0)) | 0
  }
  return 600000000 + Math.abs(hash % 300000000)
}

function isBookkeepingReminderNotification(notification) {
  return String(notification?.extra?.type ?? '') === 'bookkeeping_reminder'
}

function getReminderPluginTimeoutMs() {
  const timeoutMs = Math.trunc(Number(dependencies.notificationTimeoutMs))
  return Number.isInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_REMINDER_PLUGIN_TIMEOUT_MS
}

function getReminderOperationTimeoutMs() {
  const timeoutMs = Math.trunc(Number(dependencies.operationTimeoutMs))
  return Number.isInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_REMINDER_OPERATION_TIMEOUT_MS
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  let timeoutId = null
  const timeoutTask = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([Promise.resolve(task), timeoutTask]).finally(() => {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
  })
}

function withReminderPluginTimeout(task, timeoutMessage) {
  return withTimeout(task, getReminderPluginTimeoutMs(), timeoutMessage)
}

function withReminderOperationTimeout(task, timeoutMessage) {
  return withTimeout(task, getReminderOperationTimeoutMs(), timeoutMessage)
}

let reminderSyncQueue = Promise.resolve()
let inFlightAllLedgersReminderSyncTask = null

function enqueueSerializedReminderSync(task) {
  const taskPromise = reminderSyncQueue
    .catch(() => {})
    .then(task)
  reminderSyncQueue = taskPromise.catch(() => {})
  return taskPromise
}

function waitForSerializedReminderSync(taskPromise, timeoutMessage) {
  return withReminderOperationTimeout(taskPromise, timeoutMessage)
}

async function resolveNotificationPermission(plugin, requestPermission = false) {
  let permission = await withReminderPluginTimeout(
    plugin.checkPermissions(),
    '檢查記帳提醒權限逾時，請稍後再試',
  )
  let display = String(permission?.display ?? '')

  if (display !== 'granted' && requestPermission) {
    permission = await withReminderPluginTimeout(
      plugin.requestPermissions(),
      '要求記帳提醒權限逾時，請稍後再試',
    )
    display = String(permission?.display ?? display)
  }

  return display === 'granted' ? 'granted' : 'denied'
}

async function ensureReminderChannel(plugin) {
  if (dependencies.getPlatform() !== 'android') return
  await withReminderPluginTimeout(
    plugin.createChannel({
      id: BOOKKEEPING_REMINDER_CHANNEL_ID,
      name: '記帳提醒',
      description: '每日記帳提醒通知',
      importance: 3,
    }),
    '建立記帳提醒通知頻道逾時，請稍後再試',
  ).catch(() => {})
}

export function normalizeBookkeepingReminderSettings(raw) {
  return {
    enabled: Boolean(raw?.enabled),
    hour: normalizeHour(raw?.hour),
    minute: normalizeMinute(raw?.minute),
  }
}

export async function getBookkeepingReminderSettings(ledgerId) {
  assertLedgerId(ledgerId)
  const stored = await withReminderOperationTimeout(
    dependencies.getSetting(ledgerId, BOOKKEEPING_REMINDER_KEY),
    '讀取記帳提醒設定逾時，請稍後再試',
  )
  return normalizeBookkeepingReminderSettings(stored)
}

export async function saveBookkeepingReminderSettings(ledgerId, settings) {
  assertLedgerId(ledgerId)
  const normalized = normalizeBookkeepingReminderSettings(settings)
  await withReminderOperationTimeout(
    dependencies.setSetting(ledgerId, BOOKKEEPING_REMINDER_KEY, normalized),
    '儲存記帳提醒設定逾時，請稍後再試',
  )
  return normalized
}

async function syncBookkeepingReminderForLedgerInternal(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const platform = dependencies.getPlatform()
  const normalizedLedgerId = String(ledgerId).trim()
  const settings = await getBookkeepingReminderSettings(normalizedLedgerId)
  const notificationId = buildReminderNotificationId(normalizedLedgerId)

  if (platform === 'web') {
    return {
      ledgerId: normalizedLedgerId,
      notificationId,
      settings,
      permission: 'unsupported',
      status: settings.enabled ? 'unsupported' : 'disabled',
    }
  }

  const plugin = await withReminderOperationTimeout(
    dependencies.getLocalNotifications(),
    '載入記帳提醒通知模組逾時，請稍後再試',
  )
  await withReminderPluginTimeout(
    plugin.cancel({ notifications: [{ id: notificationId }] }),
    '取消舊的記帳提醒逾時，請稍後再試',
  ).catch(() => {})

  if (!settings.enabled) {
    return {
      ledgerId: normalizedLedgerId,
      notificationId,
      settings,
      permission: 'not_required',
      status: 'disabled',
    }
  }

  const permission = options.permission ?? await resolveNotificationPermission(plugin, options.requestPermission === true)
  if (permission !== 'granted') {
    return {
      ledgerId: normalizedLedgerId,
      notificationId,
      settings,
      permission,
      status: 'permission_denied',
    }
  }

  const ledger = await withReminderOperationTimeout(
    dependencies.getLedger(normalizedLedgerId),
    '讀取帳本資料逾時，請稍後再試',
  )
  await ensureReminderChannel(plugin)
  await withReminderPluginTimeout(
    plugin.schedule({
      notifications: [
        {
          id: notificationId,
          title: '記帳提醒',
          body: buildReminderBody(ledger?.name),
          schedule: {
            on: {
              hour: settings.hour,
              minute: settings.minute,
            },
            allowWhileIdle: true,
          },
          channelId: BOOKKEEPING_REMINDER_CHANNEL_ID,
          autoCancel: true,
          extra: {
            type: 'bookkeeping_reminder',
            ledgerId: normalizedLedgerId,
          },
        },
      ],
    }),
    '同步記帳提醒排程逾時，請稍後再試',
  )

  return {
    ledgerId: normalizedLedgerId,
    notificationId,
    settings,
    permission,
    status: 'scheduled',
  }
}

export async function syncBookkeepingReminderForLedger(ledgerId, options = {}) {
  const taskPromise = enqueueSerializedReminderSync(
    () => syncBookkeepingReminderForLedgerInternal(ledgerId, options),
  )
  return waitForSerializedReminderSync(taskPromise, '同步記帳提醒逾時，請稍後再試')
}

async function syncBookkeepingRemindersForAllLedgersInternal(options = {}) {
  const platform = dependencies.getPlatform()
  if (platform === 'web') {
    return {
      permission: 'unsupported',
      results: [],
      scheduledCount: 0,
      canceledCount: 0,
      status: 'unsupported',
    }
  }

  const plugin = await withReminderOperationTimeout(
    dependencies.getLocalNotifications(),
    '載入記帳提醒通知模組逾時，請稍後再試',
  )
  const permission = await resolveNotificationPermission(plugin, options.requestPermission === true)
  const ledgers = (await withReminderOperationTimeout(
    dependencies.listLedgers(),
    '讀取帳本清單逾時，請稍後再試',
  )).filter((ledger) => Number(ledger?.is_archived ?? 0) !== 1)
  const pending = await withReminderPluginTimeout(
    plugin.getPending(),
    '讀取目前記帳提醒排程逾時，請稍後再試',
  ).catch(() => ({ notifications: [] }))
  const reminderPendingNotifications = Array.isArray(pending?.notifications)
    ? pending.notifications.filter(isBookkeepingReminderNotification)
    : []

  if (reminderPendingNotifications.length > 0) {
    await withReminderPluginTimeout(
      plugin.cancel({
        notifications: reminderPendingNotifications.map((notification) => ({ id: notification.id })),
      }),
      '清除舊的記帳提醒排程逾時，請稍後再試',
    ).catch(() => {})
  }

  const results = []
  for (const ledger of ledgers) {
    const result = await syncBookkeepingReminderForLedgerInternal(ledger.id, {
      permission,
      requestPermission: false,
    })
    results.push(result)
  }

  return {
    permission,
    results,
    scheduledCount: results.filter((item) => item.status === 'scheduled').length,
    canceledCount: reminderPendingNotifications.length,
    status: permission === 'granted' ? 'scheduled' : 'permission_denied',
  }
}

export async function syncBookkeepingRemindersForAllLedgers(options = {}) {
  if (!inFlightAllLedgersReminderSyncTask) {
    const taskPromise = enqueueSerializedReminderSync(
      () => syncBookkeepingRemindersForAllLedgersInternal(options),
    )
    const sharedTaskPromise = taskPromise.finally(() => {
      if (inFlightAllLedgersReminderSyncTask === sharedTaskPromise) {
        inFlightAllLedgersReminderSyncTask = null
      }
    })
    inFlightAllLedgersReminderSyncTask = sharedTaskPromise
  }

  return waitForSerializedReminderSync(
    inFlightAllLedgersReminderSyncTask,
    '同步全部帳本記帳提醒逾時，請稍後再試',
  )
}

export async function getBookkeepingAchievement(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const normalizedLedgerId = String(ledgerId).trim()
  const ledger = await withReminderOperationTimeout(
    dependencies.getLedger(normalizedLedgerId),
    '讀取帳本資料逾時，請稍後再試',
  )
  const timeZone = normalizeTimeZone(ledger?.timezone)
  const occurredAtValues = await withReminderOperationTimeout(
    dependencies.listTransactionOccurredAtValues(normalizedLedgerId),
    '讀取記帳成就資料逾時，請稍後再試',
  )
  const seenDateKeys = new Set()
  const dateKeys = []

  for (const occurredAt of occurredAtValues) {
    const dateKey = toDateKeyInTimeZone(occurredAt, timeZone)
    if (!dateKey || seenDateKeys.has(dateKey)) continue
    seenDateKeys.add(dateKey)
    dateKeys.push(dateKey)
  }

  dateKeys.sort((left, right) => right.localeCompare(left))

  const latestDateKey = dateKeys[0] ?? ''
  const todayDateKey = toDateKeyInTimeZone(options.now ?? new Date(), timeZone)
  const todayDayNumber = toDayNumber(todayDateKey)
  const latestDayNumber = toDayNumber(latestDateKey)
  const currentStreak = latestDayNumber != null && todayDayNumber != null && (
    latestDayNumber === todayDayNumber || latestDayNumber === todayDayNumber - 1
  )
    ? countLeadingStreak(dateKeys)
    : 0

  return {
    currentStreak,
    bestStreak: countBestStreak(dateKeys),
    totalBookkeepingDays: dateKeys.length,
    lastBookkeepingDate: latestDateKey,
    timeZone,
  }
}
