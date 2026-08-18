package com.strawcoding.strawmoneybook.wear;

import android.content.Context;
import android.database.Cursor;
import androidx.sqlite.db.SupportSQLiteDatabase;
import com.getcapacitor.community.database.sqlite.SQLite.Database;
import java.util.Hashtable;
import org.json.JSONObject;

/**
 * Single Android connection owner for straw_money_book.
 * Opens via capacitor-community SQLCipher Database (same file naming / driver).
 * Forbidden: the platform android.database.sqlite opener on a hardcoded path.
 */
public final class AndroidDbRepository {
    private static final Object LOCK = new Object();
    private static AndroidDbRepository instance;

    private final Context appContext;
    private Database database;

    private AndroidDbRepository(Context context) {
        this.appContext = context.getApplicationContext();
    }

    public static AndroidDbRepository get(Context context) {
        synchronized (LOCK) {
            if (instance == null) {
                instance = new AndroidDbRepository(context.getApplicationContext());
            }
            return instance;
        }
    }

    static void resetForTests() {
        synchronized (LOCK) {
            if (instance != null) {
                instance.closeQuietly();
                instance = null;
            }
        }
    }

    public SupportSQLiteDatabase openForWrite() throws Exception {
        synchronized (LOCK) {
            if (database == null || !Boolean.TRUE.equals(database.isOpen())) {
                database = new Database(
                    appContext,
                    WearCompanionConstants.SQLITE_FILE_NAME,
                    false,
                    WearCompanionConstants.ENCRYPTION_MODE,
                    WearCompanionConstants.CAPACITOR_DB_VERSION,
                    false,
                    new Hashtable<Integer, JSONObject>(),
                    null,
                    false
                );
                database.open();
            }
            SupportSQLiteDatabase db = database.getDb();
            if (db == null || !db.isOpen()) {
                throw new IllegalStateException("engine_not_ready");
            }
            db.execSQL("PRAGMA foreign_keys = ON;");
            db.execSQL("PRAGMA busy_timeout = 5000;");
            return db;
        }
    }

    public <T> T withWriteLock(ThrowingCallable<T> callable) throws Exception {
        synchronized (LOCK) {
            return callable.call();
        }
    }

    private void closeQuietly() {
        if (database == null) {
            return;
        }
        try {
            database.close();
        } catch (Exception ignored) {
            // best-effort
        }
        database = null;
    }

    interface ThrowingCallable<T> {
        T call() throws Exception;
    }

    public static String queryString(SupportSQLiteDatabase db, String sql, String[] args) {
        Cursor cursor = db.query(sql, args == null ? new String[0] : args);
        try {
            if (!cursor.moveToFirst() || cursor.isNull(0)) {
                return null;
            }
            return cursor.getString(0);
        } finally {
            cursor.close();
        }
    }

    public static long queryLong(SupportSQLiteDatabase db, String sql, String[] args, long fallback) {
        Cursor cursor = db.query(sql, args == null ? new String[0] : args);
        try {
            if (!cursor.moveToFirst() || cursor.isNull(0)) {
                return fallback;
            }
            return cursor.getLong(0);
        } finally {
            cursor.close();
        }
    }
}
