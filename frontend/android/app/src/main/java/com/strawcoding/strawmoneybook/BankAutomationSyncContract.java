package com.strawcoding.strawmoneybook;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Shared bank sync contracts (Architecture B / v1.1.1).
 * Watermark dual-key precedence + mandatory lookback overlap.
 */
public final class BankAutomationSyncContract {
    public static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    public static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    public static final int DEFAULT_LOOKBACK_DAYS = 3;
    public static final int MAX_LOOKBACK_DAYS = 30;

    private BankAutomationSyncContract() {}

    public static String normalizeText(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /**
     * Dual-key precedence: canonical {@code lastSyncAt} &gt; legacy {@code last_sync_at}.
     */
    public static String readLastSyncWatermark(JSONObject payload) {
        if (payload == null) return "";
        String canonical = normalizeText(payload.optString("lastSyncAt"));
        if (!canonical.isEmpty()) return canonical;
        return normalizeText(payload.optString("last_sync_at"));
    }

    public static int readLookbackDays(JSONObject payload) {
        int days = DEFAULT_LOOKBACK_DAYS;
        if (payload != null) {
            if (payload.has("lookbackDays")) {
                days = payload.optInt("lookbackDays", DEFAULT_LOOKBACK_DAYS);
            } else if (payload.has("lookback_days")) {
                days = payload.optInt("lookback_days", DEFAULT_LOOKBACK_DAYS);
            }
        }
        if (days < 0) return 0;
        if (days > MAX_LOOKBACK_DAYS) return MAX_LOOKBACK_DAYS;
        return days;
    }

    /**
     * Build accountId → lastSyncAt map from {@code accountCheckpoints} array or
     * connection-level dual-key fallback (empty map if none).
     */
    public static Map<String, String> readAccountWatermarkMap(JSONObject payload) {
        Map<String, String> map = new HashMap<>();
        if (payload == null) return map;
        JSONArray checkpoints = payload.optJSONArray("accountCheckpoints");
        if (checkpoints == null) {
            checkpoints = payload.optJSONArray("account_checkpoints");
        }
        if (checkpoints != null) {
            for (int i = 0; i < checkpoints.length(); i += 1) {
                JSONObject item = checkpoints.optJSONObject(i);
                if (item == null) continue;
                String accountId = normalizeText(item.optString("accountId"));
                if (accountId.isEmpty()) {
                    accountId = normalizeText(item.optString("providerAccountId"));
                }
                if (accountId.isEmpty()) {
                    accountId = normalizeText(item.optString("provider_account_id"));
                }
                if (accountId.isEmpty()) continue;
                String watermark = normalizeText(item.optString("lastSyncAt"));
                if (watermark.isEmpty()) {
                    watermark = normalizeText(item.optString("last_sync_at"));
                }
                if (watermark.isEmpty()) {
                    watermark = normalizeText(item.optString("lastSuccessSyncAt"));
                }
                if (watermark.isEmpty()) {
                    watermark = normalizeText(item.optString("last_success_sync_at"));
                }
                if (!watermark.isEmpty()) {
                    map.put(accountId, watermark);
                }
            }
        }
        return map;
    }

    public static String resolveAccountWatermark(
        Map<String, String> accountMap,
        String accountId,
        String connectionFallback
    ) {
        if (accountMap != null && accountId != null) {
            String fromAccount = accountMap.get(accountId);
            if (fromAccount != null && !fromAccount.trim().isEmpty()) {
                return fromAccount.trim();
            }
            // Also try digit-normalized keys
            String digits = accountId.replaceAll("\\D+", "");
            if (!digits.isEmpty()) {
                for (Map.Entry<String, String> entry : accountMap.entrySet()) {
                    String keyDigits = entry.getKey() == null ? "" : entry.getKey().replaceAll("\\D+", "");
                    if (digits.equals(keyDigits) && entry.getValue() != null && !entry.getValue().trim().isEmpty()) {
                        return entry.getValue().trim();
                    }
                }
            }
        }
        return connectionFallback == null ? "" : connectionFallback.trim();
    }

    /**
     * Query start = coveredThrough − lookbackDays, clamped to initialSyncStartDate.
     */
    public static LocalDate resolveQueryStartDate(
        LocalDate initialDate,
        LocalDate coveredThrough,
        int lookbackDays
    ) {
        LocalDate base = coveredThrough != null ? coveredThrough : LocalDate.now(TAIPEI_ZONE);
        int safeLookback = lookbackDays;
        if (safeLookback < 0) safeLookback = 0;
        if (safeLookback > MAX_LOOKBACK_DAYS) safeLookback = MAX_LOOKBACK_DAYS;
        LocalDate withLookback = base.minusDays(safeLookback);
        if (initialDate != null && withLookback.isBefore(initialDate)) {
            return initialDate;
        }
        return withLookback;
    }

    public static String coveredThroughIsoDate(LocalDate queryEndInclusive, LocalDate syncStartedDate) {
        LocalDate end = queryEndInclusive != null ? queryEndInclusive : LocalDate.now(TAIPEI_ZONE);
        if (syncStartedDate != null && end.isAfter(syncStartedDate)) {
            end = syncStartedDate;
        }
        return end.format(ISO_DATE);
    }

    public static JSONObject accountResultOk(String accountId, String coveredThrough, int rowCount) throws Exception {
        JSONObject item = new JSONObject();
        item.put("accountId", accountId);
        item.put("status", "ok");
        item.put("coveredThrough", coveredThrough);
        item.put("rowCount", rowCount);
        return item;
    }

    public static JSONObject accountResultError(String accountId, String code, String message) throws Exception {
        JSONObject item = new JSONObject();
        item.put("accountId", accountId);
        item.put("status", "error");
        item.put("code", code == null ? "bank_account_sync_failed" : code);
        item.put("message", message == null ? "" : message);
        return item;
    }

    /** H2 incomplete: do not advance checkpoint / coveredThrough. */
    public static JSONObject accountResultPartial(
        String accountId,
        String code,
        String message,
        int rowCount
    ) throws Exception {
        JSONObject item = new JSONObject();
        item.put("accountId", accountId);
        item.put("status", "partial");
        item.put("code", code == null ? "bank_account_sync_partial" : code);
        item.put("message", message == null ? "" : message);
        item.put("rowCount", Math.max(0, rowCount));
        return item;
    }

    public static String syncStatusFromAccountResults(JSONArray accountResults) {
        if (accountResults == null || accountResults.length() == 0) return "ok";
        int ok = 0;
        int err = 0;
        int partial = 0;
        for (int i = 0; i < accountResults.length(); i += 1) {
            JSONObject item = accountResults.optJSONObject(i);
            if (item == null) continue;
            String status = normalizeText(item.optString("status")).toLowerCase(Locale.ROOT);
            if ("ok".equals(status)) ok += 1;
            else if ("partial".equals(status)) partial += 1;
            else err += 1;
        }
        if (err == 0 && partial == 0) return "ok";
        if (ok == 0 && partial == 0) return "error";
        return "partial_success";
    }
}
