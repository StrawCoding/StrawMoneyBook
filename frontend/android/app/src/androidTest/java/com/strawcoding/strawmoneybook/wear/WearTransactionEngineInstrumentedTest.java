package com.strawcoding.strawmoneybook.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Proves the Wear engine can INSERT/UPDATE without launching MainActivity or Capacitor Bridge.
 * smb303: reimbursable CREATE + formal UPDATE enable/cancel with draft claim-sheet sync.
 */
@RunWith(AndroidJUnit4.class)
public class WearTransactionEngineInstrumentedTest {
    private SupportSQLiteOpenHelper helper;

    @After
    public void tearDown() {
        if (helper != null) {
            helper.close();
        }
    }

    @Test
    public void applyTxCreateInsertsWithoutActivityOrBridge() throws Exception {
        SupportSQLiteDatabase db = openSeededDb();
        JSONObject payload = new JSONObject();
        payload.put("idempotencyKey", "wear-idem-1");
        payload.put("clientTxId", "room-row-1");
        payload.put("ledgerId", "led1");
        payload.put("type", "expense");
        payload.put("accountId", "acc1");
        payload.put("categoryId", "cat1");
        payload.put("amountMinor", 2500);
        payload.put("catalogRevision", 1);
        payload.put("occurredAt", "2026-08-14T01:00:00.000Z");
        payload.put("note", "coffee");

        JSONObject ack = WearTransactionEngine.applyTxCreateOnDb(db, payload, "led1");
        assertEquals("ok", ack.getString("status"));
        assertEquals("wear-idem-1", ack.getString("idempotencyKey"));
        assertNotNull(ack.optString("txId"));

        String origin = AndroidDbRepository.queryString(
            db,
            "SELECT origin_type FROM transactions WHERE idempotency_key = ?;",
            new String[] { "wear-idem-1" }
        );
        assertEquals("wear", origin);
        String applied = AndroidDbRepository.queryString(
            db,
            "SELECT tx_id FROM wear_applied WHERE idempotency_key = ?;",
            new String[] { "wear-idem-1" }
        );
        assertEquals(ack.getString("txId"), applied);

        long isReimbursable = AndroidDbRepository.queryLong(
            db,
            "SELECT is_reimbursable FROM transactions WHERE idempotency_key = ?;",
            new String[] { "wear-idem-1" },
            -1L
        );
        assertEquals(0L, isReimbursable);

        JSONObject reimbursablePayload = new JSONObject();
        reimbursablePayload.put("idempotencyKey", "wear-idem-reimb");
        reimbursablePayload.put("clientTxId", "room-row-reimb");
        reimbursablePayload.put("ledgerId", "led1");
        reimbursablePayload.put("type", "expense");
        reimbursablePayload.put("accountId", "acc1");
        reimbursablePayload.put("categoryId", "cat1");
        reimbursablePayload.put("amountMinor", 1800);
        reimbursablePayload.put("catalogRevision", 1);
        reimbursablePayload.put("occurredAt", "2026-08-14T02:00:00.000Z");
        reimbursablePayload.put("note", "taxi");
        reimbursablePayload.put("isReimbursable", true);

        JSONObject reimbAck = WearTransactionEngine.applyTxCreateOnDb(db, reimbursablePayload, "led1");
        assertEquals("ok", reimbAck.getString("status"));
        long reimbFlag = AndroidDbRepository.queryLong(
            db,
            "SELECT is_reimbursable FROM transactions WHERE idempotency_key = ?;",
            new String[] { "wear-idem-reimb" },
            -1L
        );
        assertEquals(1L, reimbFlag);
        String reimbState = AndroidDbRepository.queryString(
            db,
            "SELECT reimbursement_state FROM transactions WHERE idempotency_key = ?;",
            new String[] { "wear-idem-reimb" }
        );
        assertEquals("pending", reimbState);
        long includeBudget = AndroidDbRepository.queryLong(
            db,
            "SELECT include_in_budget FROM transactions WHERE idempotency_key = ?;",
            new String[] { "wear-idem-reimb" },
            -1L
        );
        assertEquals(0L, includeBudget);

        JSONObject dup = WearTransactionEngine.applyTxCreateOnDb(db, payload, "led1");
        assertEquals("duplicate", dup.getString("status"));
        assertEquals(ack.getString("txId"), dup.getString("txId"));
        assertTrue(WearMessageDispatcher.shouldHandleIncoming(true, WearCompanionConstants.PATH_TX_CREATE));
    }

