package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.core.BankProvider;
import com.strawcoding.strawmoneybook.core.BankProviderRegistry;

import org.json.JSONObject;

/** Android-side orchestrator: provider registry dispatch + abort fan-out. */
public final class BankSyncOrchestrator {
    private BankSyncOrchestrator() {}

    public static JSONObject connect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).connect(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject sync(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).sync(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject disconnect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).disconnect(activity, webView, vault, debugTrace, payload);
    }

    public static JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return resolveProvider(payload).submitCaptcha(activity, webView, vault, debugTrace, payload);
    }

    public static void requestAbortAll() {
        for (String providerId : new String[] { BankProviderRegistry.HUA_NAN_BANK_TW }) {
            try {
                BankProviderRegistry.resolve(providerId).requestAbort();
            } catch (Exception ignored) {
            }
        }
    }

    private static BankProvider resolveProvider(JSONObject payload) throws Exception {
        String providerId = payload == null ? "" : payload.optString("providerId", payload.optString("provider", ""));
        return BankProviderRegistry.resolve(providerId);
    }
}
