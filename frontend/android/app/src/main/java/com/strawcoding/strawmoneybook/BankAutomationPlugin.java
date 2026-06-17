package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "BankAutomation")
public class BankAutomationPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = getActivity() != null && !getActivity().isFinishing() && !getActivity().isDestroyed();
        result.put("available", available);
        result.put("platform", "android");
        result.put("busy", BankAutomationActivity.isBusy());
        call.resolve(result);
    }

    @PluginMethod
    public void connectFirstBank(PluginCall call) {
        launch(call, BankAutomationActivity.ACTION_CONNECT_FIRST_BANK);
    }

    @PluginMethod
    public void syncFirstBank(PluginCall call) {
        launch(call, BankAutomationActivity.ACTION_SYNC_FIRST_BANK);
    }

    @PluginMethod
    public void disconnectConnection(PluginCall call) {
        launch(call, BankAutomationActivity.ACTION_DISCONNECT_CONNECTION);
    }

    private void launch(PluginCall call, String action) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity is unavailable", "bank_automation_unavailable");
            return;
        }
        if (BankAutomationActivity.isBusy()) {
            call.reject("Bank automation is already running", "bank_automation_busy");
            return;
        }

        Intent intent = new Intent(activity, BankAutomationActivity.class);
        intent.putExtra(BankAutomationActivity.EXTRA_ACTION, action);
        intent.putExtra(BankAutomationActivity.EXTRA_PAYLOAD_JSON, call.getData().toString());
        startActivityForResult(call, intent, "handleBankAutomationResult");
    }

    @ActivityCallback
    private void handleBankAutomationResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult == null) {
            call.reject("Bank automation result is missing", "bank_automation_result_missing");
            return;
        }

        Intent data = activityResult.getData();
        String payloadText = data == null ? "" : String.valueOf(data.getStringExtra(BankAutomationActivity.EXTRA_RESULT_JSON));
        String errorCode = data == null ? "" : String.valueOf(data.getStringExtra(BankAutomationActivity.EXTRA_ERROR_CODE));
        String errorMessage = data == null ? "" : String.valueOf(data.getStringExtra(BankAutomationActivity.EXTRA_ERROR_MESSAGE));
        String errorDataText = data == null ? "" : String.valueOf(data.getStringExtra(BankAutomationActivity.EXTRA_ERROR_DATA_JSON));
        String debugTraceText = data == null ? "" : String.valueOf(data.getStringExtra(BankAutomationActivity.EXTRA_DEBUG_TRACE_JSON));

        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            JSObject errorData = new JSObject();
            if (errorDataText != null && !errorDataText.trim().isEmpty()) {
                try {
                    errorData.put("errorData", JSObject.fromJSONObject(new JSONObject(errorDataText)));
                } catch (JSONException ignored) {
                    // Keep reject payload best-effort only.
                }
            }
            if (debugTraceText != null && !debugTraceText.trim().isEmpty()) {
                try {
                    errorData.put("debugTrace", JSObject.fromJSONObject(new JSONObject(debugTraceText)));
                } catch (JSONException ignored) {
                    // Keep reject payload best-effort only.
                }
            }
            call.reject(
                errorMessage == null || errorMessage.trim().isEmpty() ? "Bank automation failed" : errorMessage,
                errorCode == null || errorCode.trim().isEmpty() ? "bank_automation_failed" : errorCode,
                errorData.length() == 0 ? null : errorData
            );
            return;
        }

        JSObject result = new JSObject();
        if (payloadText != null && !payloadText.trim().isEmpty()) {
            try {
                result = JSObject.fromJSONObject(new JSONObject(payloadText));
            } catch (JSONException error) {
                call.reject(String.valueOf(error.getMessage()), "bank_automation_result_invalid");
                return;
            }
        }
        call.resolve(result);
    }
}
