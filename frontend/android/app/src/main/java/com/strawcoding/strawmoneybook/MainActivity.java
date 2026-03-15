package com.strawcoding.strawmoneybook;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.android.R;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileOpenerPlugin.class);
        registerPlugin(GoogleIdentityPlugin.class);
        registerPlugin(HomeWidgetPlugin.class);
        registerPlugin(SecurityLockPlugin.class);
        registerPlugin(SpeechInputPlugin.class);
        super.onCreate(savedInstanceState);
        enableWebViewTextSelection();
    }

    private void enableWebViewTextSelection() {
        WebView webView = findViewById(R.id.webview);
        if (webView == null) {
            return;
        }

        webView.setLongClickable(true);
        webView.setHapticFeedbackEnabled(true);
        webView.setOnLongClickListener(v -> false);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker interface implementation for SocialLogin Google scopes/offline checks.
    }
}
