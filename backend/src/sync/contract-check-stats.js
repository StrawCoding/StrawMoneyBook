import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function createEmptyStats() {
  return {
    version: 1,
    totals: { runs: 0, failures: 0 },
    byCode: {
      portal_changed: 0,
      captcha: 0,
      auth: 0,
      timeout: 0,
      unknown: 0,
    },
    lastRun: null,
    lastAlert: null,
  }
}

export function loadStats(statsPath) {
  try {
    const parsed = JSON.parse(readFileSync(statsPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return createEmptyStats()
    const empty = createEmptyStats()
    return {
      ...empty,
      ...parsed,
      totals: { ...empty.totals, ...(parsed.totals ?? {}) },
      byCode: { ...empty.byCode, ...(parsed.byCode ?? {}) },
    }
  } catch {
    return createEmptyStats()
  }
}

export function saveStats(statsPath, stats) {
  mkdirSync(dirname(statsPath), { recursive: true })
  writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8')
}

function incrementCodes(stats, checks = []) {
  const byCode = { ...stats.byCode }
  for (const check of checks) {
    const code = check?.failureCode
    if (!code) continue
    byCode[code] = Number(byCode[code] ?? 0) + 1
  }
  return byCode
}

export function recordContractCheckRun(stats, runResult) {
  const checks = Array.isArray(runResult?.checks) ? runResult.checks : []
  const failedChecks = checks.filter((check) => !check.ok)
  return {
    ...stats,
    totals: {
      runs: Number(stats.totals?.runs ?? 0) + 1,
      failures: Number(stats.totals?.failures ?? 0) + (runResult.ok ? 0 : 1),
    },
    byCode: incrementCodes(stats, failedChecks),
    lastRun: {
      at: runResult.checkedAt ?? new Date().toISOString(),
      ok: Boolean(runResult.ok),
      checks: checks.map(({ target, ok, failureCode }) => ({ target, ok, failureCode: failureCode ?? null })),
    },
  }
}

export function markAlertSent(stats, signature, at = new Date().toISOString()) {
  return {
    ...stats,
    lastAlert: { at, signature },
  }
}

export function buildFailureSignature(checks = []) {
  return checks
    .filter((check) => !check.ok && check.failureCode)
    .map((check) => `${check.target}:${check.failureCode}`)
    .sort()
    .join('|')
}
