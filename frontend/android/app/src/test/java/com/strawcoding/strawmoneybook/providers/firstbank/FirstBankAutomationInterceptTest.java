package com.strawcoding.strawmoneybook.providers.firstbank;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FirstBankAutomationInterceptTest {
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
