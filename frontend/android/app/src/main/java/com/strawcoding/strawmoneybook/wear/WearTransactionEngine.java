package com.strawcoding.strawmoneybook.wear;

import android.content.Context;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteStatement;
import org.json.JSONObject;

/**
 * Canonical phone-side Wear transaction engine. Writes straw_money_book via
 * SQLCipher SupportSQLiteDatabase. Must not depend on Activity or Capacitor Bridge.
 */
public final class WearTransactionEngine {
    private WearTransactionEngine() {}

    public static JSONObject applyTxCreate(Context context, JSONObject payload, String activeLedgerId)
        throws Exception {
        AndroidDbRepository repo = AndroidDbRepository.get(context);
        return repo.withWriteLock(() -> {
            SupportSQLiteDatabase db = repo.openForWrite();
            return applyTxCreateOnDb(db, payload, activeLedgerId);
        });
    }

    public static JSONObject applyTxCreateOnDb(
        SupportSQLiteDatabase db,
        JSONObject payload,
        String activeLedgerId
    ) throws Exception {
        WearProtocol.WearTxCreate parsed;
        try {
            parsed = WearProtocol.validateTxCreate(payload);
        } catch (Exception error) {
            return WearProtocol.ack(
                "rejected",
                payload.optString("idempotencyKey", "").trim(),
                null,
                error.getMessage()
            );
        }

        long schemaVersion = AndroidDbRepository.queryLong(
            db,
            "SELECT MAX(version) FROM schema_migrations;",
            null,
            0L
        );
        if (schemaVersion < WearCompanionConstants.REQUIRED_SCHEMA_VERSION) {
            return WearProtocol.ack(
                "schema_upgrade_required",
                parsed.idempotencyKey,
                null,
                "open StrawMB on phone to finish update"
            );
        }

        String anyLedger = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM ledgers WHERE deleted_at IS NULL LIMIT 1;",
            null
        );
        if (anyLedger == null) {
            return WearProtocol.ack(
                "engine_not_ready",
                parsed.idempotencyKey,
                null,
                "complete StrawMB setup on phone"
            );
        }

        String appliedTxId = AndroidDbRepository.queryString(
            db,
            "SELECT tx_id FROM wear_applied WHERE idempotency_key = ? LIMIT 1;",
            new String[] { parsed.idempotencyKey }
        );
        if (appliedTxId != null) {
            return WearProtocol.ack("duplicate", parsed.idempotencyKey, appliedTxId, null);
        }

        String active = activeLedgerId == null ? "" : activeLedgerId.trim();
        if (!active.isEmpty() && !active.equals(parsed.ledgerId)) {
            return WearProtocol.ack(
                "ledger_mismatch",
                parsed.idempotencyKey,
                null,
                "phone active ledger changed"
            );
        }

