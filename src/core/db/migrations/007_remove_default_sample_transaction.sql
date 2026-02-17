-- Remove legacy sample transaction "飲食 300" if it is the only transaction in the ledger.
-- This avoids deleting real user data that may also be food expenses.
WITH single_tx_ledger AS (
  SELECT ledger_id
  FROM transactions
  WHERE deleted_at IS NULL
  GROUP BY ledger_id
  HAVING COUNT(*) = 1
),
sample_tx AS (
  SELECT t.ledger_id, t.id
  FROM transactions t
  LEFT JOIN categories c
    ON c.ledger_id = t.ledger_id
   AND c.id = t.category_id
  LEFT JOIN accounts a
    ON a.ledger_id = t.ledger_id
   AND a.id = t.account_id
  WHERE t.deleted_at IS NULL
    AND t.type = 'expense'
    AND t.amount_minor = -30000
    AND t.ledger_id IN (SELECT ledger_id FROM single_tx_ledger)
    AND (
      c.name IN ('飲食', '早餐')
      OR a.name = '錢包'
    )
)
UPDATE transactions
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE (ledger_id, id) IN (SELECT ledger_id, id FROM sample_tx);
