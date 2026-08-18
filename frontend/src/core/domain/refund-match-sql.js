/**
 * Refund matching SSOT for SQL fragments.
 * A refund of `sourceAlias` is a live transaction whose external_ref_id
 * points at the source row and matches origin / category / note heuristics.
 */

export function refundMatchPredicateSql(rtAlias = 'rt', rcAlias = 'rc') {
  return `(
        ${rtAlias}.origin_type = 'refund'
        OR ${rcAlias}.name = '退款'
        OR ${rtAlias}.note LIKE '退款：%'
        OR ${rtAlias}.note LIKE '退款:%'
      )`
}

export function refundRelationExistsSql(sourceAlias = 't') {
  return `EXISTS (
    SELECT 1
    FROM transactions rt
    LEFT JOIN categories rc
      ON rc.ledger_id = rt.ledger_id
     AND rc.id = rt.category_id
    WHERE rt.ledger_id = ${sourceAlias}.ledger_id
      AND rt.deleted_at IS NULL
      AND rt.external_ref_id = ${sourceAlias}.id
      AND ${refundMatchPredicateSql('rt', 'rc')}
  )`
}

export function refundDeductedMinorSql(sourceAlias = 't') {
  return `COALESCE((
    SELECT SUM(ABS(rt.amount_minor))
    FROM transactions rt
    LEFT JOIN categories rc
      ON rc.ledger_id = rt.ledger_id
     AND rc.id = rt.category_id
    WHERE rt.ledger_id = ${sourceAlias}.ledger_id
      AND rt.deleted_at IS NULL
      AND rt.external_ref_id = ${sourceAlias}.id
      AND ${refundMatchPredicateSql('rt', 'rc')}
  ), 0)`
}

export function refundedSourceExclusionSql(sourceAlias = 'transactions') {
  return `NOT ${refundRelationExistsSql(sourceAlias)}`
}
