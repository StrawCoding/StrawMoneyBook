package com.strawcoding.strawmoneybook.core;

/**
 * Provider-agnostic carrier sync contract: lookback, date windows, vault connection id.
 */
public final class CarrierSyncContract {
    public static final int MAX_LOOKBACK_DAYS = 14;
    public static final int MAX_QUERY_WINDOW_DAYS = 62;

    private CarrierSyncContract() {}

    public static int readLookbackDays(org.json.JSONObject payload) {
        int days = 7;
        if (payload != null) {
            if (payload.has("lookbackDays")) {
                days = payload.optInt("lookbackDays", 7);
            } else if (payload.has("lookback_days")) {
                days = payload.optInt("lookback_days", 7);
            }
        }
        if (days < 1) return 1;
        if (days > MAX_LOOKBACK_DAYS) return MAX_LOOKBACK_DAYS;
        return days;
    }

    public static String readLastSyncWatermark(org.json.JSONObject payload) {
        if (payload == null) return "";
        String canonical = normalizeText(payload.optString("lastSyncAt"));
        if (!canonical.isEmpty()) return canonical;
        return normalizeText(payload.optString("last_sync_at"));
    }

    public static String resolveConnectionId(org.json.JSONObject payload) {
        if (payload == null) return "";
        String explicit = normalizeText(payload.optString("connectionId"));
        if (!explicit.isEmpty()) return explicit;
        String cardNo = normalizeText(payload.optString("cardNo"));
        if (cardNo.isEmpty()) return "";
        return "natgov_mobile_" + cardNo;
    }

    public static boolean isQueryApiUrl(String url) {
        String normalized = normalizeText(url).toLowerCase();
        if (normalized.isEmpty()) return false;
        return normalized.contains("einvoice.nat.gov.tw")
            && (normalized.contains("/api/") || normalized.contains("/ptl/portal/api/"))
            && (normalized.contains("query") || normalized.contains("list") || normalized.contains("invoice") || normalized.contains("btc"));
    }

    public static boolean shouldReplayInterceptRequest(String method) {
        return false;
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
