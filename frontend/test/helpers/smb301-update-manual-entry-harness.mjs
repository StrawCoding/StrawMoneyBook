/**
 * Isolated harness: actually imports and calls updateManualTransaction
 * (formal edit entry) with repository deps backed by sql.js.
 *
 * Run in a child process so registerHooks stubs do not leak into other tests.
 * Prints one JSON evidence line on success; non-zero exit on failure.
 */
import { registerHooks } from 'node:module'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '../..')
const SRC = resolve(frontendRoot, 'src')

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

function resolveAlias(specifier) {
  let base = resolve(SRC, specifier.slice(2))
  if (existsSync(`${base}.js`)) return `${base}.js`
  if (existsSync(resolve(base, 'index.js'))) return resolve(base, 'index.js')
  return base
}

/** @type {import('sql.js').Database | null} */
let db = null
const calls = {
  findTransactionRecordById: 0,
  findPostingStatementStatus: 0,
  updateTransactionById: 0,
  findTransactionById: 0,
}

function openCreditDb(SQL) {
  const next = new SQL.Database()
  next.run('PRAGMA foreign_keys = ON;')
  next.run(`
    CREATE TABLE ledgers (id TEXT PRIMARY KEY);
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      account_kind TEXT NOT NULL DEFAULT 'cash',
      statement_close_day INTEGER, payment_due_day INTEGER,
      credit_limit_minor INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL,
      account_id TEXT, category_id TEXT, amount_minor INTEGER NOT NULL,
      occurred_at TEXT NOT NULL, posted_at TEXT, note TEXT,
      origin_type TEXT, external_ref_id TEXT,
      is_reimbursable INTEGER NOT NULL DEFAULT 0,
      reimbursement_state TEXT NOT NULL DEFAULT 'none',
      include_in_budget INTEGER NOT NULL DEFAULT 1,
      include_in_analysis INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE credit_statements (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, account_id TEXT NOT NULL,
      period_start_inclusive TEXT NOT NULL, period_end_exclusive TEXT NOT NULL,
      status TEXT NOT NULL, closing_balance_minor INTEGER, due_on TEXT,
      closed_at TEXT, closing_hash TEXT, close_token TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE transaction_postings (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, transaction_id TEXT NOT NULL,
      role TEXT NOT NULL, account_id TEXT, amount_minor INTEGER NOT NULL,
      statement_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
  `)
  return next
}

function seedClosedPurchase(database) {
  const ledgerId = 'L1'
  const cardId = 'CARD'
  const txId = 'T1'
  database.run('INSERT INTO ledgers (id) VALUES (?);', [ledgerId])
  database.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind, statement_close_day, payment_due_day, credit_limit_minor)
     VALUES (?, ?, 'Visa', 'credit', 15, 10, 100000);`,
    [ledgerId, cardId],
  )
  database.run(
    `INSERT INTO credit_statements (
      ledger_id, id, account_id, period_start_inclusive, period_end_exclusive, status,
      closing_balance_minor, due_on, closed_at, closing_hash, close_token, created_at, updated_at, deleted_at
    ) VALUES (?, 'S1', ?, '2026-02-16T00:00:00', '2026-03-16T00:00:00', 'closed',
      50000, '2026-04-10', '2026-03-16T00:00:00', 'hash', 'tok', ?, ?, NULL);`,
    [ledgerId, cardId, '2026-03-16T00:00:00', '2026-03-16T00:00:00'],
  )
  database.run(
    `INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at, posted_at, note, origin_type,
      is_reimbursable, reimbursement_state, include_in_budget, include_in_analysis, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'expense', ?, 'cat_food', -50000, '2026-03-10T12:00:00', '2026-03-10T12:00:00', '刷卡', 'manual',
      0, 'none', 1, 1, ?, ?, NULL);`,
    [ledgerId, txId, cardId, '2026-03-10T12:00:00', '2026-03-10T12:00:00'],
  )
  database.run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, amount_minor, statement_id, created_at, updated_at, deleted_at
    ) VALUES (?, 'P1', ?, 'card_liability', ?, -50000, 'S1', ?, ?, NULL);`,
    [ledgerId, txId, cardId, '2026-03-10T12:00:00', '2026-03-10T12:00:00'],
  )
  return { ledgerId, cardId, txId }
}

