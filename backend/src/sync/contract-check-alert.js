import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildFailureSignature } from './contract-check-stats.js'

const DEFAULT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

export function shouldSendPlaneAlert(stats, runResult, options = {}) {
  const failedChecks = (runResult?.checks ?? []).filter((check) => !check.ok)
  if (failedChecks.length === 0) return false

  const signature = buildFailureSignature(failedChecks)
  const minIntervalMs = Number(options.minIntervalMs) > 0
    ? Number(options.minIntervalMs)
    : DEFAULT_MIN_INTERVAL_MS
  const now = Number(options.now) > 0 ? Number(options.now) : Date.now()
  const lastAlert = stats?.lastAlert
  if (!lastAlert?.at) return true
  if (lastAlert.signature !== signature) return true
  const lastAt = Date.parse(lastAlert.at)
  if (!Number.isFinite(lastAt)) return true
  return now - lastAt >= minIntervalMs
}

export function buildAlertMessage(runResult) {
  const failed = (runResult.checks ?? []).filter((check) => !check.ok)
  const lines = [
    '🚨 StrawMoneyBook 同步合約自檢失敗',
    '',
    `時間：${runResult.checkedAt ?? new Date().toISOString()}`,
    '',
    '## 失敗項目',
    ...failed.map((check) => `- ${check.target}: \`${check.failureCode ?? 'unknown'}\``),
    '',
    '## 累計分類統計',
    ...Object.entries(runResult.stats?.byCode ?? {}).map(([code, count]) => `- ${code}: ${count}`),
    '',
    `最近 ${runResult.stats?.totals?.runs ?? 0} 次執行中，${runResult.stats?.totals?.failures ?? 0} 次失敗。`,
    '',
    'log: https://log.wastebase.xyz/issues/SMB-253',
  ]
  return lines.join('\n')
}

export function appendAlertLog(logPath, message) {
  mkdirSync(dirname(logPath), { recursive: true })
  const stamp = new Date().toISOString()
  appendFileSync(logPath, `\n[contract-check] ${stamp}\n${message}\n`, 'utf8')
}
