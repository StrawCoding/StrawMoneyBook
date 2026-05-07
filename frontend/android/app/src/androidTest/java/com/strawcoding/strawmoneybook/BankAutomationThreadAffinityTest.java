package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class BankAutomationThreadAffinityTest {
    @Test
    public void browserSessionFlowIsWorkerThreadSafe() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(new Intent(Intent.ACTION_MAIN).setClassName(
            "com.strawcoding.strawmoneybook",
            "com.strawcoding.strawmoneybook.MainActivity"
        ))) {
            AtomicReference<Throwable> errorRef = new AtomicReference<>(null);
            CountDownLatch finished = new CountDownLatch(1);

            scenario.onActivity(activity -> {
                WebView webView = new WebView(activity);
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setLoadsImagesAutomatically(true);
                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(true);
                cookieManager.setAcceptThirdPartyCookies(webView, true);
                ExecutorService executor = Executors.newSingleThreadExecutor();

                executor.execute(() -> {
                    try {
                        FirstBankAutomation.runThreadAffinityRegressionHarness(activity, webView);

                        BankAutomationVault vault = new BankAutomationVault(activity.getApplicationContext());
                        JSONObject payload = new JSONObject();
                        payload.put("connectionId", "thread-affinity-test");
                        FirstBankAutomation.disconnect(activity, webView, vault, new BankAutomationDebugTrace("disconnect"), payload);
                    } catch (Throwable error) {
                        errorRef.set(error);
                    } finally {
                        executor.shutdownNow();
                        finished.countDown();
                    }
                });
            });

            assertTrue(finished.await(30, TimeUnit.SECONDS));
            assertNull(errorRef.get());
        }
    }
}
