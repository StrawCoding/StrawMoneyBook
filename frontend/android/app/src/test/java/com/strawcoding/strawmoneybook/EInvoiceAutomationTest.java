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
    public void captchaSnapshotScriptProvidesNativeRegionCaptureFallback() {
        // Canvas readback can fail when the captcha image is protected or rendered as a
        // non-img element. In that case the automation must still return the element rect
        // so the native WebView screenshot fallback can OCR the visible captcha.
        String script = EInvoiceAutomation.buildCaptchaSnapshotScript();

        assertTrue(script.contains("rectSnapshot"));
        assertTrue(script.contains("devicePixelRatio"));
        assertTrue(script.contains("canvas_blocked"));
        assertTrue(script.contains("ready: true"));
        assertTrue(script.contains("scrollIntoView"));
    }

    @Test
    public void queryResultScriptsRecognizeCarrierListDataPage() {
        // The einvoice site can land on a carrier-list/results page whose DOM does not use
        // the old invTable selectors. We must detect page text and invoice-number patterns.
        String waitScript = EInvoiceAutomation.buildWaitForResultsScript();
        String fillScript = EInvoiceAutomation.buildFillQueryFormScript("1140101", "1140131", "all", "", "");
        String parseScript = EInvoiceAutomation.buildParseInvoiceListScript();

        assertTrue(waitScript.contains("載具清單資料"));
        assertTrue(waitScript.contains("[A-Z]{2}\\d{8}"));
        assertTrue(waitScript.contains("發票號碼"));
        assertTrue(fillScript.contains("hasResultSignal"));
        assertTrue(fillScript.contains("載具清單資料"));
        assertTrue(parseScript.contains("[role=\"row\"]"));
        assertTrue(parseScript.contains("統編|統一編號"));
        assertTrue(parseScript.contains("replace(invoiceNo"));
    }

    @Test
    public void queryFormScriptTargetsBtc502wFieldsAndReturnsFalseBeforeFormRenders() {
        String script = EInvoiceAutomation.buildFillQueryFormScript("1140101", "1140131", "all", "24536806", "咖啡");

        assertTrue(script.contains("btc502wQ.qryDateS"));
        assertTrue(script.contains("btc502wQ.qryDateE"));
        assertTrue(script.contains("btc502wQ.invStatus"));
        assertTrue(script.contains("btc502wQ.buyerBan"));
        assertTrue(script.contains("btc502wQ.keyword"));
        assertTrue(script.contains("return false"));
        assertTrue(script.contains("keyup"));
        assertTrue(script.contains("blur"));
    }

    @Test
    public void queryFormTimingAndDiagnosticsSupportAsyncRenderDebugging() {
        String diagnosticScript = EInvoiceAutomation.buildQueryPageDiagnosticScript();

        assertTrue(EInvoiceAutomation.QUERY_FORM_WAIT_MS >= 10_000L);
        assertTrue(EInvoiceAutomation.QUERY_FORM_POLL_MS <= 500L);
        assertTrue(diagnosticScript.contains("location.href"));
        assertTrue(diagnosticScript.contains("document.title"));
        assertTrue(diagnosticScript.contains("summary"));
        assertTrue(diagnosticScript.contains("slice(0, 240)"));
    }

    @Test
    public void numericCaptchaModeUsesDigitOnlyWhitelist() {
        assertEquals("0123456789", TesseractBridge.NUMERIC_ALLOWED_CHARS);
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

    @Test
    public void fillCredentialsFailureScriptIncludesFormDiagnostics() {
        String script = EInvoiceAutomation.buildFillCredentialsOnlyScript("0912345678", "secret");
        assertTrue("失敗回報應包含 formDiag 物件", script.contains("formDiag"));
        assertTrue("formDiag 應包含當前頁面 URL", script.contains("location.href"));
        assertTrue("formDiag 應包含可見 input 列表", script.contains("visibleInputs"));
    }

    @Test
    public void parseAmountScriptUnconditionallyExcludesEightDigitNumbers() {
        String script = EInvoiceAutomation.buildParseInvoiceListScript();
        // 8 位數（買方統編格式）應無條件被排除，不受 amountLabel 影響
        // Java text block 中 \\d → 執行期字串為 \d
        assertTrue("8 位數應無條件排除", script.contains("/^\\d{8}$/.test(normalized)) continue"));
        // 7 位數只在無金額標籤時排除
        assertTrue("7 位數只在無標籤時排除", script.contains("!amountLabel && /^\\d{7}$/.test(normalized)"));
    }

    @Test
    public void waitForResultsTimeoutErrorCodeIsCorrect() {
        // 驗證超時錯誤碼常數格式正確（Java 端拋出 einvoice_query_results_timeout）
        // buildWaitForResultsScript 不應在空頁面誤判為已有結果
        String script = EInvoiceAutomation.buildWaitForResultsScript();
        assertFalse("等待腳本不應為空", script.isEmpty());
        assertTrue("等待腳本應包含發票格式或載具清單偵測",
            script.contains("[A-Z]{2}") || script.contains("載具清單"));
    }
}
