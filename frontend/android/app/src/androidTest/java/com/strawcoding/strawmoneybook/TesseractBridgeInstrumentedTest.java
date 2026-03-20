package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.os.SystemClock;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONTokener;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class TesseractBridgeInstrumentedTest {
    private static final String CAPTCHA_DATA_URL_A =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WCr8AAAAASUVORK5CYII=";
    private static final String CAPTCHA_DATA_URL_B =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNk+M8AAAICAQDJcH7pAAAAAElFTkSuQmCC";

    @Test
    public void bundledTraineddataIsCopiedIntoPrivateStorage() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(new Intent(Intent.ACTION_MAIN).setClassName(
            "com.strawcoding.strawmoneybook",
            "com.strawcoding.strawmoneybook.MainActivity"
        ))) {
            AtomicReference<Throwable> errorRef = new AtomicReference<>(null);
            AtomicReference<File> dataDirRef = new AtomicReference<>(null);
            CountDownLatch finished = new CountDownLatch(1);

            scenario.onActivity(activity -> {
                try {
                    dataDirRef.set(TesseractBridge.ensureBundledTrainedData(activity));
                } catch (Throwable error) {
                    errorRef.set(error);
                } finally {
                    finished.countDown();
                }
            });

            assertTrue(finished.await(30, TimeUnit.SECONDS));
            if (errorRef.get() != null) {
                throw new AssertionError(errorRef.get());
            }

            File trainedData = new File(new File(dataDirRef.get(), "tessdata"), "eng.traineddata");
            assertTrue(trainedData.isFile());
            assertEquals(TesseractBridge.TRAINEDDATA_MD5, TesseractBridge.calculateMd5(trainedData));
        }
    }

    @Test
    public void captchaSnapshotScriptStaysNotReadyUntilImageLoads() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launchMainActivity()) {
            WebView webView = createWebView(scenario, """
                <html><body>
                <img id="code_verify" height="25" />
                <script>
                  setTimeout(() => {
                    document.getElementById('code_verify').src = '%s';
                  }, 1200);
                </script>
                </body></html>
                """.formatted(CAPTCHA_DATA_URL_A));

            FirstBankAutomation.CaptchaSnapshot before = FirstBankAutomation.parseCaptchaSnapshot(
                evaluateJavascriptSync(scenario, webView, FirstBankAutomation.buildCaptchaSnapshotScript())
            );
            assertFalse(before.ready);

            Thread.sleep(1600L);

            FirstBankAutomation.CaptchaSnapshot after = FirstBankAutomation.parseCaptchaSnapshot(
                evaluateJavascriptSync(scenario, webView, FirstBankAutomation.buildCaptchaSnapshotScript())
            );
            assertTrue(after.ready);
            assertTrue(FirstBankAutomation.isCaptchaDataUrlUsable(after.dataUrl));
        }
    }

    @Test
    public void captchaSnapshotScriptFindsImageInsideSameOriginIframe() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launchMainActivity()) {
            String iframeHtml = """
                <html><body>
                <img id="code_verify" height="25" src="%s" />
                </body></html>
                """.formatted(CAPTCHA_DATA_URL_A);
            WebView webView = createWebView(scenario, """
                <html><body>
                <iframe id="bank-frame" srcdoc="%s"></iframe>
                </body></html>
                """.formatted(escapeHtmlAttribute(iframeHtml)));

            Thread.sleep(800L);

            FirstBankAutomation.CaptchaSnapshot snapshot = FirstBankAutomation.parseCaptchaSnapshot(
                evaluateJavascriptSync(scenario, webView, FirstBankAutomation.buildCaptchaSnapshotScript())
            );

            assertTrue(snapshot.ready);
            assertTrue(snapshot.foundInFrame);
            assertTrue(snapshot.frameDepth > 0);
            assertTrue(FirstBankAutomation.isCaptchaDataUrlUsable(snapshot.dataUrl));
        }
    }

    @Test
    public void captchaSnapshotScriptReportsCanvasBlockedReason() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launchMainActivity()) {
            WebView webView = createWebView(scenario, """
                <html><body>
                <img id="code_verify" height="25" src="%s" />
                <script>
                  HTMLCanvasElement.prototype.toDataURL = function () {
                    throw new Error('blocked');
                  };
                </script>
                </body></html>
                """.formatted(CAPTCHA_DATA_URL_A));

            FirstBankAutomation.CaptchaSnapshot snapshot = FirstBankAutomation.parseCaptchaSnapshot(
                evaluateJavascriptSync(scenario, webView, FirstBankAutomation.buildCaptchaSnapshotScript())
            );

            assertFalse(snapshot.ready);
            assertTrue(snapshot.imageReady);
            assertEquals("canvas_blocked", snapshot.reason);
        }
    }

    @Test
    public void refreshCaptchaWaitsForANewReadyImage() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launchMainActivity()) {
            WebView webView = createWebView(scenario, """
                <html><body>
                <img id="code_verify" height="25" src="%s" />
                <script>
                  window.chgImg = function () {
                    setTimeout(() => {
                      document.getElementById('code_verify').src = '%s';
                    }, 1300);
                    return true;
                  };
                </script>
                </body></html>
                """.formatted(CAPTCHA_DATA_URL_A, CAPTCHA_DATA_URL_B));

            Object session = newBrowserSession(scenario, webView);
            Method refreshCaptcha = session.getClass().getDeclaredMethod("refreshCaptcha");
            refreshCaptcha.setAccessible(true);
            Method captureCaptchaDataUrl = session.getClass().getDeclaredMethod("captureCaptchaDataUrl");
            captureCaptchaDataUrl.setAccessible(true);

            long startedAt = SystemClock.elapsedRealtime();
            refreshCaptcha.invoke(session);
            long elapsedMs = SystemClock.elapsedRealtime() - startedAt;

            String captured = (String) captureCaptchaDataUrl.invoke(session);
            assertTrue("refreshCaptcha returned too early: " + elapsedMs, elapsedMs >= 1200L);
            assertTrue(FirstBankAutomation.isCaptchaDataUrlUsable(captured));
            assertTrue(captured.length() > 80);
        }
    }

    @Test
    public void refreshCaptchaWorksWhenCaptchaLivesInsideIframe() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launchMainActivity()) {
            String iframeHtml = """
                <html><body>
                <img id="code_verify" height="25" src="%s" />
                <script>
                  window.chgImg = function () {
                    setTimeout(() => {
                      document.getElementById('code_verify').src = '%s';
                    }, 1300);
                    return true;
                  };
                </script>
                </body></html>
                """.formatted(CAPTCHA_DATA_URL_A, CAPTCHA_DATA_URL_B);
            WebView webView = createWebView(scenario, """
                <html><body>
                <iframe id="bank-frame" srcdoc="%s"></iframe>
                </body></html>
                """.formatted(escapeHtmlAttribute(iframeHtml)));

            Thread.sleep(800L);

            Object session = newBrowserSession(scenario, webView);
            Method refreshCaptcha = session.getClass().getDeclaredMethod("refreshCaptcha");
            refreshCaptcha.setAccessible(true);
            Method captureCaptchaDataUrl = session.getClass().getDeclaredMethod("captureCaptchaDataUrl");
            captureCaptchaDataUrl.setAccessible(true);

            long startedAt = SystemClock.elapsedRealtime();
            Object refreshed = refreshCaptcha.invoke(session);
            long elapsedMs = SystemClock.elapsedRealtime() - startedAt;

            String captured = (String) captureCaptchaDataUrl.invoke(session);
            assertTrue("refreshCaptcha returned too early: " + elapsedMs, elapsedMs >= 1200L);
            assertTrue(refreshed instanceof FirstBankAutomation.CaptchaSnapshot);
            assertTrue(FirstBankAutomation.isCaptchaDataUrlUsable(captured));
        }
    }

    private ActivityScenario<MainActivity> launchMainActivity() {
        return ActivityScenario.launch(new Intent(Intent.ACTION_MAIN).setClassName(
            "com.strawcoding.strawmoneybook",
            "com.strawcoding.strawmoneybook.MainActivity"
        ));
    }

    private WebView createWebView(ActivityScenario<MainActivity> scenario, String html) throws Exception {
        AtomicReference<WebView> webViewRef = new AtomicReference<>(null);
        AtomicReference<Throwable> errorRef = new AtomicReference<>(null);
        CountDownLatch pageLoaded = new CountDownLatch(1);

        scenario.onActivity(activity -> {
            try {
                WebView webView = new WebView(activity);
                webView.getSettings().setJavaScriptEnabled(true);
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        pageLoaded.countDown();
                    }
                });
                activity.setContentView(webView);
                webViewRef.set(webView);
                webView.loadDataWithBaseURL("https://ibank.firstbank.com.tw/NetBank/index103.html", html, "text/html", "utf-8", null);
            } catch (Throwable error) {
                errorRef.set(error);
                pageLoaded.countDown();
            }
        });

        assertTrue(pageLoaded.await(15, TimeUnit.SECONDS));
        if (errorRef.get() != null) {
            throw new AssertionError(errorRef.get());
        }
        return webViewRef.get();
    }

    private Object evaluateJavascriptSync(ActivityScenario<MainActivity> scenario, WebView webView, String script) throws Exception {
        AtomicReference<String> rawResult = new AtomicReference<>("null");
        CountDownLatch resultLatch = new CountDownLatch(1);
        scenario.onActivity(activity -> webView.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                rawResult.set(value);
                resultLatch.countDown();
            }
        }));
        assertTrue(resultLatch.await(15, TimeUnit.SECONDS));
        return new JSONTokener(rawResult.get()).nextValue();
    }

    private Object newBrowserSession(ActivityScenario<MainActivity> scenario, WebView webView) throws Exception {
        AtomicReference<Object> sessionRef = new AtomicReference<>(null);
        AtomicReference<Throwable> errorRef = new AtomicReference<>(null);
        CountDownLatch created = new CountDownLatch(1);

        scenario.onActivity(activity -> {
            try {
                Class<?> sessionClass = Class.forName("com.strawcoding.strawmoneybook.FirstBankAutomation$BrowserSession");
                Constructor<?> constructor = sessionClass.getDeclaredConstructor(android.app.Activity.class, WebView.class);
                constructor.setAccessible(true);
                sessionRef.set(constructor.newInstance(activity, webView));
            } catch (Throwable error) {
                errorRef.set(error);
            } finally {
                created.countDown();
            }
        });

        assertTrue(created.await(15, TimeUnit.SECONDS));
        if (errorRef.get() != null) {
            throw new AssertionError(errorRef.get());
        }
        return sessionRef.get();
    }

    private String escapeHtmlAttribute(String value) {
        return String.valueOf(value)
            .replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;");
    }
}
