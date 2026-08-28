package com.strawcoding.strawmoneybook;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class BankAutomationDebugTrace {
    private static final String TAG = "SMB-BankSync";
    private final JSONArray steps = new JSONArray();
    private final String action;

    public BankAutomationDebugTrace(String action) {
        this.action = action == null ? "" : action.trim();
    }

    public void record(String step, String status, String message) {
        record(step, status, message, null);
    }

    public void record(String step, String status, String message, JSONObject details) {
        JSONObject item = new JSONObject();
        safePut(item, "step", step == null ? "" : step.trim());
        safePut(item, "status", status == null ? "" : status.trim());
        safePut(item, "message", message == null ? "" : message.trim());
        safePut(item, "at", System.currentTimeMillis());
        if (details != null && details.length() > 0) {
            safePut(item, "details", details);
        }
        steps.put(item);
        Log.d(TAG, action + " " + (step == null ? "" : step.trim())
            + " [" + (status == null ? "" : status.trim()) + "] "
            + (message == null ? "" : message.trim()));
    }

    JSONObject toJson(String errorCode, String errorMessage) {
        JSONObject result = new JSONObject();
        safePut(result, "action", action);
        safePut(result, "steps", steps);
        safePut(result, "debugHint", buildHint(errorCode));
        safePut(result, "debugLastStep", findLastStepName());
        if (errorCode != null && !errorCode.trim().isEmpty()) {
            safePut(result, "errorCode", errorCode.trim());
        }
        if (errorMessage != null && !errorMessage.trim().isEmpty()) {
            safePut(result, "errorMessage", errorMessage.trim());
        }
        return result;
    }

    private void safePut(JSONObject target, String key, Object value) {
        if (target == null || key == null || key.trim().isEmpty()) return;
        try {
            target.put(key, value);
        } catch (JSONException ignored) {
            // Ignore trace serialization failures so they never break the bank automation flow.
        }
    }

    private String findLastStepName() {
        if (steps.length() <= 0) return "";
        JSONObject item = steps.optJSONObject(steps.length() - 1);
        if (item == null) return "";
        return item.optString("step", "").trim();
    }

    private JSONObject findLastStepDetails(String stepName) {
        String expected = stepName == null ? "" : stepName.trim();
        if (expected.isEmpty()) return null;
        for (int index = steps.length() - 1; index >= 0; index -= 1) {
            JSONObject item = steps.optJSONObject(index);
            if (item == null) continue;
            if (!expected.equals(item.optString("step", "").trim())) continue;
            JSONObject details = item.optJSONObject("details");
            if (details != null) return details;
        }
        return null;
    }

    private String buildHint(String errorCode) {
        String code = errorCode == null ? "" : errorCode.trim();
        switch (code) {
            case "hua_nan_captcha_not_ready":
                JSONObject captchaWaitDetails = findLastStepDetails("captcha_wait_ready");
                if (captchaWaitDetails == null) {
                    captchaWaitDetails = findLastStepDetails("captcha_refresh");
                }
                String reason = captchaWaitDetails == null ? "" : captchaWaitDetails.optString("reason", "").trim();
                switch (reason) {
                    case "image_missing":
                        return "華南登入頁內找不到驗證碼圖片元素，請檢查是否改版或 captcha 是否位於 frame。";
                    case "image_incomplete":
                        return "已找到華南驗證碼圖片，但尚未完成載入，請檢查 complete、width、height 與實際網頁載入時序。";
                    case "canvas_blocked":
                        return "已找到華南驗證碼圖片，但 WebView 無法轉成 PNG，請檢查 canvas 擷取是否被頁面限制。";
                    case "frame_mismatch":
                        return "華南驗證碼位於 frame，但目前 document/frame 路徑不一致，請檢查 frame traversal 與 refresh/login 觸發點。";
                    default:
                        return "華南驗證碼圖片尚未完成載入，請檢查登入頁 captcha 元素與載入時序。";
                }
            case "hua_nan_captcha_manual_required":
            case "hua_nan_captcha_ocr_failed":
                return "華南驗證碼自動辨識失敗，請改以手動輸入驗證碼後重試。";
            case "hua_nan_login_failed":
                return "華南登入失敗，請檢查身分證字號、使用者代號、密碼與驗證碼。";
            case "hua_nan_login_page_mismatch":
                return "華南登入表單未就緒，請檢查網銀登入頁是否改版。";
            case "hua_nan_session_expired":
                return "華南 session 已過期，請檢查 silent relogin 與 cookie restore。";
            case "hua_nan_account_list_not_found":
                return "華南登入成功但帳戶列表未找到。請檢查 h1_probe 的 frame path、form name/id、table header 與 digitBlobCount（帳號僅末四碼）；H1 尚未凍合約。";
            case "hua_nan_transaction_page_timeout":
                return "華南已點進明細入口但查詢頁未 ready。請檢查 h2_probe 的 hasTable/hasDateInput/hasEmptyText 與 intercept skip 計數（POST 不 replay）。";
            case "hua_nan_transaction_query_failed":
                return "華南交易查詢失敗（inquiry_not_found 或 query_timeout）。請檢查 h2_probe 的 inquiryMatch/dateFields 與 intercept GET/POST 計數、skipReason；H2 尚未凍合約，不是重新連結。";
            case "bank_provider_unsupported":
                return "不支援的銀行 providerId，請確認 Provider Registry。";
            case "bank_automation_timeout":
                return "自動化流程超時，請從最後一個 step 判斷卡住位置。";
            case "bank_automation_aborted":
                return "銀行自動化已取消。";
            case "captcha_required":
                return "需要使用者手動輸入圖形驗證碼（SEMI_MANUAL）。";
            default:
                return "";
        }
    }
}
