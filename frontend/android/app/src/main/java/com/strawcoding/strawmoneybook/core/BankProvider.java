package com.strawcoding.strawmoneybook.core;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.BankAutomationDebugTrace;
import com.strawcoding.strawmoneybook.BankAutomationVault;

import org.json.JSONObject;

/** hua_nan_bank_tw and future bank portal providers. */
public interface BankProvider {
    String getProviderId();

    JSONObject connect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject sync(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject disconnect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception;

    void requestAbort();
}
