package com.strawcoding.strawmoneybook.providers.natgov;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.CarrierAutomationDebugTrace;
import com.strawcoding.strawmoneybook.CarrierAutomationVault;
import com.strawcoding.strawmoneybook.core.CarrierProvider;
import com.strawcoding.strawmoneybook.core.CarrierProviderRegistry;

import org.json.JSONObject;

/** nat_gov_einvoice_tw provider adapter. */
public final class NatGovEInvoiceProvider implements CarrierProvider {
    @Override
    public String getProviderId() {
        return CarrierProviderRegistry.NAT_GOV_EINVOICE_TW;
    }

    @Override
    public JSONObject connect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return NatGovEInvoiceAutomation.connect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject sync(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return NatGovEInvoiceAutomation.sync(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject disconnect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return NatGovEInvoiceAutomation.disconnect(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        return NatGovEInvoiceAutomation.submitCaptcha(activity, webView, vault, debugTrace, payload);
    }

    @Override
    public void requestAbort() {
        NatGovEInvoiceAutomation.requestAbort();
    }

    @Override
    public void clearPendingSession(String sessionId) {
        NatGovEInvoiceAutomation.clearPendingSession(sessionId);
    }
}
