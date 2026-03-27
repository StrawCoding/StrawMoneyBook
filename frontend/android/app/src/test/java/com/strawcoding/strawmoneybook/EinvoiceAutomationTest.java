package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

public class EinvoiceAutomationTest {
    @Test
    public void buildSessionRefNormalizesPhoneDigits() {
        assertEquals(
            EinvoiceAutomation.buildSessionRef("0912-345-678"),
            EinvoiceAutomation.buildSessionRef("0912345678")
        );
    }

    @Test
    public void buildSessionRefDoesNotReturnRawPhoneNumber() {
        assertNotEquals("0912345678", EinvoiceAutomation.buildSessionRef("0912345678"));
    }

    @Test
    public void formatDateRangeLabelMatchesEinvoiceDatePickerText() {
        assertEquals("2026年3月1日 ~ 2026年3月20日", EinvoiceAutomation.formatDateRangeLabel("2026-03-01", "2026-03-20"));
    }

    @Test
    public void querySearchUrlUsesDesktopPageInsteadOfMobilePath() {
        assertEquals("https://www.einvoice.nat.gov.tw/portal/btc/btc502w/search", EinvoiceAutomation.getSearchUrlForTest());
    }

    @Test
    public void passwordChangeRequiredMessageDetectionAcceptsExpiryPrompts() {
        assertTrue(EinvoiceAutomation.isPasswordChangeRequiredMessageForTest("驗證碼(密碼)逾期未變更，系統拒絕登入"));
        assertTrue(EinvoiceAutomation.isPasswordChangeRequiredMessageForTest("請先修改密碼後再登入"));
    }

    @Test
    public void passwordChangeRequiredMessageDetectionIgnoresGenericLoginErrors() {
        assertFalse(EinvoiceAutomation.isPasswordChangeRequiredMessageForTest("手機號碼、驗證碼(密碼)或圖形驗證碼輸入錯誤"));
    }

    @Test
    public void loginFailureCodeUsesCaptchaErrorWhenNoSubmissionHappened() {
        assertEquals("einvoice_captcha_ocr_failed", EinvoiceAutomation.resolveLoginFailureCodeForTest(false));
        assertEquals("einvoice_login_failed", EinvoiceAutomation.resolveLoginFailureCodeForTest(true));
    }

    @Test
    public void normalizeEinvoiceCaptchaStringKeepsAlphanumericCaptchaText() {
        assertEquals("OISB", EinvoiceAutomation.normalizeEinvoiceCaptchaStringForTest("OISB"));
        assertEquals("1234", EinvoiceAutomation.normalizeEinvoiceCaptchaStringForTest("12-34"));
        assertEquals("AB12", EinvoiceAutomation.normalizeEinvoiceCaptchaStringForTest("ab-12"));
    }

    @Test
    public void einvoiceCaptchaSelectionAcceptsAlphanumericCandidates() {
        String selected = FirstBankAutomation.selectBestCaptchaCandidateWeighted(List.of(
            new FirstBankAutomation.WeightedCaptchaCandidate("AB12", 80),
            new FirstBankAutomation.WeightedCaptchaCandidate("A812", 40),
            new FirstBankAutomation.WeightedCaptchaCandidate("4812", 20)
        ));

        assertEquals("AB12", selected);
    }
}
