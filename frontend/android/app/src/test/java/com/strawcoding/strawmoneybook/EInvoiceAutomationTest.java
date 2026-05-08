package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class EInvoiceAutomationTest {
    @Test
    public void platformUrlsUseCurrentOfficialPortalRoutes() {
        assertTrue(EInvoiceAutomation.LOGIN_URL.endsWith("/accounts/login"));
        assertTrue(EInvoiceAutomation.QUERY_URL.endsWith("/portal/btc/mobile/btc502w/search"));
    }

    @Test
    public void platformChallengeSnapshotDetectsCloudflareChallengeText() {
        assertTrue(EInvoiceAutomation.isPlatformChallengeSnapshotText(
            "Just a moment...",
            "Checking if the site connection is secure. Cloudflare",
            EInvoiceAutomation.LOGIN_URL
        ));
    }

    @Test
    public void platformChallengeSnapshotDetectsChallengeUrl() {
        assertTrue(EInvoiceAutomation.isPlatformChallengeSnapshotText(
            "",
            "",
            "https://www.einvoice.nat.gov.tw/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"
        ));
    }

    @Test
    public void platformChallengeSnapshotIgnoresNormalLoginPage() {
        assertFalse(EInvoiceAutomation.isPlatformChallengeSnapshotText(
            "財政部電子發票整合服務平台",
            "手機條碼登入 驗證碼 密碼",
            EInvoiceAutomation.LOGIN_URL
        ));
    }

    @Test
    public void mobileCarrierSelectionScriptScansTextLabelsInputsAndSelectOptions() {
        String script = EInvoiceAutomation.buildSelectMobileCarrierScript();

        assertTrue(script.contains("手機條碼"));
        assertTrue(script.contains("手機載具"));
        assertTrue(script.contains("mobilebarcode"));
        assertTrue(script.contains("select"));
        assertTrue(script.contains("label"));
        assertTrue(script.contains("input[type=\"radio\"]"));
        assertTrue(script.contains("aria-label"));
        assertTrue(script.contains("dataset"));
        assertFalse(script.contains(":contains("));
    }

    @Test
    public void submitLoginScriptUsesVisibleRootsAndFullInputEvents() {
        String script = EInvoiceAutomation.buildSubmitLoginScript("0912345678", "secret", "1234");

        assertTrue(script.contains("ensureMobileCarrier"));
        assertTrue(script.contains("querySelectorAll"));
        assertTrue(script.contains("[role=\"tabpanel\"]"));
        assertTrue(script.contains("getBoundingClientRect"));
        assertTrue(script.contains("keyup"));
        assertTrue(script.contains("phone_missing"));
        assertTrue(script.contains("password_missing"));
        assertTrue(script.contains("captcha_missing"));
        assertTrue(script.contains("input[placeholder*=\"條碼\"]"));
    }
}
