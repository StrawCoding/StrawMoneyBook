#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendAlertLog,
  buildAlertMessage,
  shouldSendPlaneAlert,
} from '../src/sync/contract-check-alert.js'
import {
  attachFailureCode,
  classifyBankContractFailure,
  classifyEinvoiceContractFailure,
} from '../src/sync/contract-failure-classifier.js'
import {
  buildFailureSignature,
  loadStats,
  markAlertSent,
  recordContractCheckRun,
  saveStats,
} from '../src/sync/contract-check-stats.js'
import { runEinvoicePortalContractCheck } from './einvoice-portal-contract-check.mjs'
import { runFirstBankPortalContractCheck } from './first-bank-portal-contract-check.mjs'

const backendRoot = fileURLToPath(new URL('..', import.meta.url))
const defaultStatsPath = join(backendRoot, '.server-data/sync-contract-check-stats.json')
const defaultLogPath = join(homedir(), '.hermes/logs/strawmoneybook-autocoder/SMB-253.log')

function getStatsPath() {
  return process.env.SYNC_CONTRACT_STATS_PATH || defaultStatsPath
}

function getAlertLogPath() {
  return process.env.SYNC_CONTRACT_ALERT_LOG_PATH || defaultLogPath
}

function getPlaneIssue() {
  return process.env.SYNC_CONTRACT_ALERT_PLANE_ISSUE || 'SMB-253'
}

function shouldSkipLiveChecks() {
  return ['1', 'true', 'yes'].includes(String(process.env.SYNC_CONTRACT_SKIP_LIVE ?? '').trim().toLowerCase())
}

async function maybePostPlaneComment(message) {
  const issue = getPlaneIssue()
  if (!issue) return { skipped: true, reason: 'no_plane_issue' }
  if (['1', 'true', 'yes'].includes(String(process.env.SYNC_CONTRACT_DISABLE_PLANE_ALERT ?? '').trim().toLowerCase())) {
    return { skipped: true, reason: 'plane_alert_disabled' }
  }

  const commentPath = join('/tmp', `sync-contract-alert-${Date.now()}.md`)
  writeFileSync(commentPath, message, 'utf8')
  try {
    execFileSync('python3', ['/root/.hermes/scripts/plane_work_item.py', 'comment', issue, '--file', commentPath], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return { ok: true, issue }
  } catch (error) {
    return {
      ok: false,
      issue,
      error: String(error?.stdout ?? error?.message ?? error),
    }
  }
}

export async function runSyncContractChecks(options = {}) {
  const skipLive = options.skipLive ?? shouldSkipLiveChecks()
  const checkedAt = new Date().toISOString()
  const checks = []

  if (skipLive) {
    checks.push({
      target: 'einvoice',
      ok: true,
      failureCode: null,
      skipped: true,
    }, {
      target: 'first_bank',
      ok: true,
      failureCode: null,
      skipped: true,
    })
  } else {
    const einvoiceResult = await runEinvoicePortalContractCheck()
    checks.push(attachFailureCode('einvoice', einvoiceResult, classifyEinvoiceContractFailure))

    const bankResult = await runFirstBankPortalContractCheck()
    checks.push(attachFailureCode('first_bank', bankResult, classifyBankContractFailure))
  }

  const ok = checks.every((check) => check.ok)
  let stats = loadStats(getStatsPath())
  stats = recordContractCheckRun(stats, { ok, checkedAt, checks })
  saveStats(getStatsPath(), stats)

  const payload = {
    ok,
    checkedAt,
    checks: checks.map(({ target, ok: checkOk, failureCode, skipped }) => ({
      target,
      ok: checkOk,
      failureCode: failureCode ?? null,
      ...(skipped ? { skipped: true } : {}),
    })),
    stats: {
      totals: stats.totals,
      byCode: stats.byCode,
      lastRun: stats.lastRun,
    },
    alert: null,
  }

  if (!ok) {
    const alertMessage = buildAlertMessage({ ...payload, stats })
    appendAlertLog(getAlertLogPath(), alertMessage)

    if (shouldSendPlaneAlert(stats, payload)) {
      const planeResult = await maybePostPlaneComment(alertMessage)
      payload.alert = {
        logPath: getAlertLogPath(),
        logUrl: 'https://log.wastebase.xyz/issues/SMB-253',
        plane: planeResult,
      }
      if (planeResult.ok) {
        stats = markAlertSent(stats, buildFailureSignature(checks))
        saveStats(getStatsPath(), stats)
      }
    } else {
      payload.alert = {
        logPath: getAlertLogPath(),
        logUrl: 'https://log.wastebase.xyz/issues/SMB-253',
        plane: { skipped: true, reason: 'throttled' },
      }
    }
  }

  return payload
}

async function main() {
  mkdirSync(dirname(getStatsPath()), { recursive: true })
  const payload = await runSyncContractChecks()
  console.log(JSON.stringify(payload, null, 2))
  process.exitCode = payload.ok ? 0 : 1
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main()
}
