package com.strawcoding.strawmoneybook.core;

import com.strawcoding.strawmoneybook.BankAutomationVault;

import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Provider-agnostic sync contract: dual-key watermark, lookback, vault connection id.
 */
public final class BankSyncContract {
    public static final int MAX_WINDOW_DAYS = 30;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US);

    private BankSyncContract() {}

    /** Dual-key precedence: lastSyncAt > last_sync_at */
    public static String readLastSyncWatermark(JSONObject payload) {
        if (payload == null) return "";
        String canonical = normalizeText(payload.optString("lastSyncAt"));
        if (!canonical.isEmpty()) return canonical;
        return normalizeText(payload.optString("last_sync_at"));
    }

    public static int readLookbackDays(JSONObject payload) {
        int days = 3;
        if (payload != null) {
            if (payload.has("lookbackDays")) {
                days = payload.optInt("lookbackDays", 3);
            } else if (payload.has("lookback_days")) {
                days = payload.optInt("lookback_days", 3);
            }
        }
        if (days < 0) return 0;
        if (days > MAX_WINDOW_DAYS) return MAX_WINDOW_DAYS;
        return days;
    }

    public static LocalDate resolveSyncStartDate(String initialSyncStartDate, String lastSyncAt, String cursor) {
        LocalDate initialDate = parseDate(initialSyncStartDate);
        LocalDate cursorDate = initialDate;
        try {
            if (cursor != null && !cursor.trim().isEmpty()) {
                JSONObject cursorJson = new JSONObject(cursor);
                String initialFromCursor = cursorJson.optString("initialStartDate");
                if (parseDate(initialFromCursor) != null) {
                    cursorDate = parseDate(initialFromCursor);
                }
            }
        } catch (Exception ignored) {
        }
        LocalDate lastSyncDate = parseDateFromInstant(lastSyncAt);
        if (lastSyncDate == null) return cursorDate == null ? LocalDate.now(TAIPEI_ZONE) : cursorDate;
        if (cursorDate == null) return lastSyncDate;
        return lastSyncDate.isAfter(cursorDate) ? lastSyncDate : cursorDate;
    }

    public static LocalDate resolveQueryStartDate(
        String initialSyncStartDate,
        String lastSyncWatermark,
        String cursor,
        int lookbackDays
    ) {
        LocalDate initialDate = parseDate(initialSyncStartDate);
        LocalDate coveredThrough = resolveSyncStartDate(initialSyncStartDate, lastSyncWatermark, cursor);
        if (coveredThrough == null) coveredThrough = LocalDate.now(TAIPEI_ZONE);
        int safeLookback = Math.max(0, Math.min(lookbackDays, MAX_WINDOW_DAYS));
        LocalDate withLookback = coveredThrough.minusDays(safeLookback);
        if (initialDate != null && withLookback.isBefore(initialDate)) return initialDate;
        return withLookback;
    }

    public static String resolveVaultConnectionId(BankAutomationVault vault, JSONObject payload) throws Exception {
        if (payload == null) return "";
        String[] keys = new String[] {
            "connectionId", "connection_id", "provider_connection_id",
            "local_connection_id", "localConnectionId",
        };
        java.util.LinkedHashSet<String> candidates = new java.util.LinkedHashSet<>();
        for (String key : keys) {
            String value = normalizeText(payload.optString(key));
            if (!value.isEmpty()) candidates.add(value);
        }
        if (candidates.isEmpty()) return "";
        String first = candidates.iterator().next();
        if (vault == null) return first;
        for (String candidate : candidates) {
            if (vault.hasConnectionState(candidate)) return candidate;
        }
        return first;
    }

    public static String formatBankDate(LocalDate date) {
        return date == null ? "" : DATE_FORMAT.format(date);
    }

    public static LocalDate parseDate(String value) {
        String normalized = normalizeText(value);
        if (normalized.isEmpty()) return null;
        try {
            return LocalDate.parse(normalized, DATE_FORMAT);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static LocalDate parseDateFromInstant(String value) {
        String normalized = normalizeText(value);
        if (normalized.isEmpty()) return null;
        try {
            return Instant.parse(normalized).atZone(TAIPEI_ZONE).toLocalDate();
        } catch (Exception ignored) {
            return parseDate(normalized);
        }
    }

    public static String nowIso() {
        return Instant.now().toString();
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
