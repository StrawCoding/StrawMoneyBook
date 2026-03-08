ALTER TABLE transactions ADD COLUMN include_in_budget INTEGER NOT NULL DEFAULT 1 CHECK (include_in_budget IN (0,1));
ALTER TABLE transactions ADD COLUMN include_in_analysis INTEGER NOT NULL DEFAULT 1 CHECK (include_in_analysis IN (0,1));

UPDATE transactions
SET include_in_budget = COALESCE(include_in_budget, 1),
    include_in_analysis = COALESCE(include_in_analysis, 1);

UPDATE transactions
SET include_in_budget = 0,
    include_in_analysis = 0
WHERE origin_type = 'reimbursement';
