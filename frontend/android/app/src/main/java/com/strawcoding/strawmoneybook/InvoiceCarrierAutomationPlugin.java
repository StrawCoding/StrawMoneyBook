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

@CapacitorPlugin(name = "InvoiceCarrierAutomation")
public class InvoiceCarrierAutomationPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = getActivity() != null && !getActivity().isFinishing() && !getActivity().isDestroyed();
        result.put("available", available);
        result.put("platform", "android");
        result.put("busy", InvoiceCarrierAutomationActivity.isBusy());
        call.resolve(result);
    }

    @PluginMethod
    public void createLinkSession(PluginCall call) {
        launch(call, InvoiceCarrierAutomationActivity.ACTION_CREATE_LINK_SESSION);
    }

    @PluginMethod
    public void getSessionStatus(PluginCall call) {
        launch(call, InvoiceCarrierAutomationActivity.ACTION_GET_SESSION_STATUS);
    }

    @PluginMethod
    public void exchangeAuth(PluginCall call) {
        launch(call, InvoiceCarrierAutomationActivity.ACTION_EXCHANGE_AUTH);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        launch(call, InvoiceCarrierAutomationActivity.ACTION_SYNC);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        launch(call, InvoiceCarrierAutomationActivity.ACTION_DISCONNECT);
    }

    private void launch(PluginCall call, String action) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity is unavailable", "invoice_carrier_native_unavailable");
            return;
        }
        if (InvoiceCarrierAutomationActivity.isBusy()) {
            call.reject("Invoice carrier automation is already running", "invoice_carrier_native_busy");
            return;
        }

        Intent intent = new Intent(activity, InvoiceCarrierAutomationActivity.class);
        intent.putExtra(InvoiceCarrierAutomationActivity.EXTRA_ACTION, action);
        intent.putExtra(InvoiceCarrierAutomationActivity.EXTRA_PAYLOAD_JSON, call.getData().toString());
        startActivityForResult(call, intent, "handleInvoiceCarrierAutomationResult");
    }

    @ActivityCallback
    private void handleInvoiceCarrierAutomationResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult == null) {
            call.reject("Invoice carrier automation result is missing", "invoice_carrier_result_missing");
            return;
        }

        Intent data = activityResult.getData();
        String payloadText = data == null ? "" : String.valueOf(data.getStringExtra(InvoiceCarrierAutomationActivity.EXTRA_RESULT_JSON));
        String errorCode = data == null ? "" : String.valueOf(data.getStringExtra(InvoiceCarrierAutomationActivity.EXTRA_ERROR_CODE));
        String errorMessage = data == null ? "" : String.valueOf(data.getStringExtra(InvoiceCarrierAutomationActivity.EXTRA_ERROR_MESSAGE));
        String debugTraceText = data == null ? "" : String.valueOf(data.getStringExtra(InvoiceCarrierAutomationActivity.EXTRA_DEBUG_TRACE_JSON));

        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            JSObject errorData = new JSObject();
            if (debugTraceText != null && !debugTraceText.trim().isEmpty()) {
                try {
                    errorData.put("debugTrace", JSObject.fromJSONObject(new JSONObject(debugTraceText)));
                } catch (JSONException ignored) {
                    // Keep reject payload best-effort only.
                }
            }
            call.reject(
                errorMessage == null || errorMessage.trim().isEmpty() ? "Invoice carrier automation failed" : errorMessage,
                errorCode == null || errorCode.trim().isEmpty() ? "invoice_carrier_native_failed" : errorCode,
                errorData.length() == 0 ? null : errorData
            );
            return;
        }

        JSObject result = new JSObject();
        if (payloadText != null && !payloadText.trim().isEmpty()) {
            try {
                result = JSObject.fromJSONObject(new JSONObject(payloadText));
            } catch (JSONException error) {
                call.reject(String.valueOf(error.getMessage()), "invoice_carrier_result_invalid");
                return;
            }
        }
        call.resolve(result);
    }
}
