package com.strawcoding.strawmoneybook.wear;

import android.content.Context;

public final class WearActiveLedgerStore {
    private static final String PREFS = "strawmoneybook.wear_companion";
    private static final String KEY_ACTIVE_LEDGER = "active_ledger_id";
    private static final String KEY_WATCH_LEDGER = "watch_ledger_id";

    private WearActiveLedgerStore() {}

    public static void setActiveLedgerId(Context context, String ledgerId) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTIVE_LEDGER, ledgerId == null ? "" : ledgerId.trim())
            .apply();
    }

    public static String getActiveLedgerId(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_ACTIVE_LEDGER, "");
    }

    /**
     * Ledger the watch asked for via /smb/v1/ledger/set. It is stored separately
     * from the phone's own active ledger so a watch-side switch does not move the
     * phone UI, and so watch writes into that ledger are still authorized.
     */
    public static void setWatchLedgerId(Context context, String ledgerId) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_WATCH_LEDGER, ledgerId == null ? "" : ledgerId.trim())
            .apply();
    }

    public static String getWatchLedgerId(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_WATCH_LEDGER, "");
    }

    /** Watch selection wins when set; otherwise the phone's active ledger. */
    public static String getEffectiveLedgerId(Context context) {
        String watchLedger = getWatchLedgerId(context);
        if (watchLedger != null && !watchLedger.trim().isEmpty()) {
            return watchLedger.trim();
        }
        return getActiveLedgerId(context);
    }
}
