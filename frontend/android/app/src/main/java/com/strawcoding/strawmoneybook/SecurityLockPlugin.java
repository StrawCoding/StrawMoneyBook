package com.strawcoding.strawmoneybook;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "SecurityLock")
public class SecurityLockPlugin extends Plugin {
    private PluginCall pendingCall;
    private BiometricPrompt biometricPrompt;
    private Executor promptExecutor;

    @Override
    public void load() {
        promptExecutor = ContextCompat.getMainExecutor(getContext());
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(getAvailabilityStatus().toJsObject());
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = getActivity() instanceof FragmentActivity
            ? (FragmentActivity) getActivity()
            : null;
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity does not support biometric authentication", "auth_unavailable");
            return;
        }
        if (pendingCall != null) {
            call.reject("Authentication is already in progress", "auth_in_progress");
            return;
        }

        AvailabilityStatus availability = getAvailabilityStatus();
        if (!availability.available) {
            call.reject(availability.message, "auth_unavailable");
            return;
        }

        final String title = sanitize(call.getString("title"), "App Security Lock");
        final String subtitle = sanitize(call.getString("subtitle"), "");
        final String description = sanitize(call.getString("description"), sanitize(call.getString("reason"), ""));
        if (promptExecutor == null) {
            promptExecutor = ContextCompat.getMainExecutor(activity);
        }

        pendingCall = call;
        activity.runOnUiThread(() -> {
            PluginCall activeCall = pendingCall;
            if (activeCall == null) {
                return;
            }

            FragmentActivity activeActivity = getActivity() instanceof FragmentActivity
                ? (FragmentActivity) getActivity()
                : null;
            if (activeActivity == null || activeActivity.isFinishing() || activeActivity.isDestroyed()) {
                pendingCall = null;
                biometricPrompt = null;
                activeCall.reject("Current activity does not support biometric authentication", "auth_unavailable");
                return;
            }

            try {
                biometricPrompt = new BiometricPrompt(
                    activeActivity,
                    promptExecutor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            PluginCall callbackCall = pendingCall;
                            pendingCall = null;
                            biometricPrompt = null;
                            if (callbackCall == null) return;

                            String code = isCanceledError(errorCode) ? "auth_canceled" : "auth_error";
                            callbackCall.reject(String.valueOf(errString), code);
                        }

                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            PluginCall callbackCall = pendingCall;
                            pendingCall = null;
                            biometricPrompt = null;
                            if (callbackCall == null) return;

                            JSObject response = new JSObject();
                            response.put("authenticated", true);
                            callbackCall.resolve(response);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Keep the system prompt open and let the user retry.
                        }
                    }
                );

                BiometricPrompt.PromptInfo.Builder promptBuilder = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title);

                if (!subtitle.isEmpty()) {
                    promptBuilder.setSubtitle(subtitle);
                }
                if (!description.isEmpty()) {
                    promptBuilder.setDescription(description);
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    promptBuilder.setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    );
                } else {
                    promptBuilder.setDeviceCredentialAllowed(true);
                }

                biometricPrompt.authenticate(promptBuilder.build());
            } catch (Exception error) {
                pendingCall = null;
                biometricPrompt = null;
                activeCall.reject(String.valueOf(error.getMessage()), "auth_error");
            }
        });
    }

    private AvailabilityStatus getAvailabilityStatus() {
        Context context = getContext();
        if (context == null) {
            return new AvailabilityStatus(false, false, false, "context_missing", "Security lock is unavailable");
        }

        BiometricManager biometricManager = BiometricManager.from(context);
        int biometricState = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            : biometricManager.canAuthenticate();
        boolean biometricReady = biometricState == BiometricManager.BIOMETRIC_SUCCESS;

        KeyguardManager keyguardManager = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        boolean deviceCredentialReady = keyguardManager != null && keyguardManager.isDeviceSecure();

        boolean available = biometricReady || deviceCredentialReady;
        if (available) {
            return new AvailabilityStatus(true, biometricReady, deviceCredentialReady, "available", "System biometrics and device credentials are available");
        }

        return new AvailabilityStatus(
            false,
            biometricReady,
            deviceCredentialReady,
            availabilityCodeFor(biometricState, deviceCredentialReady),
            availabilityMessageFor(biometricState, deviceCredentialReady)
        );
    }

    private String availabilityCodeFor(int biometricState, boolean deviceCredentialReady) {
        if (deviceCredentialReady) {
            return "device_credential_only";
        }
        switch (biometricState) {
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "none_enrolled";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "no_hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "hardware_unavailable";
            default:
                return "not_available";
        }
    }

    private String availabilityMessageFor(int biometricState, boolean deviceCredentialReady) {
        if (deviceCredentialReady) {
            return "Device credentials are available";
        }
        switch (biometricState) {
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "No fingerprint or device credential is enrolled";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "This device does not have biometric hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Biometric hardware is currently unavailable";
            default:
                return "Security lock is unavailable";
        }
    }

    private boolean isCanceledError(int errorCode) {
        return errorCode == BiometricPrompt.ERROR_USER_CANCELED
            || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
            || errorCode == BiometricPrompt.ERROR_CANCELED;
    }

    private String sanitize(String value, String fallback) {
        String normalized = value == null ? "" : value.trim();
        if (!normalized.isEmpty()) {
            return normalized;
        }
        return fallback == null ? "" : fallback.trim();
    }

    private static class AvailabilityStatus {
        final boolean available;
        final boolean biometricReady;
        final boolean deviceCredentialReady;
        final String code;
        final String message;

        AvailabilityStatus(boolean available, boolean biometricReady, boolean deviceCredentialReady, String code, String message) {
            this.available = available;
            this.biometricReady = biometricReady;
            this.deviceCredentialReady = deviceCredentialReady;
            this.code = code;
            this.message = message;
        }

        JSObject toJsObject() {
            JSObject result = new JSObject();
            result.put("available", available);
            result.put("biometricReady", biometricReady);
            result.put("deviceCredentialReady", deviceCredentialReady);
            result.put("code", code);
            result.put("message", message);
            return result;
        }
    }
}
