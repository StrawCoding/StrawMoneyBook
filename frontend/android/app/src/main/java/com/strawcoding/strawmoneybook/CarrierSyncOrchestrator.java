package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.core.CarrierProvider;
import com.strawcoding.strawmoneybook.core.CarrierProviderRegistry;

import org.json.JSONObject;

/** Android-side orchestrator: provider registry dispatch + abort fan-out. */
public final class CarrierSyncOrchestrator {
    private CarrierSyncOrchestrator() {}

    public static JSONObject connect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).connect(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject sync(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).sync(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject disconnect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).disconnect(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).submitCaptcha(activity, webView, vault, debugTrace, payload);
    }

    public static void requestAbortAll() {
        for (String providerId : new String[] { CarrierProviderRegistry.NAT_GOV_EINVOICE_TW }) {
            try {
                CarrierProviderRegistry.resolve(providerId).requestAbort();
            } catch (Exception ignored) {
            }
        }
    }

    public static void clearPendingSession(String sessionId) {
        for (String providerId : new String[] { CarrierProviderRegistry.NAT_GOV_EINVOICE_TW }) {
            try {
                CarrierProviderRegistry.resolve(providerId).clearPendingSession(sessionId);
            } catch (Exception ignored) {
            }
        }
    }

    private static CarrierProvider resolveProvider(JSONObject payload) throws Exception {
        String providerId = payload == null
            ? ""
            : payload.optString("providerId", payload.optString("provider", ""));
        return CarrierProviderRegistry.resolve(providerId);
    }
}
