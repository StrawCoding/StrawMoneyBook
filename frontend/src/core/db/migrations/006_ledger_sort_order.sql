ALTER TABLE ledgers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE ledgers AS l
SET sort_order = (
  SELECT COUNT(*)
  FROM ledgers AS l2
  WHERE COALESCE(l2.created_at, '') < COALESCE(l.created_at, '')
     OR (
       COALESCE(l2.created_at, '') = COALESCE(l.created_at, '')
       AND l2.id <= l.id
     )
) - 1
WHERE l.deleted_at IS NULL;
