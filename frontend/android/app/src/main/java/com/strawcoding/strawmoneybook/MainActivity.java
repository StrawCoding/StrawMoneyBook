package com.strawcoding.strawmoneybook;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.android.R;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileOpenerPlugin.class);
        registerPlugin(GoogleIdentityPlugin.class);
        registerPlugin(HomeWidgetPlugin.class);
        registerPlugin(com.strawcoding.strawmoneybook.wear.WearCompanionPlugin.class);
        registerPlugin(SecurityLockPlugin.class);
        registerPlugin(SpeechInputPlugin.class);
        super.onCreate(savedInstanceState);
        enableWebViewTextSelection();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN || requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            return;
        }
        if (getBridge() == null) {
            return;
        }
        PluginHandle socialLoginHandle = getBridge().getPlugin("SocialLogin");
        if (socialLoginHandle == null || !(socialLoginHandle.getInstance() instanceof SocialLoginPlugin)) {
            return;
        }
        ((SocialLoginPlugin) socialLoginHandle.getInstance()).handleGoogleLoginIntent(requestCode, data);
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