        String ledgerId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM ledgers WHERE id = ? AND deleted_at IS NULL LIMIT 1;",
            new String[] { parsed.ledgerId }
        );
        if (ledgerId == null) {
            return WearProtocol.ack(
                "ledger_mismatch",
                parsed.idempotencyKey,
                null,
                "ledger not on phone"
            );
        }

        String accountKind = AndroidDbRepository.queryString(
            db,
            "SELECT account_kind FROM accounts"
                + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL AND COALESCE(is_archived, 0) = 0"
                + " LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.accountId }
        );
        if (accountKind == null) {
            return WearProtocol.ack("catalog_stale", parsed.idempotencyKey, null, "account missing");
        }

        String savingsJar = AndroidDbRepository.queryString(
            db,
            "SELECT 1 FROM savings_jars WHERE ledger_id = ? AND account_id = ? LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.accountId }
        );
        if (savingsJar != null) {
            return WearProtocol.ack("rejected", parsed.idempotencyKey, null, "savings jar not allowed");
        }

        String categoryKind = "income".equals(parsed.type) ? "income" : "expense";
        String categoryId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM categories"
                + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL"
                + " AND COALESCE(is_archived, 0) = 0 AND kind = ? LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.categoryId, categoryKind }
        );
        if (categoryId == null) {
            return WearProtocol.ack("catalog_stale", parsed.idempotencyKey, null, "category missing");
        }

        String occurredAt = parsed.occurredAt == null || parsed.occurredAt.isEmpty()
            ? WearIds.nowIso()
            : parsed.occurredAt;
        String note = parsed.note == null || parsed.note.isEmpty() ? null : parsed.note;
        boolean isCredit = "credit".equals(accountKind);
        if (isCredit && "income".equals(parsed.type)) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "credit income not supported on watch"
            );
        }

        db.beginTransaction();
        try {
            String txId = isCredit
                ? insertCreditPurchase(db, parsed, occurredAt, note)
                : insertCashTransaction(db, parsed, occurredAt, note);
            insertWearApplied(db, parsed.idempotencyKey, parsed.ledgerId, txId);
            db.setTransactionSuccessful();
            return WearProtocol.ack("ok", parsed.idempotencyKey, txId, null);
        } catch (Exception error) {
            if (!isUniqueConstraint(error)) {
                return WearProtocol.ack(
                    "rejected",
                    parsed.idempotencyKey,
                    null,
                    String.valueOf(error.getMessage())
                );
            }
        } finally {
            db.endTransaction();
        }

        String existing = AndroidDbRepository.queryString(
            db,
            "SELECT tx_id FROM wear_applied WHERE idempotency_key = ? LIMIT 1;",
            new String[] { parsed.idempotencyKey }
        );
        if (existing == null) {
            existing = AndroidDbRepository.queryString(
                db,
                "SELECT id FROM transactions WHERE ledger_id = ? AND idempotency_key = ? LIMIT 1;",
                new String[] { parsed.ledgerId, parsed.idempotencyKey }
            );
        }
        return WearProtocol.ack("duplicate", parsed.idempotencyKey, existing, null);
    }

    public static JSONObject buildHello(SupportSQLiteDatabase db, String activeLedgerId) throws Exception {
        JSONObject hello = new JSONObject();
        hello.put("protocolVersion", WearCompanionConstants.PROTOCOL_VERSION);
        hello.put("msg", "hello.ok");
        hello.put("schemaVersion", AndroidDbRepository.queryLong(
            db, "SELECT MAX(version) FROM schema_migrations;", null, 0L
        ));
        hello.put("syncEpoch", AndroidDbRepository.queryString(
            db, "SELECT sync_epoch FROM wear_sync_state WHERE id = 1;", null
        ));
        hello.put("snapshotRevision", AndroidDbRepository.queryLong(
            db, "SELECT snapshot_revision FROM wear_sync_state WHERE id = 1;", null, 0L
        ));
        hello.put("ledgerRevision", AndroidDbRepository.queryLong(
            db, "SELECT ledger_revision FROM wear_sync_state WHERE id = 1;", null, 0L
        ));
        hello.put("catalogRevision", AndroidDbRepository.queryLong(
            db, "SELECT catalog_revision FROM wear_sync_state WHERE id = 1;", null, 0L
        ));
        hello.put("activeLedgerId", activeLedgerId == null ? "" : activeLedgerId);
        return hello;
    }

    public static JSONObject buildSnapshot(SupportSQLiteDatabase db, String activeLedgerId) throws Exception {
        JSONObject snapshot = buildHello(db, activeLedgerId);
        snapshot.put("msg", "snapshot.payload");
        String ledgerId = activeLedgerId == null ? "" : activeLedgerId.trim();
        if (ledgerId.isEmpty()) {
            String fallback = AndroidDbRepository.queryString(
                db,
                "SELECT id FROM ledgers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;",
                null
            );
            ledgerId = fallback == null ? "" : fallback;
            snapshot.put("activeLedgerId", ledgerId);
        }
        snapshot.put("ledgerId", ledgerId);
        if (ledgerId.isEmpty()) {
            snapshot.put("todaySpendMinor", 0);
            return snapshot;
        }
        long todaySpend = AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount_minor) ELSE 0 END), 0)"
                + " FROM transactions"
                + " WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND date(occurred_at) = date('now', 'localtime');",
            new String[] { ledgerId },
            0L
        );
        snapshot.put("todaySpendMinor", todaySpend);

        String defaultCash = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM accounts"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND COALESCE(is_archived, 0) = 0"
                + " AND account_kind = 'cash'"
                + " AND id NOT IN (SELECT account_id FROM savings_jars WHERE ledger_id = ?)"
                + " ORDER BY sort_order ASC, created_at ASC LIMIT 1;",
            new String[] { ledgerId, ledgerId }
        );
        String defaultExpenseCategory = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM categories"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND COALESCE(is_archived, 0) = 0"
                + " AND kind = 'expense' ORDER BY sort_order ASC, created_at ASC LIMIT 1;",
            new String[] { ledgerId }
        );
        String defaultIncomeCategory = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM categories"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND COALESCE(is_archived, 0) = 0"
                + " AND kind = 'income' ORDER BY sort_order ASC, created_at ASC LIMIT 1;",
            new String[] { ledgerId }
        );
        snapshot.put("defaultAccountId", defaultCash == null ? "" : defaultCash);
        snapshot.put("defaultExpenseCategoryId", defaultExpenseCategory == null ? "" : defaultExpenseCategory);
        snapshot.put("defaultIncomeCategoryId", defaultIncomeCategory == null ? "" : defaultIncomeCategory);

        org.json.JSONArray recent = new org.json.JSONArray();
        android.database.Cursor cursor = db.query(
            "SELECT id, type, amount_minor, note, occurred_at, origin_type"
                + " FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND type IN ('expense','income')"
                + " ORDER BY occurred_at DESC LIMIT 8;",
            new String[] { ledgerId }
        );
        try {
            while (cursor.moveToNext()) {
                org.json.JSONObject row = new org.json.JSONObject();
                row.put("id", cursor.getString(0));
                row.put("type", cursor.getString(1));
                row.put("amountMinor", cursor.getLong(2));
                row.put("note", cursor.isNull(3) ? "" : cursor.getString(3));
                row.put("occurredAt", cursor.getString(4));
                row.put("originType", cursor.getString(5));
                recent.put(row);
            }
        } finally {
            cursor.close();
        }
        snapshot.put("recentTxs", recent);
        return snapshot;
    }

    private static String insertCashTransaction(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) {
        long signedAmount = "income".equals(parsed.type)
            ? Math.abs(parsed.amountMinor)
            : -Math.abs(parsed.amountMinor);
        return insertTransactionRow(db, parsed, occurredAt, note, signedAmount, null);
    }

    private static String insertCreditPurchase(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) throws Exception {
        String forbidden = AndroidDbRepository.queryString(
            db,
            "SELECT 1 FROM accounts WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND (LOWER(name) LIKE '%credit-accrual%' OR name LIKE '%信用卡應計%') LIMIT 1;",
            new String[] { parsed.ledgerId }
        );
        if (forbidden != null) {
            throw new IllegalStateException("forbidden virtual accrual account");
        }

        String statementId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM credit_statements"
                + " WHERE ledger_id = ? AND account_id = ? AND deleted_at IS NULL"
                + " AND status = 'open'"
                + " AND period_start_inclusive <= ? AND period_end_exclusive > ?"
                + " ORDER BY period_start_inclusive DESC LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.accountId, occurredAt, occurredAt }
        );
        if (statementId == null) {
            throw new IllegalStateException("no open credit statement");
        }

        long liability = -Math.abs(parsed.amountMinor);
        String txId = insertTransactionRow(
            db,
            parsed,
            occurredAt,
            note,
            liability,
            "{\"credit_purchase\":true}"
        );
        insertPosting(
            db,
            parsed.ledgerId,
            txId,
            "expense_accrual",
            null,
            parsed.categoryId,
            liability,
            null,
            1,
            1
        );
        insertPosting(
            db,
            parsed.ledgerId,
            txId,
            "card_liability",
            parsed.accountId,
            null,
            liability,
            statementId,
            0,
            0
        );
        return txId;
    }

    private static String insertTransactionRow(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note,
        long amountMinor,
        String tagsJson
    ) {
        String txId = WearIds.createId("tx");
        String now = WearIds.nowIso();
        SupportSQLiteStatement stmt = db.compileStatement(
            "INSERT INTO transactions ("
                + "ledger_id, id, type, transfer_group_id, account_id, peer_account_id,"
                + " category_id, amount_minor, occurred_at, posted_at, note, location, tags_json, origin_type,"
                + " external_ref_id, idempotency_key, is_reimbursable, reimbursement_state,"
                + " reimbursed_at, reimburse_target_minor, include_in_budget, include_in_analysis,"
                + " created_by_user_id, created_by_display_name, updated_by_user_id, updated_by_display_name,"
                + " created_at, updated_at"
                + ") VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, 'wear', ?, ?, 0, 'none',"
                + " NULL, NULL, 1, 1, NULL, 'Wear OS', NULL, 'Wear OS', ?, ?);"
        );
        try {
            stmt.bindString(1, parsed.ledgerId);
            stmt.bindString(2, txId);
            stmt.bindString(3, parsed.type);
            stmt.bindString(4, parsed.accountId);
            stmt.bindString(5, parsed.categoryId);
            stmt.bindLong(6, amountMinor);
            stmt.bindString(7, occurredAt);
            stmt.bindString(8, occurredAt);
            bindNullable(stmt, 9, note);
            bindNullable(stmt, 10, tagsJson);
            stmt.bindString(11, WearCompanionConstants.externalRefId(parsed.idempotencyKey));
            stmt.bindString(12, parsed.idempotencyKey);
            stmt.bindString(13, now);
            stmt.bindString(14, now);
            stmt.executeInsert();
            return txId;
        } finally {
            closeQuietly(stmt);
        }
    }

    private static void insertPosting(
        SupportSQLiteDatabase db,
        String ledgerId,
        String txId,
        String role,
        String accountId,
        String categoryId,
        long amountMinor,
        String statementId,
        int includeInBudget,
        int includeInAnalysis
    ) {
        String now = WearIds.nowIso();
        SupportSQLiteStatement stmt = db.compileStatement(
            "INSERT INTO transaction_postings ("
                + "ledger_id, id, transaction_id, role, account_id, category_id, amount_minor,"
                + " statement_id, include_in_budget, include_in_analysis, created_at, updated_at, deleted_at"
                + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);"
        );
        try {
            stmt.bindString(1, ledgerId);
            stmt.bindString(2, WearIds.createId("pst"));
            stmt.bindString(3, txId);
            stmt.bindString(4, role);
            bindNullable(stmt, 5, accountId);
            bindNullable(stmt, 6, categoryId);
            stmt.bindLong(7, amountMinor);
            bindNullable(stmt, 8, statementId);
            stmt.bindLong(9, includeInBudget);
            stmt.bindLong(10, includeInAnalysis);
            stmt.bindString(11, now);
            stmt.bindString(12, now);
            stmt.executeInsert();
        } finally {
            closeQuietly(stmt);
        }
    }

    private static void insertWearApplied(
        SupportSQLiteDatabase db,
        String idempotencyKey,
        String ledgerId,
        String txId
    ) {
        SupportSQLiteStatement stmt = db.compileStatement(
            "INSERT INTO wear_applied (idempotency_key, ledger_id, tx_id, applied_at) VALUES (?, ?, ?, ?);"
        );
        try {
            stmt.bindString(1, idempotencyKey);
            stmt.bindString(2, ledgerId);
            stmt.bindString(3, txId);
            stmt.bindString(4, WearIds.nowIso());
            stmt.executeInsert();
        } finally {
            closeQuietly(stmt);
        }
    }

    private static void closeQuietly(SupportSQLiteStatement stmt) {
        if (stmt == null) {
            return;
        }
        try {
            stmt.close();
        } catch (Exception ignored) {
            // best-effort
        }
    }

    private static void bindNullable(SupportSQLiteStatement stmt, int index, String value) {
        if (value == null || value.isEmpty()) {
            stmt.bindNull(index);
        } else {
            stmt.bindString(index, value);
        }
    }

    private static boolean isUniqueConstraint(Throwable error) {
        String message = String.valueOf(error.getMessage());
        Throwable cause = error;
        while (cause != null) {
            message = message + " " + cause.getClass().getName() + " " + cause.getMessage();
            cause = cause.getCause();
        }
        return message.toLowerCase().contains("unique")
            || message.contains("idx_tx_idempotency")
            || message.contains("wear_applied");
    }
}
