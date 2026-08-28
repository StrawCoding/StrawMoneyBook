package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.core.BankProvider;
import com.strawcoding.strawmoneybook.core.BankProviderRegistry;

import org.json.JSONObject;

/** hua_nan_bank_tw provider adapter. */
public final class HuaNanBankProvider implements BankProvider {
    @Override
    public String getProviderId() {
        return BankProviderRegistry.HUA_NAN_BANK_TW;
    }

    @Override
    public JSONObject connect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return HuaNanBankAutomation.connect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject sync(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return HuaNanBankAutomation.sync(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject disconnect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return HuaNanBankAutomation.disconnect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return HuaNanBankAutomation.submitCaptcha(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public void requestAbort() {
        HuaNanBankAutomation.requestAbort();
    }
}
