package com.strawcoding.strawmoneybook;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import org.json.JSONException;
import org.json.JSONObject;

public class BankAutomationVault {
    private static final String PREFS_NAME = "strawmoneybook.bank_automation.v1";
    private static final String KEY_PREFIX_CONNECTION = "connection.";

    private final SharedPreferences sharedPreferences;

    public BankAutomationVault(Context context) throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        sharedPreferences = EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    public JSONObject getConnectionState(String connectionId) throws JSONException {
        String normalized = normalizeKey(connectionId);
        if (normalized.isEmpty()) return null;
        String raw = sharedPreferences.getString(KEY_PREFIX_CONNECTION + normalized, "");
        if (raw == null || raw.trim().isEmpty()) return null;
        return new JSONObject(raw);
    }

    public boolean hasConnectionState(String connectionId) {
        String normalized = normalizeKey(connectionId);
        if (normalized.isEmpty()) return false;
        return sharedPreferences.contains(KEY_PREFIX_CONNECTION + normalized);
    }

    public void saveConnectionState(String connectionId, JSONObject state) {
        String normalized = normalizeKey(connectionId);
        if (normalized.isEmpty() || state == null) return;
        sharedPreferences.edit()
            .putString(KEY_PREFIX_CONNECTION + normalized, state.toString())
            .apply();
    }

    public void deleteConnectionState(String connectionId) {
        String normalized = normalizeKey(connectionId);
        if (normalized.isEmpty()) return;
        sharedPreferences.edit()
            .remove(KEY_PREFIX_CONNECTION + normalized)
            .apply();
    }

    private String normalizeKey(String value) {
        return value == null ? "" : value.trim();
    }
}
