package com.strawcoding.strawmoneybook;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class BankAutomationDebugTrace {
    private static final String TAG = "SMB-BankSync";
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
            case "first_bank_login_page_mismatch":
                return "登入頁不是電腦版畫面，請檢查 WebView viewport、user-agent 與 desktop_login_page probe 結果。";
            case "first_bank_navigation_timeout":
                return "WebView 沒有在時間內完成頁面切換，請檢查 requested/current URL、進度值與 onPageFinished 是否有觸發。";
            case "first_bank_login_trigger_missing":
                return "登入按鈕或 clickArea 觸發點可能變更，請檢查登入頁 DOM。";
            case "first_bank_account_list_not_found":
                return "登入後未成功進入帳戶總覽或帳號列表頁，請檢查 open_my_accounts 的 URL/function/ID/table structural anchors 與中英文文字備援。";
            case "first_bank_my_accounts_trigger_missing":
                return "frame 頁面尚未載入帳戶總覽入口，請檢查 openIt、overview-account/tab1、table.CnbTable、010103 連結與中英文文字備援。";
            case "first_bank_portal_contract_failed":
                return "第一銀行入口結構錨點已變更，請檢查 frame_portal_contract 的 URL/function/ID/table predicates；使用者可稍後重試，若持續失敗請回報更新 App。";
            case "first_bank_session_expired":
                return "銀行 session 已過期，請檢查 silent relogin 與 cookie restore。";
            case "first_bank_transaction_query_failed":
                return "交易查詢頁可能未成功載入或 DOM 結構已變更；POST 交易請求已安全放行不 replay，請檢查 transaction_query 與 DOM fallback。";
            case "hua_nan_captcha_not_ready":
                return "華南驗證碼圖片尚未完成載入，請檢查登入頁 captcha 元素與載入時序。";
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
                return "華南登入成功但帳戶列表未找到，請檢查 post-login 帳戶探索 DOM。";
            case "hua_nan_transaction_query_failed":
                return "華南交易查詢頁可能未成功載入或 DOM 結構已變更。";
            case "bank_provider_unsupported":
                return "不支援的銀行 providerId，請確認 Provider Registry。";
            case "bank_automation_timeout":
                return "自動化流程超時，請從最後一個 step 判斷卡住位置。";
            default:
                return "";
        }
    }
}
