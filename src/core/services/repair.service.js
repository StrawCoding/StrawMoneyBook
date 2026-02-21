import { query, run, withTransaction } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'

async function countValue(sql, values) {
  const result = await query(sql, values)
  return Number(result?.values?.[0]?.count ?? 0)
}

function parsePresetInterestMinor(rawRule) {
  if (!rawRule) return 0
  try {
    const parsed = JSON.parse(String(rawRule))
    const value = Number(parsed?.presetInterestMinor ?? 0)
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value))
  } catch {
    return 0
  }
}

function expectedLoanStatus(row) {
  if (row.status === 'void') return 'void'

  const principalMinor = Math.max(0, Number(row.principal_minor ?? 0))
  const paidMinor = Math.max(0, Number(row.paid_minor ?? 0))
  const presetInterestMinor = parsePresetInterestMinor(row.interest_rule_json)
  const targetTotalMinor = principalMinor + presetInterestMinor

  if (paidMinor <= 0) return 'active'
  if (paidMinor >= targetTotalMinor) return 'settled'
  return 'partial'
}

async function listLoanStatusRows(ledgerId) {
  return (
    await query(
      `SELECT
         l.id,
         l.status,
         l.principal_minor,
         l.interest_rule_json,
         COALESCE(SUM(lp.amount_minor), 0) AS paid_minor
       FROM loans l
       LEFT JOIN loan_payments lp
         ON lp.ledger_id = l.ledger_id
        AND lp.loan_id = l.id
       WHERE l.ledger_id = ?
         AND l.deleted_at IS NULL
       GROUP BY l.id;`,
      [ledgerId],
    )
  )?.values ?? []
}

