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

@CapacitorPlugin(name = "EInvoiceAutomation")
public class EInvoiceAutomationPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = getActivity() != null && !getActivity().isFinishing() && !getActivity().isDestroyed();
        result.put("available", available);
        result.put("platform", "android");
        result.put("busy", EInvoiceAutomationActivity.isBusy());
        call.resolve(result);
    }

    @PluginMethod
    public void queryInvoices(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity is unavailable", "einvoice_automation_unavailable");
            return;
        }
        if (EInvoiceAutomationActivity.isBusy()) {
            call.reject("E-invoice automation is already running", "einvoice_automation_busy");
            return;
        }

        Intent intent = new Intent(activity, EInvoiceAutomationActivity.class);
        intent.putExtra(EInvoiceAutomationActivity.EXTRA_PAYLOAD_JSON, call.getData().toString());
        startActivityForResult(call, intent, "handleResult");
    }

    private static String safeExtra(Intent data, String key) {
        if (data == null) return "";
        String value = data.getStringExtra(key);
        return value == null ? "" : value.trim();
    }

    @ActivityCallback
    private void handleResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult == null) {
            call.reject("E-invoice automation result is missing", "einvoice_automation_result_missing");
            return;
        }

        Intent data = activityResult.getData();
        String payloadText = safeExtra(data, EInvoiceAutomationActivity.EXTRA_RESULT_JSON);
        String errorCode = safeExtra(data, EInvoiceAutomationActivity.EXTRA_ERROR_CODE);
        String errorMessage = safeExtra(data, EInvoiceAutomationActivity.EXTRA_ERROR_MESSAGE);

        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            if (data == null && errorCode.isEmpty() && errorMessage.isEmpty()) {
                call.reject("電子發票自動抓取已取消", "einvoice_automation_canceled");
                return;
            }
            call.reject(
                errorMessage.isEmpty() ? "E-invoice automation failed" : errorMessage,
                errorCode.isEmpty() ? "einvoice_automation_failed" : errorCode
            );
            return;
        }

        JSObject result = new JSObject();
        if (!payloadText.isEmpty()) {
            try {
                result = JSObject.fromJSONObject(new JSONObject(payloadText));
            } catch (JSONException error) {
                String msg = error.getMessage();
                call.reject(msg == null || msg.trim().isEmpty() ? "Invalid result payload" : msg, "einvoice_automation_result_invalid");
                return;
            }
        }
        call.resolve(result);
    }
}
