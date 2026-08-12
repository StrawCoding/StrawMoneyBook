/**
 * OpenCode tick20：必須實際呼叫 updateManualTransaction（正式編輯入口），
 * 並經 repository 路徑（findTransactionRecordById → gate → updateTransactionById）
 * 證明 closed 信用卡交易可純校正 occurred_at，且 statement_id／posted_at／closing_balance_minor 不變。
 *
 * Harness 在子行程執行，避免 registerHooks stub 污染其他測試。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const harnessPath = resolve(__dirname, 'helpers/smb301-update-manual-entry-harness.mjs')
const root = resolve(__dirname, '..')

test('formal edit entry: updateManualTransaction pure occurred_at keeps statement invariants', () => {
  const result = spawnSync(process.execPath, [harnessPath], {
    encoding: 'utf8',
    cwd: root,
    env: process.env,
  })
  assert.equal(
    result.status,
    0,
    `harness failed (rc=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
  const lines = String(result.stdout ?? '')
    .trim()
    .split('\n')
    .filter(Boolean)
  const evidence = JSON.parse(lines[lines.length - 1])

  assert.equal(evidence.entry, 'updateManualTransaction')
  assert.equal(evidence.repositoryPath.findTransactionRecordById, 1)
  assert.equal(evidence.repositoryPath.findPostingStatementStatus, 1)
  assert.equal(evidence.repositoryPath.updateTransactionById, 1)
  assert.equal(evidence.repositoryPath.findTransactionById, 0)

  assert.equal(evidence.before.posted_at, '2026-03-10T12:00:00')
  assert.equal(evidence.before.statement_id, 'S1')
  assert.equal(evidence.before.closing_balance_minor, 50000)

  assert.equal(evidence.after.occurred_at, '2026-03-08T09:00:00')
  assert.equal(evidence.after.posted_at, evidence.before.posted_at)
  assert.equal(evidence.after.statement_id, evidence.before.statement_id)
  assert.equal(evidence.after.closing_balance_minor, evidence.before.closing_balance_minor)
  assert.equal(evidence.after.status, 'closed')

  assert.equal(evidence.lastUpdateInputKeys.includes('postedAt'), false)
  assert.equal(evidence.lastUpdateInputKeys.includes('occurredAt'), true)
  assert.equal(evidence.postedAtRejected, true)
})

test('product source: updateManualTransaction still wires formal credit gate + full-row load', () => {
  const txService = readFileSync(resolve(root, 'src/core/services/transaction.service.js'), 'utf8')
  const updateManualFn = txService.match(
    /export async function updateManualTransaction[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.match(updateManualFn, /findTransactionRecordById/)
  assert.match(updateManualFn, /findPostingStatementStatus/)
  assert.match(updateManualFn, /assertUpdateManualCreditMutationAllowed/)
  assert.match(updateManualFn, /buildUpdateManualTransactionFields/)
  assert.match(updateManualFn, /updateTransactionById/)
  assert.doesNotMatch(updateManualFn, /payload\.postedAt\s*\?\?\s*payload\.occurredAt/)
  assert.doesNotMatch(updateManualFn, /findTransactionById\(/)
})
