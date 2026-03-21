package com.strawcoding.strawmoneybook;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class BankAutomationDebugTrace {
    private final JSONArray steps = new JSONArray();
    private final String action;

    BankAutomationDebugTrace(String action) {
        this.action = action == null ? "" : action.trim();
    }

    void record(String step, String status, String message) {
        record(step, status, message, null);
    }

    void record(String step, String status, String message, JSONObject details) {
        JSONObject item = new JSONObject();
        safePut(item, "step", step == null ? "" : step.trim());
        safePut(item, "status", status == null ? "" : status.trim());
        safePut(item, "message", message == null ? "" : message.trim());
        safePut(item, "at", System.currentTimeMillis());
        if (details != null && details.length() > 0) {
            safePut(item, "details", details);
        }
        steps.put(item);
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
            case "first_bank_captcha_not_ready":
                JSONObject captchaWaitDetails = findLastStepDetails("captcha_wait_ready");
                if (captchaWaitDetails == null) {
                    captchaWaitDetails = findLastStepDetails("captcha_refresh");
                }
                String reason = captchaWaitDetails == null ? "" : captchaWaitDetails.optString("reason", "").trim();
                switch (reason) {
                    case "image_missing":
                        return "登入頁內找不到 #code_verify，請檢查是否改版或 captcha 是否位於 frame。";
                    case "image_incomplete":
                        return "已找到 #code_verify，但圖片尚未完成載入，請檢查 complete、width、height 與實際網頁載入時序。";
                    case "canvas_blocked":
                        return "已找到 #code_verify，但 WebView 無法轉成 PNG，請檢查 canvas 擷取是否被頁面限制。";
                    case "frame_mismatch":
                        return "已找到 frame 內的 #code_verify，但目前 document/frame 路徑不一致，請檢查 frame traversal 與 refresh/login 觸發點。";
                    default:
                        return "驗證碼圖片尚未完成載入，請檢查登入頁是否成功載入 #code_verify。";
                }
            case "first_bank_captcha_ocr_failed":
                return "已取得驗證碼圖片，但 OCR 沒有產生有效 4 碼，請檢查 source.png 與 best-variant.png。";
            case "first_bank_login_failed":
                return "驗證碼可能辨識錯誤或登入資料不正確，請優先檢查 captcha_attempt 與 submit_login。";
            case "first_bank_navigation_timeout":
                return "WebView 沒有在時間內完成頁面切換，請檢查 requested/current URL、進度值與 onPageFinished 是否有觸發。";
            case "first_bank_login_trigger_missing":
                return "登入按鈕或 clickArea 觸發點可能變更，請檢查登入頁 DOM。";
            case "first_bank_account_list_not_found":
                return "登入後未成功進入我的帳戶或帳號列表頁，請檢查 open_my_accounts 與 discover_accounts。";
            case "first_bank_my_accounts_trigger_missing":
                return "frame 頁面尚未載入出 openIt 或「我的帳戶」連結，請檢查 frame 載入時序與 open_my_accounts。";
            case "first_bank_session_expired":
                return "銀行 session 已過期，請檢查 silent relogin 與 cookie restore。";
            case "first_bank_transaction_query_failed":
                return "交易查詢頁可能未成功載入或 DOM 結構已變更，請檢查 transaction_query。";
            case "bank_automation_timeout":
                return "自動化流程超時，請從最後一個 step 判斷卡住位置。";
            default:
                return "";
        }
    }
}
