package com.strawcoding.strawmoneybook.wear;

import android.content.Context;
import android.database.Cursor;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Canonical phone-side Wear transaction engine. Writes straw_money_book via
 * SQLCipher SupportSQLiteDatabase. Must not depend on Activity or Capacitor Bridge.
 *
 * Scope B applies expense, income, transfer, adjustment, credit_spend,
 * credit_repay, credit_refund and loan opening, plus watch-side edit/delete of
 * simple cash expense/income/adjustment rows. Cross-type restructuring stays
 * phone-only; the watch gets a `rejected` ack instead of a partial write.
 */
public final class WearTransactionEngine {
    private static final int RECENT_LIMIT = 10;
    private static final int CATALOG_LIMIT = 24;

    private WearTransactionEngine() {}

    public static JSONObject applyTxCreate(Context context, JSONObject payload, String activeLedgerId)
        throws Exception {
        AndroidDbRepository repo = AndroidDbRepository.get(context);
        return repo.withWriteLock(() -> {
            SupportSQLiteDatabase db = repo.openForWrite();
            return applyTxCreateOnDb(db, payload, activeLedgerId);
        });
    }

    public static JSONObject applyTxUpdate(Context context, JSONObject payload, String activeLedgerId)
        throws Exception {
        AndroidDbRepository repo = AndroidDbRepository.get(context);
        return repo.withWriteLock(() -> {
            SupportSQLiteDatabase db = repo.openForWrite();
            return applyTxUpdateOnDb(db, payload, activeLedgerId);
        });
    }

