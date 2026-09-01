package com.strawcoding.strawmoneybook.providers.huanan;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class HuaNanBankAutomationProbeTest {
    @Test
    public void maskAccountIdKeepsLastFourOnly() {
        assertEquals("****9012", HuaNanBankAutomation.maskAccountId("123456789012"));
        assertEquals("****", HuaNanBankAutomation.maskAccountId("12"));
        assertEquals("", HuaNanBankAutomation.maskAccountId(""));
    }

    @Test
    public void redactUrlPathKeepsTrxDispatcherContractQueryAndDropsSession() {
        String redacted = HuaNanBankAutomation.redactUrlPath(
            "https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher?trx=com.lb.wibc.trx.Acct&state=prompt&target=InsAnTr&jsessionid=SECRET"
        );
        assertTrue(redacted.contains("netbank.hncb.com.tw"));
        assertTrue(redacted.contains("TrxDispatcher"));
        assertTrue(redacted.contains("trx="));
        assertTrue(redacted.contains("state="));
        assertFalse(redacted.toLowerCase().contains("jsessionid"));
        assertFalse(redacted.contains("SECRET"));
    }

    @Test
    public void observeOnlyNeverReplaysGetUntilAllowlistFreeze() {
        assertFalse(HuaNanBankAutomation.shouldReplayTransactionInterceptRequest("GET"));
        assertFalse(HuaNanBankAutomation.shouldReplayTransactionInterceptRequest("POST"));
        assertEquals(
            HuaNanBankAutomation.INTERCEPT_SKIP_REASON_POST,
            HuaNanBankAutomation.interceptSkipReason("POST")
        );
        assertEquals(
            HuaNanBankAutomation.INTERCEPT_SKIP_REASON_OBSERVE_ONLY,
            HuaNanBankAutomation.interceptSkipReason("GET")
        );
        assertTrue(HuaNanBankAutomation.isHncbHost("https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher"));
        assertFalse(HuaNanBankAutomation.isHncbHost("https://example.com/not-hncb"));
        assertTrue(HuaNanBankAutomation.looksLikeJsonUrl("https://netbank.hncb.com.tw/foo.json"));
    }

    @Test
    public void probeShapesExposeH1AndH2RequiredKeys() throws Exception {
        JSONObject h1 = HuaNanBankAutomation.expectedH1ProbeShape();
        for (String key : HuaNanBankAutomation.H1_PROBE_REQUIRED_KEYS) {
            assertTrue("missing H1 key " + key, h1.has(key));
        }
        JSONObject h2 = HuaNanBankAutomation.expectedH2ProbeShape();
        for (String key : HuaNanBankAutomation.H2_PROBE_REQUIRED_KEYS) {
            assertTrue("missing H2 key " + key, h2.has(key));
        }
        assertTrue(h2.has("hasH2FormAnchors"));
    }

    @Test
    public void rocYearCodeMatchesHuaNanSelectValues() {
        assertEquals("0115", HuaNanBankAutomation.toRocYearCode(2026));
        assertEquals("0114", HuaNanBankAutomation.toRocYearCode(2025));
        assertEquals("0113", HuaNanBankAutomation.toRocYearCode(2024));
        assertEquals("0115", HuaNanBankAutomation.toRocYearCode(java.time.LocalDate.of(2026, 9, 1)));
    }

    @Test
    public void splitInquiryWindowsRespectsThreeMonthPortalLimit() {
        java.util.List<java.time.LocalDate[]> windows = HuaNanBankAutomation.splitInquiryWindows(
            java.time.LocalDate.of(2026, 1, 1),
            java.time.LocalDate.of(2026, 9, 1)
        );
        assertTrue(windows.size() >= 3);
        for (java.time.LocalDate[] window : windows) {
            assertFalse(window[0].isAfter(window[1]));
            assertFalse(window[0].plusMonths(HuaNanBankAutomation.MAX_INQUIRY_MONTHS).isBefore(window[1].plusDays(1)));
        }
        assertEquals(java.time.LocalDate.of(2026, 1, 1), windows.get(0)[0]);
        assertEquals(java.time.LocalDate.of(2026, 9, 1), windows.get(windows.size() - 1)[1]);
    }
}
