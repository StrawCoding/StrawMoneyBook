package com.strawcoding.strawmoneybook.wear;

import android.content.Context;
import android.content.SharedPreferences;

public final class WearActiveLedgerStore {
    private static final String PREFS = "strawmoneybook.wear_companion";
    private static final String KEY_ACTIVE_LEDGER = "active_ledger_id";

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
}