    @Test
    public void applyTxUpdateTogglesReimbursableAndSyncsDraftClaimItems() throws Exception {
        SupportSQLiteDatabase db = openSeededDb();

        JSONObject create = new JSONObject();
        create.put("idempotencyKey", "wear-idem-upd-base");
        create.put("clientTxId", "room-upd-base");
        create.put("ledgerId", "led1");
        create.put("type", "expense");
        create.put("accountId", "acc1");
        create.put("categoryId", "cat1");
        create.put("amountMinor", 3200);
        create.put("catalogRevision", 1);
        create.put("occurredAt", "2026-08-15T03:00:00.000Z");
        create.put("note", "client lunch");
        create.put("isReimbursable", false);

        JSONObject createAck = WearTransactionEngine.applyTxCreateOnDb(db, create, "led1");
        assertEquals("ok", createAck.getString("status"));
        String txId = createAck.getString("txId");

        JSONObject enable = new JSONObject();
        enable.put("idempotencyKey", "wear-idem-upd-on");
        enable.put("ledgerId", "led1");
        enable.put("targetTxId", txId);
        enable.put("type", "expense");
        enable.put("accountId", "acc1");
        enable.put("categoryId", "cat1");
        enable.put("amountMinor", 3200);
        enable.put("catalogRevision", 1);
        enable.put("occurredAt", "2026-08-15T03:00:00.000Z");
        enable.put("note", "client lunch");
        enable.put("isReimbursable", true);

        JSONObject enableAck = WearTransactionEngine.applyTxUpdateOnDb(db, enable, "led1");
        assertEquals("ok", enableAck.getString("status"));
        assertEquals(1L, AndroidDbRepository.queryLong(
            db,
            "SELECT is_reimbursable FROM transactions WHERE id = ?;",
            new String[] { txId },
            -1L
        ));
        assertEquals("pending", AndroidDbRepository.queryString(
            db,
            "SELECT reimbursement_state FROM transactions WHERE id = ?;",
            new String[] { txId }
        ));

        // Simulate phone draft claim sheet that already imported this reimbursable expense.
        db.execSQL(
            "INSERT INTO reimbursements("
                + "ledger_id, id, title, status, total_minor, created_at, updated_at, deleted_at"
                + ") VALUES ("
                + "'led1', 'claim-draft-1', 'Trip claim', 'draft', 3200,"
                + " '2026-08-15T03:01:00.000Z', '2026-08-15T03:01:00.000Z', NULL);"
        );
        db.execSQL(
            "INSERT INTO reimbursement_items("
                + "ledger_id, id, reimbursement_id, source_type, entry_type, transaction_id,"
                + " category_id, account_id, description, amount_minor, occurred_at, created_at, updated_at"
                + ") VALUES ("
                + "'led1', 'item-1', 'claim-draft-1', 'transaction', 'expense', '" + txId + "',"
                + " 'cat1', 'acc1', 'Food', 3200, '2026-08-15T03:00:00.000Z',"
                + " '2026-08-15T03:01:00.000Z', '2026-08-15T03:01:00.000Z');"
        );
        // Paid claim must survive cancel-reimbursable on the source tx.
        db.execSQL(
            "INSERT INTO reimbursements("
                + "ledger_id, id, title, status, total_minor, created_at, updated_at, deleted_at"
                + ") VALUES ("
                + "'led1', 'claim-paid-1', 'Old paid', 'paid', 500,"
                + " '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL);"
        );
        db.execSQL(
            "INSERT INTO reimbursement_items("
                + "ledger_id, id, reimbursement_id, source_type, entry_type, transaction_id,"
                + " category_id, account_id, description, amount_minor, occurred_at, created_at, updated_at"
                + ") VALUES ("
                + "'led1', 'item-paid-1', 'claim-paid-1', 'transaction', 'expense', '" + txId + "',"
                + " 'cat1', 'acc1', 'Old', 500, '2026-08-01T00:00:00.000Z',"
                + " '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');"
        );

        JSONObject cancel = new JSONObject();
        cancel.put("idempotencyKey", "wear-idem-upd-off");
        cancel.put("ledgerId", "led1");
        cancel.put("targetTxId", txId);
        cancel.put("type", "expense");
        cancel.put("accountId", "acc1");
        cancel.put("categoryId", "cat1");
        cancel.put("amountMinor", 3200);
        cancel.put("catalogRevision", 1);
        cancel.put("occurredAt", "2026-08-15T03:00:00.000Z");
        cancel.put("note", "client lunch");
        cancel.put("isReimbursable", false);

        JSONObject cancelAck = WearTransactionEngine.applyTxUpdateOnDb(db, cancel, "led1");
        assertEquals("ok", cancelAck.getString("status"));
        assertEquals(0L, AndroidDbRepository.queryLong(
            db,
            "SELECT is_reimbursable FROM transactions WHERE id = ?;",
            new String[] { txId },
            -1L
        ));
        assertEquals("none", AndroidDbRepository.queryString(
            db,
            "SELECT reimbursement_state FROM transactions WHERE id = ?;",
            new String[] { txId }
        ));

        assertNull(AndroidDbRepository.queryString(
            db,
            "SELECT id FROM reimbursement_items WHERE id = 'item-1';",
            null
        ));
        assertEquals(0L, AndroidDbRepository.queryLong(
            db,
            "SELECT total_minor FROM reimbursements WHERE id = 'claim-draft-1';",
            null,
            -1L
        ));
        assertEquals("item-paid-1", AndroidDbRepository.queryString(
            db,
            "SELECT id FROM reimbursement_items WHERE id = 'item-paid-1';",
            null
        ));
        assertEquals(500L, AndroidDbRepository.queryLong(
            db,
            "SELECT total_minor FROM reimbursements WHERE id = 'claim-paid-1';",
            null,
            -1L
        ));
    }