    public static JSONObject applyTxDelete(Context context, JSONObject payload, String activeLedgerId)
        throws Exception {
        AndroidDbRepository repo = AndroidDbRepository.get(context);
        return repo.withWriteLock(() -> {
            SupportSQLiteDatabase db = repo.openForWrite();
            return applyTxDeleteOnDb(db, payload, activeLedgerId);
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
                error.getMessage(),
                WearCompanionConstants.OP_CREATE
            );
        }

        JSONObject gate = preflight(
            db,
            parsed.idempotencyKey,
            parsed.ledgerId,
            activeLedgerId,
            WearCompanionConstants.OP_CREATE
        );
        if (gate != null) {
            return gate;
        }

        String accountKind = accountKind(db, parsed.ledgerId, parsed.accountId);
        if (accountKind == null) {
            return WearProtocol.ack(
                "catalog_stale",
                parsed.idempotencyKey,
                null,
                "account missing",
                WearCompanionConstants.OP_CREATE
            );
        }
        if (isSavingsJar(db, parsed.ledgerId, parsed.accountId)) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "savings jar not allowed",
                WearCompanionConstants.OP_CREATE
            );
        }

        String peerKind = null;
        if (parsed.peerAccountId != null && !parsed.peerAccountId.isEmpty()) {
            peerKind = accountKind(db, parsed.ledgerId, parsed.peerAccountId);
            if (peerKind == null) {
                return WearProtocol.ack(
                    "catalog_stale",
                    parsed.idempotencyKey,
                    null,
                    "peer account missing",
                    WearCompanionConstants.OP_CREATE
                );
            }
            if (isSavingsJar(db, parsed.ledgerId, parsed.peerAccountId)) {
                return WearProtocol.ack(
                    "rejected",
                    parsed.idempotencyKey,
                    null,
                    "savings jar not allowed",
                    WearCompanionConstants.OP_CREATE
                );
            }
        }

        boolean isCreditAccount = "credit".equals(accountKind);
        JSONObject kindGuard = guardAccountKind(parsed, isCreditAccount);
        if (kindGuard != null) {
            return kindGuard;
        }

        if (parsed.categoryId != null && !parsed.categoryId.isEmpty()) {
            String categoryKind = expectedCategoryKind(parsed);
            String categoryId = AndroidDbRepository.queryString(
                db,
                "SELECT id FROM categories"
                    + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL"
                    + " AND COALESCE(is_archived, 0) = 0 AND kind = ? LIMIT 1;",
                new String[] { parsed.ledgerId, parsed.categoryId, categoryKind }
            );
            if (categoryId == null) {
                return WearProtocol.ack(
                    "catalog_stale",
                    parsed.idempotencyKey,
                    null,
                    "category missing",
                    WearCompanionConstants.OP_CREATE
                );
            }
        }

        String occurredAt = parsed.occurredAt == null || parsed.occurredAt.isEmpty()
            ? WearIds.nowIso()
            : parsed.occurredAt;
        String note = parsed.note == null || parsed.note.isEmpty() ? null : parsed.note;

        db.beginTransaction();
        try {
            String txId = insertForType(db, parsed, occurredAt, note, isCreditAccount);
            insertWearApplied(db, parsed.idempotencyKey, parsed.ledgerId, txId);
            db.setTransactionSuccessful();
            return WearProtocol.ack(
                "ok",
                parsed.idempotencyKey,
                txId,
                null,
                WearCompanionConstants.OP_CREATE
            );
        } catch (Exception error) {
            if (!isUniqueConstraint(error)) {
                return WearProtocol.ack(
                    "rejected",
                    parsed.idempotencyKey,
                    null,
                    String.valueOf(error.getMessage()),
                    WearCompanionConstants.OP_CREATE
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
        return WearProtocol.ack(
            "duplicate",
            parsed.idempotencyKey,
            existing,
            null,
            WearCompanionConstants.OP_CREATE
        );
    }

    public static JSONObject applyTxUpdateOnDb(
        SupportSQLiteDatabase db,
        JSONObject payload,
        String activeLedgerId
    ) throws Exception {
        WearProtocol.WearTxUpdate parsed;
        try {
            parsed = WearProtocol.validateTxUpdate(payload);
        } catch (Exception error) {
            return WearProtocol.ack(
                "rejected",
                payload.optString("idempotencyKey", "").trim(),
                null,
                error.getMessage(),
                WearCompanionConstants.OP_UPDATE
            );
        }

        JSONObject gate = preflight(
            db,
            parsed.idempotencyKey,
            parsed.ledgerId,
            activeLedgerId,
            WearCompanionConstants.OP_UPDATE
        );
        if (gate != null) {
            return gate;
        }

        JSONObject target = findTargetRow(db, parsed.ledgerId, parsed.targetTxId);
        if (target == null) {
            return WearProtocol.ack(
                "catalog_stale",
                parsed.idempotencyKey,
                null,
                "transaction missing",
                WearCompanionConstants.OP_UPDATE
            );
        }
        JSONObject mutability = guardWatchMutable(db, parsed.ledgerId, parsed.targetTxId, target,
            parsed.idempotencyKey, WearCompanionConstants.OP_UPDATE);
        if (mutability != null) {
            return mutability;
        }
        if (!WearCompanionConstants.isEditableTxType(parsed.type)
            || !WearCompanionConstants.isEditableTxType(target.optString("type", ""))) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "edit this type on phone",
                WearCompanionConstants.OP_UPDATE
            );
        }

        String accountKind = accountKind(db, parsed.ledgerId, parsed.accountId);
        if (accountKind == null) {
            return WearProtocol.ack(
                "catalog_stale",
                parsed.idempotencyKey,
                null,
                "account missing",
                WearCompanionConstants.OP_UPDATE
            );
        }
        if (isSavingsJar(db, parsed.ledgerId, parsed.accountId)) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "savings jar not allowed",
                WearCompanionConstants.OP_UPDATE
            );
        }
        if (parsed.categoryId != null && !parsed.categoryId.isEmpty()) {
            String categoryKind = WearCompanionConstants.TYPE_INCOME.equals(parsed.type) ? "income" : "expense";
            String categoryId = AndroidDbRepository.queryString(
                db,
                "SELECT id FROM categories"
                    + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL"
                    + " AND COALESCE(is_archived, 0) = 0 AND kind = ? LIMIT 1;",
                new String[] { parsed.ledgerId, parsed.categoryId, categoryKind }
            );
            if (categoryId == null) {
                return WearProtocol.ack(
                    "catalog_stale",
                    parsed.idempotencyKey,
                    null,
                    "category missing",
                    WearCompanionConstants.OP_UPDATE
                );
            }
        }

        long signedAmount = signedAmountForType(parsed.type, parsed.amountMinor);
        String occurredAt = parsed.occurredAt == null || parsed.occurredAt.isEmpty()
            ? WearIds.nowIso()
            : parsed.occurredAt;
        String note = parsed.note == null || parsed.note.isEmpty() ? null : parsed.note;
        String tagsJson = WearProtocol.tagsJson(parsed.tags);

        db.beginTransaction();
        try {
            // posted_at deliberately untouched: statement assignment must not move.
            SupportSQLiteStatement stmt = db.compileStatement(
                "UPDATE transactions SET"
                    + " account_id = ?, peer_account_id = NULL, category_id = ?, amount_minor = ?,"
                    + " occurred_at = ?, note = ?,"
                    + " tags_json = CASE WHEN tags_json IS NULL OR TRIM(tags_json) = ''"
                    + " OR TRIM(tags_json) LIKE '[%' THEN ? ELSE tags_json END,"
                    + " include_in_budget = ?, include_in_analysis = ?,"
                    + " updated_by_display_name = 'Wear OS', updated_at = ?"
                    + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;"
            );
            try {
                stmt.bindString(1, parsed.accountId);
                bindNullable(stmt, 2, WearCompanionConstants.TYPE_ADJUSTMENT.equals(parsed.type)
                    ? target.optString("category_id", "")
                    : parsed.categoryId);
                stmt.bindLong(3, signedAmount);
                stmt.bindString(4, occurredAt);
                bindNullable(stmt, 5, note);
                bindNullable(stmt, 6, tagsJson);
                stmt.bindLong(7, parsed.includeInBudget ? 1 : 0);
                stmt.bindLong(8, parsed.includeInAnalysis ? 1 : 0);
                stmt.bindString(9, WearIds.nowIso());
                stmt.bindString(10, parsed.ledgerId);
                stmt.bindString(11, parsed.targetTxId);
                stmt.executeUpdateDelete();
            } finally {
                closeQuietly(stmt);
            }
            insertWearApplied(db, parsed.idempotencyKey, parsed.ledgerId, parsed.targetTxId);
            db.setTransactionSuccessful();
            return WearProtocol.ack(
                "ok",
                parsed.idempotencyKey,
                parsed.targetTxId,
                null,
                WearCompanionConstants.OP_UPDATE
            );
        } catch (Exception error) {
            if (!isUniqueConstraint(error)) {
                return WearProtocol.ack(
                    "rejected",
                    parsed.idempotencyKey,
                    null,
                    String.valueOf(error.getMessage()),
                    WearCompanionConstants.OP_UPDATE
                );
            }
        } finally {
            db.endTransaction();
        }
        return WearProtocol.ack(
            "duplicate",
            parsed.idempotencyKey,
            parsed.targetTxId,
            null,
            WearCompanionConstants.OP_UPDATE
        );
    }

    public static JSONObject applyTxDeleteOnDb(
        SupportSQLiteDatabase db,
        JSONObject payload,
        String activeLedgerId
    ) throws Exception {
        WearProtocol.WearTxDelete parsed;
        try {
            parsed = WearProtocol.validateTxDelete(payload);
        } catch (Exception error) {
            return WearProtocol.ack(
                "rejected",
                payload.optString("idempotencyKey", "").trim(),
                null,
                error.getMessage(),
                WearCompanionConstants.OP_DELETE
            );
        }

        JSONObject gate = preflight(
            db,
            parsed.idempotencyKey,
            parsed.ledgerId,
            activeLedgerId,
            WearCompanionConstants.OP_DELETE
        );
        if (gate != null) {
            return gate;
        }

        JSONObject target = findTargetRow(db, parsed.ledgerId, parsed.targetTxId);
        if (target == null) {
            return WearProtocol.ack(
                "catalog_stale",
                parsed.idempotencyKey,
                null,
                "transaction missing",
                WearCompanionConstants.OP_DELETE
            );
        }
        if (!target.optString("deleted_at", "").isEmpty()) {
            db.beginTransaction();
            try {
                insertWearApplied(db, parsed.idempotencyKey, parsed.ledgerId, parsed.targetTxId);
                db.setTransactionSuccessful();
            } catch (Exception ignored) {
                // already recorded
            } finally {
                db.endTransaction();
            }
            return WearProtocol.ack(
                "duplicate",
                parsed.idempotencyKey,
                parsed.targetTxId,
                null,
                WearCompanionConstants.OP_DELETE
            );
        }
        JSONObject mutability = guardWatchMutable(db, parsed.ledgerId, parsed.targetTxId, target,
            parsed.idempotencyKey, WearCompanionConstants.OP_DELETE);
        if (mutability != null) {
            return mutability;
        }
        String originType = target.optString("origin_type", "");
        if ("loan_payment".equals(originType) || "reimbursement".equals(originType)) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "delete this record on phone",
                WearCompanionConstants.OP_DELETE
            );
        }

        String now = WearIds.nowIso();
        db.beginTransaction();
        try {
            String transferGroupId = target.optString("transfer_group_id", "");
            // origin_type='wear' rows keep idempotency_key so replays stay duplicates.
            String sql = "UPDATE transactions SET deleted_at = ?, updated_at = ?,"
                + " updated_by_display_name = 'Wear OS',"
                + " idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND ";
            SupportSQLiteStatement stmt = db.compileStatement(
                transferGroupId.isEmpty()
                    ? sql + "id = ?;"
                    : sql + "transfer_group_id = ?;"
            );
            try {
                stmt.bindString(1, now);
                stmt.bindString(2, now);
                stmt.bindString(3, parsed.ledgerId);
                stmt.bindString(4, transferGroupId.isEmpty() ? parsed.targetTxId : transferGroupId);
                stmt.executeUpdateDelete();
            } finally {
                closeQuietly(stmt);
            }
            softDeletePostings(db, parsed.ledgerId, parsed.targetTxId, now);
            insertWearApplied(db, parsed.idempotencyKey, parsed.ledgerId, parsed.targetTxId);
            db.setTransactionSuccessful();
            return WearProtocol.ack(
                "ok",
                parsed.idempotencyKey,
                parsed.targetTxId,
                null,
                WearCompanionConstants.OP_DELETE
            );
        } catch (Exception error) {
            if (!isUniqueConstraint(error)) {
                return WearProtocol.ack(
                    "rejected",
                    parsed.idempotencyKey,
                    null,
                    String.valueOf(error.getMessage()),
                    WearCompanionConstants.OP_DELETE
                );
            }
        } finally {
            db.endTransaction();
        }
        return WearProtocol.ack(
            "duplicate",
            parsed.idempotencyKey,
            parsed.targetTxId,
            null,
            WearCompanionConstants.OP_DELETE
        );
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
        snapshot.put("ledgers", buildLedgers(db));
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
            snapshot.put("assetsTotalMinor", 0);
            snapshot.put("accounts", new JSONArray());
            snapshot.put("categories", new JSONArray());
            snapshot.put("recentTxs", new JSONArray());
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
        snapshot.put("assetsTotalMinor", queryAssetsTotalMinor(db, ledgerId));
        putBudgetSummary(db, snapshot, ledgerId);

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

        snapshot.put("accounts", buildAccounts(db, ledgerId));
        snapshot.put("categories", buildCategories(db, ledgerId));
        snapshot.put("loans", buildLoanSummary(db, ledgerId));
        snapshot.put("recentTxs", buildRecentTxs(db, ledgerId));
        return snapshot;
    }

    private static JSONObject preflight(
        SupportSQLiteDatabase db,
        String idempotencyKey,
        String ledgerId,
        String activeLedgerId,
        String op
    ) throws Exception {
        long schemaVersion = AndroidDbRepository.queryLong(
            db,
            "SELECT MAX(version) FROM schema_migrations;",
            null,
            0L
        );
        if (schemaVersion < WearCompanionConstants.REQUIRED_SCHEMA_VERSION) {
            return WearProtocol.ack(
                "schema_upgrade_required",
                idempotencyKey,
                null,
                "open StrawMB on phone to finish update",
                op
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
                idempotencyKey,
                null,
                "complete StrawMB setup on phone",
                op
            );
        }

        String appliedTxId = AndroidDbRepository.queryString(
            db,
            "SELECT tx_id FROM wear_applied WHERE idempotency_key = ? LIMIT 1;",
            new String[] { idempotencyKey }
        );
        if (appliedTxId != null) {
            return WearProtocol.ack("duplicate", idempotencyKey, appliedTxId, null, op);
        }

        String active = activeLedgerId == null ? "" : activeLedgerId.trim();
        if (!active.isEmpty() && !active.equals(ledgerId)) {
            return WearProtocol.ack(
                "ledger_mismatch",
                idempotencyKey,
                null,
                "phone active ledger changed",
                op
            );
        }

        String resolvedLedger = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM ledgers WHERE id = ? AND deleted_at IS NULL LIMIT 1;",
            new String[] { ledgerId }
        );
        if (resolvedLedger == null) {
            return WearProtocol.ack("ledger_mismatch", idempotencyKey, null, "ledger not on phone", op);
        }
        return null;
    }

    private static JSONObject guardAccountKind(WearProtocol.WearTxCreate parsed, boolean isCreditAccount)
        throws Exception {
        boolean needsCredit = WearCompanionConstants.TYPE_CREDIT_SPEND.equals(parsed.type)
            || WearCompanionConstants.TYPE_CREDIT_REPAY.equals(parsed.type)
            || WearCompanionConstants.TYPE_CREDIT_REFUND.equals(parsed.type);
        if (needsCredit && !isCreditAccount) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                parsed.type + " requires a credit account",
                WearCompanionConstants.OP_CREATE
            );
        }
        if (isCreditAccount && WearCompanionConstants.TYPE_INCOME.equals(parsed.type)) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                "credit income not supported on watch",
                WearCompanionConstants.OP_CREATE
            );
        }
        if (isCreditAccount
            && (WearCompanionConstants.TYPE_TRANSFER.equals(parsed.type)
                || WearCompanionConstants.TYPE_LOAN.equals(parsed.type))) {
            return WearProtocol.ack(
                "rejected",
                parsed.idempotencyKey,
                null,
                parsed.type + " needs a cash account",
                WearCompanionConstants.OP_CREATE
            );
        }
        return null;
    }

    private static String expectedCategoryKind(WearProtocol.WearTxCreate parsed) {
        if (WearCompanionConstants.TYPE_INCOME.equals(parsed.type)) {
            return "income";
        }
        if (WearCompanionConstants.TYPE_LOAN.equals(parsed.type) && "borrow".equals(parsed.loanDirection)) {
            return "income";
        }
        return "expense";
    }

    private static String insertForType(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note,
        boolean isCreditAccount
    ) throws Exception {
        switch (parsed.type) {
            case WearCompanionConstants.TYPE_TRANSFER:
                return insertTransfer(db, parsed, occurredAt, note);
            case WearCompanionConstants.TYPE_CREDIT_SPEND:
                return insertCreditPurchase(db, parsed, occurredAt, note);
            case WearCompanionConstants.TYPE_CREDIT_REPAY:
                return insertCreditRepayment(db, parsed, occurredAt, note);
            case WearCompanionConstants.TYPE_CREDIT_REFUND:
                return insertCreditRefund(db, parsed, occurredAt, note);
            case WearCompanionConstants.TYPE_LOAN:
                return insertLoanOpening(db, parsed, occurredAt, note);
            case WearCompanionConstants.TYPE_ADJUSTMENT:
            case WearCompanionConstants.TYPE_INCOME:
            case WearCompanionConstants.TYPE_EXPENSE:
            default:
                // A plain expense on a credit account is a card purchase.
                if (isCreditAccount && WearCompanionConstants.TYPE_EXPENSE.equals(parsed.type)) {
                    return insertCreditPurchase(db, parsed, occurredAt, note);
                }
                return insertCashTransaction(db, parsed, occurredAt, note);
        }
    }

    private static long signedAmountForType(String type, long amountMinor) {
        if (WearCompanionConstants.TYPE_INCOME.equals(type)) {
            return Math.abs(amountMinor);
        }
        if (WearCompanionConstants.TYPE_ADJUSTMENT.equals(type)) {
            return amountMinor;
        }
        return -Math.abs(amountMinor);
    }

    private static String insertCashTransaction(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) {
        long signedAmount = signedAmountForType(parsed.type, parsed.amountMinor);
        return insertTransactionRow(
            db,
            parsed.ledgerId,
            parsed.type,
            null,
            parsed.accountId,
            null,
            parsed.categoryId,
            signedAmount,
            occurredAt,
            note,
            WearProtocol.tagsJson(parsed.tags),
            WearCompanionConstants.externalRefId(parsed.idempotencyKey),
            parsed.idempotencyKey,
            parsed.includeInBudget,
            parsed.includeInAnalysis
        );
    }

    private static String insertTransfer(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) {
        String groupId = WearIds.createId("tf");
        String tagsJson = WearProtocol.tagsJson(parsed.tags);
        long magnitude = Math.abs(parsed.amountMinor);
        String outTxId = insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_TRANSFER,
            groupId,
            parsed.accountId,
            parsed.peerAccountId,
            null,
            -magnitude,
            occurredAt,
            note,
            tagsJson,
            WearCompanionConstants.externalRefId(parsed.idempotencyKey),
            parsed.idempotencyKey + ":out",
            parsed.includeInBudget,
            parsed.includeInAnalysis
        );
        insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_TRANSFER,
            groupId,
            parsed.peerAccountId,
            parsed.accountId,
            null,
            magnitude,
            occurredAt,
            note,
            tagsJson,
            WearCompanionConstants.externalRefId(parsed.idempotencyKey),
            parsed.idempotencyKey + ":in",
            parsed.includeInBudget,
            parsed.includeInAnalysis
        );
        return outTxId;
    }

    private static String insertCreditPurchase(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) throws Exception {
        assertNoVirtualAccrualAccounts(db, parsed.ledgerId);
        String statementId = requireOpenStatement(db, parsed.ledgerId, parsed.accountId, occurredAt);

        long liability = -Math.abs(parsed.amountMinor);
        String txId = insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_EXPENSE,
            null,
            parsed.accountId,
            null,
            parsed.categoryId,
            liability,
            occurredAt,
            note,
            "{\"credit_purchase\":true}",
            WearCompanionConstants.externalRefId(parsed.idempotencyKey),
            parsed.idempotencyKey,
            parsed.includeInBudget,
            parsed.includeInAnalysis
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
            parsed.includeInBudget ? 1 : 0,
            parsed.includeInAnalysis ? 1 : 0
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

    /**
     * Repayment mirrors createCreditRepayment: a cash transfer plus FIFO
     * allocations over unpaid statements. paid must equal SUM(allocations), so a
     * short allocation plan aborts instead of writing a partial repayment.
     */
    private static String insertCreditRepayment(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) throws Exception {
        String sourceAccountId = parsed.sourceAccountId == null || parsed.sourceAccountId.isEmpty()
            ? parsed.peerAccountId
            : parsed.sourceAccountId;
        if (sourceAccountId == null || sourceAccountId.isEmpty()) {
            throw new IllegalStateException("credit_repay requires sourceAccountId");
        }
        long amountMinor = Math.abs(parsed.amountMinor);

        List<String> statementIds = new ArrayList<>();
        List<Long> statementRemaining = new ArrayList<>();
        Cursor cursor = db.query(
            "SELECT s.id,"
                + " CASE WHEN s.status = 'closed' THEN COALESCE(s.closing_balance_minor, 0)"
                + "   ELSE COALESCE((SELECT SUM(ABS(p.amount_minor)) FROM transaction_postings p"
                + "     WHERE p.ledger_id = s.ledger_id AND p.statement_id = s.id"
                + "       AND p.role = 'card_liability' AND p.deleted_at IS NULL), 0) END"
                + " - COALESCE((SELECT SUM(a.amount_minor) FROM credit_repayment_allocations a"
                + "   WHERE a.ledger_id = s.ledger_id AND a.statement_id = s.id AND a.deleted_at IS NULL), 0)"
                + " AS remaining_minor"
                + " FROM credit_statements s"
                + " WHERE s.ledger_id = ? AND s.account_id = ? AND s.deleted_at IS NULL"
                + " ORDER BY s.period_start_inclusive ASC;",
            new String[] { parsed.ledgerId, parsed.accountId }
        );
        try {
            while (cursor.moveToNext()) {
                long remaining = cursor.getLong(1);
                if (remaining > 0L) {
                    statementIds.add(cursor.getString(0));
                    statementRemaining.add(remaining);
                }
            }
        } finally {
            cursor.close();
        }

        List<String> allocStatementIds = new ArrayList<>();
        List<Long> allocAmounts = new ArrayList<>();
        long left = amountMinor;
        for (int i = 0; i < statementIds.size() && left > 0L; i += 1) {
            long take = Math.min(left, statementRemaining.get(i));
            if (take <= 0L) {
                continue;
            }
            allocStatementIds.add(statementIds.get(i));
            allocAmounts.add(take);
            left -= take;
        }
        if (left > 0L) {
            throw new IllegalStateException("repayment exceeds unpaid statement balance");
        }

        // Mirrors createCreditRepayment: the cash legs stay plain manual transfers
        // and credit_repayments.idempotency_key carries the watch identity.
        String groupId = WearIds.createId("tf");
        String repayNote = note == null ? "信用卡還款" : note;
        String outTxId = insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_TRANSFER,
            groupId,
            sourceAccountId,
            parsed.accountId,
            null,
            -amountMinor,
            occurredAt,
            repayNote,
            null,
            null,
            null,
            false,
            false,
            "manual"
        );
        insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_TRANSFER,
            groupId,
            parsed.accountId,
            sourceAccountId,
            null,
            amountMinor,
            occurredAt,
            repayNote,
            null,
            null,
            null,
            false,
            false,
            "manual"
        );

        String repaymentId = WearIds.createId("crp");
        String now = WearIds.nowIso();
        SupportSQLiteStatement repayStmt = db.compileStatement(
            "INSERT INTO credit_repayments ("
                + "ledger_id, id, account_id, source_account_id, amount_minor, paid_at,"
                + " transfer_group_id, idempotency_key, note, created_at, updated_at, deleted_at"
                + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);"
        );
        try {
            repayStmt.bindString(1, parsed.ledgerId);
            repayStmt.bindString(2, repaymentId);
            repayStmt.bindString(3, parsed.accountId);
            repayStmt.bindString(4, sourceAccountId);
            repayStmt.bindLong(5, amountMinor);
            repayStmt.bindString(6, occurredAt);
            repayStmt.bindString(7, groupId);
            repayStmt.bindString(8, parsed.idempotencyKey);
            bindNullable(repayStmt, 9, note);
            repayStmt.bindString(10, now);
            repayStmt.bindString(11, now);
            repayStmt.executeInsert();
        } finally {
            closeQuietly(repayStmt);
        }

        for (int i = 0; i < allocStatementIds.size(); i += 1) {
            SupportSQLiteStatement allocStmt = db.compileStatement(
                "INSERT INTO credit_repayment_allocations ("
                    + "ledger_id, id, repayment_id, statement_id, amount_minor, created_at, updated_at, deleted_at"
                    + ") VALUES (?, ?, ?, ?, ?, ?, ?, NULL);"
            );
            try {
                allocStmt.bindString(1, parsed.ledgerId);
                allocStmt.bindString(2, WearIds.createId("cra"));
                allocStmt.bindString(3, repaymentId);
                allocStmt.bindString(4, allocStatementIds.get(i));
                allocStmt.bindLong(5, allocAmounts.get(i));
                allocStmt.bindString(6, now);
                allocStmt.bindString(7, now);
                allocStmt.executeInsert();
            } finally {
                closeQuietly(allocStmt);
            }
        }
        return outTxId;
    }

    /** Refund posts an adjustment into the current OPEN statement only. */
    private static String insertCreditRefund(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) throws Exception {
        String openStatementId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM credit_statements"
                + " WHERE ledger_id = ? AND account_id = ? AND deleted_at IS NULL AND status = 'open'"
                + " ORDER BY period_start_inclusive DESC LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.accountId }
        );
        if (openStatementId == null) {
            throw new IllegalStateException("no open credit statement");
        }
        // Mirrors buildCreditRefundAdjustmentPlan: positive amount on the card
        // (liability decrease), origin_type refund, credit_adjustment marker.
        long credit = Math.abs(parsed.amountMinor);
        String txId = insertTransactionRow(
            db,
            parsed.ledgerId,
            WearCompanionConstants.TYPE_ADJUSTMENT,
            null,
            parsed.accountId,
            null,
            parsed.categoryId,
            credit,
            occurredAt,
            note == null ? "信用卡退款／調整" : note,
            "{\"credit_adjustment\":true}",
            WearCompanionConstants.externalRefId(parsed.idempotencyKey),
            parsed.idempotencyKey,
            false,
            false,
            "refund"
        );
        insertPosting(
            db,
            parsed.ledgerId,
            txId,
            "adjustment",
            parsed.accountId,
            null,
            credit,
            openStatementId,
            0,
            0
        );
        return txId;
    }

    /**
     * Loan opening writes the loan row plus its funding transaction, matching
     * createLoanWithOptionalTransaction. Repayments stay phone-only.
     */
    private static String insertLoanOpening(
        SupportSQLiteDatabase db,
        WearProtocol.WearTxCreate parsed,
        String occurredAt,
        String note
    ) throws Exception {
        String now = WearIds.nowIso();
        String counterpartyId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM counterparties WHERE ledger_id = ? AND name = ? LIMIT 1;",
            new String[] { parsed.ledgerId, parsed.counterpartyName }
        );
        if (counterpartyId == null) {
            counterpartyId = WearIds.createId("cp");
            SupportSQLiteStatement cpStmt = db.compileStatement(
                "INSERT INTO counterparties (ledger_id, id, name, contact_json, note, is_archived, created_at, updated_at)"
                    + " VALUES (?, ?, ?, NULL, NULL, 0, ?, ?);"
            );
            try {
                cpStmt.bindString(1, parsed.ledgerId);
                cpStmt.bindString(2, counterpartyId);
                cpStmt.bindString(3, parsed.counterpartyName);
                cpStmt.bindString(4, now);
                cpStmt.bindString(5, now);
                cpStmt.executeInsert();
            } finally {
                closeQuietly(cpStmt);
            }
        }

        String loanId = WearIds.createId("loan");
        long principal = Math.abs(parsed.amountMinor);
        SupportSQLiteStatement loanStmt = db.compileStatement(
            "INSERT INTO loans (ledger_id, id, counterparty_id, direction, principal_minor,"
                + " interest_rule_json, start_date, due_date, status, settled_at, note,"
                + " created_at, updated_at, deleted_at)"
                + " VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 'active', NULL, ?, ?, ?, NULL);"
        );
        try {
            loanStmt.bindString(1, parsed.ledgerId);
            loanStmt.bindString(2, loanId);
            loanStmt.bindString(3, counterpartyId);
            loanStmt.bindString(4, parsed.loanDirection);
            loanStmt.bindLong(5, principal);
            loanStmt.bindString(6, occurredAt.length() >= 10 ? occurredAt.substring(0, 10) : occurredAt);
            bindNullable(loanStmt, 7, note);
            loanStmt.bindString(8, now);
            loanStmt.bindString(9, now);
            loanStmt.executeInsert();
        } finally {
            closeQuietly(loanStmt);
        }

        boolean lend = "lend".equals(parsed.loanDirection);
        String txType = lend ? WearCompanionConstants.TYPE_EXPENSE : WearCompanionConstants.TYPE_INCOME;
        long amount = lend ? -principal : principal;
        return insertTransactionRow(
            db,
            parsed.ledgerId,
            txType,
            null,
            parsed.accountId,
            null,
            parsed.categoryId,
            amount,
            occurredAt,
            note == null ? "借貸建立：" + parsed.counterpartyName : note,
            WearProtocol.tagsJson(parsed.tags),
            loanId,
            null,
            false,
            false,
            "loan_payment"
        );
    }

    private static void assertNoVirtualAccrualAccounts(SupportSQLiteDatabase db, String ledgerId) {
        String forbidden = AndroidDbRepository.queryString(
            db,
            "SELECT 1 FROM accounts WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND (LOWER(name) LIKE '%credit-accrual%' OR name LIKE '%信用卡應計%') LIMIT 1;",
            new String[] { ledgerId }
        );
        if (forbidden != null) {
            throw new IllegalStateException("forbidden virtual accrual account");
        }
    }

    private static String requireOpenStatement(
        SupportSQLiteDatabase db,
        String ledgerId,
        String accountId,
        String occurredAt
    ) {
        String statementId = AndroidDbRepository.queryString(
            db,
            "SELECT id FROM credit_statements"
                + " WHERE ledger_id = ? AND account_id = ? AND deleted_at IS NULL"
                + " AND status = 'open'"
                + " AND period_start_inclusive <= ? AND period_end_exclusive > ?"
                + " ORDER BY period_start_inclusive DESC LIMIT 1;",
            new String[] { ledgerId, accountId, occurredAt, occurredAt }
        );
        if (statementId == null) {
            throw new IllegalStateException("no open credit statement");
        }
        return statementId;
    }

    private static JSONObject findTargetRow(SupportSQLiteDatabase db, String ledgerId, String txId) throws Exception {
        Cursor cursor = db.query(
            "SELECT id, type, origin_type, transfer_group_id, category_id, amount_minor,"
                + " COALESCE(deleted_at, '') AS deleted_at"
                + " FROM transactions WHERE ledger_id = ? AND id = ? LIMIT 1;",
            new String[] { ledgerId, txId }
        );
        try {
            if (!cursor.moveToNext()) {
                return null;
            }
            JSONObject row = new JSONObject();
            row.put("id", cursor.getString(0));
            row.put("type", cursor.getString(1));
            row.put("origin_type", cursor.getString(2));
            row.put("transfer_group_id", cursor.isNull(3) ? "" : cursor.getString(3));
            row.put("category_id", cursor.isNull(4) ? "" : cursor.getString(4));
            row.put("amount_minor", cursor.getLong(5));
            row.put("deleted_at", cursor.getString(6));
            return row;
        } finally {
            cursor.close();
        }
    }

    /** Closed credit statements and transfer groups are never mutated from the watch. */
    private static JSONObject guardWatchMutable(
        SupportSQLiteDatabase db,
        String ledgerId,
        String txId,
        JSONObject target,
        String idempotencyKey,
        String op
    ) throws Exception {
        if (!target.optString("transfer_group_id", "").isEmpty()) {
            return WearProtocol.ack(
                "rejected",
                idempotencyKey,
                null,
                "handle transfers on phone",
                op
            );
        }
        String closedStatement = AndroidDbRepository.queryString(
            db,
            "SELECT s.id FROM transaction_postings p"
                + " JOIN credit_statements s ON s.ledger_id = p.ledger_id AND s.id = p.statement_id"
                + " WHERE p.ledger_id = ? AND p.transaction_id = ? AND p.deleted_at IS NULL"
                + " AND s.status = 'closed' LIMIT 1;",
            new String[] { ledgerId, txId }
        );
        if (closedStatement != null) {
            return WearProtocol.ack(
                "rejected",
                idempotencyKey,
                null,
                "closed statement is locked",
                op
            );
        }
        return null;
    }

    private static void softDeletePostings(
        SupportSQLiteDatabase db,
        String ledgerId,
        String txId,
        String now
    ) {
        SupportSQLiteStatement stmt = db.compileStatement(
            "UPDATE transaction_postings SET deleted_at = ?, updated_at = ?"
                + " WHERE ledger_id = ? AND transaction_id = ? AND deleted_at IS NULL;"
        );
        try {
            stmt.bindString(1, now);
            stmt.bindString(2, now);
            stmt.bindString(3, ledgerId);
            stmt.bindString(4, txId);
            stmt.executeUpdateDelete();
        } finally {
            closeQuietly(stmt);
        }
    }

    private static String accountKind(SupportSQLiteDatabase db, String ledgerId, String accountId) {
        return AndroidDbRepository.queryString(
            db,
            "SELECT account_kind FROM accounts"
                + " WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL AND COALESCE(is_archived, 0) = 0"
                + " LIMIT 1;",
            new String[] { ledgerId, accountId }
        );
    }

    private static boolean isSavingsJar(SupportSQLiteDatabase db, String ledgerId, String accountId) {
        return AndroidDbRepository.queryString(
            db,
            "SELECT 1 FROM savings_jars WHERE ledger_id = ? AND account_id = ? LIMIT 1;",
            new String[] { ledgerId, accountId }
        ) != null;
    }

    private static long queryAssetsTotalMinor(SupportSQLiteDatabase db, String ledgerId) {
        return AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(a.opening_balance_minor + COALESCE(t.sum_minor, 0)), 0)"
                + " FROM accounts a"
                + " LEFT JOIN (SELECT ledger_id, account_id, SUM(amount_minor) AS sum_minor"
                + "   FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL"
                + "   GROUP BY ledger_id, account_id) t"
                + "   ON t.ledger_id = a.ledger_id AND t.account_id = a.id"
                + " WHERE a.ledger_id = ? AND a.deleted_at IS NULL"
                + " AND COALESCE(a.is_archived, 0) = 0"
                + " AND COALESCE(a.include_in_assets, 1) = 1;",
            new String[] { ledgerId, ledgerId },
            0L
        );
    }

    /**
     * Budget remaining uses the budget period that contains today, so payroll
     * cycles are respected instead of assuming a calendar month.
     */
    private static void putBudgetSummary(SupportSQLiteDatabase db, JSONObject snapshot, String ledgerId)
        throws Exception {
        Cursor cursor = db.query(
            "SELECT id, COALESCE(period_start_date, month_key || '-01') AS start_date,"
                + " COALESCE(period_end_date, date(month_key || '-01', '+1 month', '-1 day')) AS end_date"
                + " FROM budgets WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND date('now', 'localtime') BETWEEN"
                + "   COALESCE(period_start_date, month_key || '-01')"
                + "   AND COALESCE(period_end_date, date(month_key || '-01', '+1 month', '-1 day'))"
                + " ORDER BY start_date DESC LIMIT 1;",
            new String[] { ledgerId }
        );
        String budgetId = null;
        String startDate = null;
        String endDate = null;
        try {
            if (cursor.moveToNext()) {
                budgetId = cursor.getString(0);
                startDate = cursor.getString(1);
                endDate = cursor.getString(2);
            }
        } finally {
            cursor.close();
        }
        if (budgetId == null) {
            snapshot.put("budgetPeriodKey", "");
            return;
        }

        long planned = AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(amount_minor), 0) FROM budget_items"
                + " WHERE ledger_id = ? AND budget_id = ?;",
            new String[] { ledgerId, budgetId },
            0L
        );
        long spent = AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(ABS(amount_minor)), 0) FROM transactions"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND type = 'expense'"
                + " AND include_in_budget = 1"
                + " AND date(occurred_at) BETWEEN date(?) AND date(?);",
            new String[] { ledgerId, startDate, endDate },
            0L
        );
        snapshot.put("budgetPlannedMinor", planned);
        snapshot.put("budgetSpentMinor", spent);
        snapshot.put("budgetRemainingMinor", planned - spent);
        snapshot.put("budgetPeriodStart", startDate);
        snapshot.put("budgetPeriodEnd", endDate);
    }

    private static JSONArray buildLedgers(SupportSQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        Cursor cursor = db.query(
            "SELECT id, name FROM ledgers WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 12;",
            new String[0]
        );
        try {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("name", cursor.getString(1));
                out.put(row);
            }
        } finally {
            cursor.close();
        }
        return out;
    }

    /**
     * Accounts and categories carry usage counters derived from the last 90 days.
     * There is no stored favourite flag, so `recent` means used lately and
     * `favorite` means among the most used in that window.
     */
    private static JSONArray buildAccounts(SupportSQLiteDatabase db, String ledgerId) throws Exception {
        JSONArray out = new JSONArray();
        Cursor cursor = db.query(
            "SELECT a.id, a.name, a.account_kind, a.currency_code,"
                + " a.opening_balance_minor + COALESCE((SELECT SUM(t.amount_minor) FROM transactions t"
                + "   WHERE t.ledger_id = a.ledger_id AND t.account_id = a.id AND t.deleted_at IS NULL), 0)"
                + "   AS balance_minor,"
                + " COALESCE((SELECT COUNT(1) FROM transactions t2"
                + "   WHERE t2.ledger_id = a.ledger_id AND t2.account_id = a.id AND t2.deleted_at IS NULL"
                + "     AND date(t2.occurred_at) >= date('now', 'localtime', '-90 day')), 0) AS usage_count,"
                + " COALESCE((SELECT MAX(t3.occurred_at) FROM transactions t3"
                + "   WHERE t3.ledger_id = a.ledger_id AND t3.account_id = a.id AND t3.deleted_at IS NULL), '')"
                + "   AS last_used_at"
                + " FROM accounts a"
                + " WHERE a.ledger_id = ? AND a.deleted_at IS NULL AND COALESCE(a.is_archived, 0) = 0"
                + " AND a.id NOT IN (SELECT account_id FROM savings_jars WHERE ledger_id = ?)"
                + " ORDER BY usage_count DESC, a.sort_order ASC, a.created_at ASC LIMIT " + CATALOG_LIMIT + ";",
            new String[] { ledgerId, ledgerId }
        );
        try {
            int index = 0;
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("name", cursor.getString(1));
                row.put("kind", cursor.getString(2));
                row.put("currencyCode", cursor.isNull(3) ? "TWD" : cursor.getString(3));
                row.put("balanceMinor", cursor.getLong(4));
                long usage = cursor.getLong(5);
                row.put("usageCount", usage);
                row.put("lastUsedAt", cursor.getString(6));
                row.put("recent", usage > 0);
                row.put("favorite", usage > 0 && index < 4);
                out.put(row);
                index += 1;
            }
        } finally {
            cursor.close();
        }
        return out;
    }

    private static JSONArray buildCategories(SupportSQLiteDatabase db, String ledgerId) throws Exception {
        JSONArray out = new JSONArray();
        Cursor cursor = db.query(
            "SELECT c.id, c.name, c.kind, c.icon,"
                + " COALESCE((SELECT COUNT(1) FROM transactions t"
                + "   WHERE t.ledger_id = c.ledger_id AND t.category_id = c.id AND t.deleted_at IS NULL"
                + "     AND date(t.occurred_at) >= date('now', 'localtime', '-90 day')), 0) AS usage_count"
                + " FROM categories c"
                + " WHERE c.ledger_id = ? AND c.deleted_at IS NULL AND COALESCE(c.is_archived, 0) = 0"
                + " AND c.kind IN ('expense','income')"
                + " ORDER BY usage_count DESC, c.sort_order ASC, c.created_at ASC LIMIT 40;",
            new String[] { ledgerId }
        );
        try {
            int expenseRank = 0;
            int incomeRank = 0;
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("name", cursor.getString(1));
                String kind = cursor.getString(2);
                row.put("kind", kind);
                row.put("icon", cursor.isNull(3) ? "" : cursor.getString(3));
                long usage = cursor.getLong(4);
                row.put("usageCount", usage);
                row.put("recent", usage > 0);
                int rank = "income".equals(kind) ? incomeRank++ : expenseRank++;
                row.put("favorite", usage > 0 && rank < 6);
                out.put(row);
            }
        } finally {
            cursor.close();
        }
        return out;
    }

    private static JSONObject buildLoanSummary(SupportSQLiteDatabase db, String ledgerId) throws Exception {
        JSONObject summary = new JSONObject();
        summary.put("activeCount", AndroidDbRepository.queryLong(
            db,
            "SELECT COUNT(1) FROM loans WHERE ledger_id = ? AND deleted_at IS NULL"
                + " AND status IN ('active','partial');",
            new String[] { ledgerId },
            0L
        ));
        summary.put("receivableMinor", AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(principal_minor), 0) FROM loans"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND direction = 'lend'"
                + " AND status IN ('active','partial');",
            new String[] { ledgerId },
            0L
        ));
        summary.put("payableMinor", AndroidDbRepository.queryLong(
            db,
            "SELECT COALESCE(SUM(principal_minor), 0) FROM loans"
                + " WHERE ledger_id = ? AND deleted_at IS NULL AND direction = 'borrow'"
                + " AND status IN ('active','partial');",
            new String[] { ledgerId },
            0L
        ));
        return summary;
    }

    private static JSONArray buildRecentTxs(SupportSQLiteDatabase db, String ledgerId) throws Exception {
        JSONArray recent = new JSONArray();
        Cursor cursor = db.query(
            "SELECT t.id, t.type, t.amount_minor, t.note, t.occurred_at, t.origin_type,"
                + " COALESCE(t.transfer_group_id, '') AS transfer_group_id,"
                + " COALESCE(t.category_id, '') AS category_id,"
                + " COALESCE(c.name, '') AS category_name,"
                + " t.account_id, COALESCE(a.name, '') AS account_name,"
                + " COALESCE(a.account_kind, 'cash') AS account_kind,"
                + " COALESCE(t.tags_json, '') AS tags_json"
                + " FROM transactions t"
                + " LEFT JOIN categories c ON c.ledger_id = t.ledger_id AND c.id = t.category_id"
                + " LEFT JOIN accounts a ON a.ledger_id = t.ledger_id AND a.id = t.account_id"
                + " WHERE t.ledger_id = ? AND t.deleted_at IS NULL"
                + " ORDER BY t.occurred_at DESC LIMIT " + RECENT_LIMIT + ";",
            new String[] { ledgerId }
        );
        try {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("type", cursor.getString(1));
                row.put("amountMinor", cursor.getLong(2));
                row.put("note", cursor.isNull(3) ? "" : cursor.getString(3));
                row.put("occurredAt", cursor.getString(4));
                row.put("originType", cursor.getString(5));
                String transferGroupId = cursor.getString(6);
                row.put("transferGroupId", transferGroupId);
                row.put("categoryId", cursor.getString(7));
                row.put("categoryName", cursor.getString(8));
                row.put("accountId", cursor.getString(9));
                row.put("accountName", cursor.getString(10));
                row.put("accountKind", cursor.getString(11));
                row.put("tagsJson", cursor.getString(12));
                boolean editable = transferGroupId.isEmpty()
                    && WearCompanionConstants.isEditableTxType(cursor.getString(1))
                    && !"loan_payment".equals(cursor.getString(5))
                    && !"reimbursement".equals(cursor.getString(5));
                row.put("editable", editable);
                recent.put(row);
            }
        } finally {
            cursor.close();
        }
        return recent;
    }

    private static String insertTransactionRow(
        SupportSQLiteDatabase db,
        String ledgerId,
        String type,
        String transferGroupId,
        String accountId,
        String peerAccountId,
        String categoryId,
        long amountMinor,
        String occurredAt,
        String note,
        String tagsJson,
        String externalRefId,
        String idempotencyKey,
        boolean includeInBudget,
        boolean includeInAnalysis
    ) {
        return insertTransactionRow(
            db,
            ledgerId,
            type,
            transferGroupId,
            accountId,
            peerAccountId,
            categoryId,
            amountMinor,
            occurredAt,
            note,
            tagsJson,
            externalRefId,
            idempotencyKey,
            includeInBudget,
            includeInAnalysis,
            "wear"
        );
    }

    private static String insertTransactionRow(
        SupportSQLiteDatabase db,
        String ledgerId,
        String type,
        String transferGroupId,
        String accountId,
        String peerAccountId,
        String categoryId,
        long amountMinor,
        String occurredAt,
        String note,
        String tagsJson,
        String externalRefId,
        String idempotencyKey,
        boolean includeInBudget,
        boolean includeInAnalysis,
        String originType
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
                + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, 'none',"
                + " NULL, NULL, ?, ?, NULL, 'Wear OS', NULL, 'Wear OS', ?, ?);"
        );
        try {
            stmt.bindString(1, ledgerId);
            stmt.bindString(2, txId);
            stmt.bindString(3, type);
            bindNullable(stmt, 4, transferGroupId);
            stmt.bindString(5, accountId);
            bindNullable(stmt, 6, peerAccountId);
            bindNullable(stmt, 7, categoryId);
            stmt.bindLong(8, amountMinor);
            stmt.bindString(9, occurredAt);
            stmt.bindString(10, occurredAt);
            bindNullable(stmt, 11, note);
            bindNullable(stmt, 12, tagsJson);
            stmt.bindString(13, originType);
            bindNullable(stmt, 14, externalRefId);
            bindNullable(stmt, 15, idempotencyKey);
            stmt.bindLong(16, includeInBudget ? 1 : 0);
            stmt.bindLong(17, includeInAnalysis ? 1 : 0);
            stmt.bindString(18, now);
            stmt.bindString(19, now);
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
