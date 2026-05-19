ALTER TABLE categories ADD COLUMN default_include_in_analysis INTEGER NOT NULL DEFAULT 1 CHECK (default_include_in_analysis IN (0,1));
ALTER TABLE categories ADD COLUMN default_include_in_budget INTEGER NOT NULL DEFAULT 1 CHECK (default_include_in_budget IN (0,1));
ALTER TABLE categories ADD COLUMN default_is_reimbursable INTEGER NOT NULL DEFAULT 0 CHECK (default_is_reimbursable IN (0,1));