function readInvariant(database, txId) {
  const safeId = String(txId).replace(/'/g, "''")
  const row = database.exec(
    `SELECT t.occurred_at, t.posted_at, p.statement_id, s.closing_balance_minor, s.status
     FROM transactions t
     JOIN transaction_postings p ON p.transaction_id = t.id AND p.ledger_id = t.ledger_id
     JOIN credit_statements s ON s.id = p.statement_id AND s.ledger_id = t.ledger_id
     WHERE t.id = '${safeId}';`,
  )[0].values[0]
  return {
    occurred_at: row[0],
    posted_at: row[1],
    statement_id: row[2],
    closing_balance_minor: row[3],
    status: row[4],
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(resolveAlias(specifier)).href, context)
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.includes('/core/repositories/transaction.repo.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export async function findTransactionRecordById(ledgerId, txId) {
            globalThis.__smb301Harness.calls.findTransactionRecordById += 1
            const db = globalThis.__smb301Harness.db
            const cols = db.exec(
              \`SELECT id, type, account_id, category_id, amount_minor, occurred_at, posted_at, note,
                      origin_type, is_reimbursable, reimbursement_state,
                      include_in_budget, include_in_analysis
               FROM transactions
               WHERE ledger_id = '\${ledgerId}' AND id = '\${txId}' AND deleted_at IS NULL
               LIMIT 1;\`,
            )[0]
            if (!cols?.values?.[0]) return null
            const v = cols.values[0]
            return {
              id: v[0], type: v[1], account_id: v[2], category_id: v[3],
              amount_minor: v[4], occurred_at: v[5], posted_at: v[6], note: v[7],
              origin_type: v[8], is_reimbursable: v[9], reimbursement_state: v[10],
              include_in_budget: v[11], include_in_analysis: v[12],
            }
          }
          // Slim select intentionally omits posted_at — must NOT be used by formal edit.
          export async function findTransactionById(ledgerId, txId) {
            globalThis.__smb301Harness.calls.findTransactionById += 1
            const row = await findTransactionRecordById(ledgerId, txId)
            if (!row) return null
            return { id: row.id, type: row.type, origin_type: row.origin_type }
          }
          export async function updateTransactionById(ledgerId, txId, input) {
            globalThis.__smb301Harness.calls.updateTransactionById += 1
            globalThis.__smb301Harness.lastUpdateInput = input
            if (Object.prototype.hasOwnProperty.call(input ?? {}, 'postedAt')
              || Object.prototype.hasOwnProperty.call(input ?? {}, 'posted_at')) {
              throw new Error('updateTransactionById must not receive postedAt')
            }
            const db = globalThis.__smb301Harness.db
            const now = new Date().toISOString()
            db.run(
              \`UPDATE transactions
               SET account_id = ?,
                   category_id = ?,
                   amount_minor = ?,
                   occurred_at = ?,
                   note = ?,
                   is_reimbursable = ?,
                   reimbursement_state = ?,
                   include_in_budget = ?,
                   include_in_analysis = ?,
                   updated_at = ?
               WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;\`,
              [
                input.accountId,
                input.categoryId ?? null,
                input.amountMinor,
                input.occurredAt,
                input.note ?? null,
                input.isReimbursable ? 1 : 0,
                input.reimbursementState ?? 'none',
                input.includeInBudget === false ? 0 : 1,
                input.includeInAnalysis === false ? 0 : 1,
                now,
                ledgerId,
                txId,
              ],
            )
          }
          export async function addTransaction() {}
          export async function addTransfer() {}
          export async function batchPatchCategoryForTransactions() { return 0 }
          export async function countReimbursableTransactions() { return 0 }
          export async function listTransferTransactionsByGroup() { return [] }
          export async function listTransactionsByExternalRef() { return [] }
          export async function softDeleteTransactionById() {}
          export async function softDeleteTransferGroup() {}
        `,
      }
    }
    if (url.includes('/core/repositories/credit.repo.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export async function findPostingStatementStatus(ledgerId, transactionId) {
            globalThis.__smb301Harness.calls.findPostingStatementStatus += 1
            const db = globalThis.__smb301Harness.db
            const cols = db.exec(
              \`SELECT s.status, s.id AS statement_id
               FROM transaction_postings p
               JOIN credit_statements s
                 ON s.ledger_id = p.ledger_id AND s.id = p.statement_id AND s.deleted_at IS NULL
               WHERE p.ledger_id = '\${ledgerId}'
                 AND p.transaction_id = '\${transactionId}'
                 AND p.deleted_at IS NULL
                 AND p.statement_id IS NOT NULL
               LIMIT 1;\`,
            )[0]
            if (!cols?.values?.[0]) return null
            return { status: cols.values[0][0], statement_id: cols.values[0][1] }
          }
        `,
      }
    }
    if (url.includes('/core/db/sqlite.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export async function withTransaction(fn) { return fn() }
          export async function query() { return { values: [] } }
          export async function run() {}
          export const PRIMARY_DB_NAME = 'harness'
          export const RECOVERY_DB_NAME = 'harness_recovery'
          export function getActiveDatabaseName() { return PRIMARY_DB_NAME }
          export function isUsingPrimaryDatabase() { return true }
        `,
      }
    }
    const stubNeedles = [
      '/account.repo.js',
      '/savings-jar.repo.js',
      '/category.repo.js',
      '/membership.service.js',
      '/loan.service.js',
      '/reimbursement.service.js',
      '/claim-sheet-draft-sync.service.js',
      '/data-wipe-guard.service.js',
      '/web-store.js',
      '/migrate.js',
      '/shared-ledger/backend',
    ]
    if (stubNeedles.some((needle) => url.includes(needle))) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export async function isSavingsJarAccount() { return false }
          export async function findAccountById() { return { id: 'CARD', account_kind: 'credit' } }
          export async function assertCanCreateReimbursement() {}
          export async function deleteLoanByExternalRefId() { return null }
          export async function removeAdvanceUsagesForExpenseTransaction() {}
          export async function removeReimbursementAdvanceEffectsBySourceTransaction() {}
          export async function reconcileDraftClaimSheetImportItems() {}
          export async function archiveCategory() {}
          export async function createCategory() {}
          export async function createCategoryGroup() {}
          export async function listCategories() { return [] }
          export async function listCategoryGroups() { return [] }
          export async function updateCategoryIcon() {}
          export function assertExplicitDataWipe() {}
          export function createLocalDatabaseIntegrityError() { return new Error('x') }
          export function recordDataWipeAudit() {}
          export async function ensureWebSqliteStoreReady() {}
          export async function runMigrations() {}
          export function getSharedLedgerSession() { return null }
          export const DATABASE_WIPE_DELETE_ORDER = []
          export function rethrowAsForeignKeyError(e) { throw e }
        `,
      }
    }
    return nextLoad(url, context)
  },
})

