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

@CapacitorPlugin(name = "CarrierAutomation")
public class CarrierAutomationPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = getActivity() != null && !getActivity().isFinishing() && !getActivity().isDestroyed();
        result.put("available", available);
        result.put("platform", "android");
        result.put("busy", CarrierAutomationActivity.isBusy());
        result.put("runtimeVersion", "carrier-webview-v1");
        call.resolve(result);
    }

    @PluginMethod
    public void connectCarrier(PluginCall call) {
        launch(call, CarrierAutomationActivity.ACTION_CONNECT_CARRIER);
    }

    @PluginMethod
    public void syncCarrier(PluginCall call) {
        launch(call, CarrierAutomationActivity.ACTION_SYNC_CARRIER);
    }

    @PluginMethod
    public void disconnectCarrier(PluginCall call) {
        launch(call, CarrierAutomationActivity.ACTION_DISCONNECT_CARRIER);
    }

    @PluginMethod
    public void submitCaptcha(PluginCall call) {
        launch(call, CarrierAutomationActivity.ACTION_SUBMIT_CAPTCHA);
    }

    @PluginMethod
    public void abortCarrier(PluginCall call) {
        if (CarrierAutomationActivity.isBusy()) {
            CarrierAutomationActivity.abortRunningSession();
        }
        String sessionId = call.getString("sessionId", "");
        CarrierSyncOrchestrator.clearPendingSession(sessionId);
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    private void launch(PluginCall call, String action) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity is unavailable", "carrier_automation_unavailable");
            return;
        }
        if (CarrierAutomationActivity.isBusy()) {
            call.reject("Carrier automation is already running", "carrier_automation_busy");
            return;
        }

        Intent intent = new Intent(activity, CarrierAutomationActivity.class);
        intent.putExtra(CarrierAutomationActivity.EXTRA_ACTION, action);
        intent.putExtra(CarrierAutomationActivity.EXTRA_PAYLOAD_JSON, call.getData().toString());
        startActivityForResult(call, intent, "handleCarrierAutomationResult");
    }

    @ActivityCallback
    private void handleCarrierAutomationResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult == null) {
            call.reject("Carrier automation result is missing", "carrier_automation_result_missing");
            return;
        }

        Intent data = activityResult.getData();
        String payloadText = data == null ? "" : String.valueOf(data.getStringExtra(CarrierAutomationActivity.EXTRA_RESULT_JSON));
        String errorCode = data == null ? "" : String.valueOf(data.getStringExtra(CarrierAutomationActivity.EXTRA_ERROR_CODE));
        String errorMessage = data == null ? "" : String.valueOf(data.getStringExtra(CarrierAutomationActivity.EXTRA_ERROR_MESSAGE));
        String errorDataText = data == null ? "" : String.valueOf(data.getStringExtra(CarrierAutomationActivity.EXTRA_ERROR_DATA_JSON));
        String debugTraceText = data == null ? "" : String.valueOf(data.getStringExtra(CarrierAutomationActivity.EXTRA_DEBUG_TRACE_JSON));

        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            JSObject errorData = new JSObject();
            if (errorDataText != null && !errorDataText.trim().isEmpty()) {
                try {
                    errorData.put("errorData", JSObject.fromJSONObject(new JSONObject(errorDataText)));
                } catch (JSONException ignored) {
                }
            }
            if (debugTraceText != null && !debugTraceText.trim().isEmpty()) {
                try {
                    errorData.put("debugTrace", JSObject.fromJSONObject(new JSONObject(debugTraceText)));
                } catch (JSONException ignored) {
                }
            }
            call.reject(
                errorMessage == null || errorMessage.trim().isEmpty() ? "Carrier automation failed" : errorMessage,
                errorCode == null || errorCode.trim().isEmpty() ? "carrier_automation_failed" : errorCode,
                errorData.length() == 0 ? null : errorData
            );
            return;
        }

        JSObject result = new JSObject();
        if (payloadText != null && !payloadText.trim().isEmpty()) {
            try {
                result = JSObject.fromJSONObject(new JSONObject(payloadText));
            } catch (JSONException error) {
                call.reject(String.valueOf(error.getMessage()), "carrier_automation_result_invalid");
                return;
            }
        }
        call.resolve(result);
    }
}