export async function scanLedgerIntegrity(ledgerId) {
  const [
    orphanTxAccount,
    orphanTxCategory,
    missingPaidTransaction,
    reimbursementTotalMismatch,
    invalidTransferGroups,
  ] = await Promise.all([
    countValue(
      `SELECT COUNT(*) AS count
       FROM transactions t
       LEFT JOIN accounts a
         ON a.ledger_id = t.ledger_id
        AND a.id = t.account_id
       WHERE t.ledger_id = ?
         AND t.deleted_at IS NULL
         AND a.id IS NULL;`,
      [ledgerId],
    ),
    countValue(
      `SELECT COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c
         ON c.ledger_id = t.ledger_id
        AND c.id = t.category_id
       WHERE t.ledger_id = ?
         AND t.deleted_at IS NULL
         AND t.category_id IS NOT NULL
         AND c.id IS NULL;`,
      [ledgerId],
    ),
    countValue(
      `SELECT COUNT(*) AS count
       FROM reimbursements r
       LEFT JOIN transactions t
         ON t.ledger_id = r.ledger_id
        AND t.id = r.paid_tx_id
       WHERE r.ledger_id = ?
         AND r.deleted_at IS NULL
         AND r.status = 'paid'
         AND (r.paid_tx_id IS NULL OR t.id IS NULL);`,
      [ledgerId],
    ),
    countValue(
      `SELECT COUNT(*) AS count
       FROM reimbursements r
       LEFT JOIN (
         SELECT ledger_id, reimbursement_id, COALESCE(SUM(amount_minor), 0) AS sum_minor
         FROM reimbursement_items
         GROUP BY ledger_id, reimbursement_id
       ) x
         ON x.ledger_id = r.ledger_id
        AND x.reimbursement_id = r.id
       WHERE r.ledger_id = ?
         AND r.deleted_at IS NULL
         AND COALESCE(x.sum_minor, 0) <> r.total_minor;`,
      [ledgerId],
    ),
    countValue(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT transfer_group_id,
                COUNT(*) AS leg_count,
                COALESCE(SUM(amount_minor), 0) AS balance
         FROM transactions
         WHERE ledger_id = ?
           AND deleted_at IS NULL
           AND type = 'transfer'
           AND transfer_group_id IS NOT NULL
         GROUP BY transfer_group_id
       ) z
       WHERE z.leg_count <> 2 OR z.balance <> 0;`,
      [ledgerId],
    ),
  ])

  const loanRows = await listLoanStatusRows(ledgerId)
  const loanStatusMismatch = loanRows.filter((row) => row.status !== expectedLoanStatus(row)).length
  const overpaidLoans = 0

  return {
    orphanTxAccount,
    orphanTxCategory,
    missingPaidTransaction,
    reimbursementTotalMismatch,
    invalidTransferGroups,
    overpaidLoans,
    loanStatusMismatch,
  }
}

export async function repairLedgerData(ledgerId) {
  return withTransaction(async () => {
    const fixed = {
      reimbursementTotalFixed: 0,
      reimbursementPaidStateFixed: 0,
      loanStatusFixed: 0,
    }

    const mismatchBefore = await countValue(
      `SELECT COUNT(*) AS count
       FROM reimbursements r
       LEFT JOIN (
         SELECT ledger_id, reimbursement_id, COALESCE(SUM(amount_minor), 0) AS sum_minor
         FROM reimbursement_items
         GROUP BY ledger_id, reimbursement_id
       ) x
         ON x.ledger_id = r.ledger_id
        AND x.reimbursement_id = r.id
       WHERE r.ledger_id = ?
         AND r.deleted_at IS NULL
         AND COALESCE(x.sum_minor, 0) <> r.total_minor;`,
      [ledgerId],
    )

    await run(
      `UPDATE reimbursements
       SET total_minor = (
             SELECT COALESCE(SUM(amount_minor), 0)
             FROM reimbursement_items
             WHERE ledger_id = reimbursements.ledger_id
               AND reimbursement_id = reimbursements.id
           ),
           updated_at = ?
       WHERE ledger_id = ?
         AND deleted_at IS NULL;`,
      [nowIso(), ledgerId],
    )

    const mismatchAfter = await countValue(
      `SELECT COUNT(*) AS count
       FROM reimbursements r
       LEFT JOIN (
         SELECT ledger_id, reimbursement_id, COALESCE(SUM(amount_minor), 0) AS sum_minor
         FROM reimbursement_items
         GROUP BY ledger_id, reimbursement_id
       ) x
         ON x.ledger_id = r.ledger_id
        AND x.reimbursement_id = r.id
       WHERE r.ledger_id = ?
         AND r.deleted_at IS NULL
         AND COALESCE(x.sum_minor, 0) <> r.total_minor;`,
      [ledgerId],
    )
    fixed.reimbursementTotalFixed = Math.max(0, mismatchBefore - mismatchAfter)

    const paidFixRes = await run(
      `UPDATE reimbursements
       SET status = 'approved',
           paid_at = NULL,
           paid_tx_id = NULL,
           updated_at = ?
       WHERE ledger_id = ?
         AND deleted_at IS NULL
         AND status = 'paid'
         AND (
           paid_tx_id IS NULL OR NOT EXISTS (
             SELECT 1
             FROM transactions t
             WHERE t.ledger_id = reimbursements.ledger_id
               AND t.id = reimbursements.paid_tx_id
               AND t.deleted_at IS NULL
           )
         );`,
      [nowIso(), ledgerId],
    )
    fixed.reimbursementPaidStateFixed = Number(paidFixRes?.changes?.changes ?? 0)

    const loanRows = await listLoanStatusRows(ledgerId)

    for (const row of loanRows) {
      if (row.status === 'void') continue

      const expected = expectedLoanStatus(row)

      if (row.status !== expected) {
        await run(
          `UPDATE loans
           SET status = ?,
               settled_at = ?,
               updated_at = ?
           WHERE ledger_id = ?
             AND id = ?;`,
          [expected, expected === 'settled' ? nowIso() : null, nowIso(), ledgerId, row.id],
        )
        fixed.loanStatusFixed += 1
      }
    }

    const after = await scanLedgerIntegrity(ledgerId)
    return { fixed, after }
  })
}