async function main() {
  const SQL = await initSqlJs()
  db = openCreditDb(SQL)
  const { ledgerId, cardId, txId } = seedClosedPurchase(db)
  globalThis.__smb301Harness = { db, calls, lastUpdateInput: null }

  // Prove product source still wires the formal entry (not just harness).
  const txServiceSrc = readFileSync(resolve(SRC, 'core/services/transaction.service.js'), 'utf8')
  const updateManualFn = txServiceSrc.match(
    /export async function updateManualTransaction[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.match(updateManualFn, /findTransactionRecordById/)
  assert.match(updateManualFn, /assertUpdateManualCreditMutationAllowed/)
  assert.match(updateManualFn, /buildUpdateManualTransactionFields/)
  assert.doesNotMatch(updateManualFn, /payload\.postedAt\s*\?\?\s*payload\.occurredAt/)

  const { updateManualTransaction } = await import(
    pathToFileURL(resolve(SRC, 'core/services/transaction.service.js')).href
  )

  const before = readInvariant(db, txId)
  assert.equal(before.occurred_at, '2026-03-10T12:00:00')
  assert.equal(before.posted_at, '2026-03-10T12:00:00')
  assert.equal(before.statement_id, 'S1')
  assert.equal(before.closing_balance_minor, 50000)
  assert.equal(before.status, 'closed')

  const pureOccurredPayload = {
    type: 'expense',
    accountId: cardId,
    categoryId: 'cat_food',
    amountMinor: 50000,
    occurredAt: '2026-03-08T09:00:00',
    note: '刷卡',
    isReimbursable: false,
    includeInBudget: true,
    includeInAnalysis: true,
    // postedAt omitted — mirrors TransactionEditPage / HomeTransactionEditSheet
  }

  await updateManualTransaction(ledgerId, txId, pureOccurredPayload)

  const successPath = {
    findTransactionRecordById: calls.findTransactionRecordById,
    findPostingStatementStatus: calls.findPostingStatementStatus,
    updateTransactionById: calls.updateTransactionById,
    findTransactionById: calls.findTransactionById,
  }
  assert.equal(successPath.findTransactionRecordById, 1, 'must load via findTransactionRecordById')
  assert.equal(successPath.findPostingStatementStatus, 1, 'must read statement status via credit.repo')
  assert.equal(successPath.updateTransactionById, 1, 'must persist via updateTransactionById')
  assert.equal(successPath.findTransactionById, 0, 'must not use slim findTransactionById')
  assert.equal(
    Object.prototype.hasOwnProperty.call(globalThis.__smb301Harness.lastUpdateInput ?? {}, 'postedAt'),
    false,
  )
  assert.equal(globalThis.__smb301Harness.lastUpdateInput.occurredAt, '2026-03-08T09:00:00')
  assert.equal(globalThis.__smb301Harness.lastUpdateInput.amountMinor, -50000)

  const after = readInvariant(db, txId)
  assert.equal(after.occurred_at, '2026-03-08T09:00:00')
  assert.equal(after.posted_at, '2026-03-10T12:00:00', 'posted_at immutable')
  assert.equal(after.statement_id, 'S1', 'statement_id immutable')
  assert.equal(after.closing_balance_minor, 50000, 'closing_balance_minor immutable')
  assert.equal(after.status, 'closed')

  // Explicit postedAt change must fail through the same formal entry.
  let rejected = false
  try {
    await updateManualTransaction(ledgerId, txId, {
      ...pureOccurredPayload,
      postedAt: '2026-03-20T10:00:00',
    })
  } catch (error) {
    rejected = error?.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN'
    assert.equal(error?.code, 'CLOSED_POSTING_MUTATION_FORBIDDEN')
  }
  assert.equal(rejected, true)

  const afterReject = readInvariant(db, txId)
  assert.deepEqual(afterReject, after, 'rejected postedAt edit must not mutate row')

  const evidence = {
    entry: 'updateManualTransaction',
    repositoryPath: successPath,
    before,
    after,
    lastUpdateInputKeys: Object.keys(globalThis.__smb301Harness.lastUpdateInput ?? {}),
    postedAtRejected: true,
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
