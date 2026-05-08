package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
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

    @Test
    public void fillCredentialsOnlyScriptFillsPhoneAndPasswordWithoutSubmitting() {
        // SMB-174 redesign: this script auto-fills credentials in stage 2 and is reused for
        // the manual-captcha fallback. It MUST NOT click submit and MUST NOT touch the
        // captcha input — those are reserved for the user (or the OCR auto-submit script).
        String script = EInvoiceAutomation.buildFillCredentialsOnlyScript("0912345678", "secret");

        assertTrue(script.contains("setVal"));
        assertTrue(script.contains("'0912345678'"));
        assertTrue(script.contains("'secret'"));
        assertTrue(script.contains("filled: true"));
        assertTrue(script.contains("phone_missing"));
        assertTrue(script.contains("password_missing"));
        // Must NOT submit
        assertFalse(script.contains(".click()"));
        assertFalse(script.contains("form.submit()"));
        // Must NOT fill captcha
        assertFalse(script.contains("captcha_missing"));
    }

    @Test
    public void clearCaptchaInputScriptOnlyResetsCaptchaFieldValue() {
        // Manual-captcha fallback: user types fresh captcha — clear any OCR-inserted value.
        String script = EInvoiceAutomation.buildClearCaptchaInputScript();

        assertTrue(script.contains("#captcha"));
        assertTrue(script.contains("#verifyCode"));
        assertTrue(script.contains("nativeInputSetter"));
        // Must NOT click submit or modify other fields
        assertFalse(script.contains(".click("));
        assertFalse(script.contains("password"));
    }

    @Test
    public void focusCaptchaInputScriptScrollsAndFocusesCaptchaField() {
        // Manual-captcha fallback: bring the captcha into view and focus it so the user
        // sees the input cursor right after the status bar prompts them.
        String script = EInvoiceAutomation.buildFocusCaptchaInputScript();

        assertTrue(script.contains("#captcha"));
        assertTrue(script.contains("scrollIntoView"));
        assertTrue(script.contains(".focus("));
        assertTrue(script.contains(".select("));
    }

    @Test
    public void isFillCredentialsResultSuccessAcceptsBooleanTrueAndRejectsNonJsonObjectValues() {
        // We test the non-JSONObject branches here because android.jar's JSONObject is a
        // stub in plain JVM unit tests (throws "not mocked"). The JSONObject branch is
        // covered end-to-end by simulate-einvoice-login-flow.mjs which executes the real
        // script in a vm context with a JSON parser that produces real objects.
        assertTrue(EInvoiceAutomation.isFillCredentialsResultSuccess(Boolean.TRUE));
        assertFalse(EInvoiceAutomation.isFillCredentialsResultSuccess(Boolean.FALSE));
        assertFalse(EInvoiceAutomation.isFillCredentialsResultSuccess(null));
        assertFalse(EInvoiceAutomation.isFillCredentialsResultSuccess("filled"));
        assertFalse(EInvoiceAutomation.isFillCredentialsResultSuccess(42));
    }

    @Test
    public void hybridFlowTimingConstantsAreReasonableForUserManualCaptcha() {
        // Auto path must give the WebView enough time to navigate (12s) but not so much
        // that users wait forever before the manual fallback kicks in. Manual path needs
        // to be long enough for the user to read the captcha and type it (90s).
        assertTrue(EInvoiceAutomation.AUTO_LOGIN_WAIT_MS >= 8_000L);
        assertTrue(EInvoiceAutomation.AUTO_LOGIN_WAIT_MS <= 20_000L);
        assertTrue(EInvoiceAutomation.MANUAL_LOGIN_WAIT_MS >= 60_000L);
        assertTrue(EInvoiceAutomation.OCR_MAX_ATTEMPTS >= 1);
        assertTrue(EInvoiceAutomation.OCR_MAX_ATTEMPTS <= 3);
        assertEquals(4, EInvoiceAutomation.CAPTCHA_EXPECTED_LENGTH);
    }

    @Test
    public void loginPageDetectScriptUsesUrlCheckAsPrimaryIndicator() {
        // The URL-first approach avoids false positives from generic selectors like
        // input[type="tel"] or input[type="password"] that also appear on the query page
        // after a successful login, which would cause waitForLoginSuccess to always time out.
        String script = EInvoiceAutomation.buildLoginPageDetectScript();

        assertTrue(script.contains("/accounts/login"));
        assertTrue(script.contains("location.href"));
        // Must NOT use overly generic type-based selectors
        assertFalse(script.contains("input[type=\"tel\"]"));
        assertFalse(script.contains("input[type=\"password\"]"));
        assertFalse(script.contains("input[inputmode=\"tel\"]"));
    }

    @Test
    public void pageErrorDetailScriptScansAlertAndDangerSelectors() {
        // SMB-174: after a failed submit we must surface the platform's actual error text
        // (e.g. 驗證碼錯誤 / 帳號或密碼錯誤) so users do not just see the generic login_failed.
        String script = EInvoiceAutomation.buildPageErrorDetailScript();

        assertTrue(script.contains(".error-message"));
        assertTrue(script.contains(".alert-danger"));
        assertTrue(script.contains("[role=\"alert\"]"));
        assertTrue(script.contains("getBoundingClientRect"));
        assertTrue(script.contains("text:"));
    }

    @Test
    public void classifyLoginFailureReportsCaptchaImageMissingWhenAllAttemptsFailedToLoad() {
        // If captcha image never appears (3/3 attempts), the credentials were never filled.
        // Surface a specific code so users know it's a platform/captcha issue, not their password.
        EInvoiceAutomation.EInvoiceException error =
            EInvoiceAutomation.classifyLoginFailure(3, 0, 0, "");
        assertEquals("einvoice_captcha_image_missing", error.getCode());
        assertTrue(error.getMessage().contains("驗證碼圖片"));
    }

    @Test
    public void classifyLoginFailureReportsOcrFailureWhenAllAttemptsFailedToRecognize() {
        // SMB-174 root cause: when OCR returns wrong-length text 3 times in a row, the form
        // is never submitted (the loop "continues" without filling), so user sees nothing
        // happening — "我沒有看到他有輸入". Now surfaced as a distinct error code.
        EInvoiceAutomation.EInvoiceException error =
            EInvoiceAutomation.classifyLoginFailure(0, 3, 0, "");
        assertEquals("einvoice_captcha_recognition_failed", error.getCode());
        assertTrue(error.getMessage().contains("驗證碼自動辨識失敗"));
    }

    @Test
    public void classifyLoginFailureReportsLoginFailedWhenServerRejectedSubmit() {
        // When credentials WERE submitted but the server rejected, surface as login_failed
        // and include the on-page error text the einvoice site rendered.
        EInvoiceAutomation.EInvoiceException error =
            EInvoiceAutomation.classifyLoginFailure(0, 0, 1, "驗證碼錯誤");
        assertEquals("einvoice_login_failed", error.getCode());
        assertTrue(error.getMessage().contains("驗證碼錯誤"));
        assertTrue(error.getMessage().contains("網站回應"));
    }

    @Test
    public void classifyLoginFailureWithoutPageErrorOmitsTrailingDetail() {
        EInvoiceAutomation.EInvoiceException error =
            EInvoiceAutomation.classifyLoginFailure(0, 0, 1, "");
        assertEquals("einvoice_login_failed", error.getCode());
        assertFalse(error.getMessage().contains("網站回應"));
    }
}