    private SupportSQLiteDatabase openSeededDb() {
        Context context = ApplicationProvider.getApplicationContext();
        helper = new FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(null)
                .callback(new SupportSQLiteOpenHelper.Callback(1) {
                    @Override
                    public void onCreate(SupportSQLiteDatabase db) {
                        seed(db);
                    }

                    @Override
                    public void onUpgrade(SupportSQLiteDatabase db, int oldVersion, int newVersion) {
                    }
                })
                .build()
        );
        return helper.getWritableDatabase();
    }

    private static void seed(SupportSQLiteDatabase db) {
        db.execSQL("PRAGMA foreign_keys = ON;");
        db.execSQL("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT);");
        db.execSQL("INSERT INTO schema_migrations(version, name) VALUES (45, 'wear_companion');");
        db.execSQL(
            "CREATE TABLE ledgers (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT);"
        );
        db.execSQL(
            "CREATE TABLE accounts ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,"
                + " account_kind TEXT NOT NULL DEFAULT 'cash', is_archived INTEGER NOT NULL DEFAULT 0,"
                + " deleted_at TEXT, PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL(
            "CREATE TABLE categories ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,"
                + " is_archived INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL("CREATE TABLE savings_jars (ledger_id TEXT, account_id TEXT);");
        db.execSQL(
            "CREATE TABLE wear_sync_state ("
                + "id INTEGER PRIMARY KEY CHECK (id = 1), sync_epoch TEXT NOT NULL,"
                + " snapshot_revision INTEGER NOT NULL DEFAULT 0, ledger_revision INTEGER NOT NULL DEFAULT 0,"
                + " catalog_revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);"
        );
        db.execSQL(
            "INSERT INTO wear_sync_state(id, sync_epoch, updated_at) VALUES (1, 'epoch-test', '2026-08-14T00:00:00.000Z');"
        );
        db.execSQL(
            "CREATE TABLE wear_applied ("
                + "idempotency_key TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, tx_id TEXT NOT NULL, applied_at TEXT NOT NULL);"
        );
        db.execSQL(
            "CREATE TABLE transactions ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL,"
                + " transfer_group_id TEXT, account_id TEXT NOT NULL, peer_account_id TEXT, category_id TEXT,"
                + " amount_minor INTEGER NOT NULL, occurred_at TEXT NOT NULL, posted_at TEXT, note TEXT,"
                + " location TEXT, tags_json TEXT,"
                + " origin_type TEXT NOT NULL DEFAULT 'manual'"
                + " CHECK (origin_type IN ('manual','loan_payment','reimbursement','import','recurring','refund','wear')),"
                + " external_ref_id TEXT, idempotency_key TEXT,"
                + " include_in_budget INTEGER NOT NULL DEFAULT 1, include_in_analysis INTEGER NOT NULL DEFAULT 1,"
                + " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,"
                + " is_reimbursable INTEGER NOT NULL DEFAULT 0, reimbursement_state TEXT NOT NULL DEFAULT 'none',"
                + " reimbursed_at TEXT, reimburse_target_minor INTEGER,"
                + " created_by_user_id TEXT, created_by_display_name TEXT,"
                + " updated_by_user_id TEXT, updated_by_display_name TEXT,"
                + " PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL("CREATE UNIQUE INDEX idx_tx_idempotency ON transactions(ledger_id, idempotency_key) WHERE idempotency_key IS NOT NULL;");
        db.execSQL(
            "CREATE TABLE reimbursements ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL,"
                + " status TEXT NOT NULL, total_minor INTEGER NOT NULL DEFAULT 0,"
                + " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,"
                + " PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL(
            "CREATE TABLE reimbursement_items ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, reimbursement_id TEXT NOT NULL,"
                + " source_type TEXT NOT NULL, entry_type TEXT NOT NULL DEFAULT 'expense',"
                + " transaction_id TEXT, category_id TEXT, account_id TEXT,"
                + " description TEXT, amount_minor INTEGER NOT NULL,"
                + " occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,"
                + " PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL(
            "CREATE TABLE credit_statements ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, account_id TEXT,"
                + " status TEXT NOT NULL DEFAULT 'open', deleted_at TEXT,"
                + " PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL(
            "CREATE TABLE transaction_postings ("
                + "ledger_id TEXT NOT NULL, id TEXT NOT NULL, transaction_id TEXT,"
                + " statement_id TEXT, amount_minor INTEGER, deleted_at TEXT, updated_at TEXT,"
                + " PRIMARY KEY (ledger_id, id));"
        );
        db.execSQL("INSERT INTO ledgers(id, name) VALUES ('led1', 'Main');");
        db.execSQL("INSERT INTO accounts(ledger_id, id, name, account_kind) VALUES ('led1', 'acc1', 'Cash', 'cash');");
        db.execSQL("INSERT INTO categories(ledger_id, id, name, kind) VALUES ('led1', 'cat1', 'Food', 'expense');");
    }
}
