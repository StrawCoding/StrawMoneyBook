package com.strawcoding.strawmoneybook.providers.firstbank;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.BankAutomationDebugTrace;
import com.strawcoding.strawmoneybook.BankAutomationVault;
import com.strawcoding.strawmoneybook.core.BankProvider;
import com.strawcoding.strawmoneybook.core.BankProviderRegistry;

import org.json.JSONObject;

/** first_bank_tw provider adapter. */
public final class FirstBankProvider implements BankProvider {
    @Override
    public String getProviderId() {
        return BankProviderRegistry.FIRST_BANK_TW;
    }

    @Override
    public JSONObject connect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return FirstBankAutomation.connect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject sync(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return FirstBankAutomation.sync(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject disconnect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return FirstBankAutomation.disconnect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return FirstBankAutomation.submitCaptcha(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public void requestAbort() {
        FirstBankAutomation.requestAbort();
    }
}
