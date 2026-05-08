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
}
