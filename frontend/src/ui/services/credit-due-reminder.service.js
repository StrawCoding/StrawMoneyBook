import { Capacitor } from '@capacitor/core'
import { translateMessage } from './i18n.service.js'
import { CREDIT_DUE_REMINDER_SETTING_KEY, loadCreditCardDashboard } from '@/core/services/credit.service'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { getLedger } from '@/core/repositories/ledger.repo'
import { listLedgers } from '@/core/repositories/ledger.repo'
import { normalizeLedgerTimeZone } from '@/core/services/budget-period'

const t = (key, params, fallback) => translateMessage(key, params, fallback)
const CHANNEL_ID = 'credit-due-reminder'
const REMINDER_HOUR = 9
const REMINDER_MINUTE = 0

function assertLedgerId(ledgerId) {
  if (!String(ledgerId ?? '').trim()) {
    throw new Error(t('common.missing_ledger_id', '缺少帳本 ID'))
  }
}

export async function getCreditDueReminderSettings(ledgerId) {
  assertLedgerId(ledgerId)
  const raw = await getSetting(ledgerId, CREDIT_DUE_REMINDER_SETTING_KEY)
  if (raw && typeof raw === 'object') {
    return { enabled: Boolean(raw.enabled) }
  }
  return { enabled: false }
}

export async function setCreditDueReminderSettings(ledgerId, patch = {}) {
  assertLedgerId(ledgerId)
  const current = await getCreditDueReminderSettings(ledgerId)
  const next = { ...current, ...patch }
  await setSetting(ledgerId, CREDIT_DUE_REMINDER_SETTING_KEY, next)
  return next
}

function notificationIdForStatement(statementId, kind) {
  let h = 0
  const s = `${kind}:${statementId}`
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 2000000000 + 50000
}

function parseDueDate(dueOn) {
  const m = String(dueOn ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), REMINDER_HOUR, REMINDER_MINUTE, 0, 0)
}

function scheduleAt(date) {
  if (!date || Number.isNaN(date.getTime())) return null
  const now = Date.now()
  if (date.getTime() <= now) return null
  return { at: date }
}

async function getNotificationsPlugin() {
  if (Capacitor.getPlatform() === 'web') return null
  const mod = await import('@capacitor/local-notifications')
  return mod.LocalNotifications
}

export async function syncCreditDueRemindersForLedger(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const platform = Capacitor.getPlatform()
  const settings = await getCreditDueReminderSettings(ledgerId)
  if (platform === 'web') {
    return { status: settings.enabled ? 'unsupported' : 'disabled', scheduled: 0 }
  }

  const plugin = await getNotificationsPlugin()
  if (!plugin) {
    return { status: 'unsupported', scheduled: 0 }
  }

  const pending = await plugin.getPending().catch(() => ({ notifications: [] }))
  const toCancel = (pending?.notifications ?? []).filter((n) => n?.extra?.type === 'credit_due_reminder' && n?.extra?.ledgerId === ledgerId)
  if (toCancel.length) {
    await plugin.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) }).catch(() => {})
  }

  if (!settings.enabled) {
    return { status: 'disabled', scheduled: 0 }
  }

  if (options.requestPermission === true) {
    const perm = await plugin.requestPermissions()
    if (perm?.display !== 'granted') {
      return { status: 'permission_denied', scheduled: 0 }
    }
  } else {
    const perm = await plugin.checkPermissions()
    if (perm?.display !== 'granted') {
      return { status: 'permission_denied', scheduled: 0 }
    }
  }

  try {
    await plugin.createChannel({
      id: CHANNEL_ID,
      name: t('credit_due_reminder.channel_name', '信用卡繳款提醒'),
      importance: 4,
      visibility: 1,
    })
  } catch {
    // channel may exist
  }

  const ledger = await getLedger(ledgerId)
  const tz = normalizeLedgerTimeZone(ledger?.timezone)
  void tz

  const dashboard = await loadCreditCardDashboard(ledgerId)
  const notifications = []
  for (const card of dashboard.cards ?? []) {
    for (const st of card.statements ?? []) {
      if (!st.due_on || Number(st.remaining_minor ?? 0) <= 0) continue
      if (st.status !== 'closed' && st.status !== 'open') continue
      const due = parseDueDate(st.due_on)
      if (!due) continue
      const dayBefore = new Date(due)
      dayBefore.setDate(dayBefore.getDate() - 1)
      const schedules = [
        { kind: 'due_eve', date: dayBefore },
        { kind: 'due_day', date: due },
      ]
      for (const item of schedules) {
        const schedule = scheduleAt(item.date)
        if (!schedule) continue
        notifications.push({
          id: notificationIdForStatement(st.id, item.kind),
          title: t('credit_due_reminder.notification.title', '信用卡繳款提醒'),
          body: t('credit_due_reminder.notification.body', {
            name: card.account?.name ?? '',
            due: st.due_on,
          }, `${card.account?.name ?? '信用卡'} 繳款日 ${st.due_on}`),
          schedule,
          channelId: CHANNEL_ID,
          extra: {
            type: 'credit_due_reminder',
            ledgerId,
            statementId: st.id,
            accountId: card.account?.id,
          },
        })
      }
    }
  }

  if (notifications.length) {
    await plugin.schedule({ notifications })
  }
  return { status: 'scheduled', scheduled: notifications.length }
}

export async function syncCreditDueRemindersForAllLedgers(options = {}) {
  if (Capacitor.getPlatform() === 'web') {
    return { results: [], scheduledCount: 0, status: 'unsupported' }
  }
  const ledgers = (await listLedgers()).filter((l) => Number(l?.is_archived ?? 0) !== 1)
  const results = []
  let scheduledCount = 0
  for (const ledger of ledgers) {
    const result = await syncCreditDueRemindersForLedger(ledger.id, options)
    results.push({ ledgerId: ledger.id, ...result })
    scheduledCount += Number(result.scheduled ?? 0)
  }
  return { results, scheduledCount, status: 'ok' }
}
