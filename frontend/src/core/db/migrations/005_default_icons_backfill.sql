UPDATE accounts
SET icon = 'fa-solid fa-wallet'
WHERE icon IS NULL OR TRIM(icon) = '';

UPDATE categories
SET icon = CASE
  WHEN name LIKE '%飲食%' THEN 'fa-solid fa-utensils'
  WHEN kind = 'income' THEN 'fa-solid fa-sack-dollar'
  ELSE 'fa-solid fa-tag'
END
WHERE icon IS NULL OR TRIM(icon) = '';
