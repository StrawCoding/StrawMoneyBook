package com.strawcoding.strawmoneybook.providers.natgov;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class NatGovEInvoiceAutomationTest {
    @Test
    public void interceptObserveOnlyNeverReplaysPost() {
        assertFalse(NatGovEInvoiceAutomation.shouldReplayInterceptRequest("GET"));
        assertFalse(NatGovEInvoiceAutomation.shouldReplayInterceptRequest("POST"));
        assertEquals(
            NatGovEInvoiceAutomation.INTERCEPT_SKIP_REASON_POST,
            NatGovEInvoiceAutomation.interceptSkipReason("POST")
        );
        assertEquals(
            NatGovEInvoiceAutomation.INTERCEPT_SKIP_REASON_OBSERVE_ONLY,
            NatGovEInvoiceAutomation.interceptSkipReason("GET")
        );
    }

    @Test
    public void isNatGovHostMatchesPortalDomain() {
        assertTrue(NatGovEInvoiceAutomation.isNatGovHost("https://www.einvoice.nat.gov.tw/accounts/login/mw"));
        assertFalse(NatGovEInvoiceAutomation.isNatGovHost("https://netbank.hncb.com.tw/"));
    }

    @Test
    public void fixtureSyncReturnsNormalizedInvoices() throws Exception {
        JSONArray fixture = new JSONArray();
        JSONObject row = new JSONObject();
        row.put("invNum", "AB12345678");
        row.put("invAmount", 120);
        row.put("invDate", "2026/06/01");
        row.put("sellerName", "Mock Store");
        fixture.put(row);

        JSONObject payload = new JSONObject();
        payload.put("fixtureMode", true);
        payload.put("cardNo", "0912345678");
        payload.put("fixtureInvoices", fixture);

        JSONObject result = NatGovEInvoiceAutomation.sync(null, null, null, null, payload);
        JSONArray invoices = result.getJSONArray("invoices");
        assertEquals(1, invoices.length());
        assertEquals("AB12345678", invoices.getJSONObject(0).getString("invoiceNumber"));
        assertEquals(120, invoices.getJSONObject(0).getInt("amount"));
    }

    @Test
    public void validateCaptchaCandidateRejectsInvalidFixtureCodes() {
        assertFalse(com.strawcoding.strawmoneybook.core.CaptchaSolver.validateCaptchaCandidate("12", false));
        assertFalse(com.strawcoding.strawmoneybook.core.CaptchaSolver.validateCaptchaCandidate("AB-1", false));
        assertTrue(com.strawcoding.strawmoneybook.core.CaptchaSolver.validateCaptchaCandidate("AB12", false));
    }
}
