-- SMB-277: per-transaction editor attribution for shared ledgers
ALTER TABLE transactions ADD COLUMN created_by_user_id TEXT;
ALTER TABLE transactions ADD COLUMN created_by_display_name TEXT;
ALTER TABLE transactions ADD COLUMN updated_by_user_id TEXT;
ALTER TABLE transactions ADD COLUMN updated_by_display_name TEXT;
