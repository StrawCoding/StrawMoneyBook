package com.strawcoding.strawmoneybook.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
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
 * Proves the Wear engine can INSERT without launching MainActivity or Capacitor Bridge.
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

        SupportSQLiteDatabase db = helper.getWritableDatabase();
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

        JSONObject dup = WearTransactionEngine.applyTxCreateOnDb(db, payload, "led1");
        assertEquals("duplicate", dup.getString("status"));
        assertEquals(ack.getString("txId"), dup.getString("txId"));
        assertTrue(WearMessageDispatcher.shouldHandleIncoming(true, WearCompanionConstants.PATH_TX_CREATE));
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
        db.execSQL("INSERT INTO ledgers(id, name) VALUES ('led1', 'Main');");
        db.execSQL("INSERT INTO accounts(ledger_id, id, name, account_kind) VALUES ('led1', 'acc1', 'Cash', 'cash');");
        db.execSQL("INSERT INTO categories(ledger_id, id, name, kind) VALUES ('led1', 'cat1', 'Food', 'expense');");
    }
}
