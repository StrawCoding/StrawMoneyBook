ALTER TABLE budget_items
  ADD COLUMN amount_mode TEXT NOT NULL DEFAULT 'fixed'
  CHECK (amount_mode IN ('fixed', 'daily_average'));

ALTER TABLE budget_items
  ADD COLUMN day_rule_unit TEXT NOT NULL DEFAULT 'none'
  CHECK (day_rule_unit IN ('none', 'weekday', 'monthday'));

ALTER TABLE budget_items
  ADD COLUMN day_rule_values_json TEXT NOT NULL DEFAULT '[]';
