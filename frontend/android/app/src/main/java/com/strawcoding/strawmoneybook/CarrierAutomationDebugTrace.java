package com.strawcoding.strawmoneybook;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class CarrierAutomationDebugTrace {
    private static final String TAG = "SMB-CarrierSync";
    private final JSONArray steps = new JSONArray();
    private final String action;

    CarrierAutomationDebugTrace(String action) {
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
        }
    }

    private String findLastStepName() {
        if (steps.length() <= 0) return "";
        JSONObject item = steps.optJSONObject(steps.length() - 1);
        if (item == null) return "";
        return item.optString("step", "").trim();
    }
}
