package com.strawcoding.strawmoneybook.core;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.CarrierAutomationDebugTrace;
import com.strawcoding.strawmoneybook.CarrierAutomationVault;

import org.json.JSONObject;

/** nat_gov_einvoice_tw and future carrier portal providers. */
public interface CarrierProvider {
    String getProviderId();

    JSONObject connect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject sync(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject disconnect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    void requestAbort();

    void clearPendingSession(String sessionId);
}
