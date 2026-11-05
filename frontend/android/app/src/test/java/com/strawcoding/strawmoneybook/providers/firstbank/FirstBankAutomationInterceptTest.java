package com.strawcoding.strawmoneybook.providers.firstbank;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FirstBankAutomationInterceptTest {
    @Test
    public void buildsDirectTransactionQueryUrlWithDates() {
        String url = FirstBankAutomation.buildDirectTransactionQueryUrl(
            "123456789012",
            "2026/10/20",
            "2026/11/04"
        );
        assertTrue(url.contains("010103.html"));
        assertTrue(url.contains("acnt=123456789012"));
        assertTrue(url.contains("txnStart=2026%2F10%2F20"));
        assertTrue(url.contains("txnEnd=2026%2F11%2F04"));
    }

    @Test
    public void detectsTransactionResultHtml() {
        String sample = "<html><body><table class=\"CnbTable\"><tr><td>2026/10/21</td><td>轉帳</td><td>1,234</td></tr></table></body></html>";
        assertTrue(FirstBankAutomation.looksLikeTransactionResultHtml(sample));
        assertFalse(FirstBankAutomation.looksLikeFirstBankLoginHtml(sample));
    }

    @Test
    public void ignoresEnquirySummaryRowsWithoutAmounts() {
        String sample = "<table class=\"CnbTable\"><tr><td>Account Number</td><td>29168214193</td><td>Starting and Ending Dates</td><td>2026/10/20-2026/11/05</td></tr></table>";
        assertFalse(FirstBankAutomation.looksLikeTransactionResultHtml(sample));
    }

    @Test
    public void detectsLoginHtml() {
        String sample = "<form><input name=\"loginCustIdFake\"/><input name=\"vrfyCode\"/></form>";
        assertTrue(FirstBankAutomation.looksLikeFirstBankLoginHtml(sample));
        assertFalse(FirstBankAutomation.looksLikeTransactionResultHtml(sample));
    }

    @Test
    public void doesNotInterceptJqueryAssets() {
        assertFalse(FirstBankAutomation.isTransactionInterceptCandidate(
            "https://ibank.firstbank.com.tw/NetBank/jsfile/jquery.js"
        ));
    }

    @Test
    public void interceptsTransactionHtmlPages() {
        assertTrue(FirstBankAutomation.isTransactionInterceptCandidate(
            "https://ibank.firstbank.com.tw/NetBank/2/010103.html?acnt=123"
        ));
    }
}
